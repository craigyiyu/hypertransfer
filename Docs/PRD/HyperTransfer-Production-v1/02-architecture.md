# 02 — Current Code & Architecture

## 2.1 仓库结构（生产架构相关）

```
hypertransfer/                       # 仓库根
├── apps/
│   ├── web/                         # ★ 生产前端（Next.js 16 App Router）
│   │   ├── app/                     # 27 路由（client + staff + 内部门户）
│   │   ├── src/
│   │   │   ├── views/               # 27 页面组件（页面级 React）
│   │   │   ├── components/          # 27 复用组件（Shell、AdmissionCasePanel、…）
│   │   │   ├── contexts/            # AuthContext 等
│   │   │   ├── lib/                 # api.ts / compliance.ts / admission-case.ts / ...
│   │   │   └── hooks/
│   │   ├── next.config.ts           # output: "export" + /api rewrite（仅 dev）
│   │   └── vitest.config.ts         # 客户端单测（vitest ^2）
│   └── operator/                    # Operator Pad App（Next.js，独立设计）
│
├── packages/
│   ├── ui/                          # 共享设计系统（Base UI vega + emerald）
│   ├── eslint-config/
│   └── typescript-config/
│
├── hypertransfer-main/
│   ├── backend/                     # ★ 生产后端（FastAPI + SQLite）
│   │   ├── server.py                # 6070 行主服务
│   │   ├── admission_rules.py       # admission case 状态机
│   │   ├── admission_provider_adapters.py
│   │   ├── transaction_compliance_rules.py
│   │   ├── hexsafe_client.py        # Hex Safe REST client（ES256 JWT）
│   │   ├── notabene_adapter.py
│   │   ├── seed_demo.py
│   │   ├── test_*.py                # ~22 测试文件
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── client/                      # ⚠️ 已冻结（旧 React+Vite+wouter）
│   └── docs/
│
├── Dockerfile.frontend              # ★ 多阶段 Next 静态导出 + nginx
├── docker-compose.yml               # ★ 一键部署（web + backend + sqlite 卷）
├── deploy/nginx.conf                # 静态托管 + /api 反代
├── DEPLOY.md                        # 部署文档
├── .github/workflows/
│   ├── hypertransfer-check.yml      # ★ PR/main 门禁
│   └── hypertransfer-deploy-hk.yml  # 香港服务器自动部署
├── ProjectInfo/design.md            # 业务术语权威来源
├── ProjectInfo/Operator_Macau_VA_Hex_Trust_Clarification_Request_Completed_04_June.pdf
└── Docs/PRD/                        # 本文档包
```

## 2.2 前端架构（`apps/web`）

### 2.2.1 技术栈

| 层 | 选型 | 版本约束 |
|---|---|---|
| 框架 | Next.js App Router（静态导出 `output: "export"`） | 16.2.6 |
| UI | React 19 + Tailwind 4 + shadcn/ui(Base UI vega) + emerald | react 19.2.6（root overrides 强制） |
| 路由 | Next App Router + `src/lib/wouter.tsx` shim（`useLocation` / `navigate` / `Link` / `Redirect`） | 兼容旧 wouter API |
| 主题 | emerald/olive preset + Geist/Noto Sans | `--gold`/`--wine` 别名=emerald |
| 数据 | axios + 同源 `/api/*`（dev → `localhost:8000`，prod nginx 反代） | — |
| 表单 | 受控 + Zod / 自研 `lib/validation.ts` | — |
| 测试 | Vitest（≥7 个 `*.test.ts` / `*.test.tsx`） | `vitest ^2` |
| 全高容器 | `100svh`（禁用 `100dvh`，软键盘抖动） | 见 `Shell.tsx`/`Landing.tsx`/`ProtectedRoute.tsx` |
| i18n | `src/lib/translations.ts`（zh/en） | `LanguageSwitcher` |

### 2.2.2 路由清单（App Router 页面）

#### Client（VIP）端

| 路径 | 视图 | 用途 |
|---|---|---|
| `/` | `DemoHome.tsx` | Demo 首页 hub：4 张角色卡（Host/Manager/HK Ops/VIP）+ 旧 2 卡入口 |
| `/welcome` | `Landing.tsx` | 客户 landing（原 `/` 内容） |
| `/login` | `Login.tsx` | 客户登录（两步：邮箱密码 → TOTP） |
| `/register` | `Register.tsx` | 自助手机短信注册（并存保留，主入口是 `/invite`） |
| `/invite` | `Invite.tsx` | 邀请落地页（公开，token + email + Email OTP） |
| `/setup-2fa` | `Setup2FA.tsx` | TOTP 绑定（QR + 6 位） |
| `/verify-2fa` | `Verify2FA.tsx` | 登录第二因子 / 恢复码切换 |
| `/forgot-password` | `ForgotPassword.tsx` | 短信重置密码 |
| `/recovery-codes` | （与 `Setup2FA` 绑定流程） | 10 个一次性恢复码 |
| `/kyc` | `KYC.tsx` | Sumsub KYC 表单（API-only demo 模式） |
| `/kyc-status` | `KYCStatus.tsx` | Sumsub review 状态 |
| `/dashboard` | `Dashboard.tsx` | 客户账户首页（admission journey + 入金按钮 + 退款入口） |
| `/new-deposit` | `NewDeposit.tsx` | 选资产/网络/金额 |
| `/wallet-screening` | `WalletScreening.tsx` | 来源钱包 KYT |
| `/travel-rule` | `TravelRule.tsx` | Travel Rule 信息收集与 gate |
| `/deposit-address` | `DepositAddress.tsx` | Hex Safe 地址签发前提示 |
| `/main-deposit` | `MainDeposit.tsx` | Step 1（1 USDT 验证）+ Step 2（主入金）合并 |
| `/deposit-success` | `DepositSuccess.tsx` | 链上完成 + txHash 浏览器链接 + Planned Amount 提示 |
| `/refund` | `RefundProcess.tsx` | 选 verified wallet → 自由金额 → 可选原因 |
| `/history` | `History.tsx` | 入金 / 退款记录（Pending / Pending / Settled 三态） |
| `/settings` | `Settings.tsx` | profile + 2FA 管理 |
| `/support` | `Support.tsx` | 帮助与联系方式 |

#### Staff 端

| 路径 | 视图 | 用途 |
|---|---|---|
| `/ops` | `StaffLogin.tsx` | 工作人员登录（Okta SSO demo 主入口 + 邮箱密码次入口） |
| `/staff-onboard` | `StaffOnboarding.tsx` | 公司邮箱自助注册（host/leader/ops）+ TOTP 激活 |
| `/casino-ops` | `CasinoOpsPortal.tsx` | 主后台（VIP Requests / Leader Approval / Payment Operations / Reconciliation） |
| `/treasury-controls` | （casino-ops 别名） | 旧 `/treasury-controls` 保留兼容，不要从客户端导航 |

#### 内部 / 兜底

| 路径 | 视图 | 用途 |
|---|---|---|
| `/test-payment` | `TestPayment.tsx` | 内部调试 |
| `/pending-approval` | `PendingApproval.tsx` | 待 leader 审批时用户视图 |
| `/404`、`/not-found` | `404.tsx` / `NotFound.tsx` | 兜底 |

### 2.2.3 主要 `lib` 模块

| 文件 | 责任 |
|---|---|
| `lib/api.ts` | axios + 全部 adapter（authApi/invitationApi/emailApi/inviteAuthApi/adminApi/hexsafeApi/depositApi/refundApi/hostApi/admissionApi/admissionClaimApi/staffApi/leaderApi/paymentApi/transactionPackApi/operationsApi） |
| `lib/authFlow.ts` | 注册/登录临时态缓存（`PENDING_REGISTER_KEY`、`LOGIN_CHALLENGE_KEY`） |
| `lib/admission-case.ts` | `AdmissionCaseStatus` + label + tone + 邮箱 mask + KYC valid_until 格式化 |
| `lib/admission-journey.ts` | `ADMISSION_JOURNEY_STEPS` + `SETTLEMENT_JOURNEY_STEPS` + `nextAction` 文案 |
| `lib/transaction-compliance.ts` | pack rules + KYC valid_until + 实际确认指纹变更触发重验 |
| `lib/leader-approval.ts` | leader 决策逻辑 + 拒绝必填业务原因 |
| `lib/compliance.ts` | Travel Rule 阈值（USD 1,000）+ Phase 1 网络白名单 + 链上确认数 + HT Markets OTC fee + 区块浏览器 URL |
| `lib/currency.ts` | `DEPOSIT_FEE_MODEL` + HKD/USD 转换 + `formatHKD`（千分位）+ `getHKDEquivalent` |
| `lib/travel-rule.ts` | TR 数据模型 + 状态机 + provider adapter（Sumsub 当前主路径） |
| `lib/hex-safe.ts` | Hex Safe deposit status / 确认数 / vault 余额 mock（客户端展示） |
| `lib/treasury-ops.ts` | OTC / depeg / reconciliation / Macau access exclusion mock |
| `lib/refund-process.ts` | refund KYT + treasury approval + Hex Safe payout mock |
| `lib/sumsub.ts` | Sumsub KYC applicant / access-token / connection-test（access-token 仅留 WebSDK 模式占位） |
| `lib/demo-auth.ts` | `DEMO_AUTH_TOKEN` / `DEMO_STAFF_TOKEN` + demo 用户对象 |
| `lib/demo-deposit-settlement.ts` | 演示入金 settlement localStorage 事件 |
| `lib/translations.ts` | zh/en i18n 字典 |
| `lib/validation.ts` | 表单 / 状态机校验 |
| `lib/utils.ts` | 通用工具 |
| `lib/wouter.tsx` | wouter→Next Router 适配 shim |
| `lib/app-version.ts` | `v<package version>+<git short sha>` 构建标签 |

## 2.3 后端架构（`hypertransfer-main/backend`）

### 2.3.1 技术栈

| 层 | 选型 |
|---|---|
| 框架 | FastAPI（uvicorn 单 worker / 单 port） |
| 数据 | SQLite（默认 `HT_DB_PATH` → `/data/hypertransfer_auth.db`） |
| 迁移 | 启动时 `init_db` 自检 + 旧库 `phone PK → user_id PK` 自动迁移 + 备份 |
| 鉴权 | Bearer session token（12h）+ challenge（5min）+ TOTP enrollment（10min） |
| 邮件 | 默认 console（SMTP_* 预留），env 配则真发 |
| 短信 | Hypervelocity `simpleSend`（QA env 默认），生产换正式网关 |
| 测试 | unittest discover（≥143 测试用例覆盖核心模块） |

### 2.3.2 端点分组（104 endpoints）

#### Auth / 2FA / Session（13）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/send-otp` | 发送手机短信 OTP |
| POST | `/api/register` | 手机号 + 密码 + 真实短信 OTP → 待 TOTP |
| POST | `/api/confirm-totp` | 绑定 TOTP（生成 10 个 recovery codes） |
| POST | `/api/regenerate-totp` | pending TOTP 用户免短信重签 secret |
| POST | `/api/register/activate-skip` | 跳过 TOTP 激活（demo） |
| POST | `/api/password/send-otp` | 忘记密码（防枚举 + 仅 active 真发） |
| POST | `/api/password/reset` | 短信码校验 → 改密 + 失效全部会话 |
| POST | `/api/login/start` | 邮箱/手机 + 密码 → challenge |
| POST | `/api/login/verify` | challenge + TOTP → session |
| POST | `/api/login/recovery` | challenge + 一次性恢复码 → session |
| POST | `/api/logout` | 失效当前 session |
| GET | `/api/me` | 当前用户信息（含 roles） |
| GET | `/api/staff/whoami` | 工作人员身份查询 |

#### 2FA 管理 / Step-up（5）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/2fa/enable` | 启用 TOTP（生成 secret + QR） |
| POST | `/api/2fa/confirm` | 绑定 TOTP（消费 enrollment） |
| POST | `/api/2fa/disable` | 停用 TOTP |
| POST | `/api/stepup/verify` | 资金动作 step-up（5 分钟 TTL） |

#### 邀请制（PR②-2 邀请制 + PR②-1 user_id 重构）（11）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/invitations` | RM 提交邀请申请（3 字段：Member ID / Name / Email） |
| GET | `/api/invitations/mine` | 当前 RM 的邀请列表 |
| GET | `/api/invitations` | marketing 审核队列 |
| POST | `/api/invitations/{id}/approve` | 批准（自动签发 token + 6h TTL） |
| POST | `/api/invitations/{id}/reject` | 拒绝（必填原因） |
| POST | `/api/invitations/{id}/resubmit` | RM 重提交 |
| POST | `/api/invitations/{id}/issue` | 签发（兼容旧版，已合并到 approve） |
| POST | `/api/invitations/{id}/resend` | 重发邮件 |
| POST | `/api/invitations/{id}/email` | 触发邮件发送 |
| GET | `/api/invitations/{id}/email-preview` | 邮件预览（demo） |
| POST | `/api/invitations/verify` | 公开 token 校验 |

#### Email OTP / Email Register（5）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/email/send-otp` | 邮件 OTP |
| POST | `/api/register/invite` | 邀请制注册（token + Email OTP） |
| POST | `/api/register/email/send-otp` | 邮箱 OTP（无邀请） |
| POST | `/api/register/email` | 邮箱注册（无邀请，demo/兼容） |

#### Sumsub Provider（8）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/sumsub/config` | 客户端配置（仅 sandbox 标志 + level name） |
| GET | `/api/sumsub/health` | provider 健康 |
| POST | `/api/sumsub/access-token` | 短期 WebSDK token（仅留 WebSDK 模式） |
| POST | `/api/sumsub/travel-rule/submit` | TR 提交 |
| GET | `/api/sumsub/travel-rule/transactions` | TR 列表 |
| POST | `/api/sumsub/kyc/start` | KYC start（创建 applicant） |
| GET | `/api/sumsub/kyc/status` | KYC status |
| POST | `/api/sumsub/kyc/demo-approve` | demo 旁路批准（仅非 production） |
| POST | `/api/sumsub/connection-test` | 凭据连通性测试 |
| POST | `/api/webhooks/sumsub` | Sumsub webhook 接收 |

#### Hex Safe Provider（8）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/hexsafe/health` | Hex Safe 健康 |
| GET | `/api/hexsafe/networks` | 支持的链 + 资产 |
| GET | `/api/hexsafe/vaults` | vault 列表 |
| POST | `/api/hexsafe/deposit-address` | 发一次性地址（custodian/ops 角色） |
| GET | `/api/hexsafe/transactions` | 交易列表 |
| GET | `/api/hexsafe/transactions/{trace_id}` | 单笔交易 |
| GET | `/api/hexsafe/deposit/{tx_hash}` | 按 txHash 查入金 |
| POST | `/api/hexsafe/withdrawal` | 提现（含幂等持久化） |
| GET | `/api/hexsafe/forex/probe` | 汇率探测 |

#### Refund（8）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/refunds/wallets` | 当前用户 verified wallets |
| POST | `/api/refunds` | 客户创建退款（已验证钱包 picker） |
| GET | `/api/refunds/mine` | 当前用户退款 |
| GET | `/api/refunds` | 退款队列（staff） |
| POST | `/api/refunds/{rid}/screen` | compliance 端 wallet KYT |
| POST | `/api/refunds/{rid}/approve` | management 批准 |
| POST | `/api/refunds/{rid}/reject` | 拒绝 |
| POST | `/api/refunds/{rid}/execute` | custodian 调 Hex Safe withdrawal |

#### Deposit（10）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/deposits/eligibility` | `accountState: active|hold`（KYC gate） |
| POST | `/api/deposits` | 创建 deposit（KYC gate） |
| GET | `/api/deposits/mine` | 当前用户 deposit 列表 |
| GET | `/api/deposits` | 队列（staff） |
| GET | `/api/deposits/{did}` | 详情 |
| GET | `/api/qr` | 邀请 / 收款二维码 |
| POST | `/api/deposits/{did}/screen` | 来源钱包 KYT |
| POST | `/api/deposits/{did}/issue-address` | 发址（KYC + screening + TR 三闸门） |
| POST | `/api/deposits/{did}/confirm-test` | 1 USDT 验证 → 写 `verified_wallets` |
| POST | `/api/deposits/{did}/main` | 主入金 + TR 标记 |
| POST | `/api/deposits/{did}/marker` | 录入 marker ref（marketing/ops） |
| POST | `/api/deposits/{did}/settle` | 结算（生成 receipt_ref） |

#### Host / Admission Case（10）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/host/profile/activate` | Host 企业身份激活（staff session = Okta 边界） |
| GET | `/api/host/profile` | Host profile |
| POST | `/api/admission-cases` | Host 建 case |
| GET | `/api/admission-cases/mine` | Host 自己的 case 列表 |
| GET | `/api/admission-cases/{case_id}` | 详情 |
| POST | `/api/admission-cases/{case_id}/revoke` | 撤销 |
| POST | `/api/admission-cases/{case_id}/invite/email` | 邮箱邀请（6h link） |
| POST | `/api/admission-cases/{case_id}/remind` | 提醒 |
| POST | `/api/admission-cases/{case_id}/invite/qr-session` | QR 邀请（15min 动态） |
| POST | `/api/admission-claims/verify-email` | 客户用邀请邮箱 + Email OTP 认领 |
| POST | `/api/admission-claims/register` | 客户认领 + Email OTP 注册 |
| GET | `/api/admission-cases/patron/mine` | VIP 自己的 case |

#### Leader Approval（2）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/leader/admission-cases` | leader 队列 |
| POST | `/api/admission-cases/{case_id}/leader-decision` | approve / reject（reject 必填原因） |

#### Payment Intents + Compliance Packs（10）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/payment-intents` | 创建 payment intent |
| POST | `/api/payment-intents/{id}/source-classification` | source wallet 分类 |
| POST | `/api/payment-intents/{id}/actual-confirmation` | 实际到账指纹 |
| POST | `/api/payment-intents/{id}/compliance-packs` | 创建 Transaction Compliance Pack |
| POST | `/api/transaction-compliance-packs/{id}/screen` | wallet KYT 筛查 |
| POST | `/api/transaction-compliance-packs/{id}/issue-address` | 发址（KYT + TR 双闸门） |
| POST | `/api/transaction-compliance-packs/{id}/record-transfer` | 实际到账 / final 标记 |
| POST | `/api/transaction-compliance-packs/{id}/cage-confirmation` | Cage confirmation 录入 |
| POST | `/api/transaction-compliance-packs/{id}/reconcile` | Finance reconciliation |

#### HK Operations / Finance（4）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/operations/payment-cases` | 支付 case 列表 |
| GET | `/api/operations/reconciliation-export` | 对账导出（CSV/JSON） |
| POST | `/api/operations/run-monitoring` | 监控（demo） |
| GET | `/api/operations/monitoring-flags` | 监控标记列表 |

#### Staff 管理 / Onboarding（4）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/admin/staff` | admin 创建员工，返回 TOTP 绑定 QR |
| POST | `/api/staff/onboarding/start` | 公司邮箱自助注册（host/leader/ops） |
| POST | `/api/staff/okta/link` | Okta 绑定 demo 占位（生产 503 fail closed） |

#### Demo / Health（3）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/demo/enter` | 一键四角色 demo 入口（gated on `HT_DEMO_BYPASS_2FA`） |
| GET | `/api/health` | 健康检查（docker healthcheck） |
| — | HTTPException handler | 统一 JSON 错误响应 |

### 2.3.3 数据模型（核心表）

> 字段略，详见 `server.py` 与 `admission_rules.py`。所有 ID 关联已切到 `user_id`（uuid）主键，phone 改为可空唯一属性。

| 表 | 用途 |
|---|---|
| `users` | 主表（uuid PK，phone/email 可空唯一，含 user_type + roles） |
| `otps` | 短信 OTP（PK 仍是 phone） |
| `email_otps` | Email OTP（独立表） |
| `invitations` | 邀请制（status: submitted/approved/rejected，token + 6h TTL） |
| `sessions` | bearer token（12h TTL，hash 存储） |
| `challenges` | 登录第一步 challenge（5min TTL） |
| `totp_secrets` | TOTP secret（加密存） |
| `recovery_codes` | 一次性恢复码（sha256 存） |
| `audit_trail` | 关键动作审计 |
| `deposit_requests` | 客户入金（状态机：`created → screening_passed/screening_failed → address_issued → verified → main_submitted → settled`，任意可 `cancelled`） |
| `verified_wallets` | 客户已验证钱包（退款 picker 来源） |
| `refund_requests` | 退款（合规/管理/custodian 三段工作流） |
| `hexsafe_withdrawals` | Hex Safe 提现幂等持久化 |
| `payment_intents` | 业务支付意图 |
| `payment_source_classifications` | 来源分类 |
| `payment_actual_confirmations` | 实际到账指纹 |
| `transaction_compliance_packs` | 每笔转账独立不可变合规包（basic/enhanced 字段） |
| `cage_confirmations` | 赌场金库确认 ID |
| `finance_reconciliations` | Finance 对账（retention ≥5 年） |
| `admission_cases` | Host-led VIP admission（status：draft → invitation_open → vip_claimed → kyc_in_progress → kyc_passed → payment_precheck → leader_pending → service_enabled；分支：kyc_failed / compliance_review / rejected / expired / revoked） |
| `admission_invitations` | 双通道邀请（email token 6h + QR session 15min） |
| `admission_claims` | 邀请认领 + Email OTP 关联 |
| `leader_decisions` | leader 决策（必填 reject reason） |
| `staff_onboarding` | 员工自助注册 |

## 2.4 部署架构

### 2.4.1 Docker Compose（生产部署入口）

```
docker-compose.yml（仓库根）
├── service: backend
│   ├── context: ./hypertransfer-main/backend
│   ├── env: HT_DB_PATH / HT_ALLOWED_ORIGINS / SMS_API_URL / SMS_SIGN_CN/INTL
│   ├──       HT_DEMO_BYPASS_2FA / HT_INVITE_BASE_URL / HT_LEADER_USER_ID
│   ├──       SUMSUB_BASE_URL / SUMSUB_ENVIRONMENT / SUMSUB_APP_TOKEN
│   ├──       SUMSUB_SECRET_KEY / SUMSUB_WEBHOOK_SECRET_KEY
│   ├──       SUMSUB_KYC_LEVEL_NAME / SUMSUB_TR_LEVEL_NAME / SUMSUB_WEBSDK_TTL
│   ├──       HT_ADMIN_EMAIL / HT_ADMIN_PASSWORD
│   ├── volume: ht-db → /data（SQLite 持久化）
│   ├── healthcheck: GET /api/health
│   └── 不对外暴露端口
│
└── service: web
    ├── context: . (仓库根)
    ├── dockerfile: Dockerfile.frontend
    ├── args: NEXT_PUBLIC_APP_VERSION / NEXT_PUBLIC_GIT_COMMIT（构建时注入）
    ├── depends_on: backend
    └── ports: ${WEB_PORT:-8090}:80
```

### 2.4.2 前端构建（`Dockerfile.frontend`）

- 多阶段构建
- Stage 1（`deps`）：`npm ci`
- Stage 2（`build`）：`npm run build --workspace=web` → 静态导出到 `apps/web/out/`
- Stage 3（`runtime`）：nginx 托管 `out/` + 反代 `/api/*` → `backend:8000`
- build args：`NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_GIT_COMMIT`（首页 footer 显示）

### 2.4.3 Nginx（`deploy/nginx.conf`）

- 静态托管 `apps/web/out/`
- SPA fallback：`try_files $uri /index.html`
- `/api/*` → `proxy_pass http://backend:8000`（含 Host header / proxy_set_header）

### 2.4.4 CI/CD

| Workflow | 触发 | 动作 |
|---|---|---|
| `.github/workflows/hypertransfer-check.yml` | PR / push main | Node 22 + `npm ci` + `npm run typecheck` + `npm run build` + `npm test --workspace=web` |
| `.github/workflows/hypertransfer-deploy-hk.yml` | main push / workflow_dispatch | SSH + rsync 到香港服务器（需配 HK_* secrets，详见 `DEPLOY.md` §5） |

## 2.5 测试覆盖

| 层 | 框架 | 文件 | 覆盖 |
|---|---|---|---|
| 后端 | unittest discover | `hypertransfer-main/backend/test_*.py` | ≥143 用例：状态机、KYC case gates、admission rules / claims / api / migration / timestamps、leader approval、transaction compliance、refund / payment operations、staff onboarding、demo enter、notabene adapter、visibility feedback |
| 前端 | vitest ^2 | `apps/web/src/lib/*.test.ts(x)` | admission-case / admission-journey / admission-invite / kyc-status / leader-approval / transaction-compliance / translations |

## 2.6 旧 Vite 迁移风险（`hypertransfer-main/client`）

> **冻结区域**：仅作历史逻辑与迁移风险参考。除紧急兼容修复外，不新增功能。

| 风险点 | 现状 | 迁移建议 |
|---|---|---|
| 旧认证 API（`/api/send-otp`、`/api/login/start`、`/api/login/verify`、`/api/confirm-totp` 等）签名 | 后端已保留全部旧端点（向后兼容） | 新前端 `apps/web` 通过 `apps/web/src/lib/api.ts` 调用，前端不再从旧 client import |
| 旧 Provider mock（`hex-safe.ts`/`treasury-ops.ts`/`refund-process.ts`） | 仍存在但功能已下沉到 `apps/web/src/lib/` + 后端真实 adapter | 旧文件不再修改；新代码从 `apps/web/src/lib/` 引用 |
| 旧路由 `/treasury-controls` | 保留为 `/casino-ops` 别名 | 不从客户端导航；DEPLOY 时确保 nginx 兼容 |
| Demo 旧构建脚本（`dev.sh`、`pnpm`） | `dev.sh` 仍可启动旧 client + backend | 推荐使用仓库根 `npm run dev --workspace=web`（turbo dev）启动新前端 |
| 旧 `package.json` (pnpm) | 与新 monorepo 共存 | 新依赖走 `npm install -w web`；旧 `pnpm-lock.yaml` 仍受版本控制但不再维护 |

---

*最后更新：2026-08-28*