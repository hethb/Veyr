// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Veyr's model pricing entry point.
///
/// Delegates to CodexBar's vendored `CostUsagePricing` first — it carries the
/// models.dev catalog (cached on disk), historical repricing, cache-write tiers,
/// and long-context thresholds. The static table below is only the offline
/// fallback for models neither the catalog nor the built-in tables know.
public struct ModelPricing: Sendable {
    public let modelId: String
    public let inputCostPerMillion: Double
    public let outputCostPerMillion: Double

    public init(modelId: String, inputCostPerMillion: Double, outputCostPerMillion: Double) {
        self.modelId = modelId
        self.inputCostPerMillion = inputCostPerMillion
        self.outputCostPerMillion = outputCostPerMillion
    }
}

extension ModelPricing {
    public static let table: [ModelPricing] = [
        // Anthropic
        ModelPricing(modelId: "claude-opus-4", inputCostPerMillion: 15.00, outputCostPerMillion: 75.00),
        ModelPricing(modelId: "claude-sonnet-4", inputCostPerMillion: 3.00, outputCostPerMillion: 15.00),
        ModelPricing(modelId: "claude-haiku-4", inputCostPerMillion: 0.80, outputCostPerMillion: 4.00),
        ModelPricing(modelId: "claude-3-5-sonnet", inputCostPerMillion: 3.00, outputCostPerMillion: 15.00),
        ModelPricing(modelId: "claude-3-5-haiku", inputCostPerMillion: 0.80, outputCostPerMillion: 4.00),
        ModelPricing(modelId: "claude-3-opus", inputCostPerMillion: 15.00, outputCostPerMillion: 75.00),
        // OpenAI
        ModelPricing(modelId: "gpt-4o-mini", inputCostPerMillion: 0.15, outputCostPerMillion: 0.60),
        ModelPricing(modelId: "gpt-4o", inputCostPerMillion: 2.50, outputCostPerMillion: 10.00),
        ModelPricing(modelId: "gpt-4-turbo", inputCostPerMillion: 10.00, outputCostPerMillion: 30.00),
        ModelPricing(modelId: "o1", inputCostPerMillion: 15.00, outputCostPerMillion: 60.00),
        ModelPricing(modelId: "o3", inputCostPerMillion: 10.00, outputCostPerMillion: 40.00),
        ModelPricing(modelId: "o4-mini", inputCostPerMillion: 1.10, outputCostPerMillion: 4.40),
    ]

    /// Fallback for models missing from every source.
    public static let fallback = ModelPricing(
        modelId: "unknown",
        inputCostPerMillion: 2.00,
        outputCostPerMillion: 8.00)

    /// Cache token pricing relative to the input rate (Anthropic's published ratios).
    static let cacheReadRateMultiplier = 0.10
    static let cacheWriteRateMultiplier = 1.25

    /// Cost in USD for one usage record.
    ///
    /// Resolution order for `claude-*` models: CodexBar's `CostUsagePricing`
    /// (models.dev catalog + built-in tables + historical repricing), then the
    /// static table, then `fallback`. Other models: static table, then `fallback`.
    public static func cost(
        for modelId: String,
        inputTokens: Int,
        outputTokens: Int,
        cacheReadTokens: Int = 0,
        cacheWriteTokens: Int = 0,
        pricingDate: Date? = nil) -> Double
    {
        self.cost(
            for: modelId,
            inputTokens: inputTokens,
            outputTokens: outputTokens,
            cacheReadTokens: cacheReadTokens,
            cacheWriteTokens: cacheWriteTokens,
            pricingDate: pricingDate,
            modelsDevCatalog: nil,
            modelsDevCacheRoot: nil)
    }

    /// Full-fidelity variant taking the models.dev catalog (internal type).
    static func cost(
        for modelId: String,
        inputTokens: Int,
        outputTokens: Int,
        cacheReadTokens: Int,
        cacheWriteTokens: Int,
        pricingDate: Date?,
        modelsDevCatalog: ModelsDevCatalog?,
        modelsDevCacheRoot: URL?) -> Double
    {
        if modelId.hasPrefix("claude"),
           let upstream = CostUsagePricing.claudeCostUSD(
               model: modelId,
               inputTokens: inputTokens,
               cacheReadInputTokens: cacheReadTokens,
               cacheCreationInputTokens: cacheWriteTokens,
               outputTokens: outputTokens,
               pricingDate: pricingDate,
               modelsDevCatalog: modelsDevCatalog,
               modelsDevCacheRoot: modelsDevCacheRoot)
        {
            return upstream
        }

        let pricing = self.table.first { modelId.hasPrefix($0.modelId) } ?? self.fallback
        let perToken = 1.0 / 1_000_000
        let inputCost = Double(max(0, inputTokens)) * perToken * pricing.inputCostPerMillion
        let outputCost = Double(max(0, outputTokens)) * perToken * pricing.outputCostPerMillion
        let cacheReadCost = Double(max(0, cacheReadTokens)) * perToken
            * pricing.inputCostPerMillion * self.cacheReadRateMultiplier
        let cacheWriteCost = Double(max(0, cacheWriteTokens)) * perToken
            * pricing.inputCostPerMillion * self.cacheWriteRateMultiplier
        return inputCost + outputCost + cacheReadCost + cacheWriteCost
    }
}
