"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { customers } from "@/src/data/seed";
import { mockAddressProvider, mockScreeningProvider, mockTravelRuleProvider } from "@/src/domain/providers";
import { applyScreening, createTravelRuleDraft } from "@/src/domain/state-machine";
import type { DepositRequest, TravelRuleSubmission } from "@/src/domain/types";
import { currencyFormatter } from "@/src/lib/format";
import { DepositStatusBadge, RiskBadge } from "./status-badge";

const intakeSchema = z.object({
  customerId: z.string().min(1),
  hostName: z.string().min(2),
  asset: z.enum(["USDT", "USDC", "BTC", "ETH"]),
  network: z.enum(["TRON", "Ethereum", "Bitcoin"]),
  amount: z.coerce.number().positive(),
  walletAddress: z.string().min(8),
});

type IntakeForm = z.infer<typeof intakeSchema>;

const defaultForm: IntakeForm = {
  customerId: customers[0]?.id ?? "",
  hostName: "Iris Lau",
  asset: "USDT",
  network: "TRON",
  amount: 5000,
  walletAddress: "TLowRiskDemoWalletPass001",
};

export function DepositIntake() {
  const [form, setForm] = useState<IntakeForm>(defaultForm);
  const [error, setError] = useState<string>();
  const [deposit, setDeposit] = useState<DepositRequest>();

  const travelRuleDraft = useMemo(() => (deposit ? createTravelRuleDraft(deposit) : undefined), [deposit]);

  function updateField(field: keyof IntakeForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: field === "amount" ? Number(value) : value,
    }));
  }

  function runScreening() {
    const parsed = intakeSchema.safeParse(form);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid deposit request");
      return;
    }

    const now = new Date().toISOString();
    const draft: DepositRequest = {
      id: `dep-demo-${Date.now().toString().slice(-6)}`,
      ...parsed.data,
      status: "wallet_screening",
      createdAt: now,
      updatedAt: now,
    };
    const screening = mockScreeningProvider.screenWallet(draft);

    setError(undefined);
    setDeposit({
      ...draft,
      ...applyScreening(screening),
      updatedAt: new Date().toISOString(),
    });
  }

  function submitTravelRule() {
    if (!deposit || !travelRuleDraft) {
      return;
    }

    const submission: TravelRuleSubmission = {
      ...travelRuleDraft,
      originatorName: customers.find((customer) => customer.id === deposit.customerId)?.name ?? "",
      beneficiaryName: "Macau operator Treasury",
    };
    const submitted = mockTravelRuleProvider.submitTravelRule(deposit, submission);
    const address = mockAddressProvider.issueAddress(deposit);

    setDeposit({
      ...deposit,
      status: "address_issued",
      travelRule: submitted,
      depositAddress: address,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="grid grid-2">
      <section className="card">
        <h2>Create Deposit Request</h2>
        <p className="muted">Use wallet text containing “EDD” or “Fail” to demo manual review or blocking.</p>
        <div className="form">
          <div className="field">
            <label htmlFor="customerId">Customer</label>
            <select id="customerId" value={form.customerId} onChange={(event) => updateField("customerId", event.target.value)}>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} · {customer.externalId}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hostName">Host / Account Manager</label>
            <input id="hostName" value={form.hostName} onChange={(event) => updateField("hostName", event.target.value)} />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="asset">Asset</label>
              <select id="asset" value={form.asset} onChange={(event) => updateField("asset", event.target.value)}>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="network">Network</label>
              <select id="network" value={form.network} onChange={(event) => updateField("network", event.target.value)}>
                <option value="TRON">TRON</option>
                <option value="Ethereum">Ethereum</option>
                <option value="Bitcoin">Bitcoin</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="amount">Amount</label>
            <input
              id="amount"
              inputMode="decimal"
              type="number"
              value={form.amount}
              onChange={(event) => updateField("amount", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="walletAddress">External Wallet Address</label>
            <input
              id="walletAddress"
              value={form.walletAddress}
              onChange={(event) => updateField("walletAddress", event.target.value)}
            />
          </div>
          {error ? <p className="badge danger">{error}</p> : null}
          <button className="button primary" type="button" onClick={runScreening}>
            Run Wallet Screening
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Decision Preview</h2>
        {!deposit ? (
          <p className="muted">Submit the intake form to run the KYT mock and continue the flow.</p>
        ) : (
          <div className="grid">
            <div>
              <p className="eyebrow">{deposit.id}</p>
              <h3>
                {currencyFormatter.format(deposit.amount)} {deposit.asset} on {deposit.network}
              </h3>
              <DepositStatusBadge status={deposit.status} label={deposit.status.replaceAll("_", " ")} />
            </div>
            {deposit.screening ? (
              <div className="card">
                <RiskBadge level={deposit.screening.level} />
                <p className="metric">{deposit.screening.score}</p>
                <p className="muted">{deposit.screening.summary}</p>
              </div>
            ) : null}
            {deposit.status === "travel_rule_pending" ? (
              <button className="button primary" type="button" onClick={submitTravelRule}>
                Submit Travel Rule and Issue Address
              </button>
            ) : null}
            {deposit.status === "address_issued" && deposit.depositAddress ? (
              <div>
                <p className="eyebrow">One-Time Deposit Address</p>
                <div className="code">{deposit.depositAddress.address}</div>
              </div>
            ) : null}
            {deposit.status === "edd_required" || deposit.status === "blocked" ? (
              <p className="badge danger">Compliance case opened before address issuance.</p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
