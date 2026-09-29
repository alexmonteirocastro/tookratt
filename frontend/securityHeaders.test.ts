import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CSP_REPORT_ONLY_HEADER,
  PRODUCTION_API_ORIGIN,
  PRODUCTION_SUPABASE_ORIGIN,
  assetInlineLimit,
  contentSecurityPolicy,
  pagesHeadersFile,
  previewHeaders,
} from "./securityHeaders.ts";

const headersPath = join(dirname(fileURLToPath(import.meta.url)), "public", "_headers");

describe("production security headers", () => {
  it("locks public/_headers to the report-only production allow-list", () => {
    const file = readFileSync(headersPath, "utf8");
    const policy = contentSecurityPolicy();

    expect(file).toBe(pagesHeadersFile());
    expect(file).toContain(`${CSP_REPORT_ONLY_HEADER}: ${policy}`);
    expect(file).not.toMatch(/^ {2}Content-Security-Policy:/m);
    expect(file).toContain(PRODUCTION_API_ORIGIN);
    expect(file).toContain(PRODUCTION_SUPABASE_ORIGIN);
    expect(file).toContain("X-Frame-Options: DENY");
    expect(file).toContain("Cross-Origin-Opener-Policy: same-origin");
    expect(file).not.toContain("example.supabase.co");
    expect(policy).not.toContain("style-src-attr");
    expect(policy).toContain("font-src 'self'");
    expect(policy).not.toContain("font-src 'self' data:");
    expect(policy).toContain("img-src 'self' data:");
  });

  it("never inlines font files, whatever their size", () => {
    expect(assetInlineLimit("/assets/space-grotesk-vietnamese.woff2")).toBe(false);
    expect(assetInlineLimit("/assets/ibm-plex-sans.woff")).toBe(false);
    expect(assetInlineLimit("/assets/favicon.svg")).toBeUndefined();
  });

  it("adds the Playwright Supabase host only on the preview policy", () => {
    const preview = previewHeaders(["https://example.supabase.co"]);
    expect(preview[CSP_REPORT_ONLY_HEADER]).toContain("https://example.supabase.co");
    expect(pagesHeadersFile()).not.toContain("example.supabase.co");
  });
});
