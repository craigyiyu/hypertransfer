import { describe, expect, it } from "vitest";
import {
  ACTIVE_PHASE_ONE_ASSETS,
  getActivePhaseOneNetworks,
} from "./compliance";

describe("phase-one deposit rails", () => {
  it("accepts USDT on TRC-20 only", () => {
    expect(ACTIVE_PHASE_ONE_ASSETS).toEqual(["USDT"]);
    expect(getActivePhaseOneNetworks("USDT").map((network) => network.id)).toEqual(["tron"]);
    expect(getActivePhaseOneNetworks("USDC")).toEqual([]);
  });
});
