"use strict";

const axios = require("axios");
const fs    = require("fs-extra");
const path  = require("path");
const os    = require("os");

// Arabic meme text pairs: [top, bottom]
// {name} gets replaced with the target's name
const MEME_TEXTS = [
  ["أنا فاهم {name}", "ما فاهم والله 😂"],
  ["لما {name} يقول", "أنا مشغول 💀"],
  ["{name} وهو يفكر", "الحين أفعل شيء... بكره 😴"],
  ["لما {name} يحاول", "يساعد ويخرب أكثر 😭"],
  ["{name} الصبح", "{name} الليل 💤"],
  ["الكل يعمل", "{name} يتفرج 🍿"],
  ["{name} لما يسمع", "كلام ما يعجبه 🙄"],
  ["أنا والله ما أصدق", "إن {name} جاد 😂"],
  ["{name} يقول", "ما عندي وقت... وهو فاضي 😐"],
  ["لما تسأل {name}", "يعرف إجابة غلط بثقة 😆"],
  ["{name} قبل النوم", "يفكر في كل شيء 😩"],
  ["أنا أعتمد على {name}", "غلطة العمر 🤦"],
  ["{name} وهو يكذب", "بثقة عالية 🤥"],
  ["{name} عنده خطة", "الخطة: لا خطة 😂"],
  ["وعد {name}", "وعد للأبد ⏳"],
];

// Curated meme templates from memegen.link that look good
const TEMPLATES = [
  "doge", "drake", "fry", "gru-plan", "rollsafe",
  "db", "pigeon", "buzz", "fine", "distracted",
  "two-buttons", "change-my-mind", "always-has-been",
  "clown", "think", "homer-couch", "wonka",
];

function encodeForUrl(text) {
  return text
    .replace(/ /g, "_")
    .replace(/\?/g, "~q")
    .replace(/%/g, "~p")
    .replace(/#/g, "~h")
    .replace(/\//g, "~s")
    .replace(/\\/g, "~b")
    .replace(/</g, "~l")
    .replace(/>/g, "~g");
}

module.exports = {
  config: {
    name:        "ميمز",
    aliases:     ["meme", "memes", "ميم"],
    version:     "1.0",
    author:      "Crolo",
    role:        3,
    category:    "fun",
    description: "إنشاء ميمز عشوائي على الشخص المذكور",
    guide:       { en: "{pn} @mention" },
  },

  onStart: async function ({ api, event, message, threadID }) {
    // Must have a mention
    const mentions = event.mentions || {};
    const mentionIDs = Object.keys(mentions);

    if (mentionIDs.length === 0) {
      return message.reply("الاستخدام: /ميمز @شخص\nاذكر الشخص الذي تريد الميمز عنه.");
    }

    const targetID = mentionIDs[0];
    await message.reply("🎭 جارٍ إنشاء الميمز...");

    // Get target name
    let targetName = mentions[targetID]?.replace(/^@/, "") || "الهدف";
    try {
      const info = await new Promise((res, rej) =>
        api.getUserInfo(targetID, (err, data) => err ? rej(err) : res(data))
      );
      if (info?.[targetID]?.name) targetName = info[targetID].name;
    } catch (_) {}

    // Pick random template and text
    const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    const textPair  = MEME_TEXTS[Math.floor(Math.random() * MEME_TEXTS.length)];
    const top    = encodeForUrl(textPair[0].replace(/{name}/g, targetName));
    const bottom = encodeForUrl(textPair[1].replace(/{name}/g, targetName));

    const memeUrl = `https://api.memegen.link/images/${template}/${top}/${bottom}.png`;

    // Download the meme
    const tmpFile = path.join(os.tmpdir(), `meme_${Date.now()}.png`);
    try {
      const imgRes = await axios.get(memeUrl, {
        responseType: "arraybuffer",
        timeout: 20000,
        headers: { "User-Agent": "Mozilla/5.0 CroloBot/1.0" },
      });
      fs.writeFileSync(tmpFile, imgRes.data);

      await new Promise((res, rej) =>
        api.sendMessage(
          {
            body: `🎭 ميمز خاص بـ ${targetName}`,
            attachment: fs.createReadStream(tmpFile),
          },
          threadID,
          (err) => {
            fs.remove(tmpFile).catch(() => {});
            err ? rej(err) : res();
          }
        )
      );
    } catch (err) {
      fs.remove(tmpFile).catch(() => {});
      // Fallback: send URL if download fails
      try {
        await message.reply(`🎭 ميمز خاص بـ ${targetName}:\n${memeUrl}`);
      } catch (_) {
        await message.reply(`❌ تعذّر إنشاء الميمز: ${err.message}`);
      }
    }
  },
};
