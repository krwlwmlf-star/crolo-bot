"use strict";

module.exports = {
  config: {
    name:        "kick",
    aliases:     ["remove", "ban"],
    version:     "1.0",
    author:      "Crolo",
    role:        3,
    category:    "group",
    description: "طرد عضو من المجموعة",
    guide:       { en: "{pn} @mention — أو — {pn} [userID]" },
  },

  onStart: async function ({ api, event, args, message, threadID, senderID }) {
    let targetID = null;

    // Get from mention
    if (event.mentions && Object.keys(event.mentions).length > 0) {
      targetID = Object.keys(event.mentions)[0];
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetID = args[0];
    }

    if (!targetID) {
      return message.reply("الاستخدام: /kick @mention\nأو: /kick [userID]");
    }

    // Don't kick the bot or the owner
    const botID   = String(global.CroloBot?.botID || "");
    const ownerID = String(global.CroloBot?.config?.ownerID || "");

    if (targetID === botID) {
      return message.reply("⚠️ لا يمكنني طرد نفسي.");
    }
    if (targetID === ownerID) {
      return message.reply("⚠️ لا يمكن طرد المالك.");
    }
    if (targetID === senderID) {
      return message.reply("⚠️ لا يمكنك طرد نفسك.");
    }

    try {
      await new Promise((res, rej) =>
        api.removeUserFromGroup(targetID, threadID, (err) => err ? rej(err) : res())
      );
      await message.reply(`✅ تم طرد العضو ${targetID} من المجموعة.`);
    } catch (err) {
      await message.reply(`❌ فشل الطرد: ${err.message}\nتأكد أن البوت أدمن في المجموعة.`);
    }
  },
};
