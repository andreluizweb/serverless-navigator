import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ResolvedHandler {
  filePath: string;
  exportName: string;
  relativePath: string;
}

export function resolveHandler(
  handlerValue: string,
  serverlessFilePath: string,
  workspaceRoot: string | undefined,
): ResolvedHandler | undefined {
  const lastDot = handlerValue.lastIndexOf('.');
  if (lastDot <= 0) {
    return undefined;
  }

  const modulePath = handlerValue.slice(0, lastDot);
  const exportName = handlerValue.slice(lastDot + 1);

  if (modulePath.includes('${')) {
    return undefined;
  }

  const serverlessDir = path.dirname(serverlessFilePath);
  const searchRoots = [serverlessDir];
  if (workspaceRoot && workspaceRoot !== serverlessDir) {
    searchRoots.push(workspaceRoot);
  }

  const extensions = ['.ts', '.js', '.mjs', '.cjs'];

  for (const root of searchRoots) {
    for (const ext of extensions) {
      const candidate = path.join(root, modulePath + ext);
      if (fs.existsSync(candidate)) {
        return {
          filePath: candidate,
          exportName,
          relativePath: path.relative(serverlessDir, candidate),
        };
      }
    }

    for (const ext of extensions) {
      const candidate = path.join(root, modulePath, 'index' + ext);
      if (fs.existsSync(candidate)) {
        return {
          filePath: candidate,
          exportName,
          relativePath: path.relative(serverlessDir, candidate),
        };
      }
    }

    const direct = path.join(root, modulePath);
    if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
      return {
        filePath: direct,
        exportName,
        relativePath: path.relative(serverlessDir, direct),
      };
    }
  }

  return undefined;
}

export async function findExportPosition(
  filePath: string,
  exportName: string,
): Promise<vscode.Position | undefined> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const patterns: RegExp[] = [
    new RegExp(`export\\s+(?:const|let|var)\\s+(${exportName})\\s*=`),
    new RegExp(`export\\s+(?:async\\s+)?function\\s+(${exportName})\\s*\\(`),
    new RegExp(`export\\s*\\{[^}]*\\b(${exportName})\\b[^}]*\\}`),
    new RegExp(`module\\.exports\\.(${exportName})\\s*=`),
    new RegExp(`exports\\.(${exportName})\\s*=`),
  ];

  if (exportName === 'default' || exportName === 'handler') {
    patterns.push(/export\s+default\b/);
  }

  patterns.push(
    new RegExp(`(?:const|let|var)\\s+(${exportName})\\s*=`),
    new RegExp(`(?:async\\s+)?function\\s+(${exportName})\\s*\\(`),
  );

  for (const pattern of patterns) {
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(pattern);
      if (match) {
        const col = match.index !== undefined
          ? lines[i].indexOf(match[1] ?? match[0], match.index)
          : 0;
        return new vscode.Position(i, Math.max(0, col));
      }
    }
  }

  return undefined;
}

export function getWorkspaceRoot(filePath: string): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  for (const folder of folders) {
    if (filePath.startsWith(folder.uri.fsPath)) {
      return folder.uri.fsPath;
    }
  }

  return folders[0].uri.fsPath;
}
