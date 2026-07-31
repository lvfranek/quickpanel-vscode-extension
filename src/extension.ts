import * as vscode from 'vscode';
import { loadPanelData } from './storage';
import { openQuickpanel } from './webview/panel';

export function activate(context: vscode.ExtensionContext) {
	// Apply template migrations as soon as the extension loads.
	void loadPanelData(context);

	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);
	statusBarItem.text = '$(zap) Quickpanel';
	statusBarItem.tooltip = 'Open Quickpanel';
	statusBarItem.command = 'quickpanel.open';
	statusBarItem.show();

	const openCommand = vscode.commands.registerCommand('quickpanel.open', () => {
		void openQuickpanel(context);
	});

	context.subscriptions.push(statusBarItem, openCommand);
}

export function deactivate() {}
