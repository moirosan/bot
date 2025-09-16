import cron from "node-cron";
import dotenv from "dotenv";
import { promises as fs } from "fs";
import { client, connect } from "./modules/twitchClient.js";
import { modules } from "./modules/riotApiModule.js";
import { commands } from "./modules/commands.js";
import { aliases } from "./modules/aliases.js";
import { logger } from "./logger.js";

dotenv.config();
// Инициализация данных
let accounts = {};
let cmds = {};
let functions = {};

async function loadData() {
  try {
    accounts =
      JSON.parse(await fs.readFile("./data/accounts.json", "utf-8")) || {};
    cmds = JSON.parse(await fs.readFile("./data/commands.json", "utf-8")) || {};
    functions = JSON.parse(
      await fs.readFile("./data/functions.json", "utf-8")
    ) || {
      "!lp": true,
      "!runes": true,
      "!last": true,
      "!champ": true,
      "!lastgm": true,
      "!lastchal": true,
      "!opgg": true,
      "!today": true
    };
  } catch (e) {
    console.log("Инициализация с default данными");
  }
}

await loadData();
connect();
// Обработчик команд
client.on("message", (channel, tags, message, self) => {
  if (self) return;
  const isAdmin = tags.badges?.broadcaster || tags.badges?.moderator;
  const [cmd, ...args] = message.trim().split(" ");
  const command = cmd.toLowerCase();
  const actualCommand = aliases[command] || command;
  // logger
  if (actualCommand.startsWith("!")) {
    logger.info(`[${tags.username}]: ${actualCommand}`);
  }
  if (modules[actualCommand] && functions[actualCommand]) {
    modules[actualCommand]({
      channel,
      args,
      isAdmin,
      client,
      accounts,
      cmds,
      functions
    });
  } else if (commands[actualCommand]) {
    commands[actualCommand]({
      channel,
      args,
      isAdmin,
      client,
      accounts,
      cmds,
      functions
    });
  } else if (cmds[actualCommand]) {
    client.say(channel, `/me ${cmds[actualCommand]}`);
  }
});

client.on("error", console.error);

let isUpdating = false;
cron.schedule(
  "0 */8 * * *",
  async () => {
    if (isUpdating) return;
    isUpdating = true;
    try {
      let existingMatches = JSON.parse(
        (await fs.readFile("./data/matches.json", "utf-8")) || "[]"
      );
      const existingMatchIds = new Set(
        existingMatches.map(match => match.matchId)
      );

      for (const { puuid } of Object.values(accounts)) {
        const newMatchIds = await modules.getMatchesIds(puuid, 15);
        const matchesToAdd = [];
        for (const matchId of newMatchIds) {
          if (!existingMatchIds.has(matchId)) {
            const matchInfo = await modules.getChampionAndRuneObj(
              matchId,
              puuid
            );
            if (matchInfo) {
              matchesToAdd.push({ ...matchInfo, matchId });
              existingMatchIds.add(matchId);
            }
            await new Promise(resolve => setTimeout(resolve, 1200));
          }
        }
        existingMatches.unshift(...matchesToAdd);
      }

      if (existingMatches.length > 500) {
        existingMatches = existingMatches.slice(0, 500);
      }

      await fs.writeFile(
        "./data/matches.json",
        JSON.stringify(existingMatches, null, 2)
      );
      console.log(`Обновлено. Всего матчей: ${existingMatches.length}`);
    } catch (error) {
      console.error("Ошибка в cron:", error);
    } finally {
      isUpdating = false;
    }
  },
  { timezone: "Europe/Moscow" }
);
