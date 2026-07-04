// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import Foundation

#if os(Linux)
@discardableResult
func autoreleasepool<Result>(_ work: () throws -> Result) rethrows -> Result {
    try work()
}
#endif
