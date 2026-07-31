import type * as vscode from 'vscode';
import { getDefaultFiles, getDefaultProjects } from './defaults';
import type { FileTemplate, ProjectType } from './models';

/**
 * Bump this when default templates / schema should replace stored data
 * for all users (including existing installs).
 */
export const DATA_VERSION = 3;

const KEYS = {
	version: 'dataVersion',
	files: 'files',
	projects: 'projects',
	// Removed features — cleaned up on migrate
	notes: 'notes',
	shortcuts: 'shortcuts',
} as const;

export interface StoredPanelData {
	files: FileTemplate[];
	projects: ProjectType[];
}

/**
 * Load files/projects, applying a one-time reset to current defaults
 * when DATA_VERSION is newer than what the user has stored.
 */
export async function loadPanelData(
	context: vscode.ExtensionContext
): Promise<StoredPanelData> {
	const storedVersion = context.globalState.get<number>(KEYS.version, 0);

	if (storedVersion < DATA_VERSION) {
		const files = getDefaultFiles();
		const projects = getDefaultProjects();

		await context.globalState.update(KEYS.files, files);
		await context.globalState.update(KEYS.projects, projects);
		await context.globalState.update(KEYS.notes, undefined);
		await context.globalState.update(KEYS.shortcuts, undefined);
		await context.globalState.update(KEYS.version, DATA_VERSION);

		return { files, projects };
	}

	return {
		files: context.globalState.get(KEYS.files, getDefaultFiles()),
		projects: context.globalState.get(KEYS.projects, getDefaultProjects()),
	};
}

export async function saveFiles(
	context: vscode.ExtensionContext,
	files: FileTemplate[]
): Promise<void> {
	await context.globalState.update(KEYS.files, files);
}

export async function saveProjects(
	context: vscode.ExtensionContext,
	projects: ProjectType[]
): Promise<void> {
	await context.globalState.update(KEYS.projects, projects);
}
