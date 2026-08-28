import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi, describe, expect, it } from "vitest";

vi.mock("@/lib/wouter", () => ({ useLocation: () => ["/dashboard", vi.fn()] }));
vi.mock("@/contexts/DemoContext", () => ({
  useDemo: () => ({
    state: {
      transactions: [],
      kyc: { status: "approved" },
      depositSettlement: { markerRef: "", status: "pending_marker" },
    },
  }),
}));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/Shell", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/SessionRecovery", () => ({ default: () => null }));
vi.mock("@/components/AdmissionJourney", () => ({ default: () => <div data-testid="admission-journey" /> }));
vi.mock("@/lib/api", () => ({
  admissionApi: {
    patronMine: () => Promise.resolve({ data: { case: { status: "leader_pending", kycValidUntil: null, payments: [] } } }),
  },
}));

import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  it("does not render the internal admission journey while showing the account status", async () => {
    render(<Dashboard />);

    await screen.findByText("Pending Approval");
    await waitFor(() => expect(screen.queryByTestId("admission-journey")).not.toBeInTheDocument());
  });
});
