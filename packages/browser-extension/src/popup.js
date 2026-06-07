// PromptLens popup: shows proxy overview and lets you set the proxy URL.

const fmtUsd = (n) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

function proxyFetch(path) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "promptlens-fetch", path }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        resolve(null);
        return;
      }
      resolve(resp.data);
    });
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
load();
