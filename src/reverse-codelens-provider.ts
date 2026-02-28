import * as vscode from 'vscode';
import * as path from 'path';
import { parseServerlessYaml } from './yaml-parser';
import { resolveVariables } from './variable-resolver';
import { resolveHandler, findExportPosition, getWorkspaceRoot } from './file-resolver';

interface ReverseEntry {
  serverlessPath: string;
  functionName: string;
  functionLine: number;
  exportName: string;
  parsedData: Record<string, unknown>;
}

export class ReverseCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private cache = new Map<string, ReverseEntry[]>();
  private cacheValid = false;

  refresh(): void {
    this.cacheValid = false;
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    const filePath = document.uri.fsPath;

    if (!this.cacheValid) {
      await this.buildCache();
    }

    const entries = this.cache.get(filePath);
    if (!entries || entries.length === 0) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];

    for (const entry of entries) {
      const exportPos = await findExportPosition(filePath, entry.exportName);
      if (!exportPos) {
        continue;
      }

      const range = new vscode.Range(exportPos.line, 0, exportPos.line, 0);
      const serverlessBasename = path.basename(entry.serverlessPath);

      lenses.push(
        new vscode.CodeLens(range, {
          title: `⚡ ${entry.functionName} (${serverlessBasename})`,
          command: 'serverless-navigator.goToServerless',
          arguments: [entry.serverlessPath, entry.functionLine],
        }),
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(cloud) CloudWatch LogInsights',
          command: 'serverless-navigator.openCloudWatchLogs',
          arguments: [entry.functionName, entry.parsedData],
        }),
      );
    }

    return lenses;
  }

  private async buildCache(): Promise<void> {
    this.cache.clear();

    const yamlFiles = await vscode.workspace.findFiles(
      '**/serverless.{yml,yaml}',
      '**/node_modules/**',
    );

    for (const yamlUri of yamlFiles) {
      const yamlPath = yamlUri.fsPath;
      const workspaceRoot = getWorkspaceRoot(yamlPath);

      let text: string;
      try {
        const doc = await vscode.workspace.openTextDocument(yamlUri);
        text = doc.getText();
      } catch {
        continue;
      }

      const parsed = parseServerlessYaml(text);

      for (const handler of parsed.handlers) {
        const resolvedValue = resolveVariables(handler.raw, parsed.data);
        const resolved = resolveHandler(resolvedValue, yamlPath, workspaceRoot);

        if (!resolved) {
          continue;
        }

        const absPath = resolved.filePath;
        const existing = this.cache.get(absPath) || [];
        existing.push({
          serverlessPath: yamlPath,
          functionName: handler.functionName,
          functionLine: handler.functionLine,
          exportName: resolved.exportName,
          parsedData: parsed.data,
        });
        this.cache.set(absPath, existing);
      }
    }

    this.cacheValid = true;
  }
}
