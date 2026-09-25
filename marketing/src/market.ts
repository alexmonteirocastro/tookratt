export const COUNTRIES = [
  { code: "DK", name: "Denmark" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "FI", name: "Finland" },
  { code: "IS", name: "Iceland" },
  { code: "EU", name: "Europe" },
] as const

export type CountryCode = (typeof COUNTRIES)[number]["code"]

const COUNT_MS = 1200
const ROLE_LIMIT = 8
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Same labels as the app chart, so a role reads the same in both places. */
const ROLE_LABELS: Record<string, string> = {
  cxo: "CXO",
  human_resources: "Human resources",
  finance: "Finance",
  legal: "Legal",
  marketing: "Marketing",
  sales: "Sales",
  customer_service: "Customer service",
  customer_success: "Customer success",
  analyst: "Analyst",
  business_development: "Business development",
  operations: "Operations",
  product_management: "Product management",
  project_management: "Project management",
  design: "Design",
  ux_ui_designer: "UX/UI designer",
  engineer: "Engineer",
  full_stack_developer: "Full-stack developer",
  frontend_developer: "Frontend developer",
  backend_developer: "Backend developer",
  mobile_development: "Mobile development",
  quality_assurance: "Quality assurance",
  devops: "DevOps",
  data_science: "Data science",
  other: "Other",
}

export interface CountryStats {
  total_jobs: number
  remote_jobs: number
  paid_jobs: number
  jobs_per_role: Record<string, number>
}

export interface MarketSnapshot {
  generated_at: string
  countries: Partial<Record<CountryCode, CountryStats>>
}

interface RoleCount {
  key: string
  label: string
  count: number
  share: number
}

function isCountryCode(value: string): value is CountryCode {
  return COUNTRIES.some((country) => country.code === value)
}

function countryStats(body: unknown): CountryStats | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return null
  }
  const record = body as Record<string, unknown>
  const jobsPerRole = record.jobs_per_role
  if (
    typeof record.total_jobs !== "number" ||
    typeof record.remote_jobs !== "number" ||
    typeof record.paid_jobs !== "number" ||
    jobsPerRole == null ||
    typeof jobsPerRole !== "object" ||
    Array.isArray(jobsPerRole)
  ) {
    return null
  }
  const roles: Record<string, number> = {}
  for (const [key, count] of Object.entries(jobsPerRole)) {
    if (typeof count === "number" && Number.isFinite(count)) {
      roles[key] = count
    }
  }
  return {
    total_jobs: record.total_jobs,
    remote_jobs: record.remote_jobs,
    paid_jobs: record.paid_jobs,
    jobs_per_role: roles,
  }
}

export function parseSnapshot(body: unknown): MarketSnapshot | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return null
  }
  const record = body as Record<string, unknown>
  const countriesIn = record.countries
  if (
    typeof record.generated_at !== "string" ||
    countriesIn == null ||
    typeof countriesIn !== "object" ||
    Array.isArray(countriesIn)
  ) {
    return null
  }
  const countries: MarketSnapshot["countries"] = {}
  for (const [code, stats] of Object.entries(countriesIn)) {
    if (!isCountryCode(code)) {
      continue
    }
    const parsed = countryStats(stats)
    if (parsed) {
      countries[code] = parsed
    }
  }
  if (Object.keys(countries).length === 0) {
    return null
  }
  return { generated_at: record.generated_at, countries }
}

export function defaultCountry(snapshot: MarketSnapshot): CountryCode | null {
  return COUNTRIES.find((country) => snapshot.countries[country.code])?.code ?? null
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value)
}

export function formatUpdated(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  const month = MONTHS[date.getUTCMonth()]
  return `Updated ${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`
}

export function formatRoleLabel(key: string): string {
  const known = ROLE_LABELS[key]
  if (known) {
    return known
  }
  return key
    .split("_")
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
}

export function easeOutCubic(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress))
  return 1 - (1 - clamped) ** 3
}

export function blendCount(from: number, to: number, eased: number): number {
  return Math.round(from + (to - from) * eased)
}

export function frameValue(target: number, eased: number): number {
  return blendCount(0, target, eased)
}

function rolesFor(jobsPerRole: Record<string, number>): RoleCount[] {
  const roles = Object.entries(jobsPerRole)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ key, label: formatRoleLabel(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  const max = roles[0]?.count ?? 0
  return roles.map((role) => ({ ...role, share: max === 0 ? 0 : role.count / max }))
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })
}

function countMarkup(value: number, from = 0): string {
  const finalText = escapeHtml(formatCount(value))
  const startText = escapeHtml(formatCount(from))
  const sizer = escapeHtml(formatCount(Math.max(value, from)))
  return `<span class="count"><span class="count-sizer" aria-hidden="true">${sizer}</span><span class="count-live" aria-hidden="true" data-count-from="${from}" data-count-to="${value}">${startText}</span></span><span class="visually-hidden">${finalText}</span>`
}

interface ShownCounts {
  kpis: Map<string, number>
  roles: Map<string, { count: number; share: number }>
}

function detailMarkup(snapshot: MarketSnapshot, code: CountryCode, shown?: ShownCounts): string {
  const stats = snapshot.countries[code]
  if (!stats) {
    return ""
  }
  const kpis = [
    { label: "Open roles", value: stats.total_jobs, signal: true },
    { label: "Remote roles", value: stats.remote_jobs, signal: false },
    { label: "Roles that publish pay", value: stats.paid_jobs, signal: false },
  ]
  const kpiItems = kpis
    .map((kpi) => {
      const from = shown?.kpis.get(kpi.label) ?? 0
      return `<li class="market-kpi${kpi.signal ? " market-kpi-signal" : ""}">
        <p class="market-kpi-value">${countMarkup(kpi.value, from)}</p>
        <p class="market-kpi-label">${kpi.label}</p>
      </li>`
    })
    .join("")
  const roles = rolesFor(stats.jobs_per_role)
  const visible = roles.slice(0, ROLE_LIMIT)
  const hidden = roles.length - visible.length
  const roleRows = visible
    .map((role) => {
      const from = shown?.roles.get(role.key)
      const shareFrom = from?.share ?? 0
      return `<tr class="role-row" data-role="${escapeHtml(role.key)}">
        <th scope="row" class="role-label">${escapeHtml(role.label)}</th>
        <td class="role-track-cell">
          <div class="role-track" aria-hidden="true"><div class="role-bar" data-share-from="${shareFrom}" data-share="${role.share}" style="transform:scaleX(${shareFrom})"></div></div>
        </td>
        <td class="role-count">${countMarkup(role.count, from?.count ?? 0)}</td>
      </tr>`
    })
    .join("")
  const more =
    hidden === 0
      ? ""
      : `<p class="role-more">and ${hidden} more ${hidden === 1 ? "role" : "roles"}</p>`
  const chart =
    roles.length === 0
      ? ""
      : `<figure class="role-chart">
          <figcaption>Jobs per role</figcaption>
          <table>
            <thead class="visually-hidden">
              <tr><th scope="col">Role</th><th scope="col">Distribution</th><th scope="col">Jobs</th></tr>
            </thead>
            <tbody>${roleRows}</tbody>
          </table>
          ${more}
        </figure>`
  const updated = formatUpdated(snapshot.generated_at)
  const updatedMarkup = updated ? `<p class="market-updated">${escapeHtml(updated)}</p>` : ""
  return `<ul class="market-kpis">${kpiItems}</ul>${chart}${updatedMarkup}`
}

export function renderMarketFigures(snapshot: MarketSnapshot, selected: CountryCode): string {
  const pills = COUNTRIES.map((country) => {
    const enabled = Boolean(snapshot.countries[country.code])
    const checked = country.code === selected ? " checked" : ""
    const disabled = enabled ? "" : " disabled"
    return `<label class="country-pill">
      <input type="radio" name="market-country" value="${country.code}" aria-label="${country.name}"${checked}${disabled}>
      <span aria-hidden="true">${country.code}</span>
    </label>`
  }).join("")
  return `<fieldset class="country-pills">
    <legend class="visually-hidden">Country</legend>
    <div class="country-pills-group">${pills}</div>
  </fieldset>
  <div data-market-detail>${detailMarkup(snapshot, selected)}</div>`
}

function applyFinal(detail: HTMLElement): void {
  for (const live of detail.querySelectorAll<HTMLElement>("[data-count-to]")) {
    live.textContent = formatCount(Number(live.dataset.countTo))
  }
  for (const bar of detail.querySelectorAll<HTMLElement>("[data-share]")) {
    bar.style.transform = `scaleX(${Number(bar.dataset.share)})`
  }
}

function displayedCount(live: HTMLElement): number {
  const parsed = Number(live.textContent?.replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : Number(live.dataset.countTo)
}

function displayedShare(bar: HTMLElement): number {
  const match = /scaleX\(([^)]+)\)/.exec(bar.style.transform)
  const parsed = match ? Number(match[1]) : Number.NaN
  return Number.isFinite(parsed) ? parsed : Number(bar.dataset.shareFrom ?? 0)
}

function shownFrom(detail: HTMLElement): ShownCounts {
  const kpis = new Map<string, number>()
  for (const item of detail.querySelectorAll<HTMLElement>(".market-kpi")) {
    const label = item.querySelector(".market-kpi-label")?.textContent ?? ""
    const live = item.querySelector<HTMLElement>("[data-count-to]")
    if (live) {
      kpis.set(label, displayedCount(live))
    }
  }
  const roles = new Map<string, { count: number; share: number }>()
  for (const row of detail.querySelectorAll<HTMLElement>("[data-role]")) {
    const key = row.dataset.role
    const live = row.querySelector<HTMLElement>("[data-count-to]")
    const bar = row.querySelector<HTMLElement>("[data-share]")
    if (!key || !live || !bar) {
      continue
    }
    roles.set(key, { count: displayedCount(live), share: displayedShare(bar) })
  }
  return { kpis, roles }
}

function animateDetail(detail: HTMLElement, cancel: { id: number }): void {
  const lives = [...detail.querySelectorAll<HTMLElement>("[data-count-to]")]
  const bars = [...detail.querySelectorAll<HTMLElement>("[data-share]")]
  const start = performance.now()
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / COUNT_MS)
    const eased = easeOutCubic(progress)
    for (const live of lives) {
      const from = Number(live.dataset.countFrom ?? 0)
      const to = Number(live.dataset.countTo)
      live.textContent = formatCount(blendCount(from, to, eased))
    }
    for (const bar of bars) {
      const from = Number(bar.dataset.shareFrom ?? 0)
      const to = Number(bar.dataset.share)
      bar.style.transform = `scaleX(${from + (to - from) * eased})`
    }
    if (progress < 1) {
      cancel.id = requestAnimationFrame(tick)
    }
  }
  cancelAnimationFrame(cancel.id)
  cancel.id = requestAnimationFrame(tick)
}

export function mountMarket(root: HTMLElement): void {
  const slot = root.querySelector<HTMLElement>("[data-market-figures]")
  if (!slot) {
    return
  }
  fetch("/market-stats.json")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("market stats missing")
      }
      return response.json() as Promise<unknown>
    })
    .then((body) => {
      const snapshot = parseSnapshot(body)
      const selected = snapshot ? defaultCountry(snapshot) : null
      if (!snapshot || !selected) {
        return
      }
      slot.innerHTML = renderMarketFigures(snapshot, selected)
      slot.hidden = false
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      const cancel = { id: 0 }
      let revealed = false
      const paint = (code: CountryCode) => {
        const detail = slot.querySelector<HTMLElement>("[data-market-detail]")
        if (!detail) {
          return
        }
        const shown = !reduced && revealed ? shownFrom(detail) : undefined
        cancelAnimationFrame(cancel.id)
        detail.innerHTML = detailMarkup(snapshot, code, shown)
        if (reduced) {
          applyFinal(detail)
          return
        }
        if (revealed) {
          animateDetail(detail, cancel)
        }
      }
      slot.addEventListener("change", (event) => {
        const input = event.target
        if (!(input instanceof HTMLInputElement) || !isCountryCode(input.value)) {
          return
        }
        paint(input.value)
      })
      const detail = slot.querySelector<HTMLElement>("[data-market-detail]")
      if (reduced && detail) {
        applyFinal(detail)
        return
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return
          }
          revealed = true
          observer.disconnect()
          const current = slot.querySelector<HTMLElement>("[data-market-detail]")
          if (current) {
            animateDetail(current, cancel)
          }
        },
        { threshold: 0.25 },
      )
      observer.observe(slot)
    })
    .catch(() => {
      slot.hidden = true
    })
}
