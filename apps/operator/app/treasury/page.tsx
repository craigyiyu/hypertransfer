import { deposits, wtaVaults } from "@/src/data/seed";
import { currencyFormatter, formatDateTime } from "@/src/lib/format";

const settledCount = deposits.filter((d) => d.status === "settled").length;
const totalSettled = deposits
  .filter((d) => d.status === "settled")
  .reduce((sum, d) => sum + d.amount, 0);

export default function TreasuryPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Treasury / Finance</p>
          <h1>WTA Vault Overview</h1>
          <p className="muted">
            Treasury Account balances and pending settlement. Real-time data via{" "}
            <code>GET /vaults/&#123;vaultId&#125;</code> — Hex Safe API.
          </p>
        </div>
      </header>

      <section className="grid grid-3" style={{ marginBottom: "1rem" }}>
        <div className="card">
          <p className="eyebrow">Total WTA Balance</p>
          <h2>{currencyFormatter.format(wtaVaults.reduce((s, v) => s + v.balance, 0))} USD</h2>
          <p className="muted">Across {wtaVaults.length} vaults</p>
        </div>
        <div className="card">
          <p className="eyebrow">Pending Settlement</p>
          <h2>{currencyFormatter.format(wtaVaults.reduce((s, v) => s + v.pendingSettlement, 0))} USD</h2>
          <p className="muted">Awaiting sweep from deposit collection wallets</p>
        </div>
        <div className="card">
          <p className="eyebrow">Settled Deposits (Demo)</p>
          <h2>{settledCount} txns</h2>
          <p className="muted">{currencyFormatter.format(totalSettled)} total demo value</p>
        </div>
      </section>

      <div className="card">
        <h2>Vault Balances</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Each vault maps to a Hex Safe vault ID. Balances are fetched via{" "}
          <code>GET /vaults/&#123;vaultId&#125;</code>. Pending settlement clears via{" "}
          <code>POST /transactions/&#123;chain&#125;</code> sweep.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Vault</th>
              <th>Asset / Network</th>
              <th>Balance</th>
              <th>Pending Settlement</th>
              <th>Hex Safe Vault ID</th>
              <th>Last Settled</th>
            </tr>
          </thead>
          <tbody>
            {wtaVaults.map((vault) => (
              <tr key={vault.id}>
                <td>
                  <strong>{vault.name}</strong>
                </td>
                <td>
                  {vault.asset}
                  <div className="muted">{vault.network}</div>
                </td>
                <td>
                  <strong>{currencyFormatter.format(vault.balance)}</strong>
                </td>
                <td>
                  {vault.pendingSettlement > 0 ? (
                    <span className="badge warning">
                      +{currencyFormatter.format(vault.pendingSettlement)} pending
                    </span>
                  ) : (
                    <span className="badge success">Clear</span>
                  )}
                </td>
                <td>
                  <code>{vault.hexSafeVaultId}</code>
                </td>
                <td>{formatDateTime(vault.lastSettledAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Hex Safe API — Treasury Integration Points</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Hex Safe Endpoint</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["List WTA vaults", "GET /vaults", "Returns all vaults; filter by asset/network for WTA"],
              ["Vault balance", "GET /vaults/{vaultId}", "availableBalance + pendingBalance fields"],
              ["Sweep to WTA", "POST /transactions/{chain}", "Internal transfer from collection wallet to WTA vault; x-request-id for idempotency"],
              ["List transactions", "GET /transactions", "Filter by vaultId to see incoming / sweep history"],
              ["Single transaction", "GET /transactions/{traceId}", "Poll for status: pending → confirming → confirmed"],
              ["Payout from WTA", "POST /transactions/withdrawal", "Requires whitelist + approval policy"],
              ["Whitelist management", "GET /vaults/{vaultId}/whitelist", "Pre-approved destination wallets"],
            ].map(([action, endpoint, notes]) => (
              <tr key={endpoint}>
                <td>{action}</td>
                <td><code>{endpoint}</code></td>
                <td className="muted">{notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
