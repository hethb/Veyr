// `veyr compose` — an interactive prompt-composition surface: type, get an
// inline (dimmed) style-based completion when you pause, Tab/right-arrow
// accepts it, Esc dismisses just the suggestion, Enter finishes and copies
// to the clipboard, Ctrl-C cancels. Neither this command nor the daemon
// route it calls existed before this feature — this is the CLI's first
// free-text prompt-entry surface.
//
// Phase-1 simplifications: append/backspace only at the end of the buffer
// (no cursor repositioning), and single-line only (Enter always finishes —
// there's no way to embed a literal newline in the composed prompt yet).
//
// Zero new dependencies: node:readline's raw-mode keypress events plus the
// existing chalk dependency cover the whole interaction surface — this
// package is deliberately near-zero-dependency (commander + chalk only).

import { spawn } from "node:child_process";
import * as readline from "node:readline";
import chalk from "chalk";
import { daemonGet } from "@veyr/core";
import { readPromptStyleLearning } from "@veyr/core";

interface StyleSuggestion {
  readonly text: string;
  readonly kind: string;
  readonly confidence: number;
}

interface StyleCompletionResponse {
  readonly suggestions: readonly StyleSuggestion[];
  readonly groundedIn: readonly string[];
}

const DEBOUNCE_MS = 350;
const REQUEST_TIMEOUT_MS = 300;
const PROMPT_PREFIX = "> ";

const COPY_TIMEOUT_MS = 2000;

/** Writes `text` to pbcopy's stdin; falls back to printing it if pbcopy
 * isn't available (non-mac dev box) or hangs (e.g. no pasteboard service
 * reachable — observed in some sandboxed/headless shells) — never silently
 * no-ops, and never blocks the command indefinitely either. */
function copyOrPrint(text: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      console.log();
      if (ok) {
        console.log(chalk.green("✓ copied to clipboard"));
      } else {
        console.log(chalk.dim("pbcopy unavailable — composed prompt:"));
        console.log(text);
      }
      resolve();
    };

    const proc = spawn("pbcopy");
    // Guarantees this never blocks the command indefinitely, independent of
    // whether "close" ever fires — pbcopy can hang if no pasteboard service
    // is reachable (observed in some sandboxed/headless shells), and a
    // killed process isn't guaranteed to emit "close" promptly either.
    const timeout = setTimeout(() => {
      proc.kill();
      finish(false);
    }, COPY_TIMEOUT_MS);

    proc.on("error", () => {
      clearTimeout(timeout);
      finish(false);
    });
    proc.stdin.on("error", () => {
      clearTimeout(timeout);
      finish(false);
    });
    proc.on("close", (code) => {
      clearTimeout(timeout);
      finish(code === 0);
    });
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

export async function composeCommand(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error(chalk.red("✗ veyr compose needs an interactive terminal (stdin is not a TTY)."));
    process.exitCode = 1;
    return;
  }

  console.log(
    chalk.dim("Compose a prompt. Tab/→ accepts a suggestion, Esc dismisses it, Enter finishes, Ctrl-C cancels.")
  );
  if (!readPromptStyleLearning()) {
    console.log(chalk.dim("Suggestions are off — run `veyr style enable` to learn from your prompt history."));
  }

  let buffer = "";
  let ghost = "";
  let requestGeneration = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let warnedDaemonUnreachable = false;

  function render(): void {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(PROMPT_PREFIX + buffer + (ghost ? chalk.dim(ghost) : ""));
    if (ghost.length > 0) {
      readline.moveCursor(process.stdout, -ghost.length, 0);
    }
  }

  async function fetchSuggestion(generation: number): Promise<void> {
    const response = await daemonGet<StyleCompletionResponse>(
      `/style/complete?text=${encodeURIComponent(buffer)}&surface=cli`,
      REQUEST_TIMEOUT_MS
    );
    if (generation !== requestGeneration) return; // stale — buffer moved on since this fired
    if (response === null) {
      if (!warnedDaemonUnreachable) {
        warnedDaemonUnreachable = true;
        readline.moveCursor(process.stdout, 0, 1);
        readline.cursorTo(process.stdout, 0);
        console.log(chalk.dim("(Veyr app isn't running — composing without learned suggestions.)"));
        readline.moveCursor(process.stdout, 0, -1);
        render();
      }
      return;
    }
    ghost = response.suggestions[0]?.text ?? "";
    render();
  }

  function scheduleSuggestion(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (ghost) {
      ghost = "";
      render();
    }
    const generation = ++requestGeneration;
    debounceTimer = setTimeout(() => void fetchSuggestion(generation), DEBOUNCE_MS);
  }

  await new Promise<void>((resolve) => {
    function cleanup(): void {
      if (debounceTimer) clearTimeout(debounceTimer);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("keypress", onKeypress);
      process.removeListener("SIGINT", onSigint);
    }

    function cancel(): void {
      cleanup();
      console.log();
      console.log(chalk.dim("cancelled — nothing copied."));
      resolve();
    }

    // Belt-and-suspenders: in most terminals, raw mode suppresses the OS
    // from turning Ctrl-C into SIGINT at all, so the keypress branch below
    // handles it. But some pty setups (nested terminal multiplexers, certain
    // SSH/pty allocators) still deliver SIGINT even in raw mode — without
    // this handler, Node's default SIGINT action kills the process before
    // cleanup() runs, leaving the user's real shell stuck in raw mode
    // (no echo, broken line editing) until they run `reset`.
    function onSigint(): void {
      cancel();
    }
    process.on("SIGINT", onSigint);

    function onKeypress(str: string | undefined, key: readline.Key): void {
      if (key.ctrl && key.name === "c") {
        cancel();
        return;
      }
      if (key.name === "return") {
        cleanup();
        void copyOrPrint(buffer).then(resolve);
        return;
      }
      if (key.name === "tab" || key.name === "right") {
        if (ghost) {
          buffer += ghost;
          ghost = "";
          render();
          scheduleSuggestion();
        }
        return;
      }
      if (key.name === "escape") {
        if (ghost) {
          ghost = "";
          render();
        }
        return;
      }
      if (key.name === "backspace") {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          render();
          scheduleSuggestion();
        }
        return;
      }
      if (str && !key.ctrl && !key.meta && str.length >= 1 && str >= " ") {
        buffer += str;
        render();
        scheduleSuggestion();
      }
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("keypress", onKeypress);
    render();
  });
}
