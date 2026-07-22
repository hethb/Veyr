// Standalone Graphify build path — lets the CLI build the codebase graph
// itself, with no Veyr desktop app installed. Ports the essentials of
// packages/desktop-mac/Sources/VeyrKit/Graphify/PythonEnv.swift (interpreter
// discovery + pinned-commit install) and GraphifyRunner.swift (the
// `python -m graphify update` invocation, the analyze pass, and the trimmed
// ~/.veyr/cache/graph.json payload). Full builds only — the app's
// partial-first flow exists for its always-on background watcher; an explicit
// `veyr graph --refresh` just runs the one build and waits.
//
// Cache layout is shared with the app on purpose: GRAPHIFY_OUT lands in the
// same ~/.veyr/cache/graphify/<fnv1a-hash>/full directory VeyrPaths computes,
// so Graphify's per-file manifest cache carries over between surfaces and
// neither ever rebuilds what the other already scanned.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { graphCacheFilePath, veyrHome } from "./paths.js";

const execFileAsync = promisify(execFile);

// Mirrors GraphifyPin in PythonEnv.swift. The PyPI name `graphify` is
// unclaimed upstream — never `pip install graphify`; only ever this pinned
// tarball. Bumping the pin is a release action, updated in both places.
export const GRAPHIFY_PIN = {
  commit: "9c27a524482246aa425bfe8b32e4fba87e4a77ca",
  version: "0.9.12",
  tarballURL:
    "https://github.com/Graphify-Labs/graphify/archive/9c27a524482246aa425bfe8b32e4fba87e4a77ca.tar.gz",
  minimumPythonMajor: 3,
  minimumPythonMinor: 10,
} as const;

const VERSION_CHECK_TIMEOUT_MS = 10_000;
const VENV_CREATE_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 600_000;
const BUILD_TIMEOUT_MS = 900_000;

/** FNV-1a 64 hex, matching VeyrPaths.StableHash so the CLI and the app share
 * one Graphify build cache per workspace. */
export function stableHashHex(input: string): string {
  const MASK = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (const byte of Buffer.from(input, "utf8")) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

function graphifyVenvPython(home: string): string {
  const venv = path.join(home, ".veyr", "graphify-venv");
  return process.platform === "win32"
    ? path.join(venv, "Scripts", "python.exe")
    : path.join(venv, "bin", "python3");
}

function graphifyBuildDirectory(workspaceRoot: string): string {
  return path.join(veyrHome(), "cache", "graphify", stableHashHex(workspaceRoot), "full");
}

/** Ordered interpreter candidates, mirroring PythonEnvManager.pythonCandidates:
 * Veyr's own venv first (a previous PEP 668 fallback install must keep
 * winning), then PATH entries, then fixed locations. */
function pythonCandidates(home: string = os.homedir()): string[] {
  const names =
    process.platform === "win32" ? ["python3.exe", "python.exe"] : ["python3", "python"];
  const candidates = [graphifyVenvPython(home)];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) candidates.push(path.join(dir, name));
  }
  if (process.platform !== "win32") {
    candidates.push(
      "/opt/homebrew/bin/python3",
      "/usr/local/bin/python3",
      "/usr/bin/python3",
      path.join(home, ".pyenv", "shims", "python3")
    );
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
}

async function runOk(
  binary: string,
  args: readonly string[],
  timeoutMs: number,
  env?: NodeJS.ProcessEnv
): Promise<RunResult | null> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, [...args], {
      timeout: timeoutMs,
      env: env ?? process.env,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch {
    return null;
  }
}

/** "Python 3.14.0" → [3, 14]; version probes print to either stream. */
function parsePythonVersion(output: string): [number, number] | null {
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("Python ")) continue;
    const parts = trimmed.slice("Python ".length).split(".");
    const major = Number.parseInt(parts[0] ?? "", 10);
    const minor = Number.parseInt(parts[1] ?? "", 10);
    if (Number.isFinite(major) && Number.isFinite(minor)) return [major, minor];
  }
  return null;
}

function meetsMinimum([major, minor]: [number, number]): boolean {
  if (major !== GRAPHIFY_PIN.minimumPythonMajor) return major > GRAPHIFY_PIN.minimumPythonMajor;
  return minor >= GRAPHIFY_PIN.minimumPythonMinor;
}

/** Parses `graphify --version`, tolerating the skill-staleness warnings
 * Graphify may print before the version line. */
function parseGraphifyVersion(output: string): string | null {
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("graphify ")) continue;
    const version = trimmed.slice("graphify ".length).trim();
    if (version && version !== "unknown") return version;
  }
  return null;
}

interface PythonEnvironment {
  readonly pythonPath: string;
  readonly graphifyVersion: string;
}

async function detectGraphify(pythonPath: string): Promise<PythonEnvironment | null> {
  const result = await runOk(pythonPath, ["-m", "graphify", "--version"], VERSION_CHECK_TIMEOUT_MS);
  if (!result) return null;
  const version = parseGraphifyVersion(result.stdout || result.stderr);
  return version ? { pythonPath, graphifyVersion: version } : null;
}

async function firstUsablePython(): Promise<string | null> {
  for (const candidate of pythonCandidates()) {
    const result = await runOk(candidate, ["--version"], VERSION_CHECK_TIMEOUT_MS);
    if (!result) continue;
    const version = parsePythonVersion(result.stdout || result.stderr);
    if (version && meetsMinimum(version)) return candidate;
  }
  return null;
}

async function pipInstall(
  python: string,
  userScope: boolean
): Promise<"success" | "externallyManaged" | "failed"> {
  const args = ["-m", "pip", "install", "--quiet"];
  if (userScope) args.push("--user");
  args.push(GRAPHIFY_PIN.tarballURL);
  try {
    await execFileAsync(python, args, { timeout: INSTALL_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
    return "success";
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    // PEP 668: Homebrew/Debian Pythons refuse `pip install --user`.
    if (stderr.includes("externally-managed-environment")) return "externallyManaged";
    return "failed";
  }
}

export type EnsureGraphifyResult =
  | { readonly ok: true; readonly env: PythonEnvironment }
  | { readonly ok: false; readonly reason: string };

/**
 * Finds (or installs) Graphify, mirroring PythonEnvManager.ensureGraphify:
 * any already-importable Graphify is used as-is; otherwise the pin is
 * installed with pip --user, falling back to a private venv at
 * ~/.veyr/graphify-venv when the Python is externally managed. No sudo,
 * nothing touches the user's own environments beyond a --user install.
 */
export async function ensureGraphify(log: (line: string) => void): Promise<EnsureGraphifyResult> {
  const python = await firstUsablePython();
  if (!python) {
    return {
      ok: false,
      reason:
        `Python ${GRAPHIFY_PIN.minimumPythonMajor}.${GRAPHIFY_PIN.minimumPythonMinor}+ not found — ` +
        "graph builds need it. Install Python, then retry.",
    };
  }

  const existing = await detectGraphify(python);
  if (existing) return { ok: true, env: existing };

  log(`Installing Graphify ${GRAPHIFY_PIN.version} (pinned build, ~1–2 min, one time)…`);
  const outcome = await pipInstall(python, true);
  if (outcome === "success") {
    const env = await detectGraphify(python);
    if (env) return { ok: true, env };
  } else if (outcome === "externallyManaged") {
    const venvPython = graphifyVenvPython(os.homedir());
    log("Python is externally managed — installing into a private venv at ~/.veyr/graphify-venv…");
    let venvReady = true;
    try {
      fs.accessSync(venvPython, fs.constants.X_OK);
    } catch {
      const venvDir = path.join(veyrHome(), "graphify-venv");
      venvReady = (await runOk(python, ["-m", "venv", venvDir], VENV_CREATE_TIMEOUT_MS)) !== null;
    }
    if (venvReady && (await pipInstall(venvPython, false)) === "success") {
      const env = await detectGraphify(venvPython);
      if (env) return { ok: true, env };
    }
  }

  return {
    ok: false,
    reason: `Graphify install failed. Manual fix: pip3 install "${GRAPHIFY_PIN.tarballURL}"`,
  };
}

// ---------------------------------------------------------------------------
// graph.json → trimmed cache (ports CodebaseGraph.analyze + cachePayload)
// ---------------------------------------------------------------------------

interface RawNode {
  readonly id: string;
  readonly label?: string;
  readonly source_file?: string;
  readonly source_location?: string;
  readonly file_type?: string;
  readonly community?: number;
}

interface RawLink {
  readonly source: string;
  readonly target: string;
  readonly relation?: string;
  readonly confidence?: string;
}

interface RawGraphFile {
  readonly nodes?: readonly RawNode[];
  readonly links?: readonly RawLink[];
  readonly built_at_commit?: string;
}

/** Relations that describe code structure — `references` and prose relations
 * stay out of degree so connectivity measures architecture, not mentions. */
const STRUCTURAL_RELATIONS = new Set([
  "calls",
  "imports",
  "imports_from",
  "inherits",
  "implements",
  "method",
  "contains",
  "defines",
  "indirect_call",
  "case_of",
]);

const LANGUAGE_NAMES: Record<string, string> = {
  swift: "Swift", ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", rb: "Ruby", java: "Java",
  c: "C", h: "C", cc: "C++", cpp: "C++", hpp: "C++",
  cs: "C#", kt: "Kotlin", php: "PHP", scala: "Scala",
};

function isVendoredPath(p: string): boolean {
  const lowered = p.toLowerCase();
  return (
    lowered.includes("/.build/") || lowered.startsWith(".build/") ||
    lowered.includes("/vendored/") || lowered.includes("/vendor/") ||
    lowered.includes("/node_modules/") || lowered.includes("/checkouts/")
  );
}

/** "L84" → 84 */
function parseLine(location: string | undefined): number | undefined {
  if (!location?.startsWith("L")) return undefined;
  const value = Number.parseInt(location.slice(1), 10);
  return Number.isFinite(value) ? value : undefined;
}

const CACHE_MAX_NODES = 2000;
const CACHE_MAX_LINKS = 12000;

/**
 * Trims a raw Graphify graph.json into the ~/.veyr/cache/graph.json payload
 * GraphifyRunner.writeGraphCache produces — same field names, same node kind
 * derivation, same top-degree trim — and writes it atomically. Exported for
 * the build orchestrator below.
 */
export function writeTrimmedGraphCache(
  raw: RawGraphFile,
  workspaceRoot: string,
  graphifyVersion: string
): { nodes: number; totalNodes: number } {
  const nodes = (raw.nodes ?? []).map((node) => ({
    id: node.id,
    label: node.label ?? node.id,
    sourceFile: node.source_file ?? "",
    line: parseLine(node.source_location),
    fileType: node.file_type ?? "code",
    community: node.community,
  }));
  const links = (raw.links ?? []).map((link) => ({
    source: link.source,
    target: link.target,
    relation: link.relation ?? "references",
  }));

  // analyze(): structural degrees, method/inheritance participation, files,
  // language counts (vendored paths excluded so one dependency can't skew).
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const methodSources = new Set<string>();
  const inheritanceTargets = new Set<string>();
  for (const link of links) {
    if (!STRUCTURAL_RELATIONS.has(link.relation)) continue;
    outDegree.set(link.source, (outDegree.get(link.source) ?? 0) + 1);
    inDegree.set(link.target, (inDegree.get(link.target) ?? 0) + 1);
    if (link.relation === "method") methodSources.add(link.source);
    if (link.relation === "inherits" || link.relation === "implements") {
      inheritanceTargets.add(link.target);
    }
  }

  const files = new Set<string>();
  const languageCounts = new Map<string, number>();
  const kinds = new Map<string, "file" | "function" | "class" | "symbol">();
  for (const node of nodes) {
    if (node.sourceFile) {
      files.add(node.sourceFile);
      if (!isVendoredPath(node.sourceFile)) {
        const ext = node.sourceFile.split(".").pop()?.toLowerCase() ?? "";
        const language = LANGUAGE_NAMES[ext];
        if (language) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
      }
    }
    // Kind derivation, ordered exactly like CodebaseGraph.kind(of:).
    const basename = node.sourceFile.split("/").pop() ?? "";
    kinds.set(
      node.id,
      node.label.endsWith("()")
        ? "function"
        : basename !== "" && basename === node.label
          ? "file"
          : methodSources.has(node.id) || inheritanceTargets.has(node.id)
            ? "class"
            : "symbol"
    );
  }

  const totalDegree = (id: string): number => (inDegree.get(id) ?? 0) + (outDegree.get(id) ?? 0);
  const kept = nodes
    .filter(
      (node) =>
        node.sourceFile !== "" &&
        node.fileType === "code" &&
        kinds.get(node.id) !== "symbol" &&
        !isVendoredPath(node.sourceFile)
    )
    .sort((a, b) => totalDegree(b.id) - totalDegree(a.id))
    .slice(0, CACHE_MAX_NODES);
  const keptIDs = new Set(kept.map((node) => node.id));
  const keptLinks = links
    .filter(
      (link) =>
        STRUCTURAL_RELATIONS.has(link.relation) && keptIDs.has(link.source) && keptIDs.has(link.target)
    )
    .slice(0, CACHE_MAX_LINKS);

  const payload = {
    schemaVersion: 1,
    isPartial: false,
    workspaceRoot,
    generatedAt: new Date().toISOString(),
    graphifyVersion,
    builtAtCommit: raw.built_at_commit,
    fileCount: files.size,
    totalNodeCount: nodes.length,
    totalLinkCount: links.length,
    primaryLanguages: [...languageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([language]) => language),
    nodes: kept.map((node) => ({
      id: node.id,
      label: node.label,
      kind: kinds.get(node.id) ?? "symbol",
      file: node.sourceFile,
      line: node.line,
      community: node.community,
      inDegree: inDegree.get(node.id) ?? 0,
      outDegree: outDegree.get(node.id) ?? 0,
    })),
    links: keptLinks,
  };

  const cachePath = graphCacheFilePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, JSON.stringify(payload), "utf8");
  fs.renameSync(tempPath, cachePath);
  return { nodes: payload.nodes.length, totalNodes: nodes.length };
}

export type LocalBuildResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Full local graph build: ensure Graphify, run `python -m graphify update`
 * on `workspaceRoot` (pure AST — no LLM calls, nothing leaves the machine),
 * then write the trimmed cache. Blocks until done; large repos take minutes.
 */
export async function buildGraphLocally(
  workspaceRoot: string,
  log: (line: string) => void
): Promise<LocalBuildResult> {
  const ensured = await ensureGraphify(log);
  if (!ensured.ok) return ensured;

  const outDir = graphifyBuildDirectory(workspaceRoot);
  fs.mkdirSync(outDir, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GRAPHIFY_OUT: outDir,
    GRAPHIFY_NO_TIPS: "1",
    // Our update rebuilds the complete corpus for its scan root, so a shrink
    // means code was really deleted — bypass the node-shrink guard.
    GRAPHIFY_FORCE: "1",
  };

  log(`Scanning ${workspaceRoot} with Graphify ${ensured.env.graphifyVersion}…`);
  const built = await runOk(
    ensured.env.pythonPath,
    ["-m", "graphify", "update", workspaceRoot],
    BUILD_TIMEOUT_MS,
    env
  );
  if (!built) {
    return { ok: false, reason: `graphify update failed for ${workspaceRoot}` };
  }

  let raw: RawGraphFile;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(outDir, "graph.json"), "utf8")) as RawGraphFile;
  } catch {
    return { ok: false, reason: `graphify finished but ${outDir}/graph.json is unreadable` };
  }
  const { nodes, totalNodes } = writeTrimmedGraphCache(raw, workspaceRoot, ensured.env.graphifyVersion);
  log(`Graph cache written (top ${nodes} of ${totalNodes} nodes).`);
  return { ok: true };
}
