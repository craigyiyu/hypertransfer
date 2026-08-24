"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { customers } from "@/src/data/seed";
import { mockPayoutProvider, mockScreeningProvider } from "@/src/domain/providers";
import { KycStatusBadge, RiskBadge } from "@/src/components/status-badge";
import type { PayoutRequest, WalletScreening } from "@/src/domain/types";
import { currencyFormatter, formatPercent } from "@/src/lib/format";

type RefundStep = "form" | "screening" | "review" | "submitted" | "complete";

const refundSchema = z.object({
  customerId: z.string().min(1),
  initiatedBy: z.string().min(2),
  asset: z.enum(["USDT", "USDC"]),
  network: z.enum(["TRON", "Ethereum"]),
  amount: z.coerce.number().positive(),
  destinationWallet: z.string().min(8),
});

type RefundForm = z.infer<typeof refundSchema>;

const defaultForm: RefundForm = {
  customerId: "cust-1001",
  initiatedBy: "Iris Lau",
  asset: "USDT",
  network: "TRON",
  amount: 5000,
  destinationWallet: "TLowRiskPayoutWallet",
};

export function RefundPadApp() {
  const [step, setStep] = useState<RefundStep>("form");
  const [form, setForm] = useState<RefundForm>(defaultForm);
  const [patronSearch, setPatronSearch] = useState("");
  const [screening, setScreening] = useState<WalletScreening>();
  const [payout, setPayout] = useState<PayoutRequest>();
  const [formError, setFormError] = useState<string>();
  const [hexTraceId, setHexTraceId] = useState<string>();

  const customer = customers.find((c) => c.id === form.customerId) ?? customers[0];

  const filteredPatrons = useMemo(() => {
    const q = patronSearch.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.externalId.toLowerCase().includes(q),
    );
  }, [patronSearch]);

  function updateForm(field: keyof RefundForm, value: string) {
    setForm((cur) => ({ ...cur, [field]: field === "amount" ? Number(value) : value }));
  }

  function runScreening() {
    const result = refundSchema.safeParse(form);
    if (!result.success) {
      setFormError("Please fill all fields correctly.");
      return;
    }
    setFormError(undefined);

    const now = new Date().toISOString();
    const draftRequest = {
      id: `payout-draft-${Date.now()}`,
      customerId: form.customerId,
      hostName: form.initiatedBy,
      asset: form.asset,
      network: form.network,
      amount: form.amount,
      walletAddress: form.destinationWallet,
      status: "wallet_screening" as const,
      createdAt: now,
      updatedAt: now,
    };

    const result2 = mockScreeningProvider.screenWallet(draftRequest);
    setScreening(result2);
    setStep("screening");
  }

  function submitForApproval() {
    const payoutDraft: PayoutRequest = {
      id: `payout-${Date.now().toString().slice(-6)}`,
      customerId: form.customerId,
      initiatedBy: form.initiatedBy,
      asset: form.asset,
      network: form.network,
      amount: form.amount,
      destinationWallet: form.destinationWallet,
      status: "pending_review",
      screeningDecision: screening?.decision,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setPayout(payoutDraft);
    setStep("review");
  }

  function submitToHexSafe() {
    if (!payout) return;
    const { traceId } = mockPayoutProvider.submitWithdrawal(payout);
    setHexTraceId(traceId);
    setStep("submitted");

    window.setTimeout(() => {
      setStep("complete");
    }, 2500);
  }

  return (
    <div className="workflow-card tall">
      {step === "form" && (
        <>
          <p className="eyebrow">Refund / Payout · Step 1</p>
          <h1>New Payout Request</h1>
          <p className="muted">
            Enter patron, asset, amount, and destination wallet. The destination wallet will be screened before
            compliance review.
          </p>
          <div className="form">
            <div className="field">
              <label htmlFor="patron-search-payout">Search patron</label>
              <input
                id="patron-search-payout"
                placeholder="Name or ID..."
                value={patronSearch}
                onChange={(e) => setPatronSearch(e.target.value)}
              />
              {patronSearch && (
                <div className="patron-results">
                  {filteredPatrons.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`patron-result-row${p.id === form.customerId ? " selected" : ""}`}
                      onClick={() => { updateForm("customerId", p.id); setPatronSearch(""); }}
                    >
                      <strong>{p.name}</strong>
                      <span>{p.externalId} · {p.jurisdiction}</span>
                      <KycStatusBadge status={p.kycStatus} />
                    </button>
                  ))}
                </div>
              )}
              {customer && (
                <div className="patron-card" style={{ marginTop: "0.5rem" }}>
                  <strong>{customer.name}</strong>
                  <KycStatusBadge status={customer.kycStatus} />
                </div>
              )}
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="payout-asset">Asset</label>
                <select id="payout-asset" value={form.asset} onChange={(e) => updateForm("asset", e.target.value)}>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="payout-network">Network</label>
                <select id="payout-network" value={form.network} onChange={(e) => updateForm("network", e.target.value)}>
                  <option value="TRON">TRON</option>
                  <option value="Ethereum">Ethereum</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="payout-amount">Payout Amount</label>
              <input id="payout-amount" type="number" value={form.amount} onChange={(e) => updateForm("amount", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="payout-wallet">Destination Wallet Address</label>
              <input
                id="payout-wallet"
                placeholder="Customer's withdrawal wallet address"
                value={form.destinationWallet}
                onChange={(e) => updateForm("destinationWallet", e.target.value)}
              />
              <p className="field-hint">This wallet will be screened before approval. Must be on whitelist for Hex Safe withdrawal.</p>
            </div>
            <div className="field">
              <label htmlFor="payout-initiated-by">Initiated By (Host / Finance)</label>
              <input id="payout-initiated-by" value={form.initiatedBy} onChange={(e) => updateForm("initiatedBy", e.target.value)} />
            </div>
            {formError && <p className="badge danger">{formError}</p>}
            <button className="button primary" type="button" onClick={runScreening}>
              Screen Destination Wallet
            </button>
          </div>
        </>
      )}

      {step === "screening" && screening && (
        <>
          <p className="eyebrow">Refund / Payout · Step 2</p>
          <h1>Destination Wallet Screening</h1>
          <p className="muted">
            Pre-withdrawal KYT: screening the patron's destination wallet before Compliance approval and Hex Safe
            withdrawal submission.
          </p>
          <div className="center-card result-card" style={{ margin: "1rem 0" }}>
            <div
              className={`result-icon ${screening.decision === "fail" ? "danger" : screening.decision === "edd" ? "warning" : "success"}`}
            >
              {screening.decision === "fail" ? "!" : screening.decision === "edd" ? "?" : "✓"}
            </div>
            <h2>{screening.decision === "fail" ? "Wallet Blocked" : screening.decision === "edd" ? "EDD Required" : "Wallet Approved"}</h2>
            <RiskBadge level={screening.level} />
            <div className="screening-detail">
              <span>Risk score: {screening.score}/100</span>
              <span>Tainted exposure: {formatPercent(screening.taintedExposurePercent)}</span>
              <span>Hop count: {screening.hopCount}</span>
              <span>Sanctions hit: {screening.sanctionedHit ? "Yes" : "No"}</span>
            </div>
            <p className="muted" style={{ marginTop: "0.5rem" }}>{screening.summary}</p>
          </div>
          {screening.decision === "fail" ? (
            <div>
              <div className="notice-box">Destination wallet is blocked. Payout cannot proceed. Contact patron to provide a different wallet.</div>
              <button className="button" type="button" onClick={() => setStep("form")}>Start Over</button>
            </div>
          ) : (
            <button className="button primary" type="button" onClick={submitForApproval}>
              Submit for Compliance Review
            </button>
          )}
        </>
      )}

      {step === "review" && payout && (
        <>
          <p className="eyebrow">Refund / Payout · Step 3</p>
          <h1>Compliance Review</h1>
          <p className="muted">Compliance Officer reviews the payout before submission to Hex Safe for withdrawal.</p>
          <div className="status-flow">
            <div><strong>Customer</strong><span>{customer?.name} · {customer?.externalId}</span></div>
            <div><strong>Amount</strong><span>{currencyFormatter.format(payout.amount)} {payout.asset} ({payout.network})</span></div>
            <div><strong>Destination wallet</strong><span style={{ wordBreak: "break-all" }}>{payout.destinationWallet}</span></div>
            <div>
              <strong>Wallet screening</strong>
              <span className={`badge ${screening?.decision === "pass" ? "success" : "warning"}`}>
                {screening?.decision?.toUpperCase() ?? "N/A"}
              </span>
            </div>
            <div><strong>Hex Safe endpoint</strong><span>POST /transactions/withdrawal</span></div>
          </div>
          <div className="system-config-note">
            <strong>Approval policy</strong>
            <span>Hex Safe enforces multi-party approval for withdrawals above threshold. This mock skips quorum for demo purposes.</span>
          </div>
          <button className="button primary" type="button" onClick={submitToHexSafe}>
            Approve & Submit to Hex Safe
          </button>
        </>
      )}

      {step === "submitted" && (
        <>
          <p className="eyebrow">Refund / Payout · Step 4</p>
          <h1>Submitted to Hex Safe</h1>
          <div className="webhook-panel">
            <span className="pulse-dot" />
            <strong>Waiting for Hex Safe policy approval and broadcast…</strong>
            <p>Hex Safe traceId: <code>{hexTraceId}</code></p>
            <p>Poll <code>GET /transactions/{`{traceId}`}</code> for status changes.</p>
          </div>
        </>
      )}

      {step === "complete" && (
        <>
          <p className="eyebrow">Refund / Payout · Complete</p>
          <h1>Payout Broadcasted</h1>
          <div className="webhook-panel">
            <span className="result-icon success">✓</span>
            <strong>Withdrawal broadcasted on-chain</strong>
            <p>Hex Safe traceId: <code>{hexTraceId}</code></p>
            <p>Transaction confirmed. Funds en route to patron wallet. Audit log updated.</p>
          </div>
          <div className="post-settlement-actions">
            <button type="button" onClick={() => { setStep("form"); setScreening(undefined); setPayout(undefined); setHexTraceId(undefined); }}>
              New Payout Request
            </button>
          </div>
        </>
      )}
    </div>
  );
}
