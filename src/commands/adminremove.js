/**
 * Crolo Bot — /adminremove command
 * Remove a user from bot admins (superadmin only)
 */
"use strict";

module.exports = {
  config: {
    name:        "adminremove",
    aliases:     ["removeadmin", "deladmin", "admin-"],
    version:     "1.0",
    author:      "Crolo",
    countDown:   3,
    role:        3,
    category:    "admin",
    description: "Remove a user from bot admins (superadmin only)",
    guide:       { en: "{pn} <userID|@mention> — Remove admin" },
  },

  onStart: async function ({ api, event, args, message, senderID }) {
    const { removeAdmin, isAdmin, getAllAdmins } = require("../../database/db");

    // Get target ID from mention or args
    let targetID = null;

    if (event.mentions && Object.keys(event.mentions).length > 0) {
      targetID = Object.keys(event.mentions)[0];
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetID = args[0];
    }

    if (!targetID) {
      return message.reply(
        "⚠️ Usage: /adminremove <userID>\nor mention a user with @\n\nExample: /adminremove 100012345678"
      );
    }

    // Prevent removing owner
    const ownerID = String(global.CroloBot?.config?.ownerID || "");
    if (targetID === ownerID) {
      return message.reply("⛔ Cannot remove the owner.");
    }

    // Prevent removing superadmins from config
    const supers = (global.CroloBot?.config?.superAdminBot || []).map(String);
    if (supers.includes(String(targetID))) {
      return message.reply("⛔ Cannot remove a superadmin.");
    }

    if (!isAdmin(targetID)) {
      return message.reply(`⚠️ User ${targetID} is not an admin.`);
    }

    removeAdmin(targetID);

    // Update in-memory config
    if (global.CroloBot?.config?.adminBot) {
      global.CroloBot.config.adminBot = global.CroloBot.config.adminBot.filter(
        (id) => String(id) !== String(targetID)
      );
    }

    const allAdmins = getAllAdmins();
    await message.reply(
      `✅ User ${targetID} has been removed from bot admins.\n\nTotal admins: ${allAdmins.length}\nRemoved by: ${senderID}`
    );

    // Notify the removed user
    try {
      api.sendMessage(
        `ℹ️ You have been removed from Crolo Bot admins.`,
        targetID
      );
    } catch (_) {}
  },
};
