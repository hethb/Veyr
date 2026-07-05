// Inline switch-model suggestions: a polite information message (never an
// error) when the Veyr feed recommends a cheaper model, rate-limited to once
// per 10 minutes per VS Code session.

import * as vscode from "vscode";
import { commandFor, type VeyrStatusResult } from "./agentStatus.js";

const MIN_INTERVAL_MS = 10 * 60 * 1000;

let lastShownAt = 0;
let sessionSuppressed = false;

export function maybeNotifyModelSuggestion(result: VeyrStatusResult): void {
  if (result.kind !== "ok") return;
  const config = vscode.workspace.getConfiguration("veyr");
  if (config.get<boolean>("suppressModelSuggestions", false)) return;
  if (sessionSuppressed) return;
  if (Date.now() - lastShownAt < MIN_INTERVAL_MS) return;
  if (!result.status.current_session?.is_active) return;

  const rec = result.status.recommendations.find(
    (r) => r.action === "switch_model" && r.suggested_model
  );
  if (!rec || !rec.suggested_model) return;

  lastShownAt = Date.now();
  const savings =
    rec.estimated_savings_per_hour_usd > 0
      ? ` (saves ~$${rec.estimated_savings_per_hour_usd.toFixed(2)}/hr)`
      : "";
  const modelShortName = rec.suggested_model.includes("haiku")
    ? "Claude Haiku"
    : rec.suggested_model;

  void vscode.window
    .showInformationMessage(
      `Veyr: This task looks simple — consider switching to ${modelShortName}${savings}`,
      "Switch",
      "Ignore for session",
      "Never show"
    )
    .then((choice) => {
      if (choice === "Switch") {
        const command = commandFor(rec) ?? `/model ${rec.suggested_model ?? ""}`;
        void vscode.env.clipboard.writeText(command).then(() => {
          void vscode.window.showInformationMessage(
            `Copied ${command} — paste it into your Claude Code session.`
          );
        });
      } else if (choice === "Ignore for session") {
        sessionSuppressed = true;
      } else if (choice === "Never show") {
        void config.update(
          "suppressModelSuggestions",
          true,
          vscode.ConfigurationTarget.Global
        );
      }
    });
}

/** Test/reset hook. */
export function resetModelSuggestionState(): void {
  lastShownAt = 0;
  sessionSuppressed = false;
}
