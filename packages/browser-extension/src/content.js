// PromptLens content overlay for ChatGPT and Claude.
//
// Web chats don't route through the PromptLens proxy, so this widget:
//   1. Estimates tokens/cost locally from the page (conversation + live draft).
//   2. Surfaces rule-based prompt-optimization tips as you type.
//   3. Pulls your real logged cost + top suggestion from the proxy when it's
//      reachable (via the background service worker).

(() => {
  "use strict";
  if (window.__promptlensInjected) return;
  window.__promptlensInjected = true;

  const SITE = location.hostname.includes("claude") ? "claude" : "chatgpt";

  // Rough heuristic: ~4 chars per token. Good enough for live estimates.
  const estimateTokens = (text) => (text ? Math.ceil(text.length / 4) : 0);

  // Approx input price per 1K tokens for the site's default frontier model.
  const PRICE_PER_1K = SITE === "claude" ? 0.003 : 0.0025; // Sonnet vs GPT-4o
  const fmtUsd = (n) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

  // ---- page scraping -------------------------------------------------------
  function getComposerText() {
    const candidates = [
      document.querySelector("#prompt-textarea"),
      document.querySelector("div.ProseMirror[contenteditable='true']"),
      document.querySelector("div[contenteditable='true']"),
      document.querySelector("textarea"),
    ];
    for (const el of candidates) {
      if (!el) continue;
      const text = "value" in el && el.value != null ? el.value : el.innerText;
      if (typeof text === "string") return text.trim();
    }
    return "";
  }

  function getConversationText() {
    const selectors =
      SITE === "claude"
        ? ["[data-testid='user-message']", ".font-claude-message"]
        : ["[data-message-author-role]"];
    let parts = [];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length) parts = [...nodes].map((n) => n.innerText || "");
      if (parts.length) break;
    }
    return parts.join("\n");
  }

  // ---- tips engine ---------------------------------------------------------
  function buildTips(draft) {
    const tips = [];
    const lower = draft.toLowerCase();
    const draftTokens = estimateTokens(draft);

    if (/\b(please|kindly|could you|would you|feel free to)\b/.test(lower)) {
      tips.push("Drop politeness filler (\"please\", \"could you\") — models don't need it.");
    }
    if (/\b(very|really|just|basically|actually|simply|in order to)\b/.test(lower)) {
      tips.push("Remove hedging/filler words (\"very\", \"just\", \"in order to\").");
    }
    if (/you are an? (ai|helpful) (assistant|language model)/.test(lower)) {
      tips.push("Trim the \"You are an AI assistant…\" boilerplate to one line.");
    }
    if (/\n\s*\n\s*\n/.test(draft)) {
      tips.push("Collapse repeated blank lines to shrink the prompt.");
    }
    if (draftTokens > 1500) {
      tips.push(`This prompt is ~${draftTokens} tokens — consider splitting or summarizing context.`);
    }
    return tips;
  }

  // ---- proxy data ----------------------------------------------------------
  function proxyFetch(path) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "promptlens-fetch", path }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            resolve(null);
            return;
          }
          resolve(resp.data);
        });
      } catch {
        resolve(null);
      }
    });
  }

  // ---- UI ------------------------------------------------------------------
  const panel = document.createElement("div");
  panel.id = "promptlens-panel";
  panel.innerHTML = `
    <div class="pl-head">
      <span class="pl-logo">PL</span>
      <span class="pl-title">PromptLens</span>
      <button class="pl-min" title="Minimize">–</button>
    </div>
    <div class="pl-body">
      <div class="pl-row"><span>Conversation</span><b id="pl-conv">0</b></div>
      <div class="pl-row"><span>Your draft</span><b id="pl-draft">0</b></div>
      <div class="pl-row pl-total"><span>Est. input cost</span><b id="pl-cost">$0.00</b></div>
      <div class="pl-tips" id="pl-tips"></div>
      <div class="pl-proxy" id="pl-proxy">
        <div class="pl-proxy-head">Your PromptLens proxy</div>
        <div class="pl-proxy-body" id="pl-proxy-body">Checking…</div>
      </div>
    </div>`;
  const bubble = document.createElement("button");
  bubble.id = "promptlens-bubble";
  bubble.textContent = "PL";
  bubble.title = "Open PromptLens";
  document.documentElement.appendChild(panel);
  document.documentElement.appendChild(bubble);

  const $ = (id) => panel.querySelector(id);
  let minimized = localStorage.getItem("promptlens-min") === "1";
  function applyMin() {
    panel.style.display = minimized ? "none" : "block";
    bubble.style.display = minimized ? "flex" : "none";
  }
  applyMin();
  panel.querySelector(".pl-min").addEventListener("click", () => {
    minimized = true;
    localStorage.setItem("promptlens-min", "1");
    applyMin();
  });
  bubble.addEventListener("click", () => {
    minimized = false;
    localStorage.setItem("promptlens-min", "0");
    applyMin();
    refreshProxy();
  });

  function updateLocal() {
    const draft = getComposerText();
    const conv = getConversationText();
    const draftTokens = estimateTokens(draft);
    const convTokens = estimateTokens(conv);
    const inputTokens = draftTokens + convTokens;

    $("#pl-conv").textContent = `${convTokens.toLocaleString()} tok`;
    $("#pl-draft").textContent = `${draftTokens.toLocaleString()} tok`;
    $("#pl-cost").textContent = fmtUsd((inputTokens / 1000) * PRICE_PER_1K);

    const tips = buildTips(draft);
    const tipsEl = $("#pl-tips");
    if (tips.length === 0) {
      tipsEl.innerHTML = `<div class="pl-tip pl-ok">No obvious waste in your draft.</div>`;
    } else {
      tipsEl.innerHTML = tips
        .map((t) => `<div class="pl-tip">• ${escapeHtml(t)}</div>`)
        .join("");
    }
  }

  async function refreshProxy() {
    const body = $("#pl-proxy-body");
    const [overview, suggestions] = await Promise.all([
      proxyFetch("/api/stats/overview"),
      proxyFetch("/api/analysis/suggestions"),
    ]);
    if (!overview) {
      body.innerHTML = `<span class="pl-muted">Proxy offline. Start it to see real spend &amp; suggestions.</span>`;
      return;
    }
    const top = Array.isArray(suggestions)
      ? suggestions.find((s) => s.quick_win) || suggestions[0]
      : null;
    body.innerHTML = `
      <div class="pl-row"><span>Today</span><b>${fmtUsd(overview.today.cost)}</b></div>
      <div class="pl-row"><span>This month</span><b>${fmtUsd(overview.month.cost)}</b></div>
      ${
        top
          ? `<div class="pl-sugg">${top.quick_win ? "⚡ " : ""}${escapeHtml(top.title)}${
              top.impact_usd > 0 ? ` <span class="pl-save">save ~${fmtUsd(top.impact_usd)}/mo</span>` : ""
            }</div>`
          : `<div class="pl-muted">No suggestions yet.</div>`
      }`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  document.addEventListener("input", updateLocal, true);
  document.addEventListener("keyup", updateLocal, true);
  setInterval(updateLocal, 1500);
  updateLocal();
  refreshProxy();
  setInterval(refreshProxy, 30000);
})();
