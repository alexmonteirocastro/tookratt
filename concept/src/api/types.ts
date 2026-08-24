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

export interface JobSearchHit {
  score: number;
  job_id: string;
  job_url: string;
  job_title: string | null;
  company: string | null;
  job_role: string;
  country: string;
  location: string;
  remote: boolean;
  salary_type: string;
  salary: string;
  equity: string;
}

export interface JobSearchResponse {
  query: string;
  results: JobSearchHit[];
}

export interface DemoPayload {
  stats: JobOpenings;
  search: JobSearchResponse;
}
