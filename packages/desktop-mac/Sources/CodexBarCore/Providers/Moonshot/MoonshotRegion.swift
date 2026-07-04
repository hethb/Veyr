// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import Foundation

public enum MoonshotRegion: String, CaseIterable, Sendable {
    case international
    case china

    private static let balancePath = "v1/users/me/balance"

    public var displayName: String {
        switch self {
        case .international:
            "International (api.moonshot.ai)"
        case .china:
            "China (api.moonshot.cn)"
        }
    }

    public var apiBaseURLString: String {
        switch self {
        case .international:
            "https://api.moonshot.ai"
        case .china:
            "https://api.moonshot.cn"
        }
    }

    public var balanceURL: URL {
        URL(string: self.apiBaseURLString)!.appendingPathComponent(Self.balancePath)
    }
}
