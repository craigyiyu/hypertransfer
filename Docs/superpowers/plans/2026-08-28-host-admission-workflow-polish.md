# Host Admission Workflow Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local demo home and Host admission workspace accurately reflect lifecycle, expiry, revocation, recovery, amount, and role-entry behavior without weakening KYC or approval controls.

**Architecture:** The FastAPI admission state model remains the source of truth. It gains explicit `kyc_expired` and reversible revocation metadata; the Next.js app only projects those fields into Host-safe labels, history, and timelines. Demo seeds model realistic timestamps and the frontend keeps amount formatting at the presentation boundary.

**Tech Stack:** Next.js 16, React 19, TypeScript/Vitest, FastAPI, SQLite, Python unittest, Tailwind 4.

## Global Constraints

- Keep the existing 6-hour email invitation validity policy; do not change it to 12 hours.
- A revoked application must preserve its prior status, KYC/approval evidence, and audit trail; restoring it must never enable service or bypass a gate.
- KYC document expiry is a separate actionable state, never a KYC rejection or provider-detail disclosure.
- Do not commit or push unless the user explicitly asks.
- Update `CLAUDE.md`, `AGENTS.md`, and `ProjectInfo/design.md` for new lifecycle statuses and data fields.

---

### Task 1: Define the lifecycle and reversible revocation contract

**Files:**
- Modify: `hypertransfer-main/backend/admission_rules.py`
- Modify: `hypertransfer-main/backend/server.py`
- Modify: `hypertransfer-main/backend/test_admission_rules.py`
- Modify: `hypertransfer-main/backend/test_admission_api.py`

**Interfaces:**
- Produces `can_transition_admission(current, target, route)` support for revocation from every nonterminal active state, while `kyc_expired` remains an explicit terminal attention state.
- Produces `POST /api/admission-cases/{case_id}/reenable`, restoring `prior_status_before_revocation` only after Host ownership and active-profile checks.
- Public case projection includes `kycExpiredAt`, `revokedAt`, and the status required by the UI.

- [ ] **Step 1: Write failing backend tests**

```python
def test_document_expiry_is_a_distinct_terminal_status(self):
    assert "kyc_expired" in ADMISSION_STATUSES
    assert not can_transition_admission("kyc_expired", "leader_pending", "complete_dossier")

def test_owner_can_revoke_and_reenable_leader_pending_case(self):
    # create case, set leader_pending, revoke, then reenable
    assert revoked["status"] == "revoked"
    assert restored["status"] == "leader_pending"
    assert restored["priorStatusBeforeRevocation"] is None
```

- [ ] **Step 2: Run the focused Python tests and verify RED**

Run: `python3 -m unittest test_admission_rules.AdmissionTransitionTests test_admission_api.AdmissionCaseRevokeTests -v`

Expected: failures because `kyc_expired`, its timestamp, and the re-enable API do not yet exist.

- [ ] **Step 3: Add minimal schema, migration, rules, and API implementation**

```python
# vip_admission_cases migration fields
("kyc_expired_at", "INTEGER"),
("prior_status_before_revocation", "TEXT"),
("revoked_at", "INTEGER"),

# revocation persists the active prior state before status="revoked".
# re-enable restores that state, clears only prior_status_before_revocation,
# and writes an admission.case.reenable audit event.
```

Only `revoked` cases with a stored prior active status can be re-enabled. The endpoint must reject any malformed/missing prior status, non-owner Host, and inactive Host.

- [ ] **Step 4: Run focused backend tests and verify GREEN**

Run: `python3 -m unittest test_admission_rules.AdmissionTransitionTests test_admission_api.AdmissionCaseRevokeTests -v`

Expected: all selected tests pass.

### Task 2: Make expiry, timeline, and Host-safe UI projection testable

**Files:**
- Create: `apps/web/src/lib/admission-timeline.ts`
- Create: `apps/web/src/lib/admission-timeline.test.ts`
- Modify: `apps/web/src/lib/admission-case.ts`
- Modify: `apps/web/src/lib/admission-case.test.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/AdmissionCasePanel.tsx`

**Interfaces:**
- Produces `admissionTimeline(status): AdmissionTimelineStepState[]`, where each state has `completed` and `current` booleans.
- Produces `invitationAttentionLabel(case, now)` returning `Invitation Expired` only when a still-unclaimed email expiry has passed.
- Extends `AdmissionCase` and API type with `kycExpiredAt`, `revokedAt`, and `priorStatusBeforeRevocation`.

- [ ] **Step 1: Write failing Vitest cases**

```ts
it("leaves service enabled pending for Pending Approval", () => {
  expect(admissionTimeline("leader_pending")).toEqual([
    { completed: true, current: false },
    { completed: true, current: false },
    { completed: true, current: false },
    { completed: true, current: false },
    { completed: false, current: false },
  ]);
});

it("labels a lapsed unclaimed email invitation as expired", () => {
  expect(invitationAttentionLabel({ status: "invitation_open", invitation: { emailExpiresAt: old, qrExpiresAt: old } }, now))
    .toBe("Invitation Expired");
});
```

- [ ] **Step 2: Run the new unit tests and verify RED**

Run: `npm test --workspace=web -- admission-timeline.test.ts`

Expected: failure because the module and public helper do not exist.

- [ ] **Step 3: Implement minimal frontend projection**

Use the helper in `CaseTimeline`. For `leader_pending`, render milestones 1–4 emerald/completed and milestone 5 as neutral white; only `service_enabled` completes all five. Replace the KYC-rejection alert for `kyc_expired` with `KYC Expired`, retain the historic approved time, and append a `KYC expired` row. Render Deposits only for `service_enabled`. Display `intendedDepositUsd` through the existing USD formatter and preserve the legacy fallback.

For an archived revoked row, hide resend/remind/revoke and show `Re-enable application`; call the new API and reload cases. Do not expose re-enable for naturally expired invitations.

- [ ] **Step 4: Run focused frontend tests and verify GREEN**

Run: `npm test --workspace=web -- admission-timeline.test.ts admission-case.test.ts`

Expected: selected tests pass.

### Task 3: Update demo data, navigation, homepage copy, and version label

**Files:**
- Modify: `hypertransfer-main/backend/seed_demo.py`
- Modify: `apps/web/src/views/CasinoOpsPortal.tsx`
- Modify: `apps/web/src/lib/translations.ts`
- Modify: `apps/web/src/views/DemoHome.tsx`
- Modify: `apps/web/src/lib/app-version.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Seeds expose a pending-approval case with Request USD `15000` and timestamps through KYC approved; a document-expired case with approval then expiry; and a lapsed, unclaimed invitation case.
- Home displays exactly four one-click roles, version `v0.4.1+<identifier>`, and the requested English role/subtitle copy.

- [ ] **Step 1: Add failing frontend assertions for version/status copy and formatting**

```ts
expect(ADMISSION_STATUS_LABELS.leader_pending).toBe("Pending Approval");
expect(ADMISSION_STATUS_LABELS.kyc_expired).toBe("KYC Expired");
expect(formatUsdInput("12345.67")).toBe("12,345.67");
```

- [ ] **Step 2: Run the selected Vitest tests and verify RED**

Run: `npm test --workspace=web -- admission-case.test.ts`

Expected: failures for the renamed and newly added status labels.

- [ ] **Step 3: Implement the requested presentation changes**

Replace the attention navigation icon with `TriangleAlert`; use compact one-line `Approved` and `Archived` labels. Update both English and Chinese locale values. Remove the secondary demo entry cards and footer explanation while retaining the build label. Change the role labels to `Admin` and `Client Portal`, subtitle to `Compliant virtual-asset deposit process.`, and package/build fallback version to `0.4.1`.

Seed consistent mocked lifecycle timestamps and all new fields. Do not seed any payments for cases that are not `service_enabled`.

- [ ] **Step 4: Run selected frontend tests and backend seed smoke test**

Run: `npm test --workspace=web -- admission-case.test.ts && python3 -m py_compile hypertransfer-main/backend/seed_demo.py`

Expected: both commands succeed.

### Task 4: Synchronize authoritative documents and verify the local demo

**Files:**
- Modify: `ProjectInfo/design.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `Docs/superpowers/specs/2026-08-28-demo-home-and-host-workspace-polish-design.md`

- [ ] **Step 1: Document the lifecycle additions**

Record `kyc_expired`, expiry timestamp behavior, active-state revocation, reversible archive recovery, and the unchanged 6-hour invitation validity. Add a dated release note with exact verification commands and limitations (local demo/mock only).

- [ ] **Step 2: Run full static and automated checks**

Run: `npm run typecheck && npm test --workspace=web && python3 -m unittest discover -s hypertransfer-main/backend -p 'test_*.py' -v`

Expected: all checks pass.

- [ ] **Step 3: Recreate the local demo database recoverably and start services**

Move the existing `/tmp/hypertransfer-20260827.db` to a timestamped backup path, seed a new local DB, start FastAPI on port 8000, and start the web workspace on port 3000. Never delete the prior local DB.

- [ ] **Step 4: Verify in the browser**

At `http://localhost:3000/`, confirm the four roles, requested copy, and `v0.4.1+local`. At `/casino-ops`, confirm the white service step for Pending Approval, comma-formatted Request USD, completed KYC timestamps, `KYC Expired`, `Invitation Expired`, hidden Deposits before enablement, revoke-to-Archived, and re-enable restoration.
