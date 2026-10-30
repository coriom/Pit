const disclosures = [...document.querySelectorAll("[data-nav-disclosure]")];
const search = document.querySelector("#operation-search");
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
