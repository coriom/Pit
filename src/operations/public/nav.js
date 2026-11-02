const disclosures = [...document.querySelectorAll("[data-nav-disclosure]")];
const search = document.querySelector("#operation-search");
const toolsMenu = document.querySelector(".desktop-nav .tools-menu");
if (toolsMenu) {
  const trigger = toolsMenu.querySelector("summary");
  const panel = toolsMenu.querySelector(".tools-menu-panel");
  const desktopMenu = () => window.innerWidth > 700;
  let closeTimer;
  const cancelClose = () => { if (closeTimer) clearTimeout(closeTimer); closeTimer = undefined; };
  trigger?.addEventListener("mouseenter", () => {
    if (!desktopMenu()) return;
    cancelClose();
    toolsMenu.open = true;
  });
  panel?.addEventListener("mouseenter", cancelClose);
  toolsMenu.addEventListener("focusin", cancelClose);
  toolsMenu.addEventListener("mouseleave", () => {
    if (!desktopMenu()) return;
    cancelClose();
    closeTimer = setTimeout(() => {
      if (!toolsMenu.matches(":hover")) toolsMenu.open = false;
    }, 120);
  });
  trigger?.addEventListener("click", (event) => {
    // Pointer hover has already opened the native disclosure. Keep that click
    // from immediately closing it; keyboard activation retains native behavior.
    if (event.detail > 0 && desktopMenu() && toolsMenu.open) event.preventDefault();
  });
}
function openSearch() {
  if (search) {
    search.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    search.focus({ preventScroll: true });
  } else {
    location.assign("/#operation-search");
  }
}
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target instanceof Element && target.matches("input, textarea, select, [contenteditable='true']");
  if (event.key === "Escape") {
    for (const disclosure of disclosures) disclosure.open = false;
  } else if (!typing && ((event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k"))) {
    event.preventDefault();
    openSearch();
  }
});
document.addEventListener("click", (event) => {
  for (const disclosure of disclosures) if (disclosure.open && !disclosure.contains(event.target)) disclosure.open = false;
});
document.addEventListener("focusin", (event) => {
  for (const disclosure of disclosures) if (disclosure.open && !disclosure.contains(event.target)) disclosure.open = false;
});
document.querySelector("[data-search-shortcut]")?.addEventListener("click", (event) => {
  if (!search) return;
  event.preventDefault();
  openSearch();
});
if (location.hash === "#operation-search") requestAnimationFrame(() => search?.focus());
