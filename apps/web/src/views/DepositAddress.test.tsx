import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  updateState: vi.fn(),
}));

vi.mock("@/lib/wouter", () => ({ useLocation: () => ["/deposit-address", mocks.navigate] }));
vi.mock("@/contexts/DemoContext", () => ({
  useDemo: () => ({
    state: {
      depositRequestId: "",
      selectedAsset: "USDT",
      selectedNetwork: "",
      selectedMinConfirmations: null,
      mainDepositAmount: "10000",
      sourceWallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f8bEb0",
      depositAddress: "",
      screeningPassed: true,
      screeningExpiredDemo: false,
      travelRuleComplete: true,
      travelRuleStatus: "travel_rule_accepted",
      compliancePackId: "",
      kyc: { status: "approved" },
    },
    updateState: mocks.updateState,
  }),
}));
vi.mock("@/contexts/I18nContext", () => ({
  useI18n: () => ({
    t: (key: string) => ({
      "common.next": "Next",
      "depositAddress.preparingDemo": "Preparing demo deposit session...",
    })[key] ?? key,
  }),
}));
vi.mock("@/components/Shell", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

import DepositAddress from "./DepositAddress";

describe("DepositAddress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.navigate.mockReset();
    mocks.updateState.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("keeps the demo verification page actionable after preparing its address", async () => {
    render(
      <StrictMode>
        <DepositAddress />
      </StrictMode>,
    );

    expect(screen.getByRole("button", { name: "Preparing demo deposit session..." })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeEnabled();
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(next);
    expect(mocks.navigate).toHaveBeenCalledWith("/main-deposit");
  });
});
