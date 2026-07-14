// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// `~/.veyr/config.json` — small shared config both the Mac app and the
/// VS Code extension read/write (each surface can flip the same toggles).
/// Unknown keys written by other tools are preserved on save.
public struct VeyrConfig: Sendable {
    public static let productionDashboardUrl = "https://veyr-app.vercel.app"

    /// Absolute URL of the dashboard's graph page, honoring the dev override.
    public var graphPageUrl: String {
        let base = (self.dashboardUrl ?? Self.productionDashboardUrl)
        return base.hasSuffix("/") ? base + "graph" : base + "/graph"
    }

    public var autoUpdateClaudeMd: Bool?
    /// Injects the `## Veyr agent guidance` section (nil/false = off). Distinct
    /// from `autoUpdateClaudeMd` and defaults off — a newer, separately opt-in
    /// section layered on the same injection mechanism.
    public var autoUpdateGuidance: Bool?
    /// "off" | "last_n" | "summarize" | "key_points_only" (proxy trimming).
    public var trimStrategy: String?
    public var outputConstraints: Bool?
    public var toolFilteringSuggestions: Bool?
    public var batchApiDetection: Bool?
    public var structuredOutputDetection: Bool?
    /// Graphify-backed codebase graph (nil = enabled). Kill switch for the
    /// silent-install + background-build pipeline.
    public var codebaseGraph: Bool?
    /// Web dashboard origin for outbound links (nil = production). Dev builds
    /// set "http://localhost:5173" here.
    public var dashboardUrl: String?

    /// Raw file bytes, kept so keys written by other tools survive a save
    /// (`Data` keeps the struct Sendable; parsed lazily at save time).
    private var rawData: Data?

    public init(autoUpdateClaudeMd: Bool? = nil) {
        self.autoUpdateClaudeMd = autoUpdateClaudeMd
        self.rawData = nil
    }

    public static func fileURL(
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        VeyrPaths.home(base: base).appendingPathComponent("config.json")
    }

    public static func load(from url: URL = Self.fileURL()) -> VeyrConfig {
        var config = VeyrConfig()
        guard let data = try? Data(contentsOf: url),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return config }
        config.rawData = data
        config.autoUpdateClaudeMd = object["autoUpdateClaudeMd"] as? Bool
        config.autoUpdateGuidance = object["autoUpdateGuidance"] as? Bool
        config.trimStrategy = object["trimStrategy"] as? String
        config.outputConstraints = object["outputConstraints"] as? Bool
        config.toolFilteringSuggestions = object["toolFilteringSuggestions"] as? Bool
        config.batchApiDetection = object["batchApiDetection"] as? Bool
        config.structuredOutputDetection = object["structuredOutputDetection"] as? Bool
        config.codebaseGraph = object["codebaseGraph"] as? Bool
        config.dashboardUrl = object["dashboardUrl"] as? String
        return config
    }

    public func save(to url: URL = Self.fileURL()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        var object: [String: Any] = self.rawData.flatMap {
            (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any]
        } ?? [:]
        let updates: [(String, Any?)] = [
            ("autoUpdateClaudeMd", self.autoUpdateClaudeMd),
            ("autoUpdateGuidance", self.autoUpdateGuidance),
            ("trimStrategy", self.trimStrategy),
            ("outputConstraints", self.outputConstraints),
            ("toolFilteringSuggestions", self.toolFilteringSuggestions),
            ("batchApiDetection", self.batchApiDetection),
            ("structuredOutputDetection", self.structuredOutputDetection),
            ("codebaseGraph", self.codebaseGraph),
            ("dashboardUrl", self.dashboardUrl),
        ]
        for (key, value) in updates {
            if let value {
                object[key] = value
            } else {
                object.removeValue(forKey: key)
            }
        }
        let data = try JSONSerialization.data(
            withJSONObject: object,
            options: [.prettyPrinted, .sortedKeys])
        try data.write(to: url, options: [.atomic])
    }
}
