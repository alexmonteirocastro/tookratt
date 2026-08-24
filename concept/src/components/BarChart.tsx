import styles from "./BarChart.module.css";

export interface BarChartRow {
  key: string;
  label: string;
  count: number;
}

interface BarChartProps {
  caption: string;
  rows: BarChartRow[];
  emptyText: string;
  footnote?: string;
}

export function BarChart({ caption, rows, emptyText, footnote }: BarChartProps) {
  const maxCount = rows[0]?.count ?? 0;

  return (
    <figure className={styles.panel}>
      <figcaption className={styles.caption}>{caption}</figcaption>
      {rows.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <table className={styles.table}>
          <colgroup>
            <col className={styles.labelCol} />
            <col />
            <col className={styles.countCol} />
          </colgroup>
          <thead className={styles.srOnly}>
            <tr>
              <th scope="col">Label</th>
              <th scope="col">Distribution</th>
              <th scope="col">Value</th>
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
      {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
    </figure>
  );
}
