import {
  estDateISO,
  loadSchedule,
  loadStandings,
  loadSkaterLeaders,
  loadGoalieLeaders,
} from "./api.js";
import { buildGameCard } from "./gameCard.js";
import { openPlayerCard } from "./playerCard.js";
import { setPlayerCardContextLoader } from "./playerCardContext.js";
import { loadSeasonStoreContext } from "./seasonStore.js";

// Cards open with the full league dataset; it loads lazily on the first click
// so the home page itself stays light.
setPlayerCardContextLoader(() => loadSeasonStoreContext());

const tonightGrid = document.getElementById("tonightGames");
const standingsTabs = document.getElementById("standingsTabs");
const standingsBody = document.getElementById("standingsBody");
const leadersGrid = document.getElementById("leadersGrid");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function renderTonight() {
  tonightGrid.innerHTML = '<div class="loading">Loading tonight\'s games…</div>';
  const { games } = await loadSchedule(estDateISO());
  tonightGrid.innerHTML = "";

  if (!games.length) {
    const empty = el("div", "empty-state card", "No games tonight.");
    tonightGrid.appendChild(empty);
    return;
  }
  for (const game of games.slice(0, 8)) {
    tonightGrid.appendChild(buildGameCard(game));
  }
}

function sortStandings(rows) {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.pointPctg - a.pointPctg ||
      b.goalDifferential - a.goalDifferential,
  );
}

function renderStandingsRows(rows) {
  standingsBody.innerHTML = "";
  for (const t of sortStandings(rows)) {
    const tr = document.createElement("tr");

    const teamCell = document.createElement("td");
    const wrap = el("div", "player-cell");
    const logo = document.createElement("img");
    logo.src = t.teamLogo;
    logo.alt = t.teamAbbrev.default;
    wrap.appendChild(logo);
    wrap.appendChild(el("span", null, t.teamAbbrev.default));
    teamCell.appendChild(wrap);
    tr.appendChild(teamCell);

    for (const value of [
      t.gamesPlayed,
      t.wins,
      t.losses,
      t.otLosses,
      t.points,
      t.goalFor,
      t.goalAgainst,
      t.goalDifferential > 0 ? `+${t.goalDifferential}` : t.goalDifferential,
      t.pointPctg.toFixed(3).replace(/^0/, ""),
    ]) {
      tr.appendChild(el("td", null, String(value)));
    }
    standingsBody.appendChild(tr);
  }
}

async function renderStandings() {
  const rows = await loadStandings();
  if (!rows.length) {
    standingsTabs.innerHTML = "";
    standingsBody.appendChild(
      el("tr", null, "Standings are unavailable right now."),
    );
    return;
  }

  const conferences = [
    { key: "E", label: "Eastern" },
    { key: "W", label: "Western" },
  ];

  conferences.forEach((conf, index) => {
    const btn = el("button", "button", conf.label);
    btn.type = "button";
    if (index === 0) btn.classList.add("active");
    btn.addEventListener("click", () => {
      standingsTabs
        .querySelectorAll("button")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderStandingsRows(rows.filter((r) => r.conferenceAbbrev === conf.key));
    });
    standingsTabs.appendChild(btn);
  });

  renderStandingsRows(rows.filter((r) => r.conferenceAbbrev === conferences[0].key));
}

function leadersCard(title, rows, valueLabel, valueOf, href) {
  const card = el("div", "card leaders-card");

  const head = el("div", "leaders-card-head");
  head.appendChild(el("h3", "leaders-card-title", title));
  if (href) {
    const link = el("a", "see-all", "Details →");
    link.href = href;
    head.appendChild(link);
  }
  card.appendChild(head);

  const table = el("table", "mini-table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(el("th", null, "Player"));
  headRow.appendChild(el("th", null, valueLabel));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");

    const nameCell = document.createElement("td");
    const wrap = el("div", "player-cell");
    if (row.headshot) {
      const img = document.createElement("img");
      img.src = row.headshot;
      img.alt = "";
      img.loading = "lazy";
      wrap.appendChild(img);
    }
    const names = el("span", "player-name-wrap");
    const nameBtn = el(
      "button",
      "player-link",
      `${row.firstName.default.charAt(0)}. ${row.lastName.default}`,
    );
    nameBtn.type = "button";
    nameBtn.title = `Open ${row.firstName.default} ${row.lastName.default}'s player card`;
    nameBtn.addEventListener("click", () =>
      openPlayerCard(
        {
          ID: row.id,
          Position: row.position ? [row.position] : [],
        },
        undefined,
      ),
    );
    names.appendChild(nameBtn);
    names.appendChild(el("span", "team-tag", row.teamAbbrev));
    wrap.appendChild(names);
    nameCell.appendChild(wrap);
    tr.appendChild(nameCell);

    tr.appendChild(el("td", null, valueOf(row)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  card.appendChild(table);
  return card;
}

async function renderLeaders() {
  leadersGrid.innerHTML = '<div class="loading">Loading leaders…</div>';

  const [skaters, goalies] = await Promise.all([
    loadSkaterLeaders("points,goals", 5),
    loadGoalieLeaders("savePctg", 5),
  ]);

  leadersGrid.innerHTML = "";

  leadersGrid.appendChild(
    leadersCard(
      "Points",
      skaters.points || [],
      "P",
      (r) => r.value,
      "stats.html",
    ),
  );
  leadersGrid.appendChild(
    leadersCard(
      "Goals",
      skaters.goals || [],
      "G",
      (r) => r.value,
      "stats.html",
    ),
  );
  leadersGrid.appendChild(
    leadersCard(
      "Save % (goalies)",
      goalies.savePctg || [],
      "SV%",
      (r) => r.value.toFixed(3).replace(/^0/, ""),
      "stats.html",
    ),
  );
}

renderTonight();
renderStandings();
renderLeaders();
