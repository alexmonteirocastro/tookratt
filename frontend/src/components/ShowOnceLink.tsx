import { useEffect, useState } from "react";
import styles from "./ShowOnceLink.module.css";

interface ShowOnceLinkProps {
  kind: "invite" | "reset";
  email: string;
  actionLink: string;
  onDone: () => void;
}

export function ShowOnceLink({ kind, email, actionLink, onDone }: ShowOnceLinkProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(actionLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={styles.panel} aria-label={kind === "invite" ? "Invite link" : "Reset link"}>
      <div className={styles.header}>
        <h3 className={styles.heading}>
          {kind === "invite" ? "Invite link" : "Reset link"} for {email}
        </h3>
        <button type="button" className={`${styles.done} ${styles.doneDesktop}`} onClick={onDone}>
          Done
        </button>
      </div>
      <div className={styles.fieldRow}>
        <input className={styles.link} readOnly value={actionLink} aria-label="Link" />
        <button type="button" className={styles.copy} onClick={() => void copyLink()}>
          <CopyIcon />
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className={styles.warning}>
        <WarningIcon />
        <span>
          It works once, after the password is saved. It lasts 24 hours and won't be shown again.
        </span>
      </p>
      <button type="button" className={`${styles.done} ${styles.doneMobile}`} onClick={onDone}>
        Done
      </button>
    </section>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className={styles.warningIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="false">
      <title>Warning</title>
      <path
        d="M12 3.5 2.5 20.5h19L12 3.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
