// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import CodexBarCore
import Foundation

@MainActor
extension UsageStore {
    func clearCopilotBudgetExtras() {
        if let snapshot = self.snapshots[.copilot],
           snapshot.extraRateWindows?.isEmpty == false
        {
            let updated = snapshot.with(extraRateWindows: nil)
            self.snapshots[.copilot] = updated
            self.lastKnownResetSnapshots[.copilot] = updated
        } else if let resetSnapshot = self.lastKnownResetSnapshots[.copilot],
                  resetSnapshot.extraRateWindows?.isEmpty == false
        {
            self.lastKnownResetSnapshots[.copilot] = resetSnapshot.with(extraRateWindows: nil)
        }
    }
}
