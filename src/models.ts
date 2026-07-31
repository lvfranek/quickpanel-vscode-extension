export interface FileTemplate {
	id: string;
	name: string;
	filename: string;
	content: string;
	/** When true, appears in the one-click favorites strip. */
	favorite?: boolean;
}

export interface ProjectStep {
	id: string;
	label: string;
	type: 'file' | 'command';
	filename?: string;
	content?: string;
	command?: string;
}

export interface ProjectType {
	id: string;
	name: string;
	description: string;
	steps: ProjectStep[];
	/**
	 * Exclusive category:
	 * - terminal: single-line terminal command
	 * - process: multi-step workflow
	 * Legacy values (quick / skill) are normalized to terminal in the UI.
	 */
	kind?: 'terminal' | 'process' | 'quick' | 'skill';
	/** When true, appears in the one-click favorites strip. */
	favorite?: boolean;
}

/** Payload sent from the webview when running process steps. */
export interface ProjectStepPayload {
	stepType: 'file' | 'command';
	label?: string;
	filename?: string;
	content?: string;
	commandText?: string;
}

export interface CreateFileOptions {
	/** Skip the overwrite confirmation dialog */
	force?: boolean;
	/** Do not open the file in the editor after writing */
	skipOpen?: boolean;
}

/** Initial snapshot embedded into the webview. */
export interface WebviewInitialData {
	files: FileTemplate[];
	projects: ProjectType[];
}
