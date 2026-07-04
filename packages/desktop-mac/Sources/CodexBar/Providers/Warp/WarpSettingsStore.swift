// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

extension SettingsStore {
    var warpAPIToken: String {
        get { self.configSnapshot.providerConfig(for: .warp)?.sanitizedAPIKey ?? "" }
        set {
            self.updateProviderConfig(provider: .warp) { entry in
                entry.apiKey = self.normalizedConfigValue(newValue)
            }
            self.logSecretUpdate(provider: .warp, field: "apiKey", value: newValue)
        }
    }
}
