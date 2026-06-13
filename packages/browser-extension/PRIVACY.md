# Veyr Browser Extension — Privacy Policy

_Last updated: 2026-06-13_

The Veyr extension overlays token/cost estimates and prompt suggestions on
ChatGPT and Claude, and (optionally) syncs your web-chat usage to a Veyr proxy
you choose. This policy explains what it does and does not do with your data.

## What the extension accesses

- **Page content on `chatgpt.com`, `chat.openai.com`, and `claude.ai`** — the
  text of the current conversation and your draft message. This is read **in
  your browser** to estimate token counts, generate prompt suggestions, and run
  the optional "canary" name-drift check. It runs only on those sites.
- **An API key you enter** (`pl_live_…`) and a **proxy URL** — stored locally in
  `chrome.storage.local` so the extension can talk to your Veyr proxy.
- **A local usage log** — per-day counts, token estimates, and a short preview
  (first 140 characters) of prompts you send, kept in `chrome.storage.local` so
  your history survives restarts. You can erase it anytime with **Clear** in the
  popup.

## What is sent off your device, and where

Nothing is sent to the extension's authors. Data goes **only** to the proxy URL
**you** configure (by default the hosted Veyr proxy, `promptlens.fly.dev`, or a
local/self-hosted proxy you run):

- When sync is enabled, each captured web chat is POSTed to your proxy's
  `/ingest/web-chat`: the site name, token counts, and the prompt text. The
  proxy stores a **SHA-256 hash** of the prompt for the dashboard's "top prompt
  templates" view and, by default (`STORE_PROMPTS=false`), does **not** persist
  the raw prompt text.
- Stats shown in the popup are read from your proxy, authenticated with your key
  and scoped to your account.

If you do not enter an API key (and your proxy isn't reachable), no chat data
leaves your browser — the extension still works as a local estimator.

## What the extension does NOT do

- No analytics, advertising, tracking pixels, or third-party data sharing.
- No selling or transfer of personal data.
- No collection beyond what is described above.
- It does not touch any site other than the three chat sites and your proxy.

## Permissions, and why

- `storage` — save your settings (key, proxy URL) and local usage log.
- `alarms` — periodically retry syncing queued prompts to your proxy.
- Host access to `chatgpt.com` / `chat.openai.com` / `claude.ai` — render the
  overlay and read the conversation for estimates.
- Host access to your proxy (`promptlens.fly.dev`, `localhost:3001`) — send
  usage and read your stats.

## Your control

Everything is opt-in and local-first: clear your history from the popup, remove
your API key to stop syncing, or uninstall the extension to delete all locally
stored data.

## Contact

Questions: open an issue at https://github.com/hethb/PromptLens
