/**
 * Crolo Bot — Command Loader
 */
"use strict";

const fs   = require("fs-extra");
const path = require("path");
const log  = require("./logger");

function loadCommands(dir) {
  const commands = new Map();
  const absDir   = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(absDir)) {
    log.warn("LOADER", `Commands dir not found: ${absDir}`);
    return commands;
  }

  const files  = fs.readdirSync(absDir).filter((f) => f.endsWith(".js"));
  let loaded   = 0;
  let failed   = 0;

  log.info("LOADER", `Loading ${files.length} command(s)...`);

  for (const file of files) {
    const absPath = path.resolve(absDir, file);
    try {
      delete require.cache[absPath];
      const cmd = require(absPath);

      if (!cmd?.config?.name) {
        log.warn("LOADER", `Skipping ${file} — no config.name`);
        failed++;
        continue;
      }

      const name = String(cmd.config.name).toLowerCase();
      commands.set(name, cmd);

      if (Array.isArray(cmd.config.aliases)) {
        for (const alias of cmd.config.aliases) {
          if (alias) commands.set(String(alias).toLowerCase(), cmd);
        }
      }

      loaded++;
      log.success("LOADER", `✓ Loaded: ${name}`);
    } catch (err) {
      failed++;
      log.error("LOADER", `✗ Failed to load ${file}: ${err.message}`);
    }
  }

  log.info("LOADER", `Loaded: ${loaded} | Failed: ${failed}`);
  return commands;
}

module.exports = { loadCommands };
