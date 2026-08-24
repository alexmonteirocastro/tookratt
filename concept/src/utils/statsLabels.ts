export interface RoleCount {
  key: string;
  label: string;
  count: number;
}

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

export function rolesByCountDescending(jobsPerRole: Record<string, number>): RoleCount[] {
  return Object.entries(jobsPerRole)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ key, label: formatRoleLabel(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
