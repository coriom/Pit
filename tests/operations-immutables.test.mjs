import test from "node:test";
import assert from "node:assert/strict";
import { canonicalImmutableReferences } from "../scripts/operations/immutable-references.mjs";

test("immutable offsets remain reproducible when Forge source IDs change", () => {
  const old = { "110": [{ start: 414, length: 32 }, { start: 3198, length: 32 }], "112": [{ start: 554, length: 32 }] };
  const next = { "1435": [{ start: 554, length: 32 }], "1433": [{ start: 3198, length: 32 }, { start: 414, length: 32 }] };
  assert.deepEqual(canonicalImmutableReferences(old), canonicalImmutableReferences(next));
  assert.deepEqual(canonicalImmutableReferences({}), {});
});
