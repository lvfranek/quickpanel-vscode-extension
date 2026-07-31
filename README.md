# ⚡ Quickpanel

![Quickpanel demo](media/quickpanel-gif-1.gif)

**Your personal command center inside VS Code.**

One-click favorites, single-line terminal commands, multi-step processes, and file templates — without leaving the editor.

---

### ✨ Features

- **Favorites** — star any terminal command, process, or file for one-click run buttons at the top
- **Terminal commands** — single-line shell commands (including AI skill installs)
- **Processes** — multi-step workflows (commands + file creates, in order)
- **Files** — create files from templates
- Inline edit under each item and step
- Drag & drop reordering (handle on the right)
- Data persisted across VS Code sessions

---

### 🚀 How to use

1. Click **⚡ Quickpanel** in the status bar (bottom right), or run **Open Quickpanel** from the Command Palette
2. Use **+ Add** in Terminal commands / Processes / Files
3. Star items with **☆** so they appear under **Favorites**
4. Run from the favorite chip or the **▶ Run** button on any card

---

### 📦 Pre-loaded defaults (fresh install)

- Terminal: `npm run dev` (favorited), install React best-practices skill
- Process: Create React App (Vite + install + `.env`)
- Files: `README.md`, `AGENTS.md`, `.gitignore`, `.env`

---

### 🛠️ Requirements

- Visual Studio Code `1.125.0` or higher

---

### 🧩 Project structure

```
src/                     # Extension host
  extension.ts
  models.ts
  defaults.ts
  files.ts / terminal.ts / runner.ts
  webview/panel.ts, html.ts, template.html

webview-src/             # Webview UI modules → media/webview.js
  main.js, state.js, util.js, confirm.js, dnd.js, tabs.js
  tabs/home.js

media/                   # Shipped assets
  webview.js, webview.css, template.html, icon.png
```

```bash
npm run watch    # host + webview
npm run package  # production build
```

---

### 📝 Feedback & Issues

Open an issue on [GitHub](https://github.com/lvfranek/quickpanel-vscode-extension).
