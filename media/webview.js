// Quickpanel Webview Script
// Data is passed via base64 in #initial-data[data-json]
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // ── LOAD INITIAL DATA ──
  const raw = document.getElementById('initial-data').dataset.json;
  const initialData = JSON.parse(atob(raw));

  let shortcuts = initialData.shortcuts;
  let notes     = initialData.notes;
  let files     = initialData.files;
  let projects  = initialData.projects;

  let editingNoteId    = null;
  let editingFileId    = null;
  let editingProjectId = null;
  let editingStepId    = null; // step id currently being edited
  let editingStepProjectId = null;

  let dragSrcId        = null;
  let dragSrcType      = null;
  let dragSrcProjectId = null;

  // ── TABS ──
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  // ── HELPERS ──
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function escapeHtml(text) {
    var d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
  }

  function simpleMarkdown(text) {
    if (!text) { return ''; }
    var html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<span class="md-bold">$1</span>');
    html = html.replace(/\*(.+?)\*/g,     '<span class="md-italic">$1</span>');
    html = html.replace(/`(.+?)`/g,       '<span class="md-code">$1</span>');
    html = html.replace(/\\n/g, '<br>');
    return html;
  }

  function save(command, data) {
    vscode.postMessage({ command: command, data: data });
  }

  // ── CUSTOM CONFIRM MODAL ──
  var modalResolve = null;

  function showConfirm(title, body) {
    return new Promise(function (resolve) {
      modalResolve = resolve;
      document.getElementById('modal-title').textContent = title;
      document.getElementById('modal-body').textContent  = body;
      document.getElementById('confirm-modal').classList.remove('hidden');
    });
  }

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

  // ── MARKDOWN TOOLBAR ──
  document.querySelectorAll('.md-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var textarea = document.getElementById('note-content');
      var start    = textarea.selectionStart;
      var end      = textarea.selectionEnd;
      var selected = textarea.value.substring(start, end);
      var before   = '';
      var after    = '';
      switch (btn.dataset.md) {
        case 'bold':   before = '**'; after = '**'; break;
        case 'italic': before = '*';  after = '*';  break;
        case 'code':   before = '`';  after = '`';  break;
        case 'link':   before = '[';  after = '](url)'; break;
      }
      var newText = textarea.value.substring(0, start) + before + selected + after + textarea.value.substring(end);
      textarea.value = newText;
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  });

  // ════════════════════════════════════════
  //  DRAG & DROP — handle-initiated (avoids nested-draggable conflicts)
  // ════════════════════════════════════════

  /**
   * Only the .drag-handle starts a drag. The row/card stays non-draggable
   * until mousedown on its own handle, so nested steps don't fight parent cards.
   */
  function wireHandleDrag(item, handle, hooks) {
    if (!item || !handle) { return; }

    item.setAttribute('draggable', 'false');

    handle.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      item.setAttribute('draggable', 'true');
    });

    // Clicking anywhere else on the row must not allow an accidental drag
    item.addEventListener('mousedown', function (e) {
      if (!handle.contains(e.target)) {
        item.setAttribute('draggable', 'false');
      }
    }, true);

    item.addEventListener('dragstart', function (e) {
      // Nested case: a step drag must never start the parent process drag
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
      // Required in some webviews for drag to activate
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

  function bindDrag(containerId, dragType, dataArray, onDrop) {
    var container = document.getElementById(containerId);
    if (!container) { return; }
    var items = container.querySelectorAll('[data-drag-type="' + dragType + '"]');

    function clearOver() {
      container.querySelectorAll('[data-drag-type="' + dragType + '"]').forEach(function (i) {
        i.classList.remove('drag-over');
      });
    }

    items.forEach(function (item) {
      // Prefer the card/row's own handle, not a nested step handle
      var handle = item.querySelector(':scope > .drag-handle')
        || item.querySelector(':scope > .project-header > .drag-handle')
        || item.querySelector('.project-header > .drag-handle')
        || item.querySelector('.drag-handle');

      wireHandleDrag(item, handle, {
        shouldIgnore: function (e) {
          // Process cards: ignore drags that originate inside a step row
          if (dragType === 'project') {
            var t = e.target;
            if (t && t.closest && t.closest('[data-drag-type="step"]')) {
              return true;
            }
          }
          return false;
        },
        onStart: function () {
          dragSrcId   = item.dataset.id;
          dragSrcType = dragType;
          item.classList.add('dragging');
        },
        onEnd: function () {
          item.classList.remove('dragging');
          clearOver();
          dragSrcId   = null;
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
          var toIdx   = dataArray.findIndex(function (x) { return x.id === item.dataset.id; });
          if (fromIdx < 0 || toIdx < 0) { return; }
          var moved = dataArray.splice(fromIdx, 1)[0];
          dataArray.splice(toIdx, 0, moved);
          onDrop();
        }
      });
    });
  }

  function bindStepDrag(projectId, stepsArray, onDrop) {
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
          dragSrcId        = item.dataset.id;
          dragSrcType      = 'step';
          dragSrcProjectId = projectId;
          item.classList.add('dragging');
          // Keep parent process card out of the drag while reordering steps
          var parentCard = item.closest('[data-drag-type="project"]');
          if (parentCard) {
            parentCard.setAttribute('draggable', 'false');
            parentCard.classList.remove('dragging', 'drag-over');
          }
        },
        onEnd: function () {
          item.classList.remove('dragging');
          clearOver();
          dragSrcId        = null;
          dragSrcType      = null;
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
          if (!dragSrcId || dragSrcId === item.dataset.id || dragSrcType !== 'step') { return; }
          if (dragSrcProjectId !== projectId) { return; }
          var fromIdx = stepsArray.findIndex(function (s) { return s.id === dragSrcId; });
          var toIdx   = stepsArray.findIndex(function (s) { return s.id === item.dataset.id; });
          if (fromIdx < 0 || toIdx < 0) { return; }
          var moved = stepsArray.splice(fromIdx, 1)[0];
          stepsArray.splice(toIdx, 0, moved);
          onDrop();
        }
      });
    });
  }

  // ════════════════════════════════════════
  //  SHORTCUTS
  // ════════════════════════════════════════
  function renderShortcuts() {
    var list = document.getElementById('shortcuts-list');
    if (!shortcuts.length) {
      list.innerHTML = '<div class="empty">No shortcuts yet</div>';
      return;
    }
    list.innerHTML = shortcuts.map(function (s) {
      return '<div class="item" draggable="true" data-id="' + s.id + '" data-drag-type="shortcut">' +
        '<div class="drag-handle" title="Drag to reorder">⠿</div>' +
        '<div class="item-content">' +
          '<div class="item-title">' + escapeHtml(s.title) + '</div>' +
          '<div class="item-desc">' + escapeHtml(s.description) + '</div>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="icon-btn danger" data-delete-sc="' + s.id + '">×' + '</button>' +
        '</div>' +
        '</div>';
    }).join('');

    bindDrag('shortcuts-list', 'shortcut', shortcuts, function () {
      renderShortcuts();
      save('saveShortcuts', shortcuts);
    });

    document.querySelectorAll('[data-delete-sc]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        shortcuts = shortcuts.filter(function (s) { return s.id !== btn.dataset.deleteSc; });
        renderShortcuts();
        save('saveShortcuts', shortcuts);
      };
    });
  }

  document.getElementById('add-shortcut-btn').onclick = function () {
    var title       = document.getElementById('sc-title').value.trim();
    var description = document.getElementById('sc-desc').value.trim();
    if (!title) { return; }
    shortcuts.unshift({ id: uid(), title: title, description: description });
    document.getElementById('sc-title').value = '';
    document.getElementById('sc-desc').value  = '';
    renderShortcuts();
    save('saveShortcuts', shortcuts);
  };

  // ════════════════════════════════════════
  //  NOTES
  // ════════════════════════════════════════
  function renderNotes() {
    var list = document.getElementById('notes-list');
    if (!notes.length) {
      list.innerHTML = '<div class="empty">No notes yet</div>';
      return;
    }
    list.innerHTML = notes.map(function (n) {
      var rendered  = simpleMarkdown(n.content);
      var needsMore = (n.content || '').length > 110;
      return '<div class="item" draggable="true" data-id="' + n.id + '" data-drag-type="note">' +
        '<div class="drag-handle" title="Drag to reorder">⠿</div>' +
        '<div class="item-content">' +
          '<div class="item-title">' + escapeHtml(n.title) + '</div>' +
          '<div class="item-desc" id="desc-' + n.id + '">' + rendered + '</div>' +
          (needsMore ? '<span class="show-more" data-expand="' + n.id + '">Show more</span>' : '') +
        '</div>' +
        '<div class="actions">' +
          '<button class="icon-btn" data-edit-note="' + n.id + '" title="Edit">✎</button>' +
          '<button class="icon-btn danger" data-delete-note="' + n.id + '">×</button>' +
        '</div>' +
        '</div>';
    }).join('');

    bindDrag('notes-list', 'note', notes, function () {
      renderNotes();
      save('saveNotes', notes);
    });

    bindNoteActions();
  }

  document.getElementById('add-note-btn').onclick = function () {
    var title   = document.getElementById('note-title').value.trim();
    var content = document.getElementById('note-content').value.trim();
    if (!title && !content) { return; }

    if (editingNoteId) {
      var note = notes.find(function (n) { return n.id === editingNoteId; });
      if (note) { note.title = title || 'Untitled'; note.content = content; }
      editingNoteId = null;
      document.getElementById('add-note-btn').textContent = 'Add Note';
      document.getElementById('cancel-edit-btn').style.display = 'none';
    } else {
      notes.unshift({ id: uid(), title: title || 'Untitled', content: content });
    }
    document.getElementById('note-title').value   = '';
    document.getElementById('note-content').value = '';
    renderNotes();
    save('saveNotes', notes);
  };

  document.getElementById('cancel-edit-btn').onclick = function () {
    editingNoteId = null;
    document.getElementById('note-title').value   = '';
    document.getElementById('note-content').value = '';
    document.getElementById('add-note-btn').textContent = 'Add Note';
    document.getElementById('cancel-edit-btn').style.display = 'none';
  };

  function bindNoteActions() {
    document.querySelectorAll('[data-delete-note]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        notes = notes.filter(function (n) { return n.id !== btn.dataset.deleteNote; });
        renderNotes();
        save('saveNotes', notes);
      };
    });
    document.querySelectorAll('[data-edit-note]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var note = notes.find(function (n) { return n.id === btn.dataset.editNote; });
        if (!note) { return; }
        editingNoteId = note.id;
        document.getElementById('note-title').value   = note.title;
        document.getElementById('note-content').value = note.content;
        document.getElementById('add-note-btn').textContent = 'Save Note';
        document.getElementById('cancel-edit-btn').style.display = 'inline-block';
        document.getElementById('note-title').focus();
      };
    });
    document.querySelectorAll('[data-expand]').forEach(function (btn) {
      btn.onclick = function () {
        var el = document.getElementById('desc-' + btn.dataset.expand);
        el.classList.toggle('expanded');
        btn.textContent = el.classList.contains('expanded') ? 'Show less' : 'Show more';
      };
    });
  }

  // ════════════════════════════════════════
  //  FILES
  // ════════════════════════════════════════
  function renderFiles() {
    var list = document.getElementById('files-list');
    if (!files.length) {
      list.innerHTML = '<div class="empty">No file templates yet</div>';
      return;
    }
    list.innerHTML = files.map(function (f) {
      return '<div class="file-row" draggable="true" data-id="' + f.id + '" data-drag-type="file">' +
        '<div class="drag-handle" title="Drag to reorder">⠿</div>' +
        '<div class="info" data-run-file="' + f.id + '">' +
          '<strong>' + escapeHtml(f.name) + '</strong>' +
          '<span>' + escapeHtml(f.filename) + '</span>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="icon-btn" data-edit-file="' + f.id + '" title="Edit">✎</button>' +
          '<button class="icon-btn danger" data-delete-file="' + f.id + '">×</button>' +
        '</div>' +
        '</div>';
    }).join('');

    bindDrag('files-list', 'file', files, function () {
      renderFiles();
      save('saveFiles', files);
    });

    document.querySelectorAll('[data-run-file]').forEach(function (el) {
      el.onclick = async function () {
        var f = files.find(function (x) { return x.id === el.dataset.runFile; });
        if (!f) { return; }
        var ok = await showConfirm('Create File', 'Create "' + f.filename + '" in the current workspace folder?');
        if (ok) {
          vscode.postMessage({ command: 'createFile', filename: f.filename, content: f.content });
        }
      };
    });

    document.querySelectorAll('[data-delete-file]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        files = files.filter(function (f) { return f.id !== btn.dataset.deleteFile; });
        renderFiles();
        save('saveFiles', files);
      };
    });

    document.querySelectorAll('[data-edit-file]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var f = files.find(function (x) { return x.id === btn.dataset.editFile; });
        if (!f) { return; }
        editingFileId = f.id;
        document.getElementById('file-name').value     = f.name;
        document.getElementById('file-filename').value = f.filename;
        document.getElementById('file-content').value  = f.content;
        document.getElementById('add-file-btn').textContent = 'Save File Template';
        document.getElementById('cancel-file-btn').style.display = 'inline-block';
        document.getElementById('file-name').focus();
      };
    });
  }

  document.getElementById('add-file-btn').onclick = function () {
    var name     = document.getElementById('file-name').value.trim();
    var filename = document.getElementById('file-filename').value.trim();
    var content  = document.getElementById('file-content').value;
    if (!name || !filename) { return; }

    if (editingFileId) {
      var f = files.find(function (x) { return x.id === editingFileId; });
      if (f) { f.name = name; f.filename = filename; f.content = content; }
      editingFileId = null;
      document.getElementById('add-file-btn').textContent = 'Add File Template';
      document.getElementById('cancel-file-btn').style.display = 'none';
    } else {
      files.unshift({ id: uid(), name: name, filename: filename, content: content });
    }
    document.getElementById('file-name').value     = '';
    document.getElementById('file-filename').value = '';
    document.getElementById('file-content').value  = '';
    renderFiles();
    save('saveFiles', files);
  };

  document.getElementById('cancel-file-btn').onclick = function () {
    editingFileId = null;
    document.getElementById('file-name').value     = '';
    document.getElementById('file-filename').value = '';
    document.getElementById('file-content').value  = '';
    document.getElementById('add-file-btn').textContent = 'Add File Template';
    document.getElementById('cancel-file-btn').style.display = 'none';
  };

  // ════════════════════════════════════════
  //  PROCESSES & SKILLS
  // ════════════════════════════════════════
  var openProjects    = new Set();
  var openStepForms   = new Set();
  var stepTypeSelection = {};

  function clearStepEdit(projectId) {
    if (projectId) {
      openStepForms.delete(projectId);
      delete stepTypeSelection[projectId];
    }
    editingStepId = null;
    editingStepProjectId = null;
  }

  function openStepEditor(projectId, step) {
    openProjects.add(projectId);
    openStepForms.add(projectId);
    if (step) {
      editingStepId = step.id;
      editingStepProjectId = projectId;
      stepTypeSelection[projectId] = step.type || 'command';
    } else {
      editingStepId = null;
      editingStepProjectId = null;
      stepTypeSelection[projectId] = stepTypeSelection[projectId] || 'command';
    }
    renderProjects();
    var labelEl = document.getElementById('step-label-' + projectId);
    if (labelEl) { labelEl.focus(); }
  }

  function renderProjects() {
    var list = document.getElementById('projects-list');
    if (!projects.length) {
      list.innerHTML = '<div class="empty">No processes yet</div>';
      return;
    }

    list.innerHTML = projects.map(function (p) {
      var isOpen       = openProjects.has(p.id);
      var showStepForm = openStepForms.has(p.id);
      var isEditingStep = editingStepProjectId === p.id && !!editingStepId;
      var editingStep  = isEditingStep
        ? p.steps.find(function (s) { return s.id === editingStepId; })
        : null;
      var stepType     = stepTypeSelection[p.id]
        || (editingStep && editingStep.type)
        || 'command';

      var stepsHtml = p.steps.length
        ? p.steps.map(function (step, idx) {
            var isThisEditing = editingStepId === step.id && editingStepProjectId === p.id;
            var runBtn = step.type === 'file'
              ? '<button class="btn small" data-run-step="' + step.id + '" data-project-id="' + p.id + '">Create File</button>'
              : '<button class="btn small" data-run-step="' + step.id + '" data-project-id="' + p.id + '">Run</button>';
            var detail = step.type === 'file'
              ? escapeHtml(step.filename || '')
              : escapeHtml(step.command || '');
            return '<div class="step-item' + (isThisEditing ? ' step-editing' : '') + '" draggable="false" data-id="' + step.id + '" data-project-id="' + p.id + '" data-drag-type="step">' +
              '<div class="drag-handle" title="Drag to reorder" draggable="false">⠿</div>' +
              '<div class="step-number">' + (idx + 1) + '</div>' +
              '<div class="step-info">' +
                '<div class="step-label">' + escapeHtml(step.label) + '</div>' +
                '<span class="step-type-badge ' + step.type + '">' + (step.type === 'file' ? '📄 file' : '⌘ command') + '</span>' +
                (detail ? '<div class="step-detail">' + detail + '</div>' : '') +
              '</div>' +
              '<div class="step-actions">' +
                runBtn +
                '<button class="icon-btn" data-edit-step="' + step.id + '" data-project-id="' + p.id + '" title="Edit step">✎</button>' +
                '<button class="icon-btn danger" data-delete-step="' + step.id + '" data-project-id="' + p.id + '" title="Delete step">×</button>' +
              '</div>' +
              '</div>';
          }).join('')
        : '<div class="empty">No steps yet — add one below</div>';

      var cmdWrapStyle  = stepType === 'file' ? 'display:none' : '';
      var fileWrapStyle = stepType === 'file' ? '' : 'display:none';
      var formTitle     = isEditingStep ? 'Edit Step' : 'New Step';
      var saveLabel     = isEditingStep ? 'Save Step' : 'Add Step';
      var labelVal      = editingStep ? escapeHtml(editingStep.label || '') : '';
      var commandVal    = editingStep && editingStep.type === 'command' ? escapeHtml(editingStep.command || '') : '';
      var filenameVal   = editingStep && editingStep.type === 'file' ? escapeHtml(editingStep.filename || '') : '';
      var contentVal    = editingStep && editingStep.type === 'file' ? escapeHtml(editingStep.content || '') : '';

      var stepFormHtml  =
        '<div class="add-step-form' + (showStepForm ? '' : ' hidden') + '" id="step-form-' + p.id + '">' +
          '<div class="step-form-title">' + formTitle + '</div>' +
          '<input id="step-label-' + p.id + '" placeholder="Step title (e.g. Install dependencies)" value="' + labelVal + '" />' +
          '<div class="step-type-toggle">' +
            '<button class="type-opt' + (stepType === 'command' ? ' selected' : '') + '" data-type-select="command" data-project-id="' + p.id + '">⌘ Command</button>' +
            '<button class="type-opt' + (stepType === 'file' ? ' selected' : '') + '" data-type-select="file" data-project-id="' + p.id + '">📄 File</button>' +
          '</div>' +
          '<div id="step-command-wrap-' + p.id + '" style="' + cmdWrapStyle + '">' +
            '<input id="step-command-' + p.id + '" placeholder="Terminal command (e.g. npm install)" value="' + commandVal + '" />' +
          '</div>' +
          '<div id="step-file-wrap-' + p.id + '" style="' + fileWrapStyle + '">' +
            '<input id="step-filename-' + p.id + '" placeholder="Filename (e.g. .env)" value="' + filenameVal + '" />' +
            '<textarea id="step-fcontent-' + p.id + '" placeholder="File content..." style="min-height:60px;">' + contentVal + '</textarea>' +
          '</div>' +
          '<div class="btn-row">' +
            '<button class="btn small" data-save-step="' + p.id + '">' + saveLabel + '</button>' +
            '<button class="btn secondary small" data-cancel-step="' + p.id + '">Cancel</button>' +
          '</div>' +
        '</div>';

      var expandLabel = isOpen ? ('Steps (' + p.steps.length + ') ▲') : ('Steps (' + p.steps.length + ') ▼');

      return '<div class="project-card' + (isOpen ? ' open' : '') + '" draggable="false" data-id="' + p.id + '" data-project-id="' + p.id + '" data-drag-type="project">' +
        '<div class="project-header">' +
          '<div class="drag-handle" title="Drag to reorder" draggable="false">⠿</div>' +
          '<div class="project-header-info" data-toggle-project="' + p.id + '">' +
            '<div class="project-name">' + escapeHtml(p.name) + '</div>' +
            '<div class="project-desc">' + escapeHtml(p.description) + '</div>' +
          '</div>' +
          '<button class="expand-btn" data-toggle-project="' + p.id + '">' + expandLabel + '</button>' +
          '<div class="actions">' +
            '<button class="icon-btn" data-edit-project="' + p.id + '" title="Edit process">✎</button>' +
            '<button class="icon-btn danger" data-delete-project="' + p.id + '" title="Delete process">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="project-body">' +
          '<div class="steps-list" id="steps-list-' + p.id + '">' + stepsHtml + '</div>' +
          '<div class="run-all-row">' +
            '<button class="btn small" data-run-all="' + p.id + '">▶ Run All Steps</button>' +
            '<button class="btn secondary small" data-toggle-step-form="' + p.id + '">+ Add Step</button>' +
          '</div>' +
          stepFormHtml +
        '</div>' +
        '</div>';
    }).join('');

    // bind project events
    document.querySelectorAll('[data-toggle-project]').forEach(function (el) {
      el.onclick = function () {
        var id = el.dataset.toggleProject;
        if (openProjects.has(id)) { openProjects.delete(id); } else { openProjects.add(id); }
        renderProjects();
      };
    });

    document.querySelectorAll('[data-delete-project]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var pid = btn.dataset.deleteProject;
        projects = projects.filter(function (p) { return p.id !== pid; });
        openProjects.delete(pid);
        clearStepEdit(pid);
        renderProjects();
        save('saveProjects', projects);
      };
    });

    document.querySelectorAll('[data-edit-project]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var p = projects.find(function (x) { return x.id === btn.dataset.editProject; });
        if (!p) { return; }
        editingProjectId = p.id;
        document.getElementById('proj-name').value = p.name;
        document.getElementById('proj-desc').value = p.description;
        document.getElementById('add-project-btn').textContent = 'Save Process';
        document.getElementById('cancel-project-btn').style.display = 'inline-block';
        document.getElementById('proj-name').focus();
        document.getElementById('project-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    });

    document.querySelectorAll('[data-type-select]').forEach(function (btn) {
      btn.onclick = function () {
        var pid  = btn.dataset.projectId;
        var type = btn.dataset.typeSelect;
        stepTypeSelection[pid] = type;
        btn.closest('.step-type-toggle').querySelectorAll('.type-opt').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        document.getElementById('step-command-wrap-' + pid).style.display = type === 'file' ? 'none' : '';
        document.getElementById('step-file-wrap-' + pid).style.display    = type === 'file' ? '' : 'none';
      };
    });

    document.querySelectorAll('[data-toggle-step-form]').forEach(function (btn) {
      btn.onclick = function () {
        var pid = btn.dataset.toggleStepForm;
        if (openStepForms.has(pid) && !(editingStepProjectId === pid && editingStepId)) {
          clearStepEdit(pid);
          renderProjects();
          return;
        }
        // Open blank form for a new step (cancels any in-progress edit on this process)
        openStepEditor(pid, null);
      };
    });

    document.querySelectorAll('[data-cancel-step]').forEach(function (btn) {
      btn.onclick = function () {
        clearStepEdit(btn.dataset.cancelStep);
        renderProjects();
      };
    });

    document.querySelectorAll('[data-save-step]').forEach(function (btn) {
      btn.onclick = function () {
        var pid   = btn.dataset.saveStep;
        var label = document.getElementById('step-label-' + pid).value.trim();
        if (!label) { return; }
        var type = stepTypeSelection[pid] || 'command';
        var p    = projects.find(function (x) { return x.id === pid; });
        if (!p) { return; }

        var payload;
        if (type === 'file') {
          var filename = document.getElementById('step-filename-' + pid).value.trim();
          var content  = document.getElementById('step-fcontent-' + pid).value;
          if (!filename) { return; }
          payload = { label: label, type: 'file', filename: filename, content: content, command: undefined };
        } else {
          var command = document.getElementById('step-command-' + pid).value.trim();
          if (!command) { return; }
          payload = { label: label, type: 'command', command: command, filename: undefined, content: undefined };
        }

        if (editingStepId && editingStepProjectId === pid) {
          var existing = p.steps.find(function (s) { return s.id === editingStepId; });
          if (existing) {
            existing.label = payload.label;
            existing.type = payload.type;
            if (payload.type === 'file') {
              existing.filename = payload.filename;
              existing.content = payload.content;
              delete existing.command;
            } else {
              existing.command = payload.command;
              delete existing.filename;
              delete existing.content;
            }
          }
        } else {
          var step = { id: uid(), label: payload.label, type: payload.type };
          if (payload.type === 'file') {
            step.filename = payload.filename;
            step.content = payload.content;
          } else {
            step.command = payload.command;
          }
          p.steps.push(step);
        }

        clearStepEdit(pid);
        save('saveProjects', projects);
        renderProjects();
      };
    });

    document.querySelectorAll('[data-edit-step]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var pid    = btn.dataset.projectId;
        var stepId = btn.dataset.editStep;
        var p      = projects.find(function (x) { return x.id === pid; });
        if (!p) { return; }
        var step = p.steps.find(function (s) { return s.id === stepId; });
        if (!step) { return; }
        openStepEditor(pid, step);
      };
    });

    document.querySelectorAll('[data-delete-step]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var pid    = btn.dataset.projectId;
        var stepId = btn.dataset.deleteStep;
        var p      = projects.find(function (x) { return x.id === pid; });
        if (!p) { return; }
        p.steps = p.steps.filter(function (s) { return s.id !== stepId; });
        if (editingStepId === stepId) {
          clearStepEdit(pid);
        }
        save('saveProjects', projects);
        renderProjects();
      };
    });

    document.querySelectorAll('[data-run-step]').forEach(function (btn) {
      btn.onclick = async function (e) {
        e.stopPropagation();
        var pid    = btn.dataset.projectId;
        var stepId = btn.dataset.runStep;
        var p      = projects.find(function (x) { return x.id === pid; });
        if (!p) { return; }
        var step = p.steps.find(function (s) { return s.id === stepId; });
        if (!step) { return; }

        if (step.type === 'file') {
          var ok = await showConfirm('Create File', 'Create "' + step.filename + '" in the current workspace folder?');
          if (ok) {
            vscode.postMessage({
              command: 'runProjectStep',
              stepType: 'file',
              label: step.label,
              filename: step.filename,
              content: step.content
            });
          }
        } else {
          var ok2 = await showConfirm('Run Command', step.command);
          if (ok2) {
            vscode.postMessage({
              command: 'runProjectStep',
              stepType: 'command',
              label: step.label,
              commandText: step.command
            });
          }
        }
      };
    });

    document.querySelectorAll('[data-run-all]').forEach(function (btn) {
      btn.onclick = async function (e) {
        e.stopPropagation();
        var pid = btn.dataset.runAll;
        var p   = projects.find(function (x) { return x.id === pid; });
        if (!p || !p.steps.length) { return; }

        var stepLabels = p.steps.map(function (s, i) { return (i + 1) + '. ' + s.label; }).join('\n');
        var ok = await showConfirm(
          'Run All Steps — ' + p.name,
          'This will run all ' + p.steps.length + ' steps in order (commands finish before later file steps):\n\n' + stepLabels
        );
        if (!ok) { return; }

        // Single message so the extension can run steps in order (scaffold
        // commands finish before later file steps create .env / AGENTS.md / etc.).
        var steps = p.steps.map(function (step) {
          if (step.type === 'file') {
            return {
              stepType: 'file',
              label: step.label,
              filename: step.filename,
              content: step.content
            };
          }
          return {
            stepType: 'command',
            label: step.label,
            commandText: step.command
          };
        });
        vscode.postMessage({
          command: 'runAllProjectSteps',
          processName: p.name,
          steps: steps
        });
      };
    });

    bindDrag('projects-list', 'project', projects, function () {
      renderProjects();
      save('saveProjects', projects);
    });

    projects.forEach(function (p) {
      bindStepDrag(p.id, p.steps, function () {
        save('saveProjects', projects);
        renderProjects();
      });
    });
  }

  document.getElementById('add-project-btn').onclick = function () {
    var name = document.getElementById('proj-name').value.trim();
    var desc = document.getElementById('proj-desc').value.trim();
    if (!name) { return; }

    if (editingProjectId) {
      var p = projects.find(function (x) { return x.id === editingProjectId; });
      if (p) { p.name = name; p.description = desc; }
      editingProjectId = null;
      document.getElementById('add-project-btn').textContent = 'Add Process';
      document.getElementById('cancel-project-btn').style.display = 'none';
    } else {
      var newProj = { id: uid(), name: name, description: desc, steps: [] };
      projects.unshift(newProj);
      openProjects.add(newProj.id);
    }
    document.getElementById('proj-name').value = '';
    document.getElementById('proj-desc').value = '';
    renderProjects();
    save('saveProjects', projects);
  };

  document.getElementById('cancel-project-btn').onclick = function () {
    editingProjectId = null;
    document.getElementById('proj-name').value = '';
    document.getElementById('proj-desc').value = '';
    document.getElementById('add-project-btn').textContent = 'Add Process';
    document.getElementById('cancel-project-btn').style.display = 'none';
  };

  // ── INIT ──
  renderShortcuts();
  renderNotes();
  renderFiles();
  renderProjects();

}());
