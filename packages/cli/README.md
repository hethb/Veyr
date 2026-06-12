# @promptlens/cli

Canopy terminal CLI — monitor LLM costs, view optimization suggestions, and
manage feature policies without leaving your terminal.

## Install

```bash
npm install -g @promptlens/cli
```

Or run the onboarding wizard without installing anything:

```bash
npx @promptlens/cli init
```

## Configuration

The CLI reads `~/.promptlens/config.json` (also written by the Canopy
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
| `canopy init` | Interactive setup: pick local/hosted, verify your key, choose an integration |
| `canopy status` | Proxy health plus today / week / month spend and top features |
| `canopy suggestions` | Cost-optimization suggestions, each with the exact command to act on it |
| `canopy policy list` | All feature policies as a table |
| `canopy policy set <tag>` | Create/update a policy (`--budget`, `--model`, `--max-tokens`, `--rate-limit`, `--cache`) |
| `canopy logs` | Recent requests (`--tag <feature>`, `--limit <n>`, `--follow` to tail) |
| `canopy config` | Interactive wizard for `~/.promptlens/config.json` |
| `canopy open` | Open the dashboard in your browser |
| `canopy integrate <tool>` | Route Claude Code, Cursor, or shell scripts through the proxy |

Examples:

```bash
canopy status
canopy suggestions
canopy policy set summarizer --model gpt-4o-mini --budget 50
canopy logs --tag chatbot --follow
```

## Integrations

### Claude Code

```bash
canopy integrate claude-code           # show what to add to your shell profile
canopy integrate claude-code --write   # append it to ~/.zshrc (or ~/.bashrc)
source ~/.zshrc
canopy integrate claude-code --check   # confirm ANTHROPIC_BASE_URL is set
```

Claude Code traffic appears in the dashboard under the feature tag
`claude-code-cli`. The proxy needs `PROMPTLENS_ALLOW_ANON=true` (the desktop
app sets this for you) since Claude Code can't send a Canopy key header.

### Cursor

```bash
canopy integrate cursor
```

Prints the manual steps and, if Cursor's `settings.json` is found at the
standard location, offers to set `openai.apiBaseUrl` for you. Usage shows up
under the tag `cursor`.

### Any shell script

```bash
canopy integrate shell
```

Prints `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` exports for your profile plus a
`canopy-tag` helper that sets `PROMPTLENS_FEATURE_TAG` (read by the Canopy
SDK). Tools that can't send custom headers are tagged automatically from their
User-Agent: `claude-code-cli`, `cursor`, `python-script`, `node-script`.

## Development

```bash
npm run dev -- status   # run from source with tsx
npm run build           # compile to dist/
```
