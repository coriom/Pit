import { runBb, type BbId } from "./bb-derivatives";
import { BB_SPEC_BY_ID } from "./bb-tool-specs";

for (const root of document.querySelectorAll<HTMLElement>("[data-bb-tool]")) {
  const id = root.dataset.bbTool as BbId;
  const spec = BB_SPEC_BY_ID.get(id);
  const form = root.querySelector<HTMLFormElement>("form");
  const output = root.querySelector<HTMLElement>("[data-bb-output]");
  const error = root.querySelector<HTMLElement>("[data-bb-error]");
  const fields = root.querySelector<HTMLElement>("[data-bb-fields]");
  let last: ReturnType<typeof runBb> | null = null;
  if (!spec || !form || !output || !error || !fields) continue;
  form.addEventListener("submit", (event) => {
    event.preventDefault(); error.hidden = true; output.hidden = true; last = null;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const input = Object.fromEntries(Object.entries(data).map(([key,value]) => [key, String(value)]));
      last = runBb(id, input);
      const primary = output.querySelector<HTMLElement>("[data-bb-primary]");
      if (primary) primary.textContent = last.primary;
      fields.replaceChildren();
      for (const [key,value] of Object.entries(last.fields)) {
        const dt=document.createElement("dt"), dd=document.createElement("dd"); dt.textContent=key; dd.textContent=value; fields.append(dt,dd);
      }
      output.hidden=false;
    } catch (cause) { error.textContent = cause instanceof Error ? cause.message : "Calculation unavailable."; error.hidden=false; }
  });
  root.querySelector("[data-bb-example]")?.addEventListener("click", () => {
    for (const field of spec.fields) {
      const control = form.elements.namedItem(field.name);
      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.value = field.example;
    }
    output.hidden=true; error.hidden=true; last=null;
  });
  root.querySelector("[data-bb-download]")?.addEventListener("click", () => {
    if (!last) return;
    const input=Object.fromEntries([...new FormData(form).entries()].map(([key,value]) => [key,String(value)]));
    const blob=new Blob([JSON.stringify({tool:id,version:1,capability:"browser-local",input,result:last,assumptions:spec.assumptions},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob), link=document.createElement("a"); link.href=url; link.download=`pit-${id}-illustration.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  });
}
