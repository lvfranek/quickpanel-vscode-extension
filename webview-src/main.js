/**
 * Quickpanel webview entry.
 * Built by esbuild → media/webview.js
 */
import { initConfirm } from './confirm.js';
import { initTabs } from './tabs.js';
import { renderHome } from './tabs/home.js';

function safe(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error('[Quickpanel] ' + label + ' failed:', err);
  }
}

safe('initConfirm', initConfirm);
safe('initTabs', initTabs);
safe('renderHome', renderHome);
