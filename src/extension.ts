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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'serverless-navigator.openCloudWatchLogs',
      async (functionName: string, data: Record<string, unknown>) => {
        const service = String(data.service || '');
        const provider = (data.provider || {}) as Record<string, unknown>;
        const region = String(provider.region || 'us-east-1');

        if (!service) {
          vscode.window.showErrorMessage('Could not determine service name from serverless.yml');
          return;
        }

        const config = vscode.workspace.getConfiguration('serverlessNavigator');
        const stages = config.get<string[]>('stages', []);
        const defaultStage = config.get<string>('defaultStage', '');

        let stage: string | undefined;
        const newStageLabel = '$(add) New stage...';

        if (stages.length > 0) {
          const items = [...stages, newStageLabel];
          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: defaultStage || 'Select a stage',
            title: 'CloudWatch Logs - Select Stage',
          });
          if (picked === undefined) {
            return;
          }
          if (picked === newStageLabel) {
            stage = await vscode.window.showInputBox({
              prompt: 'Enter a new stage name',
              placeHolder: 'e.g. dev, staging, prod',
            });
            if (stage === undefined || stage.trim() === '') {
              return;
            }
            stage = stage.trim();
            if (!stages.includes(stage)) {
              await config.update('stages', [...stages, stage], vscode.ConfigurationTarget.Workspace);
            }
          } else {
            stage = picked;
          }
        } else {
          stage = await vscode.window.showInputBox({
            prompt: 'Enter the stage name',
            placeHolder: 'e.g. dev, staging, prod',
            value: defaultStage,
          });
          if (stage === undefined || stage.trim() === '') {
            return;
          }
          stage = stage.trim();
          await config.update('stages', [stage], vscode.ConfigurationTarget.Workspace);
        }

        const functions = (data.functions || {}) as Record<string, Record<string, unknown>>;
        const fnConfig = functions[functionName] || {};
        let lambdaName: string;

        if (fnConfig.name) {
          lambdaName = String(fnConfig.name)
            .replace(/\$\{self:service}/g, service)
            .replace(/\$\{self:provider\.stage}/g, stage)
            .replace(/\$\{opt:stage}/g, stage)
            .replace(/\$\{sls:stage}/g, stage);
        } else {
          lambdaName = `${service}-${stage}-${functionName}`;
        }

        const logGroup = `/aws/lambda/${lambdaName}`;
        const encodedLogGroup = logGroup.replace(/\//g, '*2f');
        const url = `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:logs-insights$3FqueryDetail$3D~(source~(~'${encodedLogGroup}))`;

        vscode.env.openExternal(vscode.Uri.parse(url));
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
