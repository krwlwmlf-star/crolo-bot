"use strict";

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
    version:     "2.0",
    author:      "Crolo",
    role:        3,
    category:    "tools",
    description: "يرسل الجرائد الـ8 بالترتيب كل 5 ثواني مع اسم الهدف",
    guide:       { en: "{pn} [اسم] — شغّل | {pn} stop — إيقاف" },
  },

  run: async function ({ api, event, args, message, threadID }) {
    const sub = (args[0] || "").toLowerCase().trim();

    if (sub === "stop" || sub === "وقف" || sub === "ايقاف") {
      const entry = activeJarayed.get(threadID);
      if (entry) {
        clearTimeout(entry.timer);
        activeJarayed.delete(threadID);
        return message.reply("⛔ تم إيقاف الجرائد.");
      }
      return message.reply("⚠️ لا يوجد جرائد نشط حالياً.");
    }

    if (activeJarayed.has(threadID)) {
      return message.reply("⚠️ الجرائد يعمل بالفعل.\nلإيقافه اكتب: /جرائد stop");
    }

    const name = args.join(" ").trim();
    if (!name) {
      return message.reply(
        "📋 طريقة الاستخدام:\n" +
        "• /جرائد [الاسم] — تشغيل مع الاسم\n" +
        "• /جرائد stop — إيقاف\n\n" +
        "مثال: /جرائد أحمد"
      );
    }

    message.reply(`🚀 بدأ إرسال الجرائد إلى: ${name}\n(${MESSAGES.length} رسائل — كل 5 ثواني)`);

    let index = 0;
    activeJarayed.set(threadID, { timer: null });

    const sendNext = async () => {
      if (!activeJarayed.has(threadID)) return;

      const msg = `${MESSAGES[index]} ${name}`;
      try {
        await new Promise((res, rej) =>
          api.sendMessage(msg, threadID, (err) => (err ? rej(err) : res()))
        );
      } catch (_) {}

      index++;
      if (index < MESSAGES.length) {
        const timer = setTimeout(sendNext, 5000);
        const entry = activeJarayed.get(threadID);
        if (entry) entry.timer = timer;
      } else {
        activeJarayed.delete(threadID);
        api.sendMessage(`✅ انتهت الجرائد (${MESSAGES.length} رسالة).`, threadID);
      }
    };

    await sendNext();
  },
};
