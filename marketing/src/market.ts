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

export function frameValue(target: number, eased: number): number {
  return Math.round(target * eased)
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

function countMarkup(value: number): string {
  const formatted = escapeHtml(formatCount(value))
  return `<span class="count"><span class="count-sizer" aria-hidden="true">${formatted}</span><span class="count-live" aria-hidden="true" data-count-to="${value}">0</span></span><span class="visually-hidden">${formatted}</span>`
}

function detailMarkup(snapshot: MarketSnapshot, code: CountryCode): string {
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
    .map(
      (kpi) => `<li class="market-kpi${kpi.signal ? " market-kpi-signal" : ""}">
        <p class="market-kpi-value">${countMarkup(kpi.value)}</p>
        <p class="market-kpi-label">${kpi.label}</p>
      </li>`,
    )
    .join("")
  const roles = rolesFor(stats.jobs_per_role)
  const roleRows = roles
    .map(
      (role) => `<tr class="role-row">
        <th scope="row" class="role-label">${escapeHtml(role.label)}</th>
        <td class="role-track-cell">
          <div class="role-track" aria-hidden="true"><div class="role-bar" data-share="${role.share}"></div></div>
        </td>
        <td class="role-count">${countMarkup(role.count)}</td>
      </tr>`,
    )
    .join("")
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

function animateDetail(detail: HTMLElement, cancel: { id: number }): void {
  const lives = [...detail.querySelectorAll<HTMLElement>("[data-count-to]")]
  const bars = [...detail.querySelectorAll<HTMLElement>("[data-share]")]
  const start = performance.now()
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / COUNT_MS)
    const eased = easeOutCubic(progress)
    for (const live of lives) {
      live.textContent = formatCount(frameValue(Number(live.dataset.countTo), eased))
    }
    for (const bar of bars) {
      bar.style.transform = `scaleX(${Number(bar.dataset.share) * eased})`
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
        cancelAnimationFrame(cancel.id)
        detail.innerHTML = detailMarkup(snapshot, code)
        if (reduced || revealed) {
          applyFinal(detail)
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
