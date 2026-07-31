import * as vscode from 'vscode';
import type { CreateFileOptions } from './models';

export async function createFile(filename: string, content: string, options: CreateFileOptions = {}) {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders) {
		vscode.window.showErrorMessage("Open a folder first");
		return;
	}

	const fileUri = vscode.Uri.joinPath(folders[0].uri, filename);

	try {
		try {
			await vscode.workspace.fs.stat(fileUri);
			if (!options.force) {
				const choice = await vscode.window.showWarningMessage(
					`${filename} already exists. Overwrite?`,
					"Yes",
					"No"
				);
				if (choice !== "Yes") { return; }
			}
		} catch {
			// file does not exist — proceed
		}

		// Ensure parent directories exist (e.g. src/index.css)
		const parentSegments = filename.split(/[/\\]/).filter(Boolean).slice(0, -1);
		if (parentSegments.length > 0) {
			try {
				await vscode.workspace.fs.createDirectory(
					vscode.Uri.joinPath(folders[0].uri, ...parentSegments)
				);
			} catch {
				// already exists or not needed
			}
		}

		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
		vscode.window.showInformationMessage(`Created ${filename}`);
		if (!options.skipOpen) {
			const doc = await vscode.workspace.openTextDocument(fileUri);
			await vscode.window.showTextDocument(doc, { preview: false });
		}
	} catch {
		vscode.window.showErrorMessage(`Failed to create ${filename}`);
	}
}
