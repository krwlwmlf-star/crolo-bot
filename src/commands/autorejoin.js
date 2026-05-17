"use strict";

module.exports = {
  config: {
    name:        "autorejoin",
    aliases:     ["autoadd", "rejoin"],
    version:     "1.0",
    author:      "Crolo",
    role:        3,
    category:    "group",
    description: "إعادة إضافة العضو تلقائياً عند مغادرة المجموعة",
    guide:       { en: "{pn} on — تفعيل | {pn} off — إيقاف" },
  },

  onStart: async function ({ args, message, threadID }) {
    if (!global.CroloBot.locked) global.CroloBot.locked = {};
    if (!global.CroloBot.locked.autoRejoin) global.CroloBot.locked.autoRejoin = new Set();

    const ar = global.CroloBot.locked.autoRejoin;
    const arg = (args[0] || "").toLowerCase();

    if (arg === "on") {
      ar.add(threadID);
      return message.reply("✅ تم تفعيل الإضافة التلقائية.\nأي عضو يغادر سيُضاف مجدداً تلقائياً.");
    }

    if (arg === "off") {
      ar.delete(threadID);
      return message.reply("🔓 تم إيقاف الإضافة التلقائية.");
    }

    const status = ar.has(threadID) ? "✅ مفعّل" : "❌ موقف";
    return message.reply(`حالة الإضافة التلقائية: ${status}\n\n/autorejoin on — تفعيل\n/autorejoin off — إيقاف`);
  },
};
