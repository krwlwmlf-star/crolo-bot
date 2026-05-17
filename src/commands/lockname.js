"use strict";

module.exports = {
  config: {
    name:        "lockname",
    aliases:     ["lname", "lockgroupname"],
    version:     "1.0",
    author:      "Crolo",
    role:        3,
    category:    "group",
    description: "قفل اسم المجموعة — يُعيد البوت الاسم تلقائياً إذا غيّره أحد",
    guide:       { en: "{pn} [اسم] — قفل الاسم | {pn} off — فك القفل" },
  },

  onStart: async function ({ api, event, args, message, threadID }) {
    if (!global.CroloBot.locked) global.CroloBot.locked = {};
    if (!global.CroloBot.locked.names) global.CroloBot.locked.names = new Map();

    const lockedNames = global.CroloBot.locked.names;

    if (!args[0]) {
      const current = lockedNames.get(threadID);
      if (current) {
        return message.reply(`🔒 اسم المجموعة مقفل على:\n"${current}"`);
      }
      return message.reply("🔓 اسم المجموعة غير مقفل حالياً.\n\nالاستخدام:\n/lockname [اسم] — لقفل الاسم\n/lockname off — لفك القفل");
    }

    if (args[0].toLowerCase() === "off") {
      lockedNames.delete(threadID);
      return message.reply("🔓 تم فك قفل اسم المجموعة.");
    }

    const newName = args.join(" ");
    lockedNames.set(threadID, newName);

    try {
      await new Promise((res, rej) =>
        api.setTitle(newName, threadID, (err) => err ? rej(err) : res())
      );
    } catch (_) {}

    return message.reply(`🔒 تم قفل اسم المجموعة على:\n"${newName}"\n\nأي تغيير سيُعاد تلقائياً.`);
  },
};
