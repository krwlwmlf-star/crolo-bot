/**
 * Crolo Bot — Rate Limiter
 */
"use strict";

const _windows = new Map();

function isLimited(senderID) {
  const cfg = global.CroloBot?.config?.rateLimit || {};
  const max  = cfg.maxMessagesPerWindow || 5;
  const win  = cfg.windowMs || 8000;
  const now  = Date.now();
  const key  = String(senderID);

  if (!_windows.has(key)) {
    _windows.set(key, { count: 1, start: now });
    return false;
  }

  const w = _windows.get(key);
  if (now - w.start > win) {
    _windows.set(key, { count: 1, start: now });
    return false;
  }

  w.count++;
  if (w.count > max) return true;
  return false;
}

function reset(senderID) {
  _windows.delete(String(senderID));
}

module.exports = { isLimited, reset };
