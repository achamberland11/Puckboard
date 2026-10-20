// Shared league context for player cards.
//
// The stats table (app.js) already holds the loaded season data, while other
// pages (game preview, home, games) load it lazily on demand. Keeping the
// binding here lets playerCard.js stay independent of app.js and avoids the
// heavy import-time pipeline that lived in app.js.

export let seasons = [];
export let seasonDataPlayer = {};
export let seasonDataGoaler = {};

let currentSeasonFn = () => null;
let contextReady = false;
let contextLoader = null;
let loadPromise = null;

export function getCurrentSeason() {
  return currentSeasonFn();
}

export function setPlayerCardContext(ctx = {}) {
  if (Array.isArray(ctx.seasons)) seasons = ctx.seasons;
  if (ctx.seasonDataPlayer) seasonDataPlayer = ctx.seasonDataPlayer;
  if (ctx.seasonDataGoaler) seasonDataGoaler = ctx.seasonDataGoaler;
  if (typeof ctx.currentSeason === "function") {
    currentSeasonFn = ctx.currentSeason;
  } else if (ctx.currentSeason != null) {
    const value = ctx.currentSeason;
    currentSeasonFn = () => value;
  }
  contextReady = true;
}

// Lazy fallback: pages that don't load the league data up front (home, games)
// register a loader so the first card open pays the cost instead of page load.
export function setPlayerCardContextLoader(loader) {
  contextLoader = loader;
  loadPromise = null;
}

export async function ensureCardContext() {
  if (contextReady) return;
  if (!contextLoader) {
    contextReady = true;
    return;
  }
  if (!loadPromise) {
    loadPromise = Promise.resolve()
      .then(() => contextLoader())
      .then((ctx) => {
        if (ctx) setPlayerCardContext(ctx);
      })
      .catch((err) => {
        console.error("Failed to load player card data:", err);
      })
      .finally(() => {
        contextReady = true;
      });
  }
  await loadPromise;
}
