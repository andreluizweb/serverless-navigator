import * as vscode from 'vscode';
import * as path from 'path';
import { parseServerlessYaml } from './yaml-parser';
import { resolveVariables } from './variable-resolver';
import { resolveHandler, findExportPosition, getWorkspaceRoot } from './file-resolver';

export class ServerlessCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    const basename = path.basename(document.uri.fsPath);
    if (basename !== 'serverless.yml' && basename !== 'serverless.yaml') {
      return [];
    }

    const text = document.getText();
    const parsed = parseServerlessYaml(text);
    const workspaceRoot = getWorkspaceRoot(document.uri.fsPath);
    const lenses: vscode.CodeLens[] = [];

    for (const handler of parsed.handlers) {
      const resolvedValue = resolveVariables(handler.raw, parsed.data);
      const resolved = resolveHandler(
        resolvedValue,
        document.uri.fsPath,
        workspaceRoot,
      );

      if (!resolved) {
        continue;
      }

      const range = new vscode.Range(handler.line, 0, handler.line, 0);

      lenses.push(
        new vscode.CodeLens(range, {
          title: `$(file-code) ${resolved.relativePath}`,
          command: 'serverless-navigator.openHandler',
          arguments: [resolved.filePath, resolved.exportName],
        }),
      );

      const exportPos = await findExportPosition(resolved.filePath, resolved.exportName);
      if (exportPos) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: `$(symbol-function) ${resolved.exportName}`,
            command: 'serverless-navigator.goToExport',
            arguments: [resolved.filePath, exportPos],
          }),
        );
      }
    }

    const serverlessDir = path.dirname(document.uri.fsPath);
    const fs = await import('fs');

    for (const schema of parsed.schemas) {
      const absolutePath = path.resolve(serverlessDir, schema.filePath);
      if (!fs.existsSync(absolutePath)) {
        continue;
      }

      const range = new vscode.Range(schema.line, 0, schema.line, 0);

      lenses.push(
        new vscode.CodeLens(range, {
          title: `$(json) ${schema.filePath}`,
          command: 'serverless-navigator.openSchema',
          arguments: [absolutePath],
        }),
      );
    }

    return lenses;
  }
}
