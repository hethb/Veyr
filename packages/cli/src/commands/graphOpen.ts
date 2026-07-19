// `veyr graph open` — the dashboard's interactive graph view (pan, zoom,
// click-to-inspect), fed by the same local cache `veyr graph` reads. Reuses
// the single-file embed bundle the Mac app and VS Code extension host
// (packages/dashboard/src/embed/), so the rendering and interaction are
// identical to the web. No server: the bundle waits for a
// postMessage({type:"graphData"}), and we bake that message into a copy of
// the file, then open it in the default browser.

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { readGraphCache } from "../veyr/graph.js";
import { fmtAge } from "../ui.js";

// dist/commands/graphOpen.js -> dist/embed.html (placed by scripts/copy-graph-embed.mjs).
const EMBED_BUNDLE_URL = new URL("../embed.html", import.meta.url);

export async function graphOpenCommand(): Promise<void> {
  const result = await readGraphCache();
  if (result.kind === "missing") {
    console.log(chalk.dim("○ no graph yet — run the Veyr menu bar app in a workspace to build one"));
    return;
  }
  const { payload, generatedAt } = result;

  let bundle: string;
  try {
    bundle = await readFile(fileURLToPath(EMBED_BUNDLE_URL), "utf8");
  } catch {
    console.log(chalk.red("✗ graph view bundle is missing from this install"));
    console.log(chalk.dim("  rebuild the CLI (`npm run build` in packages/cli) or reinstall getcanopy"));
    process.exitCode = 1;
    return;
  }

  // The bridge listens for a message on its own window; replay it a few times
  // after load so React is guaranteed to have mounted the listener. `<` is
  // escaped so no label can smuggle a `</script>` into the page.
  const data = JSON.stringify({
    nodes: payload.nodes,
    links: payload.links,
    workspaceRoot: payload.workspaceRoot,
  }).replace(/</g, "\\u003c");
  const inject = `<script>(function () {
  var message = { type: "graphData", payload: ${data} };
  function send() { window.postMessage(message, "*"); }
  function schedule() { send(); setTimeout(send, 150); setTimeout(send, 600); setTimeout(send, 1500); }
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule);
})();</script>`;
  const page = bundle.includes("</body>")
    ? bundle.replace("</body>", `${inject}</body>`)
    : bundle + inject;

  const outFile = join(tmpdir(), "veyr-graph.html");
  await writeFile(outFile, page, "utf8");
  openInBrowser(outFile);

  console.log(
    chalk.green("● opened the codebase graph in your browser") + chalk.dim(` · built ${fmtAge(generatedAt)}`)
  );
  console.log(
    chalk.dim(
      `  ${payload.workspaceRoot} · ${payload.nodes.length} nodes / ${payload.links.length} links` +
        (payload.nodes.length < payload.totalNodeCount
          ? ` (cache ships the top ${payload.nodes.length} of ${payload.totalNodeCount} symbols)`
          : "")
    )
  );
  console.log(chalk.dim(`  ${outFile}`));
  console.log(chalk.dim("  stale? `veyr graph --refresh` rebuilds the cache, then run this again"));
}

function openInBrowser(file: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [file]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", file]]
        : ["xdg-open", [file]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}
