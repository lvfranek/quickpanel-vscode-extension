import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface Shortcut {
	id: string;
	title: string;
	description: string;
}

interface Note {
	id: string;
	title: string;
	content: string;
}

interface FileTemplate {
	id: string;
	name: string;
	filename: string;
	content: string;
}

interface ProjectStep {
	id: string;
	label: string;
	type: 'file' | 'command';
	filename?: string;
	content?: string;
	command?: string;
}

interface ProjectType {
	id: string;
	name: string;
	description: string;
	steps: ProjectStep[];
}

export function activate(context: vscode.ExtensionContext) {
	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);
	statusBarItem.text = "$(zap) Quickpanel";
	statusBarItem.tooltip = "Open Quickpanel";
	statusBarItem.command = "quickpanel.open";
	statusBarItem.show();

	const openCommand = vscode.commands.registerCommand("quickpanel.open", () => {
		const panel = vscode.window.createWebviewPanel(
			"quickpanel",
			"Quickpanel",
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
			}
		);
		panel.iconPath = new vscode.ThemeIcon("zap");

		// Defaults apply only when the key has never been set (fresh install).
		const shortcuts: Shortcut[] = context.globalState.get("shortcuts", getDefaultShortcuts());
		const notes: Note[] = context.globalState.get("notes", []);
		const files: FileTemplate[] = context.globalState.get("files", getDefaultFiles());
		const projects: ProjectType[] = context.globalState.get("projects", getDefaultProjects());

		panel.webview.html = getWebviewContent(
			panel.webview,
			context.extensionUri,
			shortcuts,
			notes,
			files,
			projects
		);

		panel.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case "saveShortcuts":
					await context.globalState.update("shortcuts", message.data);
					break;
				case "saveNotes":
					await context.globalState.update("notes", message.data);
					break;
				case "saveFiles":
					await context.globalState.update("files", message.data);
					break;
				case "saveProjects":
					await context.globalState.update("projects", message.data);
					break;
				case "createFile":
					await createFile(message.filename, message.content);
					break;
				case "runProjectStep":
					if (message.stepType === 'file') {
						await createFile(message.filename, message.content);
					} else {
						await runInTerminal(message.commandText, undefined, message.label);
					}
					break;
				case "runAllProjectSteps":
					await runAllProjectSteps(message.steps ?? [], message.processName);
					break;
			}
		});
	});

	context.subscriptions.push(statusBarItem, openCommand);
}

const DEFAULT_ENV_CONTENT = "NODE_ENV=development\n";

const DEFAULT_AGENTS_MD = `# CRITICAL RULES - MUST FOLLOW
## RESPONSES
- Keep responses concise and to the point - unless the user asks otherwise
## PLANNING MODE
- Always ask clarifying questions
- Never assume design, tech stack or features
- Use deep-dive sub-agents to assist with research
- Use deep-dive sub-agents to review the different aspects of your plan before presenting to the user
## CHANGE / EDIT MODE
- Never implement features yourself when possible - use sub-agents!
- Identify changes from the plan that can be implemented in parallel, and use sub-agents to implement the features efficiently
- When using sub-agents to implement features, act as a coordinator only
- Use the best model for the task - premium models for complex tasks (like coding) and mid-tier models for simpler tasks, like documentation
- After completing features (large or small), always run commands like lint, type check and next build to check code quality
## DATABASE SCHEMA CHANGES
- Whenever you make changes to the database schema, ALWAYS run the drizzle generate and migrate commands
- NEVER run drizzle push!
- For all ID columns NOT related to BetterAuth, use UUID for the ID columns and be randomly generated
## TESTING
- Use any testing tools, libraries available to the project for testing your changes
- Never assume your changes simply work, always test!
- If the project does not have any testing tools, scripts, MCP tools, skills, etc. available for testing, ask the user whether testing should be skipped.
## UI DESIGN
- Always follow the UI design system when creating or reviewing components or pages.
- Design System: @DESIGN.md
`;

const DEFAULT_GITIGNORE = `### macOS ###
# General
.DS_Store
.AppleDouble
.LSOverride

# Icon must end with two \\r
Icon\r\r

# Thumbnails
._*

# Files that might appear in the root of a volume
.DocumentRevisions-V100
.fseventsd
.Spotlight-V100
.TemporaryItems
.Trashes
.VolumeIcon.icns
.com.apple.timemachine.donotpresent

# Directories potentially created on remote AFP share
.AppleDB
.AppleDesktop
Network Trash Folder
Temporary Items
.apdisk

### macOS Patch ###
# iCloud generated files
*.icloud

### Windows ###
# Windows thumbnail cache files
Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
ehthumbs_vista.db

# Dump file
*.stackdump

# Folder config file
[Dd]esktop.ini

# Recycle Bin used on file shares
$RECYCLE.BIN/

# Windows Installer files
*.cab
*.msi
*.msix
*.msm
*.msp

# Windows shortcuts
*.lnk

# Environment
.env
`;

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Hello World</h1>
  <script src="script.js" defer></script>
</body>
</html>
`;

const DEFAULT_CSS = `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.5;
  padding: 2rem;
  color: #111;
  background: #fff;
}
`;

function getDefaultShortcuts(): Shortcut[] {
	return [
		{
			id: "sc1",
			title: "Format Document",
			description: "Mac: Option + Shift + F  |  Windows/Linux: Shift + Alt + F"
		}
	];
}

function getDefaultFiles(): FileTemplate[] {
	return [
		{ id: "1", name: ".env", filename: ".env", content: DEFAULT_ENV_CONTENT },
		{ id: "2", name: ".gitignore", filename: ".gitignore", content: DEFAULT_GITIGNORE },
		{ id: "3", name: "AGENTS.md", filename: "AGENTS.md", content: DEFAULT_AGENTS_MD },
		{ id: "4", name: "README.md", filename: "README.md", content: "# Project\n" }
	];
}

function getDefaultProjects(): ProjectType[] {
	return [
		// ── Processes ──
		// Scaffolders (Next / Vite / Angular) must run in a mostly empty folder.
		// File steps that add .env / AGENTS.md always come AFTER the scaffold command
		// so Run All can wait for the scaffold before writing follow-up files.
		//
		// AGENTS.md (repo root) = passive project-wide agent rules.
		// Skills (npx skills add) install into .agents/skills/<name>/SKILL.md — separate system.
		{
			id: "proj1",
			name: "Create Next.js App",
			description: "Scaffold a Next.js app (empty folder required), then add .env and root AGENTS.md project rules",
			steps: [
				{
					id: "p1s1",
					label: "Create a new Next.js application with TypeScript, Tailwind, ESLint and App Router in the current folder",
					type: "command",
					command: "npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias \"@/*\" --use-npm"
				},
				{
					id: "p1s2",
					label: "Add a .env file with NODE_ENV set to development (after scaffold finishes)",
					type: "file",
					filename: ".env",
					content: DEFAULT_ENV_CONTENT
				},
				{
					id: "p1s3",
					label: "Add AGENTS.md at repo root with project-wide agent rules (not a skill; after scaffold finishes)",
					type: "file",
					filename: "AGENTS.md",
					content: DEFAULT_AGENTS_MD
				}
			]
		},
		{
			id: "proj2",
			name: "Create React (Vite) App",
			description: "Scaffold a React + TypeScript Vite app (empty folder required), install deps, add .env",
			steps: [
				{
					id: "p2s1",
					label: "Create a new React TypeScript project with Vite in the current folder",
					type: "command",
					command: "npm create vite@latest . -- --template react-ts"
				},
				{
					id: "p2s2",
					label: "Install project dependencies",
					type: "command",
					command: "npm install"
				},
				{
					id: "p2s3",
					label: "Add a .env file with VITE_APP_NAME for client-side config (after scaffold finishes)",
					type: "file",
					filename: ".env",
					content: "VITE_APP_NAME=my-app\n"
				}
			]
		},
		{
			id: "proj3",
			name: "Create Simple HTML + CSS + JS",
			description: "Three-file static site: HTML, CSS reset and a starter script (safe in any folder)",
			steps: [
				{
					id: "p3s1",
					label: "Create a clean modern HTML5 boilerplate linked to style.css and script.js",
					type: "file",
					filename: "index.html",
					content: DEFAULT_HTML
				},
				{
					id: "p3s2",
					label: "Create a simple CSS reset with a system font stack",
					type: "file",
					filename: "style.css",
					content: DEFAULT_CSS
				},
				{
					id: "p3s3",
					label: "Create script.js with a Hello World console log",
					type: "file",
					filename: "script.js",
					content: "console.log('Hello World');\n"
				}
			]
		},
		{
			id: "proj4",
			name: "Create Angular App",
			description: "Scaffold an Angular app via npx (empty folder required), then add .env",
			steps: [
				{
					id: "p4s1",
					label: "Create a new Angular project in the current folder with routing and SCSS (no global CLI install)",
					type: "command",
					command: "npx -y @angular/cli@latest new . --routing --style=scss --skip-git --defaults --ssr=false"
				},
				{
					id: "p4s2",
					label: "Add a .env file with NODE_ENV set to development (after scaffold finishes)",
					type: "file",
					filename: ".env",
					content: DEFAULT_ENV_CONTENT
				}
			]
		},
		{
			id: "proj5",
			name: "Add Tailwind CSS",
			description: "Install Tailwind CSS v4 + Vite plugin, then write src/index.css import (run inside an existing app)",
			steps: [
				{
					id: "p5s1",
					label: "Install Tailwind CSS and the official @tailwindcss/vite plugin as dev dependencies",
					type: "command",
					command: "npm install -D tailwindcss @tailwindcss/vite"
				},
				{
					id: "p5s2",
					label: "Add the Tailwind CSS import to src/index.css (also register tailwindcss() in vite.config plugins)",
					type: "file",
					filename: "src/index.css",
					content: '@import "tailwindcss";\n'
				}
			]
		},
		{
			id: "proj6",
			name: "Create Clean Empty Project",
			description: "Minimal starter files only (no scaffolder): gitignore, env, README and root AGENTS.md",
			steps: [
				{
					id: "p6s1",
					label: "Add a .gitignore covering macOS, Windows and .env",
					type: "file",
					filename: ".gitignore",
					content: DEFAULT_GITIGNORE
				},
				{
					id: "p6s2",
					label: "Add a .env file with NODE_ENV set to development",
					type: "file",
					filename: ".env",
					content: DEFAULT_ENV_CONTENT
				},
				{
					id: "p6s3",
					label: "Add a minimal README.md",
					type: "file",
					filename: "README.md",
					content: "# Project\n\n"
				},
				{
					id: "p6s4",
					label: "Add AGENTS.md at repo root with project-wide agent rules (not a skill package)",
					type: "file",
					filename: "AGENTS.md",
					content: DEFAULT_AGENTS_MD
				}
			]
		},
		// ── Skills (install into .agents/skills/<name>/SKILL.md — separate from root AGENTS.md) ──
		{
			id: "skill1",
			name: "Add React/Next.js Best Practices Skill",
			description: "Installs into .agents/skills/… (SKILL.md). Separate from root AGENTS.md project rules.",
			steps: [
				{
					id: "sk1s1",
					label: "Install vercel-react-best-practices into .agents/skills via the skills CLI",
					type: "command",
					command: "npx -y skills add vercel-labs/agent-skills --skill vercel-react-best-practices"
				}
			]
		},
		{
			id: "skill2",
			name: "Add Supabase Postgres Best Practices Skill",
			description: "Installs into .agents/skills/… (SKILL.md). Separate from root AGENTS.md project rules.",
			steps: [
				{
					id: "sk2s1",
					label: "Install supabase-postgres-best-practices into .agents/skills via the skills CLI",
					type: "command",
					command: "npx -y skills add supabase/agent-skills --skill supabase-postgres-best-practices"
				}
			]
		}
	];
}

interface ProjectStepPayload {
	stepType: 'file' | 'command';
	label?: string;
	filename?: string;
	content?: string;
	commandText?: string;
}

interface CreateFileOptions {
	/** Skip the overwrite confirmation dialog */
	force?: boolean;
	/** Do not open the file in the editor after writing */
	skipOpen?: boolean;
}

async function createFile(filename: string, content: string, options: CreateFileOptions = {}) {
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

/** Always open a fresh terminal — never reuse an existing one. */
function createQuickpanelTerminal(cwd?: string, label?: string): vscode.Terminal {
	const raw = (label || 'run').replace(/\s+/g, ' ').trim();
	const short = raw.length > 40 ? raw.slice(0, 37) + '…' : raw;
	const terminal = vscode.window.createTerminal({
		name: `Quickpanel: ${short}`,
		cwd: cwd || undefined
	});
	terminal.show();
	return terminal;
}

async function runInTerminal(command: string, cwd?: string, label?: string) {
	const terminal = createQuickpanelTerminal(cwd, label);
	terminal.sendText(command);
}

/**
 * Build a short-lived Node runner that executes process steps in order.
 * Keeps the terminal command one line (`node /tmp/...js`) while still
 * waiting for each scaffold command before writing follow-up files.
 */
function buildRunnerScript(cwd: string, steps: ProjectStepPayload[]): string {
	const lines: string[] = [
		`'use strict';`,
		`const { execSync } = require('child_process');`,
		`const fs = require('fs');`,
		`const path = require('path');`,
		`const cwd = ${JSON.stringify(cwd)};`,
		`process.chdir(cwd);`,
		`let n = 0;`,
		`function runCmd(label, cmd) {`,
		`  n++;`,
		`  console.log('\\n▶ [' + n + '] ' + label);`,
		`  execSync(cmd, { stdio: 'inherit', shell: true, cwd });`,
		`}`,
		`function writeFile(label, filename, content) {`,
		`  n++;`,
		`  console.log('\\n▶ [' + n + '] ' + label);`,
		`  const full = path.resolve(cwd, filename);`,
		`  fs.mkdirSync(path.dirname(full), { recursive: true });`,
		`  fs.writeFileSync(full, content, 'utf8');`,
		`  console.log('   ✓ wrote ' + filename);`,
		`}`,
		`try {`
	];

	for (const step of steps) {
		if (step.stepType === 'command' && step.commandText) {
			const label = step.label || step.commandText;
			lines.push(
				`  runCmd(${JSON.stringify(label)}, ${JSON.stringify(step.commandText)});`
			);
		} else if (step.stepType === 'file' && step.filename) {
			const label = step.label || `Create ${step.filename}`;
			lines.push(
				`  writeFile(${JSON.stringify(label)}, ${JSON.stringify(step.filename)}, ${JSON.stringify(step.content ?? '')});`
			);
		}
	}

	lines.push(
		`  console.log('\\n✓ All steps finished');`,
		`} catch (err) {`,
		`  console.error('\\n✗ Step failed:', err && err.message ? err.message : err);`,
		`  process.exitCode = 1;`,
		`} finally {`,
		`  try { fs.unlinkSync(__filename); } catch (_) {}`,
		`}`
	);

	return lines.join('\n');
}

/**
 * Run every process step in order.
 * File-only processes use the VS Code FS API.
 * Processes that include commands write a temp runner script and execute it
 * with a single short `node …` line so the terminal stays readable.
 */
async function runAllProjectSteps(steps: ProjectStepPayload[], processName?: string) {
	if (!steps.length) {
		return;
	}

	const hasCommand = steps.some(s => s.stepType === 'command');

	if (!hasCommand) {
		for (const step of steps) {
			if (step.stepType === 'file' && step.filename) {
				await createFile(step.filename, step.content ?? '', { force: true, skipOpen: true });
			}
		}
		vscode.window.showInformationMessage(`Created ${steps.length} file(s)`);
		return;
	}

	const folders = vscode.workspace.workspaceFolders;
	if (!folders) {
		vscode.window.showErrorMessage("Open a folder first");
		return;
	}

	const cwd = folders[0].uri.fsPath;
	const scriptPath = path.join(os.tmpdir(), `quickpanel-run-${Date.now()}.js`);

	try {
		fs.writeFileSync(scriptPath, buildRunnerScript(cwd, steps), 'utf8');
	} catch {
		vscode.window.showErrorMessage('Failed to prepare process runner script');
		return;
	}

	// One short, readable line in a brand-new terminal — sequential steps, no quoting hell
	const label = processName ? `Run All — ${processName}` : 'Run All';
	await runInTerminal(`node ${JSON.stringify(scriptPath)}`, cwd, label);
}

function getWebviewContent(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	shortcuts: Shortcut[],
	notes: Note[],
	files: FileTemplate[],
	projects: ProjectType[]
): string {
	// Encode ALL data as base64 so it can be embedded in an HTML attribute
	// without any risk of breaking the HTML structure (no </script>, no quotes to escape).
	const dataB64 = Buffer.from(
		JSON.stringify({ shortcuts, notes, files, projects })
	).toString('base64');

	// Serve webview.js from the media folder
	const scriptUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'media', 'webview.js')
	);

	// Nonce for Content Security Policy
	const nonce = getNonce();

	return [
		'<!DOCTYPE html>',
		'<html lang="en">',
		'<head>',
		'  <meta charset="UTF-8">',
		'  <meta http-equiv="Content-Security-Policy"',
		'        content="default-src \'none\'; script-src ' + webview.cspSource + ' \'nonce-' + nonce + '\'; style-src \'unsafe-inline\';">',
		'  <style>',
		'    * { box-sizing: border-box; margin: 0; padding: 0; }',
		'    body {',
		'      font-family: var(--vscode-font-family);',
		'      background: var(--vscode-editor-background);',
		'      color: var(--vscode-foreground);',
		'      padding: 14px;',
		'      font-size: 13px;',
		'    }',
		'    .tabs-row {',
		'      display: flex; align-items: stretch; gap: 8px; margin-bottom: 16px;',
		'    }',
		'    .tabs {',
		'      display: flex; gap: 4px; flex: 1; min-width: 0;',
		'      background: var(--vscode-input-background); padding: 4px;',
		'      border-radius: 8px; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));',
		'    }',
		'    .tab {',
		'      flex: 1; padding: 6px 8px; border: none; border-radius: 6px;',
		'      background: transparent; color: var(--vscode-foreground);',
		'      cursor: pointer; font-size: 12px; font-weight: 500; text-align: center;',
		'      transition: all 0.15s ease; opacity: 0.7;',
		'    }',
		'    .tab:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }',
		'    .tab.active {',
		'      background: var(--vscode-button-background); color: var(--vscode-button-foreground);',
		'      opacity: 1; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.2);',
		'    }',
		'    .info-tab-shell {',
		'      flex: 0 0 auto;',
		'      display: flex; align-items: stretch;',
		'      background: var(--vscode-input-background); padding: 4px;',
		'      border-radius: 8px;',
		'      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));',
		'    }',
		'    .info-tab {',
		'      flex: 0 0 auto; width: 26px; min-width: 26px; padding: 6px 0;',
		'      display: flex; align-items: center; justify-content: center;',
		'      font-family: var(--vscode-font-family);',
		'      font-size: 12px; font-weight: 600; font-style: normal;',
		'      line-height: 1; letter-spacing: 0;',
		'    }',
		'    .info-card {',
		'      background: var(--vscode-input-background); border-radius: 8px;',
		'      padding: 14px 14px 10px; margin-bottom: 10px;',
		'      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));',
		'    }',
		'    .info-card h3 {',
		'      margin: 0 0 8px; font-size: 13px; opacity: 1;',
		'      text-transform: none; letter-spacing: 0; font-weight: 600;',
		'    }',
		'    .info-card p, .info-card li {',
		'      font-size: 12px; line-height: 1.55; opacity: 0.85; margin: 0 0 8px;',
		'    }',
		'    .info-card ul { margin: 0 0 4px 18px; padding: 0; }',
		'    .info-card li { margin-bottom: 4px; }',
		'    .info-card p:last-child, .info-card ul:last-child { margin-bottom: 0; }',
		'    .section { display: none; }',
		'    .section.active { display: block; }',
		'    .item {',
		'      background: var(--vscode-input-background); border-radius: 8px;',
		'      padding: 10px 10px 10px 6px; margin-bottom: 8px;',
		'      display: flex; align-items: flex-start; gap: 6px;',
		'      transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;',
		'    }',
		'    .item.dragging { opacity: 0.4; transform: scale(0.98); }',
		'    .item.drag-over { box-shadow: 0 0 0 2px var(--vscode-focusBorder); }',
		'    .file-row {',
		'      background: var(--vscode-input-background); border-radius: 8px;',
		'      padding: 10px 10px 10px 6px; margin-bottom: 8px;',
		'      display: flex; align-items: center; gap: 6px;',
		'      transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;',
		'    }',
		'    .file-row.dragging { opacity: 0.4; transform: scale(0.98); }',
		'    .file-row.drag-over { box-shadow: 0 0 0 2px var(--vscode-focusBorder); }',
		'    .file-row .info { flex: 1; cursor: pointer; }',
		'    .file-row strong { display: block; margin-bottom: 2px; font-size: 13px; }',
		'    .file-row span { opacity: 0.65; font-size: 12px; }',
		'    .drag-handle {',
		'      cursor: grab; padding: 4px 2px; opacity: 0.45;',
		'      font-size: 14px; line-height: 1; user-select: none;',
		'      flex-shrink: 0; margin-top: 2px;',
		'      -webkit-user-drag: none;',
		'    }',
		'    .drag-handle:active { cursor: grabbing; }',
		'    .drag-handle:hover { opacity: 0.8; }',
		'    .step-item .drag-handle { margin-top: 0; align-self: center; }',
		'    .item-content { flex: 1; min-width: 0; }',
		'    .item-title { font-weight: 500; margin-bottom: 3px; word-break: break-word; }',
		'    .item-desc {',
		'      opacity: 0.75; font-size: 12px; white-space: pre-wrap;',
		'      word-break: break-word; max-height: 58px; overflow: hidden;',
		'    }',
		'    .item-desc.expanded { max-height: none; }',
		'    .show-more {',
		'      color: var(--vscode-textLink-foreground); cursor: pointer;',
		'      font-size: 11px; margin-top: 4px; display: inline-block;',
		'    }',
		'    .actions { display: flex; gap: 2px; flex-shrink: 0; }',
		'    .icon-btn {',
		'      background: transparent; border: none; color: var(--vscode-foreground);',
		'      cursor: pointer; font-size: 14px; padding: 3px 6px;',
		'      opacity: 0.55; border-radius: 4px;',
		'    }',
		'    .icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }',
		'    .icon-btn.danger:hover { color: var(--vscode-errorForeground); }',
		'    .add-form {',
		'      display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px;',
		'      background: var(--vscode-input-background); padding: 12px; border-radius: 8px;',
		'    }',
		'    input, textarea, select {',
		'      background: var(--vscode-editor-background); color: var(--vscode-foreground);',
		'      border: 1px solid var(--vscode-panel-border); border-radius: 6px;',
		'      padding: 8px 10px; font-family: inherit; font-size: 13px; width: 100%;',
		'    }',
		'    textarea { min-height: 80px; resize: vertical; }',
		'    .md-toolbar { display: flex; gap: 4px; flex-wrap: wrap; }',
		'    .md-btn {',
		'      background: var(--vscode-editor-background);',
		'      border: 1px solid var(--vscode-panel-border);',
		'      color: var(--vscode-foreground); border-radius: 4px;',
		'      padding: 4px 8px; font-size: 12px; cursor: pointer;',
		'    }',
		'    .md-btn:hover { background: var(--vscode-list-hoverBackground); }',
		'    .btn {',
		'      background: var(--vscode-button-background);',
		'      color: var(--vscode-button-foreground);',
		'      border: none; border-radius: 6px; padding: 8px 14px;',
		'      cursor: pointer; font-size: 13px; align-self: flex-start; white-space: nowrap;',
		'    }',
		'    .btn:hover { opacity: 0.88; }',
		'    .btn.secondary {',
		'      background: transparent; border: 1px solid var(--vscode-panel-border);',
		'      color: var(--vscode-foreground);',
		'    }',
		'    .btn.small { padding: 4px 10px; font-size: 12px; }',
		'    .btn-row { display: flex; gap: 8px; flex-wrap: wrap; }',
		'    h3 {',
		'      margin: 18px 0 10px; font-size: 11px; opacity: 0.6;',
		'      text-transform: uppercase; letter-spacing: 0.5px;',
		'    }',
		'    h3:first-child { margin-top: 0; }',
		'    .empty { opacity: 0.45; font-size: 12px; padding: 8px 0; }',
		'    .hint {',
		'      display: flex; gap: 8px; align-items: flex-start;',
		'      background: var(--vscode-inputValidation-infoBackground, var(--vscode-input-background));',
		'      border: 1px solid var(--vscode-inputValidation-infoBorder, var(--vscode-focusBorder));',
		'      color: var(--vscode-foreground);',
		'      border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;',
		'      font-size: 12px; line-height: 1.45; opacity: 0.95;',
		'    }',
		'    .hint-icon { flex-shrink: 0; opacity: 0.8; }',
		'    .hint-text { opacity: 0.85; }',
		'    .md-bold { font-weight: 600; }',
		'    .md-italic { font-style: italic; }',
		'    .md-code {',
		'      background: var(--vscode-textCodeBlock-background);',
		'      padding: 1px 5px; border-radius: 3px;',
		'      font-family: var(--vscode-editor-font-family); font-size: 12px;',
		'    }',
		'    /* Modal */',
		'    .modal-backdrop {',
		'      position: fixed; inset: 0; background: rgba(0,0,0,0.5);',
		'      display: flex; align-items: center; justify-content: center; z-index: 9999;',
		'    }',
		'    .modal-backdrop.hidden { display: none; }',
		'    .modal-box {',
		'      background: var(--vscode-editor-background);',
		'      border: 1px solid var(--vscode-panel-border);',
		'      border-radius: 10px; padding: 20px 24px; max-width: 340px; width: 90%;',
		'      box-shadow: 0 8px 32px rgba(0,0,0,0.4);',
		'    }',
		'    .modal-title { font-weight: 600; font-size: 14px; margin-bottom: 8px; }',
		'    .modal-body {',
		'      font-size: 12px; opacity: 0.8; margin-bottom: 16px;',
		'      line-height: 1.5; word-break: break-all; white-space: pre-wrap;',
		'    }',
		'    .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }',
		'    /* Processes */',
		'    .project-card {',
		'      background: var(--vscode-input-background); border-radius: 8px;',
		'      margin-bottom: 8px; overflow: hidden;',
		'      transition: box-shadow 0.15s ease, opacity 0.15s ease, transform 0.15s ease;',
		'    }',
		'    .project-card.dragging { opacity: 0.4; transform: scale(0.98); }',
		'    .project-card.drag-over { box-shadow: 0 0 0 2px var(--vscode-focusBorder); }',
		'    .project-header { display: flex; align-items: center; gap: 8px; padding: 10px; }',
		'    .project-header-info { flex: 1; cursor: pointer; min-width: 0; }',
		'    .project-name { font-weight: 600; font-size: 13px; margin-bottom: 2px; }',
		'    .project-desc { opacity: 0.65; font-size: 11px; }',
		'    .expand-btn {',
		'      background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border);',
		'      color: var(--vscode-foreground); border-radius: 5px; padding: 3px 8px;',
		'      font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center;',
		'      gap: 4px; flex-shrink: 0; margin-right: 4px; transition: all 0.15s ease;',
		'    }',
		'    .expand-btn:hover { background: var(--vscode-list-hoverBackground); border-color: var(--vscode-focusBorder); }',
		'    .project-body { display: none; padding: 0 10px 10px 10px; border-top: 1px solid var(--vscode-panel-border); }',
		'    .project-card.open .project-body { display: block; }',
		'    .steps-list { margin: 10px 0 8px; }',
		'    .step-item {',
		'      display: flex; align-items: center; gap: 6px;',
		'      background: var(--vscode-editor-background); border-radius: 6px;',
		'      padding: 8px 8px 8px 4px; margin-bottom: 6px;',
		'      transition: box-shadow 0.15s, opacity 0.15s, transform 0.15s;',
		'    }',
		'    .step-item.dragging { opacity: 0.4; transform: scale(0.98); }',
		'    .step-item.drag-over { box-shadow: 0 0 0 2px var(--vscode-focusBorder); }',
		'    .step-number {',
		'      width: 20px; height: 20px; border-radius: 50%;',
		'      background: var(--vscode-button-background); color: var(--vscode-button-foreground);',
		'      font-size: 10px; font-weight: 700; display: flex; align-items: center;',
		'      justify-content: center; flex-shrink: 0;',
		'    }',
		'    .step-info { flex: 1; min-width: 0; }',
		'    .step-label { font-size: 12px; font-weight: 500; }',
		'    .step-detail {',
		'      font-size: 11px; opacity: 0.6; margin-top: 3px;',
		'      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
		'      font-family: var(--vscode-editor-font-family);',
		'    }',
		'    .step-type-badge {',
		'      display: inline-block; font-size: 10px; padding: 1px 5px;',
		'      border-radius: 3px; margin-top: 2px; opacity: 0.75;',
		'    }',
		'    .step-type-badge.file { background: var(--vscode-editorInfo-foreground); color: #000; }',
		'    .step-type-badge.command { background: var(--vscode-terminal-ansiGreen); color: #000; }',
		'    .step-actions { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }',
		'    .step-item.step-editing { box-shadow: 0 0 0 1px var(--vscode-focusBorder); }',
		'    .run-all-row {',
		'      display: flex; gap: 8px; align-items: center; margin-top: 6px;',
		'      padding-top: 8px; border-top: 1px solid var(--vscode-panel-border);',
		'    }',
		'    .add-step-form {',
		'      background: var(--vscode-editor-background);',
		'      border: 1px solid var(--vscode-panel-border);',
		'      border-radius: 6px; padding: 10px; margin-top: 8px;',
		'      display: flex; flex-direction: column; gap: 6px;',
		'    }',
		'    .add-step-form.hidden { display: none; }',
		'    .step-form-title {',
		'      font-size: 11px; font-weight: 600; opacity: 0.7;',
		'      text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px;',
		'    }',
		'    .step-type-toggle { display: flex; gap: 6px; }',
		'    .type-opt {',
		'      flex: 1; padding: 5px 8px;',
		'      border: 1px solid var(--vscode-panel-border);',
		'      border-radius: 5px; background: transparent;',
		'      color: var(--vscode-foreground); cursor: pointer; font-size: 12px; text-align: center;',
		'    }',
		'    .type-opt.selected {',
		'      background: var(--vscode-button-background);',
		'      color: var(--vscode-button-foreground);',
		'      border-color: var(--vscode-button-background);',
		'    }',
		'  </style>',
		'</head>',
		'<body>',
		'  <!-- Data carrier: base64-encoded JSON, safe in any attribute value -->',
		'  <div id="initial-data" style="display:none" data-json="' + dataB64 + '"></div>',
		'',
		'  <!-- Confirm Modal -->',
		'  <div class="modal-backdrop hidden" id="confirm-modal">',
		'    <div class="modal-box">',
		'      <div class="modal-title" id="modal-title">Confirm</div>',
		'      <div class="modal-body" id="modal-body"></div>',
		'      <div class="modal-actions">',
		'        <button class="btn secondary small" id="modal-cancel">Cancel</button>',
		'        <button class="btn small" id="modal-confirm">Yes, proceed</button>',
		'      </div>',
		'    </div>',
		'  </div>',
		'',
		'  <div class="tabs-row">',
		'    <div class="tabs">',
		'      <button class="tab active" data-tab="projects">Processes & Skills</button>',
		'      <button class="tab" data-tab="files">Files</button>',
		'      <button class="tab" data-tab="notes">Notes</button>',
		'      <button class="tab" data-tab="shortcuts">Shortcuts</button>',
		'    </div>',
		'    <div class="info-tab-shell">',
		'      <button class="tab info-tab" data-tab="info" title="How to use Quickpanel" aria-label="How to use Quickpanel">i</button>',
		'    </div>',
		'  </div>',
		'',
		'  <!-- INFO -->',
		'  <div id="info" class="section">',
		'    <div class="info-card">',
		'      <h3>What is this?</h3>',
		'      <p>Quickpanel is a little helper next to your code. You can save steps, files, notes, and keyboard tips in one place.</p>',
		'    </div>',
		'    <div class="info-card">',
		'      <h3>How do I open it?</h3>',
		'      <ul>',
		'        <li>Click <strong>⚡ Quickpanel</strong> in the bottom-right status bar, or</li>',
		'        <li>Open the Command Palette and run <strong>Open Quickpanel</strong>.</li>',
		'      </ul>',
		'    </div>',
		'    <div class="info-card">',
		'      <h3>Processes &amp; Skills</h3>',
		'      <p>A <strong>process</strong> is a todo list of steps. A step can:</p>',
		'      <ul>',
		'        <li>run a command in a new terminal, or</li>',
		'        <li>create a file for you.</li>',
		'      </ul>',
		'      <p>Press the play button on one step, or <strong>Run All Steps</strong> to do them in order (commands finish before later files are created).</p>',
		'      <p><strong>Skills</strong> install helper packs for AI tools into <code>.agents/skills/…</code>. That is different from the root <code>AGENTS.md</code> file (project-wide rules).</p>',
		'      <p>Tip: app installers (Next.js, Vite, Angular) need an almost empty folder.</p>',
		'    </div>',
		'    <div class="info-card">',
		'      <h3>Files</h3>',
		'      <p>Save file templates (like <code>.env</code> or <code>README.md</code>). One click creates that file in your project folder.</p>',
		'    </div>',
		'    <div class="info-card">',
		'      <h3>Notes</h3>',
		'      <p>Write little reminders for yourself. They stay saved in VS Code. They are only for you — they do not change your project files.</p>',
		'    </div>',
		'    <div class="info-card">',
		'      <h3>Shortcuts</h3>',
		'      <p>This is a cheat sheet of keys you want to remember. It does <strong>not</strong> set or change real VS Code keybindings.</p>',
		'    </div>',
		'    <div class="info-card">',
		'      <h3>Drag &amp; drop</h3>',
		'      <p>Grab the little handle on the left of an item to reorder lists and process steps.</p>',
		'    </div>',
		'    <div class="info-card">',
		'      <h3>Your data</h3>',
		'      <p>Everything you add here is saved by the extension and comes back the next time you open VS Code.</p>',
		'    </div>',
		'  </div>',
		'',
		'  <!-- PROCESSES & SKILLS -->',
		'  <div id="projects" class="section active">',
		'    <div class="add-form" id="project-form">',
		'      <input id="proj-name" placeholder="Process name (e.g. Next.js App)" />',
		'      <input id="proj-desc" placeholder="Short description" />',
		'      <div class="btn-row">',
		'        <button class="btn" id="add-project-btn">Add Process</button>',
		'        <button class="btn secondary" id="cancel-project-btn" style="display:none;">Cancel</button>',
		'      </div>',
		'    </div>',
		'    <div id="projects-list"></div>',
		'  </div>',
		'',
		'  <!-- FILES -->',
		'  <div id="files" class="section">',
		'    <div class="add-form">',
		'      <input id="file-name" placeholder="Display name (e.g. .env)" />',
		'      <input id="file-filename" placeholder="Filename (e.g. .env)" />',
		'      <textarea id="file-content" placeholder="File content..."></textarea>',
		'      <div class="btn-row">',
		'        <button class="btn" id="add-file-btn">Add File Template</button>',
		'        <button class="btn secondary" id="cancel-file-btn" style="display:none;">Cancel</button>',
		'      </div>',
		'    </div>',
		'    <div id="files-list"></div>',
		'  </div>',
		'',
		'  <!-- NOTES -->',
		'  <div id="notes" class="section">',
		'    <div class="add-form">',
		'      <input id="note-title" placeholder="Note title" />',
		'      <div class="md-toolbar">',
		'        <button class="md-btn" data-md="bold"><b>B</b></button>',
		'        <button class="md-btn" data-md="italic"><i>I</i></button>',
		'        <button class="md-btn" data-md="code">Code</button>',
		'        <button class="md-btn" data-md="link">Link</button>',
		'      </div>',
		'      <textarea id="note-content" placeholder="Write your note..."></textarea>',
		'      <div class="btn-row">',
		'        <button class="btn" id="add-note-btn">Add Note</button>',
		'        <button class="btn secondary" id="cancel-edit-btn" style="display:none;">Cancel</button>',
		'      </div>',
		'    </div>',
		'    <div id="notes-list"></div>',
		'  </div>',
		'',
		'  <!-- SHORTCUTS -->',
		'  <div id="shortcuts" class="section">',
		'    <div class="hint" role="note">',
		'      <span class="hint-icon" aria-hidden="true">ℹ</span>',
		'      <span class="hint-text">These shortcuts are just personal notes for you. They do not replace, bind, or configure any keybindings in VS Code.</span>',
		'    </div>',
		'    <div class="add-form">',
		'      <input id="sc-title" placeholder="Title (e.g. Toggle Terminal)" />',
		'      <input id="sc-desc" placeholder="Keys or description" />',
		'      <button class="btn" id="add-shortcut-btn">Add Shortcut</button>',
		'    </div>',
		'    <div id="shortcuts-list"></div>',
		'  </div>',
		'',
		'  <script nonce="' + nonce + '" src="' + scriptUri + '"></script>',
		'</body>',
		'</html>'
	].join('\n');
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function deactivate() { }