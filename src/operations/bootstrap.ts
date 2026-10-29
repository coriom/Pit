declare const __PIT_HOSTED_STAGING__: boolean;
import { phase5OperationCatalog, phase6OperationCatalog } from "./lib/catalog";

const id = document.querySelector<HTMLElement>("#operation-root")?.dataset.operation;
if (__PIT_HOSTED_STAGING__) {
  if (!id) void import("./catalogue-browser");
} else if (!id) void import("./catalogue-browser");
else if (phase5OperationCatalog.some((entry) => entry.id === id)) void import("./phase5-browser");
else if (phase6OperationCatalog.some((entry) => entry.id === id)) void import("./phase6-browser");
else if (new URLSearchParams(location.search).get("paid-local") === "1") void import("./paid-browser");
else void import("./browser");
