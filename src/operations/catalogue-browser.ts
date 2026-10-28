const search = document.querySelector<HTMLInputElement>("#operation-search");
const category = document.querySelector<HTMLSelectElement>("#operation-category");
const usage = document.querySelector<HTMLSelectElement>("#operation-usage");
const network = document.querySelector<HTMLSelectElement>("#operation-network");
const price = document.querySelector<HTMLSelectElement>("#operation-price");
const cards = [...document.querySelectorAll<HTMLElement>("[data-tool]")];
const count = document.querySelector<HTMLElement>("#search-count");
const empty = document.querySelector<HTMLElement>("#empty-results");
const showAll = document.querySelector<HTMLButtonElement>("#show-all-tools");
let expanded = false;
function update() {
  const query = search?.value.trim().toLocaleLowerCase() ?? "";
  const filtered = Boolean(query || category?.value !== "all" || usage?.value !== "all" || network?.value !== "all" || price?.value !== "all");
  let matched = 0;
  let visible = 0;
  for (const card of cards) {
    const show = (!query || card.dataset.search?.includes(query))
      && (category?.value === "all" || card.dataset.category === category?.value)
      && (usage?.value === "all" || card.dataset.usage === usage?.value)
      && (network?.value === "all" || card.dataset.networks?.split(" ").includes(network?.value ?? ""))
      && (price?.value === "all" || card.dataset.price === price?.value);
    if (show) matched++;
    card.hidden = !show || (!filtered && !expanded && visible >= 24);
    if (show && !card.hidden) visible++;
  }
  if (count) count.textContent = `${visible} of ${cards.length} routes shown${filtered ? ` · ${matched} match` : ""}`;
  if (empty) empty.hidden = matched !== 0;
  if (showAll) showAll.hidden = filtered || expanded || cards.length <= 24;
}
for (const control of [search, category, usage, network, price]) control?.addEventListener("input", update);
showAll?.addEventListener("click", () => { expanded = true; update(); });
update();
export {};
