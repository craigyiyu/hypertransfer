import { describe, expect, it } from "vitest";
import { getCasinoOpsSectionKeys, getDefaultCasinoOpsSection } from "./CasinoOpsPortal";

describe("getDefaultCasinoOpsSection", () => {
  it("opens the Admin portal on Deposits even when the admin also has an operational role", () => {
    expect(getDefaultCasinoOpsSection(["admin", "host", "ops"])).toBe("deposits");
  });

  it("opens Deposits for operations staff after Payment Operations is retired", () => {
    expect(getDefaultCasinoOpsSection(["ops"])).toBe("deposits");
  });

  it("does not expose Withdrawals or Payment Operations in the Admin section catalog", () => {
    expect(getCasinoOpsSectionKeys()).not.toContain("refunds");
    expect(getCasinoOpsSectionKeys()).not.toContain("payment-ops");
  });
});
