import type { JobOpenings, JobSearchHit } from "../api/types";
import { PERSONA } from "../data/persona";

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

export function whyThisFits(hit: JobSearchHit, index: number): string[] {
  const title = hit.job_title ?? "this role";
  const company = hit.company ?? "this team";
  const skill = PERSONA.skills[index % PERSONA.skills.length];
  return [
    `${PERSONA.seniority} ${PERSONA.yearsExperience}-year profile matches a ${title} seat.`,
    `Your ${skill} experience is a direct fit for what ${company} is hiring.`,
    `Target role (${PERSONA.targetRoles[0]}) lines up with this listing.`,
  ];
}
