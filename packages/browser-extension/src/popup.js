// PromptLens popup: shows proxy overview, local usage history, and lets you set
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

async function loadHistory() {
  const summary = await sendBg({ type: "promptlens-usage" });
  if (!summary) return;
  document.getElementById("h-today").textContent =
    `${summary.today.prompts} sent · ~${fmtTok(summary.today.tokens)} tok`;
  document.getElementById("h-week").textContent =
    `${summary.last7.prompts} sent · ~${fmtTok(summary.last7.tokens)} tok`;

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
  const overview = await proxyFetch("/api/stats/overview");
  if (!overview) {
    status.textContent =
      "Proxy offline. Run `npm run dev:proxy`, then reopen this popup.";
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
  input.value = proxyUrl || "http://localhost:3001";
  input.addEventListener("change", () => {
    chrome.storage.local.set({ proxyUrl: input.value.trim() }, load);
  });
}

initProxyInput();
initClear();
load();
loadHistory();
