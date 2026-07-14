// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation
import Security
import VeyrKit

/// Resolves the Anthropic API key for Veyr's optimization features.
///
/// Order: macOS Keychain (set via Veyr Settings) → `~/.veyr/config.json`
/// (`anthropicApiKey`) → `ANTHROPIC_API_KEY` env. Veyr never reads Claude
/// Code's credentials (keychain item or file) — the user provides their own key.
enum VeyrAnthropicKey {
    private static let keychainService = "com.veyr.mac.anthropic"
    private static let keychainAccount = "api-key"

    static func resolve(
        environment: [String: String] = ProcessInfo.processInfo.environment) -> String?
    {
        if let key = Self.loadFromKeychain(), Self.looksValid(key) { return key }
        if let key = Self.loadFromVeyrConfig(), Self.looksValid(key) { return key }
        if let key = environment["ANTHROPIC_API_KEY"], Self.looksValid(key) { return key }
        return nil
    }

    static func looksValid(_ key: String) -> Bool {
        key.hasPrefix("sk-ant-") && key.count > 20
    }

    // MARK: - Keychain (the Settings-entered key)

    static func loadFromKeychain() -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: Self.keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        // Never show a password prompt for this read. Ad-hoc builds change code
        // signature every rebuild, so the item's ACL stops matching and macOS
        // would otherwise prompt on every launch; fall back to ~/.veyr/config.json
        // (and re-saving via Settings) instead.
        KeychainNoUIQuery.apply(to: &query)
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let key = String(data: data, encoding: .utf8)
        else { return nil }
        return key
    }

    @discardableResult
    static func saveToKeychain(_ key: String) -> Bool {
        Self.deleteFromKeychain()
        guard !key.isEmpty else { return true }
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: Self.keychainAccount,
            kSecValueData as String: Data(key.utf8),
            // Readable after first unlock without per-read password confirmation —
            // required for a background menu bar app.
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess
    }

    @discardableResult
    static func deleteFromKeychain() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: Self.keychainAccount,
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    /// True when a Settings-entered key exists (for UI display only).
    static var hasKeychainKey: Bool {
        Self.loadFromKeychain() != nil
    }

    // MARK: - Other sources

    private static func loadFromVeyrConfig() -> String? {
        guard let data = try? Data(contentsOf: VeyrConfig.fileURL()),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return nil }
        return object["anthropicApiKey"] as? String
    }
}
