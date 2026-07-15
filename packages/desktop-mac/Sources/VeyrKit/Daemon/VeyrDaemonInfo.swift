// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// `~/.veyr/daemon.json` — written once `VeyrDaemonServer` is listening, read
/// by the CLI to discover the live port. Camelcase, no snake_case conversion
/// (an internal discovery file, not a payload agents read directly).
public struct VeyrDaemonInfo: Codable, Equatable, Sendable {
    public var port: Int
    public var pid: Int32
    public var startedAt: Date

    public init(port: Int, pid: Int32, startedAt: Date) {
        self.port = port
        self.pid = pid
        self.startedAt = startedAt
    }

    public static func load(from url: URL = VeyrPaths.daemonInfoFile()) -> VeyrDaemonInfo? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(VeyrDaemonInfo.self, from: data)
    }

    public func save(to url: URL = VeyrPaths.daemonInfoFile()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(self).write(to: url, options: [.atomic])
    }

    @discardableResult
    public static func remove(at url: URL = VeyrPaths.daemonInfoFile()) -> Bool {
        (try? FileManager.default.removeItem(at: url)) != nil
    }
}
