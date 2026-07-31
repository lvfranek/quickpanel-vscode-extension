/** Mutable webview application state (shared across tab modules). */

export const vscode = acquireVsCodeApi();

/**
 * Decode base64 that was produced from UTF-8 bytes (Node Buffer / TextEncoder).
 * Plain `atob` returns a binary/latin1 string and corrupts characters like "…".
 */
function decodeBase64Utf8(b64) {
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Repair strings corrupted by repeated latin1/utf-8 mis-decoding.
 */
function repairUtf8Mojibake(str) {
  if (!str || typeof str !== 'string') { return str; }
  if (!/[ÃÂâ]/.test(str)) { return str; }

  var prev = str;
  for (var round = 0; round < 8; round++) {
    if (!/[ÃÂâ]/.test(prev)) { break; }
    try {
      var bytes = new Uint8Array(prev.length);
      for (var i = 0; i < prev.length; i++) {
        bytes[i] = prev.charCodeAt(i) & 0xff;
      }
      var next = new TextDecoder('utf-8').decode(bytes);
      if (!next || next === prev || next.indexOf('\uFFFD') !== -1) { break; }
      prev = next;
    } catch (_) {
      break;
    }
  }
  return prev;
}

function repairValue(value) {
  if (typeof value === 'string') {
    return repairUtf8Mojibake(value);
  }
  if (Array.isArray(value)) {
    return value.map(repairValue);
  }
  if (value && typeof value === 'object') {
    var out = {};
    Object.keys(value).forEach(function (key) {
      out[key] = repairValue(value[key]);
    });
    return out;
  }
  return value;
}

var raw = document.getElementById('initial-data').dataset.json;
var initialData = repairValue(JSON.parse(decodeBase64Utf8(raw)));

export const state = {
  files: initialData.files || [],
  projects: initialData.projects || [],
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
