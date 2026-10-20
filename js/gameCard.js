function isFinal(game) {
  return game.gameState === "OFF" || game.gameState === "FINAL";
}

function isLive(game) {
  return game.gameState === "LIVE" || game.gameState === "CRIT";
}

function formatESTTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function teamDisplayName(team) {
  const place = team.placeName?.default || "";
  const common = team.commonName?.default || "";
  return `${place} ${common}`.trim() || team.abbrev;
}

function buildTeamRow(team, showScore) {
  const row = document.createElement("div");
  row.className = "game-card-team";

  const img = document.createElement("img");
  img.className = "team-logo";
  img.src = team.logo;
  img.alt = team.abbrev;
  img.loading = "lazy";
  row.appendChild(img);

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = teamDisplayName(team);
  row.appendChild(name);

  if (showScore && team.score != null) {
    const score = document.createElement("span");
    score.className = "score";
    score.textContent = team.score;
    row.appendChild(score);
  }
  return row;
}

export function buildGameCard(game) {
  const card = document.createElement("a");
  card.className = "card game-card";
  card.href = `game.html?id=${game.id}`;

  const meta = document.createElement("div");
  meta.className = "game-card-meta";

  const state = document.createElement("span");
  if (isLive(game)) {
    state.innerHTML = '<span class="badge live">Live</span>';
  } else if (isFinal(game)) {
    state.innerHTML = '<span class="badge final">Final</span>';
  } else {
    state.textContent = `${formatESTTime(game.startTimeUTC)} ET`;
  }
  meta.appendChild(state);

  const networks = [
    ...new Set((game.tvBroadcasts || []).map((t) => t.network).filter(Boolean)),
  ];
  const tv = document.createElement("span");
  tv.className = "game-card-tv";
  tv.textContent = networks.slice(0, 2).join(", ");
  meta.appendChild(tv);

  card.appendChild(meta);

  const teams = document.createElement("div");
  teams.className = "game-card-teams";
  const showScore = isFinal(game) || isLive(game);
  teams.appendChild(buildTeamRow(game.awayTeam, showScore));
  teams.appendChild(buildTeamRow(game.homeTeam, showScore));
  card.appendChild(teams);

  return card;
}
