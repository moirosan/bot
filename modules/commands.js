import { promises as fs } from "fs";
import { modules } from "./riotApiModule.js";

export const commands = {
  "!add": async ({ channel, args, isAdmin, client, cmds }) => {
    if (!isAdmin) return;

    const [name, ...textParts] = args;
    if (!name || textParts.length === 0) {
      return client.say(channel, "Использование: !add <name> <text>");
    }

    const cmdName = `!${name}`;
    if (!cmds[cmdName]) {
      cmds[cmdName] = textParts.join(" ");
      await fs.writeFile("./data/commands.json", JSON.stringify(cmds, null, 2));
      client.say(channel, `Команда ${cmdName} добавлена: "${cmds[cmdName]}"`);
    } else {
      client.say(channel, `Команда ${cmdName} уже существует`);
    }
  },

  "!rm": async ({ channel, args, isAdmin, client, cmds }) => {
    if (!isAdmin) return;

    const name = args[0];
    if (!name) {
      return client.say(channel, "Использование: !rm <name>");
    }

    const cmdName = `!${name}`;
    if (cmds[cmdName]) {
      delete cmds[cmdName];
      await fs.writeFile("./data/commands.json", JSON.stringify(cmds, null, 2));
      client.say(channel, `Команда ${cmdName} удалена`);
    } else {
      client.say(channel, `Команда ${cmdName} не найдена`);
    }
  },
/*
  "!cmds": async ({ channel, cmds, client }) => {
    const commandList = Object.keys(cmds).join(", ");
    client.say(
      channel,
      commandList ? `Список команд: ${commandList}` : "Список команд пуст"
    );
  },
*/

  "!addacc": async ({ channel, args, isAdmin, client, accounts }) => {
    if (!isAdmin) return;
    const [tag, ...nameParts] = args;
    if (!tag || nameParts.length === 0) {
        return client.say(channel, "Использование: !addacc <tag> <name>");
    }
    const name = nameParts.join(" ");
    try {
        const puuid = await modules.getPuuid(name, tag);
        if (puuid && !accounts[name]) {
            accounts[name] = { tag, puuid: puuid.puuid }; // Убедитесь, что puuid - это строка
            await fs.writeFile(
                "./data/accounts.json",
                JSON.stringify(accounts, null, 2)
            );
            client.say(channel, `Аккаунт ${name} #${tag} добавлен`);
        } else {
            client.say(channel, `Аккаунт ${name} уже существует или не найден`);
        }
    } catch (e) {
        console.error("Ошибка:", e);
        client.say(channel, "Ошибка добавления аккаунта");
    }
},

  "!rmacc": async ({ channel, args, isAdmin, client, accounts }) => {
    if (!isAdmin) return;

    const name = args.join(" ");
    if (!name) {
      return client.say(channel, "Использование: !rmacc <name>");
    }

    if (accounts[name]) {
      delete accounts[name];
      await fs.writeFile(
        "./data/accounts.json",
        JSON.stringify(accounts, null, 2)
      );
      client.say(channel, `Аккаунт ${name} удален`);
    } else {
      client.say(channel, `Аккаунт ${name} не найден`);
    }
  },

  "!accs": async ({ channel, accounts, client }) => {
    const accList = Object.entries(accounts)
      .map(([accName, accData]) => `${accName} #${accData.tag}`)
      .join(", ");
    client.say(
      channel,
      accList ? `Список аккаунтов: ${accList}` : "Список аккаунтов пуст"
    );
  },

  "!options": async ({ channel, args, isAdmin, client, functions }) => {
    if (!isAdmin) return;

    const [commandName, action] = args;
    if (!commandName || !action) {
      return client.say(channel, "Использование: !options <command> on/off");
    }

    const fullCommandName = `!${commandName}`;
    if (functions[fullCommandName] !== undefined) {
      if (action === "on" || action === "off") {
        functions[fullCommandName] = action === "on";
        await fs.writeFile(
          "./data/functions.json",
          JSON.stringify(functions, null, 2)
        );
        client.say(
          channel,
          `Команда "${fullCommandName}" ${
            action === "on" ? "включена" : "отключена"
          }`
        );
      } else {
        client.say(channel, "Использование: !options <command> on/off");
      }
    } else {
      client.say(channel, `Команда "${fullCommandName}" не найдена`);
    }
  },

  "!test": async ({ channel, isAdmin, client }) => {
    if (!isAdmin) return;
    client.say(channel, "online");
  }
};
