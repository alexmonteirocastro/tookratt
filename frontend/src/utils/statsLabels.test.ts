import { describe, expect, it } from "vitest";
import { formatRoleLabel, rolesByCountDescending } from "./statsLabels";

describe("formatRoleLabel", () => {
  it("uses product labels for known Hub roles", () => {
    expect(formatRoleLabel("backend_developer")).toBe("Backend developer");
    expect(formatRoleLabel("ux_ui_designer")).toBe("UX/UI designer");
    expect(formatRoleLabel("cxo")).toBe("CXO");
  });

  it("humanizes unknown snake_case keys", () => {
    expect(formatRoleLabel("staff_engineer")).toBe("Staff engineer");
  });
});

describe("rolesByCountDescending", () => {
  it("drops zeros, sorts by count, then by label", () => {
    expect(
      rolesByCountDescending({
        other: 24,
        backend_developer: 19,
        legal: 0,
        cxo: 19,
      }),
    ).toEqual([
      { key: "other", label: "Other", count: 24 },
      { key: "backend_developer", label: "Backend developer", count: 19 },
      { key: "cxo", label: "CXO", count: 19 },
    ]);
  });
});
