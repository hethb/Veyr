// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

extension SettingsStore {
    var crofAPIToken: String {
        get { self.configSnapshot.providerConfig(for: .crof)?.sanitizedAPIKey ?? "" }
        set {
            self.updateProviderConfig(provider: .crof) { entry in
                entry.apiKey = self.normalizedConfigValue(newValue)
            }
            self.logSecretUpdate(provider: .crof, field: "apiKey", value: newValue)
        }
    }
}
