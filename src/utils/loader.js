const fs    = require("fs-extra");
const path  = require("path");
const chalk = require("chalk");

function loadCommands(dir) {
  const commands = new Map();

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return commands;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  let loaded = 0, failed = 0;

  console.log(chalk.cyan(`[LOADER] تحميل ${files.length} ملف أمر…`));

  for (const file of files) {
    const absPath = path.join(dir, file);
    try {
      delete require.cache[require.resolve(absPath)];
      const cmd = require(absPath);
      if (!cmd.config || !cmd.config.name) {
        console.warn(chalk.yellow(`  ⚠️  تخطي ${file}: لا يوجد config.name`));
        failed++;
        continue;
      }
      const names = [cmd.config.name, ...(cmd.config.aliases || [])];
      for (const name of names) {
        commands.set(name.toLowerCase(), cmd);
      }
      console.log(chalk.green(`  ↳ محمّل: ${cmd.config.name}`));
      loaded++;
    } catch (e) {
      console.error(chalk.red(`  ❌ فشل تحميل ${file}:`), e.message);
      failed++;
    }
  }

  console.log(chalk.cyan(`[LOADER] محمّل: ${loaded} | فشل: ${failed}`));
  return commands;
}

module.exports = { loadCommands };
