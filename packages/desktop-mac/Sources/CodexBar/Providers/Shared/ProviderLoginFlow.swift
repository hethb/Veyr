// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import AppKit
import CodexBarCore

@MainActor
extension StatusItemController {
    /// Runs the provider-specific login flow.
    /// - Returns: Whether CodexBar should refresh after the flow completes.
    func runLoginFlow(provider: UsageProvider) async -> Bool {
        guard let impl = ProviderCatalog.implementation(for: provider) else { return false }
        return await impl.runLoginFlow(context: ProviderLoginContext(controller: self))
    }
}
