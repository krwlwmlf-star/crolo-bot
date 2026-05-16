/**
 * Crolo Bot — Session Refresher
 * Periodically saves and refreshes the session/appState
 */
"use strict";

let _active = false;
let _timer  = null;

function start(api) {
  try {
    _active = true;
    if (!api) return;
    const interval = 30 * 60000; // every 30 minutes
    _timer = setInterval(() => {
      try {
        const appState = api.getAppState();
        if (appState) {
          const { saveCookie } = require("../../database/db");
          saveCookie(JSON.stringify(appState), "auto-refresh");
          global.log?.debug?.("SESSION_REFRESH", "AppState saved");
        }
      } catch (_) {}
    }, interval);
  } catch (_) {}
}

function stop() {
  try { _active = false; if (_timer) { clearInterval(_timer); _timer = null; } } catch (_) {}
}

function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, wrapSendMessage, wrapWithTyping, isActive: () => _active };
