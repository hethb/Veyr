// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

struct TokenAccountOverride {
    let provider: UsageProvider
    let account: ProviderTokenAccount
}

enum ProviderTokenAccountSelection {
    @MainActor
    static func selectedAccount(
        provider: UsageProvider,
        settings: SettingsStore,
        override: TokenAccountOverride?) -> ProviderTokenAccount?
    {
        if let override, override.provider == provider { return override.account }
        return settings.selectedTokenAccount(for: provider)
    }
}
