# 08 — AI-Developable Modules & Roadmap

> 本章列出 AI 可独立开发的模块、按依赖顺序排列的开发路线图、以及每个模块的输入/输出/约束。  
> AI 仅可开发 `CONFIRMED` 模块；任何 `OPEN` / `PROPOSED` 模块必须先经人工确认。

---

## 8.1 AI 开发硬规则（再次强调）

1. **只能开发 CONFIRMED 项**。详见 `00-index.md` §0.3。
2. **修改业务规则前必读**：`CLAUDE.md` §4 + `ProjectInfo/design.md` + 本 PRD `04-functional-requirements.md`。
3. **禁止触碰**：
   - 真实密钥 / 凭据（`SUMSUB_*`、`HT_LEADER_USER_ID`、`HT_ADMIN_*`、Hex Safe `x-api-key`、Okta `*`）。
   - 真实客户身份资料、证件信息、wallet 实控人。
   - 破坏性数据库迁移（删表、改主键、`HT_DB_PATH` 跨卷迁移）。
   - 资金控制端点（`/api/hexsafe/*`、`/api/refunds/{rid}/execute`、`/api/deposits/{id}/issue-address`）。
   - RBAC 角色矩阵调整（必须人工）。
   - 监管规则修改（FATF AMLO、KYT 决策树、Travel Rule 阈值/字段）。
4. **每次 PR 必须同步**：`AGENTS.md` Release Notes + 相关文档。
5. **AI 出包后必跑**：根目录 `npm run typecheck` + `npm run build` + `npm test --workspace=web`。

---

## 8.2 模块清单（按依赖排序）

### 阶段 A：基础设施 / 可观测性（高 AI 自主度）

| ID | 模块 | 输入 | 输出 | 约束 / 依赖 | 状态 | 建议优先级 |
|---|---|---|---|---|---|---|
| MOD-INFRA-001 | 统一错误响应中间件 | HTTPException handler | 结构化 JSON 错误体（保留现有） | 当前已实装（`server.py`） | **CURRENT** | 维护 |
| MOD-INFRA-002 | 结构化 JSON logger | log call sites | JSON 行日志 + trace id | 新增 | **PROPOSED** | P1 |
| MOD-INFRA-003 | Request trace id 中间件 | middleware | 全链路 X-Request-Id | 新增 | **PROPOSED** | P1 |
| MOD-INFRA-004 | `/api/health` 深度健康检查 | 现有 `/api/health` | DB / 外部 provider 状态 | 新增 | **OPEN** | P2 |

> **❓ 客户确认问题**：是否引入 OTel？trace 是否要对接第三方（Sentry / Datadog）？

### 阶段 B：前端展示与样式（高 AI 自主度）

| ID | 模块 | 输入 | 输出 | 约束 / 依赖 | 状态 | 优先级 |
|---|---|---|---|---|---|---|
| MOD-UI-001 | Admission Journey 组件收敛 | `apps/web/src/lib/admission-journey.ts` | Dashboard 一致旅程视图 | 已实装 | **CURRENT** | 维护 |
| MOD-UI-002 | 列表状态标签统一 | §5.1.4 | 列表项展示 | 已实装 | **CURRENT** | 维护 |
| MOD-UI-003 | i18n 字典扩展（zh/en） | `apps/web/src/lib/translations.ts` | 全部页面双语 | 已实装 | **CURRENT** | 维护 |
| MOD-UI-004 | 错误 / 加载 / 空态统一 | EmptyState 等 | 全部页面 | 已实装 | **CURRENT** | 维护 |
| MOD-UI-005 | 移动端适配 QA 列表 | 现有页面 | `<=393px` 兼容清单 | 已实装 | **CURRENT** | 维护 |
| MOD-UI-006 | 千分位统一封装 | `lib/currency.ts` | 金额 / 数量 / 统计 | 已实装 | **CURRENT** | 维护 |
| MOD-UI-007 | 暗 / 亮主题切换 | `ThemeToggle.tsx` | 全站 token | 已实装 | **CURRENT** | 维护 |

### 阶段 C：客户面业务（中等 AI 自主度）

| ID | 模块 | 输入 | 输出 | 约束 / 依赖 | 状态 | 优先级 |
|---|---|---|---|---|---|---|
| MOD-CLIENT-001 | 邀请落地页 + Email OTP 注册 | `apps/web/src/views/Invite.tsx`、`Register.tsx` | `/invite` + `/api/register/invite` | RULE-AUTH-003/008 | **CURRENT** | 维护 |
| MOD-CLIENT-002 | TOTP 绑定 + 恢复码 | `Setup2FA.tsx` | `/api/confirm-totp` + 10 个恢复码 | RULE-AUTH-005 | **CURRENT** | 维护 |
| MOD-CLIENT-003 | KYC 表单 + Status | `KYC.tsx` + `KYCStatus.tsx` | `/api/sumsub/kyc/*` | RULE-COMP-001/002 | **CURRENT** | 维护 |
| MOD-CLIENT-004 | Dashboard + Journey | `Dashboard.tsx` + `AdmissionJourney.tsx` | §5.2 / §5.3 | 已实装 | **CURRENT** | 维护 |
| MOD-CLIENT-005 | New Deposit（资产 / 网络 / 金额） | `NewDeposit.tsx` | `/api/deposits` | RULE-DEP-004 | **CURRENT** | 维护 |
| MOD-CLIENT-006 | Wallet Screening | `WalletScreening.tsx` | `/api/deposits/{id}/screen` | RULE-DEP-002 | **CURRENT** | 维护 |
| MOD-CLIENT-007 | Travel Rule | `TravelRule.tsx` | `/api/sumsub/travel-rule/submit` | RULE-COMP-004 | **CURRENT** | 维护 |
| MOD-CLIENT-008 | Deposit Address | `DepositAddress.tsx` | `/api/deposits/{id}/issue-address` | RULE-DEP-002 | **CURRENT** | 维护 |
| MOD-CLIENT-009 | Main Deposit（Step 1/Step 2 + 全额容错） | `MainDeposit.tsx` | `/api/deposits/{id}/main` | RULE-DEP-007 | **CURRENT** | 维护 |
| MOD-CLIENT-010 | Deposit Success + txHash | `DepositSuccess.tsx` | 浏览器链接 | RULE-DEP-009 | **CURRENT** | 维护 |
| MOD-CLIENT-011 | Refund（verified wallet picker） | `RefundProcess.tsx` | `/api/refunds` | RULE-REF-001/002 | **CURRENT** | 维护 |
| MOD-CLIENT-012 | History（三态展示） | `History.tsx` | §5.4.2 | 已实装 | **CURRENT** | 维护 |
| MOD-CLIENT-013 | Settings（profile + 2FA） | `Settings.tsx` | `/api/2fa/*` | RULE-AUTH-015 | **CURRENT** | 维护 |
| MOD-CLIENT-014 | Support | `Support.tsx` | 联系方式 | 已实装 | **CURRENT** | 维护 |
| MOD-CLIENT-015 | 错误边界 + SessionRecovery | `ErrorBoundary.tsx` + `SessionRecovery.tsx` | 失败兜底 | 已实装 | **CURRENT** | 维护 |

### 阶段 D：Staff 内部后台（中等 AI 自主度，部分需 CONFIRMED）

| ID | 模块 | 输入 | 输出 | 约束 / 依赖 | 状态 | 优先级 |
|---|---|---|---|---|---|---|
| MOD-STAFF-001 | Staff Login（Okta demo） | `StaffLogin.tsx` | `/api/demo/enter` | RULE-AUTH-009 | **CURRENT** | 维护 |
| MOD-STAFF-002 | Staff Onboarding | `StaffOnboarding.tsx` | `/api/staff/onboarding/start` | RULE-STAFF-001 | **CURRENT** | 维护 |
| MOD-STAFF-003 | VIP Requests（Host 案列表） | `AdmissionCasePanel.tsx` | `/api/admission-cases/mine` | RULE-HOST-006/007 | **CURRENT** | 维护 |
| MOD-STAFF-004 | Create Case + 双通道邀请 | 同上 | `/api/admission-cases` + invite/email + invite/qr-session | RULE-INV-005/006 | **CURRENT** | 维护 |
| MOD-STAFF-005 | Leader Approval | `LeaderApprovalPanel.tsx` | `/api/leader/admission-cases` + leader-decision | RULE-LEADER-* | **CURRENT** | 维护 |
| MOD-STAFF-006 | Payment Operations | `PaymentOperationsPanel.tsx` | `/api/payment-intents/*` + `/api/transaction-compliance-packs/*` | RULE-OPS-* | **CURRENT** | 维护 |
| MOD-STAFF-007 | Cage Confirmation | 同上 | `/api/transaction-compliance-packs/{id}/cage-confirmation` | RULE-OPS-005 | **CURRENT** | 维护 |
| MOD-STAFF-008 | Finance Reconciliation | 同上 | `/api/transaction-compliance-packs/{id}/reconcile` | RULE-OPS-006 | **CURRENT** | 维护 |
| MOD-STAFF-009 | Reconciliation Export | `operationsApi` | `/api/operations/reconciliation-export` | RULE-OPS-004 | **CURRENT** | 维护 |
| MOD-STAFF-010 | Refund Queue | `RefundQueuePanel.tsx` | `/api/refunds*` | RULE-REF-003 | **CURRENT** | 维护 |
| MOD-STAFF-011 | Deposit Queue | `DepositQueuePanel.tsx` | `/api/deposits` | 已实装 | **CURRENT** | 维护 |
| MOD-STAFF-012 | Invitation Review（legacy） | `InvitationReviewPanel.tsx` | `/api/invitations*` | RULE-INV-* | **CURRENT** | 维护 |
| MOD-STAFF-013 | Staff Admin | `StaffAdminPanel.tsx` | `/api/admin/staff` | PERM-DEP-004 | **CURRENT** | 维护 |
| MOD-STAFF-014 | Hex Safe Live | `HexSafeLivePanel.tsx` | `/api/hexsafe/*`（sandbox） | INT-CUST-001 | **CURRENT** | 维护 |
| MOD-STAFF-015 | Monitoring Flag | `operationsApi` | `/api/operations/monitoring-flags` | RULE-OPS-007 | **CURRENT** | 维护 |
| MOD-STAFF-016 | Okta 绑定 demo 占位 | `/api/staff/okta/link` | 503 in production | RULE-AUTH-009 | **CURRENT** | 维护 |

### 阶段 E：Demo 与可重复演示（仅非 production）

| ID | 模块 | 输入 | 输出 | 约束 | 状态 | 优先级 |
|---|---|---|---|---|---|---|
| MOD-DEMO-001 | Demo Home Hub（4 角色入口） | `DemoHome.tsx` | `/api/demo/enter` | RULE-AUTH-004/011 | **CURRENT** | 维护 |
| MOD-DEMO-002 | 自动填码（OTP / TOTP） | `Register.tsx`、`Verify2FA.tsx` 等 | demo 自动 | RULE-AUTH-004/011 | **CURRENT** | 维护 |
| MOD-DEMO-003 | 邀请可重复跑 | `register_invite` + `invitation_is_redeemable` | demo 放宽 | RULE-AUTH-004/011 | **CURRENT** | 维护 |
| MOD-DEMO-004 | 入金 skip & continue | `NewDeposit.tsx` + `DepositAddress.tsx` | 后端驱动条件 | RULE-AUTH-004/011 | **CURRENT** | 维护 |
| MOD-DEMO-005 | seed_demo.py | `hypertransfer-main/backend/seed_demo.py` | 幂等 seed | 已实装 | **CURRENT** | 维护 |

### 阶段 F：合规闸门 / KYC / KYT / Travel Rule（受监管约束）

| ID | 模块 | 输入 | 输出 | 约束 | 状态 | 优先级 |
|---|---|---|---|---|---|---|
| MOD-COMP-001 | Sumsub KYC API-only demo | `/api/sumsub/kyc/*` | applicant / status / demo-approve | INT-KYC-001 | **CURRENT** | 维护 |
| MOD-COMP-002 | Sumsub WebSDK access-token（保留） | `/api/sumsub/access-token` | 短期 token | INT-KYC-002 | **CURRENT** | 维护 |
| MOD-COMP-003 | Sumsub Travel Rule | `/api/sumsub/travel-rule/*` | submit / transactions | INT-TR-001 | **CURRENT** | 维护 |
| MOD-COMP-004 | Notabene adapter（fallback） | `notabene_adapter.py` | TR submit / get | INT-TR-002 | **CURRENT** | 维护 |
| MOD-COMP-005 | Wallet KYT（mock → 第三方） | `screen_source_wallet` | KYT result | INT-KYT-001/002 | **OPEN** | P2 |
| MOD-COMP-006 | Hex Trust KYT（sandbox 无文档化） | `screen_source_wallet` | KYT result | INT-KYT-001 | **OPEN** | P2 |

> **❓ 客户确认问题**：KYT 第三方提供商选定 Chainalysis / TRM / Elliptic？

### 阶段 G：托管 / Hex Safe（资金控制，需特别谨慎）

| ID | 模块 | 输入 | 输出 | 约束 | 状态 | 优先级 |
|---|---|---|---|---|---|---|
| MOD-CUST-001 | Hex Safe sandbox client | `hexsafe_client.py` | 发址 / 提现 / 到账 | INT-CUST-001 | **CURRENT** | 维护 |
| MOD-CUST-002 | Hex Safe sandbox 提现幂等 | `hexsafe_withdrawals` 表 | idempotent | INT-CUST-001 | **CURRENT** | 维护 |
| MOD-CUST-003 | Hex Safe mainnet 接入 | 待客户凭据 | 同上 | INT-CUST-001 | **OPEN** | P0（部署前必须） |
| MOD-CUST-004 | Hex Safe webhook 接收 | `/api/webhooks/sumsub` 模板 | 入金 / 提现回调 | INT-CUST-003 | **OPEN** | P1 |
| MOD-CUST-005 | Hex Safe Forex | `/api/hexsafe/forex/probe` | USDT→HKD / USD 探测 | INT-FX-001 | **OPEN** | P2 |

### 阶段 H：认证 / SSO / 2FA

| ID | 模块 | 输入 | 输出 | 约束 | 状态 | 优先级 |
|---|---|---|---|---|---|---|
| MOD-AUTH-001 | 客户注册（Email OTP / 手机 OTP） | `Register.tsx` + `/api/register/*` | user + TOTP | RULE-AUTH-001/008 | **CURRENT** | 维护 |
| MOD-AUTH-002 | 客户登录（两步） | `Login.tsx` + `/api/login/start` + `/verify` | session | RULE-AUTH-002 | **CURRENT** | 维护 |
| MOD-AUTH-003 | TOTP 绑定 + 恢复码 | `Setup2FA.tsx` + `/api/confirm-totp` | TOTP + recovery | RULE-AUTH-003/004 | **CURRENT** | 维护 |
| MOD-AUTH-004 | 忘记密码 | `ForgotPassword.tsx` + `/api/password/*` | 重置 | RULE-AUTH-001 | **CURRENT** | 维护 |
| MOD-AUTH-005 | 2FA 启停 | `/api/2fa/*` | TOTP 生命周期 | RULE-AUTH-015 | **CURRENT** | 维护 |
| MOD-AUTH-006 | Step-up 资金动作 | `/api/stepup/verify` | step-up TTL | RULE-AUTH-007/016 | **CURRENT** | 维护 |
| MOD-AUTH-007 | Staff Okta SSO demo | `StaffLogin.tsx` + `/api/demo/enter` | session | RULE-AUTH-009 | **CURRENT** | 维护 |
| MOD-AUTH-008 | Staff Okta OIDC 生产 | 待客户凭据 | session | RULE-AUTH-012 | **OPEN** | P0 |
| MOD-AUTH-009 | Staff 邮箱域名白名单 | onboarding | 校验 | RULE-STAFF-001 | **OPEN** | P1 |
| MOD-AUTH-010 | Rate-limit per IP / session | middleware | 限频 | NFR-SEC-013 | **OPEN** | P1 |

### 阶段 I：部署 / CI / 监控

| ID | 模块 | 输入 | 输出 | 约束 | 状态 | 优先级 |
|---|---|---|---|---|---|---|
| MOD-OPS-001 | docker-compose 部署 | `docker-compose.yml` | web + backend + sqlite | 已实装 | **CURRENT** | 维护 |
| MOD-OPS-002 | GitHub Actions 检查 | `hypertransfer-check.yml` | typecheck + build + vitest | 已实装 | **CURRENT** | 维护 |
| MOD-OPS-003 | GitHub Actions 香港部署 | `hypertransfer-deploy-hk.yml` | SSH + rsync | 已实装 | **CURRENT** | 维护 |
| MOD-OPS-004 | WAF / DDoS 防护 | Cloudflare + nginx | 防护 | NFR-SEC-014 | **OPEN** | P1 |
| MOD-OPS-005 | 域名 SSL 证书 | Let's Encrypt | HTTPS | NFR-PORT-005 | **OPEN** | P0（部署前必须） |
| MOD-OPS-006 | Postgres / 多区容灾 | DB migration | 生产 DB | GAP-001 | **OPEN** | P2 |

### 阶段 J：监管 / 报送（DEPRECATED）

| ID | 模块 | 状态 | 备注 |
|---|---|---|---|
| MOD-REG-001 | STR / SAR / HKFIO 报送 | **DEPRECATED** | 客户 / Hex Trust 责任边界，不在 HyperTransfer |

---

## 8.3 开发路线图（按时间顺序）

### Sprint 1（基线维护，**CURRENT** 已实装）

- MOD-UI-* 全套
- MOD-CLIENT-001..015
- MOD-STAFF-001..016
- MOD-DEMO-001..005
- MOD-COMP-001..004
- MOD-CUST-001..002
- MOD-AUTH-001..007
- MOD-OPS-001..003

### Sprint 2（生产部署准备，**OPEN + PROPOSED**）

| 步骤 | 模块 | 阻塞 |
|---|---|---|
| S2.1 | 客户决策 Okta + MFA policy | GAP-002 |
| S2.2 | MOD-AUTH-008（Okta OIDC 生产接入） | 待客户凭据 |
| S2.3 | MOD-OPS-005（SSL 证书） | 待域名 |
| S2.4 | MOD-AUTH-009（Staff 邮箱域名白名单） | GAP-016 |
| S2.5 | MOD-AUTH-010（Rate-limit） | 决策 Redis / in-process |
| S2.6 | MOD-CUST-003（Hex Safe mainnet） | INT-CUST-001 mainnet 凭据 |
| S2.7 | MOD-CUST-004（Hex Safe webhook） | webhook 协议确认 |
| S2.8 | MOD-COMP-005/006（KYT 第三方） | INT-KYT-002 |
| S2.9 | MOD-OPS-004（WAF） | Cloudflare 接入 |
| S2.10 | MOD-INFRA-002/003（JSON logger + trace id） | 决策 OTel |

### Sprint 3（试运营加固，**OPEN**）

| 步骤 | 模块 | 阻塞 |
|---|---|---|
| S3.1 | MOD-INFRA-004（深度健康检查） | MOD-INFRA-002 |
| S3.2 | MOD-CUST-005（Forex） | INT-FX-001 |
| S3.3 | MOD-OPS-006（Postgres 迁移） | GAP-001 |

---

## 8.4 模块 → 文件 → 测试映射

> 给出每个模块的"AI 修改入口"与"测试入口"。

### 8.4.1 后端（FastAPI）

| 模块 | 主文件 | 测试 |
|---|---|---|
| MOD-CLIENT-001..012 | `hypertransfer-main/backend/server.py` | `test_e2e_matrix.py`、`test_payment_operations.py` |
| MOD-STAFF-001..016 | `server.py` | `test_admission_api.py`、`test_leader_approval.py`、`test_payment_operations.py` |
| MOD-COMP-001..006 | `server.py` + `notabene_adapter.py` | `test_notabene_adapter.py`、`test_kyc_case_gates.py` |
| MOD-CUST-001..005 | `hexsafe_client.py` + `server.py` | `test_e2e_matrix.py` |
| MOD-AUTH-001..010 | `server.py` | `test_e2e_matrix.py`、`test_staff_onboarding.py`、`test_demo_enter.py` |
| MOD-DEMO-001..005 | `server.py` + `seed_demo.py` | `test_demo_enter.py` |

### 8.4.2 前端（Next.js）

| 模块 | 主文件 | 测试 |
|---|---|---|
| MOD-UI-* | `apps/web/src/components/*` | — |
| MOD-CLIENT-* | `apps/web/src/views/*` | `apps/web/src/lib/*.test.ts(x)` |
| MOD-STAFF-* | `apps/web/src/components/*`、`apps/web/src/views/CasinoOpsPortal.tsx` | `apps/web/src/lib/*.test.ts(x)` |

---

## 8.5 AI PR 模板（建议）

每次 AI 出 PR 必填以下内容：

```markdown
## Summary

- 关联 PRD 文档：`Docs/PRD/HyperTransfer-Production-v1/*.md`
- 模块 ID：MOD-XXX-NNN
- 状态：CONFIRMED / CURRENT / DEPRECATED（不得包含 OPEN / PROPOSED 关键路径改动）

## What changed

- [列出文件改动，每个文件一行]

## Why

- [业务理由，引用 REQ-ID]

## Test

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test --workspace=web`
- [ ] `hypertransfer-main/backend/test_*.py`（如涉及后端）
- [ ] 手动 UAT（按 06-integrations-uat-nfr.md UAT-* ID）

## Compliance

- [ ] 不引入真实密钥 / 客户资料 / 证件号 / wallet 实控人
- [ ] 不修改 RBAC 角色矩阵
- [ ] 不破坏数据库迁移
- [ ] 不修改监管口径（FATF AMLO、KYT、Travel Rule）
- [ ] 不修改资金控制端点（`/api/hexsafe/*`、`/api/refunds/{rid}/execute`）

## Release Notes

- 在 `AGENTS.md` Release Notes 追加该版本入口 / 功能 / 文件 / 验证 / 已知限制
```

---

## 8.6 待人工确认事项汇总（OPEN + PROPOSED）

### v1.1 新增决议（详见 `00-decisions.md`）

| 编号 | 事项 | 状态 | 关联 |
|---|---|---|---|
| Q1 / Q8 | Travel Rule 默认触发范围 | **PROPOSED** | REQ-DEP-016 |
| Q2 | Wallet KYT Provider 选定 | **OPEN** | REQ-DEP-013 |
| Q3 | Deposit Completed 后通知范围 | **PROPOSED** | REQ-DEP-014 |
| Q4 | Cage Confirmation 录入角色 | **OPEN** | REQ-OPS-CAGE-002 |
| Q5 | New Deposit Originating Wallet Picker | **PROPOSED** | REQ-VIP-DEP-011 / REQ-VIP-DEP-012 |
| Q6 | Refund 范围 | **OPEN** | REQ-VIP-REF-005 |
| Q7 | Phase 1 网络白名单 | **OPEN** | REQ-DEP-015 |

### v1.0 累积待人工确认

| 编号 | 事项 | 状态 | 来源 |
|---|---|---|---|
| OPEN-01 | Okta 租户 / Client ID / Secret / MFA policy | **OPEN** | REQAUTH-OPEN-001 |
| OPEN-02 | SMS 正式网关 | **OPEN** | GAP-003 |
| OPEN-03 | Sumsub mainnet 凭据 | **OPEN** | GAP-004 |
| OPEN-04 | Hex Safe mainnet 凭据 | **OPEN** | GAP-005 |
| OPEN-05 | Travel Rule 主 provider（Sumsub vs Notabene） | **OPEN** | GAP-006 |
| OPEN-06 | KYT 第三方提供商（Chainalysis / TRM / Elliptic） | **OPEN** | GAP-007 |
| OPEN-07 | Forex 汇率 provider | **OPEN** | GAP-008 |
| OPEN-08 | staff 邮箱域名白名单 | **OPEN** | REQAUTH-OPEN-002 |
| OPEN-09 | audit_trail retention 持久化方案 | **OPEN** | GAP-011 |
| OPEN-10 | WAF / DDoS 防护选型 | **OPEN** | GAP-012 |
| OPEN-11 | 结构化日志 + Trace 选型（OTel / Sentry） | **OPEN** | MOD-INFRA-002/003 |
| OPEN-12 | 域名 + SSL 证书 | **OPEN** | GAP-015 |
| OPEN-13 | 告警通道（PagerDuty / 飞书 webhook） | **OPEN** | GAP-014 |
| OPEN-14 | 真实 STR / SAR / HKFIO 报送 | **DEPRECATED** | 客户 / Hex Trust 责任 |
| PROPOSED-01 | Okta OIDC Auth Code + PKCE vs Resource Owner | **PROPOSED** | REQ-AUTH-017 |
| PROPOSED-02 | RBAC 在 demo admin 基础上收紧 | **PROPOSED** | GAP-017 |
| PROPOSED-03 | Admin / Provider 配置 UI | **PROPOSED** | GAP-022 |

> **任何 AI 工作必须先在本节确认 OPEN 状态或排除与 PR 路径无关后再开始。**

---

*最后更新：2026-09-01（v1.1：加 Q1-Q8 决议清单，详见 `00-decisions.md`）*