'use strict';
module.exports = {
  config: {
    name: 'setbotnick',
    aliases: ['botnick', 'mynick'],
    description: 'تغيير كنية البوت في المجموعة',
    usage: 'setbotnick [الكنية] | setbotnick حدف',
    role: 0,
  },
  async run({ api, event, args, threadID }) {
    const botID = api.getCurrentUserID();
    const sub = (args[0] || '').trim();

    if (!sub) {
      return api.sendMessage(
        '📛 استخدام الأمر:
' +
        '• /setbotnick [الكنية]  — تعيين كنية جديدة
' +
        '• /setbotnick حدف        — حذف الكنية',
        threadID
      );
    }

    if (sub === 'حدف' || sub === 'delete') {
      try {
        await new Promise((res, rej) =>
          api.changeNickname('', threadID, botID, e => e ? rej(e) : res())
        );
        return api.sendMessage('✅ تم حذف كنية البوت.', threadID);
      } catch (e) {
        return api.sendMessage('❌ فشل حذف الكنية: ' + e.message, threadID);
      }
    }

    const nickname = args.join(' ').trim();
    if (!nickname) return api.sendMessage('❌ الرجاء إدخال كنية.', threadID);

    try {
      await new Promise((res, rej) =>
        api.changeNickname(nickname, threadID, botID, e => e ? rej(e) : res())
      );
      return api.sendMessage(`✅ تم تعيين الكنية: ${nickname}`, threadID);
    } catch (e) {
      return api.sendMessage('❌ فشل تغيير الكنية: ' + e.message, threadID);
    }
  },
};
