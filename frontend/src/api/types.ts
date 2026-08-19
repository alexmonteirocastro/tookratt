export type CountryCode = "DK" | "SE" | "NO" | "FI" | "IS" | "EU";

export interface JobOpenings {
  total_jobs: number;
  number_of_pages: number;
  jobs_per_page: number;
  jobs_per_role: Record<string, number>;
  remote_jobs: number;
  paid_jobs: number;
  unpaid_jobs: number;
}

export interface ChatRequest {
  question: string;
  limit?: number;
  country?: CountryCode | null;
  remote?: boolean | null;
  session_id?: string | null;
}

export interface ChatSource {
  score: number;
  job_id: string;
  job_url: string;
  job_role: string;
  document_text: string;
  job_title?: string | null;
  company?: string | null;
  country?: string | null;
  location?: string | null;
}

export interface ChatResponse {
  question: string;
  answer: string;
  sources: ChatSource[];
  generated: boolean;
  applied_country?: CountryCode | null;
  applied_remote?: boolean | null;
  session_id: string;
}
