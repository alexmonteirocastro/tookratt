import { PERSONA } from "../data/persona";
import { fetchJobsSearch, fetchJobsStats, type LiveClientOptions } from "./client";
import { loadSnapshot } from "./loadSnapshot";
import type { DemoPayload } from "./types";

export interface DemoDataOptions {
  useSnapshot: boolean;
  apiKey: string;
  apiBaseUrl: string;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export function readDemoDataOptions(): DemoDataOptions {
  return {
    useSnapshot: import.meta.env.VITE_USE_SNAPSHOT !== "false",
    apiKey: import.meta.env.VITE_DEMO_API_KEY?.trim() ?? "",
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api",
  };
}

async function loadLive(options: DemoDataOptions): Promise<DemoPayload> {
  const client: LiveClientOptions = {
    apiBaseUrl: options.apiBaseUrl,
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
  };
  const [stats, search] = await Promise.all([
    fetchJobsStats("DK", client),
    fetchJobsSearch(PERSONA.searchQuery, client, 5),
  ]);
  return { stats, search };
}

/** Snapshot by default. Live only when explicitly opted in with a key; any failure falls back. */
export async function loadDemoData(
  options: DemoDataOptions = readDemoDataOptions(),
): Promise<DemoPayload> {
  if (options.useSnapshot || options.apiKey === "") {
    return loadSnapshot();
  }
  try {
    return await loadLive(options);
  } catch {
    return loadSnapshot();
  }
}
