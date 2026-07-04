// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import Foundation
import Observation

@MainActor
@Observable
final class PreferencesSelection {
    var tab: PreferencesTab = .general
}
