"use strict";

async function safeGetThreadList(api, limit, cursor, tags) {
  try {
    const r = await api.getThreadList(limit, cursor || null, tags);
    return Array.isArray(r) ? r : (r?.data || []);
  } catch { return []; }
}

async function getAllGroups(api) {
  let groups = [], cursor = null;
  for (let p = 0; p < 4; p++) {
    const batch = await safeGetThreadList(api, 50, cursor, ["INBOX"]);
    if (!batch.length) break;
    groups = groups.concat(batch.filter(t => t?.isGroup && t.threadID));
    const last = batch[batch.length - 1];
    if (!last || batch.length < 50) break;
    cursor = last.timestamp || null;
    if (!cursor) break;
    await new Promise(r => setTimeout(r, 300));
  }
  return groups;
}

module.exports = {
  config: {
    name: "محادثات",
    aliases: ["chats", "groups", "غروبات"],
    description: "إدارة المحادثات والغروبات",
    usage: "محادثات | محادثات رسالة [رقم] [نص] | محادثات خروج [رقم] | محادثات معرف [رقم]",
    role: 2,
  },
  async run({ api, args, event, message }) {
    const { threadID, senderID } = event;
    const sub = (args[0] || "").toLowerCase();

    if (!sub || sub === "قائمة" || sub === "list") {
      message.reply("⏳ جاري جلب قائمة الغروبات…");
      const groups = await getAllGroups(api);
      if (!groups.length) return message.reply("❌ لا توجد غروبات.");
      const botID = String(api.getCurrentUserID());

      const lines = groups.slice(0, 30).map((g, i) => {
        const name = g.name || g.threadName || `غروب #${i + 1}`;
        return `${i + 1}. ${name}`;
      });

      const text = `📋 الغروبات (${groups.length} غروب)\n━━━━━━━━━━━━━━\n${lines.join("\n")}\n━━━━━━━━━━━━━━\n• /محادثات رسالة [رقم] [نص]\n• /محادثات خروج [رقم]\n• /محادثات معرف [رقم]`;

      // Store list for follow-up commands
      global._chatsList = { groups: groups.slice(0, 30), owner: senderID, ts: Date.now() };
      return message.reply(text);
    }

    // Helper to get thread from stored list
    const list = global._chatsList;
    const getThread = (num) => {
      if (!list || Date.now() - list.ts > 300000) return null;
      const idx = parseInt(num) - 1;
      if (isNaN(idx) || idx < 0 || idx >= list.groups.length) return null;
      return list.groups[idx];
    };

    if (sub === "رسالة" || sub === "send") {
      const num  = args[1];
      const text = args.slice(2).join(" ").trim();
      if (!num || !text) return message.reply("❌ الاستخدام: /محادثات رسالة [رقم] [النص]");
      const t = getThread(num);
      if (!t) return message.reply("❌ رقم غير صحيح — اكتب /محادثات أولاً لتحديث القائمة.");
      try {
        await api.sendMessage(text, t.threadID);
        return message.reply(`✅ تم إرسال الرسالة إلى "${t.name || t.threadID}"`);
      } catch (e) { return message.reply(`❌ فشل الإرسال: ${e.message?.slice(0, 80)}`); }
    }

    if (sub === "خروج" || sub === "leave") {
      const num = args[1];
      if (!num) return message.reply("❌ الاستخدام: /محادثات خروج [رقم]");
      const t = getThread(num);
      if (!t) return message.reply("❌ رقم غير صحيح — اكتب /محادثات أولاً.");
      try {
        const botID = String(api.getCurrentUserID());
        await api.removeUserFromGroup(botID, t.threadID);
        return message.reply(`✅ خرج البوت من "${t.name || t.threadID}"`);
      } catch (e) { return message.reply(`❌ فشل الخروج: ${e.message?.slice(0, 80)}`); }
    }

    if (sub === "معرف" || sub === "id") {
      const num = args[1];
      if (!num) return message.reply("❌ الاستخدام: /محادثات معرف [رقم]");
      const t = getThread(num);
      if (!t) return message.reply("❌ رقم غير صحيح — اكتب /محادثات أولاً.");
      return message.reply(`🆔 "${t.name || "؟"}"\nID: ${t.threadID}`);
    }

    if (sub === "عدد" || sub === "count") {
      message.reply("⏳ جاري الحساب…");
      const groups = await getAllGroups(api);
      return message.reply(`📊 إجمالي الغروبات: ${groups.length}`);
    }

    return message.reply(
      "📋 أوامر المحادثات\n━━━━━━━━━━━━━━\n" +
      "• /محادثات — عرض قائمة الغروبات\n" +
      "• /محادثات رسالة [رقم] [نص] — إرسال رسالة\n" +
      "• /محادثات خروج [رقم] — خروج البوت من غروب\n" +
      "• /محادثات معرف [رقم] — عرض ID الغروب\n" +
      "• /محادثات عدد — عدد الغروبات الكلي"
    );
  },
};
