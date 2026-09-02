# 05 — State Machines & Status Vocabulary

> 本章定义全部状态机与状态词汇表。客户面仅展示 §5.1 / §5.3 / §5.4 子集；Staff 内部可见全部枚举。

## 5.1 VIP Admission Case（Host-led）

> 用户已确认产品原则：客户面状态收敛为 `Invited → Account Created → KYC Submitted → KYC Approved → Service Enabled`。  
> 后端内部枚举保留更细粒度分支（kyc_failed / compliance_review / rejected / expired / revoked）。

### 5.1.1 状态枚举

| 内部 ID | 客户面标签 | Tone | 含义 | 终态？ |
|---|---|---|---|---|
| `draft` | "Created" | neutral | Host 已建 case，待发邀请 | ❌ |
| `invitation_open` | "Invited" | warning | 邀请已发，待认领 | ❌ |
| `vip_claimed` | "Account Created" | warning | VIP 已认领 + 注册 | ❌ |
| `kyc_in_progress` | "KYC Submitted" | warning | KYC 进行中 | ❌ |
| `kyc_passed` | "KYC Approved" | success | KYC 通过 | ❌ |
| `payment_precheck` | "Payment pre-check" | warning | Source classification + Actual confirmation | ❌ |
| `leader_pending` | "Pending Approval" | warning | 等待 leader 决策 | ❌ |
| `service_enabled` | "Service Enabled" | success | 可发起入金 | ✅ |
| `kyc_failed` | "KYC Action Required" | danger | KYC 失败，需重交 | ✅ |
| `compliance_review` | "Compliance Review" | danger | 受限结果中性 | ✅ |
| `rejected` | "Rejected" | danger | Leader / staff 拒绝 | ✅ |
| `expired` | "Invitation Expired" | danger | 邀请过期 | ✅ |
| `revoked` | "Revoked" | danger | Host 撤销 | ✅ |

### 5.1.2 转移图

```
draft
  └─> invitation_open              (Host 触发 invite/email 或 invite/qr-session)
        ├─> vip_claimed             (VIP 用 invite 认领 + Email OTP 注册)
        ├─> expired                 (TTL 到期，未认领)
        ├─> revoked                 (Host 主动 revoke)
        │
vip_claimed
  ├─> kyc_in_progress               (VIP 提交 KYC → /api/sumsub/kyc/start)
  ├─> expired                       (TTL 到期，未提交 KYC)
  │
kyc_in_progress
  ├─> kyc_passed                    (Sumsub review approved + valid_until 算)
  ├─> kyc_failed                    (Sumsub review rejected)
  ├─> compliance_review             (受限结果)
  ├─> expired                       (TTL 到期)
  │
kyc_passed
  ├─> payment_precheck              (Source classification + Actual confirmation 自动)
  ├─> leader_pending                (跳过 pre-check，可选)
  │
payment_precheck
  └─> leader_pending                (Pre-check 完成)
        │
leader_pending
  ├─> service_enabled               (Leader approve)
  ├─> rejected                      (Leader reject，必填 reason)
        │
service_enabled
  └─> <settlement journey 独立>    (case 不再变化，payments 走独立 journey)
```

### 5.1.3 状态词汇表（客户面 + staff 面）

| ID | 状态 | 客户面文案 | staff 面文案 |
|---|---|---|---|
| STATUS-ADM-001 | `draft` | "Your Host is preparing your invitation." | "Draft — not yet sent" |
| STATUS-ADM-002 | `invitation_open` | "Check your email and claim your invitation with the code we sent to you." | "Invitation open — TTL 6h email + 15min QR" |
| STATUS-ADM-003 | `vip_claimed` | "Account created. Complete identity verification to continue." | "VIP claimed (account created)" |
| STATUS-ADM-004 | `kyc_in_progress` | "Your verification is being reviewed — it usually completes in under a minute." | "KYC in progress (Sumsub review)" |
| STATUS-ADM-005 | `kyc_passed` | "Your identity verification passed. Your admission is being prepared." | "KYC passed; valid_until=<date>" |
| STATUS-ADM-006 | `payment_precheck` | "Your payment details are being pre-checked before approval." | "Pre-check: source + actual confirmation" |
| STATUS-ADM-007 | `leader_pending` | "Your admission is with the approver. We will notify you of the decision." | "Leader approval pending" |
| STATUS-ADM-008 | `service_enabled` | "Your service is enabled. You can now start your first deposit." | "Service enabled" |
| STATUS-ADM-009 | `kyc_failed` | "Your identity verification was not approved — please resubmit your documents." | "KYC failed (Sumsub reason: <internal>)" |
| STATUS-ADM-010 | `compliance_review` | "Your admission is under compliance review. We will contact you if more information is needed." | "Compliance review (host_seen_reason: <category>)" |
| STATUS-ADM-011 | `rejected` | "Your admission was not approved at this time. Please contact your Host." | "Rejected (leader reason: <reason>)" |
| STATUS-ADM-012 | `expired` | "Your invitation has expired. Please ask your Host to send a new one." | "Expired" |
| STATUS-ADM-013 | `revoked` | "Your invitation was revoked. Please contact your Host." | "Revoked by Host" |

### 5.1.4 列表显示原则（CONFIRMED）

- **待处理状态** 在列表中显示为"当前状态"标签：`Pending Approval`、`KYC Action Required`、`Invitation Expired`、`Invitation Open`。
- **已完成状态** **不**作为当前状态标签重复显示，仅在列表项中作为历史阶段出现：`Service Enabled`、`KYC Approved`。
- 列表分段：待处理 / 已生效；切换态（`KYC Submitted` → `KYC Approved`）只显示未完结一侧。

## 5.2 Admission Journey（VIP 端旅程视图）

> 由 `apps/web/src/lib/admission-journey.ts` 推导；状态在 §5.1 表中取对应 key。

| Journey key | Label | 内部 status |
|---|---|---|
| `draft` | Created | `draft` |
| `invitation_open` | Invited | `invitation_open` |
| `vip_claimed` | Claimed | `vip_claimed` |
| `kyc_in_progress` | KYC | `kyc_in_progress` |
| `kyc_passed` | KYC passed | `kyc_passed` |
| `payment_precheck` | Pre-check | `payment_precheck` |
| `leader_pending` | Approver | `leader_pending` |
| `service_enabled` | Enabled | `service_enabled` |

## 5.3 Settlement Journey（资金端旅程视图）

> 由 `payment_actual_confirmations` + `cage_confirmations` + `finance_reconciliations` 推导（`apps/web/src/lib/admission-journey.ts:settlementJourney`）。

| Journey key | Label | Done 条件 |
|---|---|---|
| `verification` | Verification | `payments[].transferLeg == "verification" && finalizedAt` |
| `main` | Main transfer | `payments[].transferLeg == "main" && finalizedAt` |
| `cage` | Cage | `payments[].cageConfirmationId` |
| `reconciled` | Reconciled | `payments[].reconciliationRef` |

## 5.4 Deposit 状态机（客户入金）

> 内部枚举：`created → screening_passed/screening_failed → address_issued → verified → main_submitted → settled`；任意可 `cancelled`。

### 5.4.1 状态枚举

| ID | 状态 | 客户面文案 | 含义 |
|---|---|---|---|
| STATUS-DEP-001 | `created` | "Draft" | 客户已创建入金，等待 Source wallet |
| STATUS-DEP-002 | `screening_passed` | "Wallet screening passed" | KYT Pass |
| STATUS-DEP-003 | `screening_failed` | "Wallet screening failed" | KYT Fail（EDD / Fail） |
| STATUS-DEP-004 | `address_issued` | "Address issued" | Hex Safe 已签发一次性地址 |
| STATUS-DEP-005 | `verified` | "Verification received" | Step 1 USDT 到账 + 写 verified_wallets |
| STATUS-DEP-006 | `main_submitted` | "Main transfer in progress" | Step 2 主入金进行中 |
| STATUS-DEP-007 | `settled` | "Settled" | staff 录入 marker reference |
| STATUS-DEP-008 | `cancelled` | "Cancelled" | 客户 / 系统取消 |

### 5.4.2 客户面三态聚合（CONFIRMED）

> 客户面仅显示三态：`Pending` / `Deposit Completed` / `Settled`。

| 客户面 | 内部 status |
|---|---|
| `Pending` | `created` / `screening_passed` / `screening_failed` / `address_issued` / `verified` / `main_submitted` |
| `Deposit Completed` | 链上最终到账（`record-transfer` final），但未录 marker |
| `Settled` | `settled`（staff 录入 marker reference） |

### 5.4.3 转移图

```
created
  ├─> screening_passed           (Pass KYT)
  ├─> screening_failed           (EDD / Fail KYT)
  └─> cancelled
        │
screening_passed
  ├─> address_issued             (KYC + KYT + TR 三闸门通过)
  ├─> cancelled
        │
address_issued
  ├─> verified                   (Step 1 1 USDT 到账 + 写 verified_wallets)
  ├─> cancelled
        │
verified
  ├─> main_submitted             (Step 2 主入金发起)
  └─> settled (全额容错)         (handleFullAmountDetected)
        │
main_submitted
  └─> settled                    (staff 录入 marker reference)
```

## 5.5 Refund 状态机

### 5.5.1 状态枚举

| ID | 状态 | 含义 |
|---|---|---|
| STATUS-REF-001 | `submitted` | 客户已提交（walletId 必属本人 verified_wallets） |
| STATUS-REF-002 | `screening` | compliance wallet KYT 进行中 |
| STATUS-REF-003 | `screening_passed` | KYT Pass |
| STATUS-REF-004 | `screening_failed` | KYT Fail / EDD |
| STATUS-REF-005 | `management_review` | 等待 management 审批 |
| STATUS-REF-006 | `approved` | management 批准 |
| STATUS-REF-007 | `rejected` | management 拒绝（可填原因） |
| STATUS-REF-008 | `executing` | custodian 执行 Hex Safe withdrawal |
| STATUS-REF-009 | `settled` | 提现完成 |
| STATUS-REF-010 | `failed` | 提现失败 |

## 5.6 Payment Intent & Compliance Pack

### 5.6.1 Payment Intent 状态

| ID | 状态 | 含义 |
|---|---|---|
| STATUS-PI-001 | `created` | intent 创建 |
| STATUS-PI-002 | `source_classified` | source-classification 完成 |
| STATUS-PI-003 | `confirmed` | actual-confirmation 完成 |
| STATUS-PI-004 | `cancelled` | 取消 |

### 5.6.2 Transaction Compliance Pack 状态

| ID | 状态 | 含义 |
|---|---|---|
| STATUS-PACK-001 | `draft` | pack 创建 |
| STATUS-PACK-002 | `screened` | KYT screen 完成 |
| STATUS-PACK-003 | `address_issued` | 发址（KYT + TR 双闸门） |
| STATUS-PACK-004 | `transferred` | record-transfer 完成 |
| STATUS-PACK-005 | `cage_confirmed` | cage-confirmation 录入 |
| STATUS-PACK-006 | `reconciled` | reconcile 完成 |
| STATUS-PACK-007 | `fingerprint_changed` | 实际到账指纹变更 → 强制重验、阻发地址 |
| STATUS-PACK-008 | `voided` | 作废 |

### 5.6.3 Pack depth 决策

| 金额（USD 1:1 资产） | 深度 |
|---|---|
| < USD 1,000 | basic |
| ≥ USD 1,000 ≈ HKD 8,000 | enhanced |

> 仅切换字段深度，**绝不豁免 pack**。

## 5.7 KYC 状态机

| ID | 状态 | 含义 |
|---|---|---|
| STATUS-KYC-001 | `not_started` | VIP 未提交 |
| STATUS-KYC-002 | `in_progress` | Sumsub review 进行中 |
| STATUS-KYC-003 | `approved` | 通过；`valid_until = min(通过日+6 月, 最早证件到期日)` |
| STATUS-KYC-004 | `rejected` | 拒绝 |
| STATUS-KYC-005 | `expired` | 6 个日历月过期；必须重做 |

## 5.8 Travel Rule 状态

| ID | 状态 | 含义 |
|---|---|---|
| STATUS-TR-001 | `not_required` | < USD 1,000 |
| STATUS-TR-002 | `required` | ≥ USD 1,000 |
| STATUS-TR-003 | `pending` | 等待客户提交 |
| STATUS-TR-004 | `submitted` | 已提交 provider |
| STATUS-TR-005 | `accepted` | provider 接受 |
| STATUS-TR-006 | `rejected` | provider 拒绝（阻止发址） |
| STATUS-TR-007 | `manual_review` | 人工复核 |

## 5.9 Invitation 状态（兼容模式）

| ID | 状态 | 含义 |
|---|---|---|
| STATUS-INV-001 | `submitted` | RM 已提交 |
| STATUS-INV-002 | `approved` | Marketing 已批准（自动签发 token，6h TTL） |
| STATUS-INV-003 | `rejected` | Marketing 已拒绝（必填原因） |

## 5.10 完整状态字段映射（前端展示）

| 内部 key | Journey label | Tone | 在列表显示为当前状态？ |
|---|---|---|---|
| `draft` | Created | neutral | ❌（过渡态） |
| `invitation_open` | Invited | warning | ✅ |
| `vip_claimed` | Account Created | warning | ✅ |
| `kyc_in_progress` | KYC Submitted | warning | ✅ |
| `kyc_passed` | KYC Approved | success | ❌（已完成，仅历史） |
| `payment_precheck` | Pre-check | warning | ✅ |
| `leader_pending` | Pending Approval | warning | ✅ |
| `service_enabled` | Service Enabled | success | ❌（已完成，仅历史） |
| `kyc_failed` | KYC Action Required | danger | ✅ |
| `compliance_review` | Compliance Review | danger | ✅ |
| `rejected` | Rejected | danger | ✅ |
| `expired` | Invitation Expired | danger | ✅ |
| `revoked` | Revoked | danger | ✅ |

---

*最后更新：2026-08-28*