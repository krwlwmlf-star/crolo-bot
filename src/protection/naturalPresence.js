/**
 * Crolo Bot — Natural Presence
 * Periodically changes online/offline status to appear human
 */
"use strict";

let _active = false;
let _timer  = null;

function start(api) {
  try {
    _active = true;
    if (!api) return;
    function randomPresence() {
      try {
        if (api && typeof api.setOptions === "function") {
          const online = Math.random() > 0.3;
          api.setOptions({ online });
        }
      } catch (_) {}
      const delay = 5 * 60000 + Math.floor(Math.random() * 10 * 60000);
      _timer = setTimeout(randomPresence, delay);
    }
    randomPresence();
  } catch (_) {}
}

function stop() {
  try { _active = false; if (_timer) { clearTimeout(_timer); _timer = null; } } catch (_) {}
}

function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, wrapSendMessage, wrapWithTyping, isActive: () => _active };
