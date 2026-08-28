# Host Admission Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present every Host demo case with the approved five-stage admission lifecycle and a separate, consistent attention-signal summary.

**Architecture:** Keep the auditable backend status enum unchanged. Add a pure frontend presentation helper that derives a canonical lifecycle stage and optional Host attention signal from each detailed status; `AdmissionCasePanel` consumes that helper for row labels, timelines, and Summary groups. Demo data continues to use real audit timestamps while the UI omits unoccurred history events.

**Tech Stack:** TypeScript, React 19, Next.js 16, Vitest, Tailwind CSS.

## Global Constraints

- Canonical Host lifecycle labels are exactly: `Invited`, `Account Created`, `KYC Submitted`, `KYC Approved`, `Service Enabled`.
- `Pending Approval`, invitation follow-up, and KYC remediation are action signals, not extra lifecycle milestones.
- KYC expiry is the earlier of six months after KYC approval or the document expiry; Host views show safe category text only.
- `KYC Action Required` uses the destructive/red visual treatment; `Pending Approval` and invitation follow-up use warning/yellow.
- Revoked, final service rejection, and expired/revoked invitations remain in Archived and retain re-enable behavior; KYC failure and expiry remain active remediation cases.
- Do not commit or push without an explicit user request; preserve existing unrelated local changes.

---

### Task 1: Derive the canonical stage and Host action signal

**Files:**
- Modify: `apps/web/src/lib/admission-case.ts`
- Test: `apps/web/src/lib/admission-case.test.ts`

**Interfaces:**
- Consumes: `AdmissionCaseStatus` and safe Host case fields accepted by `hostAdmissionPresentation`.
- Produces: `hostAdmissionLifecyclePresentation(case)` returning `{ stage: HostAdmissionStage; attention: HostAttentionSignal | null; isArchived: boolean }`.

- [x] **Step 1: Write the failing tests**

```ts
expect(hostAdmissionLifecyclePresentation({ status: "vip_claimed" })).toMatchObject({
  stage: "Account Created",
  attention: "KYC Action Required",
});
expect(hostAdmissionLifecyclePresentation({ status: "leader_pending" })).toMatchObject({
  stage: "KYC Approved",
  attention: "Pending Approval",
});
expect(hostAdmissionLifecyclePresentation({ status: "kyc_expired" })).toMatchObject({
  stage: "KYC Approved",
  attention: "KYC Action Required",
});
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test --workspace=web -- src/lib/admission-case.test.ts`

Expected: failure because `hostAdmissionLifecyclePresentation` is not exported.

- [x] **Step 3: Implement the minimal presentation helper**

```ts
export type HostAdmissionStage =
  | "Invited"
  | "Account Created"
  | "KYC Submitted"
  | "KYC Approved"
  | "Service Enabled";

export type HostAttentionSignal =
  | "Invitation Pending"
  | "Invitation Expired"
  | "KYC Action Required"
  | "Pending Approval";
```

Map invitation statuses to `Invited`, `vip_claimed` to `Account Created`, submitted/reviewing statuses to `KYC Submitted`, approved/pending/expired statuses to `KYC Approved`, and service-enabled to `Service Enabled`. Map only revoked, final service rejection, and expired/revoked invitations to `isArchived: true`; keep KYC failure and expiry active for remediation.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `npm test --workspace=web -- src/lib/admission-case.test.ts`

Expected: PASS.

### Task 2: Render stages and signals consistently in the Host workspace

**Files:**
- Modify: `apps/web/src/components/AdmissionCasePanel.tsx`
- Test: `apps/web/src/lib/admission-case.test.ts`

**Interfaces:**
- Consumes: `hostAdmissionLifecyclePresentation(case)` from Task 1.
- Produces: `hostAttentionSummary(cases)` returning `{ signal: HostAttentionSignal; ids: string[] }[]`, plus a five-step `CaseTimeline`, row stage label, optional attention badge, and Summary groups derived from that same helper.

- [x] **Step 1: Write the failing assertions for summary group parity**

```ts
const rows = [
  { id: "pending", status: "leader_pending" as const },
  { id: "new-account", status: "vip_claimed" as const },
  { id: "expired-kyc", status: "kyc_expired" as const },
];
expect(hostAttentionSummary(rows)).toEqual([
  { signal: "KYC Action Required", ids: ["new-account", "expired-kyc"] },
  { signal: "Pending Approval", ids: ["pending"] },
]);
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test --workspace=web -- src/lib/admission-case.test.ts`

Expected: failure because `hostAttentionSummary` is not exported.

- [x] **Step 3: Implement consistent rendering**

```tsx
const lifecycle = hostAdmissionLifecyclePresentation(c);
<Pill tone="neutral">{lifecycle.stage}</Pill>
{lifecycle.attention && <Pill tone={attentionTone(lifecycle.attention)}>{lifecycle.attention}</Pill>}
```

Replace `Clicked` with `Account Created` and `KYC info submitted` with `KYC Submitted` in `CASE_STEPS`. Build Summary groups through `hostAttentionSummary` so each group’s IDs are the same cases that render the corresponding attention badge; do not add a Summary group for `null` attention.

```ts
export function hostAttentionSummary<T extends {
  id: string;
  status: AdmissionCaseStatus;
  invitation?: AdmissionCase["invitation"];
  invitedAt?: number | null;
  kycHostMessage?: string;
}>(cases: readonly T[]): { signal: HostAttentionSignal; ids: string[] }[] {
  const order: HostAttentionSignal[] = [
    "KYC Action Required",
    "Invitation Expired",
    "Invitation Pending",
    "Pending Approval",
  ];
  return order.map((signal) => ({
    signal,
    ids: cases.filter((c) => hostAdmissionLifecyclePresentation(c).attention === signal).map((c) => c.id),
  })).filter((group) => group.ids.length > 0);
}
```

- [x] **Step 4: Run focused tests to verify they pass**

Run: `npm test --workspace=web -- src/lib/admission-case.test.ts`

Expected: PASS.

### Task 3: Align demo data and safe Host actions with the new model

**Files:**
- Modify: `hypertransfer-main/backend/server.py`
- Test: `hypertransfer-main/backend/test_admission_api.py`

**Interfaces:**
- Consumes: existing seeded admission-case timestamps and reminder endpoint.
- Produces: demo cases spanning every canonical stage and safe, actionable KYC reminder content.

- [x] **Step 1: Write failing backend assertions for representative seeded cases**

```py
assert host_cases_by_status["vip_claimed"]["claimedAt"]
assert host_cases_by_status["kyc_in_progress"]["kycSubmittedAt"]
assert host_cases_by_status["leader_pending"]["kycApprovedAt"]
assert host_cases_by_status["kyc_expired"]["kycExpiredAt"]
```

- [x] **Step 2: Run the focused backend test**

Run: `python3 -m unittest hypertransfer-main/backend/test_admission_api.py`

Expected: either PASS or a documented local dependency error; in either case run `python3 -m py_compile hypertransfer-main/backend/server.py`.

- [x] **Step 3: Make the smallest seed/response changes required**

Ensure each demo case has timestamps only for events that actually happened. Preserve the existing KYC-expiry reminder requirement to request valid documentation without exposing provider evidence.

- [x] **Step 4: Re-run the focused backend check**

Run: `python3 -m py_compile hypertransfer-main/backend/server.py`

Expected: PASS.

### Task 4: Validate the complete Host flow

**Files:**
- Modify only if Task 1–3 checks reveal a gap.

**Interfaces:**
- Consumes: production-equivalent local frontend and demo API data.
- Produces: verified Host UI at `http://localhost:3000/casino-ops`.

- [x] **Step 1: Run full frontend checks**

Run: `npm test --workspace=web && npm run typecheck --workspace=web && git diff --check`

Expected: all web tests and TypeScript checks pass; whitespace check is clean.

- [x] **Step 2: Verify the local route responds**

Run: `curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000/casino-ops`

Expected: `200`.

- [x] **Step 3: Verify in the local browser**

Confirm that:

```text
Timeline: Invited → Account Created → KYC Submitted → KYC Approved → Service Enabled
Summary: action-signal counts equal visible matching row badges
KYC Action Required: red, with a safe reminder action where remediation is possible
Pending Approval: yellow, positioned after KYC Approved
Archived: Revoked case retains re-enable action
```

- [x] **Step 4: Report verified outcome without committing or pushing**

Report the exact test results and any backend dependency limitation. Do not create a git commit, GitHub push, email, or production deployment.
