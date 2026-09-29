import { vi } from "vitest";
// Node-only test environment models normal local browser development.
vi.stubGlobal("location", new URL("http://localhost:4321/"));
