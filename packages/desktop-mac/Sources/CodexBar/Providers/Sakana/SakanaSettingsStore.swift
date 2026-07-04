// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

extension SettingsStore {
    var sakanaCookieHeader: String {
        get { self.configSnapshot.providerConfig(for: .sakana)?.sanitizedCookieHeader ?? "" }
        set {
            self.updateProviderConfig(provider: .sakana) { entry in
                entry.cookieHeader = self.normalizedConfigValue(newValue)
            }
            self.logSecretUpdate(provider: .sakana, field: "cookieHeader", value: newValue)
        }
    }
}
