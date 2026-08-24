import styles from "./LoadingIndicator.module.css";

interface LoadingIndicatorProps {
  label: string;
}

export function LoadingIndicator({ label }: LoadingIndicatorProps) {
  return (
    <div className={styles.wrapper} role="status" aria-live="polite">
      <span className={styles.dots} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
