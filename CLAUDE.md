# VirtualAsset — 项目级 AI 协作记忆

> 本文档是 Claude Code / Cursor / 其他 AI 助手在本仓库内的**项目级长期记忆**。优先级：项目级 > 用户级（`~/AGENTS.md` / Cursor User Rules）。
>
> 项目级覆盖用户级——比如本项目演示账号 `va.host.demo@operator.example` 是 demo 内置数据，**不视为** PII / 凭据违规。
>
> **本 `CLAUDE.md` 是本项目的主口径 / 权威基准**（用户 2026-06-28 确认：Claude 以此为准）。**配套文件 `AGENTS.md`**（仓库根）是 Codex/OpenAI agents 的工作入口，承载**最新可测试版本的 Release Notes、本地测试入口清单、代码管理/分支/PR/GitHub 策略**，与本文件**保持同步**。**两者冲突时以 `CLAUDE.md` 为准**，并同步回写 `AGENTS.md`。改动业务流 / 版本时**两份都要更新**。
>
> 维护原则见文末「更新机制」。

---

## 1. 项目身份

| 项 | 值 |
|---|---|
| 仓库名 | `VirtualAsset` |
| 性质 | **虚拟资产合规入金编排系统** — 包含 Operator 员工端 Demo + HyperTransfer 客户端产品 + 香港商业化规划 |
| 阶段 | Operator Demo 已完成；HyperTransfer Phase 1 报价已出（USD 146,250）；香港公司商业方案已制定 |
| 仓库路径 | `/Users/yiweichen/Documents/Code/VirtualAsset` |
| Git 状态 | 已接 GitHub private repo `origin → github.com/eason36/Hyper-Transfer`；`main` 为稳定主线，走**任务分支 + PR + Squash merge**（策略见 `AGENTS.md`）；日常不直推 `main` |
| **商业化主体** | **Heypervelocity**（香港公司，计划注册） |
| **对外产品名** | **HyperTransfer**（客户端 H5 应用，站点 `h5.hypercypto.com`） |

**核心定位**：不是钱包工具，不是交易所。本仓库包含两个层面：

1. **Operator Demo**（`app/` + `src/`）：面向运营方员工在 Pad 上办理 crypto deposit 的合规编排 demo（Next.js + React）
2. **HyperTransfer 产品**（`hypertransfer-main/` + 规划 `ClientMeetings/` + `CompanyPlan/`）：商业化客户端应用，面向 B2B 企业客户的虚拟资产合规入金 + 法币结算系统

**核心演示流程（6 步）**：

1. Patron source wallet screened（来源钱包 KYT 筛查）
2. Travel Rule data captured（FATF Travel Rule 信息收集）
3. Hex Trust address issued（托管方签发一次性地址）
4. Funds detected on-chain（链上到账监听）
5. Compliance engine clears transaction（到账后交易级合规清算）
6. Stable coin lands in WTA（稳定币入 Treasury Account）

## 2. 技术栈

> 注意:本仓库含**三套技术栈**——Operator Demo(Next.js)、HyperTransfer 产品前端(React+Vite,见 `hypertransfer-main/`)、认证后端(Python/FastAPI)。下表为 Operator Demo。

| 层 | 选型 | 版本约束 |
|---|---|---|
| 框架 | **Next.js** App Router | `^16.2.6` |
| 运行时 | **React** | `^19.2.6` |
| 语言 | **TypeScript** | `^5.8.3`，`strict: true`、`noUncheckedIndexedAccess: true` |
| Node | — | `>=20` |
| 校验 | **Zod** | `^4.4.3` |
| 模块系统 | ESM（`"type": "module"`） | — |
| 路径别名 | `@/*` → 仓库根 | 见 `tsconfig.json` |
| 样式 | 单文件 `app/globals.css`（深色 Operator 金色风） | 无 Tailwind / CSS-in-JS |
| 状态 | 组件内 `useState` / 顶级 mock 数据 | **暂无** Zustand / Redux / TanStack Query |
| 数据库 | **无**（一切走 `src/data/seed.ts` mock） | 计划：Prisma + SQLite → PostgreSQL |
| 测试 | **无**（计划补状态机、表单校验、provider mock 的最小测试） | — |

**可用脚本**：

```bash
npm run dev        # next dev
npm run build      # next build
npm run start      # next start
npm run typecheck  # tsc --noEmit
```

## 3. 目录结构（核心）

```
VirtualAsset/
├── app/                          # Next.js App Router（Operator Demo）
│   ├── layout.tsx                # 根 layout，挂 globals.css
│   ├── page.tsx                  # 首页 -> <PadDepositApp />（Pad 办理流程）
│   ├── globals.css               # 全局样式（深色 + 金色强调，唯一样式入口）
│   ├── kyc/page.tsx              # 客户端 KYC Pad App（独立演示流）
│   ├── deposits/new/page.tsx     # Host 创建 deposit request 表单
│   ├── audit/page.tsx            # 审计日志只读列表
│   ├── treasury/page.tsx         # WTA vault 余额 + Hex Safe 集成说明
│   ├── refunds/                  # Refund / Payout 模块
│   └── ops/                      # 运营后台（队列 / case / 详情）
├── src/
│   ├── components/               # 业务组件（pad-deposit-app.tsx 等）
│   ├── domain/                   # 领域核心：types.ts / state-machine.ts / providers.ts
│   ├── data/seed.ts              # mock 客户 / deposit / case / audit / wtaVaults / payoutRequests
│   ├── lib/format.ts             # 通用格式化
│   └── index.ts                  # 老 Node 入口（残留）
├── public/                       # 静态资产（含 operator-logo.png）
├── ProjectInfo/                  # 业务设计资料
│   ├── plan.md                   # 项目实施计划
│   ├── design.md                 # 1.4k 行完整设计文档（业务术语权威来源）
│   ├── virtual-asset-ppt.{md,pptx}# 项目 PPT
│   ├── Operator_Macau_VA_Hex_Trust_Clarification_Request_Completed_04_June.pdf  # ★客户提供的 Hex Trust 36 问澄清回复（Phase1 网络/确认数/Webhook/API/TR 平台边界/KYT/冷存储/资质，权威核对）
│   └── 截屏*.png                  # 运营方原型截图
├── ProjectReference/             # 外部参考资料（PDF）
├── Docs/                         # 运维/配置文档
│   ├── SMTP-Config.md            # ★飞书 SMTP 配置（邀请/OTP 邮件）。⚠️含真实凭据→已 .gitignore 不入库，仅本地持有
│   └── Demo-Accounts.md          # ★本地演示账号清单（/ops 工作人员端 RM+Marketing 等 5 角色 + patron + 2FA 旁路 + 入口 URL）。来源 seed_demo.py，全 demo 凭据可入库
├── ClientMeetings/               # 客户会议材料 + 报价单
│   ├── HyperTransfer-Demo-Script.md          # ★客户演示脚本（3 大流程逐页逐步 + 话术）
│   ├── HyperTransfer-Demo-Walkthrough.{md,pdf,docx}  # ★配图版演示走查（实拍截图）+ demo-shots/
│   ├── Virtual-Asset-Management-Demo-and-Project-Progress.pdf  # Operator 会议 PPT
│   ├── HyperTransfer-Development-Quotation.xlsx  # HyperTransfer Phase 1 报价（USD 146,250）
│   ├── Virtual-Asset-Development-Quotation.xlsx  # Operator 员工端报价（USD 130,600，旧版）
│   └── 2026-06-05-Crypto-Compliance-KYC-Rollout-Meeting-Notes.md  # 最新客户会议纪要（Hex Trust / KYC / Travel Rule / testing timeline）
├── CompanyPlan/                  # 香港商业化方案
│   ├── HyperTransfer-HK-Business-Plan.md  # 客户画像/牌照路线/获客策略/竞争格局
│   ├── HK-Licensing-Roadmap.md   # 香港牌照三阶段路线图（Phase 0 无牌→MSO→VA Dealing→VA Custody，含投入/解锁能力）
│   └── Third-Party-Services-Cost.md  # 客户自采第三方服务成本估算（KYC/KYT/Travel Rule/MFA/Hex Trust/云，年 USD 86K–548K）
├── hypertransfer-auth-demo/      # 【独立 H5 原型·早期版】注册/登录双因子 MFA（原生 JS + FastAPI，免构建）
│   ├── server.py                 # FastAPI：send-otp/register/confirm-totp/login/me/logout
│   └── static/index.html · requirements.txt · run.sh · README.md
├── hypertransfer-main/           # 【真正的 HyperTransfer 产品前端】React19+Vite+Tailwind4+shadcn/ui+Wouter（非 Vue!Manus 生成）
│   ├── client/src/               # React 应用（pages/ components/ contexts/ lib/）；黑金风 + i18n + OTP 组件
│   │                             #   已接真实认证：lib/api.ts、contexts/AuthContext.tsx、components/ProtectedRoute.tsx、lib/authFlow.ts
│   │                             #   认证页 pages/{Register,Setup2FA,Login,Verify2FA}.tsx 已接后端
│   │   ├── lib/compliance.ts     #   ★Phase1 网络白名单 + Travel Rule threshold + 链上确认数 + HT Markets OTC fee 计算
│   │   ├── lib/travel-rule.ts    #   ★Travel Rule 数据模型/状态机/provider adapter mock（接 Hex Trust/Sumsub/Notabene/Sygna/TRP 从这扩展）
│   │   ├── lib/hex-safe.ts       #   ★Hex Safe deposit status/确认数/vault 余额/交易日志 mock API+webhook 模型
│   │   ├── lib/treasury-ops.ts   #   ★后台运营 mock：OTC 兑换/脱锚清算/对账/澳门访问隔离/托管证据
│   │   ├── lib/demo-auth.ts      #   ★本地 demo session（Use Demo Account / DEMO_STAFF_TOKEN 工作人员 demo 会话）
│   │   ├── lib/currency.ts       #   ★入金费用模型 DEPOSIT_FEE_MODEL（gas 客户承担）+ HKD 汇率(demo) + computeDepositFees/estimatedReceived
│   │   ├── pages/DemoHome.tsx    #   ★Demo 首页 hub（路由 /）：客户端(→/welcome) + 工作人员端(→/ops) 两个入口卡
│   │   ├── pages/StaffLogin.tsx  #   ★工作人员登录页（路由 /ops）：Okta SSO(demo,免 2FA) 主入口 + 邮箱密码次入口
│   │   └── pages/CasinoOpsPortal.tsx # ★澳门赌场工作人员后台运营站点（路由 /casino-ops，旧 /treasury-controls 为别名）
│   ├── docs/                     # ★HyperTransfer app 流程图：app-flow.{svg,png,md} + gen_flow.py（品牌化矢量，客户可发）
│   ├── backend/                  # ★真实认证后端 FastAPI：send-otp / register / confirm-totp / login(start+verify 两步) / me / logout + CORS
│   │   └── server.py · requirements.txt · run.sh
│   ├── dev.sh                    # 一键起 后端(8000)+前端(3000) 并打印手机访问地址（用 corepack pnpm）
│   ├── docker-compose.yml        # ★运维一键部署:web(nginx静态+反代/api)+backend(uvicorn)+SQLite持久卷 ht-db
│   ├── Dockerfile.frontend       #   前端多阶段构建(pnpm build→nginx);后端 Dockerfile 在 backend/
│   ├── deploy/nginx.conf         #   nginx:静态+SPA回退+ /api→backend:8000 反代
│   ├── .env.example · DEPLOY.md  #   ★env 可配:WEB_PORT/HT_ALLOWED_ORIGINS(CORS)/SMS_API_URL/HT_DB_PATH(默认仍为 demo 值);DEPLOY.md=给运维的部署文档(docker 实测 + GitHub Actions 自动部署 §5)
│   ├── AUTH_INTEGRATION.md       # 认证模块集成说明（架构/流程/文件/生产化待办）
│   └── server/index.ts           # 原 Manus 静态文件服务占位（生产由 backend/ 取代）
├── .github/workflows/            # ★CI/CD：hypertransfer-check.yml(typecheck+build,PR/合并 main 门禁) + hypertransfer-deploy-hk.yml(SSH/rsync 自动部署香港服务器,需配 HK_* secrets,详见 DEPLOY.md §5)
├── next.config.ts                # reactStrictMode: true
├── tsconfig.json                 # 严格模式 + @/* 路径别名
├── package.json
└── TODO.md                       # ★项目级每日待办清单（每日维护；来源：会议纪要 + 业务进展，见 §8.7）
```

## 4. 业务领域核心概念（**修改业务逻辑前必读**）

> **权威来源**：`ProjectInfo/design.md`（1443 行）。代码若与 design.md 冲突，**以 design.md 为口径基准**，并同步更新代码或本文档。
>
> **⚠️ 最新口径（2026-06-23《HyperTransfer 最终流程 v1》，优先级最高）**：客户已确认最终流程 `ProjectInfo/20260623_Hypertransfer_process_v1.md`，决策记录见 `ProjectInfo/20260623-System-Adjustment-Plan-vs-Process-v1.md` §〇。与下文冲突处以 v1 为准：① **退款**=只退客户此前验证过的**原钱包之一、不能输新地址**、退款前再筛查（取代 §4.4c/§8.5 的"确认新 destination"）；② **TR 阈值**=USD 1,000 ≈ HKD 8,000（取代 §4.2/§4.4c 的 8000，旧值是港币门槛当美元的 bug，代码已改）；③ **资产**=仅 USDT（取代 §4.4c 的 USDT+USDC，USDC 前端禁用代码保留，已改）；④ **注册/2FA**=邀请制+Email OTP（短信留 step-up）、2FA 可选+敏感动作 step-up（已决策待改造）；⑤ 新增 KYC 6 个月有效期、Marker 回录、Forex 法币结算、RBAC 5 角色、数据隔离。

### 4.1 关键实体（`src/domain/types.ts`）

| 实体 | 含义 | 关键字段 |
|---|---|---|
| `Customer` | 运营方客户 / Patron | `kycStatus`（含 expired/missing）、`tier`、`jurisdiction`、`riskFlags` |
| `DepositRequest` | 入金办理单（核心聚合根） | `status` 状态机驱动，挂载 `screening` / `travelRule` / `depositAddress` |
| `WalletScreening` | Pre-deposit KYT 筛查结果 | `decision: pass \| edd \| fail`、`riskScore`、`hopCount`、`taintedExposurePercent` |
| `TransactionScreening` | **到账后** Transaction KYT 结果 | `txHash`、`decision: clear \| dirty`、`riskScore`、`sanctionedHit` |
| `TravelRuleSubmission` | FATF Travel Rule 提交 | `status: not_required \| pending \| submitted \| rejected` |
| `DepositAddress` | 单次收款地址 | `provider`、`expiresAt`、`voided`（**single-use 原则**） |
| `ComplianceCase` | 合规案件 | EDD / Fail / funds_dirty / 人工复核 |
| `PayoutRequest` | 出金 / Payout 请求 | `status`、`destinationWallet`、`screeningDecision`、`txHash` |
| `WtaVault` | WTA 金库 | `asset`、`balance`、`pendingSettlement`、`hexSafeVaultId` |
| `AuditLog` | 审计日志 | 全部关键动作留痕 |

### 4.2 Deposit 状态机（`src/domain/state-machine.ts`）

```
draft
  └─> wallet_screening
        ├─> screening_passed ─> travel_rule_pending ─> address_issued ─> monitoring
        │                                                                     │
        │                                                               funds_detected
        │                                                                     │
        │                                                          transaction KYT (Step 5)
        │                                                           ├─> settled       (Funds Clear → WTA)
        │                                                           └─> funds_dirty   (开 ComplianceCase, priority=urgent, 地址作废)
        ├─> edd_required          (开 ComplianceCase, priority=high)
        ├─> blocked               (开 ComplianceCase, priority=urgent，不发地址)
        └─> exception
```

**关键规则**：

- `requiresTravelRule`：`amount >= 8000`；Phase 1 不处理 BTC / ETH 资产
- `canIssueAddress`：`status === "travel_rule_pending" && travelRule.status === "submitted"`
- 失败/EDD 路径**绝不签发地址**
- `funds_dirty`：`DepositAddress.voided` 应标记为 true，**不得再复用该地址**

### 4.3 业务术语（**只用这些名称**）

| 术语 | 含义 | 注意事项 |
|---|---|---|
| **KYT** | Know Your Transaction，钱包/交易级风险分析 | 与 KYC 区分清楚 |
| **KYC** | Know Your Customer，客户身份识别 | 由运营方自有 policy + 第三方 provider 共同决定，**最终决策权在运营方** |
| **Pre-Deposit Wallet Screening** | 发地址前对客户来源钱包做 KYT | 结果 `Pass / EDD / Fail` |
| **FATF Travel Rule** | 虚拟资产转账信息传递监管要求 | beneficiary VASP 由后端配置，**不让员工在 Pad 端填** vault ID / 路由 ID |
| **Hex Trust / Hex Safe** | 托管方 / Custody Provider | 机构托管、MPC、单次地址签发、KYT 集成、policy engine |
| **WTA** | **Treasury Account** | 运营方金库账户，**不是单一地址**，是分层 vault 结构 |
| **Frax** | 业务编排 / 客户记录关联层（如使用） | **不是私钥托管方，不是地址签发方** |
| **Prime Broker** | 报价 / 兑换流动性服务 | 非稳定币入金兑换路径，**当前 demo 不演示** |
| **Source Wallet Address** | 客户用来打款的钱包地址 | **≠** Hex Trust 给运营方签发的 receiving address |
| **Hop Count** | 链上交易图距离 | 1-hop sanctions = Fail，2-3 hop mixer 中低额 = EDD |
| **Funds Clear / Dirty** | 到账后合规判定 | Pre-deposit 筛查**不能替代**到账后筛查 |

**已停用名称（禁止出现）**：把"Frax 是私钥托管方"、"WTA 是单一地址"、"Pad 端填 vault ID" 等说法视为错误，需主动纠正。

### 4.4 Provider Adapter 模式（`src/domain/providers.ts`）

| 接口 | 当前 Mock | 真实对接候选 |
|---|---|---|
| `ScreeningProvider` | `mockScreeningProvider`（按钱包地址子串关键字推断 pass/edd/fail） | Chainalysis / TRM / Elliptic / Hex Trust KYT |
| `TransactionKytProvider` | `mockTransactionKytProvider`（按 depositId 尾数奇偶模拟 clear/dirty） | 同上，但针对到账后 txHash 级筛查 |
| `TravelRuleProvider` | `mockTravelRuleProvider` | **Sumsub API（2026-06-27 已定：KYC + Travel Rule 都用 Sumsub）**；旧候选 Notabene/Sygna/TRP 及 Hex Safe `POST /deposit/submit_travel_rule_details` 不再作 TR 主路径 |
| `AddressProvider` | `mockAddressProvider`（伪造单次地址） | **Hex Safe `POST /vaults/{vaultId}/address`** |
| `ChainMonitorProvider` | `mockChainMonitorProvider` | **Hex Safe `GET /transactions/{traceId}` + webhook** |
| `PayoutProvider` | `mockPayoutProvider` | **Hex Safe `POST /transactions/withdrawal`** |
| `HexSafeProvider`（接口文档） | — | 见 `providers.ts` 内详细注释，映射所有真实端点 |

**约定**：所有外部能力**必须**走 Adapter，禁止在组件 / 路由里直接写真实 provider SDK 调用；Mock 实现要保持纯函数 + 可预测。

### 4.4b HyperTransfer 认证后端（`hypertransfer-main/backend/server.py`，FastAPI）

> **⚠️ 2026-06-24 升级（最终流程 v1 认证改造，已合并 main PR #5/#6/#7）**：`users` 主键已从 phone 改为 **`user_id`(uuid)**，email/phone 可空唯一；新增 **RBAC**（`user_type` + `user_roles` + `require_role` 端点级校验）、**邀请制准入**（`invitations` 表 + RM 提交/Marketing 审核/签发 single-use+72h 链接 + 公开 `/invite` 落地页）、**Email OTP**（`email_otps` 表 + mock console 邮件 + `/register/invite`）、`audit_trail`、admin env 种子（`HT_ADMIN_EMAIL`/`HT_ADMIN_PASSWORD`）。手机短信注册并存保留。下方原描述为旧版手机注册口径，部分已被覆盖（users 已非 phone 主键、注册非唯一入口）。

为 `hypertransfer-main` React 前端提供真实认证。模块:
- **第一因子**:手机号 + **真实短信 OTP**（走 Hypervelocity simpleSend 网关,见 §4.5b）
- **第二因子**:**TOTP**（标准 RFC 6238，SHA1/6位/30秒，兼容 Google/Microsoft Authenticator、Authy、1Password、苹果密码）
- **两步登录**:`/login/start`（手机号或邮箱 + 密码 → 临时 challenge）→ `/login/verify`（TOTP → 会话 token）
- 端点:`/api/send-otp` `/register` `/confirm-totp` `/regenerate-totp` `/password/send-otp` `/password/reset` `/login/start` `/login/verify` `/login/recovery` `/me` `/logout` `/health`
- **TOTP 绑定会话 TTL**:注册后 pending_totp 10 分钟时限(`TOTP_ENROLL_TTL`);超时 confirm 报 410,前端 Setup2FA 倒计时→灰二维码+「重新生成」;`/regenerate-totp` 免短信重签。注意:TOTP 二维码本身静态不刷新(secret 不变),刷新的只是绑定会话。
- **忘记密码**(短信重置):`/password/send-otp`(防账号枚举:未注册也返回 ok,仅 active 真发短信)+ `/password/reset`(校验短信码→改密码→失效全部会话;TOTP 不变)。前端 `pages/ForgotPassword.tsx`,Login「Forgot password?」跳 `/forgot-password`。
- **TOTP 恢复码(备用码)**:confirm-totp 激活时生成 10 个一次性码(明文仅返回一次,库存 sha256;`recovery_codes` 表)。前端 `pages/RecoveryCodes.tsx` 一次性展示(复制/下载/勾选已保存才进 KYC)。`/login/recovery`(challenge+恢复码,消费即作废,大小写/横线归一化)替代 TOTP;Verify2FA 有「用恢复码登录」切换。
- 安全:OTP 限频(60s/日上限/试错上限)+用后即焚、TOTP 防重放、challenge 一次性、登录错误模糊化、会话 token(12h)、CORS
- 存储:SQLite（`hypertransfer_auth.db`，演示用）；前端 token 存 localStorage
- **生产可配置化（已做，默认值不变）**:`HT_ALLOWED_ORIGINS`(CORS,默认`*`)、`SMS_API_URL`/`SMS_SIGN_CN`/`SMS_SIGN_INTL`(短信网关,默认 QA)、`HT_DB_PATH`(DB 路径)均读环境变量;docker-compose / GitHub Actions secrets 注入。**上线前必须**把 CORS 收窄到正式域名、短信切正式网关（部署 workflow 在 production 下若仍是 `*`/QA 会拒绝部署）
- **短信 OTP 一键填入(已实测确认)**:验证码框已加 `autocomplete="one-time-code"`(`Register.tsx` / `ForgotPassword.tsx`)。实测:
  - **iOS Safari**:即使 `http://<局域网IP>:3000` 也能弹"从短信粘贴验证码" ✅ —— 证明代码正确
  - **iOS Chrome**:常**不弹**,是 Chrome-iOS 自身限制(已知现象),非 bug、非代码问题
  - 想进一步提升各浏览器命中率:上线后把短信文案加苹果 domain-bound 格式末行 `@h5.hypercypto.com #验证码`(待域名确定再做)
- **其他需 secure context(HTTPS)的能力**:WebAuthn/Passkey、剪贴板、地理位置、Service Worker/PWA 等在 `http://<局域网IP>` 下不可用;`http://localhost` 是例外(算 secure context)。真机测这些需临时 HTTPS(Cloudflare Tunnel/ngrok)或部署到 HTTPS 域名
- **排查口诀**:某浏览器/系统能力不生效时,先分清是 **secure context(HTTPS)** 要求,还是**特定浏览器差异**——别把两者混为一谈(本次教训:OTP 填充其实是 Chrome-iOS 差异,我一度误归因为 HTTPS)

### 4.4c HyperTransfer 客户端业务 mock 模型 + 赌场后台（`hypertransfer-main/client/src/`）

> 这是 2026-06-08 由 Codex 大幅扩展的一层——把 HyperTransfer 从纯认证原型扩成**带合规入金流 + 赌场工作人员后台**的产品 demo。Operator Demo（`src/domain/`）与本层是**两套独立模型**，枚举/规则不要互相套用。

**新增 mock 库（外部能力先走这里的 adapter，未来接真实 provider 保持同边界）**：

| 文件 | 职责 |
|---|---|
| `lib/compliance.ts` | Phase 1 网络白名单、Travel Rule threshold、链上确认数、HT Markets OTC fee 计算 |
| `lib/travel-rule.ts` | Travel Rule 数据模型 + 状态机 + provider adapter mock（接 Hex Trust/Sumsub/Notabene/Sygna/TRP 从这扩展） |
| `lib/hex-safe.ts` | Hex Safe deposit status / 确认数 / vault 余额 / 交易日志 的 mock API + webhook 模型 |
| `lib/treasury-ops.ts` | 后台运营 mock：OTC 兑换、脱锚清算、对账、澳门访问隔离、托管证据 |
| `lib/demo-auth.ts` | 本地 demo session（`Use Demo Account`） |

**Hex Trust API 当前对接口径（2026-06-22）**：

- **更新（2026-06-27）**：Hex Safe **sandbox 已实接**（不再是纯 mock）。后端 `hypertransfer-main/backend/hexsafe_client.py`（ES256 JWT 签名）+ `server.py` 的 `/api/hexsafe/*` 端点（health/vaults/发址/到账查询/提现，staff·custodian RBAC + 审计 + 提现幂等持久化）+ 前端 `client/src/components/HexSafeLivePanel.tsx`（casino-ops 后台用真实 `hexsafeApi`）均已打通并对 sandbox 实测。**仍 mock 的**：客户端入金流（DepositAddress 随机地址，真实化需「TK 审批后 staff 发址」编排 epic）、KYT/treasury-ops/refund-process。详见 `HANDOFF.md` §八。Hex Safe 实测契约：发址 `POST /v1/vaults/{id}/address` body 仅 `{chainId}`（地址按 vault×链固定）、到账走轮询（sandbox 无 webhook 注册 API）、提现 6 必填 `{enterpriseId,ticker,chainId,amountDecimal,from,to}`。
- `lib/hex-safe.ts` 仍是 Hex Safe deposit status、confirmation count、vault balance、custody logs mock（客户端展示用；后台已改用真实 `hexsafeApi`）。
- `lib/treasury-ops.ts` 仍是 HT Markets OTC、depeg、reconciliation、Macau access exclusion、custody evidence mock。
- `lib/refund-process.ts` 仍是 refund destination KYT、treasury approval、Hex Safe payout mock。
- `ProjectInfo/virtual-asset-ppt.md` 中的 Hex Trust endpoint 名称是概念清单，不是最终 API 合同；真实开发必须以 Hex Trust 合同、正式 API 文档、sandbox、webhook payload sample、OpenAPI/Postman collection 为准。
- 与 Hex Trust 开会时优先拿齐：API auth/IP allowlist/key rotation、deposit address create/get/disable、webhook event/payload/signature/retry/idempotency、status polling by txHash/addressId/transferId/vaultId、transfer/refund approval/quorum、reconciliation API/SFTP/monthly statement schema、HT Markets quote/order 是否有 API。

**关键业务规则（HyperTransfer 客户端，口径来源：客户 Hex Trust 36 问澄清 PDF + design.md）**：

- **HyperTransfer 客户端 Travel Rule 状态枚举**（≠ Operator Demo）：`not_required` / `travel_rule_required` / `travel_rule_submitted` / `travel_rule_accepted` / `travel_rule_rejected` / `manual_review`
- **`canIssueAddress` 三条同时满足**才请求 Hex Safe 地址：`KYC approved` + `source wallet KYT passed` + `Travel Rule gate passed`（失败/EDD 绝不发址）
- **Phase 1 网络白名单**：仅 `USDT on ERC-20/TRC-20` + `USDC on ERC-20`；BTC / ETH 资产不处理，ERC-20 仅表示稳定币网络 rail
- **链上确认数**（按链定义，不能承诺 Operator 自定义值）：EVM 5 confirmations、Tron 4 confirmations
- **HT Markets OTC**：USDT/USDC ↔ USD 双向兑换，0.50% all-in fee，USD 150 minimum fee
- **脱锚（depeg）响应**：0.95 触发阈值 → HT Markets 24/7 OTC 通道
- **Travel Rule gate 由 HyperTransfer/WML 在 Hex Safe 发址前执行**；不要假设当前香港 Hex Trust Limited 合同下平台层会自动 hard-freeze 等待 TR

**客户端 vs 赌场后台的边界（重要）**：

- **客户端**（澳门赌场客户/玩家用）：Landing/注册/2FA/KYC/入金流/History/Support/Settings。**不暴露** WTA、OTC、Hex Safe webhook/API、Macau operator access、custody evidence 等后台控制
- **赌场工作人员后台**：`pages/CasinoOpsPortal.tsx`，路由 **`/casino-ops`**（标题 `Operator VA Operations Portal`，面向 treasury/compliance/finance/audit staff）。承载 WTA settlement、HT Markets OTC、depeg、Hex Safe webhook/API、reconciliation、Macau access exclusion、Hex Trust custody evidence
- 旧 `/treasury-controls` 仅作后台**别名**保留；**不要**从客户 Dashboard / Deposit Success 链接过去（旧 `TreasuryControls.tsx` 已删）
- custody evidence（冷存储/RBAC/quorum/maker-checker/保险 SLA）明确标注为 **Hex Trust provided controls**，不是 HyperTransfer 自营托管

### 4.4d 入金编排后端 + ②KYC 硬阻断 + 退款①前端（2026-06-28，backend/server.py + client）

> process v1 §B/§C 落地。**新增后端 `deposit_requests` 表 + `/api/deposits*` 编排**（patron 入金状态机），把 ②KYC 硬阻断、③真实发址 / 1 USDT 验证、verified_wallets 写入串成一条链；退款①前端从自由地址输入改为 verified-wallet picker。

- **②KYC 硬阻断**：闸门 `user_kyc_ok(user_id)`（approved 且 `valid_until` 未过 6 个月）/ `require_kyc`。挂在 `/api/deposits` 的 **create / screen / issue-address / main**（money-touching steps）。**hold→active = KYC 有效性本身**，不加独立 `hold` 列；`GET /api/deposits/eligibility` 返回 `accountState: active|hold`。注：`/api/hexsafe/*` 是 **staff 手工工具**（custodian/ops 角色守卫，casino-ops 用），其 KYC gate 落在 patron 编排层而非 staff 端点。
  - **演示旁路（非 production）**：`POST /api/sumsub/kyc/demo-approve` 把当前用户 KYC 直接标 `approved`（`review_status="demo-approved"` 标记，使 `/api/sumsub/kyc/status` 不再回查覆盖）+ 落 6 个月有效期。`SUMSUB_ENVIRONMENT == production` 返回 403。KYC 页 pending 步骤显示「Demo: approve & continue」按钮（仅非 production）。**真实 Sumsub 自动核验本就 ~20-30 秒**（非 24h），前端 pending 文案已据此改写。
- **③入金编排（`deposit_requests`）**：状态机 `created → screening_passed/screening_failed → address_issued → verified → main_submitted → settled`（任意可 cancelled）。patron 端点：`create`（建单，KYC gate）、`screen`（来源钱包 KYT）、`issue-address`（三闸门=KYC+screening pass+TR gate 后发址）、`confirm-test`（1 USDT 到账 → **写 `verified_wallets`**）、`main`（最终金额，≥USD1k 标 TR）。staff 端点：`GET /api/deposits` 队列、`marker`、`settle`。
- **真实 vs demo（关键约定）**：配置 Hex Safe → `issue-address` 调 `create_deposit_address`、`confirm-test` 带 txHash 调 `get_deposit_by_tx_hash`、`refund execute` 调真实 withdrawal；**未配置且 `SUMSUB_ENVIRONMENT != production`** → 走 demo 占位（同 `DEMO_LOCAL_SESSION_TOKEN` 语义），让本地/演示全链路可跑；**production 未配置则 503（不静默 demo）**。
- **Wallet Screening 仍是 server 端 mock adapter** `screen_source_wallet`。**真实目标（2026-06-29 用户确认）= 走 Hex Safe API**（需调研其 KYT 端点；Hex Safe sandbox 目前无文档化 screening/KYT 端点 → 确认前回落第三方 KYT：Chainalysis/TRM/Elliptic）。已封装，接通仅换实现。
- **④Forex**：`GET /api/hexsafe/forex/probe`（只读端点探测 + 如实回报）。据 Hex Trust 口径 **HT Markets OTC 无 quote/order API**，故 `settle` 的 USDT→法币兑换为 **demo**（`DEPOSIT_FIAT_RATE`）。
- **⑤Marker / Receipt**：`marker`（marketing 录回外部编号，只读）、`settle`（生成 `receipt_ref` + 法币结算）均 **demo**。
- **①退款前端**：`pages/RefundProcess.tsx` 自由地址 `<input>` → **verified-wallet picker**（`refundApi.wallets()`，demo 回退=入金来源钱包）；合规红线（只退已验证原钱包、禁止自由输入新地址）前后端双重落地，后端 `refund_create` 校验 walletId 必属本人 `verified_wallets`（否则 400）。
  - **（2026-06-29 重构）** 退款页**不再以单笔入金为中心、不再写死金额**：改为 **选已验证原钱包 → 自由输入退款金额（可多可少，与入金额无关）→ 可选原因 → 创建**。退款金额客户端**不设上限**——对应 process v1 §C「Sufficient Fund in Vault?」由员工端 vault 余额校验 + 管理层审批兜底；后端 `/api/refunds` 早已接受任意 `amountDecimal`。**退款入口加到 Dashboard**（`pages/Dashboard.tsx`，门槛=KYC approved + 有 verified wallet 才可点）。注：vault 余额校验 / 审批 / Hex Safe 放款仍是 `/casino-ops` 退款队列 mock，demo 不真的校验 vault 余额。`createRefundRequest` 对 demo 占位网络 `"demo"` 豁免 Phase 1 网络白名单（资产白名单仍生效），修掉"Demo: skip & continue"后退款报错。
- **前端客户端 API**：`client/src/lib/api.ts` 加 `depositApi` / `refundApi`；4 个入金页 **backend-first + try/catch mock 回退**（后端不可用/未登录/未过 KYC → 落回原 mock，演示不中断）。
- **★三道合规闸门执行方（2026-06-29 用户确认口径，入金/退款通用）**：
  1. **KYC** = **Sumsub API 自动核验**，有效期 **6 个月**，超期重做（已接：`/api/sumsub/*` + `valid_until` 闸门）。
  2. **Wallet KYT（来源钱包 / 退款原钱包筛查）** = 走 **Hex Safe API**（需调研其 KYT 端点；sandbox 暂无文档化端点，确认前回落第三方 KYT；现为 `screen_source_wallet` mock 占位）。
  3. **Sufficient Fund in Vault（process v1 §C）** = **人工登录 Hex Trust 后台**核对 vault 余额，**非应用内自动查**（demo 里体现为 treasury/管理层 approve + 文案）。
  casino-ops 退款队列 UI（`components/RefundQueuePanel.tsx`）已按此为每道闸门标注 provider（KYC·Sumsub 6-mo / Wallet KYT·Hex Safe API mock / Sufficient funds·人工 Hex Trust 后台）。
- **内部管理界面**（2026-06-28，全部 4 块完成，嵌入 `/casino-ops`，`components/ops-ui.tsx` 共用展示组件，均按 `useAuth().user.roles` 显隐 + 后端 `require_role` 真守卫 + 友好 403）：
  - `RefundQueuePanel` 退款队列（`/api/refunds*`：compliance KYT screen → management approve → custodian execute；execute 无 Hex Safe 凭据如实 toast）
  - `DepositQueuePanel` 入金队列（`/api/deposits` queue + `marker`(marketing/ops；录入 marker reference 即 settled，客户 history 可见 marker reference)）
  - `InvitationReviewPanel` 邀请审核（`invitationApi`：RM create → marketing approve/reject → issue single-use+72h link）
  - `StaffAdminPanel` 员工管理（`adminApi.createStaff`，admin 限定，返回 TOTP 绑定 QR）
  - `lib/api.ts` 补 `depositApi.queue/marker/settle`。验证 tsc + build + TestClient（退款 10/10、邀请/员工 13/13）。
- **⑥SMTP / 迁移**：`send_email` 已 env-gated（`SMTP_HOST` 配则真发，否则 console）；旧 `hypertransfer_auth.db` 旧 schema 在 init_db 自动迁移（phone-PK→user_id + 全部新表 + `.bak`，已在副本验证）。
- 验证：后端 TestClient 31/31 + 活动服务器 curl 全链路 deposit→refund；前端 `tsc` + `vite build` 全绿。

### 4.4e 邀请流打磨 + 入金费用模型 + Okta 员工登录 + Demo 首页 + demo 便利（2026-06-30）

> 分支 `feat/invite-flow-and-demo-login`（PR #10）。这批是**演示体验层**打磨：把邀请审批收敛成 3 态、入金加费用/汇率/凭证、工作人员端改 Okta demo、加 Demo 首页 hub，并把全链路做成"自动填码 + 一键过"的可重复 demo。**所有 demo 便利均 gated on 后端 `HT_DEMO_BYPASS_2FA` + 非 production，生产不受影响。**

- **入金费用模型（`lib/currency.ts` `DEPOSIT_FEE_MODEL`，demo 值）**：**Gas 费由客户承担并从到账金额扣除**（口径较早前"Hex Trust 承担 / 免 gas"**已反转**为用户自付）。`MainDeposit` 确认前展示**汇率（HKD 估值，demo）+ 费用明细**（仅 gas `0.03 USDT`，不展示 wallet screening fee），`estimatedReceived = deposit − gas`；**Step 1 验证款按实际到账金额计入总计划金额**，真实用户可能少于/多于 1 USDT，Step 2 只提示/模拟发送 `max(total − actual_step1, 0)` 的剩余主入金；若 `actual_step1 >= total`，不要求二次转，成功页显示实际到账合计并保留 Planned Amount 提醒。Step 2 顶部金额框为只读剩余待转金额，verified receiving address 只展示不提供 copy/edit。后端 `/api/deposits/{id}/main` 仍记录计划总金额用于 Travel Rule/后台，demo settlement 与成功页记录实际到账合计；`DepositSuccess` credited 用 `estimatedReceived`，并显示 **txHash（区块浏览器链接，`lib/compliance.ts` `blockExplorerTxUrl`：tron→tronscan / ethereum→etherscan）+ Reference ID + 结算「in progress · pending marker」**（录 Marker 前 pending；录入后显示 `Settled · <marker ref>`）。**txHash 只代表链上交易凭证/receipt id，不代表 casino marker 已给到客户；客户 History 入金状态三态为 `Pending` / `Deposit Completed` / `Settled`，其中 Settled = staff 已录 marker reference。首页 DemoHome 底部显示 `v<package version>+<git short sha>`（由 `vite.config.ts` 注入），用于线上页面与 Git 版本对齐。**全额容错** `handleFullAmountDetected`：客户直接把全额打进 1 USDT 验证地址也不卡流程。
- **邀请流（`InvitationReviewPanel.tsx` + 后端 `server.py`）**：审批 **3 态收敛** `submitted / approved / rejected`（去掉 `issued`，**批准即自动签发** `approve_invitation`）；**拒绝必填原因**（存 `details_json.rejectReason`）；RM 可 **resubmit**（`invitationApi.resubmit`）；批准后**转 RM 交付卡**（持久展示**邀请链接 + 二维码 `inv.qrPngBase64` + 链接时效状态** `Valid · Xh Ym left`/`Link expired`，过期可 resend）。**RM 表单字段简化**：`Member ID`（白标，**禁用「Win ID」**）+ `First Name` + `Last Name` + `Email`（去 Age/Phone/Passport），`patronName = First + " " + Last`，Created 到秒。**邀请链接 TTL 72h→6h**（`INVITE_TTL`）。
- **工作人员端登录 = Okta SSO（demo，免 2FA）**：`/ops`（`StaffLogin.tsx`）主按钮「Sign in with Okta」→ `finish(DEMO_STAFF_TOKEN, DEMO_STAFF_USER)` 直接进 `/casino-ops`（admin 全权限；后端 `user_from_token` 识别 `DEMO_STAFF_SESSION_TOKEN`→`demo-staff-id`→admin 角色），邮箱+密码为次要入口。生产需真实接 Okta OIDC。
- **Demo 首页 hub（`DemoHome.tsx`，路由 `/`）**：客户端入口 → `/welcome`、工作人员端入口 → `/ops` 两张卡（`App.tsx` 把原 Landing 移到 `/welcome`）。卡片动画**只做 y-slide、不做 opacity**（规避 framer-motion 在自动化下 RAF 节流卡在 opacity:0）。
- **Demo 便利（可重复跑）**：Email/SMS OTP 发送后自动填码 + 2FA（首登 `Setup2FA` / 登录 `Verify2FA` / 忘密 `ForgotPassword` / 员工 `StaffLogin`）自动填 6 位 + 点击必过；已存在用户重复注册也显示成功；邀请可重复跑（后端 `register_invite` + `invitation_is_redeemable` demo 放宽）。**各页带回后端 `demo` flag** 才显示自动填提示。
- **入金 skip 门槛修复**：`NewDeposit` / `DepositAddress` 的「skip & continue」原用 `import.meta.env.DEV`（线上 build=false → 线上 demo 点不了），改为**后端驱动条件**（网络未配置 / `selectedNetwork==="demo"`），**线上 demo 也能跑**。
- **seed**：`seed_demo.py` **不再预置** `newvip@demo.local` 测试邀请（邀请队列演示时由 RM 表单现场提交，保留 reset-by-id 幂等清理）。
- 验证：`corepack pnpm run check`（tsc）✅ + **Chrome MCP 真机点测全链路通过**。已知限制：Okta 未真接；汇率/gas 为 demo 值（真实待 Hex Trust 汇率口径）。

### 4.5 Hex Safe REST API 接入要点

- **Base URL**：`https://api.hexsafe.hextrust.com`
- **Auth 方式**：`x-api-key: hsk_xxx` + `Authorization: Bearer <ES256 JWT>`
  - JWT claims：`api-key`、`nonce`、`uri`、`exp`；POST/PUT 额外加 `digest`（SHA-512 of body，base64url）
- **幂等性**：发起交易的 POST 请求带 `x-request-id: <UUID>` 头，重发同一值返回原结果
- **核心端点映射**：

| 业务动作 | Hex Safe 端点 |
|---|---|
| 列出 / 查 WTA vault | `GET /vaults` · `GET /vaults/{vaultId}` |
| **生成入金地址** | `POST /vaults/{vaultId}/address` |
| 查询交易（到账监听） | `GET /transactions/{traceId}` |
| **发起出金 / payout** | `POST /transactions/withdrawal` |
| 按 txHash 查入金 | `GET /deposit/{txHash}` |
| **提交 / 查 Travel Rule** | `POST /deposit/submit_travel_rule_details` · `GET /deposit/travel_rule/{traceId}` |
| VASP 目录 / 支持链 / 资产 | `GET /travel_rule/vasp` · `GET /supported_chains` · `GET /supported_assets` |

**资产口径注意**：Phase 1 不处理 BTC / ETH 资产；退款 / payout 仅在支持的 USDT / USDC 稳定币 rail 内做 destination-wallet KYT、审批、custody transfer 和 txHash 记录。

### 4.5b 短信网关（Hypervelocity simpleSend）

- **Endpoint**:`POST https://hv-test.hypervelocity.cn/api/sms/simpleSend`（QA 环境，测试免白名单）
- **Body**:`{areaCode, phoneNumber, textMessage, sign}`；大陆号码 sign 用 `【武汉极数信息技术】`，国际用 `[Hypervelocity]`
- **成功判定**:文档写 `code:"200"`，但**实测返回 `code:"0"` + `message:"SUCCESS"`** → 代码两者都兼容
- 接口文档原件:`~/Downloads/sms-simpleSend API Documentation_HV.docx`

### 4.6 演示账号（仅本地 mock，**禁止用于任何真实环境**）

```
Username: va.host.demo@operator.example
Password: Operator#2026!
```

- `operator.example` 是文档保留域名（RFC 2606），不是真实邮箱
- 该账号**仅**作为 demo 登录流程的硬编码占位（见 `src/components/pad-deposit-app.tsx`）
- 正式版必须接 Okta OIDC + MFA（推荐 Passkey / WebAuthn / FIDO2，不用 SMS OTP）
- **HyperTransfer 工作人员端登录（`/ops`）= Okta SSO demo（免 2FA）**：点「Sign in with Okta」直接进 `/casino-ops`（admin 全权限，`DEMO_STAFF_TOKEN`）；生产接真实 Okta OIDC（见 §4.4e）。
- **HyperTransfer demo 便利（2026-06-30，全 gated on 后端 `HT_DEMO_BYPASS_2FA` + 非 production）**：全链路（邀请→Email OTP→注册→2FA→登录→忘密）**自动填码 + 点击必过**、已存在用户重复注册也成功、邀请可重复跑。**生产环境这些便利全部关闭**（见 §4.4e）。

## 5. 第一版范围边界

**包含**：

- 员工 Pad App 流程（登录 mock → patron 搜索 → 入金录入 → KYT → Travel Rule → 发址 → 监听 → Transaction KYT Clear/Dirty → WTA 入账）
- **Funds Dirty 完整分支**（到账后 KYT 判 dirty → 阻断 + 地址作废提示）
- 运营后台（队列 / 详情 / case / audit）
- 全部 mock provider；内置 5 个客户（含 expired / missing KYC 状态演示）
- **Treasury WTA 页面**、**Refund / Payout 模块**、Compliance Case **Request Documents** 动作
- **HyperTransfer 认证模块**（`hypertransfer-main/`）：注册 / 短信 OTP / TOTP MFA / 两步登录，已接真实 FastAPI 后端 + 真实短信
- **HyperTransfer 客户端入金流 + 赌场后台**（见 §4.4c）：客户端 KYC→KYT→Travel Rule→发址→确认→入金成功；赌场工作人员后台 `/casino-ops`（WTA settlement / HT Markets OTC / depeg / Hex Safe webhook / reconciliation / Macau access exclusion / custody evidence，全 mock）
- **入金编排后端 + ②KYC 硬阻断 + 退款① wallet-picker**（见 §4.4d）：`deposit_requests` 表 + `/api/deposits*` 状态机（create→screen→issue-address→confirm-test(写 verified_wallets)→main + staff queue/marker/settle + forex probe）；KYC 硬阻断挂入金/退款关键动作；退款只退已验证原钱包（前后端双重落地）。**真实 vs demo**：配 Hex Safe 走真实发址/到账/提现，否则非 production demo 占位（前端 backend-first + mock 回退，演示不中断）

**不包含**（**不要在当前版本加这些**）：

- 真实资金转移、真实托管签名、真实链上转账
- 真实 Okta SSO、真实 MFA（Hex Safe API 的 `x-api-key` + JWT 也是 mock）
- 真实多签移动审批 App / 真实 STR / SAR / HKFIO 报送
- Prime Broker 报价交易 / WTA 实际清算
- Admin / 集成配置 UI（provider 配置、风险阈值管理）
- 数据库持久化（Operator Demo 一切 in-memory mock；HyperTransfer 认证用 SQLite 演示，未上生产 DB）

## 6. 编码约定（项目特定 — 覆盖用户级默认）

### 6.1 通用

- **TypeScript strict + `noUncheckedIndexedAccess`**：数组/对象索引访问要处理 `undefined`
- **Next.js App Router**（Operator Demo）：默认 RSC，需要交互的组件加 `"use client"`
- **路径**：Operator Demo 用 `@/*` 别名；HyperTransfer 前端用 `@/` → `client/src`
- **样式**：Operator Demo 集中在 `app/globals.css`，**不要**引入 Tailwind；HyperTransfer 前端用 Tailwind 4 + shadcn/ui（两套独立,别混）
- **移动端全高容器用 `100svh`，不要用 `100dvh`**（HyperTransfer 前端）：`dvh` 会随软键盘弹起实时伸缩，导致 `min-h` 容器 + `mt-auto` 贴底元素反复重排、页面上下抖动；`svh` 是固定小视口高度,键盘弹出不变 → 布局锁死。`Shell.tsx`/`Landing.tsx`/`ProtectedRoute.tsx` 已统一 `svh`。注:`body` 已 `@apply bg-background`,与全高容器同色,svh 底部不会露缝
- **数据**：Operator Demo 演示数据放 `src/data/seed.ts`；不要在组件里再造 seed
- **校验**：表单用 Zod / 现有 `lib/validation.ts`

### 6.2 领域代码（Operator Demo）

- 业务规则只能改 `src/domain/`，组件层不要复制规则
- 状态流转必须经 `applyScreening` / `createTravelRuleDraft` / `createComplianceCase` 等纯函数
- 新增 provider 时先扩 `providers.ts` 接口，再加 mock 实现，最后接组件
- 修改 `DepositStatus` / `KycStatus` 等枚举时，**同步更新** `statusLabel` 与 UI 徽章配色

### 6.3 注释

- **禁止废话注释**（`// 导入模块`、`// 返回结果`）；注释只解释**非显然的"为什么"**
- demo / mock 桩位置加 `// MOCK:` 前缀，方便后续真实替换

### 6.4 命名

- 类型 / 实体：`PascalCase`；函数 / 变量：`camelCase`
- 路由文件保持框架约定；mock provider 全部以 `mock` 前缀

### 6.5 提交前自检

- Operator Demo:`npm run typecheck` + `npm run build` 必须通过
- HyperTransfer 前端:`corepack pnpm run check`（tsc）必须通过
- 不要 commit `.env*` / `*.key` / `*.pem` / `*.db` / `.venv` / `node_modules`
- diff 中**不能**出现真实 11 位手机号、18 位身份证、真实姓名（demo `Avery Chen / Morgan Lee / Taylor Wong / Iris Lau / Noah Ho / Mia Chan` 是虚构演示名，允许）。
  注:一次性联调测试手机号不要写进任何提交。

## 7. 合规与数据要求

- **白标硬规则（客户名脱敏）**：整个项目**禁止出现客户真实名称「永利」「Wynn」（含大小写、拼音、文件名、二维码/截图、代码标识符）**。一律用中性词替代——英文 `Operator` / `the operator`，中文「运营方」，金库为 `Treasury Account`（`WTA` 缩写可保留，展开不带 Wynn），客户编号字段用 `Member ID`（不用 Wynn ID）。新增代码/文档/演示材料前自检；发现残留立即替换。（演示账号 `va.host.demo@operator.example` 是 RFC 2606 保留域占位，不视为违规。）
- 任何代码 / 注释 / commit message / 文档中：**禁止**出现真实客户姓名、护照号、证件号、wallet 实控人信息
- PII 准则照搬用户级 `~/AGENTS.md` 的金融/PII 规则
- 涉及监管口径修改（KYT 决策树、Travel Rule 字段、Hex Trust 接口边界）必须**先**核对 `ProjectInfo/design.md`，**再**改代码
- 跨境数据传输 / VASP 监管：HK 与 Macau 合规要求不同，对外口径不要含糊

## 8. 已知技术债 / TODO（按优先级）

1. **无任何测试** — 至少要加状态机 + Zod schema + provider mock 的单测
2. **无持久化（Operator Demo）** — 计划：Prisma + SQLite 起步
3. **`src/index.ts`** 是老 Node 入口残留，可清理
4. **`pad-deposit-app.tsx`** / `kyc-pad-app.tsx` / `refund-pad-app.tsx` 均超过 200 行，后续按 step/view 拆分
5. **Operator Demo 路由缺统一导航**
6. **mock 决策依赖钱包地址字符串关键字** —— 仅适合 demo
7. **Refund / Payout** 后端已落地（`/api/refunds*` + 真实 withdrawal 调用，配 Hex Safe 时；前端 wallet-picker），但 re-Wallet KYT 仍 staff 录入 mock、真实放行需 funded vault + Hex Safe quorum（见 §4.4d / §4.4c）
8. **KYC + Deposit 两个 Pad App 流程仍隔离**
9. **HyperTransfer 认证**:SQLite 非生产 DB；TOTP/OTP 密钥明文存储；会话用 localStorage token 而非 HttpOnly Cookie；缺 TOTP 恢复码 / 换机流程 / 图形验证码防短信轰炸 / step-up（生产化清单见 `hypertransfer-main/backend/server.py` 底部）

## 8.5 商业化上下文（**修改报价 / 方案 / 客户材料前必读**）

| 项 | 值 |
|---|---|
| 公司名 | **Heypervelocity** |
| 产品名 | **HyperTransfer** |
| 产品站点 | `https://h5.hypercypto.com` |
| 线上 demo 登录 | `demo.user@hypercrypto.com` / `Demo@12345`；也可在 `/login` 点 `Use Demo Account`。用户自己注册的线上账号不保存明文密码，忘记只能走 `Forgot password?` |
| HyperTransfer **实际**技术栈 | **React 19 + Vite + Tailwind 4 + shadcn/ui + Wouter（前端，见 `hypertransfer-main/`）+ Python/FastAPI（认证后端）+ SQLite**。⚠️ 早期商业方案写的"Vue 3 + Python"是**规划口径**;落地的真实前端代码是 **React**,以此为准 |
| 最新报价（Phase 1） | **USD 146,250**（325 人天 × USD 450/人天），另 10% 年维护费 USD 14,625 |
| 报价文件 | `ClientMeetings/HyperTransfer-Development-Quotation.xlsx` |
| 最新客户会议纪要 | `ClientMeetings/2026-06-05-Crypto-Compliance-KYC-Rollout-Meeting-Notes.md`（2026-06-05 Granola 摘要整理；涉及 Hex Trust / KYC / Travel Rule / testing timeline；具体细节以该文件为准） |
| 客户 Hex Trust 澄清回复 | `ProjectInfo/Operator_Macau_VA_Hex_Trust_Clarification_Request_Completed_04_June.pdf`（36 问澄清；Phase1 网络/确认数 EVM5·Tron4/Webhook·API/TR 平台边界/KYT/冷存储/资质——客户端业务规则的权威口径来源） |
| HT Markets OTC 口径 | USDT/USDC ↔ USD 双向，**0.50% all-in fee，USD 150 minimum**；脱锚阈值 0.95 触发 24/7 OTC（详见 §4.4c） |
| 商业方案 | `CompanyPlan/HyperTransfer-HK-Business-Plan.md` |
| 牌照路线图 | `CompanyPlan/HK-Licensing-Roadmap.md`（各阶段时间/投入/解锁能力，权威来源） |
| 第三方服务成本 | `CompanyPlan/Third-Party-Services-Cost.md`（客户自采，非我方报价） |
| 目标客户 | OTC Desk（最快出单）、博彩/综合度假村（最高客单价）、持牌 VATP、奢侈酒店、家族办公室、稳定币发行方 |
| 核心合作方 | Hex Trust（托管）、Chainalysis/TRM/Elliptic（KYT）、Sumsub/Onfido（KYC） |
| 牌照路线 | **Phase 0** 无需牌照（纯技术服务商，立即）→ **Phase 1** MSO（法币兑换结算）→ **Phase 2** VA Dealing（自营 OTC）→ **Phase 3** VA Custody（自营托管，可选）。⚠️ 此处 Phase 0–3 是**牌照阶段**编号，与报价里的 "Phase 1 = USD 146,250 开发交付" 不是同一套编号；详见 `CompanyPlan/HK-Licensing-Roadmap.md` |

**注意**：
- **Operator Demo 和 HyperTransfer 是两个产品**，技术栈不同，报价分开
- 报价单中**不含税**，需要时明确注明 "excl. tax"；货币一律用 `"USD "#,##0` 格式（避免 Excel locale 把 `$` 替换成 `¥`）
- 报价使用 **Item 01–11** 编号，不用 Phase（Phase 已用于 HyperTransfer 商业化阶段）
- `ClientMeetings/` 下可能包含 Excel 临时文件（`~$*.xlsx`），不要 commit

### 8.6 线上测试入口（2026-06-22 已核 200）

| 页面 | URL |
|---|---|
| 首页 | `https://h5.hypercypto.com/` |
| 登录 | `https://h5.hypercypto.com/login` |
| KYC | `https://h5.hypercypto.com/kyc` |
| Dashboard | `https://h5.hypercypto.com/dashboard` |
| 新建入金 | `https://h5.hypercypto.com/new-deposit` |
| Withdrawal demo（兼容旧路由） | `https://h5.hypercypto.com/refund` |
| 赌场工作人员后台 | `https://h5.hypercypto.com/casino-ops` |

> ⏳ **随 PR #10（`feat/invite-flow-and-demo-login`）合并 `main` 后**：`/` 变为 **Demo 首页 hub**（客户端 → `/welcome`、工作人员端 → `/ops`）；新增 `/ops` **工作人员 Okta 登录页**。合并部署后需重新核这两条并补进上表。

## 8.7 项目级待办清单（每日维护）

- **位置**：仓库根 `TODO.md`。这是**项目级**滚动待办，区别于用户级 `~/.claude/todolist.md`（个人 / 跨项目每日待办，由全局规则维护）。两者分开：本项目事项进 `TODO.md`，跨项目 / 个人事项进用户级文件。
- **来源**：`ClientMeetings/` 会议纪要、业务 / 合规进展、技术债（§8）。
- **字段**：优先级（P0/P1/P2）、事项、负责人（Owner）、目标日期、状态（⬜ 待办 / 🔄 进行中 / ❓ 待决策 / ⛔ 阻塞 / ✅ 已完成）。
- **时间口径**：CST（UTC+8）；相对时间（如“7 月中旬”“下周三”）转绝对日期 `YYYY-MM-DD（周X）`。
- **每日维护机制**：每天（或每次进入本项目工作时）跟进 `TODO.md`——
  1. 已完成项标 ✅ 并注完成日期；
  2. 有新会议纪要 / 新需求时追加条目；
  3. 过期或变更的更新目标日期与状态；
  4. 更新文件顶部「最后更新」为当天 `YYYY-MM-DD（周X）`。
- 待办涉及业务流 / 术语 / Travel Rule / Hex Trust 边界 / 报价变化的，完成时同步回 `AGENTS.md`、本文件、`ProjectInfo/design.md`。

## 9. 调用约定（AI 助手在本仓库的行为）

| 场景 | 默认行为 |
|---|---|
| 用户说"评估一下" | 只输出方案 / 风险 / 成本，不动文件 |
| 用户说"动手 / 开干 / 做吧" | 直接执行 |
| 用户说"提交 / commit" | 才能 `git add` + `git commit`；**不要直接提交到 `main`**，从最新 `main` 新建任务分支（`feature/` `fix/` `docs/` `ops/` `codex/<scope>`）再提交 |
| 用户说"推送 / push" | 才能 `git push`；remote 已配 `origin → github.com/eason36/Hyper-Transfer`；**经 GitHub PR + Squash merge 合并 `main`**，别直推。完整分支/PR/GitHub 保护策略见 `AGENTS.md`「代码管理策略」 |
| 合并前自检 | diff 无 `.env*`/DB/Office 临时文件/node_modules/日志/真实手机号/PII/密钥；HyperTransfer 至少过 `corepack pnpm run check`；动到术语/TR/Hex Trust/报价/纪要时相关文档已同步 |
| 完成可测试批次 | 在 `AGENTS.md`「Release Notes」追加该版本入口/功能/文件/验证/已知限制 |
| 修改业务流 / 术语 | 同步检查并更新 `ProjectInfo/design.md`、本 `CLAUDE.md`「业务术语」表、以及 `AGENTS.md` |
| 新增依赖 | Operator Demo 用 `npm install`；HyperTransfer 用 `corepack pnpm add`；不要手写版本号 |
| 改文件 ≥ 3 处 / 改 ≥ 3 个文件 | 先 `TodoWrite` 列计划 |

## 10. 更新机制

下面任一情况发生，AI 助手都应**主动**追加 / 修订本文件，并在响应里告知用户：

| 触发事件 | 需更新的章节 |
|---|---|
| 新增 / 移除依赖 | §2 技术栈 |
| 新增 / 重命名顶级目录或主路由 | §3 目录结构 |
| 商业化上下文变化（报价 / 客户 / 牌照 / 公司名 / 产品名 / 技术栈） | §8.5 |
| 新增 / 修改业务实体、状态、字段 | §4.1 / §4.2 |
| 业务术语口径变化 | §4.3 |
| 新增 Provider Adapter 接口或替换真实 provider | §4.4 |
| 演示账号 / mock 数据规则变更 | §4.6 / §8 |
| 第一版边界变化 | §5 |
| 编码约定 / 命名 / 注释规则变化 | §6 |
| 合规要求 / 监管口径变化 | §7 |
| 完成一项 TODO 或新增技术债 | §8 |

**更新规则**：

1. **小幅修订**直接改对应章节，**不需要**用户确认
2. **大幅重写或新增章节**需在响应里高亮告知用户
3. 更新时务必**同步更新文末「最后更新」日期**
4. 不要把**项目级**约束塞到用户级 `~/AGENTS.md` 或 Cursor User Rules，反向也不要
5. 真实公司业务 / 客户 / 合同条款**不写入本文件**

---

*最后更新：2026-08-21（周六·VIP Requests Round 2, 分支 feat/ux-visual-polish）(patron_name 拆 first_name/last_name(DDL/迁移/模型/投影/seed/测试); 表单 First+Last name 必填, Intended deposit (USD)+输入千分位格式化(50,000), Note 移底部大文本框, 按钮改 Send for approval(去加号); 列表分两区: Need Your Attention(未启用+每行 Remind 提醒邮件按钮, 新增后端 POST /admission-cases/{id}/remind 宽松守卫 terminal 409) + Approve VIP Request(已启用, tag 显示 HyperTransfer active); 左侧菜单拆三个(New VIP Request/Need Your Attention/Approve VIP Request, AdmissionCasePanel 加 view prop form/attention/approved/all, host 默认落 vip-new); Python 170/170 ✅ tsc ✅ pnpm 39/39 ✅ build ✅, Playwright 实测 + 四角色 20/20 ✅, bob 已重部署。早前历史见下。）*
*历史：2026-08-21（周六·USDC 支持 + 审批队列可达, feedback round 2）（补 `AGENTS.md` 2026-08-21 release note: ①开放 USDC(USDT on ERC-20/TRC-20 + USDC on ERC-20), NewDeposit 资产/网络选择器, 后端 asset 门 USDT+USDC; ②修审批队列演示缺口: complete_dossier 建 intent 即 payment_precheck、实际确认后 leader_pending, kyc_first KYC 通过自动进队列; per-transfer pack 仅 service_enabled 后可建; ③seed 增 ADM-DEMO-0002(leader_pending, USDC 预检 intent)。验证: Python 168/168 ✅、pnpm 28/28 ✅、check/build ✅, bob 已重部署。早前历史见下。）*
*历史：2026-08-21（周六·多角色 onboarding + 审批/结算 visibility + KYC 减摩擦, feedback round）（补 `AGENTS.md` 2026-08-21 release note: ①员工公司邮箱自助注册(`/staff-onboard`, host/leader/ops 三角色, TOTP 激活, 登录按角色落工作台) + Okta 绑定 demo 占位(生产 503 fail closed); ②leader 决策/拒批原因落库并给 Host 看, leader dossier 含 Host note + KYC 状态, Host case 视图聚合到账/Cage/对账 + timeline; ③KYC 表单收敛为 level 必填(姓名/出生日期/国籍/电话+同意), 证件/住址/财务改由 Sumsub 按其 level 收集, 配置存在时提供 WebSDK 启动(未配置走 demo approve), liveness 仅在 level 含该步骤时执行。验证: Python 160/160 ✅、pnpm test 28/28 ✅、check/build ✅。早前历史见下。）*
*历史：2026-08-21（周六·Host-led VIP admission + per-transfer compliance packs，分支 `docs/host-led-vip-admission-plan`，Task 1–9 每 Task 独立 commit）（新增口径：Host 企业身份激活（staff 会话=Okta 边界，生产无配置 fail closed）→ 同一 case 双通道邀请（email link 6h / 动态 QR 15min，均须邀请邮箱 + Email OTP 认领，认领后同案 session 全作废 410，错误邮箱中性 400 不枚举）→ case-aware KYC（`valid_until=min(通过日+6 日历月,最早证件到期日)`，日历月算法废除固定 `180*86400`；KYC 只从 `kyc_in_progress` 移出；受限结果走 `compliance_review` 中性文案；Host 只见安全原因分类，绝无证件号/原始 detail）→ 单一 leader 准入审批（`leader` 角色 + 可选 `HT_LEADER_USER_ID` 白名单，生产未配 503；`approved->service_enabled` / `rejected` 必填业务原因；Host/Compliance/Marketing/Admin 不能决策；审批/拒绝/重交通知走 `send_email` 并留 audit）→ 每笔转账独立不可变 Transaction Compliance Pack（HKD 8,000 只切 basic/enhanced 字段深度，绝非豁免，废除 `not_required`；实际确认指纹变更作废旧 pack、强制重验、阻发地址）→ KYT+TR 双通过才发托管地址（production 缺 Notabene/Hex Safe 503 fail closed；**不声称真实接 Okta/Notabene/Hex Trust/KYT**）→ HK Operations 手动录 Cage confirmation ID（legacy deposit 仍 Marker ref 原样保留）→ Finance reconciliation → settled（retention≥5 年 + demo monitor 标记关联转账给 Compliance）。验证：Python unittest discover **143/143** ✅、`corepack pnpm test` ✅、`check` ✅、`build` ✅（仅 chunk warning）、`seed_demo.py` 幂等。详见 `AGENTS.md` 2026-08-21 release note。早前历史见下。）*
*历史：2026-07-03（周五·KYC 表单精简 + USDT 入金/钱包筛查/Travel Rule 合并）（补 `AGENTS.md` 2026-07-03 release note：Dashboard 删除重复状态 badge 与 Recent Activity 空态副文案，KYC 删除顶部提示 box、`Applicant data` 改 `Personal Details`、国家列表补全、手机号拆为区号+号码、Tax Residence 从主表单移除并按 Sumsub level/questionnaire 条件项处理、Occupation/Source of Funds 改 dropdown、Supporting Documents 精简，KYC pending 去 provider/webhook/demo 技术文案；`/new-deposit` 合并 USDT amount、source wallet KYT 与 wallet pass 后 Travel Rule 输入。已完成 `check`、`build`、`git diff --check` 与 Chrome Playwright 页面/链路验证。早前历史见下。）*
*历史：2026-07-02（周四·线上版本号 build metadata 修复）（补 `AGENTS.md` 2026-07-02 release note：前端 Docker build 新增 `VITE_APP_VERSION` / `VITE_GIT_COMMIT` build args，compose 传入 build args，GitHub Actions 香港部署用 `GITHUB_SHA::7` 导出 `VITE_GIT_COMMIT`，手工 `deploy.sh` 用 `git rev-parse --short HEAD` 导出，修复 Demo hub 版本号显示 `v1.0.0+local` 的问题。验证 `VITE_GIT_COMMIT=versioncheck corepack pnpm run build` ✅（产物包含 `v1.0.0+versioncheck`）、`VITE_GIT_COMMIT=composecheck docker compose config` ✅、`corepack pnpm run check` ✅、`git diff --check` ✅。早前历史见下。）*
*历史：2026-07-02（周四·PDF 修改意见全量收口 + Travel Rule Sumsub 核对）（补 `AGENTS.md` 2026-07-02 release note：KYC 必填星号/底部 mandatory note/section title/Legal 与 Optional 文案收口；Travel Rule 按 Sumsub 官方文档核对后移除客户页 Beneficiary Route 与 Provider Strategy，但保留系统固定 counterparty route/provider adapter，并增加 provider config guard；MainDeposit 删除 `Deposit Confirmed` 中间页；Dashboard 删除 Deposit Overview / Withdraw Funds / History quick link，Recent Activity 改 amount/date/status + 点击展开详情；History 状态同步 WIP / Transferred / Settled；Casino Ops deposit queue 强化 session date、staff task 与 `Marker ref *`。验证 `corepack pnpm run check` ✅、`corepack pnpm run build` ✅（仅 chunk warning），Chrome Playwright 隔离服务完整跑通 KYC→Dashboard→Deposit→Travel Rule→MainDeposit→DepositSuccess→Dashboard 详情展开与 `/casino-ops` marker settled，业务 API 与 console 均无错误。早前历史见下。）*
*历史：2026-07-02（周四·KYC 必填星号与字段说明收口）（补 `AGENTS.md` 2026-07-02 release note：`KYC.tsx` 将 REQUIRED badge 改为星号 `*`，页面底部备注 `Fields marked with * are mandatory.`，移除可见 `Optional` / `May be required` / `REQUIRED` 标签，`Legal First/Last Name` 改为 `First/Last Name`，顶部提示 box 删除 KYC 6 个月有效期续期句，section title 统一升级为更明显的分区标题样式（`text-base`、更大金色图标、统一间距）。验证 `corepack pnpm run check` ✅、`corepack pnpm run build` ✅（仅 chunk warning），Browser 移动端 `393x852` + 桌面 `1280x720` 复验 `/kyc` 文案、星号、底部备注、First Name 输入交互与 console health。早前历史见下。）*
*历史：2026-07-02（周四·Casino Ops 后台简化 + Main Deposit/Marker settlement + 首页版本号收尾）（补 `AGENTS.md` 2026-07-01 release note：`CasinoOpsPortal.tsx` 侧栏移除 `Custody (Hex Safe)` 与 `Treasury & Compliance`，Deposits 页删除 `HT Markets OTC` 与 `Depeg Response` 旧 demo 卡片；active deposit case 保留，作为当前员工正在处理的客户入金摘要，驱动 WTA settlement/marker 控件。MainDeposit 将 Expected Deposit Amount 作为计划金额，Step 1 按实际到账金额计算剩余；Step 2 顶部金额框只读显示剩余待转金额；fees 只显示 Network gas fee；Step 2 verified receiving address 只展示不提供 copy/edit；若 Step 1 实到金额覆盖计划金额则不要求二次转。补充 marker 口径：txHash 只作为链上交易凭证，客户 History 三态为 Pending / Deposit Completed / Settled，staff 录入 marker reference 后才进入 Settled 并在 History 详情显示 marker reference。首页底部显示 `v<package version>+<git short sha>` 以便和 Git 版本对齐。验证 `corepack pnpm run check` ✅、`corepack pnpm run build` ✅（仅 chunk warning）、`python3 -m py_compile hypertransfer-main/backend/server.py` ✅，Browser 复验 `/casino-ops` 仅显示 `Deposits / Withdrawals / Access Requests / Staff Admin` 四个侧栏入口，无 `Custody (Hex Safe)` / `Treasury & Compliance` / `HT Markets OTC` / `Depeg Response`，active deposit case 与 WTA settlement 仍存在且 console 无 error/warn；Chrome Playwright 验证 1,001/100 → 只读输入框 901、无 wallet screening、地址卡按钮数量 0；另验证 50/100 → 无二次转、成功页 Planned 50 / Amount Sent 100；Browser 验证保存 `MK-HIST-SETTLED-001` 后后台卡片变 settled，客户 `/history` 显示 `Settled` + Marker Reference，`/deposit-success` 显示 `Settled · MK-HIST-SETTLED-001`。早前历史见下。）*
*历史：2026-06-30（周二·邀请流打磨 + demo login 批 / 分支 `feat/invite-flow-and-demo-login` · PR #10）（新增 §4.4e：① **入金费用模型**（`lib/currency.ts`）——**Gas 费客户承担并从到账扣除（口径反转，早前"免 gas"作废）**、确认前 HKD 汇率(demo)+ 费用明细、完成页 txHash 区块浏览器链接 + Reference + 结算 pending marker、全额容错；② **邀请流**——审批 3 态收敛(submitted/approved/rejected，批准即签发)、拒绝必填原因、RM resubmit + 交付卡(链接+二维码+时效)、字段简化(Member ID/First+Last/Email，禁「Win ID」)、链接 TTL 72h→6h；③ **工作人员端 `/ops` 改 Okta SSO demo**(免 2FA，`DEMO_STAFF_TOKEN`→admin)；④ **Demo 首页 hub `DemoHome.tsx`(路由 `/`)**——客户端→`/welcome` + 工作人员→`/ops`；⑤ **全套 demo 便利**(自动填码 + 2FA 一键过 + 重复注册成功，全 gated on `HT_DEMO_BYPASS_2FA` + 非 production)；⑥ 入金 skip 门槛改后端驱动(修线上 demo)；⑦ 删后台 boundary 横幅；⑧ seed 不再预置测试邀请。§3 目录树补 `DemoHome/StaffLogin/currency.ts`；§4.6 补 Okta 员工登录 + demo 便利；§8.6 标注 `/`→hub、`/ops` 随 PR #10 上线待核。验证 tsc ✅ + **Chrome MCP 真机点测全链路通过**。详见 `AGENTS.md` 2026-06-30 release note。早前历史见下。）*
*历史：2026-06-29（周一·退款重构 + 入金流 bug 修复）（§4.4d 退款前端补 2026-06-29 重构：退款页**不再以单笔入金为中心/不再写死金额**→ 选已验证原钱包 + 自由金额(可多可少)+ 可选原因；金额客户端不设上限(员工端 vault 余额 + 管理层审批兜底,对应 process v1 §C "Sufficient Fund in Vault?");**退款入口加到 Dashboard**(KYC approved + 有 verified wallet 才可点);`createRefundRequest` 对 demo 占位网络 `"demo"` 豁免 Phase 1 网络白名单 → 修掉"Demo: skip & continue"后退款报错(Bug1)。另修 `TravelRule.tsx` 完成后跳回 1 USDT 验证页(按 testPaymentConfirmed/depositAddress 阶段返回 /main-deposit,Bug2)。改 `RefundProcess.tsx`/`Dashboard.tsx`/`refund-process.ts`/`TravelRule.tsx`;验证 tsc + build 全绿,并经 **Chrome 插件真机点测通过**(退款自由金额 5,000 USDT 真实建单 RF-… + TravelRule 提交后回 /main-deposit 不再弹回 1 USDT 页)。**同日补(provider 口径固化)：§4.4d 新增「★三道合规闸门执行方」= KYC·Sumsub(6mo,超期重做) / Wallet KYT·走 Hex Safe API(需调研端点,现 `screen_source_wallet` mock) / Sufficient Fund·人工登录 Hex Trust 后台核对;§4.4d Wallet Screening mock 口径收窄到 Hex Safe API;casino-ops `RefundQueuePanel` 已为每道闸门标注 provider;AGENTS.md 业务规则 + TODO.md(②真实 Wallet KYT 收窄到 Hex Safe API)同步。** 详见 `AGENTS.md` 2026-06-29 release note。早前历史见下。）*
*历史：2026-06-28（周日）（Hex Safe sandbox 实接：`§4.4c` 改"已实接"——客户端 `hexsafe_client.py`(发址/到账/提现/min_confirmations) + 后端 `/api/hexsafe/*`(RBAC+审计+提现幂等) + casino-ops `HexSafeLivePanel`，到账=轮询(无 webhook 注册 API)；`§4.4` provider 表 TR 行改 **TR=Sumsub**；新增 Sumsub Travel Rule 后端 `/api/sumsub/travel-rule/*`(账户未激活 TR→403，需 Cockpit 激活，见 memory `tr-provider-sumsub`)；退款后端落地 process v1 合规红线(`verified_wallets`+`refund_requests`+`/api/refunds*`，只退已验证原钱包)。详见 `AGENTS.md` 2026-06-28 release note + `HANDOFF.md` + `TODO.md`。按用户要求直接提交推送 main 并清理历史残枝。早前历史见下。）*
*历史：2026-06-22（周一）（新增 §3 `TODO.md` 与 §8.7「项目级待办清单（每日维护）」，并据今日客户会 + Hex Trust 会议纪要生成项目根 `TODO.md`；`ClientMeetings/` 新增两份 2026-06-22 纪要：客户会 `2026-06-22-Crypto-Deposit-Refund-Process-and-Compliance-Architecture.md`、Hex Trust 会 `2026-06-22-Hex-Trust-Custody-Platform-Onboarding-and-Compliance.md`。退款方向 / 存款地址固定性 / 法币结算等口径冲突已在纪要与 TODO 标出，待产品+合规决策，未改产品代码。早前同步 AGENTS.md：§4.4c 明确 Hex Trust / Hex Safe 真实 API 尚未接入，当前为 mock adapter；补 Hex Trust API 会议需确认的 auth、address、webhook、transfer/refund、reconciliation、HT Markets API 问题；§8.5/§8.6 补线上 demo 登录与线上测试入口，2026-06-22 curl 核验 `/`、`/login`、`/kyc`、`/dashboard`、`/new-deposit`、`/refund`、`/casino-ops` 均 200）*
*历史：2026-06-19（§3 补 `.github/workflows/` 顶级目录(hypertransfer-check CI 门禁 + hypertransfer-deploy-hk 自动部署)；§3 + §4.4b 记后端**生产可配置化**(CORS `HT_ALLOWED_ORIGINS` / 短信 `SMS_API_URL` / `HT_DB_PATH` 走环境变量,默认仍 demo 值,production 部署对 `*`/QA 会拒绝)。对应已推送 commit `afb216c`。AGENTS.md 已自带这些,无需改）*
*历史：2026-06-08（**按 `AGENTS.md`(Codex 2026-06-08 大改)同步至最新**：顶部新增 AGENTS.md 交叉引用；§1+§9 修正 Git 口径——实际已接 `origin → github.com/eason36/Hyper-Transfer`、走任务分支+PR+Squash（非"无 commit/无 remote"）；§3 补 HyperTransfer 新 lib(`compliance/travel-rule/hex-safe/treasury-ops/demo-auth.ts`)、`CasinoOpsPortal.tsx`(/casino-ops)、`docs/app-flow.*`、ProjectInfo 客户 Hex Trust 澄清 PDF；新增 §4.4c HyperTransfer 客户端 mock 模型+赌场后台（含**新 TR 状态枚举**、`canIssueAddress`三条件、Phase1 网络白名单、确认数 EVM5/Tron4、HT Markets OTC 0.50%/USD150、客户端 vs /casino-ops 边界）；§5 补客户端入金流+casino-ops；§8.5 补澄清 PDF+OTC 口径。注：Operator Demo 的 `src/domain/types.ts` TR 枚举仍是旧版`pending/submitted`，未动）*
*历史：2026-05-31（§6.1 新增移动端约定:全高容器用 `100svh` 而非 `100dvh`,修复 HyperTransfer 前端软键盘弹起时页面上下抖动 —— `Shell.tsx`×2 + `Landing.tsx` + `ProtectedRoute.tsx` 已 dvh→svh,typecheck 通过。同日:§3 为 `hypertransfer-main/` 新增运维一键部署:`docker-compose.yml`+`Dockerfile.frontend`+`backend/Dockerfile`+`deploy/nginx.conf`+`.env.example`+`DEPLOY.md`。架构=nginx 服务前端静态产物并反代 `/api`→backend:8000(uvicorn),SQLite 落命名卷 `ht-db` 持久化;已本地 docker 实测全链路通过。配套源码微调:移除 index.html 坏掉的 Manus analytics 脚本、server.py 的 `DB_PATH` 改读 `HT_DB_PATH` 环境变量(本地行为不变)。给运维的干净 tar 包打在 `~/Downloads/hypertransfer-deploy-<date>.tar.gz`(剔除 node_modules/.venv/*.db/日志)。注:CORS=`["*"]` 与 QA 短信网关仍为演示态,DEPLOY.md §5 已标注上线前必改）*
*历史：2026-05-31（§3 + §8.5 补登 `CompanyPlan/` 两份文档：`HK-Licensing-Roadmap.md` 香港牌照三阶段路线图、`Third-Party-Services-Cost.md` 客户自采第三方服务成本估算；并将 §8.5 牌照路线编号对齐路线图文档为 Phase 0–3，与报价 Phase 编号区分）*
*历史：2026-05-30（接入 `hypertransfer-main/` 真实产品前端 = React19+Vite+Tailwind4+shadcn/ui+Wouter，配合 FastAPI 认证后端 `backend/` 打通 注册 / 短信OTP第一因子 / TOTP第二因子 / 两步登录;新增 api.ts+AuthContext+ProtectedRoute+authFlow，vite proxy /api→8000，dev.sh 一键起全栈。更正 §8.5：HyperTransfer 实际前端为 React 非 Vue。另含早期独立原型 `hypertransfer-auth-demo/` 与短信网关接入要点 §4.5b）*
*维护者：陈亦玮 / Eason Chen + AI 助手协作维护*
