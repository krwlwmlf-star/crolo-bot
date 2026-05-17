"use strict";
const threadsData = require("../utils/threadsData");

module.exports = {
  config: {
    name: "توقيف-اسم",
    aliases: ["unm", "unlock-name"],
    description: "إلغاء قفل اسم الغروب",
    usage: "توقيف-اسم",
    role: 2,
  },
  async run({ event, message }) {
    const { threadID } = event;
    const lock = await threadsData.get(threadID, "data.nmLock");

    if (!lock?.enabled) return message.reply("ℹ️ لا يوجد قفل اسم نشط في هذا الغروب.");

    await threadsData.set(threadID, { ...lock, enabled: false }, "data.nmLock");

    if (global._nmIntervals?.has(threadID)) {
      clearTimeout(global._nmIntervals.get(threadID));
      global._nmIntervals.delete(threadID);
    }
    global._nmLocks?.delete(threadID);

    return message.reply(`🔓 تم إلغاء قفل الاسم!\n📛 كان مقفلاً على: ${lock.name}`);
  },
};
