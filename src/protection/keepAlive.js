/**
 * Crolo Bot — Keep Alive
 * Sends random lightweight requests to keep connection alive
 */
"use strict";

let _timer = null;
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function start() {
  const cfg = global.CroloBot?.config?.keepAlive || {};
  if (cfg.enable === false) return;

  const minMs = (cfg.pingIntervalMinMinutes || 8) * 60000;
  const maxMs = (cfg.pingIntervalMaxMinutes || 15) * 60000;

  function ping() {
    try {
      const api = global.CroloBot?.fcaApi;
      if (api && typeof api.getFriendsList === "function") {
        api.getFriendsList(() => {});
      }
    } catch (_) {}
    global.log?.debug?.("KEEPALIVE", "Ping sent");
  }

  function schedule() {
    const delay = rand(minMs, maxMs);
    _timer = setTimeout(() => {
      ping();
      schedule();
    }, delay);
  }

  schedule();
  global.log?.info?.("KEEPALIVE", "Keep-alive started");
}

function stop() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
}

module.exports = { start, stop };
