import type { JobOpenings, JobSearchHit } from "../api/types";
import { PERSONA } from "../data/persona";
import { formatRoleLabel } from "../utils/statsLabels";

export function insightsIntro(stats: JobOpenings): string {
  return [
    `Here's a look at **Denmark** on The Hub right now: **${stats.total_jobs} open roles**, **${stats.remote_jobs} remote**, **${stats.paid_jobs} paid**.`,
    "",
    "The role mix is from the live corpus snapshot. The skills chart below is **illustrative** — not derived from listing text.",
    "",
    "Upload a CV and I'll sketch how a candidate like you would match. The file never leaves this browser.",
  ].join("\n");
}

export function profileReveal(): string {
  return [
    "Here's the profile I'm treating as yours for this preview (**not parsed from the file**):",
    "",
    `- **Seniority:** ${PERSONA.seniority}`,
    `- **Experience:** ${PERSONA.yearsExperience} years`,
    `- **Skills:** ${PERSONA.skills.join(", ")}`,
    `- **Target roles:** ${PERSONA.targetRoles.join(", ")}`,
    "",
    "Next I'll pull current listings for that target role. Match percentages are staged for the demo.",
  ].join("\n");
}

export function noMatchesTurn(): string {
  return [
    "No live matches right now for that target role.",
    "",
    "Replay the demo to try again.",
  ].join("\n");
}

export function matchTurn(hit: JobSearchHit, percent: number, bullets: string[]): string {
  const title = hit.job_title ?? hit.job_role;
  const company = hit.company ?? "a Nordic startup";
  const place = [hit.location, hit.country].filter(Boolean).join(", ");
  const remote = hit.remote ? " · Remote" : "";
  const why = bullets.map((bullet) => `- ${bullet}`).join("\n");

  return [
    `**${percent}% match** — [${title}](${hit.job_url}) at ${company}`,
    "",
    `${place}${remote}`,
    "",
    why,
  ].join("\n");
}

function listingSetting(hit: JobSearchHit): string {
  const place = hit.location || hit.country || "the Nordics";
  return hit.remote ? `Remote (${place})` : `On-site in ${place}`;
}

function salaryNote(hit: JobSearchHit): string {
  if (!hit.salary || hit.salary === "Competitive") {
    return "";
  }
  return ` Band: ${hit.salary}.`;
}

function hasEquity(hit: JobSearchHit): boolean {
  return hit.equity.toLowerCase() === "yes";
}

export function whyThisFits(hit: JobSearchHit, index: number): string[] {
  const title = hit.job_title ?? "this role";
  const company = hit.company ?? "this team";
  const skillA = PERSONA.skills[index % PERSONA.skills.length];
  const skillB = PERSONA.skills[(index + 2) % PERSONA.skills.length];
  const role = formatRoleLabel(hit.job_role);
  const setting = listingSetting(hit);
  const salary = salaryNote(hit);
  const equity = hasEquity(hit)
    ? "equity is on the table"
    : "no equity listed";

  const recipes: string[][] = [
    [
      `Founding-shaped ${title} seat — senior, ${PERSONA.yearsExperience} years is the seniority this hire is usually scoped for.`,
      `${skillA} plus ${skillB} covers the full-stack brief ${company} is posting.`,
      `${setting}, and ${equity}. That's the usual ${PERSONA.targetRoles[0].toLowerCase()} package.`,
    ],
    [
      `A ${title} role is a core-product IC seat; ${PERSONA.yearsExperience} years is enough to own it without looking overqualified.`,
      `${company}'s ${role} listing is a direct match for ${skillA} — the skill this candidate would lead with.`,
      `${setting}.${salary} Broadens the search past the exact title, same seniority band.`,
    ],
    [
      `${title} sits a half-step above senior. The backend-heavy ${PERSONA.yearsExperience}-year profile still looks ready, not stretched.`,
      `${skillA} and ${skillB} are the platform/backend screen ${company} would run.`,
      `${setting} — Nordic geography, ${equity}.`,
    ],
    [
      `Infra-shaped ${title} work overlaps your Kubernetes/AWS years more than a pure feature seat would.`,
      `${company} is hiring for ${role}; ${skillA} is the strongest overlap from your profile.`,
      `${setting}.${salary} ${hasEquity(hit) ? "Equity keeps it founding-adjacent." : "More of a senior IC hire than a founding stake."}`,
    ],
    [
      `${title} is a frontend-shaped take on the same senior full-stack brief; the level (${PERSONA.yearsExperience} years) still matches.`,
      `${skillA} is the interview bar; ${skillB} is the depth ${company} would notice.`,
      `${setting}.${salary} Same seniority band, same candidate pool.`,
    ],
  ];

  return recipes[index % recipes.length] ?? recipes[0];
}
