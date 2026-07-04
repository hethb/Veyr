// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import Foundation

public enum ProviderCookieSettingsResolver {
    public static func resolve(
        provider: UsageProvider,
        configuredSource: ProviderCookieSource,
        configuredHeader: String?,
        selectedAccount: ProviderTokenAccount?) -> ProviderSettingsSnapshot.CookieProviderSettings
    {
        guard let support = TokenAccountSupportCatalog.support(for: provider),
              case .cookieHeader = support.injection,
              let selectedAccount
        else {
            return ProviderSettingsSnapshot.CookieProviderSettings(
                cookieSource: configuredSource,
                manualCookieHeader: configuredHeader)
        }

        return ProviderSettingsSnapshot.CookieProviderSettings(
            cookieSource: support.requiresManualCookieSource ? .manual : configuredSource,
            manualCookieHeader: TokenAccountSupportCatalog.normalizedCookieHeader(
                selectedAccount.token,
                support: support))
    }
}
