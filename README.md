<!-- Improved compatibility of back to top link -->
<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)
[![Built on CodexBar](https://img.shields.io/badge/Built%20on-CodexBar-orange?style=for-the-badge)](https://github.com/steipete/CodexBar)
[![Powered by Graphify](https://img.shields.io/badge/Powered%20by-Graphify-purple?style=for-the-badge)](https://github.com/Graphify-Labs/graphify)
[![Stars](https://img.shields.io/github/stars/hethb/Veyr.svg?style=for-the-badge)](https://github.com/hethb/Veyr/stargazers)
[![Issues](https://img.shields.io/github/issues/hethb/Veyr.svg?style=for-the-badge)](https://github.com/hethb/Veyr/issues)

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/hethb/Veyr">
    <img src="packages/desktop-mac/assets/Icon.png" alt="Veyr Logo" width="80" height="80">
  </a>

  <h3 align="center">Veyr</h3>

  <p align="center">
    Stop paying for wasted tokens. See exactly where your AI spend goes — and automatically cut what you don't need.
    <br />
    <a href="https://github.com/hethb/Veyr"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="#download--get-started">Download</a>
    &middot;
    <a href="https://github.com/hethb/Veyr/issues/new?labels=bug&template=bug-report.md">Report Bug</a>
    &middot;
    <a href="https://github.com/hethb/Veyr/issues/new?labels=enhancement&template=feature-request.md">Request Feature</a>
  </p>
</div>

---

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#built-with">Built With</a></li>
    <li>
      <a href="#download--get-started">Download & Get Started</a>
      <ul>
        <li><a href="#macos-app-recommended">macOS App</a></li>
        <li><a href="#vs-code-extension">VS Code Extension</a></li>
        <li><a href="#homebrew">Homebrew</a></li>
      </ul>
    </li>
    <li><a href="#what-you-get">What You Get</a></li>
    <li><a href="#token-optimization">Token Optimization</a></li>
    <li><a href="#prompt-caching">Prompt Caching</a></li>
    <li><a href="#optional-proxy-layer">Optional Proxy Layer</a></li>
    <li><a href="#editor--browser-integrations">Editor & Browser Integrations</a></li>
    <li><a href="#vs-helicone">vs Helicone</a></li>
    <li><a href="#repository-layout">Repository Layout</a></li>
    <li><a href="#local-development">Local Development</a></li>
    <li><a href="#deployment">Deployment</a></li>
    <li><a href="#automatic-dependency-installation">Automatic Dependency Installation</a></li>
    <li><a href="#privacy">Privacy</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

---

<!-- ABOUT THE PROJECT -->
## About The Project

<!-- PROJECT SCREENSHOT -->
<!-- SCREENSHOT: menu bar + spend dashboard -->

Veyr is a native macOS menu bar app that reads your local Claude Code session logs — **no proxy, no account, no traffic interception**. It shows real-time spend by project, enforces budgets, and tells your coding agent how to be more efficient, automatically.

```
~/.claude/projects/**/*.jsonl     (logs Claude Code already writes)
        │
        ▼
   Veyr.app (menu bar)
        │
        ├──▶  spend by project · budgets · 13-rule optimization engine
        ├──▶  ~/.veyr/agent-status/VEYR_STATUS.json   (agents read this)
        └──▶  CLAUDE.md spend + graph block           (Claude Code reads this)
```

Here's why Veyr exists:
* LLM costs are invisible until the bill arrives — Veyr makes them visible in real time
* Your coding agent doesn't know it's being wasteful — Veyr tells it, automatically, every session
* You shouldn't need a proxy or a cloud account to see where your money goes

Built on [CodexBar](https://github.com/steipete/CodexBar) by Peter Steinberger (MIT) · codebase graph powered by [Graphify](https://github.com/Graphify-Labs/graphify) (YC S26) · see [CREDITS.md](./CREDITS.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- BUILT WITH -->
## Built With

* [![Swift](https://img.shields.io/badge/Swift-F05138?style=for-the-badge&logo=swift&logoColor=white)](https://swift.org) — native macOS menu bar app
* [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org) — proxy, dashboard, SDK, CLI, VS Code extension
* [![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org) — web dashboard
* [![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org) — ML classifier training (dev-side), Graphify
* [![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org) — local proxy data store
* [![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org) — legacy desktop app

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- GETTING STARTED -->
## Download & Get Started

### Prerequisites

- macOS 14+ (Sonoma) for the native Mac app
- Node.js 20+ for the proxy, dashboard, and CLI
- Python 3.8+ is **optional** — installed automatically on first launch for codebase graph features (see [Automatic Dependency Installation](#automatic-dependency-installation))
- Xcode 16+ only if building from source

### macOS App (recommended)

_No account, no proxy, no configuration needed to get started._

1. **Download** `Veyr-0.2.1.dmg` from the [Veyr download page](https://veyr.dev#download)

2. **Install** — open the DMG, drag Veyr to Applications, open it

3. **Bypass Gatekeeper** (required — builds are not yet notarized):
   ```bash
   xattr -cr /Applications/Veyr.app
   ```
   This removes the quarantine flag so macOS allows the app to run. It only affects Veyr.

4. **Start a Claude Code session** — Veyr detects it automatically. The menu bar shows today's spend with a pulsing dot while a session is active.

5. _(Optional)_ **Enable CLAUDE.md injection** — on by default. Veyr keeps a marker-delimited spend and graph block in your active project's `CLAUDE.md` so Claude Code sees its burn rate, budget status, and optimization recommendations at every session start. Toggle it off in Settings → Veyr.

6. _(Optional)_ **AI task classification** — add your Anthropic API key in Settings → Veyr (stored in the macOS Keychain). Veyr then classifies each agent turn as simple/moderate/complex using Haiku (~$0.01/day typical) and surfaces what you're wasting by running simple tasks on frontier models.

**Build from source** (requires Swift 6 CLT + Xcode 16+):
```bash
cd packages/desktop-mac
./Scripts/package_app.sh release && open Veyr.app
```

### VS Code Extension

1. Download `veyr-vscode-0.2.1.vsix` from the [Veyr download page](https://veyr.dev#download)

2. Open VS Code → Extensions panel (`Cmd+Shift+X`) → `···` → **Install from VSIX…** → select the file

3. The extension activates automatically. You'll see live session cost in the status bar:
   ```
   $(graph-line) $0.84 · 14k↓ 3k↑ · 23% saved ⚡
   ```
   The Veyr sidebar panel shows burn rate, cache hit rate, codebase graph status, and one-click optimization commands.

> **Note:** The Mac app must be running — it writes the agent feed the VS Code extension reads.

### Homebrew

```bash
brew install --cask veyr   # coming soon
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- WHAT YOU GET -->
## What You Get

| Feature | Description |
|---|---|
| **Menu bar spend** | Today's cost at a glance, pulsing dot during active sessions. Spend window shows 7-day chart, per-project breakdown, and session timeline. |
| **Agent feed** | `~/.veyr/agent-status/VEYR_STATUS.json` rewritten every 30s: session cost, burn rate, cache hit rate, budgets, and `agent_instructions` any coding agent can act on. |
| **CLAUDE.md injection** | Spend status and codebase graph summary injected into your project's `CLAUDE.md` so Claude Code reads them automatically every session. |
| **Codebase graph** | Graphify-powered knowledge graph of your codebase — call graph, dependency chain, critical path, test coverage gaps. Saves 60–90% of exploration tokens per session. |
| **13-rule optimization engine** | Wrong model, poor cache usage, runaway sessions, retry loops, tool-list bloat, redundant reads, and more — each with an estimated monthly saving. |
| **Budgets** | Per-project monthly caps with macOS notifications at 80% and 100%. Agents see budget status in their feed and adjust behavior accordingly. |
| **AI task classification** | Optional, uses your API key. Haiku classifies every agent turn — Veyr reports the cost wasted running simple tasks on expensive frontier models. |
| **Prompt caching** | Detects cache-eligible prompts, auto-injects `cache_control` for Anthropic, tracks cache hit rate. Up to 90% cheaper input tokens on warm cache. |
| **Document → Markdown** | Converts PDFs, Word docs, HTML, CSV, JSON, XML into compact LLM-friendly Markdown. 70–90% fewer input tokens than raw files. |
| **VS Code extension** | Live session cost in status bar, sidebar panel with burn rate and suggestions, one-click model switch commands. |
| **Browser extension** | Chrome MV3 overlay for chatgpt.com and claude.ai — live token counts, complexity-aware prompt compression, ingest into dashboard. |
| **Terminal CLI** | `veyr status`, `veyr suggestions`, `veyr policy set`, `veyr logs --follow`, `veyr integrate claude-code`. |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- TOKEN OPTIMIZATION -->
## Token Optimization

Veyr analyzes your session history and surfaces specific, actionable ways to cut token spend. All analysis runs **in-process over local data** — no external API or LLM calls.

Each suggestion includes an estimated monthly saving, the evidence that triggered it, and a concrete action. The highest-impact suggestion is flagged as a **quick win**.

### Detection rules

| # | Rule | What it detects | Action |
|---|---|---|---|
| 1 | **Wrong model** | Feature averages <500 prompt tokens but uses frontier model, costs >$5/mo | Route to mini/Haiku (~80% cheaper) |
| 2 | **Ballooning completions** | Responses >2x input length, 20+ calls, >$3/mo | Cap `max_tokens` |
| 3 | **Errors burning tokens** | >10% error rate on 10+ calls in 7 days | Fix the underlying error |
| 4 | **One feature dominates** | Single feature >60% of total spend | Add budget cap or model override |
| 5 | **Redundant long template** | Same prompt hash 50+ times/mo averaging >800 tokens | Compress the template |
| 6 | **Low cache hit rate** | Feature averages ≥1024 tokens, 20+ calls, >$2/mo, <20% cache reads | Enable prompt caching |
| G1 | **Leaf node on expensive model** | Active function has ≤2 connections but runs on Opus/GPT-4o | Switch to Haiku |
| G2 | **God node warning** | Active function has >20 connections | Review blast radius before editing |
| G3 | **Unexplored dependencies** | Active file imports never-explored files | Check graph summary first |
| G4 | **Redundant file reads** | Agent re-reads stable files every session | Use graph summary instead |
| G5 | **Test coverage gap** | High-connectivity function with no tests, >$5/mo spend | Write a test first |
| 11 | **Long outputs on simple tasks** | Average output >1500 tokens, majority simple tasks | Add output constraints |
| 12 | **Verbose JSON examples** | System prompt contains example response blocks | Use structured outputs instead |
| 13 | **Batch API candidates** | Non-streaming background jobs | Use OpenAI Batch API (50% cheaper) |

> Suggestions appear after at least 7 days of traffic. Graph-powered rules (G1–G5) require Python 3.8+ for the codebase graph.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- PROMPT CACHING -->
## Prompt Caching

Provider prompt caching reuses the model's intermediate processing of a static prompt prefix — dropping input cost by **up to 90%** and cutting latency. Veyr detects when your prompts are cache-eligible, auto-injects `cache_control` for Anthropic, and tracks cache hit rate alongside spend.

### Enable it

Per-request header:
```bash
-H "x-veyr-cache: 1"
```

Via SDK:
```ts
const openai = new OpenAI(
  veyrOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    feature: "policy-qa",
    enablePromptCaching: true,
  })
);
```

Via dashboard (`PUT /api/policies`):
```json
{ "api_key_id": "…", "feature_tag": "policy-qa", "enable_prompt_caching": true }
```

When enabled on Anthropic, Veyr wraps your `system` prompt with `cache_control: { type: "ephemeral" }` — only when it's at least 1024 tokens (Anthropic's minimum). Below that it's a no-op.

### What's tracked

Every request logs `cached_tokens` (cache hit) and `cache_creation_tokens` (cache write). Cost is computed accordingly — reads discounted, writes at a small premium.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- OPTIONAL PROXY LAYER -->
## Optional Proxy Layer

Everything above works with zero infrastructure. If you also call OpenAI/Anthropic APIs from your own code and want request-level logging, compression, caching injection, and hard budget caps, run the bundled proxy.

### Quickstart

```bash
npm install canopy-sdk openai
```

```ts
import OpenAI from "openai";
import { veyrOpenAI } from "canopy-sdk";

const openai = new OpenAI(
  veyrOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    feature: "my-feature",
  })
);
```

Existing `chat.completions` calls are unchanged. The dashboard shows cost by feature, tokens, and top prompt templates.

### Control plane

Per-request headers:

| Header | Effect |
|---|---|
| `x-veyr-compress: 1` | Rule-based prompt compression |
| `x-veyr-cache: 1` | Provider prompt caching injection |
| `x-veyr-max-tokens: 512` | Cap completion tokens |

Per-feature policies via dashboard or `PUT /api/policies`:

| Policy | Effect |
|---|---|
| `monthly_budget_usd` | Returns 429 when spend exceeds cap |
| `compress_prompts` | Always compress for this feature |
| `enable_prompt_caching` | Auto-inject Anthropic `cache_control` |
| `max_completion_tokens` | Enforced server-side |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- EDITOR & BROWSER INTEGRATIONS -->
## Editor & Browser Integrations

### Browser Extension (ChatGPT & Claude.ai)

Chrome MV3 overlay for chatgpt.com and claude.ai. Works three ways:
- **Local estimate** — floating widget with live token counts, estimated cost, and rule-based prompt tips as you type
- **Live ingest** — every send is POSTed to `/ingest/web-chat`; web chats appear in your dashboard charts immediately tagged `web-chatgpt` / `web-claude`
- **Proxy data** — shows your real logged spend and top optimization suggestion

Load via `chrome://extensions` → Developer mode → Load unpacked → `packages/browser-extension`. No build step.

### Terminal CLI

```bash
npm install -g getcanopy   # or: npx getcanopy init

veyr status                # proxy health + today/week/month spend
veyr suggestions           # optimization tips with ready-to-run commands
veyr policy set summarizer --model gpt-4o-mini --budget 50
veyr logs --follow         # tail requests as they hit the proxy
veyr integrate claude-code # route Claude Code through the proxy
```

`veyr init` walks new users through setup, key verification, and integration with OpenAI SDK, Anthropic SDK, Claude Code, Cursor, or plain env vars.

### VS Code Extension + Claude Code

The **Veyr** VS Code panel shows spend and optimization suggestions from the proxy, plus a command to route Claude Code through Veyr:

```bash
VEYR_ALLOW_ANON=true npm run dev:proxy
```

Then run **Veyr: Route Claude Code through proxy** — it sets `ANTHROPIC_BASE_URL=http://localhost:3001/anthropic` for new terminals.

> `VEYR_ALLOW_ANON=true` attributes traffic without an `x-veyr-key` to a dedicated "Anonymous (local tools)" key, tagged by User-Agent.

### Native macOS Menu Bar App

`packages/desktop-mac` reads coding-agent logs directly from disk — Claude Code's `~/.claude/projects/**/*.jsonl`, Codex CLI sessions, and 50+ other providers — no proxy required.

```bash
cd packages/desktop-mac
make start
```

Requires macOS 14+ and Xcode 16+.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- VS HELICONE -->
## vs Helicone

Helicone shows you that you're spending money. Veyr tells you **which feature is responsible** and **how to spend less**.

| | Helicone | Veyr |
|---|---|---|
| Per-request logging | ✓ | ✓ (proxy) |
| Cost dashboard | ✓ | ✓ |
| **Works without a proxy** | ✘ | ✓ (reads local agent logs) |
| **Cost by project/feature** | ⚠ manual tags | ✓ auto-inferred |
| **13-rule optimization engine** | ✘ | ✓ |
| **Codebase graph (Graphify)** | ✘ | ✓ |
| **Agent-readable feed** | ✘ | ✓ (agents self-optimize) |
| **CLAUDE.md auto-injection** | ✘ | ✓ |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- REPOSITORY LAYOUT -->
## Repository Layout

```
veyr/
├── packages/
│   ├── desktop-mac/        # THE product: native Swift menu bar app (built on CodexBar)
│   ├── vscode-extension/   # live session cost + optimization suggestions in VS Code
│   ├── browser-extension/  # Chrome MV3 overlay for chatgpt.com / claude.ai
│   ├── proxy/              # optional Express proxy (Node, TS) — local SQLite store
│   ├── dashboard/          # React dashboard + public landing page
│   ├── sdk/                # npm SDK wrapper (canopy-sdk)
│   ├── cli/                # veyr terminal CLI (status, policies, logs)
│   ├── ml/                 # dev-side Python: classifier training on local session data
│   └── desktop/            # legacy Electron app (superseded by desktop-mac)
├── examples/               # runnable customer integration demo
├── CREDITS.md              # open source attribution
├── package.json            # workspace root
└── .env.example
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- LOCAL DEVELOPMENT -->
## Local Development

### Prerequisites

- Node.js 20+

That's it — no database or cloud account. The proxy keeps keys and request logs in a local SQLite file at `packages/proxy/.veyr/data.db`.

### Installation

1. Clone the repo
   ```bash
   git clone https://github.com/hethb/Veyr.git
   cd Veyr
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Seed the database
   ```bash
   npm run seed
   ```
   This prints a `pl_live_…` demo key and fills the store with 30 days of sample data so the dashboard is populated immediately. Re-run any time to mint a fresh key; add `-- --reset` to wipe everything.

4. _(Optional)_ Configure environment
   ```bash
   cp .env.example .env
   cp .env packages/proxy/.env
   cp .env packages/dashboard/.env
   ```

### Running locally

```bash
# Terminal 1
npm run dev:proxy        # http://localhost:3001

# Terminal 2
npm run dev:dashboard    # http://localhost:5173
```

Open the dashboard — no login. Use any `pl_live_…` key as `VEYR_KEY` in your application.

### Smoke test (free — Groq)

1. Get a free key at [console.groq.com](https://console.groq.com)
2. Set in `.env`:
   ```bash
   OPENAI_UPSTREAM_URL=https://api.groq.com/openai/v1/chat/completions
   GROQ_API_KEY=gsk_...
   ```
3. Run:
   ```bash
   export VEYR_KEY=pl_live_…
   export GROQ_API_KEY=gsk_…
   ./scripts/smoke-groq.sh
   ```

You should see a row land in the `requests` table and the cost appear in the dashboard tagged `smoke-test`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- DEPLOYMENT -->
## Deployment

For a full step-by-step guide, see [**DEPLOY.md**](./DEPLOY.md).

| Component | Platform | Config |
|---|---|---|
| Proxy (Node + SQLite) | Fly.io | `Dockerfile`, `fly.toml` |
| Dashboard (Vite SPA) | Vercel | `packages/dashboard/vercel.json` |
| Auth (multi-tenant) | Supabase | env vars only |

`render.yaml` is also included for one-click Render deployments.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- AUTOMATIC DEPENDENCY INSTALLATION -->
## Automatic Dependency Installation

Veyr automatically installs [Graphify](https://github.com/Graphify-Labs/graphify) (a Python package by Graphify Labs, YC S26) on first launch if Python 3.8+ is available on your system. This is done silently using:

```bash
pip install graphify --quiet --user
```

No elevated permissions (no `sudo`) are required. Graphify analyzes your codebase structure **locally** — no code is sent externally.

To manage it yourself:
```bash
pip3 install graphify     # install manually
pip3 uninstall graphify   # remove if you prefer
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- PRIVACY -->
## Privacy

- The Mac app reads your local Claude Code and Codex log files from disk. Nothing leaves your machine by default.
- Session history is stored in `~/.veyr/` locally.
- The proxy stores only structured metadata (token counts, cost, feature tag, prompt SHA-256 hash) in local SQLite. Full prompt content is never logged.
- The optional AI classifier calls Anthropic's API using **your** key, only when you add one in Settings.
- All ML training data stays in `~/.veyr/ml/` — never uploaded.
- Graphify analyzes your codebase on-device — no source code leaves your machine.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- ROADMAP -->
## Roadmap

- [x] Native macOS menu bar app (CodexBar foundation)
- [x] Real-time spend by project and session
- [x] 13-rule optimization suggestion engine
- [x] Per-project budget caps and macOS notifications
- [x] Agent-readable feed (VEYR_STATUS.json)
- [x] CLAUDE.md auto-injection
- [x] VS Code extension with live cost display
- [x] Browser extension (ChatGPT & Claude.ai)
- [x] Terminal CLI
- [x] Prompt caching detection and injection
- [x] Document → Markdown converter
- [x] AI task complexity classifier
- [ ] Graphify codebase graph integration
- [ ] Interactive graph visualization in dashboard
- [ ] Homebrew cask distribution
- [ ] Apple notarization (Gatekeeper-clean DMG)
- [ ] JetBrains IDE extension
- [ ] Windows and Linux support

See the [open issues](https://github.com/hethb/Veyr/issues) for proposed features and known bugs.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- CONTRIBUTING -->
## Contributing

Contributions are what make open source such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would improve Veyr, please fork the repo and create a pull request. You can also open an issue with the tag `enhancement`.

1. Fork the project
2. Create your feature branch
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. Commit your changes
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
4. Push to the branch
   ```bash
   git push origin feature/AmazingFeature
   ```
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- LICENSE -->
## License

Distributed under the MIT License. See [`LICENSE`](./LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- CONTACT -->
## Contact

Heth Bhatt — xlnc.hethbhatt@gmail.com

Project Link: [https://github.com/hethb/Veyr](https://github.com/hethb/Veyr)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [CodexBar](https://github.com/steipete/CodexBar) by Peter Steinberger ([@steipete](https://github.com/steipete)) — the foundation for Veyr's native Mac app. MIT licensed.
* [Graphify](https://github.com/Graphify-Labs/graphify) by Graphify Labs (YC S26) — AST-based codebase knowledge graphs powering Veyr's structural optimization.
* [Choose an Open Source License](https://choosealicense.com)
* [Img Shields](https://shields.io)
* [Best README Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- MARKDOWN LINKS -->
[license-shield]: https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge
[license-url]: ./LICENSE
[stars-shield]: https://img.shields.io/github/stars/hethb/Veyr.svg?style=for-the-badge
[stars-url]: https://github.com/hethb/Veyr/stargazers
[issues-shield]: https://img.shields.io/github/issues/hethb/Veyr.svg?style=for-the-badge
[issues-url]: https://github.com/hethb/Veyr/issues
