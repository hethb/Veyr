# PromptLens Browser Extension

A Chrome (MV3) overlay for **chatgpt.com** and **claude.ai**.

Web chats don't use your API key and never hit the PromptLens proxy, so this
extension works in two complementary ways:

1. **Local estimate (always on)** — a floating widget shows the live token count
   of the current conversation and your draft, an estimated input cost, and
   rule-based optimization tips as you type.
2. **Proxy data (when reachable)** — if your PromptLens proxy is running on
   `http://localhost:3001`, the widget and popup also show your real logged
   spend (today / week / month) and your top optimization suggestion.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select this folder
   (`packages/browser-extension`).
4. Open [chatgpt.com](https://chatgpt.com) or [claude.ai](https://claude.ai) —
   the PromptLens widget appears in the bottom-right. Minimize it to a bubble
   with the `–` button.

No build step is required — the extension is plain JS/CSS.

## Connecting to the proxy

The widget calls the proxy through the extension's background worker (so there's
no CORS/mixed-content issue). Start the proxy from the repo root:

```bash
npm run dev:proxy
```

To point at a different proxy URL, click the extension icon and edit the
**Proxy URL** field in the popup.

## Notes

- Token counts use a `chars / 4` heuristic — close enough for live guidance, not
  billing-accurate.
- Page selectors for ChatGPT/Claude can change; if counts read 0, the sites
  likely updated their DOM and the selectors in `src/content.js` need a refresh.
