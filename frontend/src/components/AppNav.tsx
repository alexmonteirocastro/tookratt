import { NavLink } from "react-router-dom";
import styles from "./AppNav.module.css";

/**
 * ALE-192 / ALE-193: lightweight primary nav between /chat and /stats.
 * Place under the wordmark (brand column), not between brand and header
 * actions, so lock / new-conversation controls stay un-squeezed on mobile.
 */
export function AppNav() {
  return (
    <nav aria-label="Primary" className={styles.nav}>
      <NavLink to="/chat" className={styles.link} end>
        Chat
      </NavLink>
      <NavLink to="/stats" className={styles.link}>
        Stats
      </NavLink>
    </nav>
  );
}
