import type { CountryCode } from "../api/types";

export const COUNTRY_OPTIONS: readonly { code: CountryCode; name: string }[] = [
  { code: "DK", name: "Denmark" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "FI", name: "Finland" },
  { code: "IS", name: "Iceland" },
  { code: "EU", name: "Europe" },
];

/** Sentence case, with acronyms (CXO, UX/UI, DevOps) spelled explicitly. */
const ROLE_LABELS: Record<string, string> = {
  cxo: "CXO",
  human_resources: "Human resources",
  finance: "Finance",
  legal: "Legal",
  marketing: "Marketing",
  sales: "Sales",
  customer_service: "Customer service",
  customer_success: "Customer success",
  analyst: "Analyst",
  business_development: "Business development",
  operations: "Operations",
  product_management: "Product management",
  project_management: "Project management",
  design: "Design",
  ux_ui_designer: "UX/UI designer",
  engineer: "Engineer",
  full_stack_developer: "Full-stack developer",
  frontend_developer: "Frontend developer",
  backend_developer: "Backend developer",
  mobile_development: "Mobile development",
  quality_assurance: "Quality assurance",
  devops: "DevOps",
  data_science: "Data science",
  other: "Other",
};

/**
 * Unknown Hub keys stay sentence case so they match ROLE_LABELS
 * ("Staff engineer", not "Staff Engineer"). Don't switch this fallback to
 * title case without updating the map.
 */
export function formatRoleLabel(key: string): string {
  if (ROLE_LABELS[key]) {
    return ROLE_LABELS[key];
  }
  return key
    .split("_")
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part,
    )
    .join(" ");
}

export interface RoleCount {
  key: string;
  label: string;
  count: number;
}

export function rolesByCountDescending(jobsPerRole: Record<string, number>): RoleCount[] {
  return Object.entries(jobsPerRole)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ key, label: formatRoleLabel(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
