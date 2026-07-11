# Credits

## CodexBar

Veyr's native macOS menu bar app is built on top of **CodexBar** by Peter Steinberger ([@steipete](https://github.com/steipete)).

- GitHub: https://github.com/steipete/CodexBar
- License: MIT

CodexBar provides the provider data reading layer — reading usage statistics for Claude Code, OpenAI Codex, Cursor, and 40+ other AI providers from local files without requiring a proxy or account login. Veyr extends this foundation with cost tracking, spend management, agent optimization, and a token intelligence layer.

Thank you, Peter, for building and open-sourcing CodexBar.

---

## Graphify

Veyr's codebase graph analysis is powered by **Graphify** by Graphify Labs.

- GitHub: https://github.com/Graphify-Labs/graphify
- License: MIT
- YC S26

Graphify parses codebases into knowledge graphs using tree-sitter AST analysis
across 40+ languages. Veyr uses Graphify's pure-AST mode (no LLM calls) to
pre-summarize codebase structure for AI agents, reducing the tokens agents spend
on codebase exploration by 60–90%. Veyr installs Graphify pinned to an exact
commit and vendors nothing — all analysis runs on-device.

---

## Open source dependencies

Veyr is MIT licensed. See [LICENSE](./LICENSE) for details.
