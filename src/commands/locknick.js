"use strict";

module.exports = {
  config: {
    name:        "locknick",
    aliases:     ["locknicktname", "setnick", "nicknameall"],
    version:     "1.0",
    author:      "Crolo",
    role:        3,
    category:    "group",
    description: "قفل/تغيير كنيات جميع أعضاء المجموعة",
    guide:       { en: "{pn} [كنية] — تغيير كل الكنيات | {pn} off — فك القفل" },
  },

  onStart: async function ({ api, event, args, message, threadID }) {
    if (!global.CroloBot.locked) global.CroloBot.locked = {};
    if (!global.CroloBot.locked.nicknames) global.CroloBot.locked.nicknames = new Map();

    const lockedNicks = global.CroloBot.locked.nicknames;

    if (!args[0]) {
      const current = lockedNicks.get(threadID);
      if (current) {
        return message.reply(`🔒 الكنيات مقفلة على: "${current.nick}"`);
      }
      return message.reply("الاستخدام:\n/locknick [كنية] — تغيير كنيات الجميع\n/locknick off — فك قفل الكنيات");
    }

    if (args[0].toLowerCase() === "off") {
      lockedNicks.delete(threadID);
      return message.reply("🔓 تم فك قفل الكنيات.");
    }

    const nick = args.join(" ");

    // Get thread members
    let members = [];
    try {
      const info = await new Promise((res, rej) =>
        api.getThreadInfo(threadID, (err, data) => err ? rej(err) : res(data))
      );
      members = info.participantIDs || [];
    } catch (err) {
      return message.reply("❌ تعذّر جلب أعضاء المجموعة.");
    }

    lockedNicks.set(threadID, { nick, members });
    await message.reply(`🔒 جارٍ تغيير كنيات ${members.length} عضو إلى "${nick}"...`);

    let done = 0;
    for (const uid of members) {
      try {
        await new Promise((res, rej) =>
          api.changeNickname(nick, threadID, uid, (err) => err ? rej(err) : res())
        );
        done++;
      } catch (_) {}
      if (members.indexOf(uid) < members.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    await message.reply(`✅ تم تغيير ${done}/${members.length} كنية إلى "${nick}".`);
  },
};
