// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import Foundation

public enum ProviderInteraction: Sendable, Equatable {
    case background
    case userInitiated
}

public enum ProviderInteractionContext {
    @TaskLocal public static var current: ProviderInteraction = .background
}

public enum ProviderRefreshPhase: Sendable, Equatable {
    case regular
    case startup
}

public enum ProviderRefreshContext {
    @TaskLocal public static var current: ProviderRefreshPhase = .regular
}
