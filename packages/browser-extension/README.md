# PromptLens Browser Extension

A Chrome (MV3) overlay for **chatgpt.com** and **claude.ai**.

Web chats don't use your API key and never hit the PromptLens proxy, so this
extension works in two complementary ways:

1. **Local estimate (always on)** — a floating widget shows the live token count
   of the current conversation and your draft, an estimated input cost, and
   rule-based prompt suggestions as you type.
2. **Pre-send review** — when you press Enter or click send on a draft that can
   be improved, PromptLens pauses the send and shows a review modal with concrete
   suggestions and a tighter prompt template. Choose **Keep editing** or
   **Send anyway**.
3. **Persistent history (local)** — every prompt you send is logged to
   `chrome.storage.local`, so your chat/token history survives page refreshes,
   new tabs, and browser restarts (it's shared across all tabs). The widget shows
   today's and the last 7 days' counts; the popup shows the recent prompt list
   with a **Clear** button. Nothing leaves your browser.
4. **Proxy data (when reachable)** — if your PromptLens proxy is running on
   `http://localhost:3001`, the widget and popup also show your real logged
   spend (today / week / month) and your top optimization suggestion.

The UI renders inside a **Shadow DOM**, so the host page's CSS can't hide or
restyle it — important since ChatGPT/Claude ship aggressive global styles.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select this folder
   (`packages/browser-extension`).
4. Open [chatgpt.com](https://chatgpt.com) or [claude.ai](https://claude.ai) —
   the PromptLens widget appears in the bottom-right. Minimize it to a bubble
   with the `–` button.

No build step is required — the extension is plain JS. After editing
`src/content.js`, click the **reload** (↻) icon on the extension card in
`chrome://extensions`, then refresh the ChatGPT/Claude tab.

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
  likely updated their DOM and the selectors in the platform adapters at the top
  of `src/content.js` need a refresh.
- The pre-send review only triggers when there's at least one suggestion — clean
  prompts send normally with no interruption.
