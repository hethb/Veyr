// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

extension SettingsStore {
    var chutesAPIKey: String {
        get { self.configSnapshot.providerConfig(for: .chutes)?.sanitizedAPIKey ?? "" }
        set {
            self.updateProviderConfig(provider: .chutes) { entry in
                entry.apiKey = self.normalizedConfigValue(newValue)
            }
            self.logSecretUpdate(provider: .chutes, field: "apiKey", value: newValue)
        }
    }

    func ensureChutesAPIKeyLoaded() {}
}
