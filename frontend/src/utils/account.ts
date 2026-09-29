import type { Session } from "@supabase/supabase-js";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Short admin dates: "Today", "Yesterday", or "2 Oct". Missing values are "Never". */
export function formatAdminDate(iso: string | null, now: Date = new Date()): string {
  if (!iso) {
    return "Never";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Never";
  }
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000);
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function isAdminSession(session: Session | null): boolean {
  const role = session?.user.app_metadata?.role;
  return role === "admin";
}

export function roleLabel(role: string | null): "Admin" | "Member" {
  return role === "admin" ? "Admin" : "Member";
}

export function isFullEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
