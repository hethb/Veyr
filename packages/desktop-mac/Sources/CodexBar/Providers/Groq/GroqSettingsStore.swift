// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

extension SettingsStore {
    var groqAPIKey: String {
        get {
            self.configSnapshot.providerConfig(for: .groq)?.sanitizedAPIKey ?? ""
        }
        set {
            self.updateProviderConfig(provider: .groq) { entry in
                entry.apiKey = self.normalizedConfigValue(newValue)
            }
            self.logSecretUpdate(provider: .groq, field: "apiKey", value: newValue)
        }
    }
}
