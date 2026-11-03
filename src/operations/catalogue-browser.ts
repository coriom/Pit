import { rankCatalogSearch } from "./lib/catalog-search";
const search = document.querySelector<HTMLInputElement>("#operation-search");
const directorySearch = document.querySelector<HTMLInputElement>("#directory-search");
const category = document.querySelector<HTMLSelectElement>("#operation-category");
const usage = document.querySelector<HTMLSelectElement>("#operation-usage");
const network = document.querySelector<HTMLSelectElement>("#operation-network");
const price = document.querySelector<HTMLSelectElement>("#operation-price");
const cards = [...document.querySelectorAll<HTMLElement>("[data-tool]")];
const catalogue = document.querySelector<HTMLElement>("#product-catalogue");
const indexed = cards.map((card) => ({ card, title: card.dataset.title ?? "", description: card.dataset.description ?? "", category: card.dataset.categoryLabel ?? "", tags: card.dataset.tags ?? "" }));
const count = document.querySelector<HTMLElement>("#search-count");
const empty = document.querySelector<HTMLElement>("#empty-results");
const showAll = document.querySelector<HTMLButtonElement>("#show-all-tools");
const reset = document.querySelector<HTMLButtonElement>("#reset-filters");
let expanded = false;
const requestedCategory = new URLSearchParams(location.search).get("category");
if (category && requestedCategory && [...category.options].some((option) => option.value === requestedCategory)) category.value = requestedCategory;
function update() {
  if (category) category.dataset.category = category.value;
  const query = (directorySearch?.value || search?.value || "").trim().toLocaleLowerCase();
  const filtered = Boolean(query || category?.value !== "all" || usage?.value !== "all" || network?.value !== "all" || price?.value !== "all");
  const ranked = query ? rankCatalogSearch(indexed, query) : [];
  const scores = new Set(ranked.map(({ item }) => item.card));
  if (catalogue) {
    const sorted = query ? [...ranked.map(({ item }) => item.card), ...cards.filter((card) => !scores.has(card))] : cards;
    catalogue.replaceChildren(...sorted);
  }
  let matched = 0;
  let visible = 0;
  for (const card of query ? [...ranked.map(({ item }) => item.card), ...cards.filter((entry) => !scores.has(entry))] : cards) {
    const show = (!query || scores.has(card))
      && (category?.value === "all" || card.dataset.category === category?.value)
      && (usage?.value === "all" || card.dataset.usage === usage?.value)
      && (network?.value === "all" || card.dataset.networks?.split(" ").includes(network?.value ?? ""))
      && (price?.value === "all" || card.dataset.price === price?.value);
    if (show) matched++;
    card.hidden = !show || (!filtered && !expanded && visible >= 12);
    if (show && !card.hidden) visible++;
  }
  if (count) count.textContent = filtered ? `${matched} ${matched === 1 ? "tool" : "tools"}` : `${visible} tools`;
  if (empty) empty.hidden = matched !== 0;
  if (showAll) showAll.hidden = filtered || expanded || cards.length <= 12;
  if (reset) reset.hidden = !filtered;
}
search?.addEventListener("input", () => { if (directorySearch) directorySearch.value = search.value; update(); });
directorySearch?.addEventListener("input", () => { if (search) search.value = directorySearch.value; update(); });
for (const control of [category, usage, network, price]) control?.addEventListener("input", update);
showAll?.addEventListener("click", () => { expanded = true; update(); });
reset?.addEventListener("click", () => {
  if (search) search.value = "";
  if (directorySearch) directorySearch.value = "";
  for (const control of [category, usage, network, price]) if (control) control.value = "all";
  history.replaceState(null, "", location.pathname + "#directory");
  update();
});
search?.addEventListener("keydown", (event) => { if (event.key === "Enter") document.querySelector("#directory")?.scrollIntoView({ behavior: "smooth" }); });
update();
export {};
