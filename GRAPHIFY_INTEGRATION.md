# Graphify integration reference

> Written 2026-07-09 against `.graphify-ref/` pinned at commit `9c27a524482246aa425bfe8b32e4fba87e4a77ca`
> (branch `v8`, version 0.9.12). Everything below is verified empirically on this machine,
> not taken from upstream docs. Update this file when the pinned commit is bumped.

## What Graphify actually is

Graphify is a Claude Code *skill* backed by a standalone Python library
(pipeline: `detect → extract → build_graph → cluster → analyze → report → export`).
Veyr uses the library's CLI directly — no skill install, no LLM.

**Critical naming fact:** the PyPI name `graphify` does **not exist** (404). The package is
temporarily published as `graphifyy` while upstream reclaims the name. Veyr must never run
a bare `pip install graphify` — an unclaimed name in a silent installer is a
dependency-squatting hole. We install from a **pinned GitHub commit** instead.

## Install (what PythonEnvManager runs)

```bash
# Silent install, pinned commit, user scope, no sudo:
python3 -m pip install --quiet --user \
  "git+https://github.com/Graphify-Labs/graphify@9c27a524482246aa425bfe8b32e4fba87e4a77ca"

# Verify:
python3 -m graphify --version        # → "graphify 0.9.12"
```

- Requires **Python ≥ 3.10** (not 3.8 as the sprint spec said). Deps: networkx, graspologic,
  ~16 tree-sitter grammar wheels. Install took ~1–2 min on this machine.
- `--user` installs may not put the `graphify` console script on PATH → always invoke as
  `python3 -m graphify`.
- Homebrew Pythons on user machines will refuse `pip install --user`
  (externally-managed-environment, PEP 668). Fallback: create a venv at
  `~/.veyr/graphify-venv` and install there. The python.org framework build on this
  machine (3.14.0) accepts `--user` fine.
- Bumping the pinned sha is a deliberate Veyr release action — this is the supply-chain
  safety property. Do not "upgrade to latest" at runtime.

## CLI commands Veyr uses

### Full build (pure AST — no LLM, no API key, no network)

```bash
GRAPHIFY_OUT="$HOME/.veyr/cache/<project-hash>/graphify-out" \
  python3 -m graphify update /path/to/workspace
```

- `update` is the **only** build command Veyr should run. It is deterministic tree-sitter
  extraction + NetworkX build + Leiden clustering. Verified: `GRAPH_REPORT.md` shows
  `Token cost: 0 input · 0 output`. The "all processing on-device / no code leaves your
  machine" claim is true **for this path only**.
- Do **not** use `graphify extract` (semantic LLM extraction), `label`, or `cluster-only`
  without `--no-label` — those call LLM backends.
- `GRAPHIFY_OUT` accepts an absolute path. **Always set it** — otherwise Graphify writes
  `graphify-out/` into the user's project.
- Flags: `--force` (bypass the node-shrink guard after big deletions), `--no-cluster`
  (skip community detection, faster, but no communities in output).
- Writes: `graph.json`, `GRAPH_REPORT.md`, `manifest.json` (per-file mtime + ast_hash cache),
  `cache/`, and `graph.html` only when the graph has ≤ 5,000 nodes
  (`GRAPHIFY_VIZ_NODE_LIMIT` to raise).

### Partial / fast build (large-codebase first paint)

There is **no `--files` flag** (the sprint spec's `--format partial` / `--files` CLI does not
exist). The partial strategy is: run `update` on a **subdirectory** into a *separate*
`GRAPHIFY_OUT`:

```bash
GRAPHIFY_OUT="$HOME/.veyr/cache/<project-hash>/graphify-out-partial" \
  python3 -m graphify update /path/to/workspace/<busiest-recent-subdir>
```

Veyr picks the subdir from recent git activity (`git diff --name-only HEAD~5` → most-touched
top-level dir). Measured: a 777-line package built in **0.30 s**. Keep partial and full in
separate `GRAPHIFY_OUT` dirs — the node-shrink guard would otherwise refuse to let a small
partial graph overwrite a big full one (that guard is a feature, not a bug).

### Incremental updates

```bash
GRAPHIFY_OUT=... python3 -m graphify update /path/to/workspace   # same command
```

- `manifest.json` mtime+hash cache means unchanged files skip re-extraction, but clustering
  + export always rerun. Measured no-change rerun on this repo: **26 s** (vs 40 s cold) —
  clustering/JSON-export dominate at this size, so debounce aggressively.
- True changed-files-only rebuild exists in the library (`watch._rebuild_code(changed_paths=…)`)
  and is what `graphify watch <path>` and the git hooks (`graphify hook install`,
  post-commit/post-checkout) use. `graphify watch` is an alternative to Veyr's own
  GraphWatcher (Part 1d) — evaluate before writing our own.

### Query commands (agent-facing, all local)

```bash
python3 -m graphify query "<question>" --graph <graph.json> --budget 2000   # BFS subgraph
python3 -m graphify affected "<node>" --depth 2 --graph <graph.json>        # reverse impact
python3 -m graphify path "A" "B" --graph <graph.json>                       # shortest path
python3 -m graphify explain "<node>" --graph <graph.json>                   # node + neighbors
python3 -m graphify benchmark <graph.json>                                  # token-reduction measurement
```

`benchmark` measures corpus-vs-subgraph token counts — use it to populate
`tokenSavingsEstimate` with real numbers instead of hardcoded guesses.

## graph.json schema (empirical, from a real build of this repo)

NetworkX node-link JSON. Top level:

```json
{
  "directed": false,          // storage is undirected; link source/target hold TRUE direction
  "multigraph": false,
  "graph": {},
  "nodes": [...],
  "links": [...],             // NOTE: "links", not "edges"
  "hyperedges": [],
  "built_at_commit": "09657201"   // staleness check vs `git rev-parse HEAD`
}
```

Node (all 37,432 nodes in the test build had exactly these fields):

```json
{
  "id": "examples_customer_demo",       // unique string
  "label": "refreshTokenIfExpired()",   // functions get "name()" labels
  "file_type": "code",                  // code | document | rationale | concept
  "source_file": "packages/proxy/src/auth.ts",   // repo-relative; "" for external symbols
  "source_location": "L84",             // "L<line>" string, not an int
  "_origin": "ast",
  "community": 1047,                    // Leiden community id (int)
  "norm_label": "refreshtokenifexpired()",
  "type": "module",                     // OPTIONAL — present on only 118/37,432 nodes
  "metadata": {}                        // OPTIONAL — rare
}
```

Link:

```json
{
  "source": "id_a", "target": "id_b",   // true direction (restored at export from _src/_tgt)
  "relation": "calls",
  "confidence": "EXTRACTED",            // EXTRACTED | INFERRED | AMBIGUOUS
  "confidence_score": 1.0,
  "weight": 1.0,
  "source_file": "…", "source_location": "L45",
  "context": "call"                     // optional, present on ~70%
}
```

Relation values observed (count on this repo): `references` 35k, `calls` 24k, `method` 12k,
`contains` 11k, `imports` 7.6k, `implements` 3.2k, `case_of` 2.6k, `defines` 532,
`inherits` 492, `imports_from` 215, `indirect_call` 12.

### Mapping to the sprint's assumed `GraphNode` / `GraphEdge`

| Sprint spec field | Reality |
|---|---|
| `node.type` ("file"/"function"/"class") | **Not provided.** Derive: `label` ends `()` → function; `basename(source_file) == label` → file; target of `inherits`/`implements` or source of `method` → class; else symbol. Verified split on this repo: 15,917 function / 2,943 file / 18,572 symbol. |
| `node.line: Int` | Parse from `source_location` ("L84" → 84). |
| `node.language` | Not provided — derive from `source_file` extension. |
| `node.docstring` | Not provided. Drop from the model. |
| `inDegree` / `outDegree` | Not provided — Veyr computes from `links` (one O(E) pass). |
| `edge.type` "calls"/"imports"/"inherits"/"defines" | Real `relation` values above; also map `imports_from`→imports, `implements`→inherits for UI grouping. |
| `edges` key | It's `links`. |
| `--output json`, `--format full/partial`, `--update <file>` | Do not exist. See CLI section. |
| stdout JSON | Never — output is files under `GRAPHIFY_OUT`. |

### Fields → Veyr features

| Feature | Source |
|---|---|
| G1 leaf-node / G2 god-node rules | degree computed from `links` (exclude `references` edges to avoid noise) |
| G4 redundant reads | `manifest.json` ast_hash (file stability) + JSONL read_file history |
| G5 test-gap | nodes whose `source_file` matches test patterns + edges to active node |
| `criticalPath` | top computed degree, **filtered**: drop nodes with empty `source_file` (external symbols like `Foundation`, `String` dominate raw degree) and vendored paths |
| `architecturalOverview` | community hubs (GRAPH_REPORT.md "Community Hubs" section, or group by `community`) |
| staleness / rebuild trigger | `built_at_commit` vs `git rev-parse HEAD` |
| `tokenSavingsEstimate` | `graphify benchmark <graph.json>` |
| dashboard edge colors | `relation`; node colors from derived kind |
| `isPartial` | Veyr-level flag: which `GRAPHIFY_OUT` dir the graph came from (Graphify has no such flag) |

## Measured performance (Apple Silicon, Python 3.14, this machine, 2026-07-09)

| Codebase | LOC | Cold full build | Result |
|---|---|---|---|
| packages/vscode-extension | 777 | **0.30 s** | 145 nodes, 212 links |
| Veyr repo (incl. vendored swift-crypto) | ~370,000 | **39.7 s** | 37,432 nodes, 97,619 links, 1,150 communities, graph.json **63 MB** |
| Veyr repo, no-change rerun | ~370,000 | **26.0 s** | cache skips extraction; cluster+export dominate |

Scaling ≈ **0.3 s startup + ~0.105 s per kLOC** (near-linear). Estimates for the spec's tiers:

| LOC | Estimated full build |
|---|---|
| 5k | ~0.8 s |
| 10k | ~1.4 s |
| 50k | ~5.5 s |
| 100k | ~11 s |
| 370k (measured) | 40 s |

The sprint spec's `estimationSecondsPerKLines = 2.0` is ~20× too pessimistic — use **0.12**
and a 10 s (not line-count) threshold for the "large codebase" notification path. In practice
only ~100 kLOC+ repos need the partial-graph-first flow at all.

## Operational gotchas (all hit during verification)

1. **graph.json can be huge** — 63 MB here. `~/.veyr/cache/graph.json` for the dashboard must
   be a *derived, trimmed* graph (drop `references` edges, drop empty-`source_file` external
   symbols, cap to top-N nodes by degree), not a copy. Never inline any of it into
   VEYR_STATUS.json.
2. **Vendored code pollutes the graph** — this build ingested
   `packages/desktop-mac/.build/checkouts/` (BoringSSL). Graphify merges `.gitignore` with a
   **`.graphifyignore`** (same syntax, per-dir, last-match-wins). Veyr should write one into
   its cache-scoped build (or the project, opt-in) excluding `.build/`, `vendor/`, `Vendored/`
   before trusting degree-based rules; it also cuts build time and file size.
3. **Node-shrink guard**: `update` refuses to overwrite graph.json with a smaller graph
   (safety against partial rebuilds). After a big refactor Veyr must pass `--force`
   (or `GRAPHIFY_FORCE=1`). Surface this instead of silently failing.
4. **Per-repo flock**: concurrent rebuilds skip (hooks) or block (CLI). Veyr's runner should
   serialize its own calls per workspace.
5. `_check_skill_version` runs on most commands and may print upgrade warnings to stdout —
   parse graph data from **files**, never from CLI stdout.
6. Skill-oriented subcommands (`install`, `hook install`, `claude install`, …) modify the
   user's CLAUDE.md / settings — Veyr must **not** call these; we only use
   `update`/`query`/`affected`/`path`/`explain`/`benchmark`.
7. Swift, TypeScript, Python, Go, Rust, C/C++, and ~30 more languages confirmed supported
   via tree-sitter grammars (Swift verified in this build).

## Attribution

Graphify by Graphify Labs (YC S26) — https://github.com/Graphify-Labs/graphify — MIT license.
See CREDITS.md (Part 6) for the shipped attribution.
