// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// LLM-powered task-complexity classification for coding-agent turns.
///
/// Always calls `claude-haiku-4-5` (never a bigger model), truncates inputs to
/// 500 chars each, and marks the system prompt with `cache_control: ephemeral`
/// so every call after the first pays ~10% for it.
public enum VeyrTaskComplexityClassifier {
    public struct ClassificationResult: Codable, Equatable, Sendable {
        public enum Complexity: String, Codable, Sendable {
            case simple, moderate, complex
        }

        public let complexity: Complexity
        public let reasoning: String
        public let suggestedModel: String
        public let estimatedTokensNeeded: Int
    }

    public static let classifierModel = "claude-haiku-4-5"
    static let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!

    static let systemPrompt = """
    You are a task complexity classifier for AI coding sessions. Given a user message \
    and assistant response from a coding agent session, classify the task complexity.

    Respond in JSON only. No preamble. Schema:
    {
      "complexity": "simple" | "moderate" | "complex",
      "reasoning": "one sentence",
      "suggestedModel": "claude-haiku-4-5" | "claude-sonnet-5" | "claude-opus-4-8",
      "estimatedTokensNeeded": <integer>
    }

    Classification guide:
    - simple: file reads, simple edits (<20 lines), running commands, grep/search, \
    explaining short code snippets, fixing obvious bugs, renaming things. \
    Use claude-haiku-4-5. Typical tokens needed: 200-800.

    - moderate: multi-file edits, debugging with context, writing tests, refactoring \
    a single function, explaining complex code, adding a feature to existing code \
    with clear requirements. \
    Use claude-sonnet-5. Typical tokens needed: 800-3000.

    - complex: architecture decisions, designing systems from scratch, debugging \
    hard-to-reproduce issues, performance optimization requiring deep analysis, \
    cross-cutting refactors across many files, novel algorithm design. \
    Use claude-opus-4-8. Typical tokens needed: 3000+.
    """

    // MARK: - Request building (pure; unit-testable without network)

    public static func requestBody(
        userMessage: String,
        assistantResponse: String,
        model: String) throws -> Data
    {
        let truncatedUser = String(userMessage.prefix(500))
        let truncatedAssistant = String(assistantResponse.prefix(500))
        let userPrompt = """
        User message: \(truncatedUser)
        Assistant response (first 500 chars): \(truncatedAssistant)
        Model used: \(model)
        """

        let body: [String: Any] = [
            "model": Self.classifierModel,
            "max_tokens": 150,
            "system": [[
                "type": "text",
                "text": Self.systemPrompt,
                "cache_control": ["type": "ephemeral"],
            ]],
            "messages": [["role": "user", "content": userPrompt]],
        ]
        return try JSONSerialization.data(withJSONObject: body)
    }

    /// Parses the messages-API response into a result. Tolerates code fences.
    public static func parseResponse(_ data: Data) throws -> ClassificationResult {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = object["content"] as? [[String: Any]],
              let text = content.first(where: { $0["type"] as? String == "text" })?["text"] as? String
        else {
            throw VeyrClassifierError.malformedResponse
        }
        var json = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if json.hasPrefix("```") {
            json = json
                .replacingOccurrences(of: "```json", with: "")
                .replacingOccurrences(of: "```", with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return try JSONDecoder().decode(ClassificationResult.self, from: Data(json.utf8))
    }

    // MARK: - Network call

    public static func classify(
        userMessage: String,
        assistantResponse: String,
        model: String,
        apiKey: String,
        session: URLSession = .shared) async throws -> ClassificationResult
    {
        var request = URLRequest(url: Self.endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.httpBody = try Self.requestBody(
            userMessage: userMessage,
            assistantResponse: assistantResponse,
            model: model)
        request.timeoutInterval = 20

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw VeyrClassifierError.httpError(status: status)
        }
        return try Self.parseResponse(data)
    }
}

public enum VeyrClassifierError: Error, Equatable {
    case malformedResponse
    case httpError(status: Int)
    case noApiKey
}
