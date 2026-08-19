import styles from "./AppNav.module.css";

export type AppNavView = "chat" | "stats";

interface AppNavProps {
  current: AppNavView;
  chatHref?: string;
  statsHref?: string;
}

/**
 * ALE-192: lightweight primary nav between /chat and /stats.
 * Place under the wordmark (brand column), not between brand and header
 * actions, so lock / new-conversation controls stay un-squeezed on mobile.
 * ALE-193 should swap these anchors for React Router NavLinks.
 */
export function AppNav({
  current,
  chatHref = "/",
  statsHref = "/stats",
}: AppNavProps) {
  return (
    <nav aria-label="Primary" className={styles.nav}>
      <a
        href={chatHref}
        className={styles.link}
        aria-current={current === "chat" ? "page" : undefined}
      >
        Chat
      </a>
      <a
        href={statsHref}
        className={styles.link}
        aria-current={current === "stats" ? "page" : undefined}
      >
        Stats
      </a>
    </nav>
  );
}
