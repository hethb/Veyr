// Canopy background service worker (MV3).
//
// Content scripts run in the page's origin (e.g. https://chatgpt.com) and can't
// fetch http://localhost:3001 directly (mixed content). The service worker can,
// because it uses the extension's host_permissions. Content scripts and the
// popup message us; we proxy the request and return JSON.

const DEFAULT_BASE = "http://localhost:3001";

async function getBase() {
  try {
    const { proxyUrl } = await chrome.storage.local.get("proxyUrl");
    return typeof proxyUrl === "string" && proxyUrl ? proxyUrl : DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

async function getKey() {
  try {
    const { promptlensKey } = await chrome.storage.local.get("promptlensKey");
    return typeof promptlensKey === "string" ? promptlensKey.trim() : "";
  } catch {
    return "";
  }
}

async function fetchJson(path) {
  const base = await getBase();
  const res = await fetch(`${base}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Forward a web-chat send to the proxy so it lands in the dashboard. Fully
 * silent on failure — the proxy might be offline (local dev) or unreachable
 * (hosted), and the user's chat must never be blocked by us. Called by the
 * content script AFTER its MutationObserver has captured the assistant
 * response, so we have both prompt and completion token counts.
 */
async function ingestWebChat(entry) {
  try {
    const base = await getBase();
    const key = await getKey();
    const headers = { "content-type": "application/json", accept: "application/json" };
    if (key) headers["x-promptlens-key"] = key;
    await fetch(`${base}/ingest/web-chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        site: entry.site,
        prompt: entry.prompt || entry.preview || "",
        promptTokens: entry.promptTokens ?? entry.tokens ?? 0,
        completionTokens: entry.completionTokens ?? 0,
        featureTag: entry.site === "claude" ? "web-claude" : "web-chatgpt",
      }),
    });
  } catch {
    /* proxy offline or unreachable — fine, history is still kept locally */
  }
}

// ---------------------------------------------------------------------------
// Local usage log
//
// Persisted in chrome.storage.local so chat/token history survives page
// refreshes, new tabs, and browser restarts (it's shared across all tabs).
// Shape: { recent: Entry[], days: { "YYYY-MM-DD": { prompts, tokens } } }
//   Entry = { ts, site, tokens, chars, preview }
// ---------------------------------------------------------------------------

const USAGE_KEY = "usageLog";
const MAX_RECENT = 200;
const MAX_DAYS = 90;

function dayKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function loadUsage() {
  try {
    const rec = await chrome.storage.local.get(USAGE_KEY);
    const u = rec?.[USAGE_KEY];
    return u && typeof u === "object" ? u : { recent: [], days: {} };
  } catch {
    return { recent: [], days: {} };
  }
}

async function saveUsage(u) {
  try {
    await chrome.storage.local.set({ [USAGE_KEY]: u });
  } catch {
    /* storage full / unavailable — ignore */
  }
}

async function logEntry(entry) {
  const ts = Date.now();
  const u = await loadUsage();
  const tokens = Math.max(0, Number(entry.tokens) || 0);
  const row = {
    ts,
    site: String(entry.site || "").slice(0, 16),
    tokens,
    chars: Math.max(0, Number(entry.chars) || 0),
    preview: String(entry.preview || "").slice(0, 140),
  };
  u.recent = [row, ...(u.recent || [])].slice(0, MAX_RECENT);

  const key = dayKey(ts);
  const day = u.days[key] || { prompts: 0, tokens: 0 };
  day.prompts += 1;
  day.tokens += tokens;
  u.days[key] = day;

  // Trim old days.
  const keys = Object.keys(u.days).sort();
  if (keys.length > MAX_DAYS) {
    for (const k of keys.slice(0, keys.length - MAX_DAYS)) delete u.days[k];
  }

  await saveUsage(u);
  // NOTE: we no longer auto-ingest here. The content script triggers ingest
  // explicitly (via `promptlens-ingest`) once the assistant response has
  // stabilized — giving the proxy accurate prompt + completion tokens.
  return summarize(u);
}

function summarize(u) {
  const now = Date.now();
  const todayKey = dayKey(now);
  const today = u.days[todayKey] || { prompts: 0, tokens: 0 };
  let last7 = { prompts: 0, tokens: 0 };
  for (let i = 0; i < 7; i++) {
    const k = dayKey(now - i * 86400000);
    const d = u.days[k];
    if (d) {
      last7.prompts += d.prompts;
      last7.tokens += d.tokens;
    }
  }
  return { today, last7, recent: (u.recent || []).slice(0, 25) };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return false;

  if (msg.type === "promptlens-fetch") {
    fetchJson(msg.path)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message) }));
    return true;
  }

  if (msg.type === "promptlens-log") {
    logEntry(msg.entry || {})
      .then((summary) => sendResponse({ ok: true, data: summary }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "promptlens-ingest") {
    // Fire-and-forget; we don't block the content script on proxy availability.
    void ingestWebChat(msg.entry || {});
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "promptlens-usage") {
    loadUsage()
      .then((u) => sendResponse({ ok: true, data: summarize(u) }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "promptlens-clear") {
    saveUsage({ recent: [], days: {} })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});
