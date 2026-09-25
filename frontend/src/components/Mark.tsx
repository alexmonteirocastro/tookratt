import type { SVGProps } from "react";

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
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...props}
    >
      <line x1="17" y1="8" x2="31" y2="8" stroke="#C68A2E" strokeWidth="2" />
      <circle cx="17" cy="8" r="4" fill="#C68A2E" />
      <circle cx="31" cy="8" r="4" fill="#C68A2E" />
      <circle cx="24" cy="29" r="13" stroke="#16407A" strokeWidth="5.5" />
    </svg>
  );
}
