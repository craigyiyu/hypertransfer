# 04 — Functional Requirements, Business Rules, Permissions & Data Visibility

> 本章按 ID 前缀分模块：`REQ-AUTH-*` 认证 / `REQ-VIP-*` 客户 / `REQ-HOST-*` Host / `REQ-LEADER-*` Leader / `REQ-OPS-*` Operations / `REQ-INV-*` 邀请（兼容） / `REQ-REF-*` 退款 / `REQ-DEP-*` 入金 / `REQ-COMP-*` 合规 / `REQ-FMT-*` 展示 / `REQ-MOB-*` 移动端 / `REQ-NFR-*` 非功能。  
> 每条规则独立 ID：`RULE-*`；状态独立 ID：`STATUS-*`；权限独立 ID：`PERM-*`；可见性独立 ID：`VIS-*`。

---

## 4.1 认证 / 会话（`REQ-AUTH-*`）

### 需求

| ID | 描述 | 状态 | 实现位置 |
|---|---|---|---|
| REQ-AUTH-001 | 客户注册：手机号 + Email OTP（邀请制主入口）或手机短信 OTP（兼容） | **CURRENT** | `Register.tsx`、`Invite.tsx`；`server.py: /api/register/invite` |
| REQ-AUTH-002 | 客户登录：邮箱/手机 + 密码 → TOTP 两步 | **CURRENT** | `Login.tsx`、`Verify2FA.tsx`；`/api/login/start` + `/api/login/verify` |
| REQ-AUTH-003 | TOTP 标准 RFC 6238（SHA1/6 位/30 秒），兼容 GA / MS Authenticator | **CURRENT** | `lib/authFlow.ts`；`pyotp.TOTP` |
| REQ-AUTH-004 | 10 个一次性恢复码，sha256 存储 | **CURRENT** | `recovery_codes` 表 |
| REQ-AUTH-005 | 忘记密码：短信重置 + 失效全部 session | **CURRENT** | `/api/password/send-otp`、`/api/password/reset` |
| REQ-AUTH-006 | Session TTL 12h（bearer token，hash 存储），localStorage 持有 | **CURRENT** | `sessions` 表 |
| REQ-AUTH-007 | Challenge TTL 5min，TOTP enrollment TTL 10min | **CURRENT** | `challenges` 表 + `TOTP_ENROLL_TTL` |
| REQ-AUTH-008 | OTP 限频（60s/日上限/试错上限）+ 用后即焚 | **CURRENT** | `otps` / `email_otps` 表 + `send_otp` 逻辑 |
| REQ-AUTH-009 | staff 登录主入口 Okta SSO（demo 占位） | **CURRENT** | `StaffLogin.tsx`；`/api/demo/enter` |
| REQ-AUTH-010 | staff 登录次入口 邮箱 + 密码 + TOTP | **CURRENT** | `/api/login/start` + `/api/login/verify` |
| REQ-AUTH-011 | demo 旁路免 2FA（gated on `HT_DEMO_BYPASS_2FA` + 非 production） | **CURRENT** | `server.py` 中 `HT_DEMO_BYPASS_2FA` 检查 + `SUMSUB_ENVIRONMENT != "production"` |
| REQ-AUTH-012 | session 防重放：TOTP 已用过作废（窗口内禁止复用） | **CURRENT** | `TOTP_VALID_WINDOW` + replay check |
| REQ-AUTH-013 | Email OTP 6 位，自动填码（demo 自动，生产用户输入） | **CURRENT** | `autocomplete="one-time-code"` 在 OTP 输入框 |
| REQ-AUTH-014 | iOS Safari OTP 自动填充已实测确认（`http://<IP>` 也可）；iOS Chrome 不弹（已知浏览器差异，非代码问题） | **CURRENT** | `Register.tsx`、`ForgotPassword.tsx` |
| REQ-AUTH-015 | 2FA 启用 / 停用 / 重签 secret（保留 TOTP） | **CURRENT** | `/api/2fa/enable`、`/api/2fa/confirm`、`/api/2fa/disable` |
| REQ-AUTH-016 | Step-up 5min TTL，用于资金动作（发址 / 提现） | **CURRENT** | `/api/stepup/verify`、`STEPUP_TTL` |
| REQ-AUTH-017 | Production 真实 Okta OIDC + MFA policy | **PROPOSED** | 待客户决定 Okta 租户与 MFA 策略 |

> **REQAUTH-OPEN-001**：生产 Okta 租户 ID / Client ID / Client Secret、auth flow 类型（Auth Code + PKCE 或 Resource Owner）、MFA policy（Okta Verify / WebAuthn / Push）尚未配置。  
> **❓ 客户确认问题**：Okta 租户与上述参数由谁提供？要求 MFA 类型（推荐 FIDO2/WebAuthn）和 session 策略（绝对超时 / 滑动超时）。

### 规则

| ID | 描述 | 状态 |
|---|---|---|
| RULE-AUTH-001 | Email / phone 注册时，未注册邮箱的 `/api/password/send-otp` 也返回 ok（防枚举） | **CURRENT** |
| RULE-AUTH-002 | `/login/recovery` 消费恢复码即作废（大小写/横线归一化） | **CURRENT** |
| RULE-AUTH-003 | 邀请注册 `register_invite` 必须 token + email 双匹配，否则中性 400 | **CURRENT** |
| RULE-AUTH-004 | demo 便利（自动填码、跳过 2FA、邀请可重复跑）必须 gated on `HT_DEMO_BYPASS_2FA=true` AND `SUMSUB_ENVIRONMENT != "production"`；production 下即便 `HT_DEMO_BYPASS_2FA=true` 也强制真实校验 | **CURRENT** |
| RULE-AUTH-005 | session token 在 DB hash 存储；前端仅持有 bearer | **CURRENT** |
| RULE-AUTH-006 | TOTP enrollment 超时 → secret 不变，只刷新绑定会话（合规主流实践） | **CURRENT** |
| RULE-AUTH-007 | 资金动作（发址 / 提现 / 退款执行）必须 step-up 验证（5min TTL） | **CURRENT** |
| RULE-AUTH-008 | 客户邀请认领邮箱与原 invite email 不匹配 → 全部 session 410 作废 | **CURRENT** |
| RULE-AUTH-009 | 同案另一渠道认领 → 原 session 全作废 | **CURRENT** |
| RULE-AUTH-010 | production 必须把 `HT_ALLOWED_ORIGINS` 收窄到 `https://h5.hypercypto.com` | **CURRENT** |
| RULE-AUTH-011 | production 必须把 SMS 网关切到正式（非 `hv-test`） | **CURRENT** |
| RULE-AUTH-012 | `HT_LEADER_USER_ID` 未配置 → production 下 leader 决策 503 fail closed | **CURRENT** |
| RULE-AUTH-013 | demo Okta SSO 占位（`/api/demo/enter`）只在 `HT_DEMO_BYPASS_2FA=true` AND 非 production 下生效 | **CURRENT** |

---

## 4.2 Host（VIP admission 主持人）

### 需求

| ID | 描述 | 状态 | 实现位置 |
|---|---|---|---|
| REQ-HOST-001 | Host 激活（Okta 边界；未配 Okta 503 fail closed） | **CURRENT** | `/api/host/profile/activate` |
| REQ-HOST-002 | 创建 admission case（Member ID + 姓名 + Email） | **CURRENT** | `/api/admission-cases` |
| REQ-HOST-003 | 双通道邀请：Email（6h link）+ QR session（15min 动态） | **CURRENT** | `/api/admission-cases/{id}/invite/email`、`.qr-session` |
| REQ-HOST-004 | Host 跟进：Remind / Resend / Revoke / View timeline | **CURRENT** | `/api/admission-cases/{id}/remind`、`.invite/email`、`.revoke` |
| REQ-HOST-005 | Host case 视图聚合：到账 / Cage / Reconciliation + timeline | **CURRENT** | `AdmissionCasePanel.tsx` |
| REQ-HOST-006 | Host 仅见受限 KYC 原因（`kycHostMessage`），绝无证件号 / 原始 detail | **CURRENT** | `apps/web/src/lib/admission-case.ts` |
| REQ-HOST-007 | Host note 落库并给 leader dossier 可见 | **CURRENT** | `admission_cases.details_json.hostNote` |
| REQ-HOST-008 | Host 自助注册：邮箱 + TOTP（`/staff-onboard`） | **CURRENT** | `/api/staff/onboarding/start` |

### 规则

| ID | 描述 | 状态 |
|---|---|---|
| RULE-HOST-001 | Member ID 字段白标，禁止用 `Win ID` 等客户真实字段 | **CURRENT** |
| RULE-HOST-002 | 邀请链接 TTL = 6h（`INVITE_TTL`）；QR session TTL = 15min | **CURRENT** |
| RULE-HOST-003 | Resend 重置邀请 TTL；过期可重复触发 | **CURRENT** |
| RULE-HOST-004 | Revoke 后同邮箱不可再用同一案（需 Host 新建案） | **CURRENT** |
| RULE-HOST-005 | Host note 与 Host note 输入字段仅 Host / Leader 可见 | **CURRENT** |
| RULE-HOST-006 | Host case 列表按两段分：待处理 / 已生效；待处理包括 `Pending Approval`、`KYC Action Required`、`Invitation Expired`、`Invitation Open` | **CURRENT** |
| RULE-HOST-007 | 已完成状态（`service_enabled`、`kyc_passed`）不作为当前状态标签，仅列表呈现 | **CURRENT** |
| RULE-HOST-008 | KYC `valid_until = min(通过日 + 6 个日历月, 最早证件到期日)`；日历月算法 | **CURRENT** |

---

## 4.3 Leader / Manager（单一审批人）

### 需求

| ID | 描述 | 状态 | 实现位置 |
|---|---|---|---|
| REQ-LEADER-001 | Leader 仅由 `HT_LEADER_USER_ID` 白名单 / `leader` 角色访问 | **CURRENT** | `/api/leader/admission-cases` |
| REQ-LEADER-002 | Leader 决策 approve（→ service_enabled）/ reject（→ rejected，必填业务原因） | **CURRENT** | `/api/admission-cases/{id}/leader-decision` |
| REQ-LEADER-003 | Leader 决策写 audit + 邮件通知 Host + VIP | **CURRENT** | `audit_trail`、`send_email` |
| REQ-LEADER-004 | Leader dossier 含 Host note + KYC 状态（受限） | **CURRENT** | `apps/web/src/lib/leader-approval.ts` |

### 规则

| ID | 描述 | 状态 |
|---|---|---|
| RULE-LEADER-001 | approve 后 VIP 自动进入 Service Enabled，触发 Step 1/Step 2 引导 | **CURRENT** |
| RULE-LEADER-002 | reject 业务原因必填，存 `leader_decisions.reason` | **CURRENT** |
| RULE-LEADER-003 | 决策后 VIP 与 Host 都收到邮件，含状态解释 | **CURRENT** |
| RULE-LEADER-004 | production 未配 `HT_LEADER_USER_ID` → 503 fail closed | **CURRENT** |
| RULE-LEADER-005 | Host / Compliance / Marketing / Admin **不得**决策 | **CURRENT** |
| RULE-LEADER-006 | Leader 可查看 Host note 与受限 KYC 原因 | **CURRENT** |

### 权限

| ID | 描述 | 状态 |
|---|---|---|
| PERM-LEADER-001 | role=leader OR user_id in `HT_LEADER_USER_ID` | **CURRENT** |
| PERM-LEADER-002 | 仅可读 Host case 子集 + 自助 invite 队列 | **CURRENT** |

---

## 4.4 Operations（HK Ops + Finance + Compliance）

### 需求

| ID | 描述 | 状态 | 实现位置 |
|---|---|---|---|
| REQ-OPS-001 | 创建 payment intent（每 admission case → verification + main leg） | **CURRENT** | `/api/payment-intents` |
| REQ-OPS-002 | Source classification（来源钱包分类） | **CURRENT** | `/api/payment-intents/{id}/source-classification` |
| REQ-OPS-003 | Actual confirmation（记录链上到账指纹） | **CURRENT** | `/api/payment-intents/{id}/actual-confirmation` |
| REQ-OPS-004 | 创建 Transaction Compliance Pack（每笔转账独立不可变） | **CURRENT** | `/api/payment-intents/{id}/compliance-packs` |
| REQ-OPS-005 | Pack screen（KYT，Hex Safe API / 第三方 fallback） | **CURRENT** | `/api/transaction-compliance-packs/{id}/screen` |
| REQ-OPS-006 | Pack issue-address（KYT + TR 双闸门） | **CURRENT** | `/api/transaction-compliance-packs/{id}/issue-address` |
| REQ-OPS-007 | Pack record-transfer（实际到账 → final） | **CURRENT** | `/api/transaction-compliance-packs/{id}/record-transfer` |
| REQ-OPS-008 | Cage confirmation 录入（HK Ops 手录） | **CURRENT** | `/api/transaction-compliance-packs/{id}/cage-confirmation` |
| REQ-OPS-009 | Finance reconciliation 录入 / 导出 | **CURRENT** | `/api/transaction-compliance-packs/{id}/reconcile`、`/api/operations/reconciliation-export` |
| REQ-OPS-010 | 监控与异常标记（demo） | **CURRENT** | `/api/operations/run-monitoring`、`/api/operations/monitoring-flags` |

### 规则

| ID | 描述 | 状态 |
|---|---|---|
| RULE-OPS-001 | Transaction Compliance Pack 在实际确认指纹变更时作废旧 pack、强制重验、阻发地址 | **CURRENT** |
| RULE-OPS-002 | HKD 8,000 仅切换 basic/enhanced 字段深度，不豁免 pack | **CURRENT** |
| RULE-OPS-003 | 旧 deposit 仍保留 `marker` 字段作为兼容（legacy marker ref 仍可查询） | **CURRENT** |
| RULE-OPS-004 | Reconciliation retention ≥5 年 | **CURRENT** |
| RULE-OPS-005 | Cage confirmation 可由 ops / custodian / compliance / admin 角色录入（v1.1 起含 admin；`require_role(*_operations_roles())`） | **CONFIRMED** |
| RULE-OPS-006 | Reconciliation 必须由 finance role 录入 | **CURRENT** |
| RULE-OPS-007 | demo 监控标记关联转账给 Compliance | **CURRENT** |
| RULE-OPS-008 | 生产 Sumsub / Notabene / Hex Safe 任一缺配置 → 503 fail closed（不静默 demo） | **CURRENT** |

### v1.1 新增 / 升级需求（**全部 CONFIRMED**，落地 2026-09-01，见 `00-decisions.md`）

| ID | 描述 | 状态 | 关联 Q |
| |---|---|---|---|
| REQ-VIP-DEP-011 | New Deposit 选 originating wallet picker（历史 transfer 来源钱包） | **CONFIRMED** | Q5 |
| REQ-VIP-DEP-012 | KYT 缓存 6h TTL（< 6h 直接 assign HexTrust；≥ 6h 后台重发起 KYT） | **CONFIRMED** | Q5 |
| REQ-DEP-013 | Wallet KYT 走 Sumsub（替代 Hex Safe API；mock 默认） | **CONFIRMED** | Q2 |
| REQ-DEP-014 | 入金 Main Transfer 完成 → Admin 收邮件通知 | **CONFIRMED** | Q3 |
| REQ-OPS-CAGE-002 | Cage confirmation 由 ops / custodian / compliance / admin 录（v1.1 增 admin） | **CONFIRMED** | Q4 |
| REQ-DEP-015 | New Deposit 网络选择仅一个 rail（默认 USDT ERC-20；USDC 也用 ethereum） | **CONFIRMED** | Q7 |
| REQ-DEP-016 | 假设所有入金都触发 Travel Rule（v1.0 = 仅 ≥ HKD 8,000 触发） | **CONFIRMED** | Q1 / Q8 |
| REQ-VIP-REF-005 | Refund 改为占位 "under development"（v1.0 = 完整流程；backend 保留） | **CONFIRMED** | Q6 |

### 权限

| ID | 描述 | 状态 |
|---|---|---|
| PERM-OPS-001 | role in [ops, finance, compliance, custodian] 可访问 `/casino-ops` Payment Operations 区 | **CURRENT** |
| PERM-OPS-002 | role=custodian 可执行 refund execute + 发址（Hex Safe 真实） | **CURRENT** |
| PERM-OPS-003 | role=marketing 可录 marker | **CURRENT** |
| PERM-OPS-004 | role=admin 可创建 staff | **CURRENT** |

---

## 4.5 客户入金 / 退款（`REQ-DEP-*`、`REQ-REF-*`）

### 需求

| ID | 描述 | 状态 | 实现位置 |
|---|---|---|---|
| REQ-DEP-001 | 客户创建入金（资产 / 网络 / 金额） | **CURRENT** | `/api/deposits` |
| REQ-DEP-002 | KYC 硬阻断（`accountState: active|hold`） | **CURRENT** | `/api/deposits/eligibility` + `user_kyc_ok(user_id)` |
| REQ-DEP-003 | 来源钱包 KYT（Pass / EDD / Fail） | **CURRENT** | `/api/deposits/{id}/screen` |
| REQ-DEP-004 | Travel Rule（USD ≥ 1,000 触发） | **CURRENT** | `lib/compliance.ts requiresTravelRule` + Sumsub TR |
| REQ-DEP-005 | 三闸门（KYC + KYT pass + TR gate）通过 → 发址 | **CURRENT** | `/api/deposits/{id}/issue-address` |
| REQ-DEP-006 | Step 1 验证款 1 USDT → 写 `verified_wallets` | **CURRENT** | `/api/deposits/{id}/confirm-test` |
| REQ-DEP-007 | Step 2 主入金（按实际到账合计 + 全额容错） | **CURRENT** | `/api/deposits/{id}/main` |
| REQ-DEP-008 | 录 marker reference → settled（前台展示 `Settled · <marker ref>`） | **CURRENT** | `/api/deposits/{id}/marker`、`.settle` |
| REQ-DEP-009 | 费用模型：gas 由客户承担 + 汇率（HKD 估值，demo）+ 区块浏览器链接 | **CURRENT** | `lib/currency.ts DEPOSIT_FEE_MODEL` + `blockExplorerTxUrl` |
| REQ-DEP-010 | 入金三态展示：`Pending` / `Deposit Completed` / `Settled` | **CURRENT** | `History.tsx` |
| REQ-REF-001 | 客户退款：选 verified wallet → 自由金额 → 可选原因 | **CURRENT** | `/api/refunds` + `RefundProcess.tsx` |
| REQ-REF-002 | walletId 必属本人 `verified_wallets`（否则 400） | **CURRENT** | `refund_create` 后端校验 |
| REQ-REF-003 | 退款三段：compliance screen → management approve → custodian execute | **CURRENT** | `/api/refunds/{rid}/screen`、`.approve`、`.execute` |
| REQ-REF-004 | 客户 Dashboard 入口（KYC approved + 有 verified wallet 才可点） | **CURRENT** | `Dashboard.tsx` |

### 规则

| ID | 描述 | 状态 |
|---|---|---|
| RULE-DEP-001 | KYC 闸门仅在 KYC approved 且 `valid_until` 未过期 | **CURRENT** |
| RULE-DEP-002 | EDD / Fail 路径不发址 | **CURRENT** |
| RULE-DEP-003 | Travel Rule rejected → 阻止发址，TR manual_review 提示补充 | **CURRENT** |
| RULE-DEP-004 | Phase 1 仅 `USDT on ERC-20/TRC-20` + `USDC on ERC-20`；BTC / ETH 不处理 | **CURRENT** |
| RULE-DEP-005 | 链上确认数按链定义：EVM 5、Tron 4 | **CURRENT** |
| RULE-DEP-006 | `estimatedReceived = deposit − gas`（demo `networkGasFeeUsdt: 0.03`） | **CURRENT** |
| RULE-DEP-007 | 全额容错：直接打全额到 1 USDT 验证地址 → `handleFullAmountDetected` 兜住 | **CURRENT** |
| RULE-DEP-008 | Settlement Journey：`Verification → Main Transfer → Cage → Reconciled` | **CURRENT** |
| RULE-DEP-009 | txHash 仅代表链上凭证，不等于 marker 已入账 | **CURRENT** |
| RULE-REF-001 | 退款金额不绑定入金额，客户端不设上限 | **CURRENT** |
| RULE-REF-002 | vault 余额校验 / 管理层审批在 staff 端兜底（非应用内自动查） | **CURRENT** |
| RULE-REF-003 | 退款执行走真实 Hex Safe withdrawal（未配置 → demo 占位；production 未配 503） | **CURRENT** |
| RULE-REF-004 | Refund 三大闸门标注 provider（KYC·Sumsub 6-mo / Wallet KYT·Hex Safe API / Sufficient funds·人工 Hex Trust 后台） | **CURRENT** |

### 权限 / 可见性

| ID | 描述 | 状态 |
|---|---|---|
| PERM-DEP-001 | 客户仅见自己的 deposit + marker ref | **CURRENT** |
| PERM-DEP-002 | staff 按角色分别见 queue / marker / settlement | **CURRENT** |
| VIS-DEP-001 | 客户端不得看到内部审批 / Vault / Hex Safe / 风控细节 | **CURRENT** |
| VIS-DEP-002 | staff dashboard 与客户 dashboard 分区，staff 不得从客户入口导航 | **CURRENT** |
| VIS-REF-001 | 客户仅见自己退款的进度（队列阶段） | **CURRENT** |

---

## 4.6 合规（KYC / KYT / Travel Rule）

### 需求

| ID | 描述 | 状态 | 实现位置 |
|---|---|---|---|
| REQ-COMP-001 | KYC = Sumsub API 自动核验；有效期 6 个日历月 | **CURRENT** | `/api/sumsub/kyc/start`、`.status`、`.demo-approve` |
| REQ-COMP-002 | KYC 表单收敛（按 level 必填：姓名 / 出生日期 / 国籍 / 电话 + 同意） | **CURRENT** | `KYC.tsx` |
| REQ-COMP-003 | Wallet KYT = Hex Safe API（sandbox 已通，无文档化端点 → 暂回落 `screen_source_wallet` mock） | **CURRENT** | `/api/transaction-compliance-packs/{id}/screen`、`/api/deposits/{id}/screen` |
| REQ-COMP-004 | Travel Rule = Sumsub TR provider（提交 / 接受 / 拒绝 / manual_review） | **CURRENT** | `/api/sumsub/travel-rule/submit` |
| REQ-COMP-005 | Travel Rule 阈值 USD 1,000 ≈ HKD 8,000（按资产 1:1 USD 判定） | **CURRENT** | `lib/compliance.ts TRAVEL_RULE_THRESHOLD_USD` |
| REQ-COMP-006 | Sufficient Fund in Vault = 人工 Hex Trust 后台（非应用内自动查） | **CURRENT** | 流程口径，UI 文案标注 |

### 规则

| ID | 描述 | 状态 |
|---|---|---|
| RULE-COMP-001 | KYC 闸门硬阻断：未通过或 6 月过期 → 阻止发址 / 退款 / Step 1 | **CURRENT** |
| RULE-COMP-002 | KYC 受限结果走 `compliance_review` 中性文案（Host 仅见受限原因分类） | **CURRENT** |
| RULE-COMP-003 | `valid_until = min(通过日 + 6 月, 最早证件到期日)`；日历月算法 | **CURRENT** |
| RULE-COMP-004 | TR 阈值按 USDT/USDC 1:1 USD 判定（HKD 8,000 ≈ USD 1,000） | **CURRENT** |
| RULE-COMP-005 | TR 缺 provider → production 503 fail closed（demo 占位可跑） | **CURRENT** |
| RULE-COMP-006 | Wallet KYT 缺 provider → production 503 fail closed | **CURRENT** |
| RULE-COMP-007 | 客户不得看到具体 KYT 风险分 / hop count / sanctioned hit；仅中性结果（Pass / EDD / Fail） | **CURRENT** |
| RULE-COMP-008 | 每笔转账独立 Transaction Compliance Pack（含 basic/enhanced 字段；HKD 8,000 切换深度） | **CURRENT** |
| RULE-COMP-009 | Pack 实际确认指纹变更 → 强制重验、阻发地址 | **CURRENT** |
| RULE-COMP-010 | Compliance Case 优先：blocked / funds_dirty = urgent；EDD = high；manual_review = normal | **CURRENT** |

---

## 4.7 邀请（兼容模式 + admission 邀请）

### 需求

| ID | 描述 | 状态 | 实现位置 |
|---|---|---|---|
| REQ-INV-001 | RM 提交邀请（Member ID + 姓名 + Email） | **CURRENT** | `/api/invitations` |
| REQ-INV-002 | Marketing 审批（approve / reject；reject 必填原因） | **CURRENT** | `/api/invitations/{id}/approve`、`.reject` |
| REQ-INV-003 | Approve 自动签发 6h TTL token | **CURRENT** | `INVITE_TTL` |
| REQ-INV-004 | RM 交付卡：邀请链接 + 二维码 + 时效状态 | **CURRENT** | `InvitationReviewPanel.tsx` |
| REQ-INV-005 | RM resubmit | **CURRENT** | `/api/invitations/{id}/resubmit` |
| REQ-INV-006 | 邀请可重复跑（demo，gated on `HT_DEMO_BYPASS_2FA`） | **CURRENT** | `register_invite` + `invitation_is_redeemable` demo 放宽 |
| REQ-INV-007 | 双通道邀请（Email link 6h + QR session 15min）— Host 案 | **CURRENT** | `/api/admission-cases/{id}/invite/email`、`.qr-session` |

### 规则

| ID | 描述 | 状态 |
|---|---|---|
| RULE-INV-001 | 邀请审批三态 `submitted / approved / rejected`（去除 `issued`，approve 即签发） | **CURRENT** |
| RULE-INV-002 | Reject 必填原因，存 `details_json.rejectReason` | **CURRENT** |
| RULE-INV-003 | 过期可 resend，重置 TTL | **CURRENT** |
| RULE-INV-004 | 邀请 token 一次性，已认领不可复用 | **CURRENT** |
| RULE-INV-005 | 同案另一渠道认领 → 全部 session 410 | **CURRENT** |
| RULE-INV-006 | Member ID 白标字段，禁止 "Win ID" 等客户真实字段 | **CURRENT** |

---

## 4.8 员工管理 / Onboarding（`REQ-STAFF-*`）

### 需求

| ID | 描述 | 状态 | 实现位置 |
|---|---|---|---|
| REQ-STAFF-001 | 公司邮箱自助注册（host/leader/ops 三角色） | **CURRENT** | `/api/staff/onboarding/start` |
| REQ-STAFF-002 | TOTP 激活（绑定 QR） | **CURRENT** | `/api/2fa/enable`、`.confirm` |
| REQ-STAFF-003 | Admin 创建员工（返回 TOTP 绑定 QR） | **CURRENT** | `/api/admin/staff` |
| REQ-STAFF-004 | Okta 绑定 demo 占位（生产 503 fail closed） | **CURRENT** | `/api/staff/okta/link` |
| REQ-STAFF-005 | Staff 登录 Okta SSO（demo 占位） | **CURRENT** | `/api/demo/enter` + StaffLogin |

### 规则

| ID | 描述 | 状态 |
|---|---|---|
| RULE-STAFF-001 | 公司邮箱必须属于允许的邮件域（生产需客户提供白名单） | **OPEN** |
| RULE-STAFF-002 | TOTP 绑定后必须引导至对应工作台 | **CURRENT** |
| RULE-STAFF-003 | demo staff 全部权限（admin）；生产按 RBAC 收紧 | **PROPOSED** |

> **REQAUTH-OPEN-002 / RULE-OPEN-001**：staff 公司邮箱白名单尚未与客户对齐。  
> **❓ 客户确认问题**：staff 邮箱域名白名单（建议 `heypervelocity.com` / `hypercrypto.com` / 客户域名）？

---

## 4.9 展示与移动端（`REQ-FMT-*`、`REQ-MOB-*`）

### 需求

| ID | 描述 | 状态 |
|---|---|---|
| REQ-FMT-001 | 金额 / 数量 / 统计数据千分位格式 | **CURRENT** |
| REQ-FMT-002 | 验证码 / ID / 钱包地址保持原样，不格式化 | **CURRENT** |
| REQ-FMT-003 | 标签 tone：`success / warning / danger / neutral` | **CURRENT** |
| REQ-MOB-001 | 移动端 mobile-first，所有客户页面适配 ≤393px 宽 | **CURRENT** |
| REQ-MOB-002 | 全高容器使用 `100svh`，禁止 `100dvh`（软键盘抖动） | **CURRENT** |
| REQ-MOB-003 | iOS Safari OTP 自动填充已实测；iOS Chrome 不弹（已知差异） | **CURRENT** |
| REQ-MOB-004 | Secure context（HTTPS）能力：WebAuthn / 剪贴板 / SW / 地理位置 / SMS autofill in `http://<IP>` 不可用 | **CURRENT** |

### 规则

| ID | 描述 | 状态 |
|---|---|---|
| RULE-FMT-001 | 客户面语言：英文为主（zh/en 切换由 `LanguageSwitcher`） | **CURRENT** |
| RULE-MOB-001 | 不在 `http://<IP>` 下承诺 secure-context-only 能力 | **CURRENT** |

---

## 4.10 RBAC 角色矩阵（`PERM-*`）

| 资源 / 角色 | host | leader | ops | finance | compliance | custodian | marketing | admin | vip |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/api/admission-cases`（建/查） | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | own |
| `/api/admission-cases/{id}/invite/*` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `/api/leader/admission-cases` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/api/admission-cases/{id}/leader-decision` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/api/payment-intents*` | view | view | ✅ | view | view | view | ❌ | ✅ | ❌ |
| `/api/transaction-compliance-packs/{id}/cage-confirmation` | view | view | ✅ | view | view | view | ❌ | ✅ | ❌ |
| `/api/transaction-compliance-packs/{id}/reconcile` | view | view | view | ✅ | view | view | ❌ | ✅ | ❌ |
| `/api/refunds/{rid}/screen` | view | view | view | view | ✅ | view | ❌ | ✅ | ❌ |
| `/api/refunds/{rid}/approve` | view | view | view | view | view | ❌ | ✅ | ✅ | ❌ |
| `/api/refunds/{rid}/execute` | view | view | view | view | view | ✅ | ❌ | ✅ | ❌ |
| `/api/deposits/{id}/marker` | view | view | ✅ | view | view | ❌ | ✅ | ✅ | ❌ |
| `/api/deposits/{id}/settle` | view | view | view | ✅ | view | view | ❌ | ✅ | ❌ |
| `/api/hexsafe/*` | ❌ | ❌ | view | view | view | ✅ | ❌ | ✅ | ❌ |
| `/api/invitations*` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | own |
| `/api/admin/staff` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 4.11 数据可见性（`VIS-*`）

| ID | 描述 | 状态 |
|---|---|---|
| VIS-VIP-001 | VIP 只见自己的 admission case + 自己的 deposit + 自己的 refund | **CURRENT** |
| VIS-VIP-002 | VIP 不见 Host note / KYC 原始 detail / leader reason 全文 | **CURRENT** |
| VIS-VIP-003 | VIP 钱包地址不脱敏显示（标识符） | **CURRENT** |
| VIS-VIP-004 | VIP 邮件脱敏展示（`v***@example.com`）— 给 Host / Leader / Ops 看 | **CURRENT** |
| VIS-HOST-001 | Host 仅见自己建的 admission case（`/api/admission-cases/mine`） | **CURRENT** |
| VIS-HOST-002 | Host 见受限 KYC 原因（`kycHostMessage`） + `kycValidUntil` | **CURRENT** |
| VIS-LEADER-001 | Leader 见全部 admission case（受限）+ Host note + KYC 状态 | **CURRENT** |
| VIS-OPS-001 | Operations 见对应 role 的 payment / pack / cage / reconcile | **CURRENT** |
| VIS-COMPLIANCE-001 | Compliance 见 KYT 详细结果 + pack screen / reject 流程 | **CURRENT** |
| VIS-FINANCE-001 | Finance 见 reconciliation 报告（含 retention ≥5 年） | **CURRENT** |
| VIS-AUDIT-001 | Audit trail 由 admin / compliance 可读；VIP / Host 不可见 | **CURRENT** |

---

*最后更新：2026-08-28*