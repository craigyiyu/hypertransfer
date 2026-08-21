# Host-led VIP Admission and Transaction Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current staff-first invitation/payment-application sequence with a Host-led VIP admission case that is claimed by email or QR, gated by KYC, approved by one business leader, and followed by per-transfer Travel Rule/KYT controls.

**Architecture:** Preserve the existing FastAPI + SQLite and React/Vite prototype, but add a distinct `Admission Case` aggregate and a distinct `Transaction Compliance Pack` aggregate. Keep legacy `invitations` and `payment_applications` readable for audit; do not mutate, drop, or silently migrate their personal data into the new model. All new flows use provider adapters: real Okta/Notabene/Hex integration is outside this prototype, and production must fail closed when a required provider is absent.

**Tech Stack:** FastAPI, SQLite, Pydantic, React 19, TypeScript, Wouter, Tailwind/shadcn, Vitest, Python `unittest`, existing `qrcode` package.

## Global Constraints

- Work only in `Hyper-Transfer-eason-github-20260820/hypertransfer-main/`.
- Do not commit secrets, SQLite databases, provider credentials, QR tokens, raw KYC documents, passport numbers, or real customer data.
- Hosts and the sole business leader authenticate through the existing staff session boundary; production Okta OIDC remains a provider boundary, not a browser-side mock.
- VIP onboarding is invitation-only and email OTP is mandatory for both the email-link and QR paths.
- Email invitation links retain the existing six-hour TTL. QR enrollment sessions rotate every 10–15 minutes but point to the same open admission case.
- KYC expires at the earlier of six calendar months after approval and the earliest relied-on identity-document expiry date.
- Every test and main VA transfer creates a distinct Travel Rule/KYT record. HKD 8,000 switches basic versus enhanced field depth; it never makes Travel Rule optional.
- The customer UI must never display Host notes, raw KYC evidence, internal risk reasons, custody configuration, vault identifiers, or provider secrets.
- Host-visible KYC outcomes use controlled reason codes only. Sanctions, STR, investigation, and suspicious-activity outcomes show a neutral restricted status.
- Preserve the existing manual Cage confirmation entry and finance reconciliation records.

---

## File structure and ownership

| File | Responsibility |
|---|---|
| `backend/admission_rules.py` | Pure status transitions and visible-reason policy for Host/VIP admission cases. |
| `backend/transaction_compliance_rules.py` | Basic/enhanced Travel Rule selection, KYC-expiry calculation, and transfer-leg gates. |
| `backend/test_admission_rules.py` | Unit tests for admission state and KYC-reason visibility. |
| `backend/test_transaction_compliance_rules.py` | Unit tests for threshold, expiry, and test/main transfer isolation. |
| `backend/server.py` | SQLite migrations, role enforcement, APIs, audit events, provider adapters, and legacy read-only boundary. |
| `client/src/lib/admission-case.ts` | Typed frontend labels, status mapping, and safe Host/VIP display helpers. |
| `client/src/lib/transaction-compliance.ts` | Typed UI helper for actual-amount threshold, changed-source invalidation, and transfer-leg labels. |
| `client/src/lib/api.ts` | Typed APIs for Host profile, admission, leader approval, payment intent, and compliance packs. |
| `client/src/components/AdmissionCasePanel.tsx` | Host case creation, case list, invitation delivery, QR display, and Host-safe KYC status. |
| `client/src/components/LeaderApprovalPanel.tsx` | Sole-leader queue and business approval/rejection controls. |
| `client/src/components/PaymentOperationsPanel.tsx` | Operations view of payment intent, two transfer legs, Cage confirmation ID, and reconciliation status. |
| `client/src/pages/Invite.tsx` | Email-link and QR claim landing page with invitation-email OTP binding. |
| `client/src/pages/KYC.tsx` and `KYCStatus.tsx` | Case-aware KYC prefill, expiry, blocked status, and safe customer actions. |
| `client/src/pages/Dashboard.tsx` | Admission progress and the correct next action; no arbitrary deposit entry. |
| `client/src/pages/NewDeposit.tsx`, `TravelRule.tsx`, `DepositAddress.tsx`, `MainDeposit.tsx` | Per-payment actual confirmation, Travel Rule/KYT gates, address issuance, test leg, and main leg. |
| `client/src/pages/CasinoOpsPortal.tsx` | Role-aware staff navigation: VIP Admissions, Leader Approval, Payment Operations, and Staff Admin. |
| `client/src/contexts/DemoContext.tsx` | Demo-only presentation state, kept subordinate to backend authority. |

## Task 1: Establish pure admission and compliance rules

**Files:**

- Create: `backend/admission_rules.py`
- Create: `backend/transaction_compliance_rules.py`
- Create: `backend/test_admission_rules.py`
- Create: `backend/test_transaction_compliance_rules.py`

**Interfaces:**

```python
# backend/admission_rules.py
ADMISSION_STATUSES = frozenset({
    "draft", "invitation_open", "vip_claimed", "kyc_in_progress",
    "kyc_passed", "payment_precheck", "leader_pending", "service_enabled",
    "kyc_failed", "compliance_review", "rejected", "expired", "revoked",
})

def can_transition_admission(current: str, target: str, route: str) -> bool: ...
def host_kyc_reason(code: str) -> tuple[str, bool]: ...

# backend/transaction_compliance_rules.py
HKD_TRAVEL_RULE_THRESHOLD = Decimal("8000")
def kyc_valid_until(approved_at: int, document_expiries: list[int]) -> int: ...
def travel_rule_depth(actual_hkd_amount: Decimal) -> Literal["basic", "enhanced"]: ...
def payment_change_requires_revalidation(before: PaymentFingerprint, after: PaymentFingerprint) -> bool: ...
```

- [ ] **Step 1: Write failing unit tests for the recommended and alternative admission routes.**

```python
def test_recommended_route_requires_kyc_and_precheck_before_leader():
    assert can_transition_admission("kyc_in_progress", "kyc_passed", "complete_dossier")
    assert can_transition_admission("kyc_passed", "payment_precheck", "complete_dossier")
    assert not can_transition_admission("kyc_passed", "leader_pending", "complete_dossier")

def test_kcy_failure_cannot_reach_payment_or_leader():
    assert not can_transition_admission("kyc_failed", "payment_precheck", "complete_dossier")
    assert not can_transition_admission("kyc_failed", "leader_pending", "complete_dossier")
```

- [ ] **Step 2: Run the failing admission test.**

Run: `cd backend && ./.venv/bin/python -m unittest test_admission_rules.py`

Expected: failure because `admission_rules` does not exist.

- [ ] **Step 3: Write failing tests for expiry, threshold depth, and changed-source rules.**

```python
def test_kyc_expiry_uses_earlier_document_expiry():
    approved_at = 1_735_689_600
    assert kyc_valid_until(approved_at, [approved_at + 90 * 86400]) == approved_at + 90 * 86400

def test_low_value_transfer_is_basic_not_not_required():
    assert travel_rule_depth(Decimal("7999.99")) == "basic"

def test_changed_wallet_requires_new_pack():
    assert payment_change_requires_revalidation(
        PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-old"),
        PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-new"),
    )
```

- [ ] **Step 4: Implement the two pure modules without database or HTTP imports.**

Use explicit transition maps. `host_kyc_reason("restricted")` must return `("Compliance review required — do not contact the customer for further explanation.", False)`. `kyc_valid_until` must use calendar-month arithmetic in the production helper, not `180 * 86400`.

- [ ] **Step 5: Run both rule suites.**

Run: `cd backend && ./.venv/bin/python -m unittest test_admission_rules.py test_transaction_compliance_rules.py`

Expected: all tests pass.

## Task 2: Add non-destructive data structures and provider boundaries

**Files:**

- Modify: `backend/server.py` schema initialization and migration section
- Create: `backend/admission_provider_adapters.py`
- Create: `backend/notabene_adapter.py`

**Interfaces:**

```sql
CREATE TABLE host_profiles (
  user_id TEXT PRIMARY KEY, employee_id TEXT, department TEXT,
  operating_team TEXT, location TEXT, phone TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','active','disabled')),
  acknowledged_at INTEGER, updated_at INTEGER NOT NULL
);

CREATE TABLE vip_admission_cases (
  id TEXT PRIMARY KEY, host_user_id TEXT NOT NULL, patron_email TEXT NOT NULL,
  member_reference TEXT, service_purpose TEXT, host_notes TEXT,
  preferred_language TEXT, route TEXT NOT NULL,
  patron_user_id TEXT, status TEXT NOT NULL, leader_user_id TEXT,
  kyc_reason_code TEXT, kyc_valid_until INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE admission_invitation_sessions (
  id TEXT PRIMARY KEY, admission_case_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('email','qr')),
  token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
  consumed_at INTEGER, revoked_at INTEGER, created_at INTEGER NOT NULL
);

CREATE TABLE payment_intents (
  id TEXT PRIMARY KEY, admission_case_id TEXT NOT NULL,
  asset TEXT NOT NULL, network TEXT NOT NULL, intended_amount TEXT,
  source_type TEXT, source_identifier TEXT, counterparty_name TEXT,
  status TEXT NOT NULL, fingerprint_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE transaction_compliance_packs (
  id TEXT PRIMARY KEY, payment_intent_id TEXT NOT NULL,
  transfer_leg TEXT NOT NULL CHECK(transfer_leg IN ('verification','main')),
  actual_amount TEXT NOT NULL, actual_hkd_amount TEXT NOT NULL,
  travel_rule_depth TEXT NOT NULL CHECK(travel_rule_depth IN ('basic','enhanced')),
  kyt_status TEXT NOT NULL, travel_rule_status TEXT NOT NULL,
  notabene_reference TEXT, immutable_snapshot_json TEXT NOT NULL,
  created_at INTEGER NOT NULL, finalized_at INTEGER
);
```

- [ ] **Step 1: Add migration tests that start from the current SQLite schema.**

```python
def test_schema_migration_preserves_legacy_invitation_rows(tmp_path):
    conn = open_current_schema(tmp_path / "legacy.db")
    insert_legacy_invitation(conn)
    initialise_database(tmp_path / "legacy.db")
    assert select_legacy_invitation_count(conn) == 1
    assert table_exists(conn, "vip_admission_cases")
```

- [ ] **Step 2: Run the migration test and verify it fails before new tables exist.**

Run: `cd backend && ./.venv/bin/python -m unittest test_admission_migration.py`

Expected: failure on missing `vip_admission_cases`.

- [ ] **Step 3: Add idempotent `CREATE TABLE IF NOT EXISTS` and indexes.**

Add indexes for `host_user_id`, `patron_email`, `status`, `admission_case_id`, and `(payment_intent_id, transfer_leg)`. Do not run `DROP TABLE`, `ALTER TABLE ... RENAME`, or copy historical PII into the new tables.

- [ ] **Step 4: Define provider interfaces and deterministic non-production adapters.**

```python
class NotabeneProvider(Protocol):
    def validate_and_send(self, pack: TransactionCompliancePack) -> ProviderDecision: ...

class DemoNotabeneProvider:
    def validate_and_send(self, pack):
        if pack.actual_hkd_amount <= 0:
            return ProviderDecision("rejected", "", "invalid_amount")
        return ProviderDecision("accepted", f"NB-DEMO-{pack.id}", "")
```

Production must return HTTP 503 before address issuance if `NOTABENE_*` configuration is missing. Never retain raw tokens in SQLite; store only salted hashes.

- [ ] **Step 5: Run migration and adapter tests.**

Run: `cd backend && ./.venv/bin/python -m unittest test_admission_migration.py test_notabene_adapter.py`

Expected: all pass and legacy invitation/payment rows remain queryable.

## Task 3: Implement Host provisioning and admission-case APIs

**Files:**

- Modify: `backend/server.py`
- Modify: `client/src/lib/api.ts`
- Create: `client/src/lib/admission-case.ts`
- Create: `client/src/components/AdmissionCasePanel.tsx`
- Modify: `client/src/pages/CasinoOpsPortal.tsx`

**Interfaces:**

```python
POST /api/host/profile/activate
GET  /api/host/profile
POST /api/admission-cases
GET  /api/admission-cases/mine
GET  /api/admission-cases/{case_id}
POST /api/admission-cases/{case_id}/revoke
```

```ts
export type AdmissionCaseStatus =
  | "draft" | "invitation_open" | "vip_claimed" | "kyc_in_progress"
  | "kyc_passed" | "payment_precheck" | "leader_pending" | "service_enabled"
  | "kyc_failed" | "compliance_review" | "rejected" | "expired" | "revoked";

export interface AdmissionCase {
  id: string; hostName: string; patronEmailMasked: string; status: AdmissionCaseStatus;
  kycHostMessage?: string; kycValidUntil?: string; invitation?: { emailExpiresAt: string; qrExpiresAt: string };
}
```

- [ ] **Step 1: Write API tests for role and ownership.**

```python
def test_only_active_host_can_create_case(client, active_host_token, inactive_host_token):
    assert client.post("/api/admission-cases", json=case_payload(), headers=auth(active_host_token)).status_code == 200
    assert client.post("/api/admission-cases", json=case_payload(), headers=auth(inactive_host_token)).status_code == 403

def test_host_cannot_read_another_hosts_case(client, host_a_token, host_b_case):
    assert client.get(f"/api/admission-cases/{host_b_case}", headers=auth(host_a_token)).status_code == 404
```

- [ ] **Step 2: Add `host` and `leader` roles while retaining existing legacy roles.**

`host` is a staff role with access only to its own admission cases. `leader` can only read eligible leader-pending cases and record one business decision. `admin` can view for support/audit but cannot impersonate a Host.

- [ ] **Step 3: Implement Host activation and case APIs with audit events.**

Every create, update, revoke, and status transition calls the existing `write_audit` boundary with case ID, actor, prior status, next status, and a safe detail payload. Return Host notes only to the case owner, Compliance, and Admin; never to VIP/Leader.

- [ ] **Step 4: Add the Host workspace.**

Replace the current `Access Requests` tab for `rm` with `VIP Admissions`. It has: Host activation banner, create-case form, list of the Host's cases, status timeline, resend email, show QR, and revoke controls. Do not place payment-source, ID, or raw KYC fields in the Host form.

- [ ] **Step 5: Run targeted frontend/backend tests.**

Run: `pnpm test -- admission-case && cd backend && ./.venv/bin/python -m unittest test_admission_api.py`

Expected: green tests; inactive or cross-Host actions return 403/404.

## Task 4: Replace approval-first invitation with dual-channel case claiming

**Files:**

- Modify: `backend/server.py` invitation endpoints
- Modify: `client/src/pages/Invite.tsx`
- Modify: `client/src/lib/api.ts`
- Create: `client/src/lib/admission-invite.test.ts`

**Interfaces:**

```python
POST /api/admission-cases/{case_id}/invite/email
POST /api/admission-cases/{case_id}/invite/qr-session
POST /api/admission-claims/verify-email
POST /api/admission-claims/register
```

- [ ] **Step 1: Write tests for email and QR sessions.**

```python
def test_email_and_qr_sessions_bind_the_same_case_after_email_otp(client, host, case):
    email = issue_email_session(client, host, case)
    qr = issue_qr_session(client, host, case)
    patron = claim_after_email_otp(client, qr, "vip@example.test")
    assert admission_case(client, case)["patronUserId"] == patron["id"]
    assert verify_session(client, email, "vip@example.test").status_code == 410

def test_qr_session_rejects_wrong_email_without_email_enumeration(client, case):
    response = verify_session(client, issue_qr(case), "wrong@example.test")
    assert response.status_code == 400
    assert "invitation" not in response.json()["detail"].lower()
```

- [ ] **Step 2: Keep the legacy invitation endpoints read-only for existing records.**

Do not route new Host cases through `POST /api/invitations`, `marketing` approval, or `_issue_invite_link_and_email`. New case APIs issue a hashed email session with six-hour expiry and a distinct QR session with 15-minute expiry.

- [ ] **Step 3: Implement the public claim page.**

`/invite` accepts either `emailSession` or `qrSession`, displays only the masked destination email, calls the existing email OTP sender after case/email verification, then creates the patron account and MFA setup. It has no ability to edit Host notes or use a different email.

- [ ] **Step 4: Add browser tests.**

```ts
it("claims a QR case only after the invitation email OTP", async () => {
  render(<Invite />);
  await user.type(screen.getByLabelText("Invitation email"), "vip@example.test");
  await user.click(screen.getByRole("button", { name: "Send email code" }));
  await user.type(screen.getByLabelText("Verification code"), "123456");
  expect(await screen.findByText("Set up your account")).toBeVisible();
});
```

- [ ] **Step 5: Run the invite tests.**

Run: `pnpm test -- admission-invite && cd backend && ./.venv/bin/python -m unittest test_admission_claims.py`

Expected: email and QR may claim the same open case, but only the correctly verified email can complete account binding.

## Task 5: Make KYC case-aware, document-expiry-aware, and safely visible to Host

**Files:**

- Modify: `backend/server.py` Sumsub persistence, webhook, and KYC eligibility functions
- Modify: `client/src/pages/KYC.tsx`
- Modify: `client/src/pages/KYCStatus.tsx`
- Modify: `client/src/lib/kyc-status.ts`
- Modify: `client/src/components/AdmissionCasePanel.tsx`

**Interfaces:**

```python
def persist_case_kyc_outcome(case_id: str, user_id: str, provider_status: str,
                             document_expiries: list[int], reason_code: str | None) -> None: ...
```

- [ ] **Step 1: Write KYC validity and safe-visibility tests.**

```python
def test_document_expiry_shortens_kyc_validity(client, patron, case):
    approve_kyc(case, patron, expiry_days=90)
    assert get_case(case)["kycValidUntil"] == exactly_90_days_after_approval()

def test_host_receives_safe_reason_not_provider_detail(client, host, case):
    set_kyc_failure(case, reason_code="document_expired", provider_detail="passport #1234 expired")
    data = get_case_as_host(client, host, case)
    assert data["kycHostMessage"] == "Document expired — ask the VIP to resubmit a valid document."
    assert "#1234" not in json.dumps(data)
```

- [ ] **Step 2: Remove all hard-coded `180 * 24 * 60 * 60` validity decisions from eligibility paths.**

Use `kyc_valid_until` from Task 1. Persist the relied-on document expiry dates or the earliest relied-on expiry. KYC must move the case only from `kyc_in_progress` to `kyc_passed`, `kyc_failed`, or `compliance_review`.

- [ ] **Step 3: Gate KYC correctly in the UI.**

The VIP sees KYC immediately after account/MFA. `KYC failed` gives only customer-safe resubmission directions. The Dashboard, payment intent, Travel Rule, and leader queue remain inaccessible until a valid `kyc_passed` case exists.

- [ ] **Step 4: Run KYC regression tests.**

Run: `pnpm test -- kyc && cd backend && ./.venv/bin/python -m unittest test_kyc_case_gates.py`

Expected: expired documents block payment even before six months, and restricted outcomes never expose their cause.

## Task 6: Add the single-leader approval gate and notifications

**Files:**

- Create: `client/src/components/LeaderApprovalPanel.tsx`
- Modify: `client/src/pages/CasinoOpsPortal.tsx`
- Modify: `backend/server.py`
- Modify: `client/src/lib/api.ts`

**Interfaces:**

```python
GET  /api/leader/admission-cases
POST /api/admission-cases/{case_id}/leader-decision
```

- [ ] **Step 1: Write leader queue tests.**

```python
def test_leader_only_sees_cases_with_passed_kyc_and_precheck(client, leader, host_case):
    assert list_leader_cases(client, leader) == []
    mark_kyc_passed(host_case)
    mark_precheck_passed(host_case)
    assert [row["id"] for row in list_leader_cases(client, leader)] == [host_case]

def test_leader_cannot_approve_case_with_kyc_failure(client, leader, failed_case):
    assert leader_decision(client, leader, failed_case, "approved").status_code == 409
```

- [ ] **Step 2: Implement one-leader decision enforcement.**

Use a single configured leader user ID or one leader role with an allow-list config. Reject decisions by Host, Compliance, Marketing, or arbitrary Admin accounts. `approved` moves the case to `service_enabled`; `rejected` requires a business-safe reason and ends admission.

- [ ] **Step 3: Send event notifications through the existing email abstraction.**

Send the VIP and Host: invitation delivery, KYC resubmission request, leader approval, and leader rejection. Do not send restricted KYC details or Host notes. Record the channel/outcome in the audit log.

- [ ] **Step 4: Build the Leader Approval panel.**

Show only business rationale, KYC pass/valid-until, source classification, intended asset/network/amount, and pre-check status. Do not render raw ID, address, document expiry, wallet address, provider responses, or KYC reason.

- [ ] **Step 5: Run leader tests.**

Run: `pnpm test -- leader-approval && cd backend && ./.venv/bin/python -m unittest test_leader_approval.py`

Expected: only the configured leader can make a final service decision.

## Task 7: Replace application-level Travel Rule with intent and transaction packs

**Files:**

- Modify: `backend/server.py` deposit APIs and payment-application integration
- Modify: `client/src/lib/travel-rule.ts`
- Create: `client/src/lib/transaction-compliance.ts`
- Create: `client/src/lib/transaction-compliance.test.ts`
- Modify: `client/src/pages/Dashboard.tsx`
- Modify: `client/src/pages/NewDeposit.tsx`
- Modify: `client/src/pages/TravelRule.tsx`
- Modify: `client/src/pages/DepositAddress.tsx`
- Modify: `client/src/pages/MainDeposit.tsx`

**Interfaces:**

```python
POST /api/payment-intents
POST /api/payment-intents/{intent_id}/source-classification
POST /api/payment-intents/{intent_id}/actual-confirmation
POST /api/payment-intents/{intent_id}/compliance-packs
POST /api/transaction-compliance-packs/{pack_id}/screen
POST /api/transaction-compliance-packs/{pack_id}/issue-address
POST /api/transaction-compliance-packs/{pack_id}/record-transfer
```

- [ ] **Step 1: Write transaction-pack tests before changing the existing `payment_applications` flow.**

```python
def test_one_intent_has_distinct_verification_and_main_packs(client, eligible_case):
    intent = create_intent(client, eligible_case)
    verification = create_pack(client, intent, leg="verification", actual_hkd="8")
    main = create_pack(client, intent, leg="main", actual_hkd="80000")
    assert verification["id"] != main["id"]
    assert verification["travelRuleDepth"] == "basic"
    assert main["travelRuleDepth"] == "enhanced"

def test_crossing_threshold_requires_enhanced_revalidation(client, eligible_case):
    intent = create_intent(client, eligible_case, amount="7999")
    assert confirm_actual(client, intent, amount="8001")["requiresRevalidation"] is True
```

- [ ] **Step 2: Change the Travel Rule domain model.**

Remove customer-visible use of `not_required` and `required: false` for low-value transfers. Replace them with `basic` and `enhanced` packs. A current `payment_applications.travel_rule_json` remains historical evidence only; it must not authorize a new transfer.

- [ ] **Step 3: Implement source branches.**

For VASP sources, collect institution name, customer account/user reference, jurisdiction and eligibility result. For self-hosted wallets, collect wallet address, ownership/control proof result and KYT result. A failed or manual-review source cannot create a compliance pack that can issue an address.

- [ ] **Step 4: Implement actual-confirmation invalidation.**

Create and compare this immutable fingerprint before Notabene submission:

```ts
export type PaymentFingerprint = {
  asset: "USDT" | "USDC";
  network: "ethereum" | "tron";
  actualAmount: string;
  sourceType: "wallet" | "vasp";
  sourceIdentifier: string;
  counterpartyId?: string;
};
```

If any property changes, invalidate pre-check status, create a new pack, rerun required checks, and block address issuance.

- [ ] **Step 5: Update the VIP UI to a concise payment-confirmation journey.**

Screen order: actual amount/asset/network → source branch → prefilled Travel Rule confirmation → Notabene/KYT pending → address → verification transfer → main transfer. The page must explain that the exact final amount decides Basic/Enhanced fields. Existing valid KYC fields prefill; customers do not retype them unless changed.

- [ ] **Step 6: Run transaction tests.**

Run: `pnpm test -- transaction-compliance travel-rule && cd backend && ./.venv/bin/python -m unittest test_transaction_compliance_api.py`

Expected: every transfer leg has an immutable pack; no low-value transfer is marked `not_required`.

## Task 8: Update operations, retention and reconciliation

**Files:**

- Modify: `client/src/components/DepositQueuePanel.tsx`
- Create: `client/src/components/PaymentOperationsPanel.tsx`
- Modify: `client/src/pages/CasinoOpsPortal.tsx`
- Modify: `backend/server.py`
- Modify: `backend/seed_demo.py`

**Interfaces:**

```python
POST /api/transaction-compliance-packs/{pack_id}/cage-confirmation
GET  /api/operations/payment-cases
GET  /api/operations/reconciliation-export
```

- [ ] **Step 1: Write operation tests.**

```python
def test_ops_cannot_record_cage_confirmation_before_main_transfer_is_confirmed(client, ops, main_pack):
    assert record_cage_confirmation(client, ops, main_pack, "CAGE-001").status_code == 409

def test_reconciliation_row_contains_transaction_and_cage_references(client, settled_pack):
    row = export_rows(client, settled_pack)[0]
    assert row["transactionCompliancePackId"] == settled_pack
    assert row["cageConfirmationId"] == "CAGE-001"
```

- [ ] **Step 2: Rename generic marker handling in the new flow.**

The new visible label is `Cage confirmation ID`. Preserve legacy marker references on legacy deposits. A transaction cannot become settled until the main transfer is confirmed, a Cage confirmation ID is saved, and Finance reconciliation is recorded.

- [ ] **Step 3: Add retention and monitoring data.**

Persist immutable snapshots, Notabene reference/outcome, KYT outcome, transfer leg, custody address, TxID, and reconciliation events. Add a `retention_until` timestamp set to at least five years after transfer completion. Add a deterministic demo monitor that flags linked transfers by patron/source/beneficiary/asset/time; it must route to Compliance rather than silently change a result.

- [ ] **Step 4: Seed one complete demo.**

Create one active Host, one eligible admission case, one leader-approved VIP, one verification pack, one confirmed main pack, and one Cage-confirmed settlement. Use only reserved/example data.

- [ ] **Step 5: Run operations tests.**

Run: `cd backend && ./.venv/bin/python -m unittest test_payment_operations.py`

Expected: Cage confirmation and exported reconciliation are blocked until the main leg is complete.

## Task 9: Integration verification and documentation

**Files:**

- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `Docs/superpowers/specs/2026-08-21-host-led-vip-admission-and-transaction-compliance-design.md` only if the implementation discovers a documented discrepancy

- [ ] **Step 1: Add an end-to-end test matrix.**

Cover: Host activation; email claim; QR claim; wrong-email rejection; KYC passed; KYC document-expiry block; safe KYC failure; recommended approval route; alternative approval route; Basic transfer; Enhanced transfer; amount threshold crossing; VASP source; self-hosted source; verification pack; main pack; changed source revalidation; Cage confirmation; reconciliation export; expired/revoked invitation; Host ownership; leader authorization.

- [ ] **Step 2: Run all local checks.**

Run:

```bash
cd hypertransfer-main
pnpm test
pnpm run check
pnpm run build
cd backend
./.venv/bin/python -m unittest discover -p 'test_*.py'
```

Expected: all tests pass. A Vite bundle-size warning may be reported but no TypeScript, Python, or test failure is allowed.

- [ ] **Step 3: Perform a role-by-role browser smoke test.**

Verify the Host, VIP, leader, Compliance and HK Operations screens against the acceptance criteria in the design spec. Confirm that raw KYC details, Host notes, provider secrets and custody configuration never appear in the VIP or leader UI.

- [ ] **Step 4: Update project instructions after verification.**

Record actual provider boundaries, test commands, release notes, and any intentionally retained legacy screens. Do not claim a live Okta, Notabene, Hex Trust, or KYT integration unless its real sandbox/API contract was exercised.

- [ ] **Step 5: Commit each verified task separately.**

Use one focused commit per task. Do not stage unrelated working-tree files. Example:

```bash
git add backend/admission_rules.py backend/test_admission_rules.py
git commit -m "feat: add admission case rules"
```

## Plan self-review

- Spec coverage: Host lifecycle, invitation, email OTP, QR, KYC, leader approval, Basic/Enhanced per-transfer Travel Rule, Notabene boundary, KYT/source branching, verification/main transfer separation, Cage, Finance, retention and monitoring are each assigned to a task.
- Compatibility: legacy invitations and payment applications remain readable; new personal data is not silently migrated or deleted.
- Provider boundary: the plan requires deterministic mock adapters in non-production and fails closed in production where Notabene configuration is absent.
- Scope: Tasks 1–6 provide an independently testable admission product. Tasks 7–8 provide the separately testable payment/compliance product. Task 9 is the integration gate.
