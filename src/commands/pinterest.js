"use strict";

const axios  = require("axios");
const fs     = require("fs-extra");
const path   = require("path");
const os     = require("os");

module.exports = {
  config: {
    name:        "pinterest",
    aliases:     ["pin", "pins"],
    version:     "1.0",
    author:      "Crolo",
    role:        3,
    category:    "media",
    description: "جلب صورة عشوائية من Pinterest",
    guide:       { en: "{pn} [بحث] — مثال: /pinterest cats" },
  },

  onStart: async function ({ api, event, args, message, threadID }) {
    if (!args[0]) {
      return message.reply("الاستخدام: /pinterest [كلمة البحث]\nمثال: /pinterest nature");
    }

    const query = args.join(" ");
    await message.reply(`🔍 جارٍ البحث عن "${query}" في Pinterest...`);

    let imageUrl = null;

    try {
      // Use Pinterest search API
      const res = await axios.get(
        `https://www.pinterest.com/resource/BaseSearchResource/get/`,
        {
          params: {
            source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
            data: JSON.stringify({
              options: {
                query,
                scope: "pins",
                page_size: 25,
                bookmarks: [],
              },
            }),
          },
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          timeout: 15000,
        }
      );

      const pins = res.data?.resource_response?.data?.results || [];
      const withImg = pins.filter(
        (p) => p?.images?.orig?.url || p?.images?.["736x"]?.url
      );

      if (withImg.length > 0) {
        const pin = withImg[Math.floor(Math.random() * withImg.length)];
        imageUrl = pin?.images?.orig?.url || pin?.images?.["736x"]?.url;
      }
    } catch (_) {}

    if (!imageUrl) {
      return message.reply(`❌ لم يُعثر على نتائج لـ "${query}".\nجرب كلمة بحث مختلفة.`);
    }

    // Download image
    const tmpFile = path.join(os.tmpdir(), `pin_${Date.now()}.jpg`);
    try {
      const imgRes = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 20000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0",
        },
      });
      fs.writeFileSync(tmpFile, imgRes.data);

      await new Promise((res, rej) =>
        api.sendMessage(
          { body: `📌 Pinterest — ${query}`, attachment: fs.createReadStream(tmpFile) },
          threadID,
          (err) => {
            fs.remove(tmpFile).catch(() => {});
            err ? rej(err) : res();
          }
        )
      );
    } catch (err) {
      fs.remove(tmpFile).catch(() => {});
      return message.reply(`❌ فشل تحميل الصورة.\n${err.message}`);
    }
  },
};
