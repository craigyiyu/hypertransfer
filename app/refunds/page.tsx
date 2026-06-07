import Link from "next/link";
import { getCustomer, payoutRequests } from "@/src/data/seed";
import { currencyFormatter, formatDateTime } from "@/src/lib/format";

const statusTone: Record<string, string> = {
  pending_review: "warning",
  screening: "warning",
  approved: "success",
  rejected: "danger",
  broadcasted: "success",
  completed: "success",
};

export default function RefundsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Refund / Payout</p>
          <h1>Payout queue</h1>
          <p className="muted">
            Destination wallet screening → compliance approval → Hex Trust withdrawal. Real payout via{" "}
            <code>POST /transactions/withdrawal</code>.
          </p>
        </div>
        <Link className="button primary" href="/refunds/new">
          New Payout Request
        </Link>
      </header>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Payout ID</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Destination Wallet</th>
              <th>Screening</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {payoutRequests.map((payout) => {
              const customer = getCustomer(payout.customerId);
              return (
                <tr key={payout.id}>
                  <td>
                    <strong>{payout.id}</strong>
                    <div className="muted">by {payout.initiatedBy}</div>
                  </td>
                  <td>
                    {customer?.name ?? "Unknown"}
                    <div className="muted">{customer?.externalId}</div>
                  </td>
                  <td>
                    {currencyFormatter.format(payout.amount)} {payout.asset}
                    <div className="muted">{payout.network}</div>
                  </td>
                  <td>
                    <code style={{ fontSize: "0.75rem" }}>
                      {payout.destinationWallet.slice(0, 20)}…
                    </code>
                  </td>
                  <td>
                    {payout.screeningDecision ? (
                      <span
                        className={`badge ${
                          payout.screeningDecision === "pass"
                            ? "success"
                            : payout.screeningDecision === "edd"
                              ? "warning"
                              : "danger"
                        }`}
                      >
                        {payout.screeningDecision.toUpperCase()}
                      </span>
                    ) : (
                      <span className="muted">Pending</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${statusTone[payout.status] ?? "neutral"}`}>
                      {payout.status.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </td>
                  <td>{formatDateTime(payout.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Payout Flow — Hex Safe Integration Points</h2>
        <div className="status-flow">
          {[
            ["1. Pre-withdrawal KYT", "Screen destination wallet (same KYT provider as deposit)"],
            ["2. Compliance review", "EDD or high-value payouts require Compliance Officer approval"],
            ["3. Whitelist check", "GET /vaults/{vaultId}/whitelist — destination must be whitelisted"],
            ["4. Submit withdrawal", "POST /transactions/withdrawal — Hex Safe initiates the transfer"],
            ["5. Policy approval", "Hex Safe policy engine enforces quorum / multi-party approval"],
            ["6. Broadcast & confirm", "GET /transactions/{traceId} — poll until broadcasted → completed"],
          ].map(([label, desc]) => (
            <div key={label}>
              <strong>{label}</strong>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
