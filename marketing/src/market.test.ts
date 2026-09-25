import assert from "node:assert/strict"
import { test } from "node:test"
import {
  defaultCountry,
  easeOutCubic,
  formatCount,
  formatRoleLabel,
  formatUpdated,
  blendCount,
  frameValue,
  parseSnapshot,
  renderMarketFigures,
} from "./market.ts"

const denmark = {
  total_jobs: 1200,
  remote_jobs: 300,
  paid_jobs: 900,
  jobs_per_role: { design: 80, backend_developer: 40, legal: 0 },
}

test("parseSnapshot keeps usable countries and drops a bad one", () => {
  const snapshot = parseSnapshot({
    generated_at: "2026-09-25T00:00:00.000Z",
    countries: { DK: denmark, IS: { total_jobs: 1 }, extra: denmark },
  })
  assert.ok(snapshot)
  assert.equal(snapshot.countries.DK?.total_jobs, 1200)
  assert.equal(snapshot.countries.IS, undefined)
  assert.equal(defaultCountry(snapshot), "DK")
})

test("parseSnapshot returns null when nothing is usable", () => {
  assert.equal(parseSnapshot({ generated_at: "2026-09-25T00:00:00.000Z", countries: {} }), null)
  assert.equal(parseSnapshot(null), null)
})

test("formatUpdated uses the UTC calendar date", () => {
  assert.equal(formatUpdated("2026-09-25T23:30:00.000Z"), "Updated 25 Sep 2026")
  assert.equal(formatUpdated("not-a-date"), null)
})

test("formatCount groups thousands", () => {
  assert.equal(formatCount(1200), "1,200")
})

test("formatRoleLabel uses the shared role names", () => {
  assert.equal(formatRoleLabel("backend_developer"), "Backend developer")
  assert.equal(formatRoleLabel("ux_ui_designer"), "UX/UI designer")
})

test("frameValue eases out and lands on the target", () => {
  assert.equal(frameValue(100, easeOutCubic(0)), 0)
  assert.equal(frameValue(100, easeOutCubic(1)), 100)
  assert.ok(frameValue(100, easeOutCubic(0.5)) > 50)
})

test("blendCount moves from the previous number to the next", () => {
  assert.equal(blendCount(100, 400, 0), 100)
  assert.equal(blendCount(100, 400, 1), 400)
  assert.ok(blendCount(100, 400, 0.5) > 100)
  assert.ok(blendCount(100, 400, 0.5) < 400)
})

test("renderMarketFigures disables a missing country and keeps the final number for assistive tech", () => {
  const snapshot = parseSnapshot({
    generated_at: "2026-09-25T00:00:00.000Z",
    countries: { DK: denmark },
  })
  assert.ok(snapshot)
  const html = renderMarketFigures(snapshot, "DK")
  assert.match(html, /value="IS"[^>]*disabled/)
  assert.match(html, /value="DK"[^>]*checked/)
  assert.match(html, /data-count-to="1200"/)
  assert.match(html, /visually-hidden">1,200</)
  assert.match(html, /data-count-to="1200">0</)
  assert.match(html, /Backend developer/)
  assert.doesNotMatch(html, /Legal/)
  assert.match(html, /Updated 25 Sep 2026/)
  assert.match(html, /data-share="1"/)
  assert.match(html, /data-share="0.5"/)
  assert.doesNotMatch(html, /more role/)
})

test("renderMarketFigures keeps the top roles and counts the rest", () => {
  const jobsPerRole: Record<string, number> = {}
  for (let index = 0; index < 9; index += 1) {
    jobsPerRole[`role_${index}`] = 100 - index
  }
  const snapshot = parseSnapshot({
    generated_at: "2026-09-25T00:00:00.000Z",
    countries: {
      DK: { total_jobs: 1, remote_jobs: 1, paid_jobs: 1, jobs_per_role: jobsPerRole },
    },
  })
  assert.ok(snapshot)
  const html = renderMarketFigures(snapshot, "DK")
  assert.match(html, /Role 0/)
  assert.match(html, /Role 7/)
  assert.doesNotMatch(html, /Role 8/)
  assert.match(html, /and 1 more role/)
})
