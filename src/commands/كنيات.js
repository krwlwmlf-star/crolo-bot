"use strict";
const threadsData = require("../utils/threadsData");

if (!global._nickRunning) global._nickRunning = {};
if (!global._nickStop)    global._nickStop    = {};
if (!global._nickVersion) global._nickVersion = {};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sleepInterruptible(ms, tid, version) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve("done"), ms);
    const c = setInterval(() => {
      if (global._nickStop[tid]) { clearInterval(c); clearTimeout(t); resolve("stop"); }
      else if ((global._nickVersion[tid] || 0) !== version) { clearInterval(c); clearTimeout(t); resolve("version"); }
    }, 200);
  });
}

async function loadLock(tid) { return threadsData.get(tid, "data.nickLock"); }
async function saveLock(tid, lock) { return threadsData.set(tid, lock, "data.nickLock"); }

async function runCycle(api, tid) {
  if (global._nickRunning[tid]) return;
  global._nickRunning[tid] = true;
  delete global._nickStop[tid];
  const botID = String(api.getCurrentUserID());

  try {
    while (true) {
      if (global._nickStop[tid]) break;
      const lock = await loadLock(tid);
      if (!lock || !lock.enabled || !lock.name) break;

      const version = global._nickVersion[tid] || 0;
      let members = [];
      try {
        const info = await api.getThreadInfo(tid);
        members = (info.participantIDs || []).filter(id => String(id) !== botID);
      } catch {
        if ((await sleepInterruptible(15000, tid, version)) === "stop") break;
        continue;
      }

      if (!members.length) { if ((await sleepInterruptible(10000, tid, version)) === "stop") break; continue; }
      members.sort(() => Math.random() - 0.5);

      for (const uid of members) {
        if (global._nickStop[tid]) break;
        if ((global._nickVersion[tid] || 0) !== version) break;
        if (lock.pinned?.[String(uid)]) continue;
        try { await api.changeNickname(lock.name, tid, uid); } catch {}
        const r = await sleepInterruptible(4500, tid, version);
        if (r === "stop" || r === "version") break;
      }
      if (global._nickStop[tid]) break;
      if ((await sleepInterruptible(2500, tid, global._nickVersion[tid] || 0)) === "stop") break;
    }
  } finally {
    delete global._nickRunning[tid];
    delete global._nickStop[tid];
    setTimeout(async () => {
      try {
        const lock = await loadLock(tid);
        if (lock?.enabled && lock?.name) runCycle(api, tid).catch(() => {});
      } catch {}
    }, 5000);
  }
}

module.exports = {
  config: {
    name: "كنيات",
    aliases: ["nick", "nicknames"],
    description: "قفل كنيات جميع الأعضاء لاسم واحد باستمرار",
    usage: "كنيات [الاسم] | كنيات off | كنيات حدف | كنيات status",
    role: 2,
  },
  async run({ api, event, args, message }) {
    const { threadID } = event;
    const sub  = (args[0] || "").toLowerCase().trim();
    const name = args.join(" ").trim();

    if (sub === "off" || sub === "ايقاف") {
      const lock = await loadLock(threadID);
      if (lock) { lock.enabled = false; await saveLock(threadID, lock); }
      global._nickStop[threadID] = true;
      delete global._nickRunning[threadID];
      return message.reply("🛑 تم إيقاف أمر الكنيات.");
    }

    if (sub === "status") {
      const lock    = await loadLock(threadID);
      const running = !!global._nickRunning[threadID];
      const pins    = Object.keys(lock?.pinned || {}).length;
      return message.reply(
        "📊 حالة أمر الكنيات\n━━━━━━━━━━━━━━\n" +
        `▶️ الحالة  : ${running ? "🟢 يعمل" : "🔴 متوقف"}\n` +
        `📛 الاسم   : ${lock?.name || "—"}\n` +
        `📌 مثبتون : ${pins} شخص`
      );
    }

    if (sub === "حدف" || sub === "reset" || sub === "حذف") {
      message.reply("⏳ جاري حذف جميع الكنيات…");
      let info;
      try { info = await api.getThreadInfo(threadID); }
      catch { return message.reply("❌ فشل جلب معلومات الغروب."); }
      const botID   = String(api.getCurrentUserID());
      const members = (info.participantIDs || []).filter(id => String(id) !== botID);
      let done = 0, failed = 0;
      for (const uid of members) {
        try { await api.changeNickname("", threadID, uid); done++; } catch { failed++; }
        await sleep(2000);
      }
      return message.reply(`✅ تم حذف كنيات ${done} عضو${failed ? ` (فشل ${failed})` : ""}.`);
    }

    if (sub === "unpin") {
      const mentionIDs = Object.keys(event.mentions || {});
      const targetID   = String(mentionIDs[0] || args[1] || "");
      if (!targetID) return message.reply("❌ حدد الشخص: /كنيات unpin [ID]");
      const lock = await loadLock(threadID);
      if (!lock?.pinned?.[targetID]) return message.reply("⚠️ هذا الشخص ليس لديه كنية مثبتة.");
      delete lock.pinned[targetID];
      await saveLock(threadID, lock);
      return message.reply("✅ فُك تثبيت كنية هذا الشخص.");
    }

    if (!name) {
      return message.reply(
        "📋 أمر الكنيات\n━━━━━━━━━━━━━━\n" +
        "• /كنيات [اسم]       — شغّل وغيّر كنيات الكل\n" +
        "• /كنيات off          — أوقف الأمر\n" +
        "• /كنيات حدف          — احذف كل الكنيات الآن\n" +
        "• /كنيات status       — الحالة الحالية\n" +
        "• /كنيات unpin [ID]   — فك تثبيت شخص"
      );
    }

    const existing = await loadLock(threadID);
    const lock     = (existing && typeof existing === "object") ? existing : {};
    lock.name    = name;
    lock.enabled = true;
    if (!lock.pinned) lock.pinned = {};
    await saveLock(threadID, lock);
    global._nickVersion[threadID] = ((global._nickVersion[threadID] || 0) + 1);

    if (global._nickRunning[threadID]) {
      return message.reply(`✅ تم تحديث الاسم إلى: "${name}"\n⚡ سيُطبَّق فوراً.`);
    }

    delete global._nickStop[threadID];
    message.reply(
      `🔄 تشغيل أمر الكنيات!\n━━━━━━━━━━━━━━\n` +
      `📛 الاسم: ${name}\n⏱ ~4.5ث بين كل عضو\n━━━━━━━━━━━━━━\n` +
      `اكتب /كنيات off للإيقاف\nاكتب /كنيات حدف لحذف الكنيات`
    );
    runCycle(api, threadID).catch(() => {});
  },

  async onEvent({ api, event }) {
    if (event.logMessageType !== "log:user-nickname") return;
    const { threadID, author, logMessageData } = event;
    const botID   = String(api.getCurrentUserID());
    const changer = String(author || "");
    const target  = String(logMessageData?.participant_id || "");
    const newNick = logMessageData?.nickname || "";
    if (!changer || !target || changer === botID) return;
    const _isAdmin = global.isAdmin ? global.isAdmin(changer) : false;
    if (_isAdmin && target !== botID) {
      const lock = await loadLock(threadID);
      if (!lock) return;
      if (!lock.pinned) lock.pinned = {};
      if (newNick) { lock.pinned[target] = newNick; } else { delete lock.pinned[target]; }
      await saveLock(threadID, lock);
    } else if (!_isAdmin && target !== botID) {
      if (!global._nickRunning[threadID]) return;
      const lock = await loadLock(threadID);
      if (!lock?.enabled || !lock?.name || lock.pinned?.[target]) return;
      setTimeout(async () => {
        try { await api.changeNickname(lock.name, threadID, target); } catch {}
      }, 4000);
    }
  },
};
