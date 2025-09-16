import { promises as fs } from "fs";
import dotenv from "dotenv";
import * as fuzzball from "fuzzball";
import { transliterate } from "transliteration";
dotenv.config();

const versionsUrl = "https://ddragon.leagueoflegends.com/api/versions.json";
const language = "ru_RU";
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const REGION = "euw1";

let championData = {
  en: {}, // {id: englishName}
  ru: {}, // {id: russianName}
  idToKey: {}, // {id: championKey}
};

// Функция нормализации имен
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Загрузка данных чемпионов
async function loadChampionData() {
  try {
    const versions = await fetchData(versionsUrl);
    const latestVersion = versions[0];

    const [enData, ruData] = await Promise.all([
      fetchData(
        `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`
      ),
      fetchData(
        `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/ru_RU/champion.json`
      )
    ]);

    championData.en = Object.entries(enData.data).reduce(
      (acc, [key, champ]) => {
        acc[champ.id] = champ.name;
        championData.idToKey[champ.id] = key;
        return acc;
      },
      {}
    );
    championData.ru = Object.entries(ruData.data).reduce(
      (acc, [key, champ]) => {
        acc[champ.id] = champ.name;
        return acc;
      },
      {}
    );

    console.log("Данные чемпионов успешно загружены");
    console.log("TahmKench en:", championData.en["TahmKench"]);
    console.log("TahmKench ru:", championData.ru["TahmKench"]);
  } catch (error) {
    console.error("Ошибка загрузки данных чемпионов:", error);
  }
}

// Новая функция для поиска чемпиона с использованием fuzzball
function findBestChampionMatch(input, championsList) {
  // Транслитерируем входную строку, если она содержит кириллицу
  const isCyrillic = /[а-яА-Я]/.test(input);
  const processedInput = isCyrillic ? transliterate(input) : input;
  const normalizedInput = normalizeName(processedInput);

  const choices = championsList.map((champ) => ({
    id: champ.id,
    en: champ.en,
    ru: champ.ru,
    normalizedEn: normalizeName(champ.en),
    normalizedRu: normalizeName(champ.ru),
  }));

  // Используем fuzzball для поиска лучшего совпадения
  const results = fuzzball.extract(normalizedInput, choices, {
    scorer: fuzzball.token_set_ratio,
    processor: (choice) => `${choice.normalizedEn} ${choice.normalizedRu}`,
    returnObjects: true,
  });

  const bestMatch = results[0];
  // Понижаем порог до 70 для большей гибкости
  if (!bestMatch || bestMatch.score < 70) {
    return null;
  }

  return {
    ...bestMatch.choice,
    similarity: bestMatch.score / 100,
  };
}

// Функция для получения статистики
function getChampionStats(matches, championName) {
  const normalizedChampionName = normalizeName(championName);
  const stats = matches.reduce(
    (acc, { champion, win, rune }) => {
      if (normalizeName(champion) === normalizedChampionName) {
        acc.total++;
        if (win) acc.wins++;
        if (rune) acc.runes[rune] = (acc.runes[rune] || 0) + 1;
      }
      return acc;
    },
    { total: 0, wins: 0, runes: {} }
  );

  if (stats.total === 0) return "Нет данных о матчах на этом чемпионе";

  const winRate = ((stats.wins / stats.total) * 100).toFixed(1);
  const topRunes = Object.entries(stats.runes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([rune, count]) => `${rune} (${count})`)
    .join(", ");
  return `Матчей: ${stats.total}, Winrate: ${winRate}% | Популярные руны: ${
    topRunes || "нет данных"
  }`;
}

async function fetchData(url) {
  try {
    const response = await fetch(url, {
      headers: { "X-Riot-Token": RIOT_API_KEY },
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching data from ${url}:`, error);
    return null;
  }
}

async function getPuuid(nickName, tag) {
  const url = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    nickName
  )}/${tag}`;
  return await fetchData(url);
}

async function getSummonerId(puuid) {
  const url = `https://${REGION}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const data = await fetchData(url);
  return data?.id;
}

async function getAccLp(summonerId) {
  const url = `https://${REGION}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`;
  const data = await fetchData(url);
  if (!data || data.length === 0) return null;
  const info = data[0];
  return `${info.tier} ${info.rank} ${info.leaguePoints}LP W/L:${info.wins}/${info.losses}`;
}

async function getRuneById(idsToFind) {
  const data = await fetchData(versionsUrl);
  if (!data) return null;
  const latestPatch = data[0];
  const runesUrl = `https://ddragon.leagueoflegends.com/cdn/${latestPatch}/data/${language}/runesReforged.json`;
  const runesData = await fetchData(runesUrl);
  if (!runesData) return null;

  const runeById = runesData.reduce((acc, path) => {
    path.slots.forEach((slot) => {
      slot.runes.forEach((rune) => {
        acc[Number(rune.id)] = rune.name;
      });
    });
    return acc;
  }, {});

  return idsToFind
    .map((id) => runeById[id])
    .filter((name) => name !== undefined)
    .join(", ");
}

async function getOnlineRunes(puuid) {
  const url = `https://${REGION}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`;
  const data = await fetchData(url);
  if (!data || !data.participants || data.participants.length === 0) {
    return null;
  }
  const streamer = data.participants.find((player) => player.puuid === puuid);
  if (!streamer) {
    return null;
  }
  return await getRuneById(streamer.perks.perkIds);
}

async function getChallengerPlayers() {
  const url = `https://${REGION}.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5`;
  const data = await fetchData(url);
  return data?.entries || [];
}

async function getGrandmasterPlayers() {
  const url = `https://${REGION}.api.riotgames.com/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5`;
  const data = await fetchData(url);
  return data?.entries || [];
}

async function getLp(players) {
  return players.map((player) => player.leaguePoints);
}

async function getMatchesIds(puuid, count) {
  const url = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
  return await fetchData(url);
}

async function getLastMatchInfo(puuid) {
  const matches = await getMatchesIds(puuid, 1);
  if (!matches || matches.length === 0) return null;
  const matchId = matches[0];
  const url = `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const data = await fetchData(url);
  if (!data) return null;

  const timeEnd = data.info.gameEndTimestamp;
  const playerInfo = data.info.participants.find((obj) => obj.puuid === puuid);
  const {
    riotIdGameName: nickname,
    championName: champion,
    win,
    kills,
    deaths,
    assists,
  } = playerInfo;

  return {
    playerInfo: {
      nickname,
      champion,
      win,
      kills,
      deaths,
      assists,
    },
    timeEnd,
  };
}

async function getChampionAndRuneObj(matchId, puuid) {
  const url = `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const data = await fetchData(url);
  if (!data) return null;

  const playerInfo = data.info.participants.find((obj) => obj.puuid === puuid);
  if (!playerInfo) return null;

  const runesIds = String(playerInfo.perks.styles[0].selections[0].perk);
  const runeName = await getRuneById([runesIds]);

  return {
    champion: playerInfo.championName,
    rune: runeName,
    win: playerInfo.win,
  };
}

async function getTodayMatches(puuid, playerName) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTime = Math.floor(startOfDay.getTime() / 1000);

  const url = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${startTime}`;
  const matchIds = await fetchData(url);

  if (!matchIds || matchIds.length === 0) return null;

  const matches = [];
  for (const matchId of matchIds) {
    const matchUrl = `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    const matchData = await fetchData(matchUrl);
    if (matchData) {
      const playerInfo = matchData.info.participants.find(
        (obj) => obj.puuid === puuid
      );
      if (playerInfo) {
        matches.push({
          champion: playerInfo.championName,
          win: playerInfo.win,
          timestamp: matchData.info.gameCreation,
        });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  matches.sort((a, b) => a.timestamp - b.timestamp);

  return {
    playerName,
    matches,
  };
}

function objToString(obj) {
  if (!obj) {
    return "Чемпион не найден или на чемпионе не сыграно игр в последнее время";
  }
  const winRate = ((obj.wins / obj.totalMatches) * 100).toFixed(2);
  let str = `За чемпиона ${obj.champion} сыграно ${obj.totalMatches} игр (${winRate}% побед). Чаще брали руны: `;
  if (Object.keys(obj.runes).length > 0) {
    str += Object.entries(obj.runes)
      .map(([rune, count]) => `${rune} - ${count} раз`)
      .join(", ");
  } else {
    str += "нет данных о рунах";
  }
  return str;
}

export const modules = {
  // API функции
  getPuuid,
  getOnlineRunes,
  getSummonerId,
  getAccLp,
  getLastMatchInfo,
  getChampionStats,
  getChallengerPlayers,
  getGrandmasterPlayers,
  getLp,
  getTodayMatches,
  getMatchesIds,
  getChampionAndRuneObj,
  getRuneById,

  // Команды
  "!lp": async ({ channel, accounts, client }) => {
    try {
      const results = await Promise.all(
        Object.entries(accounts).map(async ([name, { puuid }]) => {
          const summonerId = await getSummonerId(puuid);
          const accInfo = await getAccLp(summonerId);
          return `${name}: ${accInfo}`;
        })
      );
      client.say(channel, results.join(" | "));
    } catch (error) {
      console.error("Error:", error);
    }
  },

  "!runes": async ({ channel, accounts, client }) => {
    try {
      const results = await Promise.all(
        Object.values(accounts).map(async ({ puuid }) => {
          const runes = await getOnlineRunes(puuid);
          return runes;
        })
      );
      const info = results.filter(Boolean).join(" | ");
      client.say(channel, info || "Руны не найдены");
    } catch (error) {
      console.error("Error:", error);
    }
  },

  "!last": async ({ channel, accounts, client }) => {
    try {
      const puuids = Object.values(accounts).map((acc) => acc.puuid);
      const allMatchesInfo = await Promise.all(puuids.map(getLastMatchInfo));
      const latestObject = allMatchesInfo.reduce((prev, current) =>
        prev.timeEnd > current.timeEnd ? prev : current
      );
      const resultString = `${
        latestObject.playerInfo.win
          ? "DinoDance ПОБЕДА DinoDance"
          : "PoroSad ПРОИГРЫШ PoroSad"
      } ${latestObject.playerInfo.nickname}: Чемпион: ${
        latestObject.playerInfo.champion
      } KDA: ${latestObject.playerInfo.kills}/${
        latestObject.playerInfo.deaths
      }/${latestObject.playerInfo.assists}`;
      client.say(channel, resultString);
    } catch (error) {
      console.error("Error:", error);
    }
  },

  "!champ": async ({ channel, args, client }) => {
    if (!args[0]) {
      return client.say(channel, "Пожалуйста, укажите имя чемпиона.");
    }
    try {
      const inputName = args.join(" ");
      const matchesData = await fs.readFile("./data/matches.json", "utf-8");
      const allMatches = JSON.parse(matchesData);

      // Формируем полный список чемпионов
      const availableChampions = Object.entries(championData.en).map(
        ([id, enName]) => ({
          id,
          en: enName,
          ru: championData.ru[id] || enName,
        })
      );

      // Поиск лучшего совпадения
      const bestMatch = findBestChampionMatch(inputName, availableChampions);

      if (!bestMatch) {
        return client.say(channel, "Чемпион не найден. Проверьте название.");
      }

      // Получение и вывод статистики
      const stats = getChampionStats(allMatches, bestMatch.en);
      client.say(channel, `Статистика по чемпиону ${bestMatch.ru}: ${stats}`);
    } catch (error) {
      console.error("Ошибка в команде !champ:", error);
      client.say(channel, "Произошла ошибка при обработке запроса");
    }
  },

  // Инициализация при старте
  init: async () => {
    await loadChampionData();
  },

  "!lastgm": async ({ channel, client }) => {
    try {
      const grandmasters = await getGrandmasterPlayers();
      const last5grandmasters = grandmasters.slice(-5);
      const lastGrandmastersLp = await getLp(last5grandmasters);
      client.say(
        channel,
        `Список LP последних пяти грандмастеров: ${lastGrandmastersLp.join(
          "LP, "
        )}LP`
      );
    } catch (error) {
      console.error("Error:", error);
    }
  },

  "!lastchal": async ({ channel, client }) => {
    try {
      const challengers = await getChallengerPlayers();
      const last5challengers = challengers.slice(-5);
      const lastChallengersLp = await getLp(last5challengers);
      client.say(
        channel,
        `Список LP последних пяти чаликов: ${lastChallengersLp.join("LP, ")}LP`
      );
    } catch (error) {
      console.error("Error:", error);
    }
  },

  "!opgg": async ({ channel, accounts, client }) => {
    try {
      const summoners = Object.keys(accounts)
        .map((name) => name.replace(/ /g, "+"))
        .join("%2C");
      const opggUrl = `https://www.op.gg/multisearch/euw?summoners=${summoners}`;
      client.say(channel, `Ссылка на opgg: ${opggUrl}`);
    } catch (error) {
      console.error("Error:", error);
    }
  },

  "!today": async ({ channel, accounts, client }) => {
    try {
      const matchPromises = Object.entries(accounts).map(([name, { puuid }]) =>
        getTodayMatches(puuid, name)
      );
      const allMatches = await Promise.all(matchPromises);
      const playersWithMatches = allMatches
        .filter((result) => result && result.matches.length > 0)
        .map(({ playerName, matches }) => {
          const wins = matches.filter((m) => m.win).length;
          const losses = matches.length - wins;
          const matchesStr = matches
            .map((m) => `${m.champion} ${m.win ? "W" : "L"}`)
            .join(", ");
          return {
            name: playerName,
            record: `${wins}W/${losses}L`,
            matches: matchesStr,
          };
        });

      if (playersWithMatches.length === 0) {
        client.say(channel, "Сегодня еще не было матчей");
        return;
      }

      const output = playersWithMatches
        .map((p) => `${p.name} (${p.record}): ${p.matches}`)
        .join(" | ");

      client.say(channel, `Сегодняшние матчи: ${output}`);
    } catch (error) {
      console.error("Error:", error);
    }
  },
};

modules.init();