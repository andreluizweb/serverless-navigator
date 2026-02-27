import * as vscode from 'vscode';
import { ServerlessDocumentLinkProvider } from './document-link-provider';
import { ServerlessCodeLensProvider } from './codelens-provider';
import { ReverseCodeLensProvider } from './reverse-codelens-provider';
import { findExportPosition } from './file-resolver';

export function activate(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentFilter = {
    language: 'yaml',
    pattern: '**/serverless.{yml,yaml}',
  };

  const linkProvider = new ServerlessDocumentLinkProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(selector, linkProvider),
  );

  const codeLensProvider = new ServerlessCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
  );

  const reverseSelector: vscode.DocumentFilter[] = [
    { language: 'typescript' },
    { language: 'javascript' },
  ];
  const reverseCodeLensProvider = new ReverseCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(reverseSelector, reverseCodeLensProvider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'serverless-navigator.openHandler',
      async (filePath: string, exportName: string) => {
        const doc = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(doc);

        const pos = await findExportPosition(filePath, exportName);
        if (pos) {
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenter,
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'serverless-navigator.goToExport',
      async (filePath: string, position: { line: number; character: number }) => {
        const doc = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(doc);

        const pos = new vscode.Position(position.line, position.character);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenter,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'serverless-navigator.goToServerless',
      async (serverlessPath: string, functionLine: number) => {
        const doc = await vscode.workspace.openTextDocument(serverlessPath);
        const editor = await vscode.window.showTextDocument(doc);

        const pos = new vscode.Position(functionLine, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenter,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'serverless-navigator.openSchema',
      async (filePath: string) => {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      },
    ),
  );

  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/*.{ts,js,mjs,cjs,yml,yaml,json}',
  );
  watcher.onDidChange(() => { codeLensProvider.refresh(); reverseCodeLensProvider.refresh(); });
  watcher.onDidCreate(() => { codeLensProvider.refresh(); reverseCodeLensProvider.refresh(); });
  watcher.onDidDelete(() => { codeLensProvider.refresh(); reverseCodeLensProvider.refresh(); });
  context.subscriptions.push(watcher);
}

export function deactivate(): void {}
