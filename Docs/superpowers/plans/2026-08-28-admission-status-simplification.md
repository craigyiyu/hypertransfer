# Admission Status Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project the audited admission lifecycle into five clear Host-facing states, automatically enforce the six-calendar-month/document-expiry KYC validity rule, and keep expired or revoked applications operationally safe.

**Architecture:** The FastAPI lifecycle remains the authoritative source of record; no audit state is deleted or merged. A backend expiry synchronizer moves eligible post-KYC cases to `kyc_expired` at `kyc_valid_until`. The web app adds a pure presentation mapper so cards, action buttons, and the five-stage bar use a stable primary status plus a safe reason.

**Tech Stack:** FastAPI, SQLite, Python unittest, Next.js, TypeScript, Vitest.

## Global Constraints

- KYC validity is `min(approved_at + 6 calendar months, earliest document expiry)`.
- KYC expiry must retain approval evidence and require resubmission; it is never displayed as KYC rejection.
- The UI may group statuses, but backend audit values (`kyc_expired`, `rejected`, `revoked`, and `expired`) must remain distinct.
- Only revoked applications can be re-enabled.
- Expired invitation links cannot be reminded or displayed as QR until a new link is issued; recipient-email amendments are outside this batch.
- Do not commit or push unless explicitly requested.

---

### Task 1: Test and enforce KYC expiry at the admission boundary

**Files:**
- Modify: `hypertransfer-main/backend/server.py`
- Modify: `hypertransfer-main/backend/test_admission_api.py`

**Interfaces:**
- Produce `sync_admission_case_kyc_expiry(case_id: str, *, now: int | None = None) -> sqlite3.Row`.
- Call it before returning Host and Patron case projections and before `admission_case_kyc_ok` authorizes a downstream action.

- [ ] **Step 1: Write the failing tests**

```python
def test_expired_kyc_is_projected_as_resubmission_required(self):
    case = self._set_case(status="leader_pending", kyc_valid_until=self.now - 1,
                          kyc_approved_at=self.now - 100)
    got = self._host_case(case["id"])
    assert got["status"] == "kyc_expired"
    assert got["kycExpiredAt"] is not None
    assert got["kycApprovedAt"] == self.now - 100

def test_not_yet_expired_kyc_remains_in_its_admission_state(self):
    case = self._set_case(status="leader_pending", kyc_valid_until=self.now + 1)
    assert self._host_case(case["id"])["status"] == "leader_pending"
```

- [ ] **Step 2: Run RED**

Run: `/tmp/hypertransfer-20260827-py311/bin/python -m unittest hypertransfer-main/backend/test_admission_api.py -v`

Expected: the past-validity test fails because reading a case does not yet persist the `kyc_expired` audit state.

- [ ] **Step 3: Implement the synchronizer**

```python
POST_KYC_ACTIVE_STATUSES = frozenset({"kyc_passed", "payment_precheck", "leader_pending", "service_enabled"})

def sync_admission_case_kyc_expiry(case_id: str, *, now: int | None = None):
    # Atomically move only a post-KYC active case whose kyc_valid_until <= now.
    # Persist kyc_expired_at once, preserve kyc_approved_at, and audit the transition.
```

Do not expire a revoked or rejected record; do not automatically revoke service. The controlled state transition makes KYC no longer valid for every protected action.

- [ ] **Step 4: Run GREEN**

Run: `/tmp/hypertransfer-20260827-py311/bin/python -m unittest hypertransfer-main/backend/test_admission_api.py -v`

Expected: all admission API tests pass.

### Task 2: Test the pure Host presentation and five-stage bar

**Files:**
- Modify: `apps/web/src/lib/admission-case.ts`
- Modify: `apps/web/src/lib/admission-case.test.ts`
- Modify: `apps/web/src/components/AdmissionCasePanel.tsx`

**Interfaces:**
- Produce `hostAdmissionPresentation(case, now?)` returning `{ primaryStatus, reason, actor, action, isArchived }`.
- Update `admissionTimeline(status)` to represent completed milestones, not merely the previous lifecycle value.

- [ ] **Step 1: Write failing tests**

```ts
expect(hostAdmissionPresentation({ status: "kyc_expired", kycHostMessage: "Document expired" }))
  .toMatchObject({ primaryStatus: "KYC Action Required", reason: "Document expired", actor: "VIP" });
expect(hostAdmissionPresentation({ status: "compliance_review" }))
  .toMatchObject({ primaryStatus: "KYC Review", reason: "Under compliance review" });
expect(admissionTimeline("vip_claimed")).toEqual([
  { completed: true, current: false }, { completed: true, current: false },
  { completed: false, current: true }, { completed: false, current: false },
  { completed: false, current: false },
]);
```

- [ ] **Step 2: Run RED**

Run: `npm test --workspace=web -- admission-case.test.ts`

Expected: test fails because the presentation mapper and corrected completion mapping do not exist.

- [ ] **Step 3: Implement the mapper and render it**

Map `invitation_open` to `Invitation Pending`; `vip_claimed`, `kyc_in_progress`, `kyc_failed`, and `kyc_expired` to `KYC Action Required`; `kyc_passed`, `payment_precheck`, and `compliance_review` to `KYC Review`; `leader_pending` to `Pending Approval`; and `service_enabled` to `Service Enabled`. Render `revoked`, `rejected`, and `expired` only under Archived with their distinct archive reason.

Render bar completion as: invitation sent = step 1 done; VIP claimed = steps 1–2 done; KYC submitted/failed = steps 1–3 done; KYC approved and all post-KYC states = steps 1–4 done; only service enabled completes all five. A revoked case displays its stored prior status as inactive progress when available.

- [ ] **Step 4: Run GREEN**

Run: `npm test --workspace=web -- admission-case.test.ts && npm run typecheck --workspace=web`

Expected: selected tests and TypeScript typecheck pass.

### Task 3: Make expired-invitation actions safe and concise

**Files:**
- Modify: `apps/web/src/components/AdmissionCasePanel.tsx`
- Modify: `apps/web/src/lib/admission-case.test.ts`
- Modify: `hypertransfer-main/backend/test_admission_api.py`

- [ ] **Step 1: Write failing tests**

```ts
expect(invitationActionPolicy(expiredInvitation)).toEqual({
  canResend: true, canRemind: false, canQr: false, canRevoke: true,
});
```

Assert in Python that a resend invalidates prior unclaimed email sessions and creates a new one expiring in six hours.

- [ ] **Step 2: Run RED**

Run: `npm test --workspace=web -- admission-case.test.ts && /tmp/hypertransfer-20260827-py311/bin/python -m unittest hypertransfer-main/backend/test_admission_api.py -v`

Expected: the action policy test fails before the new helper exists.

- [ ] **Step 3: Implement the policy and existing resend semantics**

Use a presentation helper to hide `Send reminder` and `Invitation QR` after email-link expiry; retain resend and revoke. Ensure the existing resend endpoint marks the old email token unavailable before storing a new six-hour token. Do not disclose an expired token. Do not add recipient-email editing without a separately approved audited amendment flow.

- [ ] **Step 4: Run GREEN**

Run: `npm test --workspace=web -- admission-case.test.ts && /tmp/hypertransfer-20260827-py311/bin/python -m unittest hypertransfer-main/backend/test_admission_api.py -v`

Expected: all selected tests pass.

### Task 4: Synchronize product documentation and verify locally

**Files:**
- Modify: `ProjectInfo/design.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `Docs/superpowers/specs/2026-08-28-demo-home-and-host-workspace-polish-design.md`

- [ ] **Step 1: Record the five primary statuses and KYC validity policy**

Document the primary-status projection, the archive reason distinction, and the exact KYC validity calculation. Keep backend lifecycle values in the audit model.

- [ ] **Step 2: Run verification**

Run: `npm run typecheck --workspace=web && npm test --workspace=web && /tmp/hypertransfer-20260827-py311/bin/python -m unittest discover -s hypertransfer-main/backend -p 'test_*.py' -v && npm run build --workspace=web`

Expected: all commands return exit code 0.

- [ ] **Step 3: Restart and inspect the local demo**

Recreate only the dedicated `/tmp/hypertransfer-20260827.db` through a recoverable rename, restart FastAPI at `127.0.0.1:8000` and the web workspace at `localhost:3000`, then inspect `/casino-ops`. Confirm the five labels, actor/action copy, correct bar milestones, expired-invitation controls, KYC expiry history, and Archived re-enable path.
