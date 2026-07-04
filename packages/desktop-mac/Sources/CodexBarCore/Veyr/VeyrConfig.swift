// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// `~/.veyr/config.json` — small shared config both the Mac app and the
/// VS Code extension read/write (each surface can flip the same toggles).
/// Unknown keys written by other tools are preserved on save.
public struct VeyrConfig: Sendable {
    public var autoUpdateClaudeMd: Bool?

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
        return config
    }

    public func save(to url: URL = Self.fileURL()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        var object: [String: Any] = self.rawData.flatMap {
            (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any]
        } ?? [:]
        if let autoUpdateClaudeMd = self.autoUpdateClaudeMd {
            object["autoUpdateClaudeMd"] = autoUpdateClaudeMd
        } else {
            object.removeValue(forKey: "autoUpdateClaudeMd")
        }
        let data = try JSONSerialization.data(
            withJSONObject: object,
            options: [.prettyPrinted, .sortedKeys])
        try data.write(to: url, options: [.atomic])
    }
}
