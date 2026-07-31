/** Drag-and-drop helpers (handle-initiated). */

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
    var handle = card.querySelector('.project-header .drag-handle')
      || card.querySelector('.drag-handle');
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
