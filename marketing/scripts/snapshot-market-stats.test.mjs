import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  COUNTRIES,
  apiKeyFromEnv,
  buildSnapshot,
  countryStats,
  marketStatsPath,
  snapshotMarketStats,
} from "./snapshot-market-stats.mjs";

function statsBody() {
  return {
    total_jobs: 10,
    number_of_pages: 1,
    jobs_per_page: 10,
    remote_jobs: 2,
    paid_jobs: 8,
    unpaid_jobs: 2,
    jobs_per_role: { design: 1 },
  };
}

test("marketStatsPath does not depend on import.meta.dirname", () => {
  const filePath = marketStatsPath(import.meta.url);
  assert.equal(filePath.endsWith(`${path.sep}public${path.sep}market-stats.json`), true);
});

test("apiKeyFromEnv uses the first comma-separated key", () => {
  assert.equal(apiKeyFromEnv({ TOOKRATT_API_KEYS: " first , second " }), "first");
  assert.equal(apiKeyFromEnv({ HUBSTER_API_KEYS: "legacy" }), "legacy");
  assert.equal(apiKeyFromEnv({}), null);
});

test("countryStats keeps the band fields and drops page counts", () => {
  const stats = countryStats({
    total_jobs: 12,
    number_of_pages: 2,
    jobs_per_page: 10,
    remote_jobs: 4,
    paid_jobs: 9,
    unpaid_jobs: 3,
    jobs_per_role: { backend_developer: 5 },
  });
  assert.deepEqual(stats, {
    total_jobs: 12,
    remote_jobs: 4,
    paid_jobs: 9,
    jobs_per_role: { backend_developer: 5 },
  });
});

test("countryStats rejects a body that is not the stats shape", () => {
  assert.throws(() => countryStats({ total_jobs: 1 }), /unexpected/);
});

test("buildSnapshot keys countries under generated_at", () => {
  const snapshot = buildSnapshot("2026-09-25T00:00:00.000Z", { DK: { total_jobs: 1 } });
  assert.equal(snapshot.generated_at, "2026-09-25T00:00:00.000Z");
  assert.deepEqual(Object.keys(snapshot.countries), ["DK"]);
});

test("snapshotMarketStats writes all six countries and nothing else", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "market-stats-"));
  const outPath = path.join(dir, "market-stats.json");
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url.searchParams.get("country"));
    return {
      ok: true,
      async json() {
        return statsBody();
      },
    };
  };

  try {
    const result = await snapshotMarketStats({
      env: { TOOKRATT_API_KEYS: "secret" },
      fetchImpl,
      now: () => new Date("2026-09-25T00:00:00.000Z"),
      outPath,
    });
    assert.equal(result.written, true);
    assert.deepEqual(seen, COUNTRIES);
    const written = JSON.parse(await readFile(outPath, "utf8"));
    assert.equal(written.generated_at, "2026-09-25T00:00:00.000Z");
    assert.deepEqual(Object.keys(written.countries), COUNTRIES);
    assert.equal(written.countries.DK.unpaid_jobs, undefined);
    assert.equal(written.countries.EU.total_jobs, 10);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("snapshotMarketStats skips the file when the key is missing", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "market-stats-"));
  const outPath = path.join(dir, "market-stats.json");
  try {
    const result = await snapshotMarketStats({ env: {}, outPath });
    assert.equal(result.written, false);
    await assert.rejects(readFile(outPath, "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("snapshotMarketStats keeps the countries that succeed", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "market-stats-"));
  const outPath = path.join(dir, "market-stats.json");
  const fetchImpl = async (url) => {
    if (url.searchParams?.get("country") === "IS") {
      return { ok: false, status: 503, async json() {} };
    }
    return { ok: true, async json() { return statsBody(); } };
  };
  try {
    const result = await snapshotMarketStats({
      env: { TOOKRATT_API_KEYS: "secret" },
      fetchImpl,
      now: () => new Date("2026-09-25T00:00:00.000Z"),
      outPath,
    });
    assert.equal(result.written, true);
    assert.deepEqual(result.failed, ["IS"]);
    const written = JSON.parse(await readFile(outPath, "utf8"));
    assert.deepEqual(Object.keys(written.countries), ["DK", "SE", "NO", "FI", "EU"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("snapshotMarketStats reuses the live file when every country fails", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "market-stats-"));
  const outPath = path.join(dir, "market-stats.json");
  const fetchImpl = async (url) => {
    if (String(url).includes("tookratt.com")) {
      return {
        ok: true,
        async json() {
          return {
            generated_at: "2026-09-24T00:00:00.000Z",
            countries: { DK: statsBody() },
          };
        },
      };
    }
    return { ok: false, status: 503, async json() {} };
  };
  try {
    const result = await snapshotMarketStats({
      env: { TOOKRATT_API_KEYS: "secret" },
      fetchImpl,
      now: () => new Date("2026-09-25T00:00:00.000Z"),
      outPath,
    });
    assert.equal(result.written, true);
    assert.equal(result.reused, true);
    const written = JSON.parse(await readFile(outPath, "utf8"));
    assert.equal(written.generated_at, "2026-09-24T00:00:00.000Z");
    assert.equal(written.countries.DK.total_jobs, 10);
    assert.equal(written.countries.DK.unpaid_jobs, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("snapshotMarketStats does not fail the build when every fetch fails", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "market-stats-"));
  const outPath = path.join(dir, "market-stats.json");
  const fetchImpl = async () => ({ ok: false, status: 503, async json() {} });
  try {
    const result = await snapshotMarketStats({
      env: { TOOKRATT_API_KEYS: "secret" },
      fetchImpl,
      outPath,
    });
    assert.equal(result.written, false);
    await assert.rejects(readFile(outPath, "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
