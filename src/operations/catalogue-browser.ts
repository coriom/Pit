const search = document.querySelector<HTMLInputElement>("#operation-search");
const cards = [...document.querySelectorAll<HTMLElement>("[data-tool]")];
const count = document.querySelector<HTMLElement>("#search-count");
search?.addEventListener("input", () => {
  const query = search.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const card of cards) { card.hidden = !card.dataset.search?.includes(query); if (!card.hidden) visible++; }
  for (const section of document.querySelectorAll<HTMLElement>("[data-category]")) section.hidden = !section.querySelector<HTMLElement>("[data-tool]:not([hidden])");
  if (count) count.textContent = `${visible} local operations${visible ? "" : " — no matches"}`;
});
export {};
