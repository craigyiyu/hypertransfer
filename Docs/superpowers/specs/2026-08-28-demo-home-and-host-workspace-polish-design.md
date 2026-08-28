# Demo Home and Host Workspace Polish Design

## Goal

Make the local demo home focused on role-based entry, clarify Host workspace navigation, and preserve clear USD amount entry without changing any approval, reconciliation, or treasury-control behavior.

## Scope

### Demo home

- Keep only the four one-click role cards.
- Remove the three secondary Customer, Operator, and VIP invite cards and the explanatory footer sentence.
- Update the English demo-home copy: `HK Operations` becomes `Admin`; `Client dashboard` becomes `Client Portal`; and `orchestration` becomes `process`.
- Update the web package version to `0.4.1`. The existing build-label helper continues to show `v0.4.1+local` locally and `v0.4.1+<commit>` in a release build.

### Host workspace

- Replace the `Need Your Attention` mail-check icon with `TriangleAlert`, conveying action required while retaining the same Host/RM-only section key and panel.
- Rename the desktop and mobile Host navigation labels to `Approved` and `Archived`, and render them as compact single-line items without widening the navigation or changing which roles can access them.
- Verify that the intended-deposit USD field continues to show thousands separators while typing and continues to submit an unformatted numeric string to the existing API contract.

### Admission-stage consistency

- Rename the `leader_pending` display label everywhere to `Pending Approval`.
- For a case in `leader_pending`, render steps 1–4 through `KYC approved` as completed and render step 5 `Service enabled` as pending white. Only `service_enabled` may render the fifth step as completed.
- Seed the pending-approval demonstration case with its Request USD amount and its claimed, KYC-submitted, and KYC-approved timestamps, so its summary and history match its `leader_pending` status.
- Read the intended-deposit card from `intendedDepositUsd` and render it as a comma-separated USD amount. Keep the existing legacy fallback only for old cases that have no Request amount.
- Do not render a Deposits section for any case that has not reached `service_enabled`.

### Exception states and expiry

- The domain lifecycle keeps explicit audit states such as `kyc_expired`, `rejected`, `expired`, and `revoked`; the Host interface projects them into five concise, user-facing primary states: `Invitation Pending`, `KYC Action Required`, `KYC Review`, `Pending Approval`, and `Service Enabled`.
- `KYC Expired` is a `KYC Action Required` reason, not an additional Host-facing primary state. It represents a previously approved KYC record whose document has subsequently expired and requires resubmission. Preserve the historic KYC-approved event and add a timestamped `KYC expired` history event.
- KYC validity is exactly `min(kyc approved at + 6 calendar months, earliest document expiry)`. When a case with a valid post-KYC admission state reaches that timestamp, it must transition to the audit state `kyc_expired`, write `kyc_expired_at`, and require a new KYC submission. It must never remain eligible solely because the interface has not been refreshed.
- Invitations retain the current 6-hour validity policy. Drive the Host reason label from the actual invitation-expiry timestamp: an unclaimed invitation past that time shows `Invitation Expired`. An expired invitation keeps `Resend invitation` as its recovery action and `Revoke` as the closure action; reminders and QR for the invalid token are hidden. A successful resend invalidates the old email link and creates a fresh 6-hour link. Editing a recipient email is deliberately not added in this batch, because it changes a customer-data record and needs a separate audited amendment flow.
- `compliance_review` projects as `KYC Review` with a safe `Under compliance review` reason; it must never be labelled `KYC rejected`.

### Revocation and recovery

- A Host may revoke an invitation/application at any admission stage. Revocation moves the case out of the active and attention lists into `Archived` immediately.
- Preserve the case's pre-revocation lifecycle status, approval/KYC records, and a revocation audit timestamp (and actor/reason when the data model supports them). Revocation must not delete or rewrite those records.
- In `Archived`, provide a `Re-enable application` action for an accidentally revoked case. It restores the preserved pre-revocation status and returns the case to the appropriate active, attention, or approved list; it does not grant service or bypass any pending KYC/approval control.
- `Archived` is a view rather than a collapsed lifecycle state. It contains `Revoked`, `Service Rejected`, and naturally expired records with their distinct audit reasons. Only `Revoked` can be re-enabled; a rejection may not be represented as revocation.

## Architecture and data flow

`DemoHome.tsx` remains the root role-entry screen, `translations.ts` remains the source of localized UI copy, and `app-version.ts` continues to derive the visible build label from build metadata. `CasinoOpsPortal.tsx` retains its existing section keys and RBAC roles. `AdmissionCasePanel.tsx` keeps the existing `formatThousandSeparators` input formatter and its comma-stripping submission boundary, and projects each status only through the lifecycle stages it has actually reached. The admission-case contract gains explicit expiry states, timestamps, and reversible revocation data where needed, rather than conflating document expiry with a failed KYC decision or treating revocation as deletion. `seed_demo.py` supplies internally consistent mock timestamps, invitation expiry, and Request amount data.

## Non-goals

- No changes to role authentication, approval decisions, reconciliation, or treasury workflows.
- No redesign of the mobile navigation.
- No amount-format changes outside the selected intended-deposit USD field.

## Acceptance criteria

1. The demo home has exactly four role-entry buttons and no secondary entry-card grid or explanatory footer.
2. Its labels read `Admin`, `Client Portal`, and `Compliant virtual-asset deposit process.` in English.
3. The visible version follows `v0.4.1+<build identifier>`.
4. `Need Your Attention` uses an attention-required icon.
5. The navigation labels read `Approved` and `Archived`, each on a single line at desktop width.
6. Entering `12345.67` in the USD field renders `12,345.67`, while the API payload receives `12345.67`.
7. All `leader_pending` labels read `Pending Approval`; its fifth timeline step is white and no Deposits section is present.
8. The pending-approval demo case shows its Request amount as a comma-separated USD value and shows timestamps through KYC approved.
9. The Host queue displays only `Invitation Pending`, `KYC Action Required`, `KYC Review`, `Pending Approval`, and `Service Enabled`; fine-grained backend states remain preserved for audit and history.
10. A KYC validity timestamp is always the earlier of approval + 6 calendar months and the earliest document expiry. Expiry transitions the case to `kyc_expired`, retains the original approved time, and shows a separate expiry time in history; it is not labelled or counted as KYC rejected.
11. An unclaimed invitation past its 6-hour expiry is shown as `Invitation Pending` with the reason `Invitation Expired`; resend and revoke remain available, while reminder and QR remain hidden until a fresh link is issued.
12. Revoking a case at any stage immediately moves it to `Archived` without deleting approval or KYC history; rejected and naturally expired cases retain separate archive reasons.
13. Re-enabling an archived, revoked case restores its prior lifecycle status and routes it to the matching list without enabling service prematurely.
