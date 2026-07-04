// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

@MainActor
final class CodexProviderRuntime: ProviderRuntime {
    let id: UsageProvider = .codex

    func perform(action: ProviderRuntimeAction, context: ProviderRuntimeContext) async {
        switch action {
        case let .openAIWebAccessToggled(enabled):
            guard enabled == false else { return }
            context.store.resetOpenAIWebState()
        case .forceSessionRefresh:
            break
        }
    }
}
