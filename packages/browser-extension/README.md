# Canopy Browser Extension

A Chrome (MV3) overlay for **chatgpt.com** and **claude.ai**.

Web chats don't use your API key and never hit the Canopy proxy, so this
extension works in two complementary ways:

1. **Local estimate (always on)** — a floating widget shows the live token count
   of the current conversation and your draft, an estimated input cost, and
   rule-based prompt suggestions as you type.
2. **Pre-send review** — when you press Enter or click send on a draft that can
   be improved, Canopy pauses the send and shows a review modal with concrete
   suggestions and a tighter prompt template. Choose **Keep editing** or
   **Send anyway**.
3. **Persistent history (local)** — every prompt you send is logged to
   `chrome.storage.local`, so your chat/token history survives page refreshes,
   new tabs, and browser restarts (it's shared across all tabs). The widget shows
   today's and the last 7 days' counts plus a **sync status** line.
4. **Synced to the dashboard** — each captured web chat is pushed to the proxy's
   `/ingest/web-chat` through a **durable, retried queue**: it's enqueued the
   moment you send (so a closed tab still delivers it), completion tokens are
   attached once the reply finishes, and it keeps retrying until the proxy
   accepts it. So your web-chat prompt statistics land on the dashboard and the
   extension's counts converge with it (the sync line shows `synced`,
   `N pending`, or `needs your API key`).
5. **Proxy data (your account)** — the widget and popup show your real logged
   spend (today / week / month) read from the proxy's key-authenticated
   `/api/key-stats`, scoped to your key — the same data the dashboard shows.

The UI renders inside a **Shadow DOM**, so the host page's CSS can't hide or
restyle it — important since ChatGPT/Claude ship aggressive global styles.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select this folder
   (`packages/browser-extension`).
4. Open [chatgpt.com](https://chatgpt.com) or [claude.ai](https://claude.ai) —
   the Canopy widget appears in the bottom-right. Minimize it to a bubble
   with the `–` button.

No build step is required — the extension is plain JS. After editing
`src/content.js`, click the **reload** (↻) icon on the extension card in
`chrome://extensions`, then refresh the ChatGPT/Claude tab.

## Connecting to the proxy

The widget calls the proxy through the extension's background worker (so there's
no CORS/mixed-content issue). Open the extension popup to configure it:

- **Hosted (default)** — the proxy URL is already `https://promptlens.fly.dev`.
  Paste your **API key** (`pl_live_…`, from your dashboard's Welcome/API Keys
  page) in the popup. The hosted proxy requires it both to read your stats and to
  sync your web chats — until it's set, the sync line shows `pending — add your
  API key`.
- **Self-hosting / local** — set the **Proxy URL** to `http://localhost:3001`
  (or start one with `npm run dev:proxy`). No key needed: local proxies log
  anonymous traffic automatically.

Custom self-host URLs other than the two above must also be added to
`host_permissions` in `manifest.json` (Chrome only lets the worker reach
declared hosts).

## Notes

- Token counts use a `chars / 4` heuristic — close enough for live guidance, not
  billing-accurate.
- Page selectors for ChatGPT/Claude can change; if counts read 0, the sites
  likely updated their DOM and the selectors in the platform adapters at the top
  of `src/content.js` need a refresh.
- The pre-send review only triggers when there's at least one suggestion — clean
  prompts send normally with no interruption.
