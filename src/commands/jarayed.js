"use strict";

// threadID → { timer, minMs, maxMs, name }
const activeJarayed = new Map();

// threadID → { minMs, maxMs } — pending timing config before on
const pendingConfig  = new Map();

const MESSAGES = [
  `شۣۗـۙرفۣۗـۙ يۣۗہمۣۗـۙآكۣۗـۙ مۣۗـۙقۣۗـۙآبۣۗـۙلَ رحۣۗـۙمۣۗـۙةّ  🥒`,
  `يَرآنْيَ ۆأنْيَ آڪلُ صٍࢪم يُـ' ـُمُـ' ـُٱڪ  🤤`,
  `😂 آجۣۗـۙريۣۗہـﮯ ربۣۗـۙگ آجۣۗـۙريۣۗہـﮯ آمۣۗـۙـگ 💔 تۣۗـۙﮧﮧنۣۗـۙآگتۣۗـۙ ديۣۗہـﮯربۣۗـۙهۣۗہہ‏‏آ🍑`,
  `نُـ'ـُٱسُ تُـ'ـُتُـ'ـُسُـ'ـُٱبُـ'ـُقُ ٱلُـ'ـُخُـ'ـُيُـ'ـُر وٌأمُـ'ـُكُـ'ـُ تُـ'ـُسُـ'ـُبُـ'ـُقُ بُـ'ـُيُ تۣۗہُـ' ـُرمۣۗہُـ 'ـُتۣۗہُـ' ـُهۣۗہـُ' ـُٱ`,
  `تضن ⃪⃪ڪـ𝗦ـمڪ من حجر گي لا تهࢪب أو ماذا يا أبن آلَعۣۗـۙآ هۣۗہہ‏‏ر‏‏هۣۗہہ😂😂`,
  `كَمِـكَ 😆 كۣۗہࢪكَ لن يهࢪب أبدا كَـ𝛅ـمِـكَ في حصآࢪ سيآسي أقتصآدي من زٍℬـޢًَـ🐦‍⬛͊ᷬـєـﹷٰﹷٰﹷٰﹷٰﹷٰـ𒈔ـ۪۬۫ٴٰ٘ـيُ`,
  `سأحآصࢪڪ حتى تقول للجميع شـًٌٍّ̨̥̬̩ـتــًٌٍّ̨̥̬̩ـمـًٌٍّ̨̥̬̩ـت ࢪپ أمـًٌٍّ̨̥̬̩ـي ﴿ﺂݪہٰ۪٘زﻋﮩٰ۪٘ۛﮩٰ۪٘ۛﯧۦٰۗٛﻢ ݪہٰ۪٘ﯡﺳۦٰۗٛۧﯧفہږﮩ﴾ وأنا بي وࢪطـًٌٍّ̨̥̬̩ـة 😴`,
  `لَآ تُےـهےـِࢪبّ وُآلَآ سًےـآكےـلَ قَеـلَب أمِеـڪ 🫀🤤`,
];

function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function startEngine(api, threadID, name, minMs, maxMs) {
  if (activeJarayed.has(threadID)) return;

  const state = { timer: null, minMs, maxMs, name };
  activeJarayed.set(threadID, state);

  const tick = () => {
    if (!activeJarayed.has(threadID)) return;
    const cur = activeJarayed.get(threadID);

    const msg = `${pickRandom(MESSAGES)} ${cur.name}`;
    api.sendMessage(msg, threadID, () => {});

    const delay = randBetween(cur.minMs, cur.maxMs);
    cur.timer = setTimeout(tick, delay);
  };

  tick();
}

function stopEngine(threadID) {
  const st = activeJarayed.get(threadID);
  if (!st) return false;
  clearTimeout(st.timer);
  activeJarayed.delete(threadID);
  return true;
}

const HELP_MSG =
  `📋 أمر الجرائد\n` +
  `━━━━━━━━━━━━━━━━\n` +
  `• /جرائد on — تشغيل (يطلب الاسم)\n` +
  `• /جرائد stop — إيقاف\n` +
  `• /جرائد time {أدنى} {أقصى} — ضبط التوقيت (ثواني)\n\n` +
  `مثال:\n` +
  `/جرائد time 3 8\n` +
  `/جرائد on`;

module.exports = {
  config: {
    name:        "جرائد",
    aliases:     ["jarayed", "j"],
    version:     "3.0",
    author:      "Crolo",
    role:        2,
    category:    "tools",
    description: "سبام جرائد عشوائي — يرسل جرائد بترتيب عشوائي مع اسم المستهدف بلا توقف",
    guide:       { en: HELP_MSG },
  },

  run: async function ({ api, args, message, threadID, senderID }) {
    const sub = (args[0] || "").toLowerCase().trim();

    // ── بدون args — عرض القائمة ───────────────────────────────────────────────
    if (!sub) {
      const isActive = activeJarayed.has(threadID);
      const st       = isActive ? activeJarayed.get(threadID) : null;
      const cfg      = pendingConfig.get(threadID);

      return message.reply(
        `📋 أمر الجرائد\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `الحالة: ${isActive ? `✅ نشط — "${st.name}" (${st.minMs / 1000}ث—${st.maxMs / 1000}ث)` : "⛔ متوقف"}\n` +
        `التوقيت: ${cfg ? `${cfg.minMs / 1000}ث — ${cfg.maxMs / 1000}ث` : "3ث — 7ث (افتراضي)"}\n\n` +
        `الأوامر:\n` +
        `• /جرائد on — تشغيل (يطلب الاسم)\n` +
        `• /جرائد stop — إيقاف\n` +
        `• /جرائد time {أدنى} {أقصى} — ضبط التوقيت\n\n` +
        `عدد الجرائد: ${MESSAGES.length} رسالة عشوائية`
      );
    }

    // ── ON ────────────────────────────────────────────────────────────────────
    if (sub === "on" || sub === "تشغيل") {
      if (activeJarayed.has(threadID)) {
        const st = activeJarayed.get(threadID);
        return message.reply(
          `⚠️ الجرائد يعمل بالفعل على "${st.name}".\n` +
          `لإيقافه: /جرائد stop`
        );
      }

      // Ask for name via reply
      api.sendMessage(
        `✍️ أرسل اسم المستهدف (رد على هذه الرسالة):`,
        threadID,
        (err, info) => {
          if (err || !info) return;
          global._onReply.set(info.messageID, {
            commandName: "جرائد",
            messageID:   info.messageID,
            author:      senderID,
            threadID,
          });
        }
      );
      return;
    }

    // ── STOP ──────────────────────────────────────────────────────────────────
    if (sub === "stop" || sub === "وقف" || sub === "ايقاف") {
      const stopped = stopEngine(threadID);
      return message.reply(
        stopped
          ? "⛔ تم إيقاف الجرائد."
          : "⚠️ لا يوجد جرائد نشط حالياً."
      );
    }

    // ── TIME ──────────────────────────────────────────────────────────────────
    if (sub === "time" || sub === "وقت") {
      const rawMin = parseFloat(args[1]);
      const rawMax = parseFloat(args[2]);

      if (isNaN(rawMin) || isNaN(rawMax) || rawMin <= 0 || rawMax < rawMin) {
        return message.reply(
          "❌ صيغة خاطئة.\n" +
          "مثال: /جرائد time 3 8\n" +
          "(الأدنى يجب أن يكون أصغر من الأقصى، بالثواني)"
        );
      }

      const minMs = Math.round(rawMin * 1000);
      const maxMs = Math.round(rawMax * 1000);

      if (activeJarayed.has(threadID)) {
        const st = activeJarayed.get(threadID);
        st.minMs = minMs;
        st.maxMs = maxMs;
        return message.reply(
          `⏱ تم تحديث التوقيت أثناء التشغيل:\n` +
          `الأدنى: ${rawMin}ث | الأقصى: ${rawMax}ث`
        );
      }

      pendingConfig.set(threadID, { minMs, maxMs });
      return message.reply(
        `⏱ تم ضبط التوقيت:\nالأدنى: ${rawMin}ث | الأقصى: ${rawMax}ث\n\n` +
        `الآن شغّل بـ: /جرائد on`
      );
    }

    return message.reply(HELP_MSG);
  },

  // ── يُستدعى عند رد المستخدم على رسالة "أرسل الاسم" ─────────────────────────
  onReply: async function ({ api, event, body, threadID, senderID, Reply }) {
    const name = body.trim();
    if (!name) {
      return api.sendMessage("❌ الاسم فارغ، أعد المحاولة.", threadID);
    }

    if (activeJarayed.has(threadID)) {
      return api.sendMessage(
        `⚠️ الجرائد يعمل بالفعل على "${activeJarayed.get(threadID).name}".`,
        threadID
      );
    }

    const cfg    = pendingConfig.get(threadID) || { minMs: 3000, maxMs: 7000 };
    const minMs  = cfg.minMs;
    const maxMs  = cfg.maxMs;

    startEngine(api, threadID, name, minMs, maxMs);

    api.sendMessage(
      `🚀 انطلق المحرك!\n` +
      `الهدف: "${name}"\n` +
      `التوقيت: ${minMs / 1000}ث — ${maxMs / 1000}ث\n` +
      `الجرائد: ${MESSAGES.length} رسالة عشوائية\n\n` +
      `لإيقافه: /جرائد stop`,
      threadID
    );
  },
};
