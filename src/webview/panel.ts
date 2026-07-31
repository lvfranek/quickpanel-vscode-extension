import * as vscode from 'vscode';
import { createFile } from '../files';
import { runAllProjectSteps } from '../runner';
import { loadPanelData, saveFiles, saveProjects } from '../storage';
import { repairUtf8InData } from '../textEncoding';
import { runInTerminal } from '../terminal';
import { getWebviewContent } from './html';

/**
 * Open the Quickpanel webview and wire host ↔ webview messages.
 */
export async function openQuickpanel(context: vscode.ExtensionContext): Promise<void> {
	const panel = vscode.window.createWebviewPanel(
		'quickpanel',
		'Quickpanel',
		vscode.ViewColumn.Beside,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
		}
	);
	panel.iconPath = new vscode.ThemeIcon('zap');

	// Migrates to current default templates when DATA_VERSION increases.
	const { files, projects } = await loadPanelData(context);

	panel.webview.html = getWebviewContent(panel.webview, context.extensionUri, {
		files: repairUtf8InData(files),
		projects: repairUtf8InData(projects),
	});

	panel.webview.onDidReceiveMessage(async (message) => {
		switch (message.command) {
			case 'saveFiles':
				await saveFiles(context, repairUtf8InData(message.data));
				break;
			case 'saveProjects':
				await saveProjects(context, repairUtf8InData(message.data));
				break;
			case 'createFile':
				await createFile(message.filename, message.content);
				break;
			case 'runProjectStep':
				if (message.stepType === 'file') {
					await createFile(message.filename, message.content);
				} else {
					await runInTerminal(message.commandText, undefined, message.label);
				}
				break;
			case 'runAllProjectSteps':
				await runAllProjectSteps(message.steps ?? [], message.processName);
				break;
		}
	});
}
