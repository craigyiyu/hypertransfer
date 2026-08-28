# Admin Operations Menu Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Withdrawals and Payment Operations from the Admin / Casino Ops workspace without changing Deposits or the other role workspaces.

**Architecture:** `CasinoOpsPortal` owns the section catalog and conditionally renders each selected panel. Remove the two retired section definitions and their matching render branches, while keeping the underlying components and backend APIs untouched for this scoped UI change.

**Tech Stack:** React, TypeScript, Vitest, Next.js.

## Global Constraints

- Admin / Casino Ops opens on Deposits by default.
- Do not modify compliance, approval, reconciliation, or treasury-control behavior.
- Do not remove backend APIs or components outside this portal entry point.

---

### Task 1: Remove retired Admin operations sections

**Files:**
- Modify: `apps/web/src/views/CasinoOpsPortal.tsx`
- Modify: `apps/web/src/views/CasinoOpsPortal.test.ts`

**Interfaces:**
- Consumes: `getCasinoOpsSectionKeys()` added to `CasinoOpsPortal.tsx`, returning the renderable navigation section keys.
- Produces: a section catalog that excludes `refunds` and `payment-ops`.

- [x] **Step 1: Write the failing test**

```ts
it("does not expose Withdrawals or Payment Operations in the Admin section catalog", () => {
  expect(getCasinoOpsSectionKeys()).not.toContain("refunds");
  expect(getCasinoOpsSectionKeys()).not.toContain("payment-ops");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=web -- CasinoOpsPortal.test.ts`

Expected: FAIL because `getCasinoOpsSectionKeys` is not defined.

- [x] **Step 3: Write minimal implementation**

```ts
export function getCasinoOpsSectionKeys() {
  return ["vip-new", "vip-attention", "vip-approved", "vip-archived", "deposits", "leader", "leader-past", "access", "staff"] as const;
}
```

Remove the `refunds` and `payment-ops` records from `useSections`, their unused imports, and their two conditional panel render branches.

- [x] **Step 4: Run focused and full verification**

Run: `npm test --workspace=web -- CasinoOpsPortal.test.ts && npm test --workspace=web && npm run typecheck --workspace=web && npm run build --workspace=web`

Expected: all tests pass, type-check passes, and the production build completes.

- [x] **Step 5: Inspect the local portal**

Run: `curl --fail --silent --show-error http://localhost:3000/casino-ops -o /dev/null`

Expected: command exits with status 0; the role-aware sidebar no longer lists Withdrawals or Payment Operations.
