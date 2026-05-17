'use strict';
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const threadSendTimes = new Map();

function getConfig() {
  const cfg = global.config?.stealth?.outgoingThrottle || {};
  return {
    enable:        cfg.enable !== false,
    maxPerThread:  cfg.maxPerThread  || 12,
    threadWindowMs:(cfg.threadWindowMinutes || 5) * 60_000,
    coolingMinMs:  (cfg.coolingMinSeconds || 15) * 1000,
    coolingMaxMs:  (cfg.coolingMaxSeconds || 80) * 1000,
  };
}

function isAdminExempt(threadID) {
  const admins = (global.config?.adminIDs || []).map(String);
  const owner  = String(global.ownerID || '');
  return admins.includes(String(threadID)) || String(threadID) === owner;
}

async function applyThrottle(threadID) {
  const cfg = getConfig();
  if (!cfg.enable || isAdminExempt(threadID)) return;
  const now = Date.now();
  if (!threadSendTimes.has(threadID)) threadSendTimes.set(threadID, []);
  const times = threadSendTimes.get(threadID).filter(t => now - t < cfg.threadWindowMs);
  threadSendTimes.set(threadID, times);
  if (times.length >= cfg.maxPerThread) {
    const delay = randInt(cfg.coolingMinMs, cfg.coolingMaxMs);
    await sleep(delay);
  }
  threadSendTimes.get(threadID).push(Date.now());
}

function wrapSendMessage(api) {
  if (api.__throttleWrapped) return;
  api.__throttleWrapped = true;
  const _orig = api.sendMessage.bind(api);
  api.sendMessage = async function(msg, threadID, callback, messageID) {
    await applyThrottle(threadID);
    return _orig(msg, threadID, callback, messageID);
  };
}

module.exports = { wrapSendMessage, applyThrottle };
