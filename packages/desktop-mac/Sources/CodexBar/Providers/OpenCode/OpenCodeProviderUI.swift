// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

enum OpenCodeProviderUI {
    @MainActor
    static func cachedCookieTrailingText(provider: UsageProvider, cookieSource: ProviderCookieSource) -> String? {
        guard cookieSource != .manual else { return nil }
        return ProviderCookieSourceUI.cachedTrailingText(provider: provider)
    }
}
