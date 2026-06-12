// Canopy content overlay for ChatGPT and Claude.
//
// Web chats don't route through the Canopy proxy, so this widget:
//   1. Estimates tokens/cost locally from the page (conversation + live draft).
//   2. Surfaces rule-based prompt suggestions as you type.
//   3. Intercepts the send action (Enter / send button) to review and improve
//      the prompt *before* it's sent — inspired by the TokenGuard approach.
//   4. Pulls your real logged cost from the proxy when it's reachable.
//
// Rendering lives in a Shadow DOM so the host page's CSS can't hide or restyle
// it (the main reason a light-DOM overlay silently fails on ChatGPT/Claude).

(() => {
  "use strict";
  if (window.__promptlensInjected) return;
  window.__promptlensInjected = true;

  const SITE = location.hostname.includes("claude") ? "claude" : "chatgpt";
  const estimateTokens = (text) => (text ? Math.ceil(text.length / 4) : 0);
  const PRICE_PER_1K = SITE === "claude" ? 0.003 : 0.0025; // Sonnet vs GPT-4o
  const fmtUsd = (n) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

  // ---- platform adapters ---------------------------------------------------
  // Defensive selectors: ChatGPT/Claude change class names often, so prefer
  // ids, ARIA roles, and data-testid attributes.
  const PLATFORMS = {
    chatgpt: {
      name: "ChatGPT",
      findInput() {
        return (
          document.querySelector("#prompt-textarea") ||
          document.querySelector('textarea[data-id="root"]') ||
          document.querySelector('textarea[placeholder*="Message" i]') ||
          document.querySelector('div.ProseMirror[contenteditable="true"]')
        );
      },
      findSend() {
        return (
          document.querySelector('button[data-testid="send-button"]') ||
          document.querySelector('button[aria-label*="Send" i]:not([disabled])')
        );
      },
      conversationSelectors: ["[data-message-author-role]"],
      assistantSelectors: ['[data-message-author-role="assistant"]'],
    },
    claude: {
      name: "Claude",
      findInput() {
        return (
          document.querySelector('div[contenteditable="true"][data-testid="chat-input"]') ||
          document.querySelector('div.ProseMirror[contenteditable="true"]') ||
          document.querySelector('div[contenteditable="true"]')
        );
      },
      findSend() {
        return (
          document.querySelector('button[aria-label="Send Message"]') ||
          document.querySelector('button[aria-label*="Send" i]:not([disabled])')
        );
      },
      conversationSelectors: ["[data-testid='user-message']", ".font-claude-message"],
      // Claude wraps each assistant turn in `.font-claude-message`; the legacy
      // `[data-testid="claude-message"]` covers older layouts.
      assistantSelectors: ['.font-claude-message', '[data-testid="claude-message"]'],
    },
  };
  const P = PLATFORMS[SITE];

  function readInput(el) {
    if (!el) return "";
    const text = "value" in el && el.value != null ? el.value : el.innerText;
    return typeof text === "string" ? text.trim() : "";
  }
  const getComposerText = () => readInput(P.findInput());

  function getConversationText() {
    let parts = [];
    for (const sel of P.conversationSelectors) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length) {
        parts = [...nodes].map((n) => n.innerText || "");
        break;
      }
    }
    return parts.join("\n");
  }

  // ---- tips engine ---------------------------------------------------------
  const FILE_RE = /\b[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|c|cpp|h|cs|css|scss|html|json|ya?ml|md|sql|sh)\b/i;
  const CODING_RE = /\b(fix|add|implement|refactor|debug|update|change|create|build|write|optimi|remove|delete|rename|migrate|handle|wire)\b/i;
  const VAGUE_SCOPE_RE = /\b(whole|entire|all (the )?|every|across the)\s*(code|codebase|repo|repository|project|files?|thing|app|application)\b|\beverything\b|\bthe codebase\b|\bread (all|the) files?\b|\blook through\b/i;
  const ACCEPTANCE_RE = /\b(should|so that|expected|must|done when|returns?|output|pass(es|ing)?|test)\b/i;
  const POLITENESS_RE = /\b(please|kindly|could you|would you|feel free to|if you could|i was wondering|i want you to|i would like|can you|thanks in advance|hello|hi there)\b/i;
  const HEDGE_RE = /\b(very|really|just|basically|actually|simply|in order to|kind of|sort of|maybe|perhaps)\b/i;
  const GENERATION_RE = /\b(write|generate|explain|describe|summari[sz]e|list|create|draft|give me|tell me|compare|analy[sz]e|review|outline|document)\b/i;
  const CONSTRAINT_RE = /(\b\d+\s*(word|words|bullet|bullets|line|lines|sentence|sentences|paragraph|paragraphs|item|items|step|steps)\b|\bconcise\b|\bbrief(ly)?\b|\bshort\b|\btl;?dr\b|\bone[- ]?liner\b|\bin \d+\b|\bbullet points?\b|\bas a table\b|\bno (preamble|explanation|prose)\b)/i;
  const VAGUE_START_RE = /^\s*(fix|improve|optimi[sz]e|clean ?up|refactor|enhance|polish|tidy|make .* better|debug|sort out)\b/i;

  // `convTokens` lets us flag a bloated chat (whole history is re-sent each turn).
  function buildTips(draft, convTokens) {
    const tips = [];
    const lower = draft.toLowerCase();
    const tokens = estimateTokens(draft);
    const words = draft.split(/\s+/).filter(Boolean).length;
    const hasFile = FILE_RE.test(draft) || /(^|\s)[\w-]+\/[\w./-]+/.test(draft);
    const isCoding = CODING_RE.test(lower);
    const tasks = Math.max(
      (draft.match(/^\s*([-*]|\d+\.)\s+/gm) || []).length,
      (draft.match(/\b(and then|then|also|additionally)\b/gi) || []).length + 1
    );

    if (VAGUE_START_RE.test(draft) && (!hasFile || words <= 12)) {
      tips.push("Too vague — name the exact symptom, file, and function instead of \"fix the bug\".");
    }
    if (isCoding && !hasFile) {
      tips.push("Name the exact file(s) — e.g. \"in src/auth.ts\" — so it doesn't hunt the repo.");
    }
    if (VAGUE_SCOPE_RE.test(lower)) {
      tips.push("Never say \"the whole codebase\" — paste only the relevant functions/files.");
    }
    if (GENERATION_RE.test(lower) && !CONSTRAINT_RE.test(lower) && words >= 5) {
      tips.push("Cap the output: add \"in 3 bullets\", \"under 150 words\", or \"code only\".");
    }
    if (isCoding && !ACCEPTANCE_RE.test(lower)) {
      tips.push("Say what \"done\" looks like (e.g. \"the login test passes\").");
    }
    if (tasks >= 2 || words > 120) {
      tips.push("Split this into smaller tasks — big prompts balloon context and cost.");
    }
    if (POLITENESS_RE.test(lower) || HEDGE_RE.test(lower)) {
      tips.push("Cut the filler — drop \"please/could you\" and \"just/really\". Be direct.");
    }
    if (convTokens && convTokens > 6000) {
      tips.push(`This chat is ~${Math.round(convTokens / 1000)}k tokens — the whole history re-sends every message. Start a new chat for unrelated tasks, or ask for a summary and paste it into a fresh one.`);
    }
    if (isCoding && tasks <= 1 && words <= 80) {
      tips.push("Simple change — a cheaper model (Sonnet/Haiku) is plenty.");
    }
    if (tokens > 800) {
      tips.push(`~${tokens} tokens — move repeated rules to CLAUDE.md / Custom Instructions instead of re-sending.`);
    }
    return tips.slice(0, 6);
  }

  function buildTemplate(draft) {
    const files = [];
    const re = new RegExp(FILE_RE.source, "gi");
    let m;
    while ((m = re.exec(draft)) !== null) files.push(m[0]);
    const fileLine = files.length ? [...new Set(files)].slice(0, 5).join(", ") : "<exact path, e.g. src/auth.ts>";
    const first = (draft.split(/\n/)[0] || "").slice(0, 120) || "<one specific change>";
    return [
      `Task: ${first}`,
      `File(s): ${fileLine}`,
      `Context: <paste only the relevant function(s) — don't ask it to scan the repo>`,
      `Constraints: Make the smallest change that works. Don't read unrelated files.`,
      `Done when: <how you'll verify it's correct>`,
    ].join("\n");
  }

  // ---- background messaging ------------------------------------------------
  function sendBg(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (resp) => {
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
  const proxyFetch = (path) => sendBg({ type: "promptlens-fetch", path });

  // ---- local usage log -----------------------------------------------------
  let lastLoggedAt = 0;
  async function logSend(draft) {
    const text = (draft || "").trim();
    if (!text) return;
    // Guard against double-logging the same send within a short window.
    const now = Date.now();
    if (now - lastLoggedAt < 1200) return;
    lastLoggedAt = now;
    const promptTokens = estimateTokens(text);
    const summary = await sendBg({
      type: "promptlens-log",
      entry: {
        site: SITE,
        tokens: promptTokens,
        chars: text.length,
        preview: text.slice(0, 140),
      },
    });
    if (summary) renderHistory(summary);

    // Kick off response capture in the background. Once the assistant message
    // stops growing, we ingest a single proxy row with both prompt and
    // completion tokens — gives the dashboard accurate cost, not just input.
    captureAssistantResponse((completionText) => {
      const completionTokens = estimateTokens(completionText);
      void sendBg({
        type: "promptlens-ingest",
        entry: {
          site: SITE,
          prompt: text.slice(0, 4000),
          promptTokens,
          completionTokens,
          preview: text.slice(0, 140),
        },
      });
    });
  }

  // ---- assistant-response capture ------------------------------------------
  //
  // After we log a send, the LLM's response streams into the DOM. We watch the
  // assistant message that didn't exist before we sent, debounce on its text
  // length stabilizing (1.5s of no change), and call back with the final text.
  // Hard timeout caps wait at 45s so a never-finishing response can't pile up
  // dangling observers.
  function captureAssistantResponse(onComplete) {
    const selectors = P.assistantSelectors || [];
    if (selectors.length === 0) {
      onComplete("");
      return;
    }

    // Snapshot existing assistant messages so we only watch the new one(s).
    const existing = new Set();
    for (const sel of selectors) {
      for (const node of document.querySelectorAll(sel)) existing.add(node);
    }

    let lastText = "";
    let lastChangedAt = Date.now();
    let resolved = false;
    const STABLE_MS = 1500;
    const HARD_TIMEOUT_MS = 45000;
    const POLL_MS = 400;

    const observer = new MutationObserver(() => {
      if (resolved) return;
      let combined = "";
      for (const sel of selectors) {
        for (const node of document.querySelectorAll(sel)) {
          if (existing.has(node)) continue;
          combined += (node.innerText || "") + "\n";
        }
      }
      const text = combined.trim();
      if (text && text !== lastText) {
        lastText = text;
        lastChangedAt = Date.now();
      }
    });

    try {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } catch {
      onComplete("");
      return;
    }

    const poll = setInterval(() => {
      if (resolved) return;
      if (lastText && Date.now() - lastChangedAt > STABLE_MS) finish(lastText);
    }, POLL_MS);

    const hard = setTimeout(() => finish(lastText), HARD_TIMEOUT_MS);

    function finish(text) {
      if (resolved) return;
      resolved = true;
      try { observer.disconnect(); } catch { /* ignore */ }
      clearInterval(poll);
      clearTimeout(hard);
      onComplete(text || "");
    }
  }

  const fmtTok = (t) => (t >= 1000 ? `${(t / 1000).toFixed(1)}k` : `${t}`);
  function renderHistory(s) {
    if (!s) return;
    $("#pl-h-today").textContent = `${s.today.prompts} sent · ~${fmtTok(s.today.tokens)} tok`;
    $("#pl-h-week").textContent = `${s.last7.prompts} sent · ~${fmtTok(s.last7.tokens)} tok`;
  }
  async function refreshHistory() {
    renderHistory(await sendBg({ type: "promptlens-usage" }));
  }

  // ---- styles (scoped to shadow root) --------------------------------------
  const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .pl-panel {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 290px;
    color: #e5e5e5; background: rgba(10,10,12,0.96);
    border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5); backdrop-filter: blur(8px); overflow: hidden;
  }
  .pl-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .pl-logo { display: grid; place-items: center; width: 20px; height: 20px; font-size: 10px; font-weight: 700; color: #4fabff; border: 1px solid #076eff; border-radius: 4px; }
  .pl-title { font-size: 13px; font-weight: 600; flex: 1; }
  .pl-min { all: unset; cursor: pointer; color: #9ca3af; font-size: 16px; line-height: 1; padding: 0 4px; }
  .pl-min:hover { color: #fff; }
  .pl-body { padding: 10px 12px 12px; }
  .pl-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 3px 0; color: #9ca3af; }
  .pl-row b { color: #f3f4f6; font-weight: 600; }
  .pl-total { margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); }
  .pl-total b { color: #34d399; }
  .pl-tips-head { margin-top: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #4fabff; }
  .pl-tips { margin-top: 4px; }
  .pl-tip { font-size: 11.5px; line-height: 1.45; color: #d1d5db; padding: 2px 0; }
  .pl-tip.pl-ok { color: #6b7280; }
  .pl-proxy { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); }
  .pl-proxy-head { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #4fabff; margin-bottom: 4px; }
  .pl-muted { color: #6b7280; font-size: 11.5px; }
  .pl-sugg { margin-top: 6px; font-size: 11.5px; line-height: 1.4; color: #e5e7eb; }
  .pl-save { color: #34d399; }
  .pl-hist { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); }
  .pl-hist-head { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #4fabff; margin-bottom: 4px; }
  .pl-bubble {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 40px; height: 40px;
    border-radius: 50%; border: 1px solid #076eff; background: rgba(10,10,12,0.96); color: #4fabff;
    font-weight: 700; font-size: 13px; cursor: pointer; display: none; align-items: center; justify-content: center;
    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  }
  /* pre-send modal */
  .pl-modal { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; }
  .pl-card { width: min(560px, 92vw); max-height: 82vh; display: flex; flex-direction: column; overflow: hidden; color: #e5e5e5; background: #14161c; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,0.6); }
  .pl-card-head { padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .pl-card-title { font-size: 15px; font-weight: 600; color: #fff; }
  .pl-card-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
  .pl-card-body { padding: 14px 18px; overflow: auto; }
  .pl-msug { display: flex; gap: 8px; padding: 8px 10px; margin-bottom: 8px; font-size: 13px; line-height: 1.45; color: #e5e7eb; background: rgba(79,124,255,0.08); border: 1px solid rgba(79,124,255,0.22); border-radius: 8px; }
  .pl-msug::before { content: "→"; color: #4fabff; }
  .pl-tmpl-head { margin-top: 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #4fabff; display: flex; justify-content: space-between; align-items: center; }
  .pl-tmpl { margin-top: 6px; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; color: #cbd1da; background: rgba(7,110,255,0.06); border: 1px solid rgba(7,110,255,0.25); border-radius: 8px; }
  .pl-card-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid rgba(255,255,255,0.08); background: #101218; }
  .pl-btn { cursor: pointer; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 500; color: #e5e5e5; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); }
  .pl-btn:hover { background: rgba(255,255,255,0.12); }
  .pl-btn.primary { background: #076eff; border-color: #076eff; color: #fff; }
  .pl-btn.primary:hover { background: #2b85ff; }
  .pl-btn.copy { font-size: 11px; padding: 3px 8px; }
  `;

  // ---- mount UI in shadow root --------------------------------------------
  const host = document.createElement("div");
  host.id = "promptlens-host";
  (document.body || document.documentElement).appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  shadow.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "pl-panel";
  panel.innerHTML = `
    <div class="pl-head">
      <span class="pl-logo">PL</span>
      <span class="pl-title">Canopy</span>
      <button class="pl-min" title="Minimize">–</button>
    </div>
    <div class="pl-body">
      <div class="pl-row"><span>Conversation</span><b id="pl-conv">0</b></div>
      <div class="pl-row"><span>Your draft</span><b id="pl-draft">0</b></div>
      <div class="pl-row pl-total"><span>Est. input cost</span><b id="pl-cost">$0.00</b></div>
      <div class="pl-tips-head">Improve your prompt</div>
      <div class="pl-tips" id="pl-tips"></div>
      <div class="pl-hist">
        <div class="pl-hist-head">Your history (this browser)</div>
        <div class="pl-row"><span>Today</span><b id="pl-h-today">0 sent</b></div>
        <div class="pl-row"><span>Last 7 days</span><b id="pl-h-week">0 sent</b></div>
      </div>
      <div class="pl-proxy" id="pl-proxy">
        <div class="pl-proxy-head">Your Canopy proxy</div>
        <div class="pl-proxy-body" id="pl-proxy-body">Checking…</div>
      </div>
    </div>`;
  const bubble = document.createElement("button");
  bubble.className = "pl-bubble";
  bubble.textContent = "PL";
  bubble.title = "Open Canopy";
  shadow.appendChild(panel);
  shadow.appendChild(bubble);

  const $ = (sel) => shadow.querySelector(sel);
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  function updateLocal() {
    const draft = getComposerText();
    const conv = getConversationText();
    const draftTokens = estimateTokens(draft);
    const convTokens = estimateTokens(conv);

    $("#pl-conv").textContent = `${convTokens.toLocaleString()} tok`;
    $("#pl-draft").textContent = `${draftTokens.toLocaleString()} tok`;
    $("#pl-cost").textContent = fmtUsd(((draftTokens + convTokens) / 1000) * PRICE_PER_1K);

    const tips = buildTips(draft, convTokens);
    const tipsEl = $("#pl-tips");
    if (!draft) {
      tipsEl.innerHTML = `<div class="pl-tip pl-ok">Start typing — suggestions appear here.</div>`;
    } else if (tips.length === 0) {
      tipsEl.innerHTML = `<div class="pl-tip pl-ok">Looks tight — no obvious waste.</div>`;
    } else {
      tipsEl.innerHTML = tips.map((t) => `<div class="pl-tip">• ${escapeHtml(t)}</div>`).join("");
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

  // ---- pre-send interception ----------------------------------------------
  let bypassNext = false;

  function isComposerFocused(input) {
    if (!input) return false;
    const active = document.activeElement;
    return active === input || input.contains(active);
  }

  function triggerSend() {
    bypassNext = true;
    const btn = P.findSend();
    if (btn) {
      btn.click();
    } else {
      const input = P.findInput();
      if (input) {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
        );
      }
    }
    setTimeout(() => {
      bypassNext = false;
    }, 600);
  }

  function showReview(draft, convTokens) {
    return new Promise((resolve) => {
      const tips = buildTips(draft, convTokens);
      const overlay = document.createElement("div");
      overlay.className = "pl-modal";
      overlay.innerHTML = `
        <div class="pl-card">
          <div class="pl-card-head">
            <div class="pl-card-title">Improve before you send</div>
            <div class="pl-card-sub">A tighter prompt usually means fewer tokens and better answers.</div>
          </div>
          <div class="pl-card-body">
            ${tips.map((t) => `<div class="pl-msug">${escapeHtml(t)}</div>`).join("")}
            <div class="pl-tmpl-head">
              <span>Suggested structure</span>
              <button class="pl-btn copy" id="pl-copy">Copy</button>
            </div>
            <div class="pl-tmpl" id="pl-tmpl">${escapeHtml(buildTemplate(draft))}</div>
          </div>
          <div class="pl-card-foot">
            <button class="pl-btn" id="pl-edit">Keep editing</button>
            <button class="pl-btn primary" id="pl-send">Send anyway</button>
          </div>
        </div>`;
      shadow.appendChild(overlay);

      const close = (action) => {
        overlay.remove();
        resolve(action);
      };
      overlay.querySelector("#pl-edit").addEventListener("click", () => close("edit"));
      overlay.querySelector("#pl-send").addEventListener("click", () => close("send"));
      overlay.querySelector("#pl-copy").addEventListener("click", () => {
        const text = buildTemplate(draft);
        navigator.clipboard?.writeText(text).catch(() => {});
        const b = overlay.querySelector("#pl-copy");
        b.textContent = "Copied";
        setTimeout(() => (b.textContent = "Copy"), 1500);
      });
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close("edit");
      });
    });
  }

  async function maybeIntercept(e) {
    if (bypassNext) return;
    const input = P.findInput();
    if (!isComposerFocused(input)) return;
    const draft = readInput(input);
    if (!draft) return;

    const convTokens = estimateTokens(getConversationText());
    const tips = buildTips(draft, convTokens);
    if (tips.length === 0) {
      // Clean prompt — let it send natively, but still log it.
      logSend(draft);
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    const action = await showReview(draft, convTokens);
    if (action === "send") {
      logSend(draft);
      triggerSend();
    } else {
      input?.focus();
    }
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      void maybeIntercept(e);
    },
    true
  );
  document.addEventListener(
    "click",
    (e) => {
      const send = P.findSend();
      if (!send) return;
      const target = e.target;
      if (target === send || send.contains(target)) void maybeIntercept(e);
    },
    true
  );

  // ---- lifecycle -----------------------------------------------------------
  document.addEventListener("input", updateLocal, true);
  document.addEventListener("keyup", updateLocal, true);
  setInterval(updateLocal, 1500);
  updateLocal();
  refreshProxy();
  setInterval(refreshProxy, 30000);
  refreshHistory();
  setInterval(refreshHistory, 10000);
})();
