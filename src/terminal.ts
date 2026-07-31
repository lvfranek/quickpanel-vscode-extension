import * as vscode from 'vscode';

/** Always open a fresh terminal — never reuse an existing one. */
export function createQuickpanelTerminal(cwd?: string, label?: string): vscode.Terminal {
	const raw = (label || 'run').replace(/\s+/g, ' ').trim();
	const short = raw.length > 40 ? raw.slice(0, 37) + '…' : raw;
	const terminal = vscode.window.createTerminal({
		name: `Quickpanel: ${short}`,
		cwd: cwd || undefined
	});
	terminal.show();
	return terminal;
}

export async function runInTerminal(command: string, cwd?: string, label?: string) {
	const terminal = createQuickpanelTerminal(cwd, label);
	terminal.sendText(command);
}
