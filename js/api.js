import { storageGet, storageSet, removeCacheKeys } from "./storage.js";

const CACHE_KEY = "nhl_stats_cache";
const CACHE_TTL = 60 * 60 * 1000 * 24;
const ROSTER_TTL = CACHE_TTL * 7;
const SHORT_TTL = 5 * 60 * 1000;
const MEDIUM_TTL = 60 * 60 * 1000;

const TEAMS = [
  "ANA",
  "BOS",
  "BUF",
  "CAR",
  "CBJ",
  "CGY",
  "CHI",
  "COL",
  "DAL",
  "DET",
  "EDM",
  "FLA",
  "LAK",
  "MIN",
  "MTL",
  "NJD",
  "NSH",
  "NYI",
  "NYR",
  "OTT",
  "PHI",
  "PIT",
  "SEA",
  "SJS",
  "STL",
  "TBL",
  "TOR",
  "UTA",
  "VAN",
  "VGK",
  "WPG",
  "WSH",
];

const TEAM_SLUGS = {
  ANA: "anaheim-ducks",
  BOS: "boston-bruins",
  BUF: "buffalo-sabres",
  CAR: "carolina-hurricanes",
  CBJ: "columbus-blue-jackets",
  CGY: "calgary-flames",
  CHI: "chicago-blackhawks",
  COL: "colorado-avalanche",
  DAL: "dallas-stars",
  DET: "detroit-red-wings",
  EDM: "edmonton-oilers",
  FLA: "florida-panthers",
  LAK: "los-angeles-kings",
  MIN: "minnesota-wild",
  MTL: "montreal-canadiens",
  NJD: "new-jersey-devils",
  NSH: "nashville-predators",
  NYI: "new-york-islanders",
  NYR: "new-york-rangers",
  OTT: "ottawa-senators",
  PHI: "philadelphia-flyers",
  PIT: "pittsburgh-penguins",
  SEA: "seattle-kraken",
  SJS: "san-jose-sharks",
  STL: "st-louis-blues",
  TBL: "tampa-bay-lightning",
  TOR: "toronto-maple-leafs",
  UTA: "utah-hockey-club",
  VAN: "vancouver-canucks",
  VGK: "vegas-golden-knights",
  WPG: "winnipeg-jets",
  WSH: "washington-capitals",
};

async function fetchWithCache(url, cacheKey, ttl = CACHE_TTL) {
  let cached = null;
  try {
    cached = await storageGet(cacheKey);
  } catch (err) {
    console.error("Cache read failed:", cacheKey, err);
  }
  if (cached && typeof cached === "object" && cached.data != null) {
    if (Date.now() - cached.timestamp < (cached.ttl || ttl)) {
      return cached.data;
    }
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  const result = "data" in json ? json.data : json;

  try {
    await storageSet(cacheKey, {
      data: result,
      timestamp: Date.now(),
      ttl,
    });
  } catch (err) {
    console.error("Cache write failed:", cacheKey, err);
  }

  return result;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (c === "\r") {
      // skip, handled by \n
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function findCol(headers, candidates) {
  for (const c of candidates) {
    const i = headers.indexOf(c);
    if (i !== -1) return i;
  }
  return -1;
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatTOI(seconds) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function loadPlayers(season) {
  try {
    const url = `/api/stats/rest/en/skater/summary?limit=-1&sort=points&dir=desc&cayenneExp=seasonId=${season}%20and%20gameTypeId=2`;
    const data = await fetchWithCache(url, CACHE_KEY + "_skaters_" + season);

    return data.map((p) => ({
      Joueurs: p.skaterFullName,
      Team: p.teamAbbrevs,
      Position: [p.positionCode],
      GP: p.gamesPlayed,
      G: p.goals,
      A: p.assists,
      P: p.points,
      "+/-": p.plusMinus,
      PPP: p.ppPoints,
      S: p.shots,
      BLK: 0,
      HITS: 0,
      TOI: formatTOI(p.timeOnIcePerGame),
      ID: p.playerId,
    }));
  } catch (err) {
    console.error("Failed to load players.json:", err);
    return [];
  }
}

async function loadGoalies(season) {
  try {
    const url = `/api/stats/rest/en/goalie/summary?limit=-1&sort=wins&dir=desc&cayenneExp=seasonId=${season}%20and%20gameTypeId=2`;
    const data = await fetchWithCache(url, CACHE_KEY + "_goalies_" + season);

    return data.map((p) => ({
      Gardiens: p.goalieFullName,
      Team: p.teamAbbrevs,
      GP: p.gamesPlayed,
      W: p.wins,
      "SV%": p.savePct,
      GAA: p.goalsAgainstAverage,
      SA: p.shotsAgainst,
      ID: p.playerId,
    }));
  } catch (err) {
    console.error("Failed to load goalies.json:", err);
    return [];
  }
}

async function loadPlayerLanding(playerId) {
  try {
    const url = `/api-web/v1/player/${playerId}/landing`;
    return await fetchWithCache(url, CACHE_KEY + "_landing_" + playerId);
  } catch (err) {
    console.error("Failed to load player landing:", err);
    return null;
  }
}

async function loadSkaterRealtime(season) {
  try {
    const url = `/api/stats/rest/en/skater/realtime?limit=-1&sort=hits&dir=desc&cayenneExp=seasonId=${season}%20and%20gameTypeId=2`;
    return await fetchWithCache(url, CACHE_KEY + "_skater_realtime_" + season);
  } catch (err) {
    console.error("Failed to load skater realtime:", err);
    return [];
  }
}

async function loadGameLog(playerId, season) {
  try {
    const url = `/api-web/v1/player/${playerId}/game-log/${season}/2`;
    return await fetchWithCache(
      url,
      CACHE_KEY + "_gamelog_" + season + "_" + playerId,
    );
  } catch (err) {
    console.error("Failed to load game log:", err);
    return null;
  }
}

async function loadRosterBirthDates() {
  const results = await Promise.all(
    TEAMS.map(async (team) => {
      try {
        const url = `/api-web/v1/roster/${team}/current`;
        const data = await fetchWithCache(
          url,
          CACHE_KEY + "_roster_" + team,
          ROSTER_TTL,
        );
        const groups = [data.forwards, data.defensemen, data.goalies].filter(
          Boolean,
        );
        return groups.flat().map((p) => [p.id, p.birthDate]);
      } catch (err) {
        console.error("Failed to load roster:", team, err);
        return [];
      }
    }),
  );

  const birthDates = new Map();
  for (const pairs of results) {
    for (const [id, date] of pairs) {
      if (date) birthDates.set(id, date);
    }
  }
  return birthDates;
}

////// Advanced / luck-check sources (player card only, display-only)

async function loadSkaterAdvanced(season) {
  // Official NHL stats reports: shooting luck, possession, play-driving splits.
  // Same host/proxy as the rest of the app (/api/ -> api.nhle.com).
  try {
    const exp = `cayenneExp=seasonId=${season}%20and%20gameTypeId=2`;
    const [scoring, pct, pp] = await Promise.all([
      fetchWithCache(
        `/api/stats/rest/en/skater/scoringRates?limit=-1&${exp}`,
        CACHE_KEY + "_adv_scoring_" + season,
      ),
      fetchWithCache(
        `/api/stats/rest/en/skater/percentages?limit=-1&${exp}`,
        CACHE_KEY + "_adv_pct_" + season,
      ),
      fetchWithCache(
        `/api/stats/rest/en/skater/powerplay?limit=-1&${exp}`,
        CACHE_KEY + "_adv_pp_" + season,
      ),
    ]);
    const byId = new Map();
    for (const r of scoring || []) byId.set(r.playerId, { scoring: r });
    for (const r of pct || []) {
      if (!byId.has(r.playerId)) byId.set(r.playerId, {});
      byId.get(r.playerId).pct = r;
    }
    for (const r of pp || []) {
      if (!byId.has(r.playerId)) byId.set(r.playerId, {});
      byId.get(r.playerId).pp = r;
    }
    return byId;
  } catch (err) {
    console.error("Failed to load skater advanced stats:", err);
    return new Map();
  }
}

function trimMoneyPuckSkater(headers, cells) {
  const pick = (cands) => {
    const i = findCol(headers, cands);
    return i === -1 ? null : numOrNull(cells[i]);
  };
  const idIdx = findCol(headers, ["playerid", "player_id", "id"]);
  const sitIdx = findCol(headers, ["situation"]);
  return {
    id: idIdx === -1 ? null : numOrNull(cells[idIdx]),
    situation: sitIdx === -1 ? "" : String(cells[sitIdx] || "").toLowerCase(),
    gp: pick(["games_played", "gamesplayed", "games"]),
    toi: pick(["icetime", "timeonice", "toi"]),
    g: pick(["i_f_goals"]),
    xg: pick(["i_f_xgoals", "i_f_scorevenueadjustedxgoals"]),
    pts: pick(["i_f_points"]),
    a1: pick(["i_f_primaryassists"]),
    a2: pick(["i_f_secondaryassists"]),
    sog: pick(["i_f_shotsonGoal".toLowerCase(), "i_f_shotsongoal"]),
    onIceG: pick(["onice_f_goals"]),
    xgPct: pick(["onice_xgoalspercentage", "onice_xgoals_percent", "onice_xg_pct"]),
    offXgPct: pick(["office_xgoalspercentage", "office_xgoals_percent", "office_xg_pct"]),
    hds: pick(["i_f_highdangershots"]),
    hdxg: pick(["i_f_highdangerxgoals"]),
  };
}

function trimMoneyPuckGoalie(headers, cells) {
  const pick = (cands) => {
    const i = findCol(headers, cands);
    return i === -1 ? null : numOrNull(cells[i]);
  };
  const idIdx = findCol(headers, ["playerid", "player_id", "id"]);
  const sitIdx = findCol(headers, ["situation"]);
  const goals = pick(["goals", "goalsagainst", "goals_against"]);
  const shots = pick([
    "shots",
    "shotsagainst",
    "shots_against",
    "shotsonGoal".toLowerCase(),
    "shotsongoal",
    "ongoal",
    "xongoal",
  ]);
  let savePct = pick([
    "savepct",
    "savepercentage",
    "svpct",
    "save_pct",
    "savepct5v5",
  ]);
  if (savePct == null && shots != null && goals != null && shots > 0) {
    savePct = (shots - goals) / shots;
  }
  return {
    id: idIdx === -1 ? null : numOrNull(cells[idIdx]),
    situation: sitIdx === -1 ? "" : String(cells[sitIdx] || "").toLowerCase(),
    gp: pick(["games_played", "gamesplayed", "games"]),
    toi: pick(["icetime", "timeonice", "toi"]),
    goals,
    xGoals: pick(["xgoals", "expectedgoals", "xg", "expected_goals", "xgoal"]),
    shots,
    savePct,
  };
}

function indexMoneyPuckBySit(records) {
  // records: [{id, situation: '5on5'|'all'|..., ...}]
  const byId = {};
  for (const r of records) {
    if (r.id == null) continue;
    if (!byId[r.id]) byId[r.id] = {};
    const sit = r.situation || "";
    if (sit === "5on5") byId[r.id].ev = r;
    else if (sit === "all") byId[r.id].all = r;
  }
  // Fallback: if a situation is missing, reuse the other one.
  for (const id of Object.keys(byId)) {
    const e = byId[id];
    if (!e.ev && e.all) e.ev = e.all;
    if (!e.all && e.ev) e.all = e.ev;
  }
  return byId;
}

async function fetchMoneyPuckCSV(season, kind) {
  // MoneyPuck season key is the starting year: 20262027 -> 2026.
  const year = String(season).slice(0, 4);
  const paths = [
    `playerData/seasonSummary/${year}/regular/${kind}.csv`,
    `playerData/seasonSummary/${year}_${kind}.csv`,
  ];
  let lastErr = null;
  for (const p of paths) {
    const ctrl = new AbortController();
    // Multi-MB files through the dev proxy: generous timeout, but a hung
    // connection must never block the section forever.
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const response = await fetch(`/moneypuck/${p}`, {
        signal: ctrl.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("MoneyPuck fetch failed");
}

async function loadMoneyPuckIndexed(season, kind, trim) {
  // Cache the trimmed per-player index (small) rather than the raw CSV text,
  // so repeat card opens skip both the download and the parse.
  const key = CACHE_KEY + "_mpidx2_" + kind + "_" + season;
  try {
    const cached = await storageGet(key);
    if (
      cached &&
      typeof cached === "object" &&
      cached.data != null &&
      Date.now() - cached.timestamp < (cached.ttl || CACHE_TTL)
    ) {
      return cached.data;
    }
  } catch (err) {
    console.error("Cache read failed:", key, err);
  }
  const text = await fetchMoneyPuckCSV(season, kind);
  const rows = parseCSV(text);
  if (rows.length < 2) return {};
  const headers = rows[0].map((h) => String(h).trim().toLowerCase());
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = trim(headers, rows[i]);
    if (r.id != null) records.push(r);
  }
  const indexed = indexMoneyPuckBySit(records);
  try {
    await storageSet(key, { data: indexed, timestamp: Date.now(), ttl: CACHE_TTL });
  } catch (err) {
    console.error("Cache write failed:", key, err);
  }
  return indexed;
}

async function loadMoneyPuckSkaters(season) {
  try {
    return await loadMoneyPuckIndexed(season, "skaters", trimMoneyPuckSkater);
  } catch (err) {
    console.error("Failed to load MoneyPuck skaters:", err);
    return {};
  }
}

async function loadMoneyPuckGoalies(season) {
  try {
    return await loadMoneyPuckIndexed(season, "goalies", trimMoneyPuckGoalie);
  } catch (err) {
    console.error("Failed to load MoneyPuck goalies:", err);
    return {};
  }
}

function trimMoneyPuckGame(headers, cells) {
  const pick = (cands) => {
    const i = findCol(headers, cands);
    return i === -1 ? null : numOrNull(cells[i]);
  };
  const get = (cands) => {
    const i = findCol(headers, cands);
    return i === -1 ? "" : String(cells[i] ?? "");
  };
  return {
    date: get(["gamedate", "game_date", "date"]),
    situation: get(["situation"]).toLowerCase(),
    // Skater files use I_F_* columns, goalie files use bare xGoals/goals.
    xg: pick(["i_f_xgoals", "i_f_scorevenueadjustedxgoals", "xgoals"]),
    g: pick(["i_f_goals", "goals"]),
  };
}

async function loadMoneyPuckGameLog(playerId, season) {
  // Per-game xG for the Last-5 table: one small (~250KB) per-player file.
  // Returns { byDate: { YYYYMMDD: { all, ev } } } or null when unavailable.
  const key = CACHE_KEY + "_mpgamelog_" + season + "_" + playerId;
  try {
    const cached = await storageGet(key);
    if (
      cached &&
      typeof cached === "object" &&
      cached.data !== undefined &&
      Date.now() - cached.timestamp < (cached.ttl || CACHE_TTL)
    ) {
      return cached.data;
    }
  } catch (err) {
    console.error("Cache read failed:", key, err);
  }
  try {
    const year = String(season).slice(0, 4);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    let text;
    try {
      const response = await fetch(
        `/moneypuck/playerData/playerGameByGame/${year}/regular/${playerId}.csv`,
        { signal: ctrl.signal },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      text = await response.text();
    } finally {
      clearTimeout(timer);
    }
    const rows = parseCSV(text);
    if (rows.length < 2) return null;
    const headers = rows[0].map((h) => String(h).trim().toLowerCase());
    const byDate = {};
    for (let i = 1; i < rows.length; i++) {
      const r = trimMoneyPuckGame(headers, rows[i]);
      if (!r.date) continue;
      if (!byDate[r.date]) byDate[r.date] = {};
      if (r.situation === "5on5") byDate[r.date].ev = r;
      else if (r.situation === "all") byDate[r.date].all = r;
    }
    const result = { byDate };
    try {
      await storageSet(key, {
        data: result,
        timestamp: Date.now(),
        ttl: CACHE_TTL,
      });
    } catch (err) {
      console.error("Cache write failed:", key, err);
    }
    return result;
  } catch (err) {
    console.error("Failed to load MoneyPuck game log:", err);
    return null;
  }
}

async function loadEdgeGoalieDetail(playerId, season) {  try {
    const url = `/api-web/v1/edge/goalie-detail/${playerId}/${season}/2`;
    return await fetchWithCache(
      url,
      CACHE_KEY + "_edge_goalie_" + season + "_" + playerId,
    );
  } catch (err) {
    console.error("Failed to load Edge goalie detail:", err);
    return null;
  }
}

////// Games / schedule / league (home + games + game preview pages)

function estDateISO(date = new Date()) {
  // en-CA locale yields YYYY-MM-DD; the timezone keeps the date in EST/EDT
  // so "today" does not roll over at UTC midnight.
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function loadSchedule(dateStr) {
  // dateStr: YYYY-MM-DD. The API returns a week (gameWeek); pick the day.
  try {
    const url = `/api-web/v1/schedule/${dateStr}`;
    const data = await fetchWithCache(
      url,
      CACHE_KEY + "_schedule_" + dateStr,
      SHORT_TTL,
    );
    const day = (data.gameWeek || []).find((w) => w.date === dateStr);
    return {
      date: dateStr,
      games: (day && day.games) || data.games || [],
    };
  } catch (err) {
    console.error("Failed to load schedule:", err);
    return { date: dateStr, games: [] };
  }
}

async function loadStandings() {
  try {
    const data = await fetchWithCache(
      "/api-web/v1/standings/now",
      CACHE_KEY + "_standings",
      MEDIUM_TTL,
    );
    return data.standings || [];
  } catch (err) {
    console.error("Failed to load standings:", err);
    return [];
  }
}

async function loadSkaterLeaders(categories, limit = 10) {
  try {
    const url = `/api-web/v1/skater-stats-leaders/current?categories=${categories}&limit=${limit}`;
    return await fetchWithCache(
      url,
      CACHE_KEY + "_skater_leaders_" + categories + "_" + limit,
      SHORT_TTL,
    );
  } catch (err) {
    console.error("Failed to load skater leaders:", err);
    return {};
  }
}

async function loadGoalieLeaders(categories, limit = 10) {
  try {
    const url = `/api-web/v1/goalie-stats-leaders/current?categories=${categories}&limit=${limit}`;
    return await fetchWithCache(
      url,
      CACHE_KEY + "_goalie_leaders_" + categories + "_" + limit,
      SHORT_TTL,
    );
  } catch (err) {
    console.error("Failed to load goalie leaders:", err);
    return {};
  }
}

async function loadTeamSummary(season) {
  try {
    const url = `/api/stats/rest/en/team/summary?limit=-1&sort=points&dir=desc&cayenneExp=seasonId=${season}%20and%20gameTypeId=2`;
    return await fetchWithCache(
      url,
      CACHE_KEY + "_team_summary_" + season,
      MEDIUM_TTL,
    );
  } catch (err) {
    console.error("Failed to load team summary:", err);
    return [];
  }
}

async function loadTeamPowerPlay(season) {
  try {
    const url = `/api/stats/rest/en/team/powerplay?limit=-1&cayenneExp=seasonId=${season}%20and%20gameTypeId=2`;
    return await fetchWithCache(
      url,
      CACHE_KEY + "_team_pp_" + season,
      MEDIUM_TTL,
    );
  } catch (err) {
    console.error("Failed to load team power play:", err);
    return [];
  }
}

async function loadTeamPenaltyKill(season) {
  try {
    const url = `/api/stats/rest/en/team/penaltykill?limit=-1&cayenneExp=seasonId=${season}%20and%20gameTypeId=2`;
    return await fetchWithCache(
      url,
      CACHE_KEY + "_team_pk_" + season,
      MEDIUM_TTL,
    );
  } catch (err) {
    console.error("Failed to load team penalty kill:", err);
    return [];
  }
}

async function loadGameLanding(gameId) {
  try {
    const url = `/api-web/v1/gamecenter/${gameId}/landing`;
    return await fetchWithCache(
      url,
      CACHE_KEY + "_game_landing_" + gameId,
      SHORT_TTL,
    );
  } catch (err) {
    console.error("Failed to load game landing:", err);
    return null;
  }
}

async function loadClubSchedule(team) {
  try {
    const url = `/api-web/v1/club-schedule-season/${team}/now`;
    return await fetchWithCache(
      url,
      CACHE_KEY + "_club_sched_" + team,
      MEDIUM_TTL,
    );
  } catch (err) {
    console.error("Failed to load club schedule:", team, err);
    return null;
  }
}

async function loadDepthCharts() {
  try {
    return await fetchWithCache(
      "/nbihockey/data/depth-charts.json",
      CACHE_KEY + "_depth_charts",
      SHORT_TTL,
    );
  } catch (err) {
    console.error("Failed to load depth charts:", err);
    return null;
  }
}

export {
  CACHE_KEY,
  fetchWithCache,
  estDateISO,
  shiftDate,
  loadSchedule,
  loadStandings,
  loadSkaterLeaders,
  loadGoalieLeaders,
  loadTeamSummary,
  loadTeamPowerPlay,
  loadTeamPenaltyKill,
  loadGameLanding,
  loadClubSchedule,
  loadPlayers,
  loadGoalies,
  loadGameLog,
  loadPlayerLanding,
  loadRosterBirthDates,
  loadSkaterRealtime,
  loadSkaterAdvanced,
  loadMoneyPuckSkaters,
  loadMoneyPuckGoalies,
  loadMoneyPuckGameLog,
  loadEdgeGoalieDetail,
  loadDepthCharts,
  removeCacheKeys,
  TEAM_SLUGS,
};
