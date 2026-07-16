// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation
import VeyrKit

/// Local HTTP surface the terminal CLI (`packages/cli`) talks to instead of
/// polling `~/.veyr/*.json` directly. Runs in-process inside the menu bar app
/// — there is no separate headless daemon binary (see stage-3 note in
/// packages/cli/CLAUDE.md) — backed by the same live state
/// VeyrAgentStatusService/VeyrGraphService already maintain, so reads are
/// fresher than the file cache and writes that need live computation (a
/// Graphify rescan) don't wait for the next tick.
///
/// Binds an OS-assigned ephemeral port and publishes it via
/// `~/.veyr/daemon.json` (`VeyrDaemonInfo`) once listening. Config/state
/// writes (rule toggles, the injection gate) still go straight to their files
/// from the CLI — this server does not need to be running for those.
@MainActor
public final class VeyrDaemonServer {
    public static let shared = VeyrDaemonServer()

    private let logger = CodexBarLog.logger(LogCategories.veyr)
    private var server: CLILocalHTTPServer?
    private var runTask: Task<Void, Never>?

    private init() {}

    public func start() {
        guard self.runTask == nil else { return }
        let server = CLILocalHTTPServer(host: "127.0.0.1", port: 0) { request in
            await VeyrDaemonServer.shared.handle(request)
        }
        self.server = server
        self.runTask = Task { [weak self] in
            do {
                try await server.run { port in
                    Task { @MainActor in self?.didStartListening(port: port) }
                }
            } catch {
                self?.logger.error(
                    "[Veyr] Daemon server stopped",
                    metadata: ["error": String(describing: error)])
            }
        }
    }

    public func stop() {
        self.server?.stop()
        self.runTask?.cancel()
        self.runTask = nil
        self.server = nil
        VeyrDaemonInfo.remove()
    }

    private func didStartListening(port: UInt16) {
        let info = VeyrDaemonInfo(
            port: Int(port),
            pid: ProcessInfo.processInfo.processIdentifier,
            startedAt: Date())
        do {
            try info.save()
            self.logger.info("[Veyr] Daemon listening", metadata: ["port": "\(port)"])
        } catch {
            self.logger.error(
                "[Veyr] Failed writing daemon.json",
                metadata: ["error": String(describing: error)])
        }
    }

    // MARK: - Routing

    private func handle(_ request: CLILocalHTTPRequest) async -> CLILocalHTTPResponse {
        switch (request.method, request.path) {
        case ("GET", "/health"):
            return Self.json(["status": "ok"])
        case ("GET", "/status"):
            return await self.handleStatus()
        case ("GET", "/graph"):
            return self.handleGraph()
        case ("POST", "/graph/refresh"):
            return await self.handleGraphRefresh(queryItems: request.queryItems)
        case ("GET", "/style/complete"):
            return Self.handleStyleComplete(queryItems: request.queryItems)
        case ("GET", "/savings"):
            return Self.handleSavings()
        case (_, "/health"), (_, "/status"), (_, "/graph"), (_, "/style/complete"), (_, "/savings"):
            return CLILocalHTTPResponse(
                status: .methodNotAllowed,
                body: Data(#"{"error":"method not allowed"}"#.utf8))
        default:
            return CLILocalHTTPResponse(status: .notFound, body: Data(#"{"error":"not found"}"#.utf8))
        }
    }

    private func handleStatus() async -> CLILocalHTTPResponse {
        if VeyrAgentStatusService.shared.latestPayload == nil {
            await VeyrAgentStatusService.shared.tick()
        }
        guard let payload = VeyrAgentStatusService.shared.latestPayload else {
            return CLILocalHTTPResponse(
                status: .internalServerError,
                body: Data(#"{"error":"status unavailable"}"#.utf8))
        }
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(payload) else {
            return CLILocalHTTPResponse(
                status: .internalServerError,
                body: Data(#"{"error":"encoding failed"}"#.utf8))
        }
        return CLILocalHTTPResponse(status: .ok, body: data)
    }

    private func handleGraph() -> CLILocalHTTPResponse {
        guard let graph = VeyrGraphService.shared.currentGraph else {
            return CLILocalHTTPResponse(status: .notFound, body: Data(#"{"error":"no graph yet"}"#.utf8))
        }
        let payload = GraphifyRunner.cachePayload(for: graph)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(payload) else {
            return CLILocalHTTPResponse(
                status: .internalServerError,
                body: Data(#"{"error":"encoding failed"}"#.utf8))
        }
        return CLILocalHTTPResponse(status: .ok, body: data)
    }

    /// Fires the rescan and returns immediately — a full build can take
    /// minutes on a large repo, far longer than a request should block for.
    /// The CLI polls `GET /graph` afterward to observe the result.
    private func handleGraphRefresh(queryItems: [String: String]) async -> CLILocalHTTPResponse {
        guard let path = queryItems["path"], !path.isEmpty else {
            return CLILocalHTTPResponse(status: .badRequest, body: Data(#"{"error":"missing path"}"#.utf8))
        }
        Task { @MainActor in
            await VeyrGraphService.shared.refreshNow(root: path)
        }
        return Self.json(["ok": true, "status": "refresh_started"])
    }

    private struct StyleCompletionResponse: Encodable {
        struct Suggestion: Encodable {
            var text: String
            var kind: String
            var confidence: Double
        }
        var suggestions: [Suggestion]
        /// Always [] in phase 1 (no Graphify grounding yet) — present, not
        /// omitted, so a later phase populating it isn't a breaking schema
        /// change for clients that already decode this field.
        var groundedIn: [String]
    }

    /// Gated by VeyrConfig.promptStyleLearning: when off, returns 200 with
    /// an empty suggestions array rather than an error, so callers only ever
    /// need one code path ("array possibly empty"), matching the daemon's
    /// existing "absence is normal" philosophy (see packages/cli/src/veyr/daemon.ts).
    private static func handleStyleComplete(queryItems: [String: String]) -> CLILocalHTTPResponse {
        guard VeyrConfig.load().promptStyleLearning == true else {
            return Self.encodeStyleResponse(suggestions: [])
        }
        let prefix = queryItems["text"] ?? ""
        let max = queryItems["max"].flatMap { Int($0) } ?? 3
        let store = VeyrPromptStyleStore.load()
        let suggestions = VeyrPromptStyleCompleter.complete(prefix: prefix, store: store, max: max)
        return Self.encodeStyleResponse(suggestions: suggestions)
    }

    private static func encodeStyleResponse(suggestions: [VeyrPromptStyleCompleter.Suggestion]) -> CLILocalHTTPResponse {
        let response = StyleCompletionResponse(
            suggestions: suggestions.map { StyleCompletionResponse.Suggestion(text: $0.text, kind: $0.kind, confidence: $0.confidence) },
            groundedIn: [])
        guard let data = try? JSONEncoder().encode(response) else {
            return CLILocalHTTPResponse(
                status: .internalServerError,
                body: Data(#"{"error":"encoding failed"}"#.utf8))
        }
        return CLILocalHTTPResponse(status: .ok, body: data)
    }

    private struct SavingsTotalsPayload: Encodable {
        var component1MeasuredTokens: Double
        var component1MeasuredUSD: Double
        var component1AssumptionTokens: Double
        var component1AssumptionUSD: Double
        var component3CorrelationalTokens: Double
        var component3CorrelationalUSD: Double

        init(_ totals: VeyrSavingsStore.SavingsTotals) {
            self.component1MeasuredTokens = totals.component1MeasuredTokens
            self.component1MeasuredUSD = totals.component1MeasuredUSD
            self.component1AssumptionTokens = totals.component1AssumptionTokens
            self.component1AssumptionUSD = totals.component1AssumptionUSD
            self.component3CorrelationalTokens = totals.component3CorrelationalTokens
            self.component3CorrelationalUSD = totals.component3CorrelationalUSD
        }
    }

    private struct SavingsResponse: Encodable {
        var enabled: Bool
        var lifetime: SavingsTotalsPayload
        var currentProjectTag: String?
        var currentProject: SavingsTotalsPayload?
        /// Component 2 — informational only, never summed into any total.
        var component2RedundantReadTokensThisSession: Double
        var component3Disclaimer: String
    }

    /// Gated by VeyrConfig.savingsTracker: when off, returns 200 with all
    /// figures zeroed and `enabled: false` rather than an error — same
    /// "absence is normal" philosophy as `/style/complete`. See
    /// VeyrSavingsCalculator for the exact estimation methodology behind
    /// every figure this returns.
    private static func handleSavings() -> CLILocalHTTPResponse {
        guard VeyrConfig.load().savingsTracker == true else {
            return Self.encodeSavings(SavingsResponse(
                enabled: false,
                lifetime: SavingsTotalsPayload(.init()),
                currentProjectTag: nil,
                currentProject: nil,
                component2RedundantReadTokensThisSession: 0,
                component3Disclaimer: VeyrSavingsCalculator.component3Disclaimer))
        }
        let store = VeyrSavingsStore.load()
        let currentTag = VeyrAgentStatusService.shared.latestPayload?.currentSession?.project
        let currentProjectTotals = currentTag.flatMap { store.perProjectTotals[$0] }

        // Component 2 (redundant reads) is a live, current-session-only
        // observation, not a stored total — re-derive the current session
        // the same way tick() does, then look up its signals.
        let currentSession = VeyrSpend.shared.sessions.max { $0.timestamp < $1.timestamp }
        let signals = currentSession?.sessionId.flatMap { VeyrSignalsScanner.scan().sessions[$0] }
        let redundantTokens = VeyrSavingsCalculator.redundantReadTokens(readCounts: signals?.readCounts ?? [:])

        return Self.encodeSavings(SavingsResponse(
            enabled: true,
            lifetime: SavingsTotalsPayload(store.lifetimeTotals),
            currentProjectTag: currentTag,
            currentProject: currentProjectTotals.map(SavingsTotalsPayload.init),
            component2RedundantReadTokensThisSession: redundantTokens,
            component3Disclaimer: VeyrSavingsCalculator.component3Disclaimer))
    }

    private static func encodeSavings(_ response: SavingsResponse) -> CLILocalHTTPResponse {
        guard let data = try? JSONEncoder().encode(response) else {
            return CLILocalHTTPResponse(
                status: .internalServerError,
                body: Data(#"{"error":"encoding failed"}"#.utf8))
        }
        return CLILocalHTTPResponse(status: .ok, body: data)
    }

    // MARK: - Helpers

    private static func json(_ object: [String: Any]) -> CLILocalHTTPResponse {
        let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
        return CLILocalHTTPResponse(status: .ok, body: data)
    }
}
