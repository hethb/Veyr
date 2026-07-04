// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

extension SettingsStore {
    var syntheticAPIToken: String {
        get { self.configSnapshot.providerConfig(for: .synthetic)?.sanitizedAPIKey ?? "" }
        set {
            self.updateProviderConfig(provider: .synthetic) { entry in
                entry.apiKey = self.normalizedConfigValue(newValue)
            }
            self.logSecretUpdate(provider: .synthetic, field: "apiKey", value: newValue)
        }
    }

    func ensureSyntheticAPITokenLoaded() {}
}
