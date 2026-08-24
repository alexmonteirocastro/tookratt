import type { CountryCode, JobOpenings, JobSearchResponse } from "./types";

export class DemoApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "DemoApiError";
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

export interface LiveClientOptions {
  apiBaseUrl: string;
  apiKey: string;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function getJson<T>(
  url: string,
  options: LiveClientOptions,
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: authHeaders(options.apiKey),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new DemoApiError("The request timed out.");
    }
    throw new DemoApiError("Unable to reach the API.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new DemoApiError(`Request failed with status ${response.status}.`, response.status);
  }

  return (await response.json()) as T;
}

export async function fetchJobsStats(
  country: CountryCode,
  options: LiveClientOptions,
): Promise<JobOpenings> {
  const url = `${options.apiBaseUrl}/jobs/stats?country=${encodeURIComponent(country)}`;
  return getJson<JobOpenings>(url, options);
}

export async function fetchJobsSearch(
  query: string,
  options: LiveClientOptions,
  limit = 5,
): Promise<JobSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    country: "DK",
  });
  const url = `${options.apiBaseUrl}/jobs/search?${params.toString()}`;
  return getJson<JobSearchResponse>(url, options);
}
