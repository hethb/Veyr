// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

extension SettingsStore {
    var elevenLabsAPIKey: String {
        get { self.configSnapshot.providerConfig(for: .elevenlabs)?.sanitizedAPIKey ?? "" }
        set {
            self.updateProviderConfig(provider: .elevenlabs) { entry in
                entry.apiKey = self.normalizedConfigValue(newValue)
            }
            self.logSecretUpdate(provider: .elevenlabs, field: "apiKey", value: newValue)
        }
    }
}
