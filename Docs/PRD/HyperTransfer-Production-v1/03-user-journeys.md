# 03 — User Journeys

> 本章描述五个角色的端到端旅程。每个旅程给出：目标 → 入口 → 步骤 → 出口 / 失败处理 → 关联需求 ID。  
> 所有数据展示均带千分位（金额、数量、统计），标识符（验证码、ID、钱包地址）保持原样。

---

## 3.1 VIP（客户）旅程

**目标**：从 Host 邀请 → 通过 KYC → 发起入金 → 收 Player Marker → 必要时申请退款。  
**入口**：邀请邮件链接（token + Email OTP） 或 QR 邀请会话（15min 动态）。  
**关联需求**：`REQ-VIP-INV-*`、`REQ-VIP-KYC-*`、`REQ-VIP-DEP-*`、`REQ-VIP-REF-*`、`REQ-VIP-HIS-*`。

### 3.1.1 邀请认领 → 注册 → 2FA

1. Host 创建 admission case，VIP 收到邮件（**邮件中包含邀请链接 + 二维码**，6h 链接 TTL）。
2. VIP 点链接 → `/invite?token=…`（公开）。
3. 后端 `/api/invitations/verify` 校验 token + email。
4. VIP 输入 Email OTP（`/api/email/send-otp`）→ 注册表单 `/api/register/invite`。
5. 系统创建用户（`user_id=uuid`）→ 返回 enrollment session（10min TTL）。
6. VIP 跳 `/setup-2fa` → 扫 QR（GA / MS Authenticator 兼容）→ 输入 6 位 → `/api/confirm-totp`。
7. 系统展示 10 个一次性恢复码（强制下载 / 复制后才进 KYC）。
8. TOTP 绑定后跳 `/kyc` 或 `/dashboard`（按 admission case status 引导）。

**失败路径**：
- Token 过期 → 提示"Invitation expired, ask your Host to send a new one" → 自动跳 `/invite?token=…&expired=1`。
- 邮箱不一致 → 中性 400，不枚举（`/api/admission-claims/verify-email`）。
- 同案另一渠道认领 → 全部 session 作废 410。
- TOTP enrollment 超时（10min）→ `/regenerate-totp` 重签。

### 3.1.2 KYC（Sumsub API-only）

1. `/kyc` 表单：姓名 / 出生日期 / 国籍 / 电话 + 同意（按 `valid_until=min(通过日+6 月,最早证件到期日)` 决定有效期）。
2. 后端 `/api/sumsub/kyc/start` 创建 applicant（`externalUserId=deterministic`）。
3. 客户端调用 Sumsub status API 轮询；通过的由 Sumsub webhook `/api/webhooks/sumsub` 通知。
4. `KYCStatus` 页面：pending 时显示"verification is being reviewed — it usually completes in under a minute"。
5. 通过 → admission case 状态 `kyc_passed` → 自动进入 `payment_precheck`（VIP 端无动作）。
6. 失败 → `kyc_failed` / `compliance_review`（受限结果中性文案，无原始 detail）。

### 3.1.3 Dashboard 与 Admission Journey

`/dashboard` 显示：
- **Admission Journey**（按 §5.2 收敛步骤：`Invited → Account Created → KYC Submitted → KYC Approved → Service Enabled`）。
- **当前状态标签**只显示待处理状态（`Pending Approval`（KYC 已通过，等待 Admin / Leader 手动通过）、`KYC Action Required`（VIP KYC 信息未完成，或系统要求 VIP 提供更多信息）、`Invitation Expired`），已完成状态不重复。
- **Settlement Journey**（当 Service Enabled 后，由 payments 推导）：
  1. `Initiative New Payment` — 客户点 New Deposit 主动发起。
  2. **Travel Rule Verification** — 所有入金都触发 Sumsub TR（v1.1 **CONFIRMED**：默认假设所有入金 ≥ HKD 8,000）。
  3. **Wallet address & verify** — VIP 提供 source wallet；后台自动发起 Sumsub KYT 筛查（v1.1 **CONFIRMED**：钱包 KYT 走 Sumsub Crypto Monitoring adapter，mock 默认）。
  4. **Sumsub approved → 显示 HexTrust 动态地址**（client-specific，由 Hex Safe sandbox 实接）。
  5. **1 Dollar test payment** — VIP 向 Hex Safe 地址转入 1 USDT。
  6. **Status page 提示 test payment received → VIP 发起 Main Transfer**。
  7. **Status page monitor Main Transfer → 收到后通知 VIP、Host、Admin**（v1.1 **CONFIRMED**：Admin 也收邮件）。
  8. **Admin / HK Ops 手动与 back office 沟通 + 录入 cage reference**（v1.1 **CONFIRMED**：Admin 也可录 cage）。
  9. `Cage → Reconciled`（Finance 录入完成）。
- 快捷入口：
  - **New Deposit** — KYC approved 才可点（v1.1 **CONFIRMED**）：如已有历史 transfer，VIP 可选历史 originating wallet picker；若最近 KYT verification < 6 小时则直接 assign HexTrust 钱包（跳过 screening）；≥ 6 小时或新地址则后台重发起 KYT 链 Sumsub。
  - **Refund** — v1.1 起仅占位（`under development`），不做完整退款流（v1.1 **CONFIRMED**：范围收缩；backend 保留便于 Phase 2 恢复）。
  - History、Settings、Support（CURRENT）。

### 3.1.4 入金（New Deposit）

1. `/new-deposit`：选资产（USDT / USDC）+ 网络（v1.1 **CONFIRMED**：仅默认一个 rail = USDT/USDC ERC-20，见 `lib/compliance.ts DEFAULT_PHASE_ONE_NETWORK`）+ 金额（所有入金都触发 Travel Rule；v1.1 **CONFIRMED**：默认假设所有入金 ≥ HKD 8,000）。
2. 后端 `/api/deposits/eligibility` → `accountState` 必须为 `active`（KYC 有效）。
3. `/wallet-screening`：输入 source wallet（v1.1 起支持 picker 选历史 verified wallet，< 6h 命中缓存跳过筛查）→ `/api/deposits/{id}/screen` → Pass / EDD / Fail（v1.1 `provider='kyt-cache'` 表示命中缓存）。
4. `Pass` → `/travel-rule`（所有金额都触发）→ `/api/sumsub/travel-rule/submit` → `submitted / accepted / rejected / manual_review`。
5. 三闸门（KYC + KYT pass + TR gate）通过 → `/api/deposits/{id}/issue-address` → 调 Hex Safe（sandbox 实接）→ 返回 `deposit_address`。
6. `/main-deposit`：Step 1 验证款 1 USDT（按实际到账计入总计划），Step 2 主入金（`max(total − actual_step1, 0)`）。**全额容错**：直接打全额也不卡流程。
7. 后端 `/api/deposits/{id}/main` 记录计划总金额（TR / 后台用），demo settlement 与成功页记录实际到账合计。
8. `/deposit-success`：展示 `txHash` 浏览器链接（`blockExplorerTxUrl`：tron→tronscan / ethereum→etherscan）+ Reference ID + 状态「in progress · pending marker」。
9. 录 marker 后（HK Ops 或 Admin）→ 显示 `Settled · <marker ref>`。

### 3.1.5 退款

1. `/refund`：**从 verified wallets 选择**（picker，禁自由输入）→ 自由金额（不绑定入金额、不设上限）→ 可选原因。
2. 后端 `/api/refunds` 校验 walletId 必属本人 `verified_wallets`（否则 400）。
3. 退款队列：compliance 端 wallet KYT → management approve → custodian execute（Hex Safe withdrawal）。
4. VIP 在 `/history` 看到进度。
5. **失败路径**：vault 余额不足由 staff 端 vault 余额校验 + 管理层审批兜底（非应用内自动查）。

### 3.1.6 History

`/history`：按时间倒序的入金 / 退款列表。
- 入金三态：`Pending`（流程中） → `Deposit Completed`（链上完成） → `Settled`（staff 录入 marker）。
- 退款状态按 queue 阶段。

---

## 3.2 Host 旅程

**目标**：维护一个 VIP 池（开通企业身份后），通过邀请 + 跟进把 VIP 推到 Service Enabled。  
**入口**：`/staff-onboard`（公司邮箱自助注册）或 admin 创建（admin only）。  
**关联需求**：`REQ-HOST-ACT-*`、`REQ-HOST-CASE-*`、`REQ-HOST-INV-*`、`REQ-HOST-FOL-*`。

### 3.2.1 Host 激活

1. `/staff-onboard`：选 Host 角色 → 公司邮箱 → 后端 `/api/staff/onboarding/start` → 邮件含 TOTP 绑定链接。
2. 员工扫 QR 绑定 TOTP → `/api/2fa/confirm` → 落 `host` 角色 + TOTP。
3. 首次登录 → 自动调 `/api/host/profile/activate`（Okta 边界；demo 无配置 → 仍走 activate；生产未配 Okta → 503 fail closed）。

### 3.2.2 VIP Requests 主页（`/casino-ops` 的 VIP Requests 区）

展示 Host 自己的 admission cases（`/api/admission-cases/mine`），按状态分两段：
- **待处理**：`Pending Approval`（leader_pending）、`KYC Action Required`（kyc_failed / compliance_review）、`Invitation Expired`（expired）、`Invitation Open`（invitation_open）。
- **已生效**：`Service Enabled`（service_enabled，**不重复作为"当前状态"标签**，仅列表展示）。

每个 case 显示：
- masked email（`maskPatronEmail`）
- 业务备注（Host note，仅 Host 可见）
- `kycHostMessage`（受限中性原因，**绝不暴露证件号 / 原始 detail**）
- `kycValidUntil`（ISO date，仅 Host 可见）

### 3.2.3 创建 Case

1. 填 Member ID（白标） + First / Last Name + Email → 提交 `/api/admission-cases`。
2. 系统返回 `case_id` + 双通道邀请：
   - **Email**：`/api/admission-cases/{id}/invite/email`（6h TTL token，含 URL + QR 图）。
   - **QR Session**：`/api/admission-cases/{id}/invite/qr-session`（15min 动态 QR）。
3. Host 在 case 详情页查看交付卡：可复制邀请链接 + QR + 时效状态（`Valid · Xh Ym left` / `Link expired`，过期可 resend）。

### 3.2.4 跟进

| 动作 | 端点 | 用途 |
|---|---|---|
| Remind | `/api/admission-cases/{id}/remind` | 触发重发邮件 |
| Resend | `/api/admission-cases/{id}/invite/email` | 重新签发 token |
| Revoke | `/api/admission-cases/{id}/revoke` | 撤销 case |
| View timeline | `/api/admission-cases/{id}` | 完整时间线（KYC 状态 / leader 决策 / Cage / Reconcile） |

### 3.2.5 完成态收尾

case 进入 `service_enabled` 后，Host 跟进 VIP 实际入金 → Settlement Journey 可见。

---

## 3.3 Manager / Leader 旅程

**目标**：对 VIP 准入做单一领导审批（合规 + 业务原因绑定）。  
**入口**：`/casino-ops` 的 Leader Approval 区（`/api/leader/admission-cases`）。  
**关联需求**：`REQ-LEADER-Q-*`、`REQ-LEADER-D-*`。

### 3.3.1 队列

- 仅 leader 用户（或 `HT_LEADER_USER_ID` 白名单）可见。
- 显示 case 摘要：masked email + Host note + KYC 状态（受限原因）。
- 字段：`case_id` / `hostName` / `patronEmailMasked` / `status` / `kycHostMessage` / `kycValidUntil`。

### 3.3.2 决策

| 动作 | 端点 | 必填 |
|---|---|---|
| Approve | `/api/admission-cases/{id}/leader-decision` `{decision: "approve"}` | 无 |
| Reject | `/api/admission-cases/{id}/leader-decision` `{decision: "reject", reason: "<业务原因>"}` | **reason 必填** |

- approve → `service_enabled` → 通知 VIP + Host（`send_email` + audit）。
- reject → `rejected` → 通知 VIP + Host + 留 leader reason 落库。
- 决策后写 audit_trail。

### 3.3.3 权限边界

- Host / Compliance / Marketing / Admin **不得**决策（角色矩阵见 §4.4）。
- production 未配 `HT_LEADER_USER_ID` → 队列与决策 503 fail closed（不静默 demo）。

---

## 3.4 Operations（HK Ops + Finance + Compliance）旅程

**目标**：在 VIP / Host 完成准入后，把每笔转账从链上推到 Cage + Reconciled。  
**入口**：`/casino-ops` 的 Payment Operations + Reconciliation 区。  
**关联需求**：`REQ-OPS-INTENT-*`、`REQ-OPS-PACK-*`、`REQ-OPS-CAGE-*`、`REQ-OPS-RECON-*`。

### 3.4.1 Payment Intents & Compliance Pack

1. 系统按 admission case → 创建 `payment_intent`（verification + main 两 leg）。
2. Host / system 触发 `source-classification` → `actual-confirmation`（记录链上到账指纹）。
3. 每 leg 创建独立不可变的 `transaction_compliance_pack`（basic / enhanced 字段；HKD 8,000 切换深度）。
4. Pack 完成 `screen`（KYT，Hex Safe API / 第三方 KYT）→ `issue-address`（KYT + TR 双闸门）。
5. 实际到账 → `record-transfer` → `final` 标记。

### 3.4.2 Cage Confirmation

1. HK Operations 在 `/casino-ops` 选 pack → 录入 Cage confirmation ID（`/api/transaction-compliance-packs/{id}/cage-confirmation`）。
2. 业务含义：赌场金库（cage）确认资金已收。
3. **legacy deposit 仍保留 `marker` 字段**作为兼容（旧 marker ref 仍可查询）。

### 4.4.3 Finance Reconciliation

1. Finance 触发 `/api/transaction-compliance-packs/{id}/reconcile`。
2. 系统产出 reconciliation record（链上到账 vs 业务入账）。
3. `/api/operations/reconciliation-export` 导出（CSV / JSON） → 留存 ≥5 年。
4. demo 监控：`/api/operations/run-monitoring` + `/api/operations/monitoring-flags` 标记异常转账给 Compliance。

---

## 3.5 Staff（综合后台）旅程

**目标**：上述角色（Host / Leader / Operations）统一在 `/casino-ops` 工作。  
**入口**：`/ops`（StaffLogin）或 `/staff-onboard`（首次注册）。

### 3.5.1 登录（Okta SSO demo）

1. `/ops` 主按钮「Sign in with Okta」 → `/api/demo/enter` `{role: "staff"}` → 拿到 `DEMO_STAFF_TOKEN` → 跳 `/casino-ops`（admin 全权限）。
2. 次入口：邮箱 + 密码 → `/api/login/start` → `/api/login/verify`（TOTP）。
3. 生产接 Okta OIDC（详见 §6.3 `INT-OKTA-001`）。

### 3.5.2 后台导航

| 区 | 视图 | 角色 |
|---|---|---|
| VIP Requests | `AdmissionCasePanel.tsx` + 列表 | host |
| Leader Approval | `LeaderApprovalPanel.tsx` | leader |
| Payment Operations | `PaymentOperationsPanel.tsx` + `TransactionStatus.tsx` | ops |
| Reconciliation | `operationsApi` + ops-ui | finance |
| Refund Queue | `RefundQueuePanel.tsx` | compliance / management / custodian |
| Deposit Queue | `DepositQueuePanel.tsx` | marketing / ops |
| Invitation Review | `InvitationReviewPanel.tsx`（legacy） | marketing |
| Staff Admin | `StaffAdminPanel.tsx` | admin |
| Hex Safe Live | `HexSafeLivePanel.tsx`（sandbox 实接） | custodian / ops |

### 3.5.3 四角色一键演示（demo only）

`/` 首页 `DemoHome.tsx` 顶部 4 张卡片：Host / Manager / HK Ops / VIP Patron。  
- 点击 → `/api/demo/enter` `{role: "<role>"}`（gated on `HT_DEMO_BYPASS_2FA` + 非 production）。
- 落点：host → VIP Requests；leader → Leader Approval；ops → Payment Operations；vip → 客户 Dashboard。

---

## 3.6 跨旅程失败处理总表

| 失败 | 触发场景 | 客户可见提示 | 系统动作 |
|---|---|---|---|
| Invitation expired | 6h / 15min TTL 过 | "Your invitation has expired. Please ask your Host to send a new one." | Host 收到 resend 提醒 |
| KYC failed | Sumsub review 拒绝 | 中性文案（不暴露原因） | Host 看到受限 `kycHostMessage` |
| Compliance review | 受限 KYT 结果 | "Your admission is under compliance review. We will contact you if more information is needed." | Compliance case |
| Wallet KYT fail | EDD / Fail | 阻止发址；Dashboard 显示"Action required" | Compliance case（urgent） |
| Travel Rule rejected | TR provider 拒绝 | 阻止发址；提示补充信息 | 入 TR manual_review |
| Sufficient Fund fail | staff 端 vault 余额不足 | 客户看不到；退款被 management reject | refund reject 留原因 |
| Address issuance fail | Hex Safe 调用失败 | "Address issuance failed, please try again or contact support" | staff 重试 / 联系 Hex Trust |
| TOTP enrollment timeout | 10min 未完成 | "Session expired, regenerate TOTP" | `/api/regenerate-totp` |

---

*最后更新：2026-08-28*