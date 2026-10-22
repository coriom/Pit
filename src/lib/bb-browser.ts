import { runBb, type BbId } from "./bb-derivatives";
import { BB_SPEC_BY_ID } from "./bb-tool-specs";
import { runBj, type BjId, type BjResult } from "./bj-derivatives";
import { BJ_SPEC_BY_ID } from "./bj-tool-specs";

for (const root of document.querySelectorAll<HTMLElement>("[data-bb-tool]")) {
  const id = root.dataset.bbTool as BbId;
  const bjSpec = BJ_SPEC_BY_ID.get(id as BjId);
  const spec = BB_SPEC_BY_ID.get(id) ?? bjSpec;
  const form = root.querySelector<HTMLFormElement>("form");
  const output = root.querySelector<HTMLElement>("[data-bb-output]");
  const error = root.querySelector<HTMLElement>("[data-bb-error]");
  const fields = root.querySelector<HTMLElement>("[data-bb-fields]");
  let last: ReturnType<typeof runBb> | BjResult | null = null;
  if (!spec || !form || !output || !error || !fields) continue;
  form.addEventListener("submit", (event) => {
    event.preventDefault(); error.hidden = true; output.hidden = true; last = null;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const input = Object.fromEntries(Object.entries(data).map(([key,value]) => [key, String(value)]));
      last = bjSpec ? runBj(id as BjId, input) : runBb(id, input);
      const primary = output.querySelector<HTMLElement>("[data-bb-primary]");
      if (primary) primary.textContent = last.primary;
      fields.replaceChildren();
      for (const [key,value] of Object.entries(last.fields)) {
        const dt=document.createElement("dt"), dd=document.createElement("dd"); dt.textContent=key; dd.textContent=value; fields.append(dt,dd);
      }
      const plot = output.querySelector<SVGSVGElement>("[data-bb-plot]");
      const plotWrap = output.querySelector<HTMLElement>("[data-bb-plot-wrap]");
      const plotData = "plot" in last ? last.plot : undefined;
      if (plot && plotWrap) {
        plot.replaceChildren();
        plotWrap.hidden = !plotData;
        if (plotData && plotData.length >= 3) {
          const points = plotData.map(({x,y}) => ({x:Number(x),y:Number(y)}));
          const xs=points.map(p=>p.x),ys=points.map(p=>p.y), minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
          const projected=points.map(p=>`${20+(p.x-minX)/(maxX-minX)*380},${160-(p.y-minY)/(maxY-minY||1)*140}`).join(" ");
          const line=document.createElementNS("http://www.w3.org/2000/svg","polyline");
          line.setAttribute("points",projected);line.setAttribute("fill","none");line.setAttribute("stroke","currentColor");line.setAttribute("stroke-width","3");plot.append(line);
        }
      }
      output.hidden=false;
    } catch (cause) { error.textContent = cause instanceof Error ? cause.message : "Calculation unavailable."; error.hidden=false; }
  });
  root.querySelector("[data-bb-example]")?.addEventListener("click", () => {
    for (const field of spec.fields) {
      const control = form.elements.namedItem(field.name);
      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) control.value = field.example;
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
