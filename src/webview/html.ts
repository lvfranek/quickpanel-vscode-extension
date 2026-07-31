import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { WebviewInitialData } from '../models';
import { getNonce } from './nonce';

let cachedTemplate: string | undefined;

function loadTemplate(extensionPath: string): string {
	if (cachedTemplate) {
		return cachedTemplate;
	}
	// media/ ships in the VSIX (.vscodeignore excludes src/**).
	// src/webview is the editable source during development.
	const candidates = [
		path.join(extensionPath, 'media', 'template.html'),
		path.join(extensionPath, 'src', 'webview', 'template.html'),
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			cachedTemplate = fs.readFileSync(candidate, 'utf8');
			return cachedTemplate;
		}
	}
	throw new Error('Quickpanel webview template.html not found');
}

/**
 * Build the webview HTML document.
 * Styles and script are loaded from `media/` via asWebviewUri.
 * Initial data is base64-encoded into a data attribute (safe for HTML).
 */
export function getWebviewContent(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	data: WebviewInitialData
): string {
	// Explicit UTF-8 → base64. The webview must decode with TextDecoder (not raw atob).
	const dataB64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
	const nonce = getNonce();

	const styleUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'media', 'webview.css')
	);
	const scriptUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'media', 'webview.js')
	);

	const body = loadTemplate(extensionUri.fsPath).replaceAll('{{DATA_B64}}', dataB64);

	// CSP: allow our script/style URIs; no inline scripts except nonce (we use external script).
	const csp = [
		"default-src 'none'",
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src ${webview.cspSource} 'nonce-${nonce}'`,
	].join('; ');

	// Critical layout inlined so content is never zero-height if the CSS file lags.
	const criticalCss = [
		'html,body{width:100%;height:100%;margin:0;}',
		'body{box-sizing:border-box;padding:14px;height:100vh;max-height:100vh;',
		'display:flex;flex-direction:column;overflow:hidden;}',
		'.section{display:none;flex:1 1 auto;min-height:0;overflow:auto;}',
		'.section.active{display:block;}',
	].join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${criticalCss}</style>
  <link rel="stylesheet" href="${styleUri}">
  <title>Quickpanel</title>
</head>
<body>
${body}
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
