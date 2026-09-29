import type { ReactNode } from "react";
import { Mark } from "./Mark";
import styles from "./Auth.module.css";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.lockup}>
        <Mark className={styles.mark} />
        <h1 className={styles.wordmark}>töökratt</h1>
      </div>
      {children}
    </div>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <div className={styles.card}>{children}</div>;
}

export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}

export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className={styles.fieldError} role="alert">
      <ErrorIcon />
      {children}
    </p>
  );
}

function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function StateIcon({ name }: { name: "expired" | "revoked" | "paused" | "denied" }) {
  if (name === "expired") {
    return (
      <svg className={styles.stateIcon} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "paused") {
    return (
      <svg className={styles.stateIcon} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M10 9v6M14 9v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "denied") {
    return (
      <svg className={styles.stateIcon} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={styles.stateIcon} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
