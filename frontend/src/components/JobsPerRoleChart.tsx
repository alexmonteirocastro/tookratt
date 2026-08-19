import { rolesByCountDescending } from "../utils/statsLabels";
import styles from "./JobsPerRoleChart.module.css";

interface JobsPerRoleChartProps {
  jobsPerRole: Record<string, number>;
}

/**
 * ALE-192 Decision 1 — CSS horizontal bars, no chart library.
 * Teal fill on a parchment track; amber is reserved for the count (text on
 * cream, not text on amber). Sort descending; drop zero-count roles.
 */
export function JobsPerRoleChart({ jobsPerRole }: JobsPerRoleChartProps) {
  const rows = rolesByCountDescending(jobsPerRole);
  const maxCount = rows[0]?.count ?? 0;

  return (
    <figure className={styles.panel}>
      <figcaption className={styles.caption}>Jobs per role</figcaption>
      {rows.length === 0 ? (
        <p className={styles.empty}>No roles to show for this country.</p>
      ) : (
        <table className={styles.table}>
          <thead className={styles.srOnly}>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Distribution</th>
              <th scope="col">Jobs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const widthPercent = maxCount === 0 ? 0 : (row.count / maxCount) * 100;
              return (
                <tr key={row.key} className={styles.row}>
                  <th scope="row" className={styles.label}>
                    {row.label}
                  </th>
                  <td className={styles.trackCell}>
                    <div className={styles.track} aria-hidden="true">
                      <div className={styles.bar} style={{ width: `${widthPercent}%` }} />
                    </div>
                  </td>
                  <td className={styles.count}>{row.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </figure>
  );
}
