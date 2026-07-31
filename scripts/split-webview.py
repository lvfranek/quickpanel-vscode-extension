#!/usr/bin/env python3
"""One-shot modularization of media/webview.js → webview-src/*.js"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "media" / "webview.js").read_text()
OUT = ROOT / "webview-src"
OUT.mkdir(exist_ok=True)
(OUT / "tabs").mkdir(exist_ok=True)

# Strip IIFE wrapper
start = SRC.find("'use strict';")
end = SRC.rfind("}());")
if start < 0 or end < 0:
    raise SystemExit("Could not find IIFE markers in media/webview.js")
body = SRC[start + len("'use strict';") : end].lstrip("\n")


def dedent2(s: str) -> str:
    return re.sub(r"^  ", "", s, flags=re.M)


def bind_state(s: str) -> str:
    s = dedent2(s)
    # Longer names first. Avoid matching inside ids like "shortcuts-list"
    # or words like "saveShortcuts" by requiring no word/hyphen neighbors.
    names = [
        "editingStepProjectId",
        "editingProjectId",
        "editingStepId",
        "editingNoteId",
        "editingFileId",
        "shortcuts",
        "notes",
        "files",
        "projects",
    ]
    for n in names:
        s = re.sub(rf"(?<![\w.]){n}(?![\w-])", f"state.{n}", s)
    s = s.replace("state.state.", "state.")
    s = s.replace("vscode.postMessage", "postMessage")
    # Undo replacements that leaked into user-facing copy
    for bad, good in [
        ("No state.shortcuts yet", "No shortcuts yet"),
        ("No state.notes yet", "No notes yet"),
        ("No state.files yet", "No files yet"),
        ("No state.projects yet", "No processes yet"),
        ("No state.projects yet — use + Add to create a Quick Command",
         "No processes yet — use + Add to create a Quick Command"),
    ]:
        s = s.replace(bad, good)
    return s


def slice_between(start_marker: str, end_marker: str | None) -> str:
    a = body.find(start_marker)
    if a < 0:
        raise SystemExit(f"start marker not found: {start_marker!r}")
    if end_marker is None:
        return body[a:]
    b = body.find(end_marker, a + len(start_marker))
    if b < 0:
        raise SystemExit(f"end marker not found: {end_marker!r}")
    return body[a:b]


# ── util ──────────────────────────────────────────────────────────────
(OUT / "util.js").write_text(
    """/** Shared pure helpers for the webview UI. */

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function escapeHtml(text) {
  var d = document.createElement('div');
  d.textContent = text || '';
  return d.innerHTML;
}

export function simpleMarkdown(text) {
  if (!text) { return ''; }
  var html = escapeHtml(text);
  html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<span class="md-bold">$1</span>');
  html = html.replace(/\\*(.+?)\\*/g, '<span class="md-italic">$1</span>');
  html = html.replace(/`(.+?)`/g, '<span class="md-code">$1</span>');
  html = html.replace(/\\\\n/g, '<br>');
  return html;
}
"""
)

# ── state ─────────────────────────────────────────────────────────────
(OUT / "state.js").write_text(
    """/** Mutable webview application state (shared across tab modules). */

export const vscode = acquireVsCodeApi();

const raw = document.getElementById('initial-data').dataset.json;
const initialData = JSON.parse(atob(raw));

export const state = {
  shortcuts: initialData.shortcuts,
  notes: initialData.notes,
  files: initialData.files,
  projects: initialData.projects,
  editingNoteId: null,
  editingFileId: null,
  editingProjectId: null,
  editingStepId: null,
  editingStepProjectId: null,
};

export function save(command, data) {
  vscode.postMessage({ command: command, data: data });
}

export function postMessage(message) {
  vscode.postMessage(message);
}
"""
)

# ── confirm ───────────────────────────────────────────────────────────
(OUT / "confirm.js").write_text(
    """/** Custom confirm modal. */

let modalResolve = null;

export function showConfirm(title, body) {
  return new Promise(function (resolve) {
    modalResolve = resolve;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = body;
    document.getElementById('confirm-modal').classList.remove('hidden');
  });
}

export function initConfirm() {
  document.getElementById('modal-confirm').onclick = function () {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (modalResolve) { modalResolve(true); modalResolve = null; }
  };
  document.getElementById('modal-cancel').onclick = function () {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (modalResolve) { modalResolve(false); modalResolve = null; }
  };
  document.getElementById('confirm-modal').addEventListener('click', function (e) {
    if (e.target === document.getElementById('confirm-modal')) {
      document.getElementById('confirm-modal').classList.add('hidden');
      if (modalResolve) { modalResolve(false); modalResolve = null; }
    }
  });
}
"""
)

# ── tabs strip ────────────────────────────────────────────────────────
(OUT / "tabs.js").write_text(
    """/** Main tab strip (Processes, Files, Notes, Shortcuts, Info). */

export function initTabs() {
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}
"""
)

# ── dnd (clean rewrite matching current behavior) ─────────────────────
(OUT / "dnd.js").write_text(
    r'''/** Drag-and-drop helpers (handle-initiated). */

let dragSrcId = null;
let dragSrcType = null;
let dragSrcProjectId = null;

/**
 * Only the .drag-handle starts a drag. The row/card stays non-draggable
 * until mousedown on its own handle, so nested steps don't fight parent cards.
 */
export function wireHandleDrag(item, handle, hooks) {
  if (!item || !handle) { return; }

  item.setAttribute('draggable', 'false');

  handle.addEventListener('mousedown', function (e) {
    e.stopPropagation();
    item.setAttribute('draggable', 'true');
  });

  item.addEventListener('mousedown', function (e) {
    if (!handle.contains(e.target)) {
      item.setAttribute('draggable', 'false');
    }
  }, true);

  item.addEventListener('dragstart', function (e) {
    if (hooks.shouldIgnore && hooks.shouldIgnore(e)) {
      e.preventDefault();
      item.setAttribute('draggable', 'false');
      return;
    }
    if (item.getAttribute('draggable') !== 'true') {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    try {
      e.dataTransfer.setData('text/plain', item.dataset.id || 'drag');
      e.dataTransfer.effectAllowed = 'move';
    } catch (_) { /* ignore */ }
    hooks.onStart && hooks.onStart(e);
  });

  item.addEventListener('dragend', function (e) {
    e.stopPropagation();
    item.setAttribute('draggable', 'false');
    hooks.onEnd && hooks.onEnd(e);
  });

  item.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    try { e.dataTransfer.dropEffect = 'move'; } catch (_) { /* ignore */ }
    hooks.onOver && hooks.onOver(e);
  });

  item.addEventListener('dragleave', function (e) {
    e.stopPropagation();
    hooks.onLeave && hooks.onLeave(e);
  });

  item.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    hooks.onDrop && hooks.onDrop(e);
  });
}

export function bindDrag(containerId, dragType, dataArray, onDrop) {
  var container = document.getElementById(containerId);
  if (!container) { return; }
  var items = container.querySelectorAll('[data-drag-type="' + dragType + '"]');

  function clearOver() {
    container.querySelectorAll('[data-drag-type="' + dragType + '"]').forEach(function (i) {
      i.classList.remove('drag-over');
    });
  }

  items.forEach(function (item) {
    var handle = item.querySelector(':scope > .drag-handle')
      || item.querySelector(':scope > .project-header > .drag-handle')
      || item.querySelector('.project-header > .drag-handle')
      || item.querySelector('.drag-handle');

    wireHandleDrag(item, handle, {
      shouldIgnore: function (e) {
        if (dragType === 'project') {
          var t = e.target;
          if (t && t.closest && t.closest('[data-drag-type="step"]')) {
            return true;
          }
        }
        return false;
      },
      onStart: function () {
        dragSrcId = item.dataset.id;
        dragSrcType = dragType;
        item.classList.add('dragging');
      },
      onEnd: function () {
        item.classList.remove('dragging');
        clearOver();
        dragSrcId = null;
        dragSrcType = null;
      },
      onOver: function () {
        if (dragSrcType !== dragType) { return; }
        clearOver();
        item.classList.add('drag-over');
      },
      onLeave: function () {
        item.classList.remove('drag-over');
      },
      onDrop: function () {
        item.classList.remove('drag-over');
        if (!dragSrcId || dragSrcId === item.dataset.id || dragSrcType !== dragType) { return; }
        var fromIdx = dataArray.findIndex(function (x) { return x.id === dragSrcId; });
        var toIdx = dataArray.findIndex(function (x) { return x.id === item.dataset.id; });
        if (fromIdx < 0 || toIdx < 0) { return; }
        var moved = dataArray.splice(fromIdx, 1)[0];
        dataArray.splice(toIdx, 0, moved);
        onDrop();
      }
    });
  });
}

export function bindStepDrag(projectId, stepsArray, onDrop) {
  var container = document.getElementById('steps-list-' + projectId);
  if (!container) { return; }
  var items = Array.prototype.slice.call(container.querySelectorAll('[data-drag-type="step"]'));

  function clearOver() {
    items.forEach(function (i) { i.classList.remove('drag-over'); });
  }

  items.forEach(function (item) {
    var handle = item.querySelector(':scope > .drag-handle') || item.querySelector('.drag-handle');

    wireHandleDrag(item, handle, {
      onStart: function () {
        dragSrcId = item.dataset.id;
        dragSrcType = 'step';
        dragSrcProjectId = projectId;
        item.classList.add('dragging');
        var parentCard = item.closest('[data-drag-type="project"]');
        if (parentCard) {
          parentCard.setAttribute('draggable', 'false');
        }
      },
      onEnd: function () {
        item.classList.remove('dragging');
        clearOver();
        dragSrcId = null;
        dragSrcType = null;
        dragSrcProjectId = null;
      },
      onOver: function () {
        if (dragSrcType !== 'step' || dragSrcProjectId !== projectId) { return; }
        clearOver();
        item.classList.add('drag-over');
      },
      onLeave: function () {
        item.classList.remove('drag-over');
      },
      onDrop: function () {
        item.classList.remove('drag-over');
        if (!dragSrcId || dragSrcId === item.dataset.id || dragSrcType !== 'step' || dragSrcProjectId !== projectId) {
          return;
        }
        var fromIdx = stepsArray.findIndex(function (s) { return s.id === dragSrcId; });
        var toIdx = stepsArray.findIndex(function (s) { return s.id === item.dataset.id; });
        if (fromIdx < 0 || toIdx < 0) { return; }
        var moved = stepsArray.splice(fromIdx, 1)[0];
        stepsArray.splice(toIdx, 0, moved);
        onDrop();
      }
    });
  });
}

export function bindCardDrag(container, items, onReorder) {
  if (!container) { return; }
  var cards = Array.prototype.slice.call(container.querySelectorAll(':scope > .project-card'));

  function clearOver() {
    cards.forEach(function (c) { c.classList.remove('drag-over'); });
  }

  cards.forEach(function (card) {
    var handle = card.querySelector(':scope > .project-header > .drag-handle')
      || card.querySelector('.project-header > .drag-handle');
    if (!handle) { return; }

    wireHandleDrag(card, handle, {
      shouldIgnore: function (e) {
        var t = e.target;
        return !!(t && t.closest && t.closest('[data-drag-type="step"]'));
      },
      onStart: function () {
        dragSrcId = card.dataset.id;
        dragSrcType = 'project';
        card.classList.add('dragging');
      },
      onEnd: function () {
        card.classList.remove('dragging');
        clearOver();
        dragSrcId = null;
        dragSrcType = null;
      },
      onOver: function () {
        if (dragSrcType !== 'project') { return; }
        clearOver();
        card.classList.add('drag-over');
      },
      onLeave: function () {
        card.classList.remove('drag-over');
      },
      onDrop: function () {
        card.classList.remove('drag-over');
        if (!dragSrcId || dragSrcId === card.dataset.id || dragSrcType !== 'project') { return; }
        var fromIdx = items.findIndex(function (x) { return x.id === dragSrcId; });
        var toIdx = items.findIndex(function (x) { return x.id === card.dataset.id; });
        if (fromIdx < 0 || toIdx < 0) { return; }
        var moved = items.splice(fromIdx, 1)[0];
        items.splice(toIdx, 0, moved);
        if (onReorder) { onReorder(); }
      }
    });
  });
}
'''
)

# ── markdown toolbar ──────────────────────────────────────────────────
md_start = body.find("// ── MARKDOWN TOOLBAR ──")
md_end = body.find("// ════════════════════════════════════════\n  //  DRAG & DROP")
md_block = dedent2(body[md_start:md_end])
# strip the comment header; keep the forEach
md_inner = md_block.split("\n", 1)[1] if "\n" in md_block else md_block
(OUT / "markdownToolbar.js").write_text(
    "/** Notes markdown insert toolbar. */\n\n"
    "export function initMarkdownToolbar() {\n"
    + "\n".join("  " + line if line else "" for line in md_inner.splitlines())
    + "\n}\n"
)

# ── feature tabs ──────────────────────────────────────────────────────
shortcuts_raw = slice_between(
    "// ════════════════════════════════════════\n  //  SHORTCUTS",
    "// ════════════════════════════════════════\n  //  NOTES",
)
notes_raw = slice_between(
    "// ════════════════════════════════════════\n  //  NOTES",
    "// ════════════════════════════════════════\n  //  FILES",
)
files_raw = slice_between(
    "// ════════════════════════════════════════\n  //  FILES",
    "// ════════════════════════════════════════\n  //  PROCESSES",
)
projects_raw = slice_between("// ════════════════════════════════════════\n  //  PROCESSES", None)
init_idx = projects_raw.find("// ── INIT ──")
if init_idx > 0:
    projects_raw = projects_raw[:init_idx]

sc = bind_state(shortcuts_raw)
sc = re.sub(r"^// ═+.*?// ═+\n", "", sc, count=1, flags=re.S)
sc = sc.replace("function renderShortcuts()", "export function renderShortcuts()")
(OUT / "tabs" / "shortcuts.js").write_text(
    "import { state, save } from '../state.js';\n"
    "import { uid, escapeHtml } from '../util.js';\n"
    "import { bindDrag } from '../dnd.js';\n\n"
    + sc
)

nt = bind_state(notes_raw)
nt = re.sub(r"^// ═+.*?// ═+\n", "", nt, count=1, flags=re.S)
nt = nt.replace("function renderNotes()", "export function renderNotes()")
(OUT / "tabs" / "notes.js").write_text(
    "import { state, save } from '../state.js';\n"
    "import { uid, simpleMarkdown } from '../util.js';\n"
    "import { bindDrag } from '../dnd.js';\n\n"
    + nt
)

fl = bind_state(files_raw)
fl = re.sub(r"^// ═+.*?// ═+\n", "", fl, count=1, flags=re.S)
fl = fl.replace("function renderFiles()", "export function renderFiles()")
(OUT / "tabs" / "files.js").write_text(
    "import { state, save, postMessage } from '../state.js';\n"
    "import { uid, escapeHtml } from '../util.js';\n"
    "import { showConfirm } from '../confirm.js';\n"
    "import { bindDrag } from '../dnd.js';\n\n"
    + fl
)

pr = bind_state(projects_raw)
pr = re.sub(r"^// ═+.*?// ═+\n", "", pr, count=1, flags=re.S)
pr = pr.replace("function renderProjects()", "export function renderProjects()")
# bindCardDrag lives in dnd.js — drop any inlined copy from the legacy bundle
pr = re.sub(
    r"\n/\*\*\n \* Drag-reorder project cards[\s\S]*?\nfunction bindCardDrag\([\s\S]*?\n\}\n\n// Filter chips",
    "\n\n// Filter chips",
    pr,
    count=1,
)
(OUT / "tabs" / "projects.js").write_text(
    "import { state, save, postMessage } from '../state.js';\n"
    "import { uid, escapeHtml } from '../util.js';\n"
    "import { showConfirm } from '../confirm.js';\n"
    "import { bindStepDrag, bindCardDrag } from '../dnd.js';\n\n"
    + pr
)

# ── main entry ────────────────────────────────────────────────────────
(OUT / "main.js").write_text(
    """/**
 * Quickpanel webview entry.
 * Built by esbuild → media/webview.js
 */
import { initConfirm } from './confirm.js';
import { initTabs } from './tabs.js';
import { initMarkdownToolbar } from './markdownToolbar.js';
import { renderShortcuts } from './tabs/shortcuts.js';
import { renderNotes } from './tabs/notes.js';
import { renderFiles } from './tabs/files.js';
import { renderProjects } from './tabs/projects.js';

initConfirm();
initTabs();
initMarkdownToolbar();
renderShortcuts();
renderNotes();
renderFiles();
renderProjects();
"""
)

print("Wrote webview-src modules:")
for p in sorted(OUT.rglob("*.js")):
    if p.name.endswith(".legacy.js"):
        continue
    print(f"  {p.relative_to(ROOT)} ({p.stat().st_size} bytes)")
