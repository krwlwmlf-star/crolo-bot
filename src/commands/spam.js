"use strict";

// Map: threadID -> { timer, count }
const activeSpam = new Map();

module.exports = {
  config: {
    name:        "spam",
    aliases:     ["spammsg"],
    version:     "1.0",
    author:      "Crolo",
    role:        3,
    category:    "tools",
    description: "إرسال رسالة بشكل متكرر كل 6 ثواني",
    guide:       { en: "{pn} [عدد] [رسالة] | {pn} stop" },
  },

  onStart: async function ({ api, event, args, message, threadID }) {
    if (!args[0]) {
      return message.reply(
        "الاستخدام:\n/spam [عدد] [رسالة] — مثال: /spam 5 مرحبا\n/spam stop — إيقاف"
      );
    }

    if (args[0].toLowerCase() === "stop") {
      const existing = activeSpam.get(threadID);
      if (existing) {
        clearInterval(existing.timer);
        activeSpam.delete(threadID);
        return message.reply("⛔ تم إيقاف السبام.");
      }
      return message.reply("لا يوجد سبام نشط في هذه المجموعة.");
    }

    const count = parseInt(args[0]);
    if (isNaN(count) || count < 1 || count > 100) {
      return message.reply("⚠️ العدد يجب أن يكون بين 1 و 100.");
    }

    const msgText = args.slice(1).join(" ");
    if (!msgText) {
      return message.reply("⚠️ أدخل الرسالة بعد العدد.\nمثال: /spam 5 مرحبا");
    }

    // Stop existing spam first
    const existing = activeSpam.get(threadID);
    if (existing) {
      clearInterval(existing.timer);
    }

    await message.reply(`📨 جارٍ إرسال "${msgText}" — ${count} مرة كل 6 ثواني...`);

    let sent = 0;
    const timer = setInterval(async () => {
      if (sent >= count) {
        clearInterval(timer);
        activeSpam.delete(threadID);
        api.sendMessage(`✅ انتهى السبام — تم الإرسال ${sent} مرة.`, threadID);
        return;
      }
      try {
        await new Promise((res, rej) =>
          api.sendMessage(msgText, threadID, (err) => err ? rej(err) : res())
        );
        sent++;
      } catch (_) {}
    }, 6000);

    activeSpam.set(threadID, { timer, count });
  },
};
