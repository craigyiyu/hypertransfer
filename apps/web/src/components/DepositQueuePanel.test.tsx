import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { roles: ["ops"] } }) }));
vi.mock("@/contexts/DemoContext", () => ({
  useDemo: () => ({
    state: {
      depositRequestId: "",
      mainDepositConfirmed: true,
      mainDepositAmount: "5000",
      selectedAsset: "USDT",
      selectedNetwork: "tron",
      sourceWallet: "TSourceWallet",
      depositAddress: "TDepositAddress",
      screeningPassed: true,
      travelRuleStatus: "travel_rule_accepted",
      testPaymentConfirmed: true,
      depositSettlement: { status: "pending_marker", markerRef: "", markerIssuedAt: "", receiptRef: "" },
      transactions: [{ type: "main", status: "confirmed", amount: "5000", txHash: "0x123", date: "2026-08-28T00:00:00.000Z" }],
    },
    updateState: vi.fn(),
  }),
}));
vi.mock("@/lib/api", () => ({
  apiError: () => "error",
  depositApi: { queue: () => Promise.resolve({ data: { deposits: [] } }) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import DepositQueuePanel from "./DepositQueuePanel";

describe("DepositQueuePanel", () => {
  it("formats the demo session amount with thousands separators", async () => {
    render(<DepositQueuePanel />);

    expect(await screen.findByText("5,000")).toBeInTheDocument();
  });
});
