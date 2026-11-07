import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("permissions", () => {
  it("lets executives do day-to-day document work", () => {
    expect(can("EXECUTIVE", "shipment:create")).toBe(true);
    expect(can("EXECUTIVE", "document:upload")).toBe(true);
    expect(can("EXECUTIVE", "field:review")).toBe(true);
  });

  it("keeps approval, overrides and the audit log for managers", () => {
    expect(can("EXECUTIVE", "shipment:approve")).toBe(false);
    expect(can("EXECUTIVE", "check:override")).toBe(false);
    expect(can("EXECUTIVE", "audit:view")).toBe(false);
    expect(can("MANAGER", "shipment:approve")).toBe(true);
    expect(can("MANAGER", "check:override")).toBe(true);
    expect(can("MANAGER", "audit:view")).toBe(true);
  });
});
