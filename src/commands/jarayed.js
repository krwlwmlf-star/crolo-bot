"use strict";

// Active spam loops: threadID -> timer
const activeJarayed = new Map();

const MESSAGES = [
  `يَرآنْيَ ۆأنْيَ آڪلُ صٍࢪم يُـ' ـُمُـ' ـُٱڪ يآ`,
  `شۣۗـۙرفۣۗـۙ يۣۗہمۣۗـۙآكۣۗـۙ مۣۗـۙقۣۗـۙآبۣۗـۙلَ رحۣۗـۙمۣۗـۙةّ يۣۗہآ`,
  `يُـ'ـُٱ نُـ'ـُٱسُ تُـ'ـُتُـ'ـُسُـ'ـُٱبُـ'ـُقُ ٱلُـ'ـُخُـ'ـُيُـ'ـُر وٌأمُـ'ـُكُـ'ـُ تُـ'ـُسُـ'ـُبُـ'ـُقُ بُـ'ـُيُ تۣۗہُـ' ـُرمۣۗہُـ 'ـُتۣۗہُـ' ـُهۣۗہـُ' ـُٱ`,
  `كَمِـكَ يآ كۣۗہࢪكَ لن يهࢪب أبدا كَـ𝛅ـمِـكَ في حصآࢪ سيآسي أقتصآدي من زٍℬـ`,
  `يۣۗہآ 😂 آجۣۗـۙريۣۗہـﮯ ربۣۗـۙگ آجۣۗـۙريۣۗہـﮯ آمۣۗـۙـگ 💔 تۣۗـۙﮧﮧنۣۗـۙآگتۣۗـۙ ديۣۗہـﮯربۣۗـۙهۣۗہہ‏‏آ يآ`,
  `يآ سأحآصࢪڪ حتى تقول للجميع شـًٌٍّ̨̥̬̩ـتــًٌٍّ̨̥̬̩ـمـًٌٍّ̨̥̬̩ـت ࢪپ أمـًٌٍّ̨̥̬̩ـي وأنا بي وࢪطـًٌٍّ̨̥̬̩ـة 😴 يآ`,
  `لآ تہہنہہتہہظہہر هہہـ𓂺ـرؤ‌ـيہ يہہآ 🖕 فآنآ لسہت سﮧۣۗہہرؤآلﮧَ آِخﮧۣۗہہتﮧۣۗہہڪ يۣۗہـﮯآ آبۣۗـۙنۣۗـۙة آلَگلَبۣۗـۙ‏‏هۣۗہہ🐶 يآ`,
  `لآ تہہنہہتہہظہہر هہہـ𓂺ـرؤ‌ـيہ يہہآ 🖕 فآنآ لسہت سﮧۣۗہہرؤآلﮧَ آِخﮧۣۗہہتﮧۣۗہہڪ يۣۗہـﮯآ آبۣۗـۙنۣۗـۙة آلَگلَبۣۗـۙ‏‏هۣۗہہ🐶 يآ`,
];

module.exports = {
  config: {
    name:        "جرائد",
    aliases:     ["jarayed", "j"],
    version:     "1.0",
    author:      "Crolo",
    role:        3,
    category:    "tools",
    description: "سبام متغير — يرسل الجرائد الـ8 بالترتيب كل 5 ثواني",
    guide:       { en: "{pn} — سبام متغير | {pn} stop — إيقاف" },
  },

  onStart: async function ({ api, event, args, message, threadID, senderID }) {
    // Stop command
    if ((args[0] || "").toLowerCase() === "stop") {
      const existing = activeJarayed.get(threadID);
      if (existing) {
        clearTimeout(existing.timer);
        activeJarayed.delete(threadID);
        return message.reply("⛔ تم إيقاف الجرائد.");
      }
      return message.reply("لا يوجد جرائد نشط حالياً.");
    }

    // If already running
    if (activeJarayed.has(threadID)) {
      return message.reply("⚠️ الجرائد يعمل بالفعل.\nلإيقافه: /جرائد stop");
    }

    // Ask for name — save pending state
    if (!global.CroloBot.pending) global.CroloBot.pending = new Map();

    global.CroloBot.pending.set(`${senderID}:${threadID}`, {
      type:      "jarayed",
      threadID,
      senderID,
      step:      "awaiting_name",
    });

    await message.reply("✍️ أدخل الاسم المستهدف:\n(سيُضاف في نهاية كل رسالة)");
  },

  // Called by handlerEvents when a pending name arrives
  startWithName: async function (api, threadID, name) {
    let index = 0;

    const sendNext = async () => {
      if (!activeJarayed.has(threadID)) return;

      const msg = `${MESSAGES[index]} ${name}`;
      try {
        await new Promise((res, rej) =>
          api.sendMessage(msg, threadID, (err) => err ? rej(err) : res())
        );
      } catch (_) {}

      index++;
      if (index < MESSAGES.length) {
        const timer = setTimeout(sendNext, 5000);
        activeJarayed.get(threadID).timer = timer;
      } else {
        activeJarayed.delete(threadID);
        api.sendMessage(`✅ انتهت الجرائد (${MESSAGES.length} رسالة).`, threadID);
      }
    };

    activeJarayed.set(threadID, { timer: null });
    await sendNext();
  },
};
