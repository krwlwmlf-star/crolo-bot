/**
 * Crolo Bot — MQTT Health Check
 * Detects silent MQTT connections and notifies admins
 */
"use strict";

let _timer  = null;
let _count  = 0;
const rand  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function getCfg() {
  const c = global.CroloBot?.config?.mqttHealthCheck || {};
  return {
    enable:   c.enable !== false,
    silentMs: (c.silentTimeoutMinutes || 10) * 60000,
    minMs:    (c.checkIntervalMinMinutes || 2) * 60000,
    maxMs:    (c.checkIntervalMaxMinutes || 5) * 60000,
    maxR:     c.maxRestarts || 5,
    notify:   c.notifyAdmins !== false,
  };
}

function markActivity() {
  global.lastMqttActivity = Date.now();
}

async function doCheck() {
  const cfg = getCfg();
  if (!cfg.enable || !global.CroloBot?.fcaApi) return;

  const last   = global.lastMqttActivity || global.CroloBot?.startTime || Date.now();
  const silent = Date.now() - last;
  if (silent < cfg.silentMs) { _count = 0; return; }
  if (_count >= cfg.maxR)   return;

  _count++;
  global.log?.warn?.("MQTT_HEALTH", `Silent for ${Math.round(silent / 60000)}min — restart attempt #${_count}`);

  if (cfg.notify) {
    try {
      const api    = global.CroloBot?.fcaApi;
      const config = global.CroloBot?.config || {};
      const { getAdminIDs } = require("../../database/db");
      const dbAdmins = getAdminIDs();
      const cfgAdmins = [
        ...(config.adminBot || []),
        ...(config.superAdminBot || []),
      ].map(String);
      const allAdmins = [...new Set([...cfgAdmins, ...dbAdmins])];

      const msg = `⚠️ [Crolo Bot] MQTT silent for ${Math.round(silent / 60000)}min. Attempting reconnect...`;
      for (const id of allAdmins) {
        try { api.sendMessage(msg, id); } catch (_) {}
      }
    } catch (_) {}
  }

  // Trigger re-login
  try {
    global.CroloBot?.reLoginBot?.();
  } catch (_) {}
}

function start() {
  const cfg = getCfg();
  if (!cfg.enable) return;

  function schedule() {
    const delay = rand(cfg.minMs, cfg.maxMs);
    _timer = setTimeout(async () => {
      await doCheck();
      schedule();
    }, delay);
  }

  schedule();
  global.log?.info?.("MQTT_HEALTH", "MQTT health check started");
}

function stop() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
}

module.exports = { start, stop, markActivity };
