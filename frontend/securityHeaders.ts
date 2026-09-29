/**
 * Source of truth for the app Pages security headers (ALE-218).
 * `frontend/public/_headers` must match `pagesHeadersFile()`.
 * Enforcement is ALE-249: rename the CSP header after a clean report-only day.
 */

export const PRODUCTION_API_ORIGIN = "https://hubster-alpi.onrender.com";
export const PRODUCTION_SUPABASE_ORIGIN = "https://jogkvchexsfiwezdpirb.supabase.co";

export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

const CONNECT_SRC = ["'self'", PRODUCTION_API_ORIGIN, PRODUCTION_SUPABASE_ORIGIN] as const;

/**
 * Report-only policy for the production bundle.
 * `extraConnectSrc` is for the Playwright preview only (`https://example.supabase.co`).
 * It must not appear in `public/_headers`.
 *
 * `style-src-attr` is omitted. React sets the jobs-per-role bar width through the
 * DOM style API, which CSP does not treat as an HTML style attribute.
 */
export function contentSecurityPolicy(extraConnectSrc: readonly string[] = []): string {
  const connectSrc = [...CONNECT_SRC, ...extraConnectSrc].join(" ");
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Enforced on every response. `frame-ancestors` is ignored inside a report-only
 * policy, so `X-Frame-Options` is the clickjacking control until ALE-249.
 */
export const ENFORCED_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function pagesHeadersFile(policy: string = contentSecurityPolicy()): string {
  const headerLines = [
    `  ${CSP_REPORT_ONLY_HEADER}: ${policy}`,
    ...Object.entries(ENFORCED_SECURITY_HEADERS).map(([name, value]) => `  ${name}: ${value}`),
  ];
  return ["/*", ...headerLines, ""].join("\n");
}

/**
 * Vite inlines assets under 4 kB. A small @fontsource subset would become a
 * `data:` font that `font-src 'self'` blocks, and English pages never request it.
 * Font files stay external whatever their size. Other assets keep Vite's default.
 */
export function assetInlineLimit(filePath: string): boolean | undefined {
  if (filePath.endsWith(".woff") || filePath.endsWith(".woff2")) {
    return false;
  }
  return undefined;
}

/** Headers for `vite preview`. Not applied to `vite dev`. */
export function previewHeaders(
  extraConnectSrc: readonly string[] = [],
): Record<string, string> {
  return {
    [CSP_REPORT_ONLY_HEADER]: contentSecurityPolicy(extraConnectSrc),
    ...ENFORCED_SECURITY_HEADERS,
  };
}
