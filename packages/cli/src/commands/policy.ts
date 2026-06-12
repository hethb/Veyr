import chalk from "chalk";
import Table from "cli-table3";
import { apiGet, apiSend, resolveApiKeyId, CliError, type FeaturePolicy } from "../api.js";

const dash = (): string => chalk.dim("-");

export async function policyListCommand(): Promise<void> {
  const apiKeyId = await resolveApiKeyId();
  const policies = await apiGet<FeaturePolicy[]>(
    `/api/policies?api_key_id=${encodeURIComponent(apiKeyId)}`
  );

  console.log(chalk.bold("Feature Policies"));
  if (policies.length === 0) {
    console.log(chalk.dim("No policies yet. Create one with: canopy policy set <feature-tag>"));
    return;
  }

  const table = new Table({
    head: ["Feature Tag", "Budget Cap", "Fallback Model", "Max Tokens", "Rate Limit", "Cache"],
    style: { head: [] }, // theme-neutral: no forced head color
  });
  for (const p of policies) {
    table.push([
      p.feature_tag,
      p.monthly_budget_usd !== null ? `$${p.monthly_budget_usd}/mo` : dash(),
      p.fallback_model ?? dash(),
      p.max_completion_tokens !== null ? String(p.max_completion_tokens) : dash(),
      p.rate_limit_per_minute !== null ? `${p.rate_limit_per_minute}/min` : dash(),
      p.enable_prompt_caching ? chalk.green("on") : dash(),
    ]);
  }
  console.log(table.toString());
}

export interface PolicySetOptions {
  budget?: string;
  model?: string;
  maxTokens?: string;
  rateLimit?: string;
  cache?: string;
}

function parseNum(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new CliError(chalk.red(`✗ ${flag} must be a positive number (got "${value}")`));
  }
  return n;
}

export async function policySetCommand(
  featureTag: string,
  opts: PolicySetOptions
): Promise<void> {
  if (!opts.budget && !opts.model && !opts.maxTokens && !opts.rateLimit && opts.cache === undefined) {
    throw new CliError(
      chalk.red("✗ Nothing to set.") +
        " Pass at least one of --budget, --model, --max-tokens, --rate-limit, --cache"
    );
  }

  const apiKeyId = await resolveApiKeyId();

  // The PUT replaces the whole policy row, so merge with any existing policy
  // to avoid wiping fields the user didn't pass this time.
  const existingAll = await apiGet<FeaturePolicy[]>(
    `/api/policies?api_key_id=${encodeURIComponent(apiKeyId)}`
  );
  const existing = existingAll.find((p) => p.feature_tag === featureTag) ?? null;
  if (!existing) {
    // Unknown tags are allowed (the policy applies once traffic appears) —
    // warn so typos are noticed.
    const known = new Set(existingAll.map((p) => p.feature_tag));
    if (!known.has(featureTag)) {
      console.log(
        chalk.yellow(`⚠ No existing policy for "${featureTag}" — creating a new one.`)
      );
    }
  }

  const cache =
    opts.cache === undefined ? undefined : /^(true|1|yes|on)$/i.test(opts.cache);

  const payload = {
    api_key_id: apiKeyId,
    feature_tag: featureTag,
    monthly_budget_usd: opts.budget
      ? parseNum(opts.budget, "--budget")
      : existing?.monthly_budget_usd ?? null,
    fallback_model: opts.model ?? existing?.fallback_model ?? null,
    max_completion_tokens: opts.maxTokens
      ? Math.trunc(parseNum(opts.maxTokens, "--max-tokens"))
      : existing?.max_completion_tokens ?? null,
    rate_limit_per_minute: opts.rateLimit
      ? Math.trunc(parseNum(opts.rateLimit, "--rate-limit"))
      : existing?.rate_limit_per_minute ?? null,
    enable_prompt_caching: cache ?? existing?.enable_prompt_caching ?? false,
    compress_prompts: existing?.compress_prompts ?? false,
  };

  const saved = await apiSend<FeaturePolicy>("PUT", "/api/policies", payload);

  console.log(chalk.green(`✓ Policy updated for "${saved.feature_tag}"`));
  if (saved.monthly_budget_usd !== null)
    console.log(`  Budget cap: $${saved.monthly_budget_usd}/mo`);
  if (saved.fallback_model) console.log(`  Fallback model: ${saved.fallback_model}`);
  if (saved.max_completion_tokens !== null)
    console.log(`  Max tokens: ${saved.max_completion_tokens}`);
  if (saved.rate_limit_per_minute !== null)
    console.log(`  Rate limit: ${saved.rate_limit_per_minute}/min`);
  if (saved.enable_prompt_caching) console.log("  Prompt caching: on");
}
