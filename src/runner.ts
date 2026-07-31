import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProjectStepPayload } from './models';
import { createFile } from './files';
import { runInTerminal } from './terminal';

/**
 * Build a short-lived Node runner that executes process steps in order.
 * Keeps the terminal command one line (`node /tmp/...js`) while still
 * waiting for each scaffold command before writing follow-up files.
 */
export function buildRunnerScript(cwd: string, steps: ProjectStepPayload[]): string {
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
export async function runAllProjectSteps(steps: ProjectStepPayload[], processName?: string) {
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
