"use strict";
(() => {
  // webview-src/confirm.js
  var modalResolve = null;
  function showConfirm(title, body) {
    return new Promise(function(resolve) {
      modalResolve = resolve;
      document.getElementById("modal-title").textContent = title;
      document.getElementById("modal-body").textContent = body;
      document.getElementById("confirm-modal").classList.remove("hidden");
    });
  }
  function initConfirm() {
    document.getElementById("modal-confirm").onclick = function() {
      document.getElementById("confirm-modal").classList.add("hidden");
      if (modalResolve) {
        modalResolve(true);
        modalResolve = null;
      }
    };
    document.getElementById("modal-cancel").onclick = function() {
      document.getElementById("confirm-modal").classList.add("hidden");
      if (modalResolve) {
        modalResolve(false);
        modalResolve = null;
      }
    };
    document.getElementById("confirm-modal").addEventListener("click", function(e) {
      if (e.target === document.getElementById("confirm-modal")) {
        document.getElementById("confirm-modal").classList.add("hidden");
        if (modalResolve) {
          modalResolve(false);
          modalResolve = null;
        }
      }
    });
  }

  // webview-src/tabs.js
  function initTabs() {
    document.querySelectorAll("[data-back-home]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        document.querySelectorAll(".section").forEach(function(s) {
          s.classList.remove("active");
        });
        var home = document.getElementById("home");
        if (home) {
          home.classList.add("active");
        }
      });
    });
  }

  // webview-src/state.js
  var vscode = acquireVsCodeApi();
  function decodeBase64Utf8(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  }
  function repairUtf8Mojibake(str) {
    if (!str || typeof str !== "string") {
      return str;
    }
    if (!/[ÃÂâ]/.test(str)) {
      return str;
    }
    var prev = str;
    for (var round = 0; round < 8; round++) {
      if (!/[ÃÂâ]/.test(prev)) {
        break;
      }
      try {
        var bytes = new Uint8Array(prev.length);
        for (var i = 0; i < prev.length; i++) {
          bytes[i] = prev.charCodeAt(i) & 255;
        }
        var next = new TextDecoder("utf-8").decode(bytes);
        if (!next || next === prev || next.indexOf("\uFFFD") !== -1) {
          break;
        }
        prev = next;
      } catch (_) {
        break;
      }
    }
    return prev;
  }
  function repairValue(value) {
    if (typeof value === "string") {
      return repairUtf8Mojibake(value);
    }
    if (Array.isArray(value)) {
      return value.map(repairValue);
    }
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).forEach(function(key) {
        out[key] = repairValue(value[key]);
      });
      return out;
    }
    return value;
  }
  var raw = document.getElementById("initial-data").dataset.json;
  var initialData = repairValue(JSON.parse(decodeBase64Utf8(raw)));
  var state = {
    files: initialData.files || [],
    projects: initialData.projects || [],
    editingFileId: null,
    editingProjectId: null,
    editingStepId: null,
    editingStepProjectId: null
  };
  function save(command, data) {
    vscode.postMessage({ command, data });
  }
  function postMessage(message) {
    vscode.postMessage(message);
  }

  // webview-src/util.js
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function escapeHtml(text) {
    var d = document.createElement("div");
    d.textContent = text || "";
    return d.innerHTML;
  }

  // webview-src/dnd.js
  var dragSrcId = null;
  var dragSrcType = null;
  var dragSrcProjectId = null;
  function wireHandleDrag(item, handle, hooks) {
    if (!item || !handle) {
      return;
    }
    item.setAttribute("draggable", "false");
    handle.addEventListener("mousedown", function(e) {
      e.stopPropagation();
      item.setAttribute("draggable", "true");
    });
    item.addEventListener("mousedown", function(e) {
      if (!handle.contains(e.target)) {
        item.setAttribute("draggable", "false");
      }
    }, true);
    item.addEventListener("dragstart", function(e) {
      if (hooks.shouldIgnore && hooks.shouldIgnore(e)) {
        e.preventDefault();
        item.setAttribute("draggable", "false");
        return;
      }
      if (item.getAttribute("draggable") !== "true") {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
      try {
        e.dataTransfer.setData("text/plain", item.dataset.id || "drag");
        e.dataTransfer.effectAllowed = "move";
      } catch (_) {
      }
      hooks.onStart && hooks.onStart(e);
    });
    item.addEventListener("dragend", function(e) {
      e.stopPropagation();
      item.setAttribute("draggable", "false");
      hooks.onEnd && hooks.onEnd(e);
    });
    item.addEventListener("dragover", function(e) {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.dataTransfer.dropEffect = "move";
      } catch (_) {
      }
      hooks.onOver && hooks.onOver(e);
    });
    item.addEventListener("dragleave", function(e) {
      e.stopPropagation();
      hooks.onLeave && hooks.onLeave(e);
    });
    item.addEventListener("drop", function(e) {
      e.preventDefault();
      e.stopPropagation();
      hooks.onDrop && hooks.onDrop(e);
    });
  }
  function bindStepDrag(projectId, stepsArray, onDrop) {
    var container = document.getElementById("steps-list-" + projectId);
    if (!container) {
      return;
    }
    var items = Array.prototype.slice.call(container.querySelectorAll('[data-drag-type="step"]'));
    function clearOver() {
      items.forEach(function(i) {
        i.classList.remove("drag-over");
      });
    }
    items.forEach(function(item) {
      var handle = item.querySelector(":scope > .drag-handle") || item.querySelector(".drag-handle");
      wireHandleDrag(item, handle, {
        onStart: function() {
          dragSrcId = item.dataset.id;
          dragSrcType = "step";
          dragSrcProjectId = projectId;
          item.classList.add("dragging");
          var parentCard = item.closest('[data-drag-type="project"]');
          if (parentCard) {
            parentCard.setAttribute("draggable", "false");
          }
        },
        onEnd: function() {
          item.classList.remove("dragging");
          clearOver();
          dragSrcId = null;
          dragSrcType = null;
          dragSrcProjectId = null;
        },
        onOver: function() {
          if (dragSrcType !== "step" || dragSrcProjectId !== projectId) {
            return;
          }
          clearOver();
          item.classList.add("drag-over");
        },
        onLeave: function() {
          item.classList.remove("drag-over");
        },
        onDrop: function() {
          item.classList.remove("drag-over");
          if (!dragSrcId || dragSrcId === item.dataset.id || dragSrcType !== "step" || dragSrcProjectId !== projectId) {
            return;
          }
          var fromIdx = stepsArray.findIndex(function(s) {
            return s.id === dragSrcId;
          });
          var toIdx = stepsArray.findIndex(function(s) {
            return s.id === item.dataset.id;
          });
          if (fromIdx < 0 || toIdx < 0) {
            return;
          }
          var moved = stepsArray.splice(fromIdx, 1)[0];
          stepsArray.splice(toIdx, 0, moved);
          onDrop();
        }
      });
    });
  }
  function bindCardDrag(container, items, onReorder) {
    if (!container) {
      return;
    }
    var cards = Array.prototype.slice.call(container.querySelectorAll(":scope > .project-card"));
    function clearOver() {
      cards.forEach(function(c) {
        c.classList.remove("drag-over");
      });
    }
    cards.forEach(function(card) {
      var handle = card.querySelector(".project-header .drag-handle") || card.querySelector(".drag-handle");
      if (!handle) {
        return;
      }
      wireHandleDrag(card, handle, {
        shouldIgnore: function(e) {
          var t = e.target;
          return !!(t && t.closest && t.closest('[data-drag-type="step"]'));
        },
        onStart: function() {
          dragSrcId = card.dataset.id;
          dragSrcType = "project";
          card.classList.add("dragging");
        },
        onEnd: function() {
          card.classList.remove("dragging");
          clearOver();
          dragSrcId = null;
          dragSrcType = null;
        },
        onOver: function() {
          if (dragSrcType !== "project") {
            return;
          }
          clearOver();
          card.classList.add("drag-over");
        },
        onLeave: function() {
          card.classList.remove("drag-over");
        },
        onDrop: function() {
          card.classList.remove("drag-over");
          if (!dragSrcId || dragSrcId === card.dataset.id || dragSrcType !== "project") {
            return;
          }
          var fromIdx = items.findIndex(function(x) {
            return x.id === dragSrcId;
          });
          var toIdx = items.findIndex(function(x) {
            return x.id === card.dataset.id;
          });
          if (fromIdx < 0 || toIdx < 0) {
            return;
          }
          var moved = items.splice(fromIdx, 1)[0];
          items.splice(toIdx, 0, moved);
          if (onReorder) {
            onReorder();
          }
        }
      });
    });
  }

  // webview-src/tabs/home.js
  var openProjects = /* @__PURE__ */ new Set();
  var openStepForms = /* @__PURE__ */ new Set();
  var stepTypeSelection = {};
  var addingCategory = null;
  function categoryOf(p) {
    if (!p) {
      return "process";
    }
    if (p.kind === "terminal" || p.kind === "process") {
      return p.kind;
    }
    if (p.kind === "quick" || p.kind === "skill") {
      return "terminal";
    }
    if (p.id && String(p.id).indexOf("skill") === 0) {
      return "terminal";
    }
    if (p.id && String(p.id).indexOf("quick") === 0) {
      return "terminal";
    }
    var singleCmd = !!(p.steps && p.steps.length === 1 && p.steps[0].type === "command" && p.steps[0].command);
    if (singleCmd) {
      return "terminal";
    }
    return "process";
  }
  function projectsIn(category) {
    return state.projects.filter(function(p) {
      return categoryOf(p) === category;
    });
  }
  function isSingleCommand(p) {
    return !!(p && p.steps && p.steps.length === 1 && p.steps[0].type === "command" && p.steps[0].command);
  }
  function singleCommandText(p) {
    if (!isSingleCommand(p)) {
      return "";
    }
    return p.steps[0].command || "";
  }
  function isFavoriteProject(p) {
    return !!(p && p.favorite);
  }
  function isFavoriteFile(f) {
    return !!(f && f.favorite);
  }
  function normalizeData() {
    state.projects.forEach(function(p) {
      var cat = categoryOf(p);
      if (p.kind !== cat) {
        p.kind = cat;
      }
      if (typeof p.favorite !== "boolean") {
        p.favorite = !!p.pinned;
      }
      if ("pinned" in p) {
        delete p.pinned;
      }
    });
    state.files.forEach(function(f) {
      if (typeof f.favorite !== "boolean") {
        f.favorite = false;
      }
    });
  }
  function buildRunAllPayload(p) {
    return (p.steps || []).map(function(step) {
      if (step.type === "file") {
        return {
          stepType: "file",
          label: step.label,
          filename: step.filename,
          content: step.content
        };
      }
      return {
        stepType: "command",
        label: step.label,
        commandText: step.command
      };
    });
  }
  async function runProject(p) {
    if (!p || !p.steps || !p.steps.length) {
      return;
    }
    if (categoryOf(p) === "terminal" || isSingleCommand(p)) {
      var step = p.steps[0];
      if (step.type === "command") {
        postMessage({
          command: "runProjectStep",
          stepType: "command",
          label: step.label || p.name,
          commandText: step.command
        });
        return;
      }
      if (step.type === "file") {
        postMessage({
          command: "runProjectStep",
          stepType: "file",
          label: step.label,
          filename: step.filename,
          content: step.content
        });
        return;
      }
    }
    var stepLabels = p.steps.map(function(s, i) {
      return i + 1 + ". " + s.label;
    }).join("\n");
    var ok = await showConfirm(
      "Run \u2014 " + p.name,
      "This will run all " + p.steps.length + " steps in order:\n\n" + stepLabels
    );
    if (!ok) {
      return;
    }
    postMessage({
      command: "runAllProjectSteps",
      processName: p.name,
      steps: buildRunAllPayload(p)
    });
  }
  async function runStep(step) {
    if (!step) {
      return;
    }
    if (step.type === "file") {
      postMessage({
        command: "runProjectStep",
        stepType: "file",
        label: step.label,
        filename: step.filename,
        content: step.content
      });
      return;
    }
    postMessage({
      command: "runProjectStep",
      stepType: "command",
      label: step.label,
      commandText: step.command
    });
  }
  async function runFile(f) {
    if (!f) {
      return;
    }
    postMessage({ command: "createFile", filename: f.filename, content: f.content });
  }
  function clearStepEdit(projectId) {
    if (projectId) {
      openStepForms.delete(projectId);
      delete stepTypeSelection[projectId];
    }
    state.editingStepId = null;
    state.editingStepProjectId = null;
  }
  function openStepEditor(projectId, step) {
    openProjects.add(projectId);
    openStepForms.add(projectId);
    if (step) {
      state.editingStepId = step.id;
      state.editingStepProjectId = projectId;
      stepTypeSelection[projectId] = step.type || "command";
    } else {
      state.editingStepId = null;
      state.editingStepProjectId = null;
      stepTypeSelection[projectId] = stepTypeSelection[projectId] || "command";
    }
    renderHome();
    var focusId = step && step.type === "file" ? "step-filename-" + projectId : "step-command-" + projectId;
    if (step) {
      var labelEl = document.getElementById("step-label-" + projectId);
      if (labelEl) {
        labelEl.focus();
      }
    } else {
      var el = document.getElementById("step-label-" + projectId);
      if (el) {
        el.focus();
      }
    }
  }
  function closeInlineEdit() {
    state.editingProjectId = null;
    state.editingFileId = null;
  }
  function closeAddForm() {
    addingCategory = null;
  }
  function stepCountLabel(n) {
    return n + " step" + (n === 1 ? "" : "s");
  }
  function favoritesHtml() {
    var favProjects = state.projects.filter(isFavoriteProject);
    var favFiles = state.files.filter(isFavoriteFile);
    var items = [];
    favProjects.forEach(function(p) {
      items.push({
        id: p.id,
        type: "project",
        name: p.name,
        detail: categoryOf(p) === "terminal" ? singleCommandText(p) : p.description || stepCountLabel(p.steps.length)
      });
    });
    favFiles.forEach(function(f) {
      items.push({
        id: f.id,
        type: "file",
        name: f.name,
        detail: f.filename
      });
    });
    var chips = items.length ? items.map(function(item) {
      return '<div class="fav-chip" data-fav-type="' + item.type + '" data-fav-id="' + item.id + '"><button type="button" class="fav-run" data-fav-run-type="' + item.type + '" data-fav-run-id="' + item.id + '" title="Run"><span class="fav-run-icon" aria-hidden="true">\u25B6</span><span class="fav-run-text"><span class="fav-name">' + escapeHtml(item.name) + "</span>" + (item.detail ? '<span class="fav-detail">' + escapeHtml(item.detail) + "</span>" : "") + '</span></button><button type="button" class="fav-unstar icon-btn" data-unfav-type="' + item.type + '" data-unfav-id="' + item.id + '" title="Remove favorite">\u2605</button></div>';
    }).join("") : '<div class="fav-empty">Star items below to pin one-click actions here</div>';
    return '<section class="favorites-panel"><div class="favorites-header"><div class="category-title">Favorites</div><button type="button" class="info-btn" data-open-info title="How to use Quickpanel" aria-label="How to use Quickpanel">i</button></div><div class="favorites-strip">' + chips + "</div></section>";
  }
  function starBtn(isFav, dataAttrs) {
    return '<button type="button" class="icon-btn star-btn' + (isFav ? " active" : "") + '" ' + dataAttrs + ' title="' + (isFav ? "Remove favorite" : "Add to favorites") + '">' + (isFav ? "\u2605" : "\u2606") + "</button>";
  }
  function projectInlineEditHtml(p) {
    var kind = categoryOf(p);
    var nameVal = escapeHtml(p.name || "");
    var descVal = escapeHtml(p.description || "");
    var cmdVal = escapeHtml(singleCommandText(p) || p.steps[0] && p.steps[0].command || "");
    if (kind === "terminal") {
      return '<div class="inline-form" data-inline-edit-project="' + p.id + '"><div class="inline-form-title">Edit command</div><input id="edit-name-' + p.id + '" placeholder="Name (e.g. Dev server)" value="' + nameVal + '" /><input id="edit-command-' + p.id + '" placeholder="Command (e.g. npm run dev)" value="' + cmdVal + '" /><div class="btn-row"><button class="btn small" data-save-edit-project="' + p.id + '" type="button">Save</button><button class="btn secondary small" data-cancel-edit type="button">Cancel</button></div></div>';
    }
    return '<div class="inline-form" data-inline-edit-project="' + p.id + '"><div class="inline-form-title">Edit process</div><input id="edit-name-' + p.id + '" placeholder="Name" value="' + nameVal + '" /><input id="edit-desc-' + p.id + '" placeholder="Short description" value="' + descVal + '" /><div class="btn-row"><button class="btn small" data-save-edit-project="' + p.id + '" type="button">Save</button><button class="btn secondary small" data-cancel-edit type="button">Cancel</button></div></div>';
  }
  function fileInlineEditHtml(f) {
    return '<div class="inline-form" data-inline-edit-file="' + f.id + '"><div class="inline-form-title">Edit file template</div><input id="edit-file-name-' + f.id + '" placeholder="Display name" value="' + escapeHtml(f.name || "") + '" /><input id="edit-file-filename-' + f.id + '" placeholder="Filename" value="' + escapeHtml(f.filename || "") + '" /><textarea id="edit-file-content-' + f.id + '" placeholder="File content..." style="min-height:80px;">' + escapeHtml(f.content || "") + '</textarea><div class="btn-row"><button class="btn small" data-save-edit-file="' + f.id + '" type="button">Save</button><button class="btn secondary small" data-cancel-edit type="button">Cancel</button></div></div>';
  }
  function stepInlineFormHtml(p, step) {
    var isEdit = !!step;
    var stepType = step ? step.type || "command" : stepTypeSelection[p.id] || "command";
    var labelVal = step ? escapeHtml(step.label || "") : "";
    var commandVal = step && step.type === "command" ? escapeHtml(step.command || "") : "";
    var filenameVal = step && step.type === "file" ? escapeHtml(step.filename || "") : "";
    var contentVal = step && step.type === "file" ? escapeHtml(step.content || "") : "";
    var cmdWrap = stepType === "file" ? "display:none" : "";
    var fileWrap = stepType === "file" ? "" : "display:none";
    return '<div class="inline-form step-inline-form" id="step-form-' + p.id + '"><div class="inline-form-title">' + (isEdit ? "Edit step" : "New step") + '</div><input id="step-label-' + p.id + '" placeholder="Step title" value="' + labelVal + '" /><div class="step-type-toggle"><button class="type-opt' + (stepType === "command" ? " selected" : "") + '" data-type-select="command" data-project-id="' + p.id + '" type="button">Command</button><button class="type-opt' + (stepType === "file" ? " selected" : "") + '" data-type-select="file" data-project-id="' + p.id + '" type="button">File</button></div><div id="step-command-wrap-' + p.id + '" style="' + cmdWrap + '"><input id="step-command-' + p.id + '" placeholder="Terminal command (e.g. npm install)" value="' + commandVal + '" /></div><div id="step-file-wrap-' + p.id + '" style="' + fileWrap + '"><input id="step-filename-' + p.id + '" placeholder="Filename (e.g. .env)" value="' + filenameVal + '" /><textarea id="step-fcontent-' + p.id + '" placeholder="File content..." style="min-height:60px;">' + contentVal + '</textarea></div><div class="btn-row"><button class="btn small" data-save-step="' + p.id + '" type="button">' + (isEdit ? "Save step" : "Add step") + '</button><button class="btn secondary small" data-cancel-step="' + p.id + '" type="button">Cancel</button></div></div>';
  }
  function stepsBodyHtml(p) {
    if (!openProjects.has(p.id)) {
      return "";
    }
    var showStepForm = openStepForms.has(p.id);
    var isEditingStep = state.editingStepProjectId === p.id && !!state.editingStepId;
    var editingStep = isEditingStep ? p.steps.find(function(s) {
      return s.id === state.editingStepId;
    }) : null;
    var stepsHtml = p.steps.length ? p.steps.map(function(step, idx) {
      var isThisEditing = state.editingStepId === step.id && state.editingStepProjectId === p.id;
      if (isThisEditing) {
        return '<div class="step-item step-editing" data-id="' + step.id + '" data-project-id="' + p.id + '" data-drag-type="step">' + stepInlineFormHtml(p, step) + "</div>";
      }
      var detail = step.type === "file" ? escapeHtml(step.filename || "") : escapeHtml(step.command || "");
      var typeLabel = step.type === "file" ? "file" : "command";
      var runLabel = step.type === "file" ? "Create" : "Run";
      return '<div class="step-item" draggable="false" data-id="' + step.id + '" data-project-id="' + p.id + '" data-drag-type="step"><div class="step-number">' + (idx + 1) + '</div><div class="step-main"><div class="step-label">' + escapeHtml(step.label) + '</div><div class="step-line"><span class="step-type-inline">' + typeLabel + "</span>" + (detail ? '<code class="step-code">' + detail + "</code>" : "") + '</div></div><div class="step-actions"><button class="btn small" data-run-step="' + step.id + '" data-project-id="' + p.id + '" type="button">' + runLabel + '</button><button class="icon-btn" data-edit-step="' + step.id + '" data-project-id="' + p.id + '" title="Edit step" type="button">\u270E</button><button class="icon-btn danger" data-delete-step="' + step.id + '" data-project-id="' + p.id + '" title="Delete step" type="button">\xD7</button></div><div class="drag-handle" title="Drag to reorder" draggable="false">\u283F</div></div>';
    }).join("") : '<div class="empty">No steps yet \u2014 add one below</div>';
    var addForm = "";
    if (showStepForm && !isEditingStep) {
      addForm = stepInlineFormHtml(p, null);
    }
    return '<div class="project-body"><div class="steps-list" id="steps-list-' + p.id + '">' + stepsHtml + '</div><div class="run-all-row"><button class="btn small" data-run-all="' + p.id + '" type="button">\u25B6 Run all</button><button class="btn secondary small" data-toggle-step-form="' + p.id + '" type="button">+ Add step</button></div>' + addForm + "</div>";
  }
  function projectCardHtml(p) {
    var kind = categoryOf(p);
    var isOpen = openProjects.has(p.id);
    var isEditing = state.editingProjectId === p.id;
    var canRun = p.steps.length > 0;
    var fav = isFavoriteProject(p);
    var cmdPreview = singleCommandText(p);
    var subtitle = cmdPreview ? '<div class="project-cmd-preview" title="' + escapeHtml(cmdPreview) + '">' + escapeHtml(cmdPreview) + "</div>" : p.description ? '<div class="project-desc">' + escapeHtml(p.description) + "</div>" : "";
    var leftActions = '<div class="project-actions-left"><button class="run-btn" data-run-process="' + p.id + '"' + (canRun ? "" : " disabled") + ' type="button" title="Run">\u25B6 Run</button><button class="icon-btn" data-edit-project="' + p.id + '" type="button" title="Edit">\u270E</button>' + starBtn(fav, 'data-fav-project="' + p.id + '"') + (kind === "process" ? '<button class="steps-toggle" data-toggle-project="' + p.id + '" type="button" aria-expanded="' + (isOpen ? "true" : "false") + '"><span class="steps-toggle-label">' + stepCountLabel(p.steps.length) + '</span><span class="steps-chevron" aria-hidden="true">\u203A</span></button>' : "") + "</div>";
    var rightActions = '<div class="project-actions-right"><button class="icon-btn danger" data-delete-project="' + p.id + '" type="button" title="Delete">\xD7</button><div class="drag-handle" title="Drag to reorder" draggable="false">\u283F</div></div>';
    return '<div class="project-card' + (isOpen ? " open" : "") + (isEditing ? " editing" : "") + '" draggable="false" data-id="' + p.id + '" data-project-id="' + p.id + '" data-drag-type="project" data-category="' + kind + '"><div class="project-header">' + leftActions + '<div class="project-header-info"><div class="project-name">' + escapeHtml(p.name) + "</div>" + subtitle + "</div>" + rightActions + "</div>" + (isEditing ? projectInlineEditHtml(p) : "") + (kind === "process" ? stepsBodyHtml(p) : "") + "</div>";
  }
  function fileCardHtml(f) {
    var isEditing = state.editingFileId === f.id;
    var fav = isFavoriteFile(f);
    return '<div class="project-card file-card' + (isEditing ? " editing" : "") + '" draggable="false" data-id="' + f.id + '" data-drag-type="file"><div class="project-header"><div class="project-actions-left"><button class="run-btn" data-run-file="' + f.id + '" type="button" title="Create file">\u25B6 Run</button><button class="icon-btn" data-edit-file="' + f.id + '" type="button" title="Edit">\u270E</button>' + starBtn(fav, 'data-fav-file="' + f.id + '"') + '</div><div class="project-header-info"><div class="project-name">' + escapeHtml(f.name) + '</div><div class="project-cmd-preview">' + escapeHtml(f.filename) + '</div></div><div class="project-actions-right"><button class="icon-btn danger" data-delete-file="' + f.id + '" type="button" title="Delete">\xD7</button><div class="drag-handle" title="Drag to reorder" draggable="false">\u283F</div></div></div>' + (isEditing ? fileInlineEditHtml(f) : "") + "</div>";
  }
  function categoryAddFormHtml(kind) {
    if (addingCategory !== kind) {
      return "";
    }
    if (kind === "terminal") {
      return '<div class="inline-form" data-category-add="terminal"><div class="inline-form-title">Add terminal command</div><input id="add-name-terminal" placeholder="Name (e.g. Dev server)" /><input id="add-command-terminal" placeholder="Command (e.g. npm run dev)" /><div class="btn-row"><button class="btn small" data-save-add="terminal" type="button">Add</button><button class="btn secondary small" data-cancel-add type="button">Cancel</button></div></div>';
    }
    if (kind === "process") {
      return '<div class="inline-form" data-category-add="process"><div class="inline-form-title">Add process</div><input id="add-name-process" placeholder="Name (e.g. Create Next.js App)" /><input id="add-desc-process" placeholder="Short description" /><div class="btn-row"><button class="btn small" data-save-add="process" type="button">Add</button><button class="btn secondary small" data-cancel-add type="button">Cancel</button></div></div>';
    }
    return '<div class="inline-form" data-category-add="file"><div class="inline-form-title">Add file template</div><input id="add-name-file" placeholder="Display name (e.g. .env)" /><input id="add-filename-file" placeholder="Filename (e.g. .env)" /><textarea id="add-content-file" placeholder="File content..." style="min-height:70px;"></textarea><div class="btn-row"><button class="btn small" data-save-add="file" type="button">Add</button><button class="btn secondary small" data-cancel-add type="button">Cancel</button></div></div>';
  }
  function categoryPanelHtml(kind) {
    var title;
    var sub;
    var empty;
    var addLabel;
    var cards;
    var cardsId;
    if (kind === "terminal") {
      title = "Single-line terminal commands";
      empty = "No terminal commands yet";
      addLabel = "Add command";
      cards = projectsIn("terminal").map(projectCardHtml).join("");
      cardsId = "cards-terminal";
    } else if (kind === "process") {
      title = "Multi-step processes";
      empty = "No processes yet";
      addLabel = "Add process";
      cards = projectsIn("process").map(projectCardHtml).join("");
      cardsId = "cards-process";
    } else {
      title = "File creation";
      empty = "No file templates yet";
      addLabel = "Add file";
      cards = state.files.map(fileCardHtml).join("");
      cardsId = "cards-file";
    }
    var body = categoryAddFormHtml(kind) + (cards ? '<div class="cards-list" id="' + cardsId + '">' + cards + "</div>" : addingCategory === kind ? "" : '<div class="category-empty">' + escapeHtml(empty) + "</div>");
    return '<section class="category-panel" data-category-panel="' + kind + '"><div class="category-header"><div class="category-title">' + escapeHtml(title) + '</div><button class="category-add-btn" data-open-add="' + kind + '" type="button">+ ' + escapeHtml(addLabel) + '</button></div><div class="category-body">' + body + "</div></section>";
  }
  function renderHome() {
    var root = document.getElementById("home-root");
    if (!root) {
      return;
    }
    normalizeData();
    root.innerHTML = favoritesHtml() + categoryPanelHtml("terminal") + categoryPanelHtml("process") + categoryPanelHtml("file");
    bindHomeEvents();
    if (addingCategory) {
      var focusMap = {
        terminal: "add-name-terminal",
        process: "add-name-process",
        file: "add-name-file"
      };
      var el = document.getElementById(focusMap[addingCategory]);
      if (el) {
        el.focus();
      }
    } else if (state.editingProjectId) {
      var pe = document.getElementById("edit-name-" + state.editingProjectId);
      if (pe) {
        pe.focus();
      }
    } else if (state.editingFileId) {
      var fe = document.getElementById("edit-file-name-" + state.editingFileId);
      if (fe) {
        fe.focus();
      }
    } else if (state.editingStepProjectId) {
      var se = document.getElementById("step-label-" + state.editingStepProjectId);
      if (se) {
        se.focus();
      }
    }
  }
  function bindHomeEvents() {
    document.querySelectorAll("[data-open-info]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        document.querySelectorAll(".section").forEach(function(s) {
          s.classList.remove("active");
        });
        var info = document.getElementById("info");
        if (info) {
          info.classList.add("active");
        }
      };
    });
    document.querySelectorAll("[data-fav-run-id]").forEach(function(btn) {
      btn.onclick = async function(e) {
        e.stopPropagation();
        var type = btn.dataset.favRunType;
        var id = btn.dataset.favRunId;
        if (type === "file") {
          var f = state.files.find(function(x) {
            return x.id === id;
          });
          if (f) {
            await runFile(f);
          }
        } else {
          var p = state.projects.find(function(x) {
            return x.id === id;
          });
          if (p) {
            await runProject(p);
          }
        }
      };
    });
    document.querySelectorAll("[data-unfav-id]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var type = btn.dataset.unfavType;
        var id = btn.dataset.unfavId;
        if (type === "file") {
          var f = state.files.find(function(x) {
            return x.id === id;
          });
          if (f) {
            f.favorite = false;
            save("saveFiles", state.files);
          }
        } else {
          var p = state.projects.find(function(x) {
            return x.id === id;
          });
          if (p) {
            p.favorite = false;
            save("saveProjects", state.projects);
          }
        }
        renderHome();
      };
    });
    document.querySelectorAll("[data-fav-project]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var p = state.projects.find(function(x) {
          return x.id === btn.dataset.favProject;
        });
        if (!p) {
          return;
        }
        p.favorite = !p.favorite;
        save("saveProjects", state.projects);
        renderHome();
      };
    });
    document.querySelectorAll("[data-fav-file]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var f = state.files.find(function(x) {
          return x.id === btn.dataset.favFile;
        });
        if (!f) {
          return;
        }
        f.favorite = !f.favorite;
        save("saveFiles", state.files);
        renderHome();
      };
    });
    document.querySelectorAll("[data-open-add]").forEach(function(btn) {
      btn.onclick = function() {
        var kind = btn.dataset.openAdd;
        closeInlineEdit();
        clearStepEdit();
        addingCategory = addingCategory === kind ? null : kind;
        renderHome();
      };
    });
    document.querySelectorAll("[data-cancel-add]").forEach(function(btn) {
      btn.onclick = function() {
        closeAddForm();
        renderHome();
      };
    });
    document.querySelectorAll("[data-save-add]").forEach(function(btn) {
      btn.onclick = function() {
        var kind = btn.dataset.saveAdd;
        if (kind === "terminal") {
          var nameT = (document.getElementById("add-name-terminal") || {}).value;
          var cmdT = (document.getElementById("add-command-terminal") || {}).value;
          nameT = (nameT || "").trim();
          cmdT = (cmdT || "").trim();
          if (!nameT || !cmdT) {
            return;
          }
          insertProject({
            id: uid(),
            name: nameT,
            description: "",
            kind: "terminal",
            favorite: false,
            steps: [{ id: uid(), label: nameT, type: "command", command: cmdT }]
          }, "terminal");
        } else if (kind === "process") {
          var nameP = (document.getElementById("add-name-process") || {}).value;
          var descP = (document.getElementById("add-desc-process") || {}).value;
          nameP = (nameP || "").trim();
          descP = (descP || "").trim();
          if (!nameP) {
            return;
          }
          var newP = {
            id: uid(),
            name: nameP,
            description: descP,
            kind: "process",
            favorite: false,
            steps: []
          };
          insertProject(newP, "process");
          openProjects.add(newP.id);
        } else if (kind === "file") {
          var nameF = (document.getElementById("add-name-file") || {}).value;
          var filenameF = (document.getElementById("add-filename-file") || {}).value;
          var contentF = (document.getElementById("add-content-file") || {}).value;
          nameF = (nameF || "").trim();
          filenameF = (filenameF || "").trim();
          if (!nameF || !filenameF) {
            return;
          }
          state.files.unshift({
            id: uid(),
            name: nameF,
            filename: filenameF,
            content: contentF || "",
            favorite: false
          });
          save("saveFiles", state.files);
        }
        closeAddForm();
        renderHome();
      };
    });
    function insertProject(proj, category) {
      var next = [];
      var inserted = false;
      state.projects.forEach(function(p) {
        if (!inserted && categoryOf(p) === category) {
          next.push(proj);
          inserted = true;
        }
        next.push(p);
      });
      if (!inserted) {
        next.push(proj);
      }
      state.projects = next;
      save("saveProjects", state.projects);
    }
    document.querySelectorAll("[data-run-process]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var p = state.projects.find(function(x) {
          return x.id === btn.dataset.runProcess;
        });
        if (p) {
          runProject(p);
        }
      };
    });
    document.querySelectorAll("[data-toggle-project]").forEach(function(el) {
      el.onclick = function(e) {
        e.stopPropagation();
        var id = el.dataset.toggleProject;
        if (openProjects.has(id)) {
          openProjects.delete(id);
        } else {
          openProjects.add(id);
        }
        renderHome();
      };
    });
    document.querySelectorAll("[data-delete-project]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var pid = btn.dataset.deleteProject;
        state.projects = state.projects.filter(function(p) {
          return p.id !== pid;
        });
        openProjects.delete(pid);
        if (state.editingProjectId === pid) {
          closeInlineEdit();
        }
        clearStepEdit(pid);
        save("saveProjects", state.projects);
        renderHome();
      };
    });
    document.querySelectorAll("[data-edit-project]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var pid = btn.dataset.editProject;
        closeAddForm();
        state.editingFileId = null;
        clearStepEdit();
        state.editingProjectId = state.editingProjectId === pid ? null : pid;
        renderHome();
      };
    });
    document.querySelectorAll("[data-cancel-edit]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        closeInlineEdit();
        renderHome();
      };
    });
    document.querySelectorAll("[data-save-edit-project]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var pid = btn.dataset.saveEditProject;
        var p = state.projects.find(function(x) {
          return x.id === pid;
        });
        if (!p) {
          return;
        }
        var kind = categoryOf(p);
        var name = (document.getElementById("edit-name-" + pid) || {}).value;
        name = (name || "").trim();
        if (!name) {
          return;
        }
        if (kind === "terminal") {
          var cmd = (document.getElementById("edit-command-" + pid) || {}).value;
          cmd = (cmd || "").trim();
          if (!cmd) {
            return;
          }
          p.name = name;
          p.kind = "terminal";
          p.steps = [{
            id: p.steps[0] && p.steps[0].id || uid(),
            label: name,
            type: "command",
            command: cmd
          }];
        } else {
          var desc = (document.getElementById("edit-desc-" + pid) || {}).value;
          desc = (desc || "").trim();
          p.name = name;
          p.description = desc;
          p.kind = "process";
        }
        closeInlineEdit();
        save("saveProjects", state.projects);
        renderHome();
      };
    });
    document.querySelectorAll("[data-run-file]").forEach(function(btn) {
      btn.onclick = async function(e) {
        e.stopPropagation();
        var f = state.files.find(function(x) {
          return x.id === btn.dataset.runFile;
        });
        if (f) {
          await runFile(f);
        }
      };
    });
    document.querySelectorAll("[data-delete-file]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        state.files = state.files.filter(function(f) {
          return f.id !== btn.dataset.deleteFile;
        });
        if (state.editingFileId === btn.dataset.deleteFile) {
          closeInlineEdit();
        }
        save("saveFiles", state.files);
        renderHome();
      };
    });
    document.querySelectorAll("[data-edit-file]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var fid = btn.dataset.editFile;
        closeAddForm();
        state.editingProjectId = null;
        clearStepEdit();
        state.editingFileId = state.editingFileId === fid ? null : fid;
        renderHome();
      };
    });
    document.querySelectorAll("[data-save-edit-file]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var fid = btn.dataset.saveEditFile;
        var f = state.files.find(function(x) {
          return x.id === fid;
        });
        if (!f) {
          return;
        }
        var name = (document.getElementById("edit-file-name-" + fid) || {}).value;
        var filename = (document.getElementById("edit-file-filename-" + fid) || {}).value;
        var content = (document.getElementById("edit-file-content-" + fid) || {}).value;
        name = (name || "").trim();
        filename = (filename || "").trim();
        if (!name || !filename) {
          return;
        }
        f.name = name;
        f.filename = filename;
        f.content = content || "";
        closeInlineEdit();
        save("saveFiles", state.files);
        renderHome();
      };
    });
    document.querySelectorAll("[data-type-select]").forEach(function(btn) {
      btn.onclick = function() {
        var pid = btn.dataset.projectId;
        var type = btn.dataset.typeSelect;
        stepTypeSelection[pid] = type;
        btn.closest(".step-type-toggle").querySelectorAll(".type-opt").forEach(function(b) {
          b.classList.remove("selected");
        });
        btn.classList.add("selected");
        var cw = document.getElementById("step-command-wrap-" + pid);
        var fw = document.getElementById("step-file-wrap-" + pid);
        if (cw) {
          cw.style.display = type === "file" ? "none" : "";
        }
        if (fw) {
          fw.style.display = type === "file" ? "" : "none";
        }
      };
    });
    document.querySelectorAll("[data-toggle-step-form]").forEach(function(btn) {
      btn.onclick = function() {
        var pid = btn.dataset.toggleStepForm;
        if (openStepForms.has(pid) && !(state.editingStepProjectId === pid && state.editingStepId)) {
          clearStepEdit(pid);
          renderHome();
          return;
        }
        openStepEditor(pid, null);
      };
    });
    document.querySelectorAll("[data-cancel-step]").forEach(function(btn) {
      btn.onclick = function() {
        clearStepEdit(btn.dataset.cancelStep);
        renderHome();
      };
    });
    document.querySelectorAll("[data-save-step]").forEach(function(btn) {
      btn.onclick = function() {
        var pid = btn.dataset.saveStep;
        var label = (document.getElementById("step-label-" + pid) || {}).value;
        label = (label || "").trim();
        if (!label) {
          return;
        }
        var type = stepTypeSelection[pid] || "command";
        var p = state.projects.find(function(x) {
          return x.id === pid;
        });
        if (!p) {
          return;
        }
        var payload;
        if (type === "file") {
          var filename = (document.getElementById("step-filename-" + pid) || {}).value;
          var content = (document.getElementById("step-fcontent-" + pid) || {}).value;
          filename = (filename || "").trim();
          if (!filename) {
            return;
          }
          payload = { label, type: "file", filename, content: content || "" };
        } else {
          var command = (document.getElementById("step-command-" + pid) || {}).value;
          command = (command || "").trim();
          if (!command) {
            return;
          }
          payload = { label, type: "command", command };
        }
        if (state.editingStepId && state.editingStepProjectId === pid) {
          var existing = p.steps.find(function(s) {
            return s.id === state.editingStepId;
          });
          if (existing) {
            existing.label = payload.label;
            existing.type = payload.type;
            if (payload.type === "file") {
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
          if (payload.type === "file") {
            step.filename = payload.filename;
            step.content = payload.content;
          } else {
            step.command = payload.command;
          }
          p.steps.push(step);
        }
        clearStepEdit(pid);
        save("saveProjects", state.projects);
        renderHome();
      };
    });
    document.querySelectorAll("[data-edit-step]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var pid = btn.dataset.projectId;
        var stepId = btn.dataset.editStep;
        var p = state.projects.find(function(x) {
          return x.id === pid;
        });
        if (!p) {
          return;
        }
        var step = p.steps.find(function(s) {
          return s.id === stepId;
        });
        if (!step) {
          return;
        }
        closeInlineEdit();
        closeAddForm();
        openStepEditor(pid, step);
      };
    });
    document.querySelectorAll("[data-delete-step]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var pid = btn.dataset.projectId;
        var stepId = btn.dataset.deleteStep;
        var p = state.projects.find(function(x) {
          return x.id === pid;
        });
        if (!p) {
          return;
        }
        p.steps = p.steps.filter(function(s) {
          return s.id !== stepId;
        });
        if (state.editingStepId === stepId) {
          clearStepEdit(pid);
        }
        save("saveProjects", state.projects);
        renderHome();
      };
    });
    document.querySelectorAll("[data-run-step]").forEach(function(btn) {
      btn.onclick = async function(e) {
        e.stopPropagation();
        var pid = btn.dataset.projectId;
        var stepId = btn.dataset.runStep;
        var p = state.projects.find(function(x) {
          return x.id === pid;
        });
        if (!p) {
          return;
        }
        var step = p.steps.find(function(s) {
          return s.id === stepId;
        });
        if (!step) {
          return;
        }
        await runStep(step);
      };
    });
    document.querySelectorAll("[data-run-all]").forEach(function(btn) {
      btn.onclick = async function(e) {
        e.stopPropagation();
        var p = state.projects.find(function(x) {
          return x.id === btn.dataset.runAll;
        });
        if (p) {
          await runProject(p);
        }
      };
    });
    ["terminal", "process"].forEach(function(kind) {
      var root = document.getElementById("cards-" + kind);
      if (!root) {
        return;
      }
      bindCardDrag(root, state.projects, function() {
        save("saveProjects", state.projects);
        renderHome();
      });
    });
    var fileRoot = document.getElementById("cards-file");
    if (fileRoot) {
      bindCardDrag(fileRoot, state.files, function() {
        save("saveFiles", state.files);
        renderHome();
      });
    }
    state.projects.forEach(function(p) {
      if (document.getElementById("steps-list-" + p.id)) {
        bindStepDrag(p.id, p.steps, function() {
          save("saveProjects", state.projects);
          renderHome();
        });
      }
    });
  }

  // webview-src/main.js
  function safe(label, fn) {
    try {
      fn();
    } catch (err) {
      console.error("[Quickpanel] " + label + " failed:", err);
    }
  }
  safe("initConfirm", initConfirm);
  safe("initTabs", initTabs);
  safe("renderHome", renderHome);
})();
//# sourceMappingURL=webview.js.map
