"use strict";

// threadID → { timer, minMs, maxMs, customMsg }
const activeEngines = new Map();

// threadID → custom message text (set before on)
const customMessages = new Map();

// Invisible / silent characters — appears as empty message
const SILENT_CHARS = [
  "\u200B",   // Zero Width Space
  "\u200C",   // Zero Width Non-Joiner
  "\u200D",   // Zero Width Joiner
  "\u2800",   // Braille Pattern Blank
  "\u3164",   // Hangul Filler
  "\uFEFF",   // Zero Width No-Break Space
];

function silentPayload() {
  const len = Math.floor(Math.random() * 4) + 1;
  let s = "";
  for (let i = 0; i < len; i++) {
    s += SILENT_CHARS[Math.floor(Math.random() * SILENT_CHARS.length)];
  }
  return s;
}

function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function startEngine(api, threadID, minMs, maxMs) {
  if (activeEngines.has(threadID)) return;

  const state = { timer: null, minMs, maxMs };
  activeEngines.set(threadID, state);

  const tick = () => {
    if (!activeEngines.has(threadID)) return;
    const current = activeEngines.get(threadID);

    const msg = customMessages.has(threadID)
      ? customMessages.get(threadID)
      : silentPayload();

    api.sendMessage(msg, threadID, () => {});

    const delay = randBetween(current.minMs, current.maxMs);
    current.timer = setTimeout(tick, delay);
  };

  tick();
}

function stopEngine(threadID) {
  const state = activeEngines.get(threadID);
  if (!state) return false;
  clearTimeout(state.timer);
  activeEngines.delete(threadID);
  return true;
}

module.exports = {
  config: {
    name:        "ماهوراغا",
    aliases:     ["maharaga", "silent", "صامت"],
    version:     "1.1",
    author:      "Crolo",
    role:        2,
    category:    "tools",
    description: "محرك رسائل صامتة — يرسل رسائل غير مرئية (أو مخصصة) بلا توقف حتى الإيقاف",
    guide:       {
      en: [
        "{pn} on               — تشغيل المحرك",
        "{pn} stop             — إيقاف المحرك",
        "{pn} time {min} {max} — ضبط التوقيت (بالثواني)",
        "{pn} change [نص]      — تعيين رسالة مخصصة قبل التشغيل",
        "{pn} change clear     — إزالة الرسالة المخصصة والعودة للصامتة",
      ].join("\n"),
    },
  },

  run: async function ({ api, args, message, threadID }) {
    const sub = (args[0] || "").toLowerCase().trim();

    // ── ON ────────────────────────────────────────────────────────────────────
    if (sub === "on" || sub === "تشغيل") {
      if (activeEngines.has(threadID)) {
        const st = activeEngines.get(threadID);
        const hasCustom = customMessages.has(threadID);
        return message.reply(
          `⚙️ المحرك يعمل بالفعل.\n` +
          `⏱ التوقيت: ${st.minMs / 1000}ث — ${st.maxMs / 1000}ث\n` +
          `📝 الرسالة: ${hasCustom ? `"${customMessages.get(threadID)}"` : "صامتة (غير مرئية)"}\n` +
          `لإيقافه: /ماهوراغا stop`
        );
      }

      const minMs = 1000;
      const maxMs = 3000;
      const hasCustom = customMessages.has(threadID);
      startEngine(api, threadID, minMs, maxMs);

      return message.reply(
        `✅ تم تشغيل المحرك\n` +
        `⏱ التوقيت: ${minMs / 1000}ث — ${maxMs / 1000}ث (افتراضي)\n` +
        `📝 الرسالة: ${hasCustom ? `"${customMessages.get(threadID)}"` : "صامتة (غير مرئية)"}\n` +
        `لإيقافه: /ماهوراغا stop`
      );
    }

    // ── STOP ──────────────────────────────────────────────────────────────────
    if (sub === "stop" || sub === "وقف" || sub === "ايقاف") {
      const stopped = stopEngine(threadID);
      return message.reply(
        stopped
          ? "⛔ تم إيقاف المحرك."
          : "⚠️ المحرك غير نشط حالياً."
      );
    }

    // ── CHANGE ────────────────────────────────────────────────────────────────
    if (sub === "change" || sub === "تغيير") {
      const rest = args.slice(1).join(" ").trim();

      if (!rest) {
        const cur = customMessages.get(threadID);
        return message.reply(
          `📝 الرسالة المخصصة الحالية:\n` +
          (cur ? `"${cur}"\n\nلتغييرها: /ماهوراغا change [النص]\nلحذفها: /ماهوراغا change clear`
               : `غير محددة — يُرسل رسائل صامتة.\n\nلتعيين رسالة: /ماهوراغا change [النص]`)
        );
      }

      if (rest.toLowerCase() === "clear" || rest === "حذف" || rest === "مسح") {
        customMessages.delete(threadID);
        return message.reply(
          `🗑️ تم حذف الرسالة المخصصة.\n` +
          `المحرك سيعود لإرسال رسائل صامتة عند التشغيل.`
        );
      }

      customMessages.set(threadID, rest);

      // If engine is already running, update it live
      const isActive = activeEngines.has(threadID);
      return message.reply(
        `✅ تم تعيين الرسالة المخصصة:\n"${rest}"\n\n` +
        (isActive
          ? `المحرك يعمل وسيستخدمها فوراً.`
          : `شغّل المحرك بـ: /ماهوراغا on`)
      );
    }

    // ── TIME ──────────────────────────────────────────────────────────────────
    if (sub === "time" || sub === "وقت") {
      const rawMin = parseFloat(args[1]);
      const rawMax = parseFloat(args[2]);

      if (isNaN(rawMin) || isNaN(rawMax) || rawMin <= 0 || rawMax < rawMin) {
        return message.reply(
          "❌ صيغة خاطئة.\n" +
          "مثال: /ماهوراغا time 1 5\n" +
          "(الحد الأدنى يجب أن يكون أصغر من الأقصى، بالثواني)"
        );
      }

      const minMs = Math.round(rawMin * 1000);
      const maxMs = Math.round(rawMax * 1000);

      if (activeEngines.has(threadID)) {
        const st = activeEngines.get(threadID);
        st.minMs = minMs;
        st.maxMs = maxMs;
        return message.reply(
          `⏱ تم تحديث التوقيت:\n` +
          `الحد الأدنى: ${rawMin}ث\n` +
          `الحد الأقصى: ${rawMax}ث\n` +
          `(المحرك لا يزال يعمل)`
        );
      } else {
        startEngine(api, threadID, minMs, maxMs);
        return message.reply(
          `✅ تم تشغيل المحرك بتوقيت مخصص:\n` +
          `الحد الأدنى: ${rawMin}ث\n` +
          `الحد الأقصى: ${rawMax}ث\n` +
          `لإيقافه: /ماهوراغا stop`
        );
      }
    }

    // ── STATUS / HELP ─────────────────────────────────────────────────────────
    const isActive = activeEngines.has(threadID);
    const st       = isActive ? activeEngines.get(threadID) : null;
    const hasCustom = customMessages.has(threadID);

    return message.reply(
      `🔇 محرك الرسائل الصامتة\n` +
      `الحالة: ${isActive ? `✅ نشط (${st.minMs / 1000}ث — ${st.maxMs / 1000}ث)` : "⛔ متوقف"}\n` +
      `الرسالة: ${hasCustom ? `"${customMessages.get(threadID)}"` : "صامتة (غير مرئية)"}\n\n` +
      `الأوامر:\n` +
      `• /ماهوراغا on — تشغيل\n` +
      `• /ماهوراغا stop — إيقاف\n` +
      `• /ماهوراغا change [نص] — تعيين رسالة مخصصة\n` +
      `• /ماهوراغا change clear — حذف الرسالة المخصصة\n` +
      `• /ماهوراغا time {أدنى} {أقصى} — ضبط التوقيت بالثواني\n\n` +
      `مثال:\n` +
      `/ماهوراغا change مرحبا\n` +
      `/ماهوراغا on`
    );
  },
};
