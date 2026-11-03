/** Static links only. Separate Astro builds consume these paths without sharing browser code. */
export const unifiedProductPaths = {
  home: "/",
  directory: "/#directory",
  search: "/#operation-search",
  toolbox: "/toolbox/",
  toolboxTools: "/tools/",
  explorer: "/explorer/",
  operations: "/#directory",
  guide: "/guide/",
} as const;
export const unifiedCategoryHref = (id: string) => `/?category=${encodeURIComponent(id)}#directory`;
