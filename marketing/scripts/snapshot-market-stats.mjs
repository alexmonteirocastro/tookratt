import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const COUNTRIES = ["DK", "SE", "NO", "FI", "IS", "EU"];
export const DEFAULT_API_ORIGIN = "https://hubster-alpi.onrender.com";
const REQUEST_TIMEOUT_MS = 90_000;

export function apiKeyFromEnv(env) {
  const raw = env.TOOKRATT_API_KEYS || env.HUBSTER_API_KEYS || "";
  const key = raw
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  return key || null;
}

export function countryStats(body) {
  if (
    typeof body?.total_jobs !== "number" ||
    typeof body?.remote_jobs !== "number" ||
    typeof body?.paid_jobs !== "number" ||
    body?.jobs_per_role == null ||
    typeof body.jobs_per_role !== "object" ||
    Array.isArray(body.jobs_per_role)
  ) {
    throw new Error("unexpected /jobs/stats shape");
  }
  return {
    total_jobs: body.total_jobs,
    remote_jobs: body.remote_jobs,
    paid_jobs: body.paid_jobs,
    jobs_per_role: body.jobs_per_role,
  };
}

export function buildSnapshot(generatedAt, countries) {
  return {
    generated_at: generatedAt,
    countries,
  };
}

async function fetchCountry(fetchImpl, origin, key, code) {
  const url = new URL("/jobs/stats", origin);
  url.searchParams.set("country", code);
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${code} returned ${response.status}`);
  }
  return countryStats(await response.json());
}

export async function snapshotMarketStats({
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
  outPath,
} = {}) {
  const key = apiKeyFromEnv(env);
  if (!key) {
    console.log("market stats: no API key, leaving numbers out of this build");
    await rm(outPath, { force: true });
    return { written: false };
  }

  const origin = env.MARKET_STATS_API_URL?.trim() || DEFAULT_API_ORIGIN;
  try {
    const countries = {};
    for (const code of COUNTRIES) {
      countries[code] = await fetchCountry(fetchImpl, origin, key, code);
    }
    const snapshot = buildSnapshot(now().toISOString(), countries);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`market stats: wrote ${COUNTRIES.length} countries`);
    return { written: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(
      `market stats: fetch failed, build continues without numbers (${message})`,
    );
    await rm(outPath, { force: true });
    return { written: false };
  }
}

function isMainModule() {
  const entry = process.argv[1];
  return entry != null && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  const outPath = path.join(import.meta.dirname, "..", "public", "market-stats.json");
  await snapshotMarketStats({ outPath });
}
