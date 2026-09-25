import { rolesByCountDescending } from "../utils/statsLabels";
import styles from "./JobsPerRoleChart.module.css";

interface JobsPerRoleChartProps {
  jobsPerRole: Record<string, number>;
}

/**
 * ALE-192 Decision 1 — CSS horizontal bars, no chart library.
 * Baltic Blue fill on a Paper track; the count sits beside the bar. Sort descending; drop zero-count roles.
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
        <table className={styles.table} role="table">
          <colgroup>
            <col className={styles.labelCol} />
            <col />
            <col className={styles.countCol} />
          </colgroup>
          <thead className={styles.srOnly} role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                Role
              </th>
              <th scope="col" role="columnheader">
                Distribution
              </th>
              <th scope="col" role="columnheader">
                Jobs
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((row) => {
              const widthPercent = maxCount === 0 ? 0 : (row.count / maxCount) * 100;
              return (
                <tr key={row.key} className={styles.row} role="row">
                  <th scope="row" className={styles.label} role="rowheader">
                    {row.label}
                  </th>
                  <td className={styles.trackCell} role="cell">
                    <div className={styles.track} aria-hidden="true">
                      <div className={styles.bar} style={{ width: `${widthPercent}%` }} />
                    </div>
                  </td>
                  <td className={styles.count} role="cell">
                    {row.count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </figure>
  );
}
