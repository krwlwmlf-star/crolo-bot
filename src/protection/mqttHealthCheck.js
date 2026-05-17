let healthTimer  = null;
let restartCount = 0;
let backoffMs    = 0;

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function getConfig() {
  const cfg = global.config?.mqttHealthCheck || {};
  return {
    enable:             cfg.enable !== false,
    silentTimeoutMs:    (cfg.silentTimeoutMinutes    || 10) * 60_000,
    checkIntervalMinMs: (cfg.checkIntervalMinMinutes || 2)  * 60_000,
    checkIntervalMaxMs: (cfg.checkIntervalMaxMinutes || 5)  * 60_000,
    maxRestarts:        cfg.maxRestarts     || 5,
    backoffMultiplier:  cfg.backoffMultiplier || 1.5,
    maxBackoffMs:       (cfg.maxBackoffMinutes || 15) * 60_000,
  };
}

function onMqttActivity() {
  global._lastMqttActivity = Date.now();
}

function notifyOwner(msg) {
  try {
    const api   = global.api;
    const owner = String(global.ownerID || global.config?.ownerID || "");
    if (!api || !owner) return;
    api.sendMessage(msg, owner, () => {});
  } catch (_) {}
}

async function doHealthCheck() {
  const cfg = getConfig();
  if (!cfg.enable) return scheduleNext();
  const api = global.api;
  if (!api) return scheduleNext();

  const lastActivity = global._lastMqttActivity || Date.now();
  const silentFor    = Date.now() - lastActivity;

  if (silentFor < cfg.silentTimeoutMs) {
    if (restartCount > 0) { restartCount = 0; backoffMs = 0; }
    return scheduleNext();
  }

  if (restartCount >= cfg.maxRestarts) {
    console.log(`[MQTT_HEALTH] Max restarts (${cfg.maxRestarts}) reached`);
    stopHealthCheck();
    return;
  }

  if (backoffMs === 0) backoffMs = randInt(15000, 45000);
  await new Promise(r => setTimeout(r, backoffMs));

  restartCount++;
  const silentMin = Math.round(silentFor / 60000);
  console.log(`[MQTT_HEALTH] No activity for ${silentMin} min — restart ${restartCount}/${cfg.maxRestarts}`);
  notifyOwner(`⚠️ لا نشاط منذ ${silentMin} دقيقة — إعادة الاتصال (${restartCount}/${cfg.maxRestarts})`);

  try {
    const reLogin = global._reLoginBot || global.reLoginBot;
    if (typeof reLogin === "function") {
      global._lastMqttActivity = Date.now();
      reLogin();
    }
  } catch (e) {
    console.log(`[MQTT_HEALTH] Restart error: ${e?.message || e}`);
  }

  backoffMs = Math.min(backoffMs * cfg.backoffMultiplier, cfg.maxBackoffMs);
  scheduleNext();
}

function scheduleNext() {
  if (healthTimer) clearTimeout(healthTimer);
  const cfg = getConfig();
  if (!cfg.enable) return;
  const wait = randInt(cfg.checkIntervalMinMs, cfg.checkIntervalMaxMs);
  healthTimer = setTimeout(doHealthCheck, wait);
}

function startHealthCheck() {
  restartCount = 0; backoffMs = 0;
  global._lastMqttActivity = Date.now();
  console.log("[MQTT_HEALTH] Started");
  scheduleNext();
}

function stopHealthCheck() {
  if (healthTimer) { clearTimeout(healthTimer); healthTimer = null; }
}

module.exports = { startHealthCheck, stopHealthCheck, onMqttActivity };
