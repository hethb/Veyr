// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import Foundation

public enum CLIProbeSessionResetter {
    public static func resetAll() async {
        await ClaudeCLISession.shared.reset()
        await CodexCLISession.shared.reset()
        await AntigravityCLISession.shared.reset()
    }
}
