import { accountingOrigins } from "./storage-origins";
export { accountingOrigins } from "./storage-origins";
export const STORAGE_WARNING =
  "Accounting storage and CSV export are disabled on this unapproved or shared origin. Use an approved dedicated PIT origin. Existing records have not been deleted.";

export function accountingAllowed(
  href: string,
  approved: readonly string[] = accountingOrigins,
): boolean {
  try {
    const url = new URL(href);
    // Negative defense only; absence of a path marker does not establish trust.
    let path = url.pathname;
    for (let i = 0; i < 4; i++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
    if (/%|\\/.test(path) || /(?:^|\/)(?:ipfs|ipns)(?:\/|$)/i.test(path))
      return false;
    if (url.username || url.password) return false;
    if (
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      return true;
    return url.protocol === "https:" && approved.includes(url.origin);
  } catch {
    return false;
  }
}

export function storageEnabled(): boolean {
  if (typeof location === "undefined") return false;
  if (typeof window !== "undefined" && window.top !== window.self) return false;
  return accountingAllowed(location.href);
}

export function assertStorageEnabled() {
  if (!storageEnabled()) throw new Error(STORAGE_WARNING);
}
