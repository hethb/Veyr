// Portions of this file are derived from CodexBar by Peter Steinberger (steipete).
// CodexBar: https://github.com/steipete/CodexBar
// Licensed under the MIT License.
import Foundation

#if canImport(CryptoKit)
import CryptoKit
#endif

extension ClaudeOAuthCredentialsStore {
    static func sha256Prefix(_ data: Data) -> String? {
        #if canImport(CryptoKit)
        let digest = SHA256.hash(data: data)
        let hex = digest.compactMap { String(format: "%02x", $0) }.joined()
        return String(hex.prefix(12))
        #else
        _ = data
        return nil
        #endif
    }
}
