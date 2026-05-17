"use strict";
module.exports = {
  config: {
    name: "setbotnick",
    aliases: ["botnick", "mynick"],
    description: "تغيير كنية البوت في المجموعة",
    usage: "setbotnick [الكنية] | setbotnick حدف",
    role: 2,
  },
  async run({ api, args, threadID }) {
    const botID = api.getCurrentUserID();
    const sub   = (args[0] || "").trim();

    if (!sub) {
      return api.sendMessage(
        "📛 استخدام الأمر:\n" +
        "• /setbotnick [الكنية]  — تعيين كنية جديدة\n" +
        "• /setbotnick حدف        — حذف الكنية",
        threadID
      );
    }

    if (sub === "حدف" || sub === "delete") {
      try {
        await new Promise((resolve, reject) =>
          api.changeNickname("", threadID, botID, e => e ? reject(e) : resolve())
        );
        return api.sendMessage("✅ تم حذف كنية البوت.", threadID);
      } catch (e) {
        return api.sendMessage("❌ فشل حذف الكنية: " + e.message, threadID);
      }
    }

    const nickname = args.join(" ").trim();
    if (!nickname) return api.sendMessage("❌ الرجاء إدخال كنية.", threadID);

    try {
      await new Promise((resolve, reject) =>
        api.changeNickname(nickname, threadID, botID, e => e ? reject(e) : resolve())
      );
      return api.sendMessage("✅ تم تعيين الكنية: " + nickname, threadID);
    } catch (e) {
      return api.sendMessage("❌ فشل تغيير الكنية: " + e.message, threadID);
    }
  },
};
