// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import Foundation

public enum KiloUsageScope: Sendable, Hashable, Equatable {
    case personal
    case organization(id: String, name: String)

    public var scopeIdentifier: String {
        switch self {
        case .personal:
            "personal"
        case let .organization(id, _):
            "org:\(id)"
        }
    }

    public var organizationID: String? {
        switch self {
        case .personal:
            nil
        case let .organization(id, _):
            id
        }
    }

    public var displayName: String {
        switch self {
        case .personal:
            "Personal"
        case let .organization(_, name):
            name
        }
    }
}
