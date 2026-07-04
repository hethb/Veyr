// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import AppKit
import CodexBarCore

@MainActor
extension StatusItemController {
    func runFactoryLoginFlow() async {
        // Open Factory login page in default browser
        if let url = URL(string: "https://app.factory.ai") {
            NSWorkspace.shared.open(url)
        }
    }
}
