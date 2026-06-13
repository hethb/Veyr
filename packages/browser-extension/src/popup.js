// Veyr popup: shows proxy overview, local usage history, and lets you set
// the proxy URL.

const fmtUsd = (n) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const fmtTok = (t) => (t >= 1000 ? `${(t / 1000).toFixed(1)}k` : `${t}`);

function sendBg(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        resolve(null);
        return;
      }
      resolve(resp.data);
    });
  });
}
const proxyFetch = (path) => sendBg({ type: "promptlens-fetch", path });

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

function relTime(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function syncLabel(s) {
  if (s.pending > 0) {
    if (s.sync === "needs-key") return `⚠ ${s.pending} pending — add your API key below`;
    if (s.sync === "offline") return `⏳ ${s.pending} pending — proxy unreachable, will retry`;
    return `⏳ syncing ${s.pending}…`;
  }
  return "✓ synced to dashboard";
}

async function loadHistory() {
  const summary = await sendBg({ type: "promptlens-usage" });
  if (!summary) return;
  document.getElementById("h-today").textContent =
    `${summary.today.prompts} sent · ~${fmtTok(summary.today.tokens)} tok`;
  document.getElementById("h-week").textContent =
    `${summary.last7.prompts} sent · ~${fmtTok(summary.last7.tokens)} tok`;
  const sync = document.getElementById("h-sync");
  if (sync) {
    sync.textContent = syncLabel(summary);
    sync.style.color = summary.pending > 0 && summary.sync === "needs-key" ? "#fbbf24" : "#6b7280";
  }

  const recent = document.getElementById("recent");
  if (!summary.recent.length) {
    recent.innerHTML = `<div class="muted" style="padding-top:6px">No prompts logged yet.</div>`;
    return;
  }
  recent.innerHTML = summary.recent
    .map(
      (e) => `
      <div class="entry">
        <div class="meta"><span>${escapeHtml(e.site)} · ~${fmtTok(e.tokens)} tok</span><span>${relTime(e.ts)}</span></div>
        <div class="text">${escapeHtml(e.preview || "(empty)")}</div>
      </div>`
    )
    .join("");
}

function initClear() {
  document.getElementById("clear").addEventListener("click", async () => {
    await sendBg({ type: "promptlens-clear" });
    loadHistory();
  });
}

async function load() {
  const status = document.getElementById("status");
  const stats = document.getElementById("stats");
  // Rewritten to /api/key-stats/overview by the background worker and scoped to
  // this key — so these figures match the dashboard for the same account.
  const overview = await proxyFetch("/api/stats/overview");
  if (!overview) {
    status.textContent =
      "Can't reach the proxy with this key. Check the Proxy URL and API key below.";
    status.style.display = "block";
    stats.style.display = "none";
    return;
  }
  status.style.display = "none";
  stats.style.display = "block";
  document.getElementById("today").textContent = fmtUsd(overview.today.cost);
  document.getElementById("week").textContent = fmtUsd(overview.week.cost);
  document.getElementById("month").textContent = fmtUsd(overview.month.cost);
}

async function initProxyInput() {
  const input = document.getElementById("proxy");
  const { proxyUrl } = await chrome.storage.local.get("proxyUrl");
  input.value = proxyUrl || "https://promptlens.fly.dev";
  input.addEventListener("change", () => {
    chrome.storage.local.set({ proxyUrl: input.value.trim() }, async () => {
      await sendBg({ type: "promptlens-flush" });
      load();
      loadHistory();
    });
  });
}

async function initKeyInput() {
  const input = document.getElementById("key");
  const { promptlensKey } = await chrome.storage.local.get("promptlensKey");
  input.value = promptlensKey || "";
  input.addEventListener("change", () => {
    chrome.storage.local.set({ promptlensKey: input.value.trim() }, async () => {
      // New key may unblock both reads and the pending ingest queue.
      await sendBg({ type: "promptlens-flush" });
      load();
      loadHistory();
    });
  });
}

async function initCanary() {
  const nameEl = document.getElementById("canary-name");
  const enabledEl = document.getElementById("canary-enabled");
  const { canaryName, canaryEnabled } = await chrome.storage.local.get([
    "canaryName",
    "canaryEnabled",
  ]);
  nameEl.value = canaryName || "";
  enabledEl.checked = Boolean(canaryEnabled);
  nameEl.addEventListener("change", () => {
    chrome.storage.local.set({ canaryName: nameEl.value.trim() });
  });
  enabledEl.addEventListener("change", () => {
    chrome.storage.local.set({ canaryEnabled: enabledEl.checked });
  });
}

initProxyInput();
initKeyInput();
initCanary();
initClear();
load();
loadHistory();
