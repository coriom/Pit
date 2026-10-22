import {runBc,type BcId} from "./bc-statistics";
import {BC_SPEC_BY_ID} from "./bc-tool-specs";
for(const root of document.querySelectorAll<HTMLElement>("[data-bc-tool]")){
  const id=root.dataset.bcTool as BcId,spec=BC_SPEC_BY_ID.get(id),form=root.querySelector<HTMLFormElement>("form"),output=root.querySelector<HTMLElement>("[data-bc-output]"),error=root.querySelector<HTMLElement>("[data-bc-error]"),fields=root.querySelector<HTMLElement>("[data-bc-fields]");
  let last:ReturnType<typeof runBc>|null=null;
  if(!spec||!form||!output||!error||!fields)continue;
  form.addEventListener("submit",e=>{e.preventDefault();error.hidden=true;output.hidden=true;last=null;
    const input=Object.fromEntries([...new FormData(form).entries()].map(([k,v])=>[k,String(v)]));
    try{last=runBc(id,input);const primary=output.querySelector<HTMLElement>("[data-bc-primary]");if(primary)primary.textContent=last.primary;fields.replaceChildren();for(const [k,v] of Object.entries(last.fields)){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v;fields.append(dt,dd);}output.hidden=false;}
    catch(cause){error.textContent=cause instanceof Error?cause.message:"Calculation unavailable.";error.hidden=false;}
  });
  root.querySelector("[data-bc-example]")?.addEventListener("click",()=>{for(const field of spec.fields){const control=form.elements.namedItem(field.name);if(control instanceof HTMLInputElement||control instanceof HTMLSelectElement||control instanceof HTMLTextAreaElement)control.value=field.example;}output.hidden=true;error.hidden=true;last=null;});
  root.querySelector("[data-bc-download]")?.addEventListener("click",()=>{if(!last)return;const input=Object.fromEntries([...new FormData(form).entries()].map(([k,v])=>[k,String(v)]));const blob=new Blob([JSON.stringify({tool:id,version:1,capability:"local-pure",input,result:last,assumptions:spec.assumptions},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`pit-${id}-illustration.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
}
