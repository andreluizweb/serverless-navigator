import * as vscode from 'vscode';
import * as path from 'path';
import { parseServerlessYaml } from './yaml-parser';
import { resolveVariables } from './variable-resolver';
import { resolveHandler, findExportPosition, getWorkspaceRoot } from './file-resolver';

export class ServerlessDocumentLinkProvider implements vscode.DocumentLinkProvider {
  async provideDocumentLinks(
    document: vscode.TextDocument,
  ): Promise<vscode.DocumentLink[]> {
    const basename = path.basename(document.uri.fsPath);
    if (basename !== 'serverless.yml' && basename !== 'serverless.yaml') {
      return [];
    }

    const text = document.getText();
    const parsed = parseServerlessYaml(text);
    const workspaceRoot = getWorkspaceRoot(document.uri.fsPath);
    const links: vscode.DocumentLink[] = [];

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

      const line = document.lineAt(handler.line);
      const valueStart = line.text.indexOf(handler.raw, line.text.indexOf('handler'));
      if (valueStart < 0) {
        continue;
      }

      const range = new vscode.Range(
        handler.line,
        valueStart,
        handler.line,
        valueStart + handler.raw.length,
      );

      let targetUri = vscode.Uri.file(resolved.filePath);

      const exportPos = await findExportPosition(resolved.filePath, resolved.exportName);
      if (exportPos) {
        targetUri = targetUri.with({
          fragment: `L${exportPos.line + 1},${exportPos.character + 1}`,
        });
      }

      const link = new vscode.DocumentLink(range, targetUri);
      link.tooltip = `→ ${resolved.relativePath}#${resolved.exportName}`;
      links.push(link);
    }

    const serverlessDir = path.dirname(document.uri.fsPath);

    for (const schema of parsed.schemas) {
      const absolutePath = path.resolve(serverlessDir, schema.filePath);
      const fs = await import('fs');
      if (!fs.existsSync(absolutePath)) {
        continue;
      }

      const line = document.lineAt(schema.line);
      const valueStart = line.text.indexOf(schema.raw);
      if (valueStart < 0) {
        continue;
      }

      const range = new vscode.Range(
        schema.line,
        valueStart,
        schema.line,
        valueStart + schema.raw.length,
      );

      const targetUri = vscode.Uri.file(absolutePath);
      const link = new vscode.DocumentLink(range, targetUri);
      link.tooltip = `→ ${schema.filePath}`;
      links.push(link);
    }

    return links;
  }
}
