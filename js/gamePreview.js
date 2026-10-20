import {
  loadGameLanding,
  loadTeamSummary,
  loadClubSchedule,
  loadGameLog,
  loadPlayerLanding,
  loadMoneyPuckSkaters,
  loadMoneyPuckGoalies,
  TEAM_SLUGS,
} from "./api.js";
import { openPlayerCard } from "./playerCard.js";
import {
  setPlayerCardContext,
  setPlayerCardContextLoader,
} from "./playerCardContext.js";
import {
  loadSeasonStoreContext,
  seasons,
  seasonDataPlayer,
  seasonDataGoaler,
} from "./seasonStore.js";
import { tierBadgeEl } from "./tierBadge.js";
import { seasonAdvCells, seasonGoalieCells } from "./sustainability.js";

const root = document.getElementById("gameRoot");
const gameId = new URLSearchParams(window.location.search).get("id");
let gameSeason = null;

const FINAL_STATES = new Set(["OFF", "FINAL"]);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSeason(season) {
  const s = String(season || "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(6, 8)}` : s;
}

function num(value, digits = 2) {
  return value == null ? "—" : Number(value).toFixed(digits);
}

function formatESTDate(dateStr, startTimeUTC) {
  const iso = startTimeUTC || (dateStr ? `${dateStr}T12:00:00Z` : null);
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatESTTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stateLabel(gameState) {
  switch (gameState) {
    case "FUT":
      return "Upcoming";
    case "PRE":
      return "Pre-game";
    case "LIVE":
    case "CRIT":
      return "Live";
    case "OFF":
    case "FINAL":
      return "Final";
    default:
      return gameState || "";
  }
}

function teamName(team) {
  const place = team.placeName?.default || "";
  const common = team.commonName?.default || "";
  return `${place} ${common}`.trim() || team.abbrev;
}

function section(title, note) {
  const wrap = el("section", "section");
  const head = el("h2", "section-title");
  head.appendChild(document.createTextNode(title));
  if (note) head.appendChild(el("span", "muted", note));
  wrap.appendChild(head);
  return wrap;
}

function dataTable(headers, rows, className = "") {
  const table = el("table", `mini-table ${className}`.trim());
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of headers) headRow.appendChild(el("th", null, h));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      if (cell instanceof Node) tr.appendChild(cell);
      else tr.appendChild(el("td", null, cell == null ? "—" : String(cell)));
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// --- Header ---------------------------------------------------------------

function renderHeader(landing, awayRecord, homeRecord) {
  const card = el("section", "game-header card");
  const away = landing.awayTeam;
  const home = landing.homeTeam;

  const state = el("div", "game-header-state");
  const label = stateLabel(landing.gameState);
  if (landing.gameState === "LIVE" || landing.gameState === "CRIT") {
    state.appendChild(el("span", "badge live", label));
  } else {
    state.appendChild(el("span", "badge", label));
  }
  const timeText =
    landing.gameState === "FUT" || landing.gameState === "PRE"
      ? ` · ${formatESTTime(landing.startTimeUTC)} ET`
      : "";
  state.appendChild(
    document.createTextNode(
      `${timeText} · ${formatESTDate(landing.gameDate, landing.startTimeUTC)}`,
    ),
  );
  card.appendChild(state);

  const teams = el("div", "game-header-teams");
  const buildSide = (team, record, suffix) => {
    const side = el("div", `game-header-team ${suffix}`);
    const logo = document.createElement("img");
    logo.className = "game-header-logo";
    logo.src = team.logo;
    logo.alt = team.abbrev;
    side.appendChild(logo);
    const info = el("div", "game-header-info");
    info.appendChild(el("div", "game-header-name", teamName(team)));
    if (record) info.appendChild(el("div", "game-header-record", record));
    if (team.score != null) {
      info.appendChild(el("div", "game-header-score", String(team.score)));
    }
    side.appendChild(info);
    return side;
  };
  teams.appendChild(buildSide(away, awayRecord, "away"));
  teams.appendChild(el("div", "game-header-at", "@"));
  teams.appendChild(buildSide(home, homeRecord, "home"));
  card.appendChild(teams);

  const sub = el("div", "game-header-sub");
  const venue = landing.venue?.default;
  const parts = [];
  if (venue) parts.push(venue);
  if (landing.venueLocation?.default) parts.push(landing.venueLocation.default);
  const networks = [
    ...new Set((landing.tvBroadcasts || []).map((t) => t.network).filter(Boolean)),
  ];
  if (networks.length) parts.push(networks.join(", "));
  sub.textContent = parts.join(" · ");
  card.appendChild(sub);

  return card;
}

// --- Team comparison ------------------------------------------------------

const COMPARE_ROWS = [
  { label: "Record", raw: null, text: (s) => `${s.wins}-${s.losses}-${s.otLosses}` },
  { label: "Points", raw: (s) => s.points, fmt: (v) => v, better: "high" },
  {
    label: "Points %",
    raw: (s) => s.pointPct,
    fmt: (v) => v.toFixed(3).replace(/^0/, ""),
    better: "high",
  },
  {
    label: "Goals for / game",
    raw: (s) => s.goalsForPerGame,
    fmt: (v) => num(v),
    better: "high",
  },
  {
    label: "Goals against / game",
    raw: (s) => s.goalsAgainstPerGame,
    fmt: (v) => num(v),
    better: "low",
  },
  {
    label: "Shots for / game",
    raw: (s) => s.shotsForPerGame,
    fmt: (v) => num(v, 1),
    better: "high",
  },
  {
    label: "Shots allowed / game",
    raw: (s) => s.shotsAgainstPerGame,
    fmt: (v) => num(v, 1),
    better: "low",
  },
  {
    label: "Power play",
    raw: (s) => s.powerPlayPct,
    fmt: (v) => pct(v),
    better: "high",
  },
  {
    label: "Penalty kill",
    raw: (s) => s.penaltyKillPct,
    fmt: (v) => pct(v),
    better: "high",
  },
  {
    label: "Faceoff %",
    raw: (s) => s.faceoffWinPct,
    fmt: (v) => pct(v),
    better: "high",
  },
  {
    label: "Shutouts",
    raw: (s) => s.teamShutouts,
    fmt: (v) => v,
    better: "high",
  },
];

function compareTable(away, home, awayAbbrev, homeAbbrev) {
  const table = el("table", "mini-table compare-table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(el("th", "compare-away", awayAbbrev));
  headRow.appendChild(el("th", "compare-metric", ""));
  headRow.appendChild(el("th", "compare-home", homeAbbrev));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const def of COMPARE_ROWS) {
    const tr = document.createElement("tr");
    const awayVal = def.raw ? def.raw(away) : null;
    const homeVal = def.raw ? def.raw(home) : null;
    const awayText = def.text ? def.text(away) : def.fmt(awayVal);
    const homeText = def.text ? def.text(home) : def.fmt(homeVal);

    let edge = null;
    if (def.better && awayVal != null && homeVal != null && awayVal !== homeVal) {
      const awayBetter = def.better === "high" ? awayVal > homeVal : awayVal < homeVal;
      edge = awayBetter ? "away" : "home";
    }

    const awayTd = el("td", `compare-away${edge === "away" ? " edge" : ""}`, String(awayText));
    const homeTd = el("td", `compare-home${edge === "home" ? " edge" : ""}`, String(homeText));
    tr.appendChild(awayTd);
    tr.appendChild(el("td", "compare-metric", def.label));
    tr.appendChild(homeTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// --- Matchup edges --------------------------------------------------------

function buildEdges(away, home, awayAbbrev, homeAbbrev, awayGoalie, homeGoalie) {
  const edges = [];

  const awayPpVsPk = away.powerPlayPct - (1 - home.penaltyKillPct);
  const homePpVsPk = home.powerPlayPct - (1 - away.penaltyKillPct);

  edges.push({
    label: "Power play vs penalty kill",
    away: `${awayAbbrev} ${pct(away.powerPlayPct)} vs ${homeAbbrev} PK ${pct(home.penaltyKillPct)}`,
    home: `${homeAbbrev} ${pct(home.powerPlayPct)} vs ${awayAbbrev} PK ${pct(away.penaltyKillPct)}`,
    edge:
      Math.abs(awayPpVsPk - homePpVsPk) < 0.005
        ? null
        : awayPpVsPk > homePpVsPk
          ? "away"
          : "home",
  });

  const shotDiff = away.shotsForPerGame - home.shotsAgainstPerGame;
  const shotDiffHome = home.shotsForPerGame - away.shotsAgainstPerGame;
  edges.push({
    label: "Shot volume matchup",
    away: `${num(away.shotsForPerGame, 1)} SF vs ${num(home.shotsAgainstPerGame, 1)} SA`,
    home: `${num(home.shotsForPerGame, 1)} SF vs ${num(away.shotsAgainstPerGame, 1)} SA`,
    edge:
      Math.abs(shotDiff - shotDiffHome) < 0.1
        ? null
        : shotDiff > shotDiffHome
          ? "away"
          : "home",
  });

  const goalDiff = away.goalsForPerGame - home.goalsAgainstPerGame;
  const goalDiffHome = home.goalsForPerGame - away.goalsAgainstPerGame;
  edges.push({
    label: "Goals for vs goals against",
    away: `${num(away.goalsForPerGame)} GF vs ${num(home.goalsAgainstPerGame)} GA`,
    home: `${num(home.goalsForPerGame)} GF vs ${num(away.goalsAgainstPerGame)} GA`,
    edge:
      Math.abs(goalDiff - goalDiffHome) < 0.05
        ? null
        : goalDiff > goalDiffHome
          ? "away"
          : "home",
  });

  if (awayGoalie && homeGoalie) {
    edges.push({
      label: "Projected goalies (SV%)",
      away: `${awayGoalie.name.default} ${pct(awayGoalie.savePctg)}`,
      home: `${homeGoalie.name.default} ${pct(homeGoalie.savePctg)}`,
      edge:
        Math.abs(awayGoalie.savePctg - homeGoalie.savePctg) < 0.002
          ? null
          : awayGoalie.savePctg > homeGoalie.savePctg
            ? "away"
            : "home",
    });
  }

  edges.push({
    label: "Faceoffs",
    away: `${awayAbbrev} ${pct(away.faceoffWinPct)}`,
    home: `${homeAbbrev} ${pct(home.faceoffWinPct)}`,
    edge:
      Math.abs(away.faceoffWinPct - home.faceoffWinPct) < 0.005
        ? null
        : away.faceoffWinPct > home.faceoffWinPct
          ? "away"
          : "home",
  });

  return edges;
}

function renderEdges(edges, awayAbbrev, homeAbbrev) {
  const wrap = section("Matchup edges", "who has the advantage today");
  const card = el("div", "card edges-card");
  for (const edge of edges) {
    const row = el("div", "edge-row");
    const away = el(
      "div",
      `edge-side away${edge.edge === "away" ? " advantage" : ""}`,
      edge.away,
    );
    const label = el("div", "edge-label", edge.label);
    const home = el(
      "div",
      `edge-side home${edge.edge === "home" ? " advantage" : ""}`,
      edge.home,
    );
    row.appendChild(away);
    row.appendChild(label);
    row.appendChild(home);
    card.appendChild(row);
  }
  wrap.appendChild(card);
  return wrap;
}

// --- Goalies --------------------------------------------------------------

function goalieCard(goalie, team, tag) {
  const card = el("div", "card goalie-card");
  card.appendChild(el("div", "goalie-tag", tag));

  const top = el("div", "goalie-top");
  if (goalie?.headshot) {
    const img = document.createElement("img");
    img.className = "goalie-headshot";
    img.src = goalie.headshot;
    img.alt = "";
    top.appendChild(img);
  }
  const info = el("div", "goalie-info");
  const nameEl = el("div", "goalie-name");
  if (goalie) {
    nameEl.appendChild(
      playerLink(goalie.name.default, goalie.playerId, { kind: "goalie" }),
    );
    addTierSlot(nameEl, goalie.playerId, "goalie");
  } else {
    nameEl.textContent = "TBD";
  }
  info.appendChild(nameEl);
  info.appendChild(el("div", "goalie-team", teamName(team)));
  top.appendChild(info);
  card.appendChild(top);

  if (goalie) {
    const stats = el("div", "goalie-stats");
    for (const [label, value] of [
      ["Record", goalie.record || "—"],
      ["GAA", num(goalie.gaa)],
      ["SV%", pct(goalie.savePctg)],
      ["SO", goalie.shutouts],
    ]) {
      const stat = el("div", "goalie-stat");
      stat.appendChild(el("span", "goalie-stat-value", String(value)));
      stat.appendChild(el("span", "goalie-stat-label", label));
      stats.appendChild(stat);
    }
    card.appendChild(stats);
  }

  const slug = TEAM_SLUGS[team.abbrev];
  if (slug) {
    const link = el("a", "goalie-link", "Confirm starter on Daily Faceoff →");
    link.href = `https://www.dailyfaceoff.com/teams/${slug}/line-combinations/`;
    link.target = "_blank";
    link.rel = "noopener";
    card.appendChild(link);
  }
  return card;
}

// --- H2H ------------------------------------------------------------------

function renderH2H(games, awayAbbrev, homeAbbrev) {
  const wrap = section("Head-to-head", `season series ${awayAbbrev} vs ${homeAbbrev}`);

  const meetings = (games || []).filter(
    (g) =>
      g.gameType === 2 &&
      FINAL_STATES.has(g.gameState) &&
      ((g.awayTeam.abbrev === awayAbbrev && g.homeTeam.abbrev === homeAbbrev) ||
        (g.awayTeam.abbrev === homeAbbrev && g.homeTeam.abbrev === awayAbbrev)),
  );

  if (!meetings.length) {
    wrap.appendChild(
      el("div", "card empty-state", "No meetings played yet this season."),
    );
    return wrap;
  }

  let awayWins = 0;
  let homeWins = 0;
  const rows = [];
  for (const g of meetings) {
    const awayIsAway = g.awayTeam.abbrev === awayAbbrev;
    const aScore = awayIsAway ? g.awayTeam.score : g.homeTeam.score;
    const hScore = awayIsAway ? g.homeTeam.score : g.awayTeam.score;
    if (aScore > hScore) awayWins++;
    else if (hScore > aScore) homeWins++;
    const home = g.homeTeam.abbrev;
    const away = g.awayTeam.abbrev;
    rows.push([
      g.gameDate,
      `${away} ${g.awayTeam.score} @ ${home} ${g.homeTeam.score}`,
    ]);
  }

  const card = el("div", "card h2h-card");
  card.appendChild(
    el(
      "div",
      "h2h-record",
      `${awayAbbrev} ${awayWins} — ${homeWins} ${homeAbbrev}`,
    ),
  );
  card.appendChild(dataTable(["Date", "Result"], rows, "h2h-table"));
  wrap.appendChild(card);
  return wrap;
}

// --- Players --------------------------------------------------------------

// Store rows resolve after the league dataset loads; tier badges and advanced
// cells register fill-ins so the preview paints immediately.
const tierSlots = [];
const storeUpdaters = [];
const skaterMpUpdaters = [];
const goalieMpUpdaters = [];

function storeRow(id, kind = "skater") {
  if (id == null) return null;
  const data = kind === "goalie" ? seasonDataGoaler : seasonDataPlayer;
  return (data[gameSeason] || []).find((p) => p.ID === id) || null;
}

function openCard(id, opts = {}) {
  const kind = opts.kind || "skater";
  const row = storeRow(id, kind);
  const position = row?.Position || (opts.position ? [opts.position] : []);
  openPlayerCard(
    { ID: id, Position: position, Tier: row?.Tier ?? opts.tier },
    undefined,
  );
}

function playerLink(label, id, opts = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "player-link";
  btn.textContent = label;
  btn.title = `Open ${label}'s player card`;
  btn.addEventListener("click", () => openCard(id, opts));
  return btn;
}

function addTierSlot(container, id, kind = "skater") {
  if (id == null || !container) return;
  const badge = tierBadgeEl(storeRow(id, kind)?.Tier, true);
  if (badge) {
    container.appendChild(badge);
    return;
  }
  const slot = el("span", "tier-slot");
  slot.hidden = true;
  container.appendChild(slot);
  tierSlots.push({ slot, id, kind });
}

function refreshTierSlots() {
  for (let i = tierSlots.length - 1; i >= 0; i--) {
    const entry = tierSlots[i];
    const badge = tierBadgeEl(storeRow(entry.id, entry.kind)?.Tier, true);
    if (!badge) continue;
    entry.slot.replaceWith(badge);
    tierSlots.splice(i, 1);
  }
}

function playerCell(row, kind = "skater") {
  const td = document.createElement("td");
  const wrap = el("div", "player-cell");
  if (row.headshot) {
    const img = document.createElement("img");
    img.src = row.headshot;
    img.alt = "";
    img.loading = "lazy";
    wrap.appendChild(img);
  }
  const id = row.playerId ?? row.ID;
  const name =
    row.name?.default ||
    row.skaterFullName ||
    row.Joueurs ||
    row.Gardiens ||
    "";
  const holder = el("span", "player-name-wrap");
  if (id != null) {
    holder.appendChild(playerLink(name, id, { kind, position: row.position }));
  } else {
    holder.appendChild(el("span", null, name));
  }
  addTierSlot(holder, id, kind);
  wrap.appendChild(holder);
  td.appendChild(wrap);
  return td;
}

function fmtShPct(goals, shots) {
  const s = Number(shots) || 0;
  const g = Number(goals) || 0;
  return s > 0 ? `${((g / s) * 100).toFixed(1)}%` : "—";
}

function renderHotPlayers(matchup, awayAbbrev, homeAbbrev) {
  const leaders = matchup?.skaterComparison?.leaders;
  if (!leaders?.length) return null;

  const wrap = section("Hot players", "leaders over the last 5 games");
  const card = el("div", "card");

  const hotCell = (leader) => {
    const td = el("td", "hot-cell");
    if (!leader) {
      td.textContent = "—";
      return td;
    }
    const holder = el("span", "player-name-wrap");
    holder.appendChild(
      playerLink(leader.name.default, leader.playerId, {
        position: leader.positionCode,
      }),
    );
    addTierSlot(holder, leader.playerId);
    td.appendChild(holder);
    td.appendChild(el("span", "hot-value", ` (${leader.value})`));
    return td;
  };

  const rows = leaders.map((cat) => [
    cat.category,
    hotCell(cat.awayLeader),
    hotCell(cat.homeLeader),
  ]);
  card.appendChild(
    dataTable(["Category", awayAbbrev, homeAbbrev], rows, "hot-table"),
  );
  wrap.appendChild(card);
  return wrap;
}

function renderTopPlayers(matchup, away, home) {
  const skaters = matchup?.skaterSeasonStats?.skaters;
  if (!skaters?.length) return null;

  const wrap = section("Top players", "season leaders · advanced stats");
  const grid = el("div", "preview-grid");
  const headers = [
    "Player",
    "GP",
    "G",
    "A",
    "P",
    "PPP",
    "+/-",
    "SH%",
    "ixG",
    "xGF%",
    "RXGF%",
    "TOI",
    "GVI",
  ];

  const side = (team) => {
    const list = skaters
      .filter((s) => s.teamId === team.id && s.gamesPlayed != null)
      .sort((a, b) => b.points - a.points)
      .slice(0, 6);
    const card = el("div", "card table-scroll");

    const rows = list.map((p) => {
      const ppp = el("td", null, "…");
      const pm = el("td", null, p.plusMinus == null ? "—" : p.plusMinus);
      const sh = el(
        "td",
        null,
        p.shootingPctg != null ? pct(p.shootingPctg) : "—",
      );
      const ixg = el("td", null, "…");
      const xgf = el("td", null, "…");
      const rel = el("td", null, "…");
      const toi = el("td", null, p.avgTimeOnIce || "—");
      const gvi = el("td", null, "…");

      storeUpdaters.push(() => {
        const row = storeRow(p.playerId);
        if (!row) return;
        ppp.textContent = row.PPP ?? "—";
        pm.textContent = row["+/-"] ?? pm.textContent;
        sh.textContent = fmtShPct(row.G, row.S);
        toi.textContent = row.TOI || toi.textContent;
        gvi.textContent = row.GVI != null ? Number(row.GVI).toFixed(2) : "—";
      });
      skaterMpUpdaters.push((mp) => {
        const entry = mp?.[p.playerId];
        const vals = entry ? seasonAdvCells(entry) : null;
        ixg.textContent = vals?.ixg ?? "—";
        xgf.textContent = vals?.xgf ?? "—";
        rel.textContent = vals?.rel ?? "—";
      });

      return [
        playerCell(p),
        p.gamesPlayed,
        p.goals,
        p.assists,
        p.points,
        ppp,
        pm,
        sh,
        ixg,
        xgf,
        rel,
        toi,
        gvi,
      ];
    });

    card.appendChild(dataTable(headers, rows, "top-table advanced-table"));
    return card;
  };

  grid.appendChild(side(away));
  grid.appendChild(side(home));
  wrap.appendChild(grid);
  return wrap;
}

function renderGoalieTables(matchup, away, home) {
  const goalies = matchup?.goalieSeasonStats?.goalies;
  if (!goalies?.length) return null;

  const wrap = section("Goalies", "season stats · advanced");
  const grid = el("div", "preview-grid");
  const headers = [
    "Goalie",
    "GP",
    "W-L-OT",
    "SV%",
    "GAA",
    "GSAx",
    "GSAx/60",
    "SO",
    "GVI",
  ];

  const side = (team) => {
    const list = goalies
      .filter((g) => g.teamId === team.id && g.gamesPlayed != null)
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    const card = el("div", "card table-scroll");

    const rows = list.map((g) => {
      const gsax = el("td", null, "…");
      const gsax60 = el("td", null, "…");
      const gvi = el("td", null, "…");

      storeUpdaters.push(() => {
        const row = storeRow(g.playerId, "goalie");
        if (!row) return;
        gvi.textContent = row.GVI != null ? Number(row.GVI).toFixed(2) : "—";
      });
      goalieMpUpdaters.push((mp) => {
        const entry = mp?.[g.playerId];
        const vals = entry ? seasonGoalieCells(entry) : null;
        gsax.textContent = vals?.gsax ?? "—";
        gsax60.textContent = vals?.gsax60 ?? "—";
      });

      return [
        playerCell(g, "goalie"),
        g.gamesPlayed,
        `${g.wins}-${g.losses}-${g.otLosses}`,
        pct(g.savePctg),
        num(g.goalsAgainstAvg),
        gsax,
        gsax60,
        g.shutouts,
        gvi,
      ];
    });

    card.appendChild(dataTable(headers, rows, "goalie-table advanced-table"));
    return card;
  };

  grid.appendChild(side(away));
  grid.appendChild(side(home));
  wrap.appendChild(grid);
  return wrap;
}

// --- Career vs opponent ---------------------------------------------------

const MIN_CAREER_GP = 5;

function parseToi(toi) {
  if (!toi) return 0;
  const [minutes, seconds] = String(toi).split(":").map(Number);
  return (minutes || 0) * 60 + (seconds || 0);
}

function fmtToi(totalSeconds) {
  if (!totalSeconds) return "—";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function dedupeByPlayer(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (row?.playerId == null || seen.has(row.playerId)) continue;
    seen.add(row.playerId);
    out.push(row);
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        console.error("Career scan failed:", err);
        results[index] = null;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

async function loadCareerGames(playerId, opponentAbbrev) {
  const landing = await loadPlayerLanding(playerId);
  const seasonIds = [
    ...new Set(
      (landing?.seasonTotals || [])
        .filter((t) => t.leagueAbbrev === "NHL" && t.gameTypeId === 2)
        .map((t) => t.season),
    ),
  ];
  if (!seasonIds.length) return [];
  const logs = await mapLimit(seasonIds, 3, (s) => loadGameLog(playerId, s));
  return logs
    .flatMap((log) => log?.gameLog || [])
    .filter((game) => game.opponentAbbrev === opponentAbbrev);
}

function summarizeSkater(games) {
  let gp = 0;
  let goals = 0;
  let assists = 0;
  let points = 0;
  let shots = 0;
  let toi = 0;
  for (const game of games) {
    gp++;
    goals += game.goals || 0;
    assists += game.assists || 0;
    points += game.points ?? (game.goals || 0) + (game.assists || 0);
    shots += game.shots || 0;
    toi += parseToi(game.toi);
  }
  return {
    gp,
    goals,
    assists,
    points,
    pointsPerGame: gp ? points / gp : 0,
    toiPerGame: gp ? toi / gp : 0,
  };
}

function summarizeGoalie(games) {
  let gp = 0;
  let wins = 0;
  let losses = 0;
  let otLosses = 0;
  let shotsAgainst = 0;
  let goalsAgainst = 0;
  let toi = 0;
  for (const game of games) {
    gp++;
    if (game.decision === "W") wins++;
    else if (game.decision === "L") losses++;
    else if (game.decision === "O" || game.decision === "OT" || game.decision === "SO") {
      otLosses++;
    }
    shotsAgainst += game.shotsAgainst || 0;
    goalsAgainst += game.goalsAgainst || 0;
    toi += parseToi(game.toi);
  }
  return {
    gp,
    wins,
    losses,
    otLosses,
    savePct:
      shotsAgainst > 0
        ? ((shotsAgainst - goalsAgainst) / shotsAgainst) * 100
        : null,
    gaa: toi > 0 ? (goalsAgainst * 3600) / toi : null,
  };
}

async function runCareerScan(sides, skaters, goalies) {
  const skaterCandidates = dedupeByPlayer(skaters);
  const goalieCandidates = dedupeByPlayer(goalies);
  const total = skaterCandidates.length + goalieCandidates.length;
  let done = 0;

  const tick = () => {
    done++;
    for (const side of sides) {
      side.status.textContent = `Scanning career logs… ${done}/${total}`;
    }
  };

  const opponentFor = (candidate) => {
    const side = sides.find((s) => s.team.id === candidate.teamId);
    return side ? side.opp.abbrev : null;
  };

  const skaterResults = await mapLimit(skaterCandidates, 6, async (player) => {
    const opponent = opponentFor(player);
    if (!opponent) {
      tick();
      return null;
    }
    const games = await loadCareerGames(player.playerId, opponent);
    tick();
    return { player, opponent, summary: summarizeSkater(games) };
  });

  const goalieResults = await mapLimit(goalieCandidates, 4, async (player) => {
    const opponent = opponentFor(player);
    if (!opponent) {
      tick();
      return null;
    }
    const games = await loadCareerGames(player.playerId, opponent);
    tick();
    return { player, opponent, summary: summarizeGoalie(games) };
  });

  for (const side of sides) {
    const skaterRows = skaterResults
      .filter(Boolean)
      .filter(
        (r) =>
          r.player.teamId === side.team.id && r.summary.gp >= MIN_CAREER_GP,
      )
      .sort(
        (a, b) =>
          b.summary.pointsPerGame - a.summary.pointsPerGame ||
          b.summary.points - a.summary.points,
      )
      .slice(0, 5);

    const goalieRows = goalieResults
      .filter(Boolean)
      .filter(
        (r) =>
          r.player.teamId === side.team.id && r.summary.gp >= MIN_CAREER_GP,
      )
      .sort((a, b) => b.summary.gp - a.summary.gp);

    side.status.remove();
    side.body.textContent = "";

    if (!skaterRows.length && !goalieRows.length) {
      side.body.appendChild(
        el(
          "div",
          "empty-state",
          `No player with ${MIN_CAREER_GP}+ regular-season games vs ${side.opp.abbrev}.`,
        ),
      );
      continue;
    }

    if (skaterRows.length) {
      side.body.appendChild(
        el("div", "career-subtitle", `Skaters vs ${side.opp.abbrev}`),
      );
      side.body.appendChild(
        dataTable(
          ["Player", "GP", "G", "A", "P", "P/G", "TOI/G"],
          skaterRows.map(({ player, summary }) => [
            playerCell(player),
            summary.gp,
            summary.goals,
            summary.assists,
            summary.points,
            summary.pointsPerGame.toFixed(2),
            fmtToi(summary.toiPerGame),
          ]),
          "career-table",
        ),
      );
    }

    if (goalieRows.length) {
      side.body.appendChild(
        el("div", "career-subtitle", `Goalies vs ${side.opp.abbrev}`),
      );
      side.body.appendChild(
        dataTable(
          ["Goalie", "GP", "W-L-OT", "SV%", "GAA"],
          goalieRows.map(({ player, summary }) => [
            playerCell(player, "goalie"),
            summary.gp,
            `${summary.wins}-${summary.losses}-${summary.otLosses}`,
            summary.savePct != null ? `${summary.savePct.toFixed(1)}%` : "—",
            summary.gaa != null ? summary.gaa.toFixed(2) : "—",
          ]),
          "career-table",
        ),
      );
    }
  }

  refreshTierSlots();
}

function renderCareerVsOpponent(matchup, away, home) {
  const skaters = matchup?.skaterSeasonStats?.skaters;
  const goalies = matchup?.goalieSeasonStats?.goalies;
  if (!skaters?.length) return null;

  const wrap = section(
    "Career vs opponent",
    "regular season · min 5 GP · per-game averages",
  );
  const grid = el("div", "preview-grid");

  const sides = [
    { team: away, opp: home },
    { team: home, opp: away },
  ].map(({ team, opp }) => {
    const card = el("div", "card career-card");
    const body = el("div", "career-body");
    card.appendChild(
      el("div", "career-title", `${team.abbrev} players vs ${opp.abbrev}`),
    );
    const status = el("div", "career-status", "Scanning career logs…");
    card.appendChild(status);
    card.appendChild(body);
    grid.appendChild(card);
    return { team, opp, card, body, status };
  });

  wrap.appendChild(grid);
  runCareerScan(sides, skaters, goalies);
  return wrap;
}

// --- Bootstrap ------------------------------------------------------------

function showError(message) {
  root.innerHTML = "";
  root.appendChild(el("div", "card empty-state", message));
}

async function ensureSeasonStore() {
  const ctx = await loadSeasonStoreContext(() => gameSeason || seasons[0]);
  setPlayerCardContext(ctx);
}

setPlayerCardContextLoader(ensureSeasonStore);

async function enrichPreview() {
  try {
    await ensureSeasonStore();
    refreshTierSlots();
    for (const update of storeUpdaters) {
      try {
        update();
      } catch (err) {
        console.error(err);
      }
    }

    const [mpSkaters, mpGoalies] = await Promise.all([
      loadMoneyPuckSkaters(gameSeason),
      loadMoneyPuckGoalies(gameSeason),
    ]);
    for (const update of skaterMpUpdaters) {
      try {
        update(mpSkaters);
      } catch (err) {
        console.error(err);
      }
    }
    for (const update of goalieMpUpdaters) {
      try {
        update(mpGoalies);
      } catch (err) {
        console.error(err);
      }
    }
  } catch (err) {
    console.error("Failed to enrich game preview:", err);
  }
}

async function main() {
  if (!gameId) {
    showError("No game selected. Open a matchup from the Games page.");
    return;
  }

  const landing = await loadGameLanding(gameId);
  if (!landing || !landing.awayTeam || !landing.homeTeam) {
    showError("Could not load this game. It may not be available yet.");
    return;
  }

  const away = landing.awayTeam;
  const home = landing.homeTeam;
  const matchup = landing.matchup || {};
  gameSeason = landing.season || seasons[0];

  const awayRecord = matchup.goalieComparison?.awayTeam?.teamTotals?.record;
  const homeRecord = matchup.goalieComparison?.homeTeam?.teamTotals?.record;

  root.innerHTML = "";
  root.appendChild(renderHeader(landing, awayRecord, homeRecord));

  const [teamSummary, awaySchedule] = await Promise.all([
    loadTeamSummary(landing.season),
    loadClubSchedule(away.abbrev),
  ]);

  const awaySummary = teamSummary.find((t) => t.teamId === away.id);
  const homeSummary = teamSummary.find((t) => t.teamId === home.id);

  const awayGoalie = matchup.goalieComparison?.awayTeam?.leaders?.[0];
  const homeGoalie = matchup.goalieComparison?.homeTeam?.leaders?.[0];

  if (awaySummary && homeSummary) {
    const compare = section("Team comparison", formatSeason(landing.season));
    const card = el("div", "card");
    card.appendChild(
      compareTable(awaySummary, homeSummary, away.abbrev, home.abbrev),
    );
    compare.appendChild(card);
    root.appendChild(compare);

    root.appendChild(
      renderEdges(
        buildEdges(
          awaySummary,
          homeSummary,
          away.abbrev,
          home.abbrev,
          awayGoalie,
          homeGoalie,
        ),
        away.abbrev,
        home.abbrev,
      ),
    );
  }

  if (awayGoalie || homeGoalie) {
    const goalieWrap = section("Projected starters", "verify before puck drop");
    const goalieGrid = el("div", "preview-grid");
    goalieGrid.appendChild(
      goalieCard(awayGoalie, away, `${away.abbrev} — starter`),
    );
    goalieGrid.appendChild(
      goalieCard(homeGoalie, home, `${home.abbrev} — starter`),
    );
    goalieWrap.appendChild(goalieGrid);
    root.appendChild(goalieWrap);
  }

  root.appendChild(renderH2H(awaySchedule?.games, away.abbrev, home.abbrev));

  const hot = renderHotPlayers(matchup, away.abbrev, home.abbrev);
  if (hot) root.appendChild(hot);

  const career = renderCareerVsOpponent(matchup, away, home);
  if (career) root.appendChild(career);

  const top = renderTopPlayers(matchup, away, home);
  if (top) root.appendChild(top);

  const goalieTables = renderGoalieTables(matchup, away, home);
  if (goalieTables) root.appendChild(goalieTables);

  // Tiers, GVI and MoneyPuck advanced columns fill in progressively.
  enrichPreview();
}

main();
