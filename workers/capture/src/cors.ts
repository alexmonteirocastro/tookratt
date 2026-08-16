/** Allowed browser origins for the marketing landing page (ADR-0016 / ALE-177). */
export const ALLOWED_ORIGINS = new Set([
  "https://tookratt.com",
  "https://www.tookratt.com",
]);

export function isAllowedOrigin(origin: string | null): boolean {
  return origin !== null && ALLOWED_ORIGINS.has(origin);
}

/**
 * CORS headers for a request Origin.
 * Omits Access-Control-Allow-Origin when the origin is missing or not allowed,
 * so the header only ever reflects a real allow-listed origin.
 */
export function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
  }
  return headers;
}
