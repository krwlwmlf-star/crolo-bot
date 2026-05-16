/**
 * Crolo Bot — /adminadd command
 * Add a Facebook user as bot admin (superadmin only)
 */
"use strict";

module.exports = {
  config: {
    name:        "adminadd",
    aliases:     ["addadmin", "admin+"],
    version:     "1.0",
    author:      "Crolo",
    countDown:   3,
    role:        3,
    category:    "admin",
    description: "Add a user as bot admin (superadmin only)",
    guide:       { en: "{pn} <userID|@mention> — Add admin" },
  },

  onStart: async function ({ api, event, args, message, senderID }) {
    const { addAdmin, isAdmin, getAllAdmins } = require("../../database/db");

    // Get target ID from mention or args
    let targetID = null;

    if (event.mentions && Object.keys(event.mentions).length > 0) {
      targetID = Object.keys(event.mentions)[0];
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetID = args[0];
    }

    if (!targetID) {
      return message.reply(
        "⚠️ Usage: /adminadd <userID>\nor mention a user with @\n\nExample: /adminadd 100012345678"
      );
    }

    if (isAdmin(targetID)) {
      return message.reply(`⚠️ User ${targetID} is already an admin.`);
    }

    // Prevent adding owner as admin (they already are superadmin)
    const ownerID = String(global.CroloBot?.config?.ownerID || "");
    if (targetID === ownerID) {
      return message.reply("⚠️ Owner is already a superadmin.");
    }

    addAdmin(targetID, senderID, 2);

    // Update in-memory config
    if (global.CroloBot?.config) {
      if (!Array.isArray(global.CroloBot.config.adminBot)) {
        global.CroloBot.config.adminBot = [];
      }
      if (!global.CroloBot.config.adminBot.map(String).includes(String(targetID))) {
        global.CroloBot.config.adminBot.push(targetID);
      }
    }

    const allAdmins = getAllAdmins();
    await message.reply(
      `✅ User ${targetID} has been added as bot admin!\n\nTotal admins: ${allAdmins.length}\nAdded by: ${senderID}`
    );

    // Notify the new admin
    try {
      api.sendMessage(
        `🎉 You have been added as an admin of Crolo Bot!\n\nYou can now use bot commands.\nUse ${global.CroloBot?.config?.prefix || "/"}uptime to check bot status.`,
        targetID
      );
    } catch (_) {}
  },
};
