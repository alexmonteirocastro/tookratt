import { useEffect, useState } from "react";
import { ApiHttpError, ApiNetworkError, getJobsStats } from "../api/client";
import type { CountryCode, JobOpenings } from "../api/types";
import { CountrySelector } from "./CountrySelector";
import { JobsPerRoleChart } from "./JobsPerRoleChart";
import styles from "./Stats.module.css";

const DEFAULT_COUNTRY: CountryCode = "DK";

interface StatsProps {
  enabled: boolean;
}

interface KpiTile {
  label: string;
  value: number;
}

function kpiTiles(data: JobOpenings): KpiTile[] {
  const onSite = Math.max(0, data.total_jobs - data.remote_jobs);
  return [
    { label: "Total jobs", value: data.total_jobs },
    { label: "Remote", value: data.remote_jobs },
    { label: "On-site", value: onSite },
    { label: "Paid", value: data.paid_jobs },
    { label: "Unpaid", value: data.unpaid_jobs },
  ];
}

export function Stats({ enabled }: StatsProps) {
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [data, setData] = useState<JobOpenings | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getJobsStats(country)
      .then((stats) => {
        if (!cancelled) {
          setData(stats);
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiHttpError && caught.status === 401) {
          setData(null);
          return;
        }
        const message =
          caught instanceof ApiNetworkError || caught instanceof ApiHttpError
            ? caught.message
            : "Something went wrong. Please try again.";
        setError(message);
        setData(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [country, enabled]);

  return (
    <div className={styles.stats}>
      <CountrySelector value={country} onChange={setCountry} disabled={!enabled || isLoading} />
      {isLoading ? (
        <p className={styles.status} role="status">
          Loading job stats…
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {data ? (
        <>
          <ul className={styles.kpis}>
            {kpiTiles(data).map((tile) => (
              <li key={tile.label} className={styles.kpi}>
                <p className={styles.kpiValue}>{tile.value}</p>
                <p className={styles.kpiLabel}>{tile.label}</p>
              </li>
            ))}
          </ul>
          <JobsPerRoleChart jobsPerRole={data.jobs_per_role} />
        </>
      ) : null}
    </div>
  );
}
