# getcanopy

Veyr terminal CLI — monitor LLM costs, view optimization suggestions, and
manage feature policies without leaving your terminal.

## Install

```bash
npm install -g getcanopy
```

Or run the onboarding wizard without installing anything:

```bash
npx getcanopy init
```

## Configuration

The CLI reads `~/.promptlens/config.json` (also written by the Veyr
desktop app, so it finds a desktop-managed proxy automatically). Resolution
order:

1. `PROMPTLENS_PROXY_URL` / `PROMPTLENS_API_KEY` env vars
2. `~/.promptlens/config.json`
3. Defaults (`http://localhost:3001`)

No config file is required — with a local proxy on the default port everything
just works.

## Commands

| Command | What it does |
|---|---|
| `veyr init` | Interactive setup: pick local/hosted, verify your key, choose an integration |
| `veyr status` | Proxy health plus today / week / month spend and top features |
| `veyr suggestions` | Cost-optimization suggestions, each with the exact command to act on it |
| `veyr policy list` | All feature policies as a table |
| `veyr policy set <tag>` | Create/update a policy (`--budget`, `--model`, `--max-tokens`, `--rate-limit`, `--cache`) |
| `veyr logs` | Recent requests (`--tag <feature>`, `--limit <n>`, `--follow` to tail) |
| `veyr config` | Interactive wizard for `~/.promptlens/config.json` |
| `veyr open` | Open the dashboard in your browser |
| `veyr integrate <tool>` | Route Claude Code, Cursor, or shell scripts through the proxy |

Examples:

```bash
veyr status
veyr suggestions
veyr policy set summarizer --model gpt-4o-mini --budget 50
veyr logs --tag chatbot --follow
```

## Integrations

### Claude Code

```bash
veyr integrate claude-code           # show what to add to your shell profile
veyr integrate claude-code --write   # append it to ~/.zshrc (or ~/.bashrc)
source ~/.zshrc
veyr integrate claude-code --check   # confirm ANTHROPIC_BASE_URL is set
```

Claude Code traffic appears in the dashboard under the feature tag
`claude-code-cli`. The proxy needs `PROMPTLENS_ALLOW_ANON=true` (the desktop
app sets this for you) since Claude Code can't send a Veyr key header.

### Cursor

```bash
veyr integrate cursor
```

Prints the manual steps and, if Cursor's `settings.json` is found at the
standard location, offers to set `openai.apiBaseUrl` for you. Usage shows up
under the tag `cursor`.

### Any shell script

```bash
veyr integrate shell
```

Prints `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` exports for your profile plus a
`veyr-tag` helper that sets `PROMPTLENS_FEATURE_TAG` (read by the Veyr
SDK). Tools that can't send custom headers are tagged automatically from their
User-Agent: `claude-code-cli`, `cursor`, `python-script`, `node-script`.

## Development

```bash
npm run dev -- status   # run from source with tsx
npm run build           # compile to dist/
```
