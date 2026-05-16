/**
 * Crolo Bot — Duplicate Guard
 * Prevents processing the same message twice
 */
"use strict";

const _seen   = new Map();
const TTL_MS  = 60000;

function isDuplicate(messageID) {
  const key = String(messageID);
  if (_seen.has(key)) return true;
  _seen.set(key, Date.now());
  // Cleanup old entries
  const now = Date.now();
  for (const [k, ts] of _seen) {
    if (now - ts > TTL_MS) _seen.delete(k);
  }
  return false;
}

let _active = false;
function start(api) { try { _active = true; } catch (_) {} }
function stop()     { try { _active = false; } catch (_) {} }
function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, isDuplicate, wrapSendMessage, wrapWithTyping, isActive: () => _active };
