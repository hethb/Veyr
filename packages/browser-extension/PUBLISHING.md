# Publishing the Veyr extension to the Chrome Web Store

This is how you take the extension from "load unpacked on my machine" to "anyone
can install it." The store is the only way to give non-developers a one-click
install on Chrome.

## 0. Build the upload bundle

```bash
cd packages/browser-extension
npm run package      # regenerates icons + writes dist-zip/veyr-extension.zip
```

`dist-zip/veyr-extension.zip` is the file you upload. It contains `manifest.json`
at the root, `icons/`, and `src/` — nothing else.

## 1. One-time setup

1. Go to the **Chrome Web Store Developer Dashboard**:
   https://chrome.google.com/webstore/devconsole
2. Sign in with the Google account you want to own the listing.
3. Pay the **one-time $5 USD** developer registration fee.
4. (Recommended) Verify a contact email — required before publishing.

## 2. Host the privacy policy

The store **requires** a public privacy-policy URL because the extension reads
chat content and stores an API key. Options:

- Add `PRIVACY.md` as a page on your site (e.g. a `/privacy` route on the Vercel
  dashboard) and use that URL, **or**
- Use the GitHub-rendered file URL once pushed:
  `https://github.com/hethb/Veyr/blob/main/packages/browser-extension/PRIVACY.md`

## 3. Create the listing

In the dashboard: **Add new item** → upload `veyr-extension.zip`. Then fill in:

- **Store icon**: `icons/128.png` (already in the zip; the dashboard also asks
  for it separately).
- **Screenshots** (at least one, 1280×800 or 640×400 PNG/JPG): capture the
  overlay on chatgpt.com and the popup. (Not generated here — take these from a
  live session.)
- **Category**: Productivity (or Developer Tools).
- **Single-purpose description** (store requires one):
  > Show live token and cost estimates, suggest tighter prompts, and detect when
  > a long chat is losing context, on ChatGPT and Claude.
- **Detailed description** — see the suggested copy below.

## 4. Privacy & permissions disclosures

The dashboard's **Privacy practices** tab makes you justify each permission and
declare data use. Suggested justifications:

- **`storage`** — "Stores the user's settings (API key, proxy URL) and a local
  usage history on their own device."
- **`alarms`** — "Periodically retries delivering queued usage to the user's own
  proxy when it was offline."
- **Host permission `chatgpt.com`, `chat.openai.com`, `claude.ai`** — "Renders
  the overlay and reads the visible conversation to estimate tokens/cost and
  generate prompt suggestions, in-page."
- **Host permission `promptlens.fly.dev`, `localhost`** — "Sends usage to, and
  reads stats from, the Veyr proxy the user configures."
- **Remote code**: No (everything runs from the package).
- **Data usage**: declare that you collect "Website content" (the prompt text),
  used for **App functionality** only; not sold, not used for tracking. Sent
  only to the user's configured proxy.

> Note: the `localhost` host permission is legitimate (self-hosters) but
> reviewers sometimes ask about it — the justification above covers it. If a
> review is rejected over it, you can drop the two `localhost` entries from
> `manifest.json` and re-submit; hosted users are unaffected.

## 5. Submit for review

Submit. Review typically takes a few hours to a few days. You'll get an email on
approval or with required changes. After approval the listing is public and
installable by anyone.

## 6. Updates

Bump `version` in `manifest.json`, run `npm run package`, and upload the new zip
to the same item. Same review flow.

---

## Other browsers (optional)

- **Microsoft Edge** — Chromium-based; the same zip works. Submit at the
  Microsoft Partner Center (one-time registration, often free).
- **Firefox** — submit the same zip at https://addons.mozilla.org (free). MV3 on
  Firefox is supported but the background service worker is treated as an event
  page; test before publishing.

---

## Suggested detailed description

> **Veyr** shows you what a ChatGPT or Claude conversation is actually costing —
> live token counts for the chat and your draft, an estimated input cost, and
> concrete suggestions to tighten your prompt before you send it.
>
> It also includes a **canary**: ask the model to address you by name, and Veyr
> watches for when it stops — an early signal that the chat is losing context and
> it's time to grab a handoff and start fresh.
>
> Bring your own key: point Veyr at the hosted proxy (or your own self-hosted
> one) to sync your web-chat usage into a dashboard alongside your API traffic.
> Everything is local-first — without a key, it's a private, in-browser
> estimator. No analytics, no tracking, no third-party data sharing.
