/** Reviewed deployment origins only: exact scheme/host/port, no paths or wildcards.
 * Keep empty until the operator verifies the entire origin is PIT-controlled.
 * Dedicated Pages/custom domains, DNSLink and stable IPNS subdomains work here.
 * This is public deployment policy, never a credential or user preference.
 */
export const accountingOrigins: readonly string[] = Object.freeze([]);
