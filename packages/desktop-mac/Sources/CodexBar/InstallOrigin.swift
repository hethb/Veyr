// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import Foundation

enum InstallOrigin {
    static func isHomebrewCask(appBundleURL: URL) -> Bool {
        let resolved = appBundleURL.resolvingSymlinksInPath()
        let path = resolved.path
        return path.contains("/Caskroom/") || path.contains("/Homebrew/Caskroom/")
    }
}
