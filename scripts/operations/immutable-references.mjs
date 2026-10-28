// Forge's source IDs vary with project compilation context. Runtime identity
// depends on the immutable byte offsets, not on those unstable numeric IDs.
export function canonicalImmutableReferences(references = {}) {
  const groups = Object.values(references).map((entries) =>
    entries.map(({ start, length }) => ({ start, length })).sort((a, b) => a.start - b.start));
  groups.sort((a, b) => (a[0]?.start ?? 0) - (b[0]?.start ?? 0));
  return Object.fromEntries(groups.map((entries, index) => [String(index), entries]));
}
