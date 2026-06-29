"use client";

import { useMemo, useState } from "react";
import { customers } from "@/src/data/seed";
import {
  mockAddressProvider,
  mockScreeningProvider,
  mockTransactionKytProvider,
  mockTravelRuleProvider,
} from "@/src/domain/providers";
import { applyScreening, applyTransactionKyt, createTravelRuleDraft, statusLabel } from "@/src/domain/state-machine";
import type { DepositRequest, TransactionScreening, TravelRuleSubmission } from "@/src/domain/types";
import { currencyFormatter, formatPercent } from "@/src/lib/format";
import { DepositStatusBadge, KycStatusBadge, RiskBadge } from "./status-badge";

type AppStep =
  | "cover"
  | "login"
  | "patron"
  | "wallet"
  | "screening"
  | "travel-rule"
  | "issued"
  | "monitoring"
  | "funds"
  | "compliance"
  | "wta";

type DepositForm = {
  customerId: string;
  hostName: string;
  asset: "USDT" | "USDC";
  network: "TRON" | "Ethereum";
  amount: number;
  walletAddress: string;
};

const defaultForm: DepositForm = {
  customerId: "cust-1001",
  hostName: "Iris Lau",
  asset: "USDT",
  network: "TRON",
  amount: 8800,
  walletAddress: "TLowRiskDemoWalletPass001",
};

const demoAccount = {
  username: "va.host.demo@operator.example",
  password: "Operator#2026!",
};

const stepLabels: Record<AppStep, string> = {
  cover: "Overview",
  login: "Secure Login",
  patron: "Patron",
  wallet: "Wallet",
  screening: "Screen",
  "travel-rule": "FATF",
  issued: "Issue",
  monitoring: "Monitor",
  funds: "Funds",
  compliance: "Clear",
  wta: "WTA",
};

const routingStages = [
  "Patron source wallet screened",
  "Travel Rule data captured",
  "Hex Trust address issued",
  "Funds detected on-chain",
  "Compliance engine clears transaction",
  "Stable coin lands in WTA",
];

const sourceWalletExamples = [
  {
    label: "TRON / USDT-TRC20",
    address: "TQ9Y2Wn7rZxDemoLowRisk7Kp1v6n8",
    note: "Typical TRON addresses start with T. Demo result: Pass.",
  },
  {
    label: "Ethereum / ERC-20",
    address: "0x8f3EddReviewWallet0000000000000000000002",
    note: "Ethereum addresses start with 0x. Demo result: EDD.",
  },
  {
    label: "Ethereum / high-risk example",
    address: "0xSanctionFailWallet0000000000000000000003",
    note: "Ethereum addresses start with 0x. Demo result: Fail.",
  },
];

export function PadDepositApp() {
  const [step, setStep] = useState<AppStep>("cover");
  const [form, setForm] = useState<DepositForm>(defaultForm);
  const [deposit, setDeposit] = useState<DepositRequest>();
  const [authStage, setAuthStage] = useState<"password" | "mfa" | "authenticated">("password");
  const [credentials, setCredentials] = useState({ username: demoAccount.username, password: demoAccount.password });
  const [authError, setAuthError] = useState<string>();
  const [addressSent, setAddressSent] = useState(false);
  const [patronSearch, setPatronSearch] = useState("");
  const [txKyt, setTxKyt] = useState<TransactionScreening>();
  const [runningTxKyt, setRunningTxKyt] = useState(false);
  const customer = customers.find((item) => item.id === form.customerId) ?? customers[0];

  const filteredPatrons = useMemo(() => {
    const q = patronSearch.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.externalId.toLowerCase().includes(q) ||
        c.jurisdiction.toLowerCase().includes(q),
    );
  }, [patronSearch]);

  const activeStepIndex = Object.keys(stepLabels).indexOf(step);
  const routingProgressByStep: Record<AppStep, number> = {
    cover: -1,
    login: -1,
    patron: -1,
    wallet: -1,
    screening: 0,
    "travel-rule": 1,
    issued: 2,
    monitoring: 2,
    funds: 3,
    compliance: 4,
    wta: 5,
  };
  const routingProgress = routingProgressByStep[step];
  const travelRuleDraft = useMemo(() => (deposit ? createTravelRuleDraft(deposit) : undefined), [deposit]);

  function updateForm(field: keyof DepositForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: field === "amount" ? Number(value) : value,
    }));
  }

  function startScreening() {
    const now = new Date().toISOString();
    const draft: DepositRequest = {
      id: `pad-${Date.now().toString().slice(-6)}`,
      ...form,
      status: "wallet_screening",
      createdAt: now,
      updatedAt: now,
    };
    const screening = mockScreeningProvider.screenWallet(draft);

    setDeposit({
      ...draft,
      ...applyScreening(screening),
      updatedAt: new Date().toISOString(),
    });
    setStep("screening");
  }

  function submitTravelRule() {
    if (!deposit || !customer || !travelRuleDraft) {
      return;
    }

    const submission: TravelRuleSubmission = {
      ...travelRuleDraft,
      originatorName: customer.name,
      beneficiaryName: "Macau operator Treasury Account",
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
    setStep("issued");
  }

  function resetDemo(walletAddress = "TLowRiskDemoWalletPass001", nextStep: AppStep = "patron") {
    setForm({ ...defaultForm, walletAddress });
    setDeposit(undefined);
    setAddressSent(false);
    setStep(nextStep);
  }

  function useExampleAddress(address: string) {
    setDeposit(undefined);
    setForm((current) => ({
      ...current,
      walletAddress: address,
      network: address.startsWith("T") ? "TRON" : "Ethereum",
    }));
  }

  function verifyPassword() {
    if (credentials.username !== demoAccount.username || credentials.password !== demoAccount.password) {
      setAuthError("Invalid test account credentials.");
      return;
    }

    setAuthError(undefined);
    setAuthStage("mfa");
  }

  function approveOktaVerify() {
    setAuthError(undefined);
    setAuthStage("authenticated");
    setStep("patron");
  }

  function goToStep(nextStep: AppStep) {
    if (nextStep !== "cover" && nextStep !== "login" && authStage !== "authenticated") {
      setAuthError("Please complete secure login first.");
      setStep("login");
      return;
    }

    setStep(nextStep);
  }

  function startOnChainMonitoring() {
    setStep("monitoring");
    window.setTimeout(() => {
      setDeposit((current) =>
        current
          ? {
              ...current,
              status: "monitoring",
              updatedAt: new Date().toISOString(),
            }
          : current,
      );
      setStep("funds");
    }, 3000);
  }

  function runTransactionKyt() {
    if (!deposit) return;
    setRunningTxKyt(true);
    const mockTxHash = `0xtx${Date.now().toString(16)}`;
    window.setTimeout(() => {
      const result = mockTransactionKytProvider.screenTransaction(deposit, mockTxHash);
      const { status } = applyTransactionKyt(deposit, result);
      setTxKyt(result);
      setDeposit((current) =>
        current ? { ...current, status, updatedAt: new Date().toISOString() } : current,
      );
      setRunningTxKyt(false);
      setStep("compliance");
    }, 2000);
  }

  function settleToWta() {
    setDeposit((current) =>
      current
        ? {
            ...current,
            status: "settled",
            updatedAt: new Date().toISOString(),
          }
        : current,
    );
    setStep("wta");
  }

  return (
    <div className="pad-stage">
      <section className="tablet-frame">
        <header className="pad-header">
          <div>
            <div className="app-title">Virtual Asset Management</div>
            <p>Employee Pad App · Crypto Deposit Flow</p>
          </div>
          <div className="operator-card">
            <span>{authStage === "authenticated" ? "Host signed in with MFA" : "Authentication required"}</span>
            <strong>{authStage === "authenticated" ? form.hostName : "Locked"}</strong>
          </div>
        </header>

        <nav className="stepper" aria-label="Deposit flow">
          {Object.entries(stepLabels).map(([key, label], index) => (
            <button
              className={index <= activeStepIndex ? "step-pill active" : "step-pill"}
              key={key}
              type="button"
              onClick={() => goToStep(key as AppStep)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="pad-content">
          <aside className="flow-rail">
            <p className="eyebrow">Integrated Flow</p>
            <h2>Deposit to WTA</h2>
            <div className="rail-list">
              {routingStages.map((item, index) => (
                <div className={index <= routingProgress ? "rail-item done" : "rail-item"} key={item}>
                  <span>{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </aside>

          <main className="phone-panel">{renderStep()}</main>
        </div>
      </section>
    </div>
  );

  function renderStep() {
    if (step === "cover") {
      return (
        <div className="cover-card">
          <div className="cover-copy">
            <p className="eyebrow">Virtual Asset Deposit Journey</p>
            <h1>From patron wallet screening to WTA settlement</h1>
            <p className="muted">
              A guided employee Pad flow that gates every crypto deposit through identity, KYT, Travel Rule, Hex Trust
              address issuance, on-chain monitoring, and treasury routing.
            </p>
            <button className="button primary" type="button" onClick={() => setStep("login")}>
              Begin Secure Login
            </button>
          </div>
          <div className="flow-diagram" aria-label="Six step deposit flow">
            {routingStages.map((item, index) => (
              <div className="flow-node" key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (step === "login") {
      return (
        <div className="center-card">
          <div>
            <div className="okta-brand">okta</div>
            <h1>{authStage === "mfa" ? "Verify with Okta Verify" : "Sign in with Okta"}</h1>
            <p className="muted">
              {authStage === "mfa"
                ? "A push notification was sent to the registered employee device."
                : "Employees authenticate with Okta cloud identity before accessing the deposit workspace."}
            </p>
            <p className="auth-note">
              Best-practice pattern: SSO/OIDC for enterprise identity, then phishing-resistant MFA where possible.
              SMS should not be the only second factor.
            </p>
          </div>
          <div className="form">
            {authStage === "password" ? (
              <>
                <div className="test-account">
                  <strong>Okta demo tenant</strong>
                  <span>Username: {demoAccount.username}</span>
                  <span>Password: {demoAccount.password}</span>
                </div>
                <div className="field">
                  <label htmlFor="username">Username</label>
                  <input
                    id="username"
                    value={credentials.username}
                    autoComplete="username"
                    onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={credentials.password}
                    autoComplete="current-password"
                    onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
                  />
                </div>
                <button className="button primary" type="button" onClick={verifyPassword}>
                  Sign in with Okta
                </button>
              </>
            ) : null}
            {authStage === "mfa" ? (
              <>
                <div className="mfa-panel okta-push-panel">
                  <span>Okta Verify Push</span>
                  <strong>Push sent</strong>
                  <p>Approve the sign-in request in Okta Verify on the registered employee device.</p>
                </div>
                <button className="button primary" type="button" onClick={approveOktaVerify}>
                  Simulate Approve in Okta Verify
                </button>
                <button className="button" type="button" onClick={() => setAuthStage("password")}>
                  Back to Password
                </button>
              </>
            ) : null}
            {authStage === "authenticated" ? (
              <button className="button primary" type="button" onClick={() => setStep("patron")}>
                Continue
              </button>
            ) : null}
            {authError ? <p className="badge danger">{authError}</p> : null}
          </div>
        </div>
      );
    }

    if (step === "patron") {
      const kycBlocked = customer?.kycStatus === "blocked";
      const kycNeedsAction = customer?.kycStatus === "expired" || customer?.kycStatus === "missing";

      return (
        <div className="workflow-card">
          <p className="eyebrow">Phase 1 · Patron Lookup</p>
          <h1>Patron & KYC Status</h1>
          <p className="muted">
            Search the Operator patron profile by name, ID, or jurisdiction. Confirm KYC status before proceeding.
          </p>
          <div className="form">
            <div className="field">
              <label htmlFor="patron-search">Search patron (name / ID / jurisdiction)</label>
              <input
                id="patron-search"
                placeholder="e.g. Avery Chen, WYN-HK-88421, HK..."
                value={patronSearch}
                onChange={(e) => setPatronSearch(e.target.value)}
              />
            </div>
            <div className="patron-results">
              {filteredPatrons.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`patron-result-row${item.id === form.customerId ? " selected" : ""}`}
                  onClick={() => {
                    updateForm("customerId", item.id);
                    setPatronSearch("");
                  }}
                >
                  <strong>{item.name}</strong>
                  <span>
                    {item.externalId} · {item.jurisdiction} · {item.tier.toUpperCase()}
                  </span>
                  <KycStatusBadge status={item.kycStatus} />
                </button>
              ))}
              {filteredPatrons.length === 0 && <p className="muted">No patrons found. Try a different search term.</p>}
            </div>
            {customer && (
              <div className="patron-card">
                <strong>{customer.name}</strong>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <KycStatusBadge status={customer.kycStatus} />
                  <span className="muted">
                    {customer.jurisdiction} · {customer.tier.toUpperCase()} · {customer.externalId}
                  </span>
                </div>
                {customer.riskFlags.length > 0 && (
                  <p className="muted">Risk flags: {customer.riskFlags.join(", ")}</p>
                )}
                {kycBlocked && (
                  <p className="badge danger" style={{ marginTop: "0.5rem" }}>
                    KYC blocked — this patron cannot proceed to deposit.
                  </p>
                )}
                {kycNeedsAction && (
                  <p className="badge warning" style={{ marginTop: "0.5rem" }}>
                    KYC {customer.kycStatus} — contact compliance to refresh before proceeding.
                  </p>
                )}
              </div>
            )}
            <button
              className="button primary"
              type="button"
              disabled={kycBlocked || kycNeedsAction}
              onClick={() => setStep("wallet")}
            >
              {kycBlocked ? "Cannot Proceed — KYC Blocked" : "Continue to Wallet Setup"}
            </button>
          </div>
        </div>
      );
    }

    if (step === "wallet") {
      return (
        <div className="workflow-card">
          <p className="eyebrow">Address Request</p>
          <h1>Crypto Deposit Setup</h1>
          <p className="muted">
            Confirm asset, blockchain network, expected amount, and the patron source wallet before Hex Trust address
            issuance.
          </p>
          <div className="form">
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="asset">Asset</label>
                <select id="asset" value={form.asset} onChange={(event) => updateForm("asset", event.target.value)}>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                </select>
                <p className="field-hint">This deposit flow supports stable coins only. Other assets use a separate conversion flow.</p>
              </div>
              <div className="field">
                <label htmlFor="network">Network</label>
                <select id="network" value={form.network} onChange={(event) => updateForm("network", event.target.value)}>
                  <option value="TRON">TRON</option>
                  <option value="Ethereum">Ethereum</option>
                </select>
                <p className="field-hint">Network means the blockchain rail, for example TRON/TRC20 or Ethereum/ERC20.</p>
              </div>
            </div>
            <div className="field">
              <label htmlFor="amount">Expected Amount</label>
              <input id="amount" type="number" value={form.amount} onChange={(event) => updateForm("amount", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="wallet">Source Wallet Address</label>
              <input
                id="wallet"
                placeholder="Example: T..., 0x..., or bc1q..."
                value={form.walletAddress}
                onChange={(event) => {
                  setDeposit(undefined);
                  updateForm("walletAddress", event.target.value);
                }}
              />
              <p className="field-hint">
                This is the patron wallet that will send funds to Operator, not the Hex Trust receiving address.
              </p>
            </div>
            <div className="screening-preview">
              <span>KYT pre-screening status</span>
              <strong>Not screened yet</strong>
              <p>After the patron source wallet is entered, Operator backend calls the KYT screening provider and returns Pass, EDD, or Fail.</p>
            </div>
            <div className="address-examples">
              {sourceWalletExamples.map((example) => (
                <button key={example.address} type="button" onClick={() => useExampleAddress(example.address)}>
                  <strong>{example.label}</strong>
                  <span>{example.address}</span>
                  <em>{example.note}</em>
                </button>
              ))}
            </div>
            <button className="button primary" type="button" onClick={startScreening}>
              Run KYT Pre-Deposit Wallet Screening
            </button>
          </div>
        </div>
      );
    }

    if (step === "screening" && deposit?.screening) {
      const failed = deposit.screening.decision === "fail";
      const edd = deposit.screening.decision === "edd";

      return (
        <div className="center-card result-card">
          <div className={failed ? "result-icon danger" : edd ? "result-icon warning" : "result-icon success"}>
            {failed ? "!" : edd ? "?" : "✓"}
          </div>
          <h1>{failed ? "Screening Failed" : edd ? "EDD Required" : "Wallet Approved"}</h1>
          <p className="muted">Risk Score: {deposit.screening.score}/100</p>
          <RiskBadge level={deposit.screening.level} />
          <div className="screening-detail">
            <span>KYT status: {deposit.screening.decision.toUpperCase()}</span>
            <span>Network: {deposit.screening.network}</span>
            <span>Tainted exposure: {formatPercent(deposit.screening.taintedExposurePercent)}</span>
            <span>Hop count: {deposit.screening.hopCount}</span>
          </div>
          <div className="address-box">
            <span>Screened patron source wallet</span>
            <strong>{deposit.screening.walletAddress}</strong>
          </div>
          <div className="notice-box">
            {failed
              ? "Block address issuance and open a compliance case before contacting the patron."
              : edd
                ? "Enhanced due diligence is required before a wallet can be issued."
                : "Complete FATF Travel Rule data collection before the receiving wallet is issued."}
          </div>
          {failed || edd ? (
            <button className="button" type="button" onClick={() => setStep("wallet")}>
              Start New Screening
            </button>
          ) : (
            <button className="button primary" type="button" onClick={() => setStep("travel-rule")}>
              Continue for FATF Travel Rule Data Collection
            </button>
          )}
        </div>
      );
    }

    if (step === "travel-rule") {
      return (
        <div className="workflow-card tall">
          <p className="eyebrow">FATF Travel Rule</p>
          <h1>Required Originator & Beneficiary Information</h1>
          <div className="form">
            <div className="field">
              <label>Full Legal Name of Originator</label>
              <input value={customer?.name ?? ""} readOnly />
            </div>
            <div className="field">
              <label>Originator Account / Wallet Address</label>
              <input value={deposit?.walletAddress ?? form.walletAddress} readOnly />
            </div>
            <div className="field">
              <label>Physical Address OR National ID Number</label>
              <input defaultValue="3 COLEMAN STREET" />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Transaction Amount</label>
                <input value={`${currencyFormatter.format(form.amount)} ${form.asset}`} readOnly />
              </div>
              <div className="field">
                <label>Transaction Date</label>
                <input value="11/05/2026" readOnly />
              </div>
            </div>
            <div className="field">
              <label>Beneficiary Name</label>
              <input defaultValue="Macau operator Treasury Account" />
            </div>
            <div className="system-config-note">
              <strong>Beneficiary VASP / custody route is system-configured</strong>
              <span>Hex Trust Custody Provider and Operator WTA routing details are submitted from backend configuration.</span>
            </div>
            <button className="button primary" type="button" onClick={submitTravelRule}>
              Submit & Request Hex Trust Address
            </button>
          </div>
        </div>
      );
    }

    if (step === "issued" && deposit?.depositAddress) {
      return (
        <div className="center-card result-card">
          <div className="result-icon success">✓</div>
          <h1>Hex Trust Address Issued</h1>
          <p className="muted">Travel Rule data captured</p>
          <div className="address-box">
            <span>Receiving Address issued by Hex Trust</span>
            <strong>{deposit.depositAddress.address}</strong>
          </div>
          <div className="issued-actions">
            <button className="issued-action primary" type="button" onClick={() => setAddressSent(true)}>
              <span>{addressSent ? "Address Sent Securely" : "Securely Send Address"}</span>
              <strong>Send via approved secure channel</strong>
            </button>
            <button className="issued-action secondary" type="button" onClick={startOnChainMonitoring} disabled={!addressSent}>
              <span>Start Monitoring</span>
              <strong>{addressSent ? "Listen for Hex Trust webhook" : "Send address first"}</strong>
            </button>
          </div>
          <div className="system-config-note">
            <strong>Next employee action</strong>
            <span>Give the patron the receiving address or secure link, then monitor on-chain settlement.</span>
          </div>
          <button className="button" type="button" onClick={() => resetDemo()}>
            Start New Screening
          </button>
          <p className="fine-print">
            This data is collected under FATF AML/CFT recommendations and Operator compliance policies.
          </p>
        </div>
      );
    }

    if (step === "monitoring") {
      return (
        <div className="workflow-card">
          <p className="eyebrow">Step 4 · Waiting for Funds</p>
          <h1>Listening for Hex Trust Webhook</h1>
          <div className="webhook-panel">
            <span className="pulse-dot" />
            <strong>Waiting for incoming on-chain deposit...</strong>
            <p>
              Operator backend subscribes to Hex Trust custody events or polls the custody transaction API. The employee
              does not manually inspect the blockchain.
            </p>
          </div>
          <div className="status-flow">
            <div>
              <strong>Subscription</strong>
              <span>Hex Trust webhook / transaction API</span>
            </div>
            <div>
              <strong>Matching key</strong>
              <span>depositAddressId + txHash</span>
            </div>
            <div>
              <strong>Demo behavior</strong>
              <span>Incoming transaction appears after 3 seconds</span>
            </div>
          </div>
        </div>
      );
    }

    if (step === "funds") {
      return (
        <div className="workflow-card">
          <p className="eyebrow">Step 4 · Funds Detected On-Chain</p>
          <h1>Hex Trust Deposit Webhook Received</h1>
          <div className="webhook-panel">
            <span className="result-icon success">✓</span>
            <strong>Incoming transaction matched</strong>
            <p>
              Hex Trust reports an incoming {form.asset} transaction to the issued address. The system matched it to
              this deposit request via <code>GET /deposit/&#123;txHash&#125;</code>. Transaction-level KYT must now run
              — pre-deposit wallet screening does not replace this step.
            </p>
          </div>
          <div className="status-flow">
            <div>
              <strong>Receiving address</strong>
              <span>{deposit?.depositAddress?.address ?? "Pending address"}</span>
            </div>
            <div>
              <strong>Amount detected</strong>
              <span>
                {currencyFormatter.format(form.amount)} {form.asset}
              </span>
            </div>
            <div>
              <strong>Network</strong>
              <span>{form.network}</span>
            </div>
            <div>
              <strong>Hex Safe API</strong>
              <span>POST /deposit/submit_travel_rule_details → GET /transactions/&#123;traceId&#125;</span>
            </div>
          </div>
          <button
            className="button primary"
            type="button"
            onClick={runTransactionKyt}
            disabled={runningTxKyt}
          >
            {runningTxKyt ? "Running Transaction KYT…" : "Run Transaction-Level KYT"}
          </button>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            This is a separate KYT call from pre-deposit screening. The actual funds that arrived may differ from the
            declared source wallet.
          </p>
        </div>
      );
    }

    if (step === "compliance") {
      const isDirty = txKyt?.decision === "dirty";

      return (
        <div className="workflow-card">
          <p className="eyebrow">Step 5 · Transaction KYT Result</p>
          <h1>{isDirty ? "Funds Dirty — Blocked" : "Transaction Cleared"}</h1>
          <div className="webhook-panel">
            <span className={`result-icon ${isDirty ? "danger" : "success"}`}>{isDirty ? "!" : "✓"}</span>
            <strong>KYT result: {isDirty ? "Dirty" : "Clear"}</strong>
            <p>{txKyt?.reason ?? "Transaction screened by compliance engine."}</p>
          </div>
          {txKyt && (
            <div className="status-flow">
              <div>
                <strong>Risk score</strong>
                <span>{txKyt.riskScore}/100</span>
              </div>
              <div>
                <strong>Sanctions hit</strong>
                <span>{txKyt.sanctionedHit ? "Yes — True Hit" : "No"}</span>
              </div>
              <div>
                <strong>Tainted exposure</strong>
                <span>{formatPercent(txKyt.taintedExposurePercent)}</span>
              </div>
              <div>
                <strong>Decision</strong>
                <span className={isDirty ? "badge danger" : "badge success"}>
                  {isDirty ? "FUNDS DIRTY" : "FUNDS CLEAR"}
                </span>
              </div>
              <div>
                <strong>TX Hash</strong>
                <span style={{ wordBreak: "break-all", fontSize: "0.75rem" }}>{txKyt.txHash}</span>
              </div>
            </div>
          )}
          {isDirty ? (
            <>
              <div className="notice-box" style={{ marginTop: "1rem" }}>
                Deposit address has been voided. A compliance case will be opened. Funds must be blocked or returned.
                The patron cannot receive a new address until the case is resolved.
              </div>
              <button className="button" type="button" onClick={() => resetDemo()}>
                Start New Deposit
              </button>
            </>
          ) : (
            <button className="button primary" type="button" onClick={settleToWta}>
              Settle Stable Coin to WTA
            </button>
          )}
        </div>
      );
    }

    if (step === "wta") {
      return (
      <div className="workflow-card">
        <p className="eyebrow">Step 6 · Stable Coin Lands in WTA</p>
        <h1>Funds Settled to WTA</h1>
        {deposit ? <DepositStatusBadge status={deposit.status} label={statusLabel(deposit.status)} /> : null}
        <div className="webhook-panel">
          <span className="result-icon success">✓</span>
          <strong>WTA settlement recorded</strong>
          <p>
            Funds have completed the deposit journey and are recorded in Treasury Account. The deposit flow is
            complete; downstream operations handle receipts, host notification, treasury reconciliation, and future payout.
          </p>
        </div>
        <div className="settlement-timeline">
          <div>
            <span>01</span>
            <strong>Hex Trust address</strong>
            <p>Incoming funds matched to this deposit request.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Transaction detected</strong>
            <p>Webhook confirms chain activity and required confirmations.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Compliance cleared</strong>
            <p>KYT result is clear for this demo transaction.</p>
          </div>
          <div>
            <span>04</span>
            <strong>Stable coin settled to WTA</strong>
            <p>Prime Broker conversion is handled in a separate workflow when needed.</p>
          </div>
        </div>
        <div className="post-settlement-actions">
          <button type="button">Generate Receipt</button>
          <button type="button">Notify Host</button>
          <button type="button">Open Treasury Record</button>
          <button type="button" onClick={() => resetDemo()}>
            Start New Deposit
          </button>
        </div>
      </div>
      );
    }

    return null;
  }
}
