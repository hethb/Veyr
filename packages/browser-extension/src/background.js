// Veyr background service worker (MV3).
//
// Content scripts run in the page's origin (e.g. https://chatgpt.com) and can't
// fetch the proxy directly. The service worker can, using the extension's
// host_permissions, so content scripts and the popup message us and we proxy.
//
// Two responsibilities:
//   1. Read this key's stats from the proxy (/api/key-stats/*) so the popup and
//      overlay show the SAME numbers the dashboard does.
//   2. Reliably push every captured web-chat to /ingest/web-chat via a durable,
//      retried queue — so what you typed always ends up stored on the dashboard,
//      and the extension's counts converge with it instead of drifting.

const DEFAULT_BASE = "https://promptlens.fly.dev";

async function getBase() {
  try {
    const { proxyUrl } = await chrome.storage.local.get("proxyUrl");
    const v = typeof proxyUrl === "string" ? proxyUrl.trim().replace(/\/+$/, "") : "";
    return v || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

async function getKey() {
  try {
    const { veyrKey } = await chrome.storage.local.get("veyrKey");
    return typeof veyrKey === "string" ? veyrKey.trim() : "";
  } catch {
    return "";
  }
}

/**
 * GET against the proxy. Read paths under /api/stats/* are rewritten to the
 * key-authenticated /api/key-stats/* equivalents and carry the API key, so they
 * work on the hosted proxy (where /api/stats requires a dashboard session the
 * extension doesn't have) and stay scoped to this key's own data.
 */
async function fetchJson(path) {
  const base = await getBase();
  const key = await getKey();
  const realPath = path.startsWith("/api/stats/")
    ? path.replace("/api/stats/", "/api/key-stats/")
    : path;
  const headers = { accept: "application/json" };
  if (key) headers["x-veyr-key"] = key;
  const res = await fetch(`${base}${realPath}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * POST against the proxy (carries the API key). Used by the pre-send
 * personalization calls (personalized-suggest, suggestion-event,
 * prompt-revision). These live under /api/analysis, which needs a dashboard
 * session on the hosted proxy — so they succeed against a LOCAL proxy (desktop
 * app, anon allowed) and fail gracefully on hosted, where the overlay falls
 * back to its built-in local tips.
 */
async function postJson(path, body) {
  const base = await getBase();
  const key = await getKey();
  const headers = { accept: "application/json", "content-type": "application/json" };
  if (key) headers["x-veyr-key"] = key;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Durable ingest queue
//
// Persisted in chrome.storage.local so it survives service-worker shutdowns,
// page navigations, and browser restarts. Each captured send is enqueued at
// send time; we retry until the proxy accepts it (202) or it's permanently
// rejected. This is what keeps the dashboard consistent with the local count:
// nothing is fire-and-forget.
//   Job = { id, site, prompt, promptTokens, completionTokens, featureTag,
//           createdAt, holdUntil, attempts }
// ---------------------------------------------------------------------------

const QUEUE_KEY = "ingestQueue";
const SYNC_KEY = "ingestSync"; // { state: "ok"|"needs-key"|"offline"|"idle", at }
const CAPTURE_GRACE_MS = 50000; // wait for completion-token capture before flushing
const MAX_ATTEMPTS = 40;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function loadQueue() {
  try {
    const rec = await chrome.storage.local.get(QUEUE_KEY);
    const q = rec?.[QUEUE_KEY];
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}
async function saveQueue(q) {
  try { await chrome.storage.local.set({ [QUEUE_KEY]: q }); } catch { /* ignore */ }
}
async function setSync(state) {
  try { await chrome.storage.local.set({ [SYNC_KEY]: { state, at: Date.now() } }); } catch { /* ignore */ }
}
async function getSync() {
  try {
    const rec = await chrome.storage.local.get(SYNC_KEY);
    return rec?.[SYNC_KEY] || { state: "idle", at: 0 };
  } catch {
    return { state: "idle", at: 0 };
  }
}

async function enqueueIngest(entry) {
  const q = await loadQueue();
  const now = Date.now();
  q.push({
    id: entry.id,
    site: entry.site,
    prompt: String(entry.prompt || "").slice(0, 4000),
    promptTokens: Math.max(0, Number(entry.promptTokens) || 0),
    completionTokens: Math.max(0, Number(entry.completionTokens) || 0),
    featureTag: entry.site === "claude" ? "web-claude" : "web-chatgpt",
    createdAt: now,
    holdUntil: now + CAPTURE_GRACE_MS, // give the content script time to attach completion tokens
    attempts: 0,
  });
  await saveQueue(q);
  scheduleFlush();
}

/** Attach completion tokens captured after the response streamed, and release. */
async function attachCompletion(id, completionTokens) {
  const q = await loadQueue();
  const job = q.find((j) => j.id === id);
  if (!job) return;
  job.completionTokens = Math.max(0, Number(completionTokens) || 0);
  job.holdUntil = 0; // ready to send now
  await saveQueue(q);
  await flushQueue();
}

let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, 1500);
}

async function flushQueue() {
  const q = await loadQueue();
  if (q.length === 0) {
    await setSync("idle");
    return;
  }
  const base = await getBase();
  const key = await getKey();
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (key) headers["x-veyr-key"] = key;

  const now = Date.now();
  const remaining = [];
  let sentAny = false;
  let blocked = null; // "needs-key" | "offline"

  for (const job of q) {
    // Drop jobs that are too old to be worth retrying.
    if (now - job.createdAt > MAX_AGE_MS || job.attempts > MAX_ATTEMPTS) continue;
    // Respect the capture grace window unless we've stopped early for another reason.
    if (job.holdUntil > now) { remaining.push(job); continue; }
    // Once one job is blocked (no key / offline), stop hammering — keep the rest.
    if (blocked) { remaining.push(job); continue; }

    try {
      const res = await fetch(`${base}/ingest/web-chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          site: job.site,
          prompt: job.prompt,
          promptTokens: job.promptTokens,
          completionTokens: job.completionTokens,
          featureTag: job.featureTag,
        }),
      });
      if (res.status === 202 || res.ok) {
        sentAny = true;
        await markSynced(job.id);
        continue; // drop from queue
      }
      if (res.status === 401 || res.status === 403) {
        blocked = "needs-key";
        job.attempts += 1;
        remaining.push(job);
        continue;
      }
      if (res.status === 400) continue; // unrecoverable bad payload — drop
      job.attempts += 1; // 5xx etc — retry later
      remaining.push(job);
    } catch {
      blocked = "offline"; // network/host unreachable — keep everything, try later
      job.attempts += 1;
      remaining.push(job);
    }
  }

  await saveQueue(remaining);
  if (blocked) await setSync(blocked);
  else if (remaining.length === 0) await setSync(sentAny ? "ok" : "idle");
  else await setSync("ok"); // some sent, some still held in grace window
}

// ---------------------------------------------------------------------------
// Local usage log
//
// "What you typed in this browser" — survives restarts, shared across tabs.
//   { recent: Entry[], days: { "YYYY-MM-DD": { prompts, tokens } } }
//   Entry = { id, ts, site, tokens, chars, preview, synced }
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
  try { await chrome.storage.local.set({ [USAGE_KEY]: u }); } catch { /* ignore */ }
}

async function markSynced(id) {
  const u = await loadUsage();
  const row = (u.recent || []).find((e) => e.id === id);
  if (row && !row.synced) {
    row.synced = true;
    await saveUsage(u);
  }
}

async function logEntry(entry) {
  const ts = Date.now();
  const id = entry.id || `${ts}-${Math.random().toString(36).slice(2, 8)}`;
  const u = await loadUsage();
  const tokens = Math.max(0, Number(entry.tokens) || 0);
  const row = {
    id,
    ts,
    site: String(entry.site || "").slice(0, 16),
    tokens,
    chars: Math.max(0, Number(entry.chars) || 0),
    preview: String(entry.preview || "").slice(0, 140),
    synced: false,
  };
  u.recent = [row, ...(u.recent || [])].slice(0, MAX_RECENT);

  const key = dayKey(ts);
  const day = u.days[key] || { prompts: 0, tokens: 0 };
  day.prompts += 1;
  day.tokens += tokens;
  u.days[key] = day;

  const keys = Object.keys(u.days).sort();
  if (keys.length > MAX_DAYS) {
    for (const k of keys.slice(0, keys.length - MAX_DAYS)) delete u.days[k];
  }

  await saveUsage(u);
  return { id, summary: await summarize(u) };
}

async function summarize(u) {
  const now = Date.now();
  const todayKey = dayKey(now);
  const today = u.days[todayKey] || { prompts: 0, tokens: 0 };
  let last7 = { prompts: 0, tokens: 0 };
  for (let i = 0; i < 7; i++) {
    const k = dayKey(now - i * 86400000);
    const d = u.days[k];
    if (d) { last7.prompts += d.prompts; last7.tokens += d.tokens; }
  }
  const queue = await loadQueue();
  const sync = await getSync();
  return {
    today,
    last7,
    recent: (u.recent || []).slice(0, 25),
    pending: queue.length,
    sync: sync.state,
  };
}

// ---------------------------------------------------------------------------
// Messaging + periodic flush
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return false;

  if (msg.type === "veyr-fetch") {
    fetchJson(msg.path)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message) }));
    return true;
  }

  if (msg.type === "veyr-post") {
    postJson(msg.path, msg.body)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message) }));
    return true;
  }

  if (msg.type === "veyr-log") {
    logEntry(msg.entry || {})
      .then(({ id, summary }) => sendResponse({ ok: true, data: summary, id }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "veyr-ingest") {
    // Enqueue a durable job (id ties it to the local history row); retried until
    // the proxy accepts it. If completion tokens are supplied, release the hold.
    const e = msg.entry || {};
    (e.completionTokens != null && e.id
      ? attachCompletion(e.id, e.completionTokens)
      : enqueueIngest(e)
    )
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "veyr-usage") {
    loadUsage()
      .then((u) => summarize(u))
      .then((data) => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "veyr-flush") {
    flushQueue()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "veyr-clear") {
    Promise.all([saveUsage({ recent: [], days: {} }), saveQueue([]), setSync("idle")])
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});

// Retry the queue on a timer and whenever the worker spins up — the worker is
// ephemeral, so the alarm is what guarantees eventual delivery.
chrome.alarms.create("flush-ingest", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "flush-ingest") void flushQueue();
});
void flushQueue();
