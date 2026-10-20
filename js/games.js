import { estDateISO, shiftDate, loadSchedule } from "./api.js";
import { buildGameCard } from "./gameCard.js";

const grid = document.getElementById("gamesGrid");
const dateLabel = document.getElementById("dateLabel");
const prevDay = document.getElementById("prevDay");
const nextDay = document.getElementById("nextDay");
const todayBtn = document.getElementById("todayBtn");

let currentDate = estDateISO();

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function render() {
  dateLabel.textContent = formatDateLabel(currentDate);
  todayBtn.disabled = currentDate === estDateISO();
  grid.innerHTML = '<div class="loading">Loading games…</div>';

  const { games } = await loadSchedule(currentDate);
  grid.innerHTML = "";

  if (!games.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state card";
    empty.textContent = "No games scheduled on this date.";
    grid.appendChild(empty);
    return;
  }

  for (const game of games) grid.appendChild(buildGameCard(game));
}

prevDay.addEventListener("click", () => {
  currentDate = shiftDate(currentDate, -1);
  render();
});

nextDay.addEventListener("click", () => {
  currentDate = shiftDate(currentDate, 1);
  render();
});

todayBtn.addEventListener("click", () => {
  currentDate = estDateISO();
  render();
});

render();
