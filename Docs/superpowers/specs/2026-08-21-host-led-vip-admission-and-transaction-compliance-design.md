# Host-led VIP Admission and Transaction Compliance Design

## Status and scope

This is the proposed successor to the admission portions of the 2026-08-20 Resort Balance Payment Application design.  It separates a VIP's one-time service admission from the compliant preparation required for every virtual-asset transfer.  It does not change the custody, casino-cage, or finance reconciliation scope.

The design is based on the current product decisions:

- Hosts and the single business approver use enterprise Okta identities.
- A VIP is invite-only.  Email is the primary invitation channel; a Host can also present a case-specific dynamic QR code in person.
- KYC is performed before Travel Rule data is assembled.  A failed KYC never reaches payment preparation, Travel Rule, custody-address issuance, or the leader's approval queue.
- KYC normally remains valid for six calendar months, but expires on the earlier of that date and the expiry date of any identity document relied on for the KYC decision.
- Every VA transfer has its own Travel Rule record and KYT decision.  HKD 8,000 determines basic versus enhanced Travel Rule fields; it is not an exemption from Travel Rule.
- Notabene is the Travel Rule provider.  Hex Trust / Hex Safe remains the custody and receiving-address provider.
- The first verification transfer remains 1 USDT or 1 USDC, and is itself a transaction with a basic Travel Rule and KYT record.

This is a product design, not a legal opinion.  The final field mapping, counterparty rules, and message-delivery evidence must be validated by the relevant Hong Kong licensed entity, Notabene, and Hex Trust before production.

## Users and authorization

| Role | Responsibility | Data visibility |
|---|---|---|
| Host / relationship manager | Owns the business relationship, creates and tracks a VIP admission case, presents the QR, and receives progress notifications. | Own internal case data, high-level KYC status and action-safe reason categories. Never raw KYC evidence or provider reports. |
| VIP | Claims an invitation, establishes account/MFA, provides identity information, completes KYC and confirms each proposed transfer. | Own personal data, payment instructions and case status. Never Host notes or internal risk assessment. |
| Compliance | Owns KYC exceptions, source-wallet/VASP risk decisions, Travel Rule exceptions and suspicious-activity handling. | Complete compliant record under role control. |
| Single leader | Makes the business decision to enable the VIP service. Does not replace compliance approval. | Business summary, KYC pass/valid-until, intended activity and pre-check outcomes. No raw KYC documents or restricted-risk rationale. |
| HK Operations | Reconciles completed deposits and records the manual Cage confirmation ID. | Deposit, transaction, reconciliation and Cage information. |

## Host enterprise onboarding

Hosts do not create a public password account.  An Okta administrator or approved business administrator assigns the Host role before first use.

1. The employee signs in with Okta.
2. HyperTransfer creates or refreshes the Host profile from the enterprise identity: employee identifier, name, department and role.
3. The Host completes only operational profile fields needed by the business, such as operating team, location and phone number, and acknowledges the customer-data handling policy.
4. Only an `active` Host may create or revoke a VIP admission case.  A role removal immediately prevents new cases and leaves previous audit records intact.

## Admission invitation and account binding

The Host creates one VIP admission case.  Before sending it, the Host records the minimum necessary internal data: the VIP's invitation email, member/WML reference when available, intended service, relationship notes, preferred language and any approved business classification.  The invitation email is required for the normal path.

The system creates two presentations of the same case:

- **Email invitation (primary):** a one-time enrollment link sent to the invitation email.  It remains claimable for the configured remote-invitation period (the current product baseline retains six hours unless the customer approves a change).
- **Dynamic QR (in-person fallback):** a short-lived, rotating enrollment-session code displayed in the Host portal.  Its contents change every 10–15 minutes, but it always refers to the same still-open admission case.  The Host can refresh, resend or revoke the invitation.

Both routes end on the same email claim screen.  The VIP enters or confirms the invitation email, receives an Email OTP only at that address, and only then may create credentials and configure MFA.  A QR scan alone does not claim a case.  When a successful OTP binds the VIP account to the case, all unused invitation presentations become invalid.

If the submitted email does not match the invitation email, the system does not disclose whether another email exists.  It shows a neutral failure and records the event for the Host and Compliance.

## Recommended admission route

The recommended default is **complete dossier before leader approval**.  It is appropriate because most expected payments are at or above HKD 8,000 and lets the leader decide on a complete business and compliance summary.

```text
Host active in Okta
  -> create VIP admission case
  -> send email invitation and/or show dynamic QR
VIP email OTP + account + MFA
  -> basic self-declared profile
  -> KYC and sanctions/PEP screening
  -> KYC passed
  -> source classification and counterparty checks
  -> intended first-payment pre-check and Travel Rule profile
  -> single leader business approval
  -> service enabled
  -> each actual payment obtains its own Transaction Travel Rule Pack
```

Source classification can begin when the VIP supplies the intended first source, but it cannot make a payment ready until KYC has passed:

- **VASP/financial-institution source:** identify the counterparty, assess eligibility and its ability to exchange Travel Rule data, and apply ongoing counterparty monitoring.
- **Self-hosted source wallet:** apply the configured ownership/control-proof procedure and wallet KYT.

The leader's email and approval page show a concise, auditable dossier: Host rationale, KYC passed/valid-until, source classification outcome, intended asset/network/amount, and Travel Rule pre-check result.  The leader can approve or reject customer service admission; Compliance controls exceptions independently.

## Alternative route for customer discussion

Where a VIP's first funding source or payment intention is genuinely unknown, use **KYC-first service approval**:

```text
VIP KYC passed -> single leader service approval -> service enabled
  -> source classification, KYT and Transaction Travel Rule Pack only when the VIP starts a payment
```

This shortens admission but moves the first payment's compliance wait after approval.  It is an approved product alternative, not a bypass.  The Host onboarding, invitation, Email OTP, MFA, KYC-first gate, QR security, and per-transaction controls are identical in both routes.

## KYC policy and failure handling

The authoritative KYC expiry is:

```text
valid_until = min(kyc_approved_at + six calendar months,
                  earliest expiry date of any relied-on identity document)
```

An unexpired KYC record is necessary but not sufficient for payment; ongoing monitoring, counterparty status, KYT and the transaction Travel Rule pack still apply.  On `kyc_failed`, the admission case moves to `kyc_failed` or `compliance_review`; it cannot advance to source classification, Travel Rule preparation, leader approval, or payment.

Hosts receive a controlled, actionable reason category only:

- document expired;
- document/image quality insufficient;
- identity-data mismatch;
- VIP must resubmit; or
- compliance review required — do not contact the customer for further explanation.

Hosts never receive document copies, document numbers, home address, biometric output, raw provider decision detail, sanctions/PEP match detail, suspicious-activity information, STR information, or an investigation rationale.  Restricted outcomes use a neutral status to avoid tipping-off.

## Per-transaction payment control

Each transfer, including the 1-unit verification transfer, has a new immutable **Transaction Travel Rule Pack**.  It references the still-valid KYC record and captures the actual, not merely intended:

- asset, network, actual amount and HKD-equivalent calculation;
- source wallet or exchange/platform and account/user identifier;
- originator and beneficiary information required for the applicable threshold;
- Notabene request, validation/message identifiers, outcome and delivery evidence;
- source-wallet or counterparty KYT outcome; and
- transaction-specific audit timestamps and actors.

At the payment confirmation page, actual amount determines the field set:

- below HKD 8,000: basic Travel Rule data; or
- HKD 8,000 and above: enhanced originator fields in addition to the basic data.

If the amount crosses the threshold, or the asset, network, source wallet, exchange account, or counterparty differs from the earlier pre-check, the prior pre-check cannot be reused.  The system returns to the necessary data/validation step.  It must not issue or use a custody address for the altered payment until the new Transaction Travel Rule Pack and KYT decision pass.

Travel Rule and KYT may run in parallel once the actual transaction data is available, but both must pass before custody-address issuance or the 1 USDT/USDC test.  The test produces its own record.  The subsequent main payment obtains a separate pack based on its actual amount, even when it uses the same source and receiving address.

## Ongoing monitoring, retention and reconciliation

The platform retains a reconstructable record for every transfer: case and account linkage, KYC version, Travel Rule/IVMS-101 message evidence, Notabene status, counterparty classification, KYT results, approval events, receiving address, chain transaction ID, operations evidence, Cage confirmation ID and finance reconciliation reference.  Transaction records are retained for at least five years after completion, subject to a longer legal hold.

Address reuse does not bypass controls.  The platform runs transaction-level KYT for every use and correlates linked transfers by customer, source account/address, beneficiary, timing, asset and amount.  Suspicious or potentially structured patterns route to Compliance; they never become a customer-visible method to avoid enhanced fields.

## State model

### Admission case

```text
host_pending -> host_active
host_active -> case_draft -> invitation_open -> vip_claimed
vip_claimed -> kyc_in_progress -> kyc_passed
kyc_in_progress -> kyc_failed | compliance_review
kyc_passed -> payment_precheck -> leader_pending -> service_enabled
kyc_passed -> leader_pending -> service_enabled              (alternative route)
leader_pending -> rejected
invitation_open -> expired | revoked
```

`kyc_failed`, `compliance_review`, `rejected`, `expired` and `revoked` are terminal for the active invitation.  A controlled resubmission starts a new KYC attempt or a replacement invitation, preserving the audit relationship.

### Payment transaction

```text
payment_intent -> actual_confirmation -> compliance_gates_in_progress
compliance_gates_in_progress -> payment_authorized -> custody_address_issued
custody_address_issued -> verification_transfer_pending -> verification_confirmed
verification_confirmed -> main_transfer_pending -> custody_confirmed
custody_confirmed -> cage_confirmation_recorded -> finance_reconciled -> settled
```

Any failed, changed, suspicious or incomplete control routes to `compliance_review`, `needs_information`, `rejected` or `cancelled`; it cannot advance to address issuance or funds acceptance.

## Acceptance criteria

1. A Host cannot create or operate a case until provisioned through Okta and marked active.
2. Each case can be claimed through its email link or its short-lived QR session, but only by Email OTP at the case invitation email.
3. KYC failure blocks all later payment and approval activities; the Host receives only permitted reason categories.
4. KYC expiry is automatically the earlier of six months after approval and the relied-on document expiry date.
5. The single leader's approval is a customer-service decision and never replaces KYC, KYT, counterparty due diligence or Travel Rule validation.
6. Every test and main payment produces a distinct Travel Rule/KYT record; HKD 8,000 switches field depth, not whether a record exists.
7. A changed final amount or payment source invalidates the matching pre-check and forces the correct re-validation before address issuance.
8. The system supports five-year minimum transaction record retention, operational reconciliation, manual Cage confirmation capture, and continuous monitoring of reused sources.
