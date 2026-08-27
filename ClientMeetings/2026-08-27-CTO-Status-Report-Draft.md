# HyperTransfer — Phase 1 Programme Status Report

> **Status:** Draft for internal review ahead of the client CTO call (2026-08-27)
> **Prepared by:** Heypervelocity (vendor)
> **Classification:** Confidential — for the client's internal use
> **Purpose:** Factual status of the Phase 1 hybrid-platform build against the consultant's QA/UAT test plan (68-case register): what is complete, what is not, and the development time required to support the plan end-to-end.

---

## 1. Programme overview

| Item | Detail |
| --- | --- |
| Programme | Phase 1 — existing-patron USDT/USDC (Ethereum ERC-20) deposits to settle outstanding marker balances |
| Stage | **Project confirmation** — quotation issued (USD 146,250, 325 person-days, 13-week delivery), contract not yet signed |
| Our role | **Vendor** under the QA/UAT plan: owner of L1 vendor system testing; supports L2 witnessed testing, L3–L9 integration/compliance/security/privacy/ops/UAT/live-pilot levels; defect remediation; vendor evidence |
| Commercial baseline | Quotation HT-2026-001 — Items 01–11; USD 450/person-day; team 4 developers + 1 product manager |
| Reference documents | Consultant QA/UAT test plan (draft rev 0.1, 68 cases, 10 stages); Hex Trust 36-question clarification; project design & process docs |

**Bottom line:** the platform already covers the core mechanics the test plan depends on (24 of 68 cases directly supported), with 175 backend automated tests, a live Hex Safe sandbox integration and a production-guarded deployment pipeline. What remains is (a) a defined set of functional gaps (13 cases with no current support, plus partial items), (b) vendor work-products the plan explicitly requires (test plan, traceability matrix, defect process), (c) quotation Item-11 commitments not yet delivered (automated E2E suite, performance testing, API docs), and (d) production hardening from our security model. Full-cycle development time from contract signing to being able to support the plan's L1–L9 execution is estimated at **~12–16 weeks**, dominated by a small number of client/third-party dependencies.

---

## 2. What is complete — platform capabilities

Direct support for the 68-case plan (24 cases fully supported today):

| Capability | Plan cases | Evidence |
| --- | --- | --- |
| Four-gate sequencing; no address issuance without clearance (KYC + wallet KYT + Travel Rule gates enforced server-side) | TC-WS-04, TC-WI-02 | Backend `canIssueAddress`; E2E tests |
| One-USDT verification transfer and verified-wallet whitelist | TC-WI-03, TC-AD-06 | `deposit_confirm_test` writes `verified_wallets` |
| Persistent deposit address bound to the patron (per vault×chain; no per-transaction addresses) | TC-WI-01, TC-WI-04 | Hex Safe address model |
| Blockchain confirmation counts (EVM 5 / Tron 4, per chain, not operator-configurable) | TC-TM-07 | `lib/compliance.ts`; Hex Trust clarification |
| Travel Rule threshold HKD 8,000 (≈ USD 1,000); per-transfer basic/enhanced pack | TC-TR-08 | `transaction_compliance_rules.py` |
| Two independent KYT layers (pre-deposit + post-arrival); dirty funds → hold + address void | TC-WD-05 | Screening adapters; state machine |
| Refunds only to previously verified original wallets; new/undeclared destination rejected | TC-WD-03 | Backend 400 on non-whitelisted wallet |
| Server-side RBAC + audit trail | TC-GV-04 | `require_role`, `audit_trail` |
| Data minimisation — proxy ID to third parties; no gaming/marker/marketing data transmitted | TC-DP-01/02/03 | `externalUserId` mapping; admission claims |
| Invitation-only onboarding, Email OTP, TOTP 2FA, recovery codes, account lockout | TC-AD-02/03 | Auth backend (tested) |
| Self-service and host-mediated patron journeys | TC-E2E-01/02 | Both flows implemented + tested |
| Protected routes; unauthenticated redirect | TC-AD-04 | Client routing guard |

## 3. What is complete — engineering and testing assets

| Asset | Detail |
| --- | --- |
| Backend automated tests | **175 test methods across 15 suites** — admission, KYC case gates, leader approval, Travel Rule rules/API, refund, payment operations, staff onboarding, visibility, E2E matrix, Notabene adapter |
| Frontend tests | Vitest suites in `apps/web` (7 test files; 39+ passing per latest run) |
| Hex Safe sandbox integration | **Live** — ES256 JWT signing, deposit-address creation, deposit lookup, withdrawal, `x-request-id` idempotency. Note: sandbox offers polling only (no webhook-registration API) |
| KYC adapter | Sumsub (API-only; `externalUserId` mapping; non-production demo-approve bypass, fail-closed in production) |
| Travel Rule adapter | Notabene adapter with dedicated test suite |
| CI/CD | Typecheck + production-build gates on PR/main; HK deployment workflow with production guards (rejects CORS `*` / QA SMS gateway) |
| Security | Threat model document incl. 15-item P0 go/no-go hardening checklist |
| Deployment | Docker Compose, nginx, DEPLOY.md runbook, HK auto-deploy |
| Live demo | h5.hypercypto.com (all 2xx entry points verified) |

---

## 4. What is not yet complete — functional gaps (13 cases unsupported, plus partial items)

| # | Gap | Plan cases | Notes |
| --- | --- | --- | --- |
| 1 | **24-hour wallet re-screen (Gate 2A)** — fresh look-back before each subsequent deposit | TC-WS-05 | Not implemented; only 6-month KYC validity exists |
| 2 | **Retention 5 → 7 years** | TC-GV-01, TC-TR-10 | Current build retains 5 years; plan requires 7 (matches the plan's "R1 retention shortfall") |
| 3 | Travel Rule 5-day / 10-day escalation timers | TC-TR-03 | Not implemented (client-side process support) |
| 4 | VASP register / new-counterparty due diligence | TC-TR-05 | Not implemented |
| 5 | Self-hosted wallet attestation + >USD 100k MLRO clearance rule | TC-TR-06/07 | Partially covered by wallet-control verification only |
| 6 | Transaction-monitoring typologies (structuring, velocity, chip-cycling) | TC-TM-01/02/03 | Hooks to Sumsub TM exist; local rules not implemented |
| 7 | STR workflow (MLRO routing, filing decision) | TC-GV-03 | Excluded from original v1 scope |
| 8 | Leaver de-provisioning (same-day, evidence retained) | TC-GV-06 | Not implemented (IAM lifecycle) |
| 9 | Macau device/network access block (production) | TC-GV-05 | Currently mock-level only |
| 10 | Audit hash-chain / WORM retention | TC-GV-02 | Audit trail exists; chain-of-hash is an open P0 item |
| 11 | Email-domain SPF/DKIM/DMARC + spoof rejection | TC-AD-09 | Not confirmed on the patron domain |
| 12 | Bank cut-off (2pm) / Taiwan & US holiday handling | TC-E2E-05 | Not implemented |
| 13 | Real off-ramp + fiat-confirmed marker discharge | TC-E2E-03 | Settlement/fiat currently demo-level; discharge rule requires confirmed fiat at the SPV/dedicated bank account |
| 14 | Three-way reconciliation feeds | TC-E2E-04 | Mock only; Hex Trust reconciliation API/SFTP schema is an open question |
| 15 | Address-change protocol & presumptive-fraud handling | TC-WI-04, TC-AD-08 | To be documented and productised |
| 16 | G1 Travel Rule data-return interface | TC-TR-10 | Blocked until the data-return contract (G1) exists — plan marks this case Blocked |

> Partial (⚠️) items not listed here — e.g. sanctions screening depth (provider data), PEP/EDD sign-off (procedural), liveness (provider-side), consent jurisdiction coverage (legal) — are covered in the Appendix A mapping.

## 5. What is not yet complete — vendor work-products required by the plan

The plan's exit criteria and M1/M2 milestones explicitly require vendor artefacts we have not yet produced:

| Work-product | Plan reference | Effort (person-days) |
| --- | --- | --- |
| Vendor test plan + coverage matrix + test summary | §5 L1/L2, §10 exit, M1/M2 | 4–6 |
| Requirements traceability matrix (68 cases ↔ our design/SRS) | §4 principle 5, §14 | (included above) |
| Shared defect-management process (S1–S4, daily triage) | §11 | 2–3 |
| Compliance test-data corpus (sanctions addresses, PEP, IVMS 101 packets, mixer wallets, holiday calendars) | §7 | 2–4 |
| Environment & frozen-build strategy (env matrix, build identification) | §7 | 1–2 |
| Evidence-pack template + operator guide / SOPs | §13 | 4–6 |

## 6. What is not yet complete — quotation Item 11 commitments

| Commitment | Status |
| --- | --- |
| Automated E2E suite (Playwright/Cypress) for deposit/KYC/referral flows | Not yet delivered (no Playwright suite in repo) |
| Performance & mobile testing (Lighthouse ≥90, load test, iOS/Android, 3G/4G) | Not started |
| OpenAPI/Swagger API reference, integration guides, operator guide | Partially (DEPLOY.md runbook exists; Swagger and operator guide missing) |
| 2 rounds of UAT support process | Process not documented (support itself in scope) |

## 7. External dependencies — not vendor development time

These gate plan levels and are outside our control; each needs written confirmation to protect the programme timeline:

| Dependency | Blocks | Owner |
| --- | --- | --- |
| G1 Travel Rule data-return contract (fields/format/channel/timing/retention) | TC-TR-10; L4 | Client legal/Treasury/Compliance |
| Hex Trust non-production facility — written confirmation (sandbox/UAT or capped production-pilot protocol) | L3–L7 | Client + Hex Trust |
| Sumsub screening contract, rules & list coverage | L4 entry | Client + Sumsub |
| D4 decision — authenticated address view vs documented fallback | TC-AD-01–05, TC-AD-10 | Client |
| Marker-discharge trigger — confirmed stablecoin receipt vs confirmed fiat at SPV/bank account | TC-E2E-03, Gate 4 | Client legal/Treasury/Compliance |
| Source files — 14-page test-plan PDF + 68-case workbook (for shared baseline mapping) | M1 | Client |
| Bank/FEIB credit advice and off-ramp rails for live pilot | L9 | Client Treasury |
| Scope alignment — plan Phase 1 is ERC-20 only; our build also exposes TRC-20 | Tested-build definition | Client |

## 8. Development time estimate — full cycle (signing → able to support the QA/UAT plan)

### 8.1 Incremental effort by workstream (person-days)

| Workstream | Items | Effort (pd) |
| --- | --- | --- |
| A. Functional gaps (16 items, §4) | A1–A16 | 64–112 |
| B. Vendor work-products (§5) | B1–B5 | 13–21 |
| C. Quotation Item-11 commitments (§6) | C1–C3 | 14–22 |
| D. Production hardening (threat-model P0, prerequisites for L5 security testing & go-live) | demo-bypass zeroing, session cookies, secrets vaulting, sensitive-data encryption, SoD to natural person, audit hash chain | 11–19 |
| **Total internal** | | **~102–174** (midpoint ≈ 135) |
| External penetration test | P0 checklist item 15 | outsourced (excluded) |

Largest conditional items: real off-ramp/fiat settlement (10–20 pd, depends on bank rails + Hex Trust), reconciliation feeds (5–10 pd, depends on Hex Trust API/SFTP docs), STR workflow (8–12 pd, depends on client legal), VASP register (5–8 pd, depends on TR provider contract).

### 8.2 Full-cycle timeline

| Phase | Content | Duration | Dependency |
| --- | --- | --- | --- |
| P0 | Contract; client inputs (Hex Safe credentials + EC key, provider contracts, sandbox confirmation, G1, source files) | 1–3 weeks (parallel) | Client/third parties |
| P1 | Gap closure + production hardening (A+B+C+D, 4 devs + 1 PM) | **7–9 weeks** | P0 items land in window |
| P2 | Vendor QA readiness (test plan, coverage matrix, corpus, frozen build) | overlaps P1 tail (~1 week) | — |
| P3 | QA/UAT support per plan M1–M7: L1 execution → L2 witness → L3–L7 (parallel) → L8 UAT ×2 → L9 dress rehearsal | **4–6 weeks** | L4 needs Sumsub + G1; L9 needs live-value protocol |
| **Total critical path** | Signing → go/no-go support ready | **~12–16 weeks** | see P0/P3 |

Planning notes:
- Estimates assume the quotation team (4 devs + 1 PM) and the quoted USD 450/person-day basis; person-day ranges reflect dependency uncertainty.
- The original 13-week quotation covers core development incl. 2 UAT rounds; the plan's L3–L9 rigour (68 cases, three-way reconciliation, live pilot) extends the support tail to the 12–16-week envelope.
- Several A-items may be re-scoped as client-side procedure/policy (e.g. STR filing, escalation timers); we provide the hooks and evidence.

## 9. Risks and recommendations

| Risk / dependency | Recommended action |
| --- | --- |
| Client-side dependencies are the critical-path driver (G1, Hex Trust facility, Sumsub, D4, bank rails) | Lock written confirmation windows for each at this meeting; they do not consume vendor development time but gate L4/L9 |
| Tested-build scope: plan = ERC-20 only; build also has TRC-20 | Confirm: disable in tested build or mark out-of-scope |
| Retention 5 vs 7 years | Low-cost change (0.5–1 pd) — recommend folding into existing scope |
| No vendor test plan / traceability matrix yet (plan exit criteria) | We can deliver the vendor test plan + 68-case mapping within ~1 week of the source workbook being provided |
| Demo bypass paths must be production-zeroed before L5/security testing | Already tracked in our P0 go/no-go checklist (CI grep + fail-fast) |
| Quotation Item-11 E2E/performance commitments outstanding | Include in P1 schedule; confirm priority |

**Recommendations:**
1. Adopt the consultant's 68-case register as the shared baseline (plan M1) — our case mapping (Appendix A) is ready to share.
2. Use this report as the technical annex to the confirmation discussion; separate "vendor development time" from "client/third-party dependency time" as presented in §7/§8.
3. Lock the four pre-execution decisions (G1, D4, marker-discharge trigger, TRC-20 scope) so the plan's blocked/conditional cases can be unblocked on schedule.

---

## Appendix A — 68-case mapping summary (by stage)

| Stage | ✅ Supported | ⚠️ Partial | ❌ Missing | ⛔ Blocked (external) |
| --- | --- | --- | --- | --- |
| 1 KYC (9) | 2 | 6 | 1 | 0 |
| 2 Wallet screening (7) | 2 | 4 | 1 | 0 |
| 3 Travel Rule (10) | 2 | 4 | 3 | 1 |
| 4 Wallet issuance (5) | 4 | 1 | 0 | 0 |
| 5 Transaction monitoring (7) | 1 | 4 | 2 | 0 |
| 6 Withdrawal/return (5) | 3 | 2 | 0 | 0 |
| 7 Data privacy (4) | 3 | 1 | 0 | 0 |
| 8 Governance/audit/access (6) | 1 | 2 | 3 | 0 |
| 9 E2E/reconciliation/pilot (5) | 2 | 1 | 2 | 0 |
| 10 Address-delivery security (10) | 4 | 4 | 1 | 1 |
| **Total (68)** | **24** | **29** | **13** | **2** |

## Appendix B — Sources

- Consultant QA/UAT test plan (draft rev 0.1; 68 cases, 10 stages, L1–L9 levels, four control gates) — provided by client; the two referenced source files (14-page PDF, 68-case workbook) are pending from the client
- Hex Trust 36-question clarification (04 June)
- Project design, process v1, security threat model + P0 checklist
- Repo test assets: backend 175 tests / 15 suites; frontend vitest suites; CI/CD; Hex Safe sandbox client
