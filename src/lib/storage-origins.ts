/** Reviewed deployment origins only: exact scheme/host/port, no paths or wildcards.
 * The PIT-owned, SSO-protected Vercel staging alias is approved for this build.
 * This is public deployment policy, never a credential or user preference.
 */
export const accountingOrigins: readonly string[] = Object.freeze([
  "https://pit-testnet-staging-corioms-projects.vercel.app",
]);
