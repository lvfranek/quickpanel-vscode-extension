# Change Log

All notable changes to the "quickpanel" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- **Quick strip** at the top of Processes & Skills for one-click command runs
- **▶ Run** button on every collapsed process card (no expand required)
- Filter chips: All / Quick / Processes / Skills
- Collapsible **+ Add** panel with **Quick Command** (name + command) and **Process** modes
- Pin (☆) to keep multi-step processes in the Quick strip
- Default quick commands on fresh install: `npm run dev`, `npm run build`
- Optional `kind` (`process` | `skill`) and `pinned` fields on processes
- Modular codebase: host modules under `src/`, webview modules under `webview-src/`, dual esbuild (host + webview)

### Changed
- Removed **Notes** and **Shortcuts** features
- Layout: **Favorites** strip on top, then **Terminal commands**, **Processes**, **Files**
- Favorites via ★ on any item; favorites are run-only (edit in category)
- Skills installs live under Terminal commands (single-line)
- Inline edit for process steps (same pattern as cards)
- Step type + command on one line
- Clear spacing between cards
- Modular host + webview codebase