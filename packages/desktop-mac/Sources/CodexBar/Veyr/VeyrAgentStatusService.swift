// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import AppKit
import CodexBarCore
import Foundation
import Observation

/// Maintains the agent-status feed: rebuilds the payload and rewrites
/// `~/.veyr/agent-status/` every 30 seconds while a session is active, every
/// 5 minutes when idle. Also owns the opt-in CLAUDE.md injection (at most every
/// 5 minutes) and session-scoped recommendation dismissals for the UI.
@MainActor
@Observable
public final class VeyrAgentStatusService {
    public static let shared = VeyrAgentStatusService()

    public static let autoUpdateClaudeMdDefaultsKey = "veyrAutoUpdateClaudeMd"

    @ObservationIgnored
    private let logger = CodexBarLog.logger(LogCategories.veyr)

    public private(set) var latestPayload: VeyrAgentStatusPayload?
    public private(set) var lastWroteAt: Date?
    public private(set) var dismissedRecommendationIDs: Set<String> = []
    public private(set) var latestSuggestions: [Suggestion] = []
    public private(set) var dismissedSuggestionIDs: Set<String> = VeyrDismissedSuggestions.load().ids

    private var loopTask: Task<Void, Never>?
    private var dismissalSessionKey: String?
    private var lastClaudeMdUpdateAt: Date?
    private var lastClaudeMdProjectPath: String?

    private static let activeInterval: Duration = .seconds(30)
    private static let idleInterval: Duration = .seconds(300)
    private static let claudeMdMinInterval: TimeInterval = 300

    private init() {}

    /// Source of truth is the shared ~/.veyr/config.json (the VS Code extension
    /// writes the same file); UserDefaults is a legacy fallback only.
    public var autoUpdateClaudeMdEnabled: Bool {
        get {
            VeyrConfig.load().autoUpdateClaudeMd
                ?? (UserDefaults.standard.object(forKey: Self.autoUpdateClaudeMdDefaultsKey) as? Bool)
                ?? true // default ON — this is how Claude Code sees the feed
        }
        set {
            var config = VeyrConfig.load()
            config.autoUpdateClaudeMd = newValue
            try? config.save()
            UserDefaults.standard.set(newValue, forKey: Self.autoUpdateClaudeMdDefaultsKey)
            if newValue {
                self.lastClaudeMdUpdateAt = nil // inject on next tick
            } else if let path = self.lastClaudeMdProjectPath {
                try? VeyrAgentStatusWriter.removeClaudeMdSection(projectPath: path)
                self.lastClaudeMdProjectPath = nil
            }
        }
    }

    public func start() {
        guard self.loopTask == nil else { return }
        self.loopTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.tick()
                let active = self?.latestPayload?.currentSession?.isActive ?? false
                try? await Task.sleep(for: active ? Self.activeInterval : Self.idleInterval)
            }
        }
    }

    public func stop() {
        self.loopTask?.cancel()
        self.loopTask = nil
    }

    public func tick() async {
        let store = VeyrSpend.shared
        await store.refresh()

        let controls = VeyrBudgetControls.load()
        let currentSession = store.sessions.max { $0.timestamp < $1.timestamp }
        let classifications = await VeyrComplexityService.shared.processNewTurns(
            isSessionActive: store.isSessionActive)
        VeyrComplexityService.shared.refreshFeedbackCandidate(
            isSessionActive: store.isSessionActive)
        let signalsStore = await Task.detached(priority: .utility) {
            VeyrSignalsScanner.scan()
        }.value
        let allSignals = Array(signalsStore.sessions.values)
        let config = VeyrConfig.load()
        let suggestions = VeyrSuggestionEngine.analyze(
            sessions: store.sessions,
            currentSession: currentSession,
            currentSessionIsActive: store.isSessionActive,
            classifications: classifications,
            signals: allSignals,
            toolFilteringEnabled: config.toolFilteringSuggestions ?? true)
        self.latestSuggestions = suggestions
        let currentSignals = currentSession?.sessionId.flatMap { sessionId in
            signalsStore.sessions[sessionId]
        }
        let tagSessionIds = Set(store.sessions
            .filter { $0.featureTag == currentSession?.featureTag }
            .compactMap(\.sessionId))
        let tagDistinctTools = Set(allSignals
            .filter { tagSessionIds.contains($0.sessionId) }
            .flatMap(\.toolNames)).count
        let payload = VeyrAgentStatusBuilder.build(
            sessions: store.sessions,
            latestActivityAt: store.latestActivityAt,
            controls: controls,
            engineSuggestions: suggestions,
            complexity: VeyrComplexityService.shared.complexityAnalysis(
                currentTag: currentSession?.featureTag),
            currentSignals: currentSignals,
            tagDistinctTools: tagDistinctTools)
        self.latestPayload = payload
        VeyrBudgetNotifier.checkAndNotify(sessions: store.sessions, controls: controls)
        self.resetDismissalsIfSessionChanged(payload: payload)

        do {
            try VeyrAgentStatusWriter.write(payload: payload)
            self.lastWroteAt = Date()
            self.logger.info(
                "[Veyr] Wrote VEYR_STATUS.json",
                metadata: [
                    "at": "\(Date())",
                    "recommendations": "\(payload.recommendations.count)",
                ])
        } catch {
            self.logger.error(
                "[Veyr] Failed writing VEYR_STATUS.json",
                metadata: ["error": String(describing: error)])
        }

        self.updateClaudeMdIfEnabled(payload: payload, sessions: store.sessions)
    }

    // MARK: - Suggestion dismissals (persisted; Tips UI)

    public func dismissSuggestion(id: String) {
        self.dismissedSuggestionIDs.insert(id)
        try? VeyrDismissedSuggestions(ids: self.dismissedSuggestionIDs).save()
    }

    public func restoreSuggestion(id: String) {
        self.dismissedSuggestionIDs.remove(id)
        try? VeyrDismissedSuggestions(ids: self.dismissedSuggestionIDs).save()
    }

    // MARK: - Recommendation dismissals (UI only, per session)

    public func dismissRecommendation(id: String) {
        self.dismissedRecommendationIDs.insert(id)
    }

    public var visibleRecommendations: [VeyrAgentStatusPayload.Recommendation] {
        (self.latestPayload?.recommendations ?? [])
            .filter { !self.dismissedRecommendationIDs.contains($0.id) }
    }

    private func resetDismissalsIfSessionChanged(payload: VeyrAgentStatusPayload) {
        let key = payload.currentSession.map { "\($0.project):\($0.model)" }
        if key != self.dismissalSessionKey {
            self.dismissalSessionKey = key
            self.dismissedRecommendationIDs = []
        }
    }

    // MARK: - CLAUDE.md injection

    /// Manual trigger from the Agent tab: bypasses the 5-minute throttle.
    public func updateClaudeMdNow() async {
        if self.latestPayload == nil { await self.tick() }
        guard let payload = self.latestPayload else { return }
        self.lastClaudeMdUpdateAt = nil
        self.injectClaudeMd(payload: payload, sessions: VeyrSpend.shared.sessions, force: true)
    }

    private func updateClaudeMdIfEnabled(payload: VeyrAgentStatusPayload, sessions: [SessionEntry]) {
        guard self.autoUpdateClaudeMdEnabled else {
            // Toggle may have been flipped off externally (VS Code writes the same
            // shared config file) — clean up the injected section once.
            if let path = self.lastClaudeMdProjectPath {
                try? VeyrAgentStatusWriter.removeClaudeMdSection(projectPath: path)
                self.lastClaudeMdProjectPath = nil
                self.lastClaudeMdUpdateAt = nil
            }
            return
        }
        self.injectClaudeMd(payload: payload, sessions: sessions, force: false)
    }

    private func injectClaudeMd(
        payload: VeyrAgentStatusPayload,
        sessions: [SessionEntry],
        force: Bool)
    {
        // The target is the active session's cwd; skip when unknown.
        guard let projectPath = sessions.max(by: { $0.timestamp < $1.timestamp })?.projectPath,
              !projectPath.isEmpty
        else { return }
        if !force,
           let last = self.lastClaudeMdUpdateAt,
           Date().timeIntervalSince(last) < Self.claudeMdMinInterval,
           projectPath == self.lastClaudeMdProjectPath
        {
            return
        }
        do {
            try VeyrAgentStatusWriter.updateClaudeMd(
                projectPath: projectPath, payload: payload, createIfMissing: true)
            self.lastClaudeMdUpdateAt = Date()
            self.lastClaudeMdProjectPath = projectPath
            self.logger.info(
                "[Veyr] Updated CLAUDE.md spend section",
                metadata: ["project": projectPath])
        } catch {
            self.logger.error(
                "[Veyr] CLAUDE.md update failed",
                metadata: ["project": projectPath, "error": String(describing: error)])
        }
    }
}
