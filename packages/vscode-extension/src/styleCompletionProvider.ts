// Inline ghost-text completion for the "veyr-compose" document language
// (see composePrompt.ts). Ghost-text rendering and Tab/right-arrow-accept/
// Esc-dismiss are all native VS Code behavior for inline completions — this
// provider only needs to supply the suggestion text.

import * as vscode from "vscode";
import { daemonGet } from "./daemonClient";

interface StyleSuggestion {
  readonly text: string;
  readonly kind: string;
  readonly confidence: number;
}

interface StyleCompletionResponse {
  readonly suggestions: readonly StyleSuggestion[];
  readonly groundedIn: readonly string[];
}

// VS Code re-invokes this on every keystroke and cancels stale calls via
// `token`; this extra delay-then-check-cancellation collapses bursts of
// keystrokes into one daemon call per pause, on top of that native
// cancellation — standard practice for inline-completion providers backed
// by anything slower than a pure in-memory lookup.
const DEBOUNCE_MS = 250;
const REQUEST_TIMEOUT_MS = 300;

export const veyrComposeLanguageSelector: vscode.DocumentSelector = { language: "veyr-compose" };

export class VeyrStyleCompletionProvider implements vscode.InlineCompletionItemProvider {
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[]> {
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));
    if (token.isCancellationRequested) return [];

    const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    const response = await daemonGet<StyleCompletionResponse>(
      `/style/complete?text=${encodeURIComponent(text)}&surface=vscode`,
      REQUEST_TIMEOUT_MS,
    );
    const suggestion = response?.suggestions[0];
    if (token.isCancellationRequested || !suggestion) return [];

    return [new vscode.InlineCompletionItem(suggestion.text, new vscode.Range(position, position))];
  }
}
