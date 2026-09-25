import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const COUNTRIES = ["DK", "SE", "NO", "FI", "IS", "EU"];
export const DEFAULT_API_ORIGIN = "https://hubster-alpi.onrender.com";
export const LIVE_SNAPSHOT_URL = "https://tookratt.com/market-stats.json";
const COLD_TIMEOUT_MS = 90_000;
const WARM_TIMEOUT_MS = 20_000;

export function marketStatsPath(metaUrl = import.meta.url) {
  return fileURLToPath(new URL("../public/market-stats.json", metaUrl));
}

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

function isSnapshot(body) {
  return (
    typeof body?.generated_at === "string" &&
    body?.countries != null &&
    typeof body.countries === "object" &&
    !Array.isArray(body.countries) &&
    Object.keys(body.countries).length > 0
  );
}

async function fetchCountry(fetchImpl, origin, key, code, timeoutMs) {
  const url = new URL("/jobs/stats", origin);
  url.searchParams.set("country", code);
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${code} returned ${response.status}`);
  }
  return countryStats(await response.json());
}

async function writeSnapshot(outPath, snapshot) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

async function reuseLiveSnapshot(fetchImpl, liveSnapshotUrl, outPath) {
  const response = await fetchImpl(liveSnapshotUrl, {
    signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`live snapshot returned ${response.status}`);
  }
  const body = await response.json();
  if (!isSnapshot(body)) {
    throw new Error("unexpected live snapshot shape");
  }
  const countries = {};
  for (const [code, stats] of Object.entries(body.countries)) {
    try {
      countries[code] = countryStats(stats);
    } catch {
      console.error(`market stats: live snapshot skipped ${code}`);
    }
  }
  if (Object.keys(countries).length === 0) {
    throw new Error("live snapshot had no usable countries");
  }
  await writeSnapshot(outPath, { generated_at: body.generated_at, countries });
}

export async function snapshotMarketStats({
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
  outPath,
  liveSnapshotUrl = LIVE_SNAPSHOT_URL,
} = {}) {
  try {
    const key = apiKeyFromEnv(env);
    if (!key) {
      console.log("market stats: no API key, leaving numbers out of this build");
      await rm(outPath, { force: true });
      return { written: false };
    }

    const origin = env.MARKET_STATS_API_URL?.trim() || DEFAULT_API_ORIGIN;
    const countries = {};
    const failed = [];
    let timeoutMs = COLD_TIMEOUT_MS;
    for (const code of COUNTRIES) {
      try {
        countries[code] = await fetchCountry(fetchImpl, origin, key, code, timeoutMs);
        timeoutMs = WARM_TIMEOUT_MS;
      } catch (error) {
        failed.push(code);
        const message = error instanceof Error ? error.message : "unknown error";
        console.error(`market stats: ${code} failed (${message})`);
      }
    }

    if (Object.keys(countries).length > 0) {
      await writeSnapshot(outPath, buildSnapshot(now().toISOString(), countries));
      const skipped = failed.length > 0 ? `, skipped ${failed.join(", ")}` : "";
      console.log(`market stats: wrote ${Object.keys(countries).length} countries${skipped}`);
      return { written: true, failed };
    }

    try {
      await reuseLiveSnapshot(fetchImpl, liveSnapshotUrl, outPath);
      console.error(
        "market stats: every country failed, reusing the snapshot already on tookratt.com",
      );
      return { written: true, failed, reused: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(
        `market stats: fetch failed, build continues without numbers (${message})`,
      );
      await rm(outPath, { force: true });
      return { written: false, failed };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(
      `market stats: snapshot failed, build continues without numbers (${message})`,
    );
    if (outPath) {
      await rm(outPath, { force: true }).catch(() => {});
    }
    return { written: false };
  }
}

function isMainModule() {
  const entry = process.argv[1];
  return entry != null && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  try {
    await snapshotMarketStats({ outPath: marketStatsPath() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(
      `market stats: snapshot failed, build continues without numbers (${message})`,
    );
  }
}
