# 07 — Traceability Matrix

> **REQ（需求） → RULE（业务规则） → STATUS（状态） → CODE（代码） → TEST（测试）**  
> 每条 `CONFIRMED` 需求必须有以下五列对应；`CURRENT` 给出当前实现位置；`PROPOSED`/`OPEN` 给出建议位置但不强制实现。

---

## 7.1 VIP 旅程

### 7.1.1 邀请认领 → 注册 → 2FA

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-AUTH-001 | RULE-AUTH-003 | STATUS-ADM-002 | `apps/web/src/views/Invite.tsx`、`Register.tsx`；`server.py: /api/register/invite` | `test_admission_claims.py` |
| REQ-AUTH-002 | RULE-AUTH-007 | — | `apps/web/src/views/Login.tsx`、`Verify2FA.tsx`；`/api/login/start`、`/api/login/verify` | `test_e2e_matrix.py` |
| REQ-AUTH-003 | — | — | `apps/web/src/lib/authFlow.ts`、`server.py` TOTP | `test_e2e_matrix.py` |
| REQ-AUTH-004 | RULE-AUTH-005 | — | `recovery_codes` 表 | `test_e2e_matrix.py` |
| REQ-AUTH-006 | — | — | `sessions` 表 + `SESSION_TTL` | `test_e2e_matrix.py` |
| REQ-AUTH-007 | RULE-AUTH-006 | — | `challenges` 表 + `TOTP_ENROLL_TTL` | `test_e2e_matrix.py` |
| REQ-AUTH-011 | RULE-AUTH-004 | — | `HT_DEMO_BYPASS_2FA` + `SUMSUB_ENVIRONMENT` 检查 | `test_demo_enter.py` |
| REQ-AUTH-013 | — | — | `autocomplete="one-time-code"` | UAT-VIP-N/A（UI 行为） |
| REQ-AUTH-014 | — | — | `Register.tsx`、`ForgotPassword.tsx` | UAT 浏览器实测 |
| REQ-INV-007 | RULE-INV-005 | STATUS-ADM-002 | `/api/admission-cases/{id}/invite/email`、`.qr-session` | `test_admission_api.py` |

### 7.1.2 KYC

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-COMP-001 | RULE-COMP-001 | STATUS-KYC-003 | `/api/sumsub/kyc/start`、`.status`、`.demo-approve` | `test_kyc_case_gates.py` |
| REQ-COMP-002 | — | STATUS-KYC-001..005 | `apps/web/src/views/KYC.tsx` | UAT-VIP-005/006 |
| RULE-COMP-003 | — | STATUS-KYC-003/005 | `transaction_compliance_rules.py: kyc_valid_until` | `test_admission_timestamps.py` |
| RULE-COMP-002 | — | STATUS-ADM-010 | `apps/web/src/lib/admission-case.ts` | `apps/web/src/lib/admission-case.test.ts` |

### 7.1.3 Dashboard / Journey

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-VIP-UI-001 | — | STATUS-ADM-* | `apps/web/src/views/Dashboard.tsx`、`AdmissionJourney.tsx` | `apps/web/src/lib/admission-journey.test.ts` |
| RULE-HOST-006/007 | — | §5.1.4 | `Dashboard.tsx` 列表分段 | UAT-VIP-018 |
| STATUS-SETT-* | RULE-DEP-008 | §5.3 | `apps/web/src/lib/admission-journey.ts: settlementJourney` | `apps/web/src/lib/admission-journey.test.ts` |

### 7.1.4 入金

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-DEP-001 | RULE-DEP-004 | STATUS-DEP-001 | `/api/deposits`、`NewDeposit.tsx` | `test_e2e_matrix.py` |
| REQ-DEP-002 | RULE-DEP-001 | STATUS-KYC-* | `/api/deposits/eligibility` | `test_kyc_case_gates.py` |
| REQ-DEP-003 | RULE-DEP-002 | STATUS-DEP-002/003 | `/api/deposits/{id}/screen` | `test_transaction_compliance_api.py` |
| REQ-DEP-004 | RULE-DEP-004 | STATUS-TR-* | `lib/compliance.ts requiresTravelRule`、`.travel-rule.ts` | `test_transaction_compliance_api.py` |
| REQ-DEP-005 | RULE-DEP-002/003 | STATUS-DEP-004 | `/api/deposits/{id}/issue-address` | `test_transaction_compliance_api.py` |
| REQ-DEP-006 | — | STATUS-DEP-005 | `/api/deposits/{id}/confirm-test`、`verified_wallets` 表 | `test_e2e_matrix.py` |
| REQ-DEP-007 | RULE-DEP-007 | STATUS-DEP-006 | `/api/deposits/{id}/main`、`MainDeposit.tsx` | `test_e2e_matrix.py` |
| REQ-DEP-008 | — | STATUS-DEP-007 | `/api/deposits/{id}/marker`、`.settle` | `test_e2e_matrix.py` |
| REQ-DEP-009 | RULE-DEP-006 | — | `lib/currency.ts DEPOSIT_FEE_MODEL` + `blockExplorerTxUrl` | UAT-VIP-007..010 |
| REQ-DEP-010 | — | STATUS-DEP-001..008 | `History.tsx` | UAT-VIP-N/A |

### 7.1.5 退款

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-REF-001 | RULE-REF-001 | STATUS-REF-001 | `/api/refunds`、`RefundProcess.tsx` | `test_payment_operations.py` |
| REQ-REF-002 | RULE-REF-001 | STATUS-REF-001 | `refund_create` 后端校验 | `test_payment_operations.py` |
| REQ-REF-003 | RULE-REF-003 | STATUS-REF-002..010 | `/api/refunds/{rid}/screen`、`.approve`、`.execute` | `test_payment_operations.py` |
| REQ-REF-004 | — | — | `Dashboard.tsx` 入口门槛 | UAT-VIP-013/014 |

---

## 7.2 Host 旅程

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-HOST-001 | RULE-AUTH-012 | — | `/api/host/profile/activate` | `test_admission_api.py` |
| REQ-HOST-002 | RULE-HOST-001 | STATUS-ADM-001 | `/api/admission-cases` | `test_admission_api.py` |
| REQ-HOST-003 | RULE-HOST-002 | STATUS-ADM-002 | `/api/admission-cases/{id}/invite/email`、`.qr-session` | `test_admission_api.py` |
| REQ-HOST-004 | RULE-HOST-003/004 | — | `/api/admission-cases/{id}/remind`、`.revoke` | `test_admission_api.py` |
| REQ-HOST-005 | — | — | `AdmissionCasePanel.tsx` | `apps/web/src/lib/admission-invite.test.tsx` |
| REQ-HOST-006 | RULE-COMP-002 | STATUS-ADM-009/010 | `apps/web/src/lib/admission-case.ts: kycHostMessage` | `apps/web/src/lib/admission-case.test.ts` |
| REQ-HOST-007 | — | — | `admission_cases.details_json.hostNote` | `test_visibility_feedback.py` |
| REQ-HOST-008 | — | — | `/api/staff/onboarding/start` | `test_staff_onboarding.py` |

---

## 7.3 Leader 旅程

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-LEADER-001 | RULE-LEADER-004 | — | `/api/leader/admission-cases` + `HT_LEADER_USER_ID` 检查 | `test_leader_approval.py` |
| REQ-LEADER-002 | RULE-LEADER-001/002 | STATUS-ADM-008/011 | `/api/admission-cases/{id}/leader-decision` | `test_leader_approval.py` |
| REQ-LEADER-003 | RULE-LEADER-003 | — | `audit_trail` + `send_email` | `test_leader_approval.py` |
| REQ-LEADER-004 | RULE-LEADER-006 | — | `apps/web/src/lib/leader-approval.ts` | `apps/web/src/lib/leader-approval.test.ts` |
| PERM-LEADER-001 | RULE-LEADER-005 | — | `user_from_token` + `HT_LEADER_USER_ID` 检查 | `test_leader_approval.py` |

---

## 7.4 Operations 旅程

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-OPS-001 | — | STATUS-PI-001 | `/api/payment-intents` | `test_transaction_compliance_api.py` |
| REQ-OPS-002 | — | STATUS-PI-002 | `/api/payment-intents/{id}/source-classification` | `test_transaction_compliance_api.py` |
| REQ-OPS-003 | — | STATUS-PI-003 | `/api/payment-intents/{id}/actual-confirmation` | `test_transaction_compliance_api.py` |
| REQ-OPS-004 | RULE-OPS-002 | STATUS-PACK-001 | `/api/payment-intents/{id}/compliance-packs` | `test_transaction_compliance_api.py` |
| REQ-OPS-005 | RULE-OPS-001 | STATUS-PACK-002 | `/api/transaction-compliance-packs/{id}/screen` | `test_transaction_compliance_api.py` |
| REQ-OPS-006 | — | STATUS-PACK-003 | `/api/transaction-compliance-packs/{id}/issue-address` | `test_transaction_compliance_api.py` |
| REQ-OPS-007 | RULE-OPS-001 | STATUS-PACK-004 | `/api/transaction-compliance-packs/{id}/record-transfer` | `test_transaction_compliance_api.py` |
| REQ-OPS-008 | RULE-OPS-005 | STATUS-PACK-005 | `/api/transaction-compliance-packs/{id}/cage-confirmation` | `test_transaction_compliance_api.py` |
| REQ-OPS-009 | RULE-OPS-004/006 | STATUS-PACK-006 | `/api/transaction-compliance-packs/{id}/reconcile`、`.operations/reconciliation-export` | `test_transaction_compliance_api.py` |
| REQ-OPS-010 | RULE-OPS-007 | STATUS-PACK-* | `/api/operations/run-monitoring`、`.monitoring-flags` | `test_payment_operations.py` |
| PERM-OPS-002..004 | RULE-OPS-005/006/008 | — | `user_from_token` + role 检查 | `test_leader_approval.py`、`test_payment_operations.py` |

---

## 7.5 邀请兼容流（legacy）

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-INV-001 | RULE-INV-001 | STATUS-INV-001 | `/api/invitations` | `test_invitation_email_preview.py` |
| REQ-INV-002 | RULE-INV-002 | STATUS-INV-002/003 | `/api/invitations/{id}/approve`、`.reject` | `test_invitation_email_preview.py` |
| REQ-INV-003 | — | STATUS-INV-002 | `INVITE_TTL` | `test_invitation_email_preview.py` |
| REQ-INV-004 | — | — | `InvitationReviewPanel.tsx` | UAT-INV-004 |
| REQ-INV-005 | RULE-INV-004 | — | `/api/invitations/{id}/resubmit` | `test_invitation_email_preview.py` |
| REQ-INV-006 | RULE-AUTH-004 | — | `register_invite` + `invitation_is_redeemable` demo 放宽 | `test_demo_enter.py` |

---

## 7.6 Staff 管理

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-STAFF-001 | RULE-STAFF-001 | — | `/api/staff/onboarding/start` | `test_staff_onboarding.py` |
| REQ-STAFF-002 | — | — | `/api/2fa/enable`、`.confirm` | `test_e2e_matrix.py` |
| REQ-STAFF-003 | — | — | `/api/admin/staff` | `test_staff_onboarding.py` |
| REQ-STAFF-004 | — | — | `/api/staff/okta/link` | `test_staff_onboarding.py` |
| REQ-STAFF-005 | RULE-AUTH-009 | — | `/api/demo/enter` + `StaffLogin.tsx` | `test_demo_enter.py` |

---

## 7.7 合规 / Provider

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-COMP-001 | RULE-COMP-001/003 | STATUS-KYC-001..005 | `/api/sumsub/kyc/*` | `test_kyc_case_gates.py` |
| REQ-COMP-003 | RULE-COMP-006 | — | `screen_source_wallet` | `test_transaction_compliance_api.py` |
| REQ-COMP-004 | RULE-TR-001..007 | STATUS-TR-001..007 | `/api/sumsub/travel-rule/*` | `test_notabene_adapter.py` |
| REQ-COMP-005 | RULE-COMP-004 | — | `lib/compliance.ts TRAVEL_RULE_THRESHOLD_USD` | UAT-VIP-011/012 |
| REQ-COMP-006 | — | — | 流程口径 + UI 文案 | UAT-OPS-N/A |

---

## 7.8 展示 / 移动端

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| REQ-FMT-001 | — | — | `lib/currency.ts formatHKD`、`formatUsd`、`getHKDEquivalent` | UAT-NFR-002 |
| REQ-FMT-002 | — | — | 标识符格式化开关 | UAT-NFR-002 |
| REQ-FMT-003 | — | — | `apps/web/src/lib/admission-case.ts: admissionStatusTone` | `apps/web/src/lib/admission-case.test.ts` |
| REQ-MOB-001 | — | — | 移动端样式（mobile-first） | UAT-NFR-001 |
| REQ-MOB-002 | — | — | `Shell.tsx`/`Landing.tsx`/`ProtectedRoute.tsx` `100svh` | UAT-NFR-001 |
| REQ-MOB-003 | — | — | `Register.tsx`、`ForgotPassword.tsx` `autocomplete` | UAT-NFR-003 |
| REQ-MOB-004 | — | — | 同上 + secure context 文档 | UAT-NFR-003 |

---

## 7.9 集成与 NFR

| REQ | RULE | STATUS | CODE | TEST |
|---|---|---|---|---|
| INT-CUST-001 | FAIL-CUST-001/002 | — | `hexsafe_client.py`、`.api/hexsafe/*` | `test_e2e_matrix.py` |
| INT-TR-001 | FAIL-TR-001 | STATUS-TR-* | `/api/sumsub/travel-rule/*` | `test_notabene_adapter.py` |
| INT-TR-002 | — | — | `notabene_adapter.py` | `test_notabene_adapter.py` |
| INT-KYC-001 | FAIL-KYC-001/002 | STATUS-KYC-* | `/api/sumsub/kyc/*` | `test_kyc_case_gates.py` |
| INT-AUTH-002 | — | — | `pyotp.TOTP` | `test_e2e_matrix.py` |
| NFR-SEC-004 | — | — | `HT_ALLOWED_ORIGINS` env | — |
| NFR-SEC-005 | — | — | `/api/webhooks/sumsub` | — |
| NFR-SEC-006 | — | — | `hexsafe_client.py` ES256 | — |
| NFR-SEC-007 | — | — | `x-request-id` | — |
| NFR-PORT-001 | — | — | `docker-compose.yml` | — |
| NFR-PORT-002 | — | — | `.github/workflows/hypertransfer-check.yml` | — |

---

## 7.10 测试覆盖总览

| 层 | 框架 | 文件 | 数量 |
|---|---|---|---|
| 后端 | unittest | `hypertransfer-main/backend/test_admission_rules.py` | admission 规则 |
| 后端 | unittest | `test_admission_api.py` | admission API |
| 后端 | unittest | `test_admission_claims.py` | admission claim / verify / register |
| 后端 | unittest | `test_admission_migration.py` | DB 迁移 |
| 后端 | unittest | `test_admission_timestamps.py` | KYC valid_until 日历月 |
| 后端 | unittest | `test_e2e_matrix.py` | E2E 矩阵 |
| 后端 | unittest | `test_gate_2a_sod_source_match.py` | source-of-funds match |
| 后端 | unittest | `test_invitation_email_preview.py` | 邀请邮件预览 |
| 后端 | unittest | `test_kyc_case_gates.py` | KYC 闸门 |
| 后端 | unittest | `test_leader_approval.py` | leader 决策 |
| 后端 | unittest | `test_notabene_adapter.py` | Notabene 适配 |
| 后端 | unittest | `test_payment_operations.py` | 退款 / payment ops |
| 后端 | unittest | `test_precheck_leader_flow.py` | pre-check → leader 流程 |
| 后端 | unittest | `test_staff_onboarding.py` | 员工 onboarding |
| 后端 | unittest | `test_transaction_compliance_api.py` | pack API |
| 后端 | unittest | `test_transaction_compliance_rules.py` | pack 规则 |
| 后端 | unittest | `test_visibility_feedback.py` | visibility |
| 后端 | unittest | `test_demo_enter.py` | 一键 demo 入口 |
| 前端 | vitest | `apps/web/src/lib/admission-case.test.ts` | status label / tone / mask |
| 前端 | vitest | `apps/web/src/lib/admission-journey.test.ts` | admission / settlement journey |
| 前端 | vitest | `apps/web/src/lib/admission-invite.test.tsx` | 邀请组件 |
| 前端 | vitest | `apps/web/src/lib/kyc-status.test.ts` | KYC status |
| 前端 | vitest | `apps/web/src/lib/leader-approval.test.ts` | leader 决策 UI |
| 前端 | vitest | `apps/web/src/lib/transaction-compliance.test.ts` | pack rules |
| 前端 | vitest | `apps/web/src/lib/translations.test.ts` | i18n |

---

*最后更新：2026-08-28*