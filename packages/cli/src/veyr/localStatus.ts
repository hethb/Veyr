// CLI-computed fallback for `veyr status` when neither the daemon nor
// ~/.veyr/agent-status/VEYR_STATUS.json exists — i.e. the desktop app has
// never run on this machine. Derives a minimal VeyrStatus straight from the
// CLI's own session scanners (sessions.ts), so a CLI-only install still gets
// a live cost snapshot. App-computed sections that need the live tick
// (alerts, recommendations, tool/complexity analysis, budget caps) stay
// empty rather than being approximated.

import { readSessions, startOfMonth, startOfToday, totalSince, type CliSessionEntry } from "./sessions.js";
import { loadTagInferrer } from "./tags.js";
import type { VeyrStatus } from "./status.js";

/** Matches the app's notion of "a session is still going": activity within
 * the last 5 minutes. */
const ACTIVE_WITHIN_MS = 5 * 60 * 1000;

function currentSession(sessions: readonly CliSessionEntry[], now: Date): VeyrStatus["current_session"] {
  const newest = sessions[0];
  if (!newest) return undefined;
  const isActive = now.getTime() - newest.timestampMs <= ACTIVE_WITHIN_MS;
  const durationMinutes = Math.max(0, (newest.timestampMs - newest.startedAtMs) / 60_000);
  const cacheDenominator = newest.usage.inputTokens + newest.usage.cacheReadTokens;
  return {
    provider: newest.provider,
    model: newest.modelId,
    project: newest.featureTag,
    session_cost_usd: newest.usage.costUSD,
    input_tokens: newest.usage.inputTokens,
    output_tokens: newest.usage.outputTokens,
    cache_read_tokens: newest.usage.cacheReadTokens,
    cache_hit_rate: cacheDenominator > 0 ? newest.usage.cacheReadTokens / cacheDenominator : 0,
    session_duration_minutes: durationMinutes,
    cost_per_minute: durationMinutes > 0 ? newest.usage.costUSD / durationMinutes : 0,
    is_active: isActive,
  };
}

/** null when there are no local session logs at all — the caller reports
 * "missing" then, same as before this fallback existed. */
export async function computeLocalStatus(now: Date = new Date()): Promise<VeyrStatus | null> {
  const result = await readSessions();
  if (result.kind === "missing") return null;
  const sessions = result.sessions;

  const monthStart = startOfMonth(now);
  const projectTag = loadTagInferrer().inferTag(process.cwd());
  const projectMonth = totalSince(
    sessions.filter((session) => session.featureTag === projectTag),
    monthStart
  );

  return {
    generated_at: now.toISOString(),
    today_spent_usd: totalSince(sessions, startOfToday(now)).costUSD,
    current_session: currentSession(sessions, now),
    budget: {
      project_spent_this_month_usd: projectMonth.costUSD,
      global_spent_this_month_usd: totalSince(sessions, monthStart).costUSD,
    },
    alerts: [],
    recommendations: [],
    agent_instructions: "",
  };
}
