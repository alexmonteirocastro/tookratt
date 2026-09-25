import type { SVGProps } from "react";
import styles from "./Mark.module.css";

/**
 * Ö lettermark from ALE-201. Light-surface lockup: Baltic Blue ring, amber dots.
 */
export function Mark({
  className,
  title,
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      className={[styles.mark, className].filter(Boolean).join(" ")}
      viewBox="0 0 48 48"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...props}
    >
      <line className={styles.connector} x1="17" y1="8" x2="31" y2="8" strokeWidth="2" />
      <circle className={styles.dot} cx="17" cy="8" r="4" />
      <circle className={styles.dot} cx="31" cy="8" r="4" />
      <circle className={styles.ring} cx="24" cy="29" r="13" strokeWidth="5.5" />
    </svg>
  );
}
