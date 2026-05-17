"use strict";
const threadsData = require("../utils/threadsData");

if (!global._nmIntervals) global._nmIntervals = new Map();
if (!global._nmLocks)     global._nmLocks     = new Map();

function randBetween(min, max) {
  if (min >= max) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getIntervalMs(lock) {
  const min = lock.minDelay ?? lock.delay ?? 30;
  const max = lock.maxDelay ?? min;
  return randBetween(min, max) * 1000;
}

function stopInterval(threadID) {
  if (global._nmIntervals.has(threadID)) {
    clearTimeout(global._nmIntervals.get(threadID));
    global._nmIntervals.delete(threadID);
  }
  global._nmLocks.delete(threadID);
}

function startInterval(threadID, lock) {
  stopInterval(threadID);
  if (!lock?.enabled || !lock?.name) return;
  global._nmLocks.set(threadID, lock);
  function schedule() {
    const t = setTimeout(async () => {
      global._nmIntervals.delete(threadID);
      const cur = global._nmLocks.get(threadID);
      if (!cur?.enabled || !cur?.name) return;
      const api = global.CroloBot?.fcaApi || global.api;
      if (!api) { schedule(); return; }
      try { await api.setTitle(cur.name, threadID); } catch {}
      schedule();
    }, getIntervalMs(lock));
    global._nmIntervals.set(threadID, t);
  }
  schedule();
}

module.exports = {
  config: {
    name: "اسم",
    aliases: ["nm", "lockname2"],
    description: "قفل اسم الغروب مع تطبيق دوري",
    usage: "اسم [الاسم] | اسم time [ث] | اسم status",
    role: 2,
  },
  async run({ api, args, event, message }) {
    const { threadID } = event;
    const sub = (args[0] || "").toLowerCase();

    if (sub === "status") {
      const lock = await threadsData.get(threadID, "data.nmLock");
      if (!lock?.name) return message.reply("📋 قفل الاسم مُعطَّل.");
      const min = lock.minDelay ?? 30, max = lock.maxDelay ?? min;
      return message.reply(`📋 الحالة\n🔒 ${lock.enabled ? "مفعل" : "معطل"}\n📛 ${lock.name}\n⏱ ${min === max ? min + "ث" : min + "–" + max + "ث"}`);
    }

    if (sub === "time") {
      const v1 = parseInt(args[1]), v2 = parseInt(args[2]);
      if (isNaN(v1) || v1 < 1) return message.reply("❌ مثال: /اسم time 30 أو /اسم time 20 40");
      const cur = await threadsData.get(threadID, "data.nmLock") || {};
      if (!cur.name) return message.reply("❌ قفّل اسماً أولاً.");
      cur.minDelay = v1;
      cur.maxDelay = (!isNaN(v2) && v2 >= v1) ? v2 : v1;
      await threadsData.set(threadID, cur, "data.nmLock");
      startInterval(threadID, cur);
      return message.reply("✅ تم تحديث الوقت.");
    }

    if (sub === "off" || sub === "ايقاف") {
      const lock = await threadsData.get(threadID, "data.nmLock");
      if (lock) { lock.enabled = false; await threadsData.set(threadID, lock, "data.nmLock"); }
      stopInterval(threadID);
      return message.reply("🔓 تم إيقاف قفل الاسم.");
    }

    const name = args.join(" ").trim();
    if (!name) return message.reply("❌ اكتب اسماً بعد /اسم");

    const existing = await threadsData.get(threadID, "data.nmLock") || {};
    const newLock  = { name, delay: existing.minDelay ?? 30, minDelay: existing.minDelay ?? 30, maxDelay: existing.maxDelay ?? 30, enabled: true };
    await threadsData.set(threadID, newLock, "data.nmLock");
    startInterval(threadID, newLock);
    return message.reply(`🔒 تم قفل الاسم على: ${name}`);
  },

  async onEvent({ event, threadsData: td }) {
    if (event.logMessageType !== "log:thread-name") return;
    const { threadID } = event;
    const lock = await (td || threadsData).get(threadID, "data.nmLock");
    if (!lock?.enabled || !lock?.name) return;
    if (!global._nmLocks.has(threadID)) {
      global._nmLocks.set(threadID, lock);
      startInterval(threadID, lock);
    }
  },
};
