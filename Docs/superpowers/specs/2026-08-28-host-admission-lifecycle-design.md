# Host admission lifecycle and attention model

## Goal

Make every Host-facing demo case, timeline, row label, summary count, and archived outcome use one clear admission model. The lifecycle communicates customer progress; action signals communicate the exception or decision currently requiring attention. They must not be conflated.

## Canonical lifecycle

Every active admission case presents these five ordered milestones:

1. **Invited** — a valid invitation has been issued to the VIP.
2. **Account Created** — the VIP has verified the invitation email OTP and set an account password. This replaces the ambiguous label **Clicked**.
3. **KYC Submitted** — the VIP has submitted the mandatory KYC information and documents.
4. **KYC Approved** — KYC is approved and remains valid under the six-month-or-document-expiry rule.
5. **Service Enabled** — final approval is granted and the VIP may begin deposits.

## Action signals and outcomes

Action signals are badges or inline notices. They do not create additional lifecycle milestones.

| Situation | Lifecycle position | Host-facing signal | Expected Host action |
| --- | --- | --- | --- |
| Invitation is unclaimed or expired | Invited | Invitation Pending / Invitation Expired | Resend invitation when appropriate |
| Account exists but KYC is incomplete | Account Created | KYC Action Required | Remind VIP to submit KYC |
| KYC requires resubmission or has expired | Latest completed milestone remains visible | KYC Action Required | Send KYC reminder; explain that valid documents are required |
| KYC is approved; final approval is pending | KYC Approved | Pending Approval | Wait for final approver decision |
| Final decision completed | Service Enabled | No attention signal | None |
| Invitation or application revoked | Archived | Revoked | Re-enable from Archived if revoked in error |

`Pending Approval` is therefore retained as an action signal after **KYC Approved**, rather than being a sixth lifecycle step.

## UI rules

- The case row shows its lifecycle stage as the primary label. When attention is needed, it also shows an action-signal badge with an explicit next action.
- The five-step timeline uses the canonical labels above for every active demo case.
- **Summary** groups by active action signal and counts exactly the same cases shown in the attention list. The count never includes a case whose row does not use that signal.
- `KYC Action Required` is destructive/red across Summary, row badge, expanded detail, and reminder action.
- `Pending Approval` and invitation follow-up are warning/yellow.
- An absence of a future event means that event is omitted from History; audit history never contains placeholder rows.
- `Revoked`, final service rejection, and expired/revoked invitations appear only in Archived, preserving the prior ability to re-enable a mistaken revocation. KYC failure and KYC expiry remain active remediation cases, not archived outcomes.

## Demo coverage

The seeded attention cases must include examples for:

- invitation pending or expired;
- account created awaiting KYC;
- KYC submitted awaiting review;
- KYC approved pending final approval;
- KYC document expired after prior approval;
- service enabled in Approved;
- revoked in Archived with re-enable capability.

## Verification

- Unit tests cover lifecycle label mapping, action-signal grouping, Summary counts, timeline state, and chronological history.
- Browser verification confirms the five labels, badge colors, Summary/list count parity, and the Archived re-enable path.
- Existing compliance protections remain intact: KYC expiry is the earlier of document expiry or six months, and Host views expose only safe KYC category messages.
