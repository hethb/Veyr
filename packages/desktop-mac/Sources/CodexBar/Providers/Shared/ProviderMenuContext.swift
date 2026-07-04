// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

typealias ProviderMenuEntry = MenuDescriptor.Entry

struct ProviderMenuUsageContext {
    let provider: UsageProvider
    let store: UsageStore
    let settings: SettingsStore
    let metadata: ProviderMetadata
    let snapshot: UsageSnapshot?
}

struct ProviderMenuActionContext {
    let provider: UsageProvider
    let store: UsageStore
    let settings: SettingsStore
    let account: AccountInfo
    let managedCodexAccountCoordinator: ManagedCodexAccountCoordinator?
    let codexAccountPromotionCoordinator: CodexAccountPromotionCoordinator?
}

struct ProviderMenuLoginContext {
    let provider: UsageProvider
    let store: UsageStore
    let settings: SettingsStore
    let account: AccountInfo
}
