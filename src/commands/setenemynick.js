"use strict";

// threadID → Map<userID, { nick, timer }>
const enemyLocks = new Map();

const INTERVAL_MS = 5000;

function getThreadLocks(threadID) {
  if (!enemyLocks.has(threadID)) enemyLocks.set(threadID, new Map());
  return enemyLocks.get(threadID);
}

function startLock(api, threadID, userID, nick) {
  const locks = getThreadLocks(threadID);

  // Stop existing lock for this user first
  const existing = locks.get(userID);
  if (existing) clearInterval(existing.timer);

  const timer = setInterval(async () => {
    try {
      await api.changeNickname(nick, threadID, userID);
    } catch (_) {}
  }, INTERVAL_MS);

  locks.set(userID, { nick, timer });

  // Set it immediately too
  try { api.changeNickname(nick, threadID, userID); } catch (_) {}
}

function stopLock(threadID, userID) {
  const locks = getThreadLocks(threadID);
  if (!userID) {
    // Stop all locks in thread
    for (const [, entry] of locks) clearInterval(entry.timer);
    locks.clear();
    return true;
  }
  const entry = locks.get(userID);
  if (!entry) return false;
  clearInterval(entry.timer);
  locks.delete(userID);
  return true;
}

const HELP =
  `🎯 أمر setenemynick\n` +
  `━━━━━━━━━━━━━━━━━━\n` +
  `• /setenemynick [ID] [كنية] — قفل كنية شخص\n` +
  `• /setenemynick off         — إيقاف الكل\n` +
  `• /setenemynick off [ID]    — إيقاف شخص محدد\n` +
  `• /setenemynick list        — عرض القائمة\n\n` +
  `مثال:\n/setenemynick 100012345678 كلب`;

module.exports = {
  config: {
    name:        "setenemynick",
    aliases:     ["enemynick", "lockenemy", "nickenemy"],
    version:     "1.0",
    author:      "Crolo",
    role:        2,
    category:    "group",
    description: "قفل كنية شخص محدد باستمرار حتى الإيقاف",
    guide:       { en: HELP },
  },

  run: async function ({ api, event, args, message, threadID }) {
    const sub = (args[0] || "").toLowerCase().trim();

    // ── بدون args ─────────────────────────────────────────────────────────────
    if (!sub) {
      return message.reply(HELP);
    }

    // ── LIST ──────────────────────────────────────────────────────────────────
    if (sub === "list" || sub === "قائمة") {
      const locks = getThreadLocks(threadID);
      if (!locks.size) return message.reply("📋 لا توجد كنيات مقفلة حالياً.");

      let text = `📋 الكنيات المقفلة (${locks.size}):\n━━━━━━━━━━━━━━\n`;
      for (const [uid, entry] of locks) {
        text += `• ID: ${uid}\n  كنية: "${entry.nick}"\n`;
      }
      return message.reply(text);
    }

    // ── OFF ───────────────────────────────────────────────────────────────────
    if (sub === "off" || sub === "ايقاف" || sub === "وقف") {
      // /setenemynick off [ID] — stop specific user
      if (args[1]) {
        const targetID = String(args[1]).replace(/\D/g, "");
        if (!targetID) return message.reply("❌ ID غير صحيح.");
        const stopped = stopLock(threadID, targetID);
        if (stopped) {
          // Reset nickname to empty
          try { await api.changeNickname("", threadID, targetID); } catch (_) {}
          return message.reply(`✅ تم إيقاف قفل كنية ${targetID} وإعادتها للطبيعي.`);
        }
        return message.reply(`⚠️ لا يوجد قفل لهذا المستخدم.`);
      }

      // /setenemynick off — stop all
      const locks = getThreadLocks(threadID);
      if (!locks.size) return message.reply("⚠️ لا توجد كنيات مقفلة حالياً.");

      const uids = [...locks.keys()];
      stopLock(threadID);

      // Reset all nicknames
      for (const uid of uids) {
        try { await api.changeNickname("", threadID, uid); } catch (_) {}
      }

      return message.reply(`✅ تم إيقاف قفل كنية ${uids.length} مستخدم وإعادتهم للطبيعي.`);
    }

    // ── SET [ID] [nick] ───────────────────────────────────────────────────────
    // Resolve target ID — from mention or raw number
    let targetID = null;

    const mentions = Object.keys(event.mentions || {});
    if (mentions.length > 0) {
      targetID = String(mentions[0]);
    } else {
      // First arg should be ID
      const raw = String(args[0]).replace(/\D/g, "");
      if (raw.length >= 6) targetID = raw;
    }

    if (!targetID) {
      return message.reply(
        "❌ لم أجد ID المستخدم.\n\n" +
        "اكتب: /setenemynick [ID] [كنية]\n" +
        "أو: /setenemynick @mention [كنية]"
      );
    }

    // Nick is everything after the first arg (ID or mention)
    const nick = args.slice(1).join(" ").trim();
    if (!nick) {
      return message.reply(
        "❌ لم تحدد الكنية.\n\n" +
        `مثال: /setenemynick ${targetID} كلب`
      );
    }

    // Verify user is in the thread
    try {
      const info = await new Promise((res, rej) =>
        api.getThreadInfo(threadID, (err, d) => (err ? rej(err) : res(d)))
      );
      const members = (info.participantIDs || []).map(String);
      if (!members.includes(targetID)) {
        return message.reply(`❌ المستخدم ${targetID} ليس في هذه المجموعة.`);
      }
    } catch (_) {}

    startLock(api, threadID, targetID, nick);

    return message.reply(
      `🎯 تم قفل كنية المستخدم!\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `ID: ${targetID}\n` +
      `الكنية: "${nick}"\n` +
      `⏱ يُحدَّث كل ${INTERVAL_MS / 1000} ثواني\n\n` +
      `لإيقافه: /setenemynick off ${targetID}`
    );
  },

  // Restore locks after nickname change by the target user
  onEvent: async function ({ api, event, threadID }) {
    if (event.logMessageType !== "log:user-nickname") return;

    const { logMessageData, author } = event;
    const changedUID = String(logMessageData?.participant_id || "");
    const changerUID = String(author || "");
    const botID      = String(api.getCurrentUserID());

    // Ignore changes made by the bot itself
    if (changerUID === botID) return;

    const locks = getThreadLocks(threadID);
    const entry = locks.get(changedUID);
    if (!entry) return;

    // Someone changed the locked user's nickname — revert
    setTimeout(async () => {
      try {
        await api.changeNickname(entry.nick, threadID, changedUID);
      } catch (_) {}
    }, 2000);
  },
};
