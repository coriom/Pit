import { describe, expect, it } from "vitest";
import { freePublicRoutes, freeRobots, freeSitemap, publicFreeOrigin, renderLegalText, validatePublicFreeConfig } from "../../scripts/product/free-public-policy.mjs";

const valid = {
  schema: "pit.free-public-config.v1", origin: "https://example.org", legalReviewApproved: true,
  publisherName: "Fixture Publisher", publisherStatus: "fixture", publisherAddress: "Fixture Street",
  publisherRegistration: "fixture registration", contactEmail: "contact@example.org", privacyEmail: "privacy@example.org",
  hostingProvider: "Fixture Host", hostingAddress: "Fixture Host Street", jurisdiction: "fixture",
  legalText: Object.fromEntries(["notice", "privacy", "terms", "cookies"].map((key) => [key, `${key} fixture content. `.repeat(8)])),
};

describe("Free public release policy", () => {
  it("fails closed without a reviewed origin and legal identity", () => {
    expect(() => publicFreeOrigin("http://example.org")).toThrow();
    expect(() => publicFreeOrigin("https://pit-v2-private-staging.coriolanmorel.workers.dev")).toThrow();
    expect(() => publicFreeOrigin("https://example.org/path")).toThrow();
    expect(() => validatePublicFreeConfig({ ...valid, legalReviewApproved: false })).toThrow("legal review");
    expect(() => validatePublicFreeConfig({ ...valid, publisherRegistration: "[REQUIRED]" })).toThrow("publisherRegistration");
    expect(() => validatePublicFreeConfig({ ...valid, publisherAddress: "[ADRESSE À CONFIRMER]" })).toThrow("publisherAddress");
    expect(() => validatePublicFreeConfig({ ...valid, legalText: { ...valid.legalText, privacy: "TBD" } })).toThrow("privacy");
    expect(() => validatePublicFreeConfig({ ...valid, legalText: { ...valid.legalText, notice: `${valid.legalText.notice} [À CONFIRMER]` } })).toThrow("notice");
    expect(validatePublicFreeConfig(valid).origin).toBe("https://example.org");
  });

  it("renders reviewed legal paragraphs without treating user text as HTML", () => {
    expect(renderLegalText('First & clear.\n\nSecond <script> sentence.')).toBe(
      '<p>First &amp; clear.</p><p>Second &lt;script&gt; sentence.</p>',
    );
  });

  it("indexes only free pages and never fabricates a staging origin", () => {
    const routes = freePublicRoutes(["index.html", "tools/index.html", "inspect/native-balance/index.html", "operations/token-creator/index.html", "404.html"]);
    expect(routes).toEqual(["/", "/inspect/native-balance/", "/tools/"]);
    expect(freeSitemap("https://example.org", routes)).toContain("https://example.org/inspect/native-balance/");
    expect(freeSitemap("https://example.org", routes)).not.toContain("operations");
    expect(freeRobots("https://example.org")).toContain("Disallow: /operations/");
  });
});
