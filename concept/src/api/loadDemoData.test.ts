import { describe, expect, it, vi } from "vitest";
import snapshot from "../data/snapshot.json";
import { loadDemoData, type DemoDataOptions } from "./loadDemoData";
import type { JobOpenings, JobSearchResponse } from "./types";

const liveStats: JobOpenings = {
  ...snapshot.stats,
  total_jobs: 12,
};

const liveSearch: JobSearchResponse = {
  query: "founding engineer",
  results: snapshot.search.results.slice(0, 2),
};

function options(overrides: Partial<DemoDataOptions> & Pick<DemoDataOptions, "fetchImpl">): DemoDataOptions {
  return {
    useSnapshot: false,
    apiKey: "demo-key",
    apiBaseUrl: "/api",
    ...overrides,
  };
}

describe("loadDemoData", () => {
  it("returns the snapshot when useSnapshot is true without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const payload = await loadDemoData(
      options({ useSnapshot: true, fetchImpl }),
    );
    expect(payload.stats.total_jobs).toBe(snapshot.stats.total_jobs);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the snapshot when no API key is set", async () => {
    const fetchImpl = vi.fn();
    const payload = await loadDemoData(
      options({ useSnapshot: false, apiKey: "", fetchImpl }),
    );
    expect(payload.stats.total_jobs).toBe(snapshot.stats.total_jobs);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses live stats and search when opted in with a key", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/jobs/stats")) {
        return new Response(JSON.stringify(liveStats), { status: 200 });
      }
      if (url.includes("/jobs/search")) {
        return new Response(JSON.stringify(liveSearch), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const payload = await loadDemoData(options({ fetchImpl }));
    expect(payload.stats.total_jobs).toBe(12);
    expect(payload.search.results).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/jobs/stats?country=DK"))).toBe(true);
    expect(urls.some((url) => url.includes("/jobs/search?"))).toBe(true);
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer demo-key");
  });

  it("falls back to the snapshot when a live call fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    const payload = await loadDemoData(options({ fetchImpl }));
    expect(payload.stats.total_jobs).toBe(snapshot.stats.total_jobs);
    expect(payload.search.results).toHaveLength(snapshot.search.results.length);
  });

  it("falls back to the snapshot when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const payload = await loadDemoData(options({ fetchImpl }));
    expect(payload.stats.total_jobs).toBe(snapshot.stats.total_jobs);
  });
});
