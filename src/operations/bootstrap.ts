import { phase5OperationCatalog, phase6OperationCatalog } from "./lib/catalog";

const id = document.querySelector<HTMLElement>("#operation-root")?.dataset.operation;
if (!id) void import("./catalogue-browser");
else if (phase5OperationCatalog.some((entry) => entry.id === id)) void import("./phase5-browser");
else if (phase6OperationCatalog.some((entry) => entry.id === id)) void import("./phase6-browser");
else void import("./browser");
