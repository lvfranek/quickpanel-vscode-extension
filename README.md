# Quickpanel

![Quickpanel demo](media/quickpanel-gif-1.gif)

Stop retyping the same terminal commands. Stop hunting for that one scaffold script. Quickpanel is a small panel in VS Code for stuff you run all the time.

**Favorites** at the top. Three lists below: single-line commands, multi-step processes, file templates. Star what you need → one click from the top.

## Why

Because opening a terminal and typing `npm run dev` for the 40th time this week is boring. Same for spinning up a React app or dropping in a `.gitignore`.

You define it once. You run it from the panel.

## Install

1. Install **Quickpanel** from the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`)
2. Or from the [Marketplace](https://marketplace.visualstudio.com/) (search *Quickpanel*)

Requires VS Code **1.125+**.

## Use it

Click **⚡ Quickpanel** in the status bar (bottom right), or run **Open Quickpanel** from the Command Palette.

| Section | What it’s for |
|--------|----------------|
| **Favorites** | Starred items — run only, no editing clutter |
| **Single-line terminal commands** | e.g. `npm run dev`, `npx skills add …` |
| **Multi-step processes** | Ordered steps (commands + file creates) |
| **File creation** | Templates like `README.md`, `.env`, … |

- **▶ Run** on a card or favorite → goes
- **☆** → pin to Favorites (unstar to remove)
- **+ Add** in each section → new command / process / file
- Edit opens **inline** under the item (steps too)
- Drag the handle on the **right** to reorder

Confirms only when you run a **whole multi-step process**. Single commands, single steps, and file creates just run.

## Comes with (fresh install)

- Terminal: `npm run dev` (favorited), install React best-practices skill
- Process: Create React App (Vite + install + `.env`)
- Files: `README.md`, `AGENTS.md`, `.gitignore`, `.env`

Add your own. Delete what you don’t want. Everything is saved in VS Code.

## Develop

```bash
npm install
npm run watch   # extension + webview
# F5 → Extension Development Host
```

```bash
npm run package # production build
```

## Issues

Bugs and ideas: [GitHub issues](https://github.com/lvfranek/quickpanel-vscode-extension/issues).
