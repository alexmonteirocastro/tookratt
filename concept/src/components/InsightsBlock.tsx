import type { JobOpenings } from "../api/types";
import { ILLUSTRATIVE_SKILLS } from "../data/persona";
import { rolesByCountDescending } from "../utils/statsLabels";
import { BarChart } from "./BarChart";
import styles from "./InsightsBlock.module.css";

const TOP_ROLES = 8;

interface InsightsBlockProps {
  stats: JobOpenings;
}

function kpiTiles(stats: JobOpenings): { label: string; value: number }[] {
  return [
    { label: "Total jobs", value: stats.total_jobs },
    { label: "Remote", value: stats.remote_jobs },
    { label: "Paid", value: stats.paid_jobs },
  ];
}

export function InsightsBlock({ stats }: InsightsBlockProps) {
  const roleRows = rolesByCountDescending(stats.jobs_per_role)
    .slice(0, TOP_ROLES)
    .map((row) => ({ key: row.key, label: row.label, count: row.count }));
  const skillRows = ILLUSTRATIVE_SKILLS.map((row) => ({
    key: row.skill,
    label: row.skill,
    count: row.demand,
  }));

  return (
    <div className={styles.block}>
      <ul className={styles.kpis}>
        {kpiTiles(stats).map((tile) => (
          <li key={tile.label} className={styles.kpi}>
            <p className={styles.kpiValue}>{tile.value}</p>
            <p className={styles.kpiLabel}>{tile.label}</p>
          </li>
        ))}
      </ul>
      <BarChart
        caption="Jobs per role"
        rows={roleRows}
        emptyText="No roles to show."
      />
      <BarChart
        caption="Top in-demand skills"
        rows={skillRows}
        emptyText="No skills to show."
        footnote="Illustrative — not derived from listing text or corpus aggregation."
      />
    </div>
  );
}
