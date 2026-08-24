import Link from "next/link";
import { notFound } from "next/navigation";
import { ManualCaseActions } from "@/src/components/manual-case-actions";
import { DepositStatusBadge, RiskBadge } from "@/src/components/status-badge";
import { complianceCases, getCustomer, getDeposit } from "@/src/data/seed";
import { statusLabel } from "@/src/domain/state-machine";
import { currencyFormatter, formatDateTime, formatPercent } from "@/src/lib/format";

export default async function DepositDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deposit = getDeposit(id);

  if (!deposit) {
    notFound();
  }

  const customer = getCustomer(deposit.customerId);
  const complianceCase = complianceCases.find((item) => item.depositId === deposit.id);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Deposit Detail</p>
          <h1>{deposit.id}</h1>
          <p className="muted">
            {customer?.name ?? "Unknown customer"} · {currencyFormatter.format(deposit.amount)} {deposit.asset} ·{" "}
            {deposit.network}
          </p>
        </div>
        <Link className="button" href="/ops">
          Back to Queue
        </Link>
      </header>

      <section className="grid grid-3">
        <div className="card">
          <p className="eyebrow">Status</p>
          <DepositStatusBadge status={deposit.status} label={statusLabel(deposit.status)} />
          <p className="muted" style={{ marginTop: "1rem" }}>
            Updated {formatDateTime(deposit.updatedAt)}
          </p>
        </div>
        <div className="card">
          <p className="eyebrow">Customer</p>
          <h2>{customer?.name ?? "Unknown"}</h2>
          <p className="muted">
            {customer?.externalId} · {customer?.jurisdiction} · {customer?.kycStatus.replaceAll("_", " ")}
          </p>
        </div>
        <div className="card">
          <p className="eyebrow">Host</p>
          <h2>{deposit.hostName}</h2>
          <p className="muted">Created {formatDateTime(deposit.createdAt)}</p>
        </div>
      </section>

      <section className="grid grid-2" style={{ marginTop: "1rem" }}>
        <div className="card">
          <h2>Wallet Screening</h2>
          {deposit.screening ? (
            <div className="grid">
              <RiskBadge level={deposit.screening.level} />
              <p className="metric">{deposit.screening.score}</p>
              <p>{deposit.screening.summary}</p>
              <p className="muted">
                Sanctions hit: {deposit.screening.sanctionedHit ? "Yes" : "No"} · Hops: {deposit.screening.hopCount} ·
                Tainted exposure: {formatPercent(deposit.screening.taintedExposurePercent)}
              </p>
              <div className="code">{deposit.walletAddress}</div>
            </div>
          ) : (
            <p className="muted">Screening not started.</p>
          )}
        </div>

        <div className="card">
          <h2>Travel Rule and Address</h2>
          {deposit.travelRule ? (
            <div className="grid">
              <p>
                <span className="badge success">{deposit.travelRule.status.toUpperCase()}</span>
              </p>
              <p className="muted">
                Originator: {deposit.travelRule.originatorName} · Beneficiary: {deposit.travelRule.beneficiaryName}
              </p>
            </div>
          ) : (
            <p className="muted">Travel Rule submission is pending or blocked.</p>
          )}
          {deposit.depositAddress ? (
            <div style={{ marginTop: "1rem" }}>
              <p className="eyebrow">One-Time Address</p>
              <div className="code">{deposit.depositAddress.address}</div>
              <p className="muted" style={{ marginTop: "0.75rem" }}>
                Provider: {deposit.depositAddress.provider} · Expires {formatDateTime(deposit.depositAddress.expiresAt)}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {complianceCase ? (
        <section style={{ marginTop: "1rem" }}>
          <ManualCaseActions initialStatus={complianceCase.status} />
        </section>
      ) : null}
    </>
  );
}
