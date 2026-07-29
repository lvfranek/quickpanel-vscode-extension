import * as vscode from 'vscode';

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

export function activate(context: vscode.ExtensionContext) {
	// Status bar button
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
				retainContextWhenHidden: true
			}
		);

		// Load saved data
		const shortcuts: Shortcut[] = context.globalState.get("shortcuts", []);
		const notes: Note[] = context.globalState.get("notes", []);

		panel.webview.html = getWebviewContent(shortcuts, notes);

		// Handle messages from webview
		panel.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case "createFile":
					await createFile(message.filename, message.content);
					break;

				case "runSkill":
					await runInTerminal(message.commandText);
					break;

				case "saveShortcuts":
					await context.globalState.update("shortcuts", message.shortcuts);
					break;

				case "saveNotes":
					await context.globalState.update("notes", message.notes);
					break;
			}
		});
	});

	context.subscriptions.push(statusBarItem, openCommand);
}

async function createFile(filename: string, content: string) {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders) {
		vscode.window.showErrorMessage("Open a folder first");
		return;
	}

	const fileUri = vscode.Uri.joinPath(folders[0].uri, filename);

	try {
		try {
			await vscode.workspace.fs.stat(fileUri);
			const choice = await vscode.window.showWarningMessage(
				`${filename} already exists. Overwrite?`,
				"Yes",
				"No"
			);
			if (choice !== "Yes") return;
		} catch {
			// doesn't exist
		}

		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
		vscode.window.showInformationMessage(`Created ${filename}`);

		const doc = await vscode.workspace.openTextDocument(fileUri);
		await vscode.window.showTextDocument(doc, { preview: false });
	} catch {
		vscode.window.showErrorMessage(`Failed to create ${filename}`);
	}
}

async function runInTerminal(command: string) {
	const terminal = vscode.window.createTerminal("Quickpanel Skill");
	terminal.show();
	terminal.sendText(command);
}

function getWebviewContent(shortcuts: Shortcut[], notes: Note[]) {
	return /*html*/ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      padding: 14px;
      font-size: 13px;
    }

    .tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 18px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    .tab {
      padding: 6px 14px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 13px;
    }
    .tab.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .section { display: none; }
    .section.active { display: block; }

    .item {
      background: var(--vscode-input-background);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .item:hover { background: var(--vscode-list-hoverBackground); }
    .item-content { flex: 1; cursor: pointer; }
    .item-title { font-weight: 500; margin-bottom: 2px; }
    .item-desc { opacity: 0.7; font-size: 12px; white-space: pre-wrap; }

    .delete-btn {
      background: transparent;
      border: none;
      color: var(--vscode-errorForeground);
      cursor: pointer;
      font-size: 16px;
      padding: 2px 6px;
      opacity: 0.7;
    }
    .delete-btn:hover { opacity: 1; }

    .add-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
      background: var(--vscode-input-background);
      padding: 12px;
      border-radius: 8px;
    }
    input, textarea {
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: 13px;
      width: 100%;
    }
    textarea { min-height: 70px; resize: vertical; }

    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      cursor: pointer;
      font-size: 13px;
      align-self: flex-start;
    }
    .btn:hover { opacity: 0.9; }

    .file-btn {
      background: var(--vscode-input-background);
      border-radius: 8px;
      padding: 11px 14px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .file-btn:hover { background: var(--vscode-list-hoverBackground); }
    .file-btn strong { display: block; margin-bottom: 2px; }
    .file-btn span { opacity: 0.65; font-size: 12px; }

    h3 { margin-bottom: 12px; font-size: 14px; opacity: 0.9; }
    .empty { opacity: 0.5; font-size: 12px; padding: 8px 0; }
  </style>
</head>
<body>
  <div class="tabs">
    <button class="tab active" onclick="showTab('shortcuts')">Shortcuts</button>
    <button class="tab" onclick="showTab('notes')">Notes</button>
    <button class="tab" onclick="showTab('files')">Files & Skills</button>
  </div>

  <!-- SHORTCUTS -->
  <div id="shortcuts" class="section active">
    <div class="add-form">
      <input id="sc-title" placeholder="Shortcut title (e.g. Toggle Terminal)" />
      <input id="sc-desc" placeholder="Description or keys (e.g. Ctrl+\` )" />
      <button class="btn" onclick="addShortcut()">Add Shortcut</button>
    </div>
    <div id="shortcuts-list"></div>
  </div>

  <!-- NOTES -->
  <div id="notes" class="section">
    <div class="add-form">
      <input id="note-title" placeholder="Note title" />
      <textarea id="note-content" placeholder="Write your note... (markdown works)"></textarea>
      <button class="btn" onclick="addNote()">Add Note</button>
    </div>
    <div id="notes-list"></div>
  </div>

  <!-- FILES & SKILLS -->
  <div id="files" class="section">
    <h3>Create Files</h3>
    <div class="file-btn" onclick="createFile('.env', 'NODE_ENV=development\\n')">
      <strong>.env</strong>
      <span>Basic environment file</span>
    </div>
    <div class="file-btn" onclick="createFile('.gitignore', 'node_modules\\n.env\\n.DS_Store\\ndist\\n.next\\n')">
      <strong>.gitignore</strong>
      <span>Common ignores</span>
    </div>
    <div class="file-btn" onclick="createFile('Agents.md', '# Agents\\n\\n')">
      <strong>Agents.md</strong>
      <span>Empty agents file</span>
    </div>
    <div class="file-btn" onclick="createFile('README.md', '# Project\\n\\n')">
      <strong>README.md</strong>
      <span>Basic readme</span>
    </div>

    <h3 style="margin-top: 24px;">AI Skills</h3>
    <div class="file-btn" onclick="runSkill('npx skills add vercel-labs/agent-skills/vercel-react-best-practices')">
      <strong>Next.js / React Best Practices</strong>
      <span>vercel-labs/agent-skills</span>
    </div>
    <div class="file-btn" onclick="runSkill('npx skills add vercel-labs/agent-skills')">
      <strong>All Vercel Agent Skills</strong>
      <span>Full collection</span>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let shortcuts = ${JSON.stringify(shortcuts)};
    let notes = ${JSON.stringify(notes)};

    function showTab(id) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      event.target.classList.add('active');
    }

    function uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    // ===== SHORTCUTS =====
    function renderShortcuts() {
      const list = document.getElementById('shortcuts-list');
      if (shortcuts.length === 0) {
        list.innerHTML = '<div class="empty">No shortcuts yet</div>';
        return;
      }
      list.innerHTML = shortcuts.map(s => \`
        <div class="item">
          <div class="item-content">
            <div class="item-title">\${escapeHtml(s.title)}</div>
            <div class="item-desc">\${escapeHtml(s.description)}</div>
          </div>
          <button class="delete-btn" onclick="deleteShortcut('\${s.id}')">×</button>
        </div>
      \`).join('');
    }

    function addShortcut() {
      const title = document.getElementById('sc-title').value.trim();
      const description = document.getElementById('sc-desc').value.trim();
      if (!title) return;

      shortcuts.unshift({ id: uid(), title, description });
      document.getElementById('sc-title').value = '';
      document.getElementById('sc-desc').value = '';
      renderShortcuts();
      saveShortcuts();
    }

    function deleteShortcut(id) {
      shortcuts = shortcuts.filter(s => s.id !== id);
      renderShortcuts();
      saveShortcuts();
    }

    function saveShortcuts() {
      vscode.postMessage({ command: 'saveShortcuts', shortcuts });
    }

    // ===== NOTES =====
    function renderNotes() {
      const list = document.getElementById('notes-list');
      if (notes.length === 0) {
        list.innerHTML = '<div class="empty">No notes yet</div>';
        return;
      }
      list.innerHTML = notes.map(n => \`
        <div class="item">
          <div class="item-content">
            <div class="item-title">\${escapeHtml(n.title)}</div>
            <div class="item-desc">\${escapeHtml(n.content)}</div>
          </div>
          <button class="delete-btn" onclick="deleteNote('\${n.id}')">×</button>
        </div>
      \`).join('');
    }

    function addNote() {
      const title = document.getElementById('note-title').value.trim();
      const content = document.getElementById('note-content').value.trim();
      if (!title && !content) return;

      notes.unshift({ id: uid(), title: title || 'Untitled', content });
      document.getElementById('note-title').value = '';
      document.getElementById('note-content').value = '';
      renderNotes();
      saveNotes();
    }

    function deleteNote(id) {
      notes = notes.filter(n => n.id !== id);
      renderNotes();
      saveNotes();
    }

    function saveNotes() {
      vscode.postMessage({ command: 'saveNotes', notes });
    }

    // ===== FILES & SKILLS =====
    function createFile(filename, content) {
      vscode.postMessage({ command: 'createFile', filename, content });
    }

    function runSkill(commandText) {
      vscode.postMessage({ command: 'runSkill', commandText });
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Initial render
    renderShortcuts();
    renderNotes();
  </script>
</body>
</html>
  `;
}

export function deactivate() { }