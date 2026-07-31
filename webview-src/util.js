/** Shared pure helpers for the webview UI. */

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
  html = html.replace(/\*\*(.+?)\*\*/g, '<span class="md-bold">$1</span>');
  html = html.replace(/\*(.+?)\*/g, '<span class="md-italic">$1</span>');
  html = html.replace(/`(.+?)`/g, '<span class="md-code">$1</span>');
  html = html.replace(/\\n/g, '<br>');
  return html;
}
