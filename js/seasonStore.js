import {
  loadPlayers,
  loadGoalies,
  loadRosterBirthDates,
  loadSkaterRealtime,
} from "./api.js";
import {
  addGoalerValueFields,
  addPlayerValueFields,
  addCategoryRanks,
  computeAverageGVI,
  computeRotoValues,
  computeGoalieRotoValues,
  computeTiers,
  SKATER_RANK_CONFIG,
  GOALIE_RANK_CONFIG,
} from "./stats.js";
import {
  getVisibleRotoCategories,
  getVisibleGoalieRotoCategories,
} from "./table.js";

export const seasons = [
  "20262027",
  "20252026",
  "20242025",
  "20232024",
  "20222023",
  "20212022",
];

export const seasonDataPlayer = {};
export const seasonDataGoaler = {};

let storePromise = null;

function computeAge(birthDate, season) {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  if (isNaN(birth)) return 0;
  const start = new Date(Number(season.slice(0, 4)), 9, 1);
  let age = start.getFullYear() - birth.getFullYear();
  const monthDiff = start.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && start.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

async function buildStore() {
  const birthDates = await loadRosterBirthDates();

  const seasonResults = await Promise.all(
    seasons.map(async (s) => {
      const [players, goalies, realtime] = await Promise.all([
        loadPlayers(s),
        loadGoalies(s),
        loadSkaterRealtime(s),
      ]);
      return { s, players, goalies, realtime };
    }),
  );

  for (const { s, players, goalies, realtime } of seasonResults) {
    const realtimeMap = new Map(realtime.map((r) => [r.playerId, r]));
    for (const player of players) {
      const rt = realtimeMap.get(player.ID);
      if (rt) {
        player.BLK = rt.blockedShots ?? 0;
        player.HITS = rt.hits ?? 0;
      }
      player.Age = computeAge(birthDates.get(player.ID), s);
    }
    for (const goalie of goalies) {
      goalie.Age = computeAge(birthDates.get(goalie.ID), s);
    }

    addPlayerValueFields(players, getVisibleRotoCategories());
    addGoalerValueFields(goalies, getVisibleGoalieRotoCategories());
    addCategoryRanks(players, SKATER_RANK_CONFIG);
    addCategoryRanks(goalies, GOALIE_RANK_CONFIG);

    seasonDataPlayer[s] = players;
    seasonDataGoaler[s] = goalies;
  }

  recomputeValueIndexes();
  recomputeRotoValues();
  computeAllTiers();

  return { seasons, seasonDataPlayer, seasonDataGoaler };
}

export function loadSeasonStore() {
  if (!storePromise) storePromise = buildStore();
  return storePromise;
}

// Convenience for pages that open player cards: resolves the shared store and
// returns the exact shape the card context expects.
export async function loadSeasonStoreContext(
  currentSeason = () => seasons[0],
) {
  await loadSeasonStore();
  return { seasons, seasonDataPlayer, seasonDataGoaler, currentSeason };
}

export function recomputeValueIndexes() {
  const skaterCats = getVisibleRotoCategories();
  const goalieCats = getVisibleGoalieRotoCategories();
  for (const s of seasons) {
    addPlayerValueFields(seasonDataPlayer[s], skaterCats);
    addGoalerValueFields(seasonDataGoaler[s], goalieCats);
  }
  const skaters = computeAverageGVI(seasonDataPlayer);
  const goalies = computeAverageGVI(seasonDataGoaler);
  for (const s of seasons) {
    for (const player of seasonDataPlayer[s]) {
      player.AGVI = skaters.avgMap.get(player.Joueurs) || 0;
      player.Trend = skaters.trendMap.get(player.Joueurs) || 0;
      player.Stab = skaters.stabMap.get(player.Joueurs) || 0;
    }
    for (const goalie of seasonDataGoaler[s]) {
      goalie.AGVI = goalies.avgMap.get(goalie.Gardiens) || 0;
      goalie.Trend = goalies.trendMap.get(goalie.Gardiens) || 0;
      goalie.Stab = goalies.stabMap.get(goalie.Gardiens) || 0;
    }
  }
}

export function recomputeRotoValues() {
  for (const s of seasons) {
    computeRotoValues(seasonDataPlayer[s], getVisibleRotoCategories());
    computeGoalieRotoValues(
      seasonDataGoaler[s],
      getVisibleGoalieRotoCategories(),
    );
  }
}

export function computeAllTiers() {
  for (const s of seasons) {
    computeTiers(seasonDataPlayer[s], seasonDataGoaler[s]);
  }
}
