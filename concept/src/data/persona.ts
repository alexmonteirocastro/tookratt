export const PERSONA = {
  yearsExperience: 8,
  seniority: "Senior",
  skills: ["Python", "React", "TypeScript", "Kubernetes", "AWS"] as const,
  targetRoles: ["Founding engineer", "Staff backend"] as const,
  searchQuery: "founding engineer",
};

export const ILLUSTRATIVE_SKILLS: readonly { skill: string; demand: number }[] = [
  { skill: "Python", demand: 92 },
  { skill: "React", demand: 81 },
  { skill: "Kubernetes", demand: 74 },
  { skill: "TypeScript", demand: 69 },
  { skill: "AWS", demand: 63 },
];

export const MATCH_PERCENTS = [94, 87, 81, 76, 71] as const;

export const ANALYZING_MS = 1500;
export const MATCH_STAGGER_MS = 600;
