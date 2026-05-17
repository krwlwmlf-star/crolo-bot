"use strict";
module.exports = {
  config: {
    name: "help",
    aliases: ["commands", "cmds"],
    description: "عرض جميع الأوامر المتاحة",
    usage: "help [اسم الأمر]",
    role: 0,
  },
  async run({ api, args, threadID }) {
    const commands = global.commands;
    const prefix   = global.commandPrefix || "/";
    const botName  = global.botName || "Crolo Bot";

    if (args[0]) {
      const cmd = commands.get(args[0].toLowerCase());
      if (!cmd) return api.sendMessage("❌ الأمر غير موجود: " + args[0], threadID);
      return api.sendMessage(
        "📌 الأمر: " + prefix + cmd.config.name + "\n" +
        "📝 الوصف: " + (cmd.config.description || "لا يوجد وصف") + "\n" +
        "🔧 الاستخدام: " + prefix + (cmd.config.usage || cmd.config.name) + "\n" +
        "🔒 الصلاحية: " + (cmd.config.role >= 3 ? "مالك فقط" : cmd.config.role >= 2 ? "أدمن" : "الجميع"),
        threadID
      );
    }

    const seen = new Set();
    const list = [];
    for (const [, cmd] of commands) {
      if (!seen.has(cmd.config.name)) {
        seen.add(cmd.config.name);
        list.push("• " + prefix + cmd.config.name + " — " + (cmd.config.description || "لا يوجد وصف"));
      }
    }

    api.sendMessage(
      "🤖 " + botName + " — الأوامر\n\n" +
      list.join("\n") +
      "\n\nاكتب " + prefix + "help [اسم الأمر] للتفاصيل.",
      threadID
    );
  },
};
