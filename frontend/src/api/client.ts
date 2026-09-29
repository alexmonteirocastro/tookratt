import { armSessionEndedNote, markUserAskedToLeave, signOutLocal } from "./authSession";
import { supabase } from "./supabase";
import type {
  ActionLink,
  AdminUserList,
  ChatRequest,
  ChatResponse,
  CountryCode,
  JobOpenings,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

/** GoTrue list_users page size. A full page means another page may exist. */
export const ADMIN_PAGE_SIZE = 50;

/** Default for local dev / Ollama; production builds set VITE_CHAT_REQUEST_TIMEOUT_MS via .env.production. */
export const DEFAULT_CHAT_REQUEST_TIMEOUT_MS = 600_000;

function parseChatRequestTimeoutMs(): number {
  const raw = import.meta.env.VITE_CHAT_REQUEST_TIMEOUT_MS;
  if (raw === undefined || raw === "") {
    return DEFAULT_CHAT_REQUEST_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CHAT_REQUEST_TIMEOUT_MS;
  }
  return parsed;
}

/** Browser-side /chat fetch timeout; should be ≥ the proxy timeout in each environment. */
export const CHAT_REQUEST_TIMEOUT_MS = parseChatRequestTimeoutMs();

/**
 * Default matches backend `DEFAULT_CHAT_QUESTION_MAX_LENGTH` (db/settings.py).
 * Keep `VITE_CHAT_QUESTION_MAX_LENGTH` in sync with `CHAT_QUESTION_MAX_LENGTH` if either is tuned.
 */
export const DEFAULT_CHAT_QUESTION_MAX_LENGTH = 500;

function parseChatQuestionMaxLength(): number {
  const raw = import.meta.env.VITE_CHAT_QUESTION_MAX_LENGTH;
  if (raw === undefined || raw === "") {
    return DEFAULT_CHAT_QUESTION_MAX_LENGTH;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return DEFAULT_CHAT_QUESTION_MAX_LENGTH;
  }
  return parsed;
}

/** Client-side textarea max length; mirrors backend `CHAT_QUESTION_MAX_LENGTH`. */
export const CHAT_QUESTION_MAX_LENGTH = parseChatQuestionMaxLength();

/**
 * Default matches backend `DEFAULT_CHAT_HISTORY_MAX_TURNS` (db/settings.py).
 * Keep `VITE_CHAT_HISTORY_MAX_TURNS` in sync with `CHAT_HISTORY_MAX_TURNS` if either is tuned.
 */
export const DEFAULT_CHAT_HISTORY_MAX_TURNS = 5;

function parseChatHistoryMaxTurns(): number {
  const raw = import.meta.env.VITE_CHAT_HISTORY_MAX_TURNS;
  if (raw === undefined || raw === "") {
    return DEFAULT_CHAT_HISTORY_MAX_TURNS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return DEFAULT_CHAT_HISTORY_MAX_TURNS;
  }
  return parsed;
}

/**
 * Sliding window advertised in the chat banner. Mirrors backend
 * `CHAT_HISTORY_MAX_TURNS` (`db/settings.py`).
 */
export const CHAT_HISTORY_MAX_TURNS = parseChatHistoryMaxTurns();

export class ApiNetworkError extends Error {
  constructor(message = "Unable to reach the API. Check your connection and try again.") {
    super(message);
    this.name = "ApiNetworkError";
  }
}

export class ApiTimeoutError extends ApiNetworkError {
  constructor(
    message = "The request timed out. Local generation can take several minutes — please try again.",
  ) {
    super(message);
    this.name = "ApiTimeoutError";
  }
}

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, detail?: string, code?: string) {
    const message = detail ?? defaultHttpMessage(status);
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
  }
}

let unauthorizedHandler: (() => void | Promise<void>) | null = null;

export function setUnauthorizedHandler(handler: (() => void | Promise<void>) | null): void {
  unauthorizedHandler = handler;
}

function defaultHttpMessage(status: number): string {
  if (status === 401) {
    return "Your session has ended.";
  }
  if (status === 429) {
    return "The service is rate-limited. Please wait a moment and try again.";
  }
  if (status >= 500) {
    return "The server encountered an error. Please try again later.";
  }
  return `Request failed with status ${status}.`;
}

interface ParsedError {
  message?: string;
  code?: string;
}

export async function parseErrorDetail(response: Response): Promise<ParsedError> {
  try {
    const body = (await response.json()) as {
      detail?: string | { msg: string }[] | { message: string; code?: string };
    };
    if (typeof body.detail === "string") {
      return { message: body.detail };
    }
    if (
      typeof body.detail === "object" &&
      body.detail !== null &&
      !Array.isArray(body.detail) &&
      "message" in body.detail
    ) {
      return {
        message: body.detail.message,
        code: typeof body.detail.code === "string" ? body.detail.code : undefined,
      };
    }
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      return { message: body.detail.map((item) => item.msg).join("; ") };
    }
  } catch {
    // Response body is not JSON — fall back to generic message.
  }
  return {};
}

/**
 * `getSession()` refreshes a session that is expired or close to expiry.
 * Do not call `refreshSession()` as well. That races the background refresh.
 */
async function accessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return null;
  }
  return data.session?.access_token ?? null;
}

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extra,
  };
  const token = await accessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function failAuth(): Promise<void> {
  markUserAskedToLeave();
  armSessionEndedNote();
  await signOutLocal();
  await unauthorizedHandler?.();
}

async function throwHttp(response: Response): Promise<never> {
  const parsed = await parseErrorDetail(response);
  throw new ApiHttpError(response.status, parsed.message, parsed.code);
}

async function readResponse(response: Response): Promise<Response> {
  if (response.status === 401) {
    await failAuth();
    await throwHttp(response);
  }
  if (!response.ok) {
    await throwHttp(response);
  }
  return response;
}

export async function postChat(request: ChatRequest): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiTimeoutError();
    }
    throw new ApiNetworkError();
  } finally {
    clearTimeout(timeoutId);
  }

  await readResponse(response);
  return (await response.json()) as ChatResponse;
}

export async function getJobsStats(country: CountryCode): Promise<JobOpenings> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/jobs/stats?country=${encodeURIComponent(country)}`, {
      headers: await authHeaders(),
    });
  } catch {
    throw new ApiNetworkError();
  }

  await readResponse(response);
  return (await response.json()) as JobOpenings;
}

export async function listAdminUsers(page = 1): Promise<AdminUserList> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/admin/users?page=${page}`, {
      headers: await authHeaders(),
    });
  } catch {
    throw new ApiNetworkError();
  }
  await readResponse(response);
  return (await response.json()) as AdminUserList;
}

export async function createInvite(email: string): Promise<string> {
  const body = await postAdmin("/admin/invites", { email });
  return readActionLink(body);
}

export async function revokeUser(userId: string): Promise<void> {
  await postAdmin(`/admin/users/${userId}/revoke`);
}

export async function restoreUser(userId: string): Promise<void> {
  await postAdmin(`/admin/users/${userId}/restore`);
}

export async function createResetLink(userId: string): Promise<string> {
  const body = await postAdmin(`/admin/users/${userId}/reset-link`);
  return readActionLink(body);
}

async function postAdmin(path: string, body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: await authHeaders(body === undefined ? undefined : { "Content-Type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiNetworkError();
  }
  await readResponse(response);
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function readActionLink(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "action_link" in body &&
    typeof body.action_link === "string" &&
    body.action_link
  ) {
    return (body as ActionLink).action_link;
  }
  throw new ApiHttpError(502, "Auth service is unavailable.", "auth_unavailable");
}
