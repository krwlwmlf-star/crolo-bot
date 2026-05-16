/**
 * Crolo Bot — Stealth Mode
 * Simulates bot sleeping during off-hours to appear more human
 */
"use strict";

const moment = require("moment-timezone");

function isSleepTime() {
  const cfg = global.CroloBot?.config?.stealth || {};
  if (!cfg.enable) return false;

  const tz    = global.CroloBot?.config?.timezone || "UTC";
  const hour  = moment().tz(tz).hour();
  const start = cfg.sleepHourStart ?? 2;
  const end   = cfg.sleepHourEnd   ?? 6;

  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

async function applyStealth() {
  if (!isSleepTime()) return;
  const sleepMs = 30000 + Math.floor(Math.random() * 30000); // 30-60s random delay
  global.log?.info?.("STEALTH", `Sleep mode active — delaying ${Math.round(sleepMs / 1000)}s`);
  await new Promise((r) => setTimeout(r, sleepMs));
}

let _active = false;
function start(api) { try { _active = true; } catch (_) {} }
function stop()     { try { _active = false; } catch (_) {} }
function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { isSleepTime, applyStealth, start, stop, wrapSendMessage, wrapWithTyping, isActive: () => _active };
