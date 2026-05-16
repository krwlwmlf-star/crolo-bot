/**
 * Crolo Bot — Outgoing Throttle
 * Limits outgoing message rate to avoid spam detection
 */
"use strict";

let _active   = false;
let _lastSend = 0;
const MIN_GAP = 500;

async function throttle() {
  const now  = Date.now();
  const diff = now - _lastSend;
  if (diff < MIN_GAP) {
    await new Promise((r) => setTimeout(r, MIN_GAP - diff));
  }
  _lastSend = Date.now();
}

function start(api) { try { _active = true; } catch (_) {} }
function stop()     { try { _active = false; } catch (_) {} }
function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, throttle, wrapSendMessage, wrapWithTyping, isActive: () => _active };
