"use client";

import { useMemo, useState } from "react";

type ClientView =
  | "home"
  | "login"
  | "profile"
  | "identity"
  | "documents"
  | "funds"
  | "submit"
  | "review"
  | "dashboard"
  | "address"
  | "transactions";

type AccountStatus = "not_created" | "pending_approval" | "issued";
type KycStatus = "not_started" | "under_review" | "verified";
type DepositStatus =
  | "none"
  | "address_ready"
  | "checking_test"
  | "test_success"
  | "checking_full"
  | "success"
  | "returned";
type LoginStage = "credentials" | "otp";

type KycForm = {
  legalName: string;
  dateOfBirth: string;
  nationality: string;
  residency: string;
  mobile: string;
  email: string;
  documentType: string;
  documentNumber: string;
  occupation: string;
  employer: string;
  sourceOfFunds: string;
  sourceOfWealth: string;
  expectedVisitAmount: string;
};

type TransactionRecord = {
  id: string;
  type: "KYC" | "Account" | "Deposit" | "Return";
  title: string;
  status: string;
  amount?: string;
  date: string;
};

const demoAccount = {
  username: "vip.avery.demo@example.com",
  password: "VIP#2026!",
  otp: "482913",
  maskedMobile: "+65 **** 1838",
  maskedEmail: "av***@example.com",
};

const defaultForm: KycForm = {
  legalName: "Avery Chen",
  dateOfBirth: "1985-08-16",
  nationality: "Singapore",
  residency: "Singapore",
  mobile: "+65 9123 1838",
  email: "avery.chen@example.com",
  documentType: "Passport",
  documentNumber: "E12345678",
  occupation: "Technology Founder",
  employer: "Northstar Digital Holdings",
  sourceOfFunds: "Business income and investment proceeds",
  sourceOfWealth: "Company dividends, long-term investments, and real estate income",
  expectedVisitAmount: "50,000 - 100,000 USD",
};

const depositAddress = {
  asset: "USDT",
  network: "TRON / TRC20",
  testAmount: "1 USDT",
  amount: "88,000 USDT",
  address: "TQ9Y2Wn7rZxDemoLowRisk7Kp1v6n8",
  expiresAt: "Today 23:59 Macau time",
};

const stepLabels: Record<ClientView, string> = {
  home: "Home",
  login: "Okta",
  profile: "Profile",
  identity: "ID",
  documents: "Docs",
  funds: "Funds",
  submit: "Submit",
  review: "Review",
  dashboard: "Portal",
  address: "Address",
  transactions: "Records",
};

const secureAddressRules = [
  "Address is pushed only after KYC approval and login",
  "Address is not sent by SMS or chat",
  "Address is bound to this account and deposit request",
  "Instruction has expiry and audit trail",
];

export function KycPadApp() {
  const [view, setView] = useState<ClientView>("home");
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("not_created");
  const [kycStatus, setKycStatus] = useState<KycStatus>("not_started");
  const [depositStatus, setDepositStatus] = useState<DepositStatus>("none");
  const [loginStage, setLoginStage] = useState<LoginStage>("credentials");
  const [credentials, setCredentials] = useState({ username: demoAccount.username, password: demoAccount.password });
  const [otp, setOtp] = useState("");
  const [loginError, setLoginError] = useState<string>();
  const [form, setForm] = useState<KycForm>(defaultForm);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [addressRevealed, setAddressRevealed] = useState(false);
  const [records, setRecords] = useState<TransactionRecord[]>([
    {
      id: "rec-start",
      type: "KYC",
      title: "Client portal opened",
      status: "KYC application not started",
      date: "2026-05-14 09:00",
    },
  ]);

  const currentStepIndex = Object.keys(stepLabels).indexOf(view);
  const progressPercent = useMemo(
    () => Math.round((currentStepIndex / (Object.keys(stepLabels).length - 1)) * 100),
    [currentStepIndex],
  );

  function addRecord(record: TransactionRecord) {
    setRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
  }

  function updateForm(field: keyof KycForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function submitKyc() {
    setKycStatus("under_review");
    setAccountStatus("pending_approval");
    addRecord({
      id: "rec-kyc-submit",
      type: "KYC",
      title: "KYC application submitted",
      status: "Waiting for DD approval",
      date: "2026-05-14 10:05",
    });
    setView("review");
  }

  function approveKycAndIssueAccount() {
    setKycStatus("verified");
    setAccountStatus("issued");
    addRecord({
      id: "rec-account-issued",
      type: "Account",
      title: "Account credentials issued",
      status: "KYC approved and login account created",
      date: "2026-05-14 10:18",
    });
  }

  function submitCredentials() {
    if (accountStatus !== "issued") {
      setLoginError("No approved account yet. Please complete KYC application first.");
      return;
    }

    if (credentials.username !== demoAccount.username || credentials.password !== demoAccount.password) {
      setLoginError("Demo username or password is incorrect.");
      return;
    }

    setLoginError(undefined);
    setLoginStage("otp");
  }

  function verifyOktaOtp() {
    if (otp !== demoAccount.otp) {
      setLoginError("Demo Okta OTP is 482913.");
      return;
    }

    setLoginError(undefined);
    setIsAuthenticated(true);
    setDepositStatus("address_ready");
    addRecord({
      id: "rec-login",
      type: "Account",
      title: "Okta login completed",
      status: "Password and OTP verified",
      date: "2026-05-14 10:21",
    });
    addRecord({
      id: "rec-address-push",
      type: "Deposit",
      title: "Deposit address pushed",
      status: "New address instruction received in client portal",
      amount: depositAddress.amount,
      date: "2026-05-14 10:22",
    });
    setView("dashboard");
  }

  function markTestDeposited() {
    setDepositStatus("checking_test");
    addRecord({
      id: "rec-test-checking",
      type: "Deposit",
      title: "Test deposit marked as sent",
      status: "System checking 1 USDT on-chain status",
      amount: depositAddress.testAmount,
      date: "2026-05-14 10:25",
    });
  }

  function simulateTestDepositSuccess() {
    setDepositStatus("test_success");
    addRecord({
      id: "rec-test-success",
      type: "Deposit",
      title: "Test deposit successful",
      status: "1 USDT confirmed. Full deposit is now enabled.",
      amount: depositAddress.testAmount,
      date: "2026-05-14 10:28",
    });
  }

  function markFullDeposited() {
    setDepositStatus("checking_full");
    addRecord({
      id: "rec-full-checking",
      type: "Deposit",
      title: "Full deposit marked as sent",
      status: "System checking full deposit on-chain status",
      amount: depositAddress.amount,
      date: "2026-05-14 10:30",
    });
  }

  function simulateFullDepositSuccess() {
    setDepositStatus("success");
    addRecord({
      id: "rec-success",
      type: "Deposit",
      title: "Full deposit successful",
      status: "Full amount is clear and credited",
      amount: depositAddress.amount,
      date: "2026-05-14 10:31",
    });
    setView("dashboard");
  }

  function simulateDepositReturned(stage: "test" | "full") {
    setDepositStatus("returned");
    addRecord({
      id: stage === "test" ? "rec-test-return" : "rec-full-return",
      type: "Return",
      title: stage === "test" ? "Test deposit failed and returned" : "Full deposit failed and returned",
      status: "Original route return initiated after compliance review",
      amount: stage === "test" ? depositAddress.testAmount : depositAddress.amount,
      date: "2026-05-14 10:36",
    });
    setView("dashboard");
  }

  function resetDemo() {
    setView("home");
    setAccountStatus("not_created");
    setKycStatus("not_started");
    setDepositStatus("none");
    setLoginStage("credentials");
    setCredentials({ username: demoAccount.username, password: demoAccount.password });
    setOtp("");
    setLoginError(undefined);
    setForm(defaultForm);
    setIsAuthenticated(false);
    setAddressRevealed(false);
    setRecords([
      {
        id: "rec-start",
        type: "KYC",
        title: "Client portal opened",
        status: "KYC application not started",
        date: "2026-05-14 09:00",
      },
    ]);
  }

  function renderKycStatusCard() {
    if (kycStatus === "verified") {
      return (
        <div className="client-status-card success">
          <span>✓</span>
          <div>
            <strong>KYC Approved</strong>
            <p>Your account has been issued. You can log in through Okta.</p>
          </div>
        </div>
      );
    }

    if (kycStatus === "under_review") {
      return (
        <div className="client-status-card warning">
          <span>·</span>
          <div>
            <strong>KYC Pending</strong>
            <p>The DD team is reviewing your submitted application.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="client-status-card">
        <span>1</span>
        <div>
          <strong>KYC Required</strong>
          <p>Submit the application before an account can be created.</p>
        </div>
      </div>
    );
  }

  function renderDepositStatusCard() {
    const copy: Record<DepositStatus, { title: string; body: string; tone?: string }> = {
      none: {
        title: "No Deposit Address",
        body: "A deposit instruction will be pushed here after KYC approval and Okta login.",
      },
      address_ready: {
        title: "Address Received",
        body: "A secure deposit address has been pushed. First send a 1 USDT test deposit to verify the route.",
        tone: "warning",
      },
      checking_test: {
        title: "Checking Test Deposit",
        body: "The 1 USDT test deposit was marked as sent. The system is checking on-chain status.",
        tone: "warning",
      },
      test_success: {
        title: "Test Deposit Successful",
        body: "The 1 USDT test deposit is confirmed. You can now deposit the full amount to the same address.",
        tone: "success",
      },
      checking_full: {
        title: "Checking Full Deposit",
        body: "The full deposit was marked as sent. The system is checking confirmations and compliance result.",
        tone: "warning",
      },
      success: {
        title: "Deposit Successful",
        body: "Your deposit is confirmed and credited.",
        tone: "success",
      },
      returned: {
        title: "Deposit Returned",
        body: "The deposit failed review and original route return has been initiated.",
        tone: "danger",
      },
    };
    const status = copy[depositStatus];

    return (
      <div className={`client-status-card ${status.tone ?? ""}`}>
        <span>{depositStatus === "success" || depositStatus === "test_success" ? "✓" : depositStatus === "returned" ? "!" : "2"}</span>
        <div>
          <strong>{status.title}</strong>
          <p>{status.body}</p>
        </div>
      </div>
    );
  }

  function renderView() {
    if (view === "home") {
      return (
        <section className="mobile-card hero">
          <p className="eyebrow">VIP Client</p>
          <h1>Secure client portal</h1>
          <p className="muted">
            Complete KYC, log in with Okta after approval, receive deposit address notifications, and track all deposit
            records in one place.
          </p>
          {renderKycStatusCard()}
          <div className="client-action-grid">
            <button className="button primary" type="button" onClick={() => setView("login")}>
              Login with Okta
            </button>
            <button className="button" type="button" onClick={() => setView("profile")}>
              No Account? Apply
            </button>
          </div>
          <div className="notice-box compact">
            Demo rule: new users must submit KYC first. After DD approval, the system issues account credentials for
            Okta login.
          </div>
        </section>
      );
    }

    if (view === "login") {
      return (
        <section className="mobile-card">
          <div className="okta-brand">okta</div>
          <p className="eyebrow">Secure Login</p>
          <h1>{loginStage === "otp" ? "Enter Okta OTP" : "Login with Okta"}</h1>
          <p className="muted">
            Use the account issued after KYC approval. If you do not have an account yet, submit the KYC application
            first.
          </p>

          {accountStatus === "issued" ? (
            <div className="invite-card">
              <span>Demo account issued</span>
              <strong>{demoAccount.username}</strong>
              <p>Password: {demoAccount.password}</p>
            </div>
          ) : (
            <div className="notice-box compact">No approved account yet. Complete KYC application and wait for approval.</div>
          )}

          {loginStage === "credentials" ? (
            <div className="form">
              <div className="field">
                <label htmlFor="client-username">Username</label>
                <input
                  id="client-username"
                  value={credentials.username}
                  autoComplete="username"
                  onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="client-password">Password</label>
                <input
                  id="client-password"
                  type="password"
                  value={credentials.password}
                  autoComplete="current-password"
                  onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
                />
              </div>
              {loginError ? <p className="error-text">{loginError}</p> : null}
              <button className="button primary mobile-full" type="button" onClick={submitCredentials}>
                Continue
              </button>
              <button className="button mobile-full" type="button" onClick={() => setView("profile")}>
                Apply for KYC
              </button>
            </div>
          ) : (
            <div className="form">
              <div className="secure-channel-card">
                <div>
                  <strong>Okta OTP sent</strong>
                  <span>
                    {demoAccount.maskedMobile} · {demoAccount.maskedEmail}
                  </span>
                </div>
              </div>
              <div className="mfa-panel okta-push-panel">
                <span>Demo Okta OTP</span>
                <strong>{demoAccount.otp}</strong>
                <p>Production can use Okta Verify push, passkey, authenticator, SMS, or email depending on policy.</p>
              </div>
              <div className="field">
                <label htmlFor="client-otp">Enter OTP</label>
                <input
                  id="client-otp"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                />
              </div>
              {loginError ? <p className="error-text">{loginError}</p> : null}
              <button className="button primary mobile-full" type="button" onClick={verifyOktaOtp}>
                Login
              </button>
            </div>
          )}
        </section>
      );
    }

    if (view === "profile") {
      return (
        <section className="mobile-card">
          <p className="eyebrow">KYC Application</p>
          <h1>Your details</h1>
          <div className="form">
            <div className="field">
              <label htmlFor="legal-name">Legal name</label>
              <input id="legal-name" value={form.legalName} onChange={(event) => updateForm("legalName", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="dob">Date of birth</label>
              <input id="dob" type="date" value={form.dateOfBirth} onChange={(event) => updateForm("dateOfBirth", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="nationality">Nationality</label>
              <input id="nationality" value={form.nationality} onChange={(event) => updateForm("nationality", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="residency">Residency</label>
              <input id="residency" value={form.residency} onChange={(event) => updateForm("residency", event.target.value)} />
            </div>
            <button className="button primary mobile-full" type="button" onClick={() => setView("identity")}>
              Continue
            </button>
          </div>
        </section>
      );
    }

    if (view === "identity") {
      return (
        <section className="mobile-card">
          <p className="eyebrow">Identity</p>
          <h1>Government ID</h1>
          <div className="form">
            <div className="field">
              <label htmlFor="document-type">Document type</label>
              <select id="document-type" value={form.documentType} onChange={(event) => updateForm("documentType", event.target.value)}>
                <option value="Passport">Passport</option>
                <option value="National ID">National ID</option>
                <option value="Resident Card">Resident Card</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="document-number">Document number</label>
              <input id="document-number" value={form.documentNumber} onChange={(event) => updateForm("documentNumber", event.target.value)} />
            </div>
            <button className="button primary mobile-full" type="button" onClick={() => setView("documents")}>
              Continue to Document Capture
            </button>
          </div>
        </section>
      );
    }

    if (view === "documents") {
      return (
        <section className="mobile-card">
          <p className="eyebrow">Documents</p>
          <h1>Upload and liveness</h1>
          <div className="mobile-upload-list">
            <div>
              <span>01</span>
              <strong>Passport photo</strong>
              <p>Capture front page or identity card image.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Selfie liveness</strong>
              <p>Confirm the applicant is present and matches the document.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Proof of address</strong>
              <p>Upload bank statement or utility bill if required.</p>
            </div>
          </div>
          <button className="button primary mobile-full" type="button" onClick={() => setView("funds")}>
            Continue
          </button>
        </section>
      );
    }

    if (view === "funds") {
      return (
        <section className="mobile-card">
          <p className="eyebrow">Source of Funds</p>
          <h1>Financial background</h1>
          <div className="form">
            <div className="field">
              <label htmlFor="occupation">Occupation</label>
              <input id="occupation" value={form.occupation} onChange={(event) => updateForm("occupation", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="employer">Employer / business</label>
              <input id="employer" value={form.employer} onChange={(event) => updateForm("employer", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="source-of-funds">Source of funds</label>
              <input id="source-of-funds" value={form.sourceOfFunds} onChange={(event) => updateForm("sourceOfFunds", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="source-of-wealth">Source of wealth</label>
              <input id="source-of-wealth" value={form.sourceOfWealth} onChange={(event) => updateForm("sourceOfWealth", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="visit-amount">Expected deposit amount</label>
              <select id="visit-amount" value={form.expectedVisitAmount} onChange={(event) => updateForm("expectedVisitAmount", event.target.value)}>
                <option value="Below 10,000 USD">Below 10,000 USD</option>
                <option value="10,000 - 50,000 USD">10,000 - 50,000 USD</option>
                <option value="50,000 - 100,000 USD">50,000 - 100,000 USD</option>
                <option value="Above 100,000 USD">Above 100,000 USD</option>
              </select>
            </div>
            <button className="button primary mobile-full" type="button" onClick={() => setView("submit")}>
              Review Before Submit
            </button>
          </div>
        </section>
      );
    }

    if (view === "submit") {
      return (
        <section className="mobile-card">
          <p className="eyebrow">Submit</p>
          <h1>Send KYC application</h1>
          <div className="mobile-summary">
            <div>
              <span>Name</span>
              <strong>{form.legalName}</strong>
            </div>
            <div>
              <span>Document</span>
              <strong>
                {form.documentType} · {form.documentNumber}
              </strong>
            </div>
            <div>
              <span>Expected deposit amount</span>
              <strong>{form.expectedVisitAmount}</strong>
            </div>
          </div>
          <div className="notice-box compact">
            After submission, the DD team verifies documents, sanctions / PEP / adverse media, and source of funds.
          </div>
          <button className="button primary mobile-full" type="button" onClick={submitKyc}>
            Submit KYC Application
          </button>
        </section>
      );
    }

    if (view === "review") {
      return (
        <section className="mobile-card hero">
          <span className="result-icon warning">·</span>
          <p className="eyebrow">Waiting Approval</p>
          <h1>KYC is under review</h1>
          <p className="muted">
            After approval, you will receive an account notification. Use that account and password to log in with Okta.
          </p>
          {renderKycStatusCard()}
          {accountStatus === "issued" ? (
            <div className="invite-card">
              <span>Account notification</span>
              <strong>{demoAccount.username}</strong>
              <p>Password: {demoAccount.password}</p>
            </div>
          ) : null}
          <button className="button primary mobile-full" type="button" onClick={approveKycAndIssueAccount}>
            Demo: Approve and Issue Account
          </button>
          <button className="button mobile-full" type="button" onClick={() => setView("login")} disabled={accountStatus !== "issued"}>
            Go to Okta Login
          </button>
        </section>
      );
    }

    if (view === "dashboard") {
      return (
        <section className="mobile-card hero">
          <p className="eyebrow">Client Home</p>
          <h1>Welcome, {form.legalName.split(" ")[0]}</h1>
          {renderKycStatusCard()}
          {renderDepositStatusCard()}
          {depositStatus === "address_ready" ? (
            <div className="notice-box compact">New deposit address notification received. Open it from this portal.</div>
          ) : null}
          {depositStatus === "success" ? (
            <div className="notice-box compact">Deposit successful. Confirmation has been added to your records.</div>
          ) : null}
          {depositStatus === "test_success" ? (
            <div className="notice-box compact">Test deposit successful. Please open the same address to deposit the full amount.</div>
          ) : null}
          {depositStatus === "returned" ? (
            <div className="notice-box compact">Deposit failed. Original route return information has been pushed to your records.</div>
          ) : null}

          <div className="client-action-grid">
            <button className="button primary" type="button" onClick={() => setView("address")} disabled={depositStatus === "none"}>
              Open Address
            </button>
            <button className="button" type="button" onClick={() => setView("transactions")}>
              View Records
            </button>
          </div>
        </section>
      );
    }

    if (view === "address") {
      return (
        <section className="mobile-card">
          <p className="eyebrow">Deposit Address</p>
          <h1>Secure instruction</h1>
          <div className="address-security-box">
            <strong>Security design</strong>
            <p>Authenticated portal only · no address in SMS/chat · profile-bound · single request · expiry · audit trail</p>
          </div>
          <div className="mobile-security-grid">
            {secureAddressRules.map((item) => (
              <div key={item}>
                <span>✓</span>
                <p>{item}</p>
              </div>
            ))}
          </div>

          {!addressRevealed ? (
            <button className="button primary mobile-full" type="button" onClick={() => setAddressRevealed(true)}>
              Reveal Address in Secure Session
            </button>
          ) : (
            <>
              <div className="deposit-address-card">
                <span>{depositAddress.asset} on {depositAddress.network}</span>
                <strong>{depositAddress.address}</strong>
                <p>Step 1 test amount: {depositAddress.testAmount}</p>
                <p>Step 2 full amount: {depositAddress.amount}</p>
                <p>Use the same address for both deposits.</p>
                <p>Expires: {depositAddress.expiresAt}</p>
              </div>
              {depositStatus === "address_ready" ? (
                <button className="button primary mobile-full" type="button" onClick={markTestDeposited}>
                  I Have Deposited 1 USDT
                </button>
              ) : null}
              {depositStatus === "checking_test" ? (
                <>
                  <div className="notice-box compact">
                    Checking the 1 USDT test deposit. Demo can resolve as test success or failed + original route return.
                  </div>
                  <div className="client-action-grid">
                    <button className="button" type="button" onClick={simulateTestDepositSuccess}>
                      Demo Test Success
                    </button>
                    <button className="button danger" type="button" onClick={() => simulateDepositReturned("test")}>
                      Demo Failed + Return
                    </button>
                  </div>
                </>
              ) : null}
              {depositStatus === "test_success" ? (
                <>
                  <div className="notice-box compact">
                    The test deposit is confirmed. Deposit the full amount to the same address.
                  </div>
                  <button className="button primary mobile-full" type="button" onClick={markFullDeposited}>
                    I Have Deposited Full Amount
                  </button>
                </>
              ) : null}
              {depositStatus === "checking_full" ? (
                <>
                  <div className="notice-box compact">
                    Checking full deposit confirmations and compliance status. Demo can resolve as success or failed +
                    original route return.
                  </div>
                  <div className="client-action-grid">
                    <button className="button" type="button" onClick={simulateFullDepositSuccess}>
                      Demo Full Success
                    </button>
                    <button className="button danger" type="button" onClick={() => simulateDepositReturned("full")}>
                      Demo Failed + Return
                    </button>
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      );
    }

    if (view === "transactions") {
      return (
        <section className="mobile-card">
          <p className="eyebrow">Records</p>
          <h1>All transaction records</h1>
          <div className="transaction-list">
            {records.map((record) => (
              <div key={record.id}>
                <span>{record.type}</span>
                <strong>{record.title}</strong>
                <p>{record.status}</p>
                {record.amount ? <p>{record.amount}</p> : null}
                <small>{record.date}</small>
              </div>
            ))}
          </div>
          <button className="button mobile-full" type="button" onClick={() => setView(isAuthenticated ? "dashboard" : "home")}>
            Back
          </button>
          <button className="button mobile-full" type="button" onClick={resetDemo}>
            Restart Demo
          </button>
        </section>
      );
    }

    return null;
  }

  return (
    <div className="patron-mobile-stage">
      <section className="iphone-frame" aria-label="VIP client mobile app">
        <header className="mobile-header">
          <div>
            <strong>VIP</strong>
            <span>Client Portal</span>
          </div>
          <span className="secure-pill">Secure</span>
        </header>

        <div className="mobile-progress" aria-label="Client progress">
          <div>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <p>
            {stepLabels[view]} · {isAuthenticated ? "signed in" : accountStatus === "issued" ? "account issued" : "account required"}
          </p>
        </div>

        <main className="mobile-screen">{renderView()}</main>
      </section>
    </div>
  );
}
