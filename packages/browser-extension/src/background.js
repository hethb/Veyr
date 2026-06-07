// PromptLens background service worker (MV3).
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

async function fetchJson(path) {
  const base = await getBase();
  const res = await fetch(`${base}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "promptlens-fetch") return false;

  fetchJson(msg.path)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err && err.message) }));

  // Keep the message channel open for the async response.
  return true;
});
