"use strict";

module.exports = {
  config: {
    name:        "احذف",
    aliases:     ["del", "delete", "unsend", "حذف"],
    version:     "1.0",
    author:      "Crolo",
    role:        2,
    category:    "tools",
    description: "احذف رسالة البوت — ردّ على الرسالة واكتب /احذف",
    guide:       { en: "ردّ على رسالة البوت بـ {pn} لحذفها" },
  },

  run: async function ({ api, event, message, threadID }) {
    const botID = String(api.getCurrentUserID());

    // Must be a reply
    if (!event.messageReply) {
      return message.reply(
        "↩️ ردّ على رسالة البوت التي تريد حذفها ثم اكتب /احذف"
      );
    }

    const targetMID    = event.messageReply.messageID;
    const targetSender = String(event.messageReply.senderID || "");

    // Only delete bot's own messages
    if (targetSender !== botID) {
      return message.reply("❌ لا يمكنني حذف إلا رسائلي أنا فقط.");
    }

    try {
      await new Promise((res, rej) =>
        api.unsendMessage(targetMID, (err) => (err ? rej(err) : res()))
      );
      // Also delete the /احذف command message itself
      try {
        await new Promise((res) =>
          api.unsendMessage(event.messageID, () => res())
        );
      } catch (_) {}
    } catch (err) {
      return message.reply("❌ فشل الحذف: " + err.message);
    }
  },
};
