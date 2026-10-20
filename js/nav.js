const NAV_ITEMS = [
  { href: "index.html", label: "Accueil", match: ["", "index.html"] },
  { href: "stats.html", label: "Player Stats", match: ["stats.html"] },
  { href: "games.html", label: "Games", match: ["games.html", "game.html"] },
];

function currentPage() {
  return window.location.pathname.split("/").pop() || "index.html";
}

function buildNav() {
  const page = currentPage();

  const header = document.createElement("header");
  header.className = "site-nav";

  const brand = document.createElement("a");
  brand.className = "site-nav-brand";
  brand.href = "index.html";
  brand.title = "Le Puckboard — home";
  brand.textContent = "Le Puckboard";
  header.appendChild(brand);

  const links = document.createElement("nav");
  links.className = "site-nav-links";
  for (const item of NAV_ITEMS) {
    const a = document.createElement("a");
    a.href = item.href;
    a.textContent = item.label;
    if (item.match.includes(page)) a.classList.add("active");
    links.appendChild(a);
  }
  header.appendChild(links);

  return header;
}

const header = buildNav();
document.body.prepend(header);

// Publish the nav height so the sticky filter bar and table header can park
// below it (see base.css / app.js / table.css).
const setNavHeight = () => {
  document.documentElement.style.setProperty(
    "--nav-height",
    `${header.offsetHeight}px`,
  );
};
setNavHeight();
if ("ResizeObserver" in window) {
  new ResizeObserver(setNavHeight).observe(header);
} else {
  window.addEventListener("resize", setNavHeight);
}
