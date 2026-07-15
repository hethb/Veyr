// "Veyr: Compose Prompt" — opens an untitled document in the "veyr-compose"
// language (registered in package.json's contributes.languages: id only, no
// grammar/highlighting, this is prose) and a "Veyr: Copy Composed Prompt"
// command to finish. An untitled TextDocument, not a TextDocumentContentProvider:
// a content provider is VS Code's mechanism for read-only computed content
// regenerated from a URI, not live free-text editing — an untitled document
// is the actual mechanism for that (the same one "New Untitled File" uses),
// and the distinct language id scopes VeyrStyleCompletionProvider's ghost
// text so it never leaks into real source files.
//
// Veyr permanently never intercepts or routes agent traffic, so a composed
// prompt has nowhere to go except the clipboard — there's no "send to
// Claude Code" here, by design.

import * as vscode from "vscode";

export async function composePromptCommand(): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ language: "veyr-compose", content: "" });
  await vscode.window.showTextDocument(document, { preview: false });
}

export async function copyComposedPromptCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "veyr-compose") {
    void vscode.window.showWarningMessage("Veyr: no compose document is active.");
    return;
  }
  await vscode.env.clipboard.writeText(editor.document.getText());
  void vscode.window.showInformationMessage(
    "Copied to clipboard. You can close this tab and choose \"Don't Save\" — nothing is lost.",
  );
}
