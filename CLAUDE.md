# VirtualAsset — 项目级 AI 协作记忆

> 本文档是 Claude Code / Cursor / 其他 AI 助手在本仓库内的**项目级长期记忆**。优先级：项目级 > 用户级（`~/AGENTS.md` / Cursor User Rules）。
>
> 项目级覆盖用户级——比如本项目演示账号 `va.host.demo@wynn.example` 是 demo 内置数据，**不视为** PII / 凭据违规。
>
> **配套文件 `AGENTS.md`**（仓库根）：Codex/OpenAI agents 的项目级工作入口，是**最新可测试版本的 Release Notes、本地测试入口清单、代码管理/分支/PR/GitHub 策略**的权威来源。本 `CLAUDE.md` 是长版领域记忆；两者冲突时以 `AGENTS.md` 为业务/运营口径基准，并回写同步本文件。改动业务流/版本时**两份都要看**。
>
> 维护原则见文末「更新机制」。

---

## 1. 项目身份

| 项 | 值 |
|---|---|
| 仓库名 | `VirtualAsset` |
| 性质 | **虚拟资产合规入金编排系统** — 包含 Wynn 员工端 Demo + HyperTransfer 客户端产品 + 香港商业化规划 |
| 阶段 | Wynn Demo 已完成；HyperTransfer Phase 1 报价已出（USD 146,250）；香港公司商业方案已制定 |
| 仓库路径 | `/Users/yiweichen/Documents/Code/VirtualAsset` |
| Git 状态 | 已接 GitHub private repo `origin → github.com/eason36/Hyper-Transfer`；`main` 为稳定主线，走**任务分支 + PR + Squash merge**（策略见 `AGENTS.md`）；日常不直推 `main` |
| **商业化主体** | **Heypervelocity**（香港公司，计划注册） |
| **对外产品名** | **HyperTransfer**（客户端 H5 应用，站点 `h5.hypercypto.com`） |

**核心定位**：不是钱包工具，不是交易所。本仓库包含两个层面：

1. **Wynn Demo**（`app/` + `src/`）：面向永利员工在 Pad 上办理 crypto deposit 的合规编排 demo（Next.js + React）
2. **HyperTransfer 产品**（`hypertransfer-main/` + 规划 `ClientMeetings/` + `CompanyPlan/`）：商业化客户端应用，面向 B2B 企业客户的虚拟资产合规入金 + 法币结算系统

**核心演示流程（6 步）**：

1. Patron source wallet screened（来源钱包 KYT 筛查）
2. Travel Rule data captured（FATF Travel Rule 信息收集）
3. Hex Trust address issued（托管方签发一次性地址）
4. Funds detected on-chain（链上到账监听）
5. Compliance engine clears transaction（到账后交易级合规清算）
6. Stable coin lands in WTA（稳定币入 Wynn Treasury Account）

## 2. 技术栈

> 注意:本仓库含**三套技术栈**——Wynn Demo(Next.js)、HyperTransfer 产品前端(React+Vite,见 `hypertransfer-main/`)、认证后端(Python/FastAPI)。下表为 Wynn Demo。

| 层 | 选型 | 版本约束 |
|---|---|---|
| 框架 | **Next.js** App Router | `^16.2.6` |
| 运行时 | **React** | `^19.2.6` |
| 语言 | **TypeScript** | `^5.8.3`，`strict: true`、`noUncheckedIndexedAccess: true` |
| Node | — | `>=20` |
| 校验 | **Zod** | `^4.4.3` |
| 模块系统 | ESM（`"type": "module"`） | — |
| 路径别名 | `@/*` → 仓库根 | 见 `tsconfig.json` |
| 样式 | 单文件 `app/globals.css`（深色 Wynn 金色风） | 无 Tailwind / CSS-in-JS |
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
├── app/                          # Next.js App Router（Wynn Demo）
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
├── public/                       # 静态资产（含 wynn-logo.png）
├── ProjectInfo/                  # 业务设计资料
│   ├── plan.md                   # 项目实施计划
│   ├── design.md                 # 1.4k 行完整设计文档（业务术语权威来源）
│   ├── virtual-asset-ppt.{md,pptx}# 项目 PPT
│   ├── Wynn_Macau_VA_Hex_Trust_Clarification_Request_Completed_04_June.pdf  # ★客户提供的 Hex Trust 36 问澄清回复（Phase1 网络/确认数/Webhook/API/TR 平台边界/KYT/冷存储/资质，权威核对）
│   └── 截屏*.png                  # 永利原型截图
├── ProjectReference/             # 外部参考资料（PDF）
├── ClientMeetings/               # 客户会议材料 + 报价单
│   ├── Virtual-Asset-Management-Demo-and-Project-Progress.pdf  # Wynn 会议 PPT
│   ├── HyperTransfer-Development-Quotation.xlsx  # HyperTransfer Phase 1 报价（USD 146,250）
│   ├── Virtual-Asset-Development-Quotation.xlsx  # Wynn 员工端报价（USD 130,600，旧版）
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
│   │   ├── lib/demo-auth.ts      #   ★本地 demo session（Use Demo Account）
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
└── package.json
```

## 4. 业务领域核心概念（**修改业务逻辑前必读**）

> **权威来源**：`ProjectInfo/design.md`（1443 行）。代码若与 design.md 冲突，**以 design.md 为口径基准**，并同步更新代码或本文档。

### 4.1 关键实体（`src/domain/types.ts`）

| 实体 | 含义 | 关键字段 |
|---|---|---|
| `Customer` | 永利客户 / Patron | `kycStatus`（含 expired/missing）、`tier`、`jurisdiction`、`riskFlags` |
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

- `requiresTravelRule`：`amount >= 8000` 或 `asset ∈ {BTC, ETH}`
- `canIssueAddress`：`status === "travel_rule_pending" && travelRule.status === "submitted"`
- 失败/EDD 路径**绝不签发地址**
- `funds_dirty`：`DepositAddress.voided` 应标记为 true，**不得再复用该地址**

### 4.3 业务术语（**只用这些名称**）

| 术语 | 含义 | 注意事项 |
|---|---|---|
| **KYT** | Know Your Transaction，钱包/交易级风险分析 | 与 KYC 区分清楚 |
| **KYC** | Know Your Customer，客户身份识别 | 由永利自有 policy + 第三方 provider 共同决定，**最终决策权在永利** |
| **Pre-Deposit Wallet Screening** | 发地址前对客户来源钱包做 KYT | 结果 `Pass / EDD / Fail` |
| **FATF Travel Rule** | 虚拟资产转账信息传递监管要求 | beneficiary VASP 由后端配置，**不让员工在 Pad 端填** vault ID / 路由 ID |
| **Hex Trust / Hex Safe** | 托管方 / Custody Provider | 机构托管、MPC、单次地址签发、KYT 集成、policy engine |
| **WTA** | **Wynn Treasury Account** | 永利金库账户，**不是单一地址**，是分层 vault 结构 |
| **Frax** | 业务编排 / 客户记录关联层（如使用） | **不是私钥托管方，不是地址签发方** |
| **Prime Broker** | 报价 / 兑换流动性服务 | 非稳定币入金兑换路径，**当前 demo 不演示** |
| **Source Wallet Address** | 客户用来打款的钱包地址 | **≠** Hex Trust 给永利签发的 receiving address |
| **Hop Count** | 链上交易图距离 | 1-hop sanctions = Fail，2-3 hop mixer 中低额 = EDD |
| **Funds Clear / Dirty** | 到账后合规判定 | Pre-deposit 筛查**不能替代**到账后筛查 |

**已停用名称（禁止出现）**：把"Frax 是私钥托管方"、"WTA 是单一地址"、"Pad 端填 vault ID" 等说法视为错误，需主动纠正。

### 4.4 Provider Adapter 模式（`src/domain/providers.ts`）

| 接口 | 当前 Mock | 真实对接候选 |
|---|---|---|
| `ScreeningProvider` | `mockScreeningProvider`（按钱包地址子串关键字推断 pass/edd/fail） | Chainalysis / TRM / Elliptic / Hex Trust KYT |
| `TransactionKytProvider` | `mockTransactionKytProvider`（按 depositId 尾数奇偶模拟 clear/dirty） | 同上，但针对到账后 txHash 级筛查 |
| `TravelRuleProvider` | `mockTravelRuleProvider` | Notabene / Sygna / TRP；**也可直接用 Hex Safe `POST /deposit/submit_travel_rule_details`** |
| `AddressProvider` | `mockAddressProvider`（伪造单次地址） | **Hex Safe `POST /vaults/{vaultId}/address`** |
| `ChainMonitorProvider` | `mockChainMonitorProvider` | **Hex Safe `GET /transactions/{traceId}` + webhook** |
| `PayoutProvider` | `mockPayoutProvider` | **Hex Safe `POST /transactions/withdrawal`** |
| `HexSafeProvider`（接口文档） | — | 见 `providers.ts` 内详细注释，映射所有真实端点 |

**约定**：所有外部能力**必须**走 Adapter，禁止在组件 / 路由里直接写真实 provider SDK 调用；Mock 实现要保持纯函数 + 可预测。

### 4.4b HyperTransfer 认证后端（`hypertransfer-main/backend/server.py`，FastAPI）

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

> 这是 2026-06-08 由 Codex 大幅扩展的一层——把 HyperTransfer 从纯认证原型扩成**带合规入金流 + 赌场工作人员后台**的产品 demo。Wynn Demo（`src/domain/`）与本层是**两套独立模型**，枚举/规则不要互相套用。

**新增 mock 库（外部能力先走这里的 adapter，未来接真实 provider 保持同边界）**：

| 文件 | 职责 |
|---|---|
| `lib/compliance.ts` | Phase 1 网络白名单、Travel Rule threshold、链上确认数、HT Markets OTC fee 计算 |
| `lib/travel-rule.ts` | Travel Rule 数据模型 + 状态机 + provider adapter mock（接 Hex Trust/Sumsub/Notabene/Sygna/TRP 从这扩展） |
| `lib/hex-safe.ts` | Hex Safe deposit status / 确认数 / vault 余额 / 交易日志 的 mock API + webhook 模型 |
| `lib/treasury-ops.ts` | 后台运营 mock：OTC 兑换、脱锚清算、对账、澳门访问隔离、托管证据 |
| `lib/demo-auth.ts` | 本地 demo session（`Use Demo Account`） |

**关键业务规则（HyperTransfer 客户端，口径来源：客户 Hex Trust 36 问澄清 PDF + design.md）**：

- **HyperTransfer 客户端 Travel Rule 状态枚举**（≠ Wynn Demo）：`not_required` / `travel_rule_required` / `travel_rule_submitted` / `travel_rule_accepted` / `travel_rule_rejected` / `manual_review`
- **`canIssueAddress` 三条同时满足**才请求 Hex Safe 地址：`KYC approved` + `source wallet KYT passed` + `Travel Rule gate passed`（失败/EDD 绝不发址）
- **Phase 1 网络白名单**：仅 `USDT on Ethereum/Tron` + `USDC on Ethereum`，其他网络先走例外审批
- **链上确认数**（按链定义，不能承诺 Wynn 自定义值）：EVM 5 confirmations、Tron 4 confirmations
- **HT Markets OTC**：USDT/USDC ↔ USD 双向兑换，0.50% all-in fee，USD 150 minimum fee
- **脱锚（depeg）响应**：0.95 触发阈值 → HT Markets 24/7 OTC 通道
- **Travel Rule gate 由 HyperTransfer/WML 在 Hex Safe 发址前执行**；不要假设当前香港 Hex Trust Limited 合同下平台层会自动 hard-freeze 等待 TR

**客户端 vs 赌场后台的边界（重要）**：

- **客户端**（澳门赌场客户/玩家用）：Landing/注册/2FA/KYC/入金流/History/Support/Settings。**不暴露** WTA、OTC、Hex Safe webhook/API、Macau operator access、custody evidence 等后台控制
- **赌场工作人员后台**：`pages/CasinoOpsPortal.tsx`，路由 **`/casino-ops`**（标题 `Wynn VA Operations Portal`，面向 treasury/compliance/finance/audit staff）。承载 WTA settlement、HT Markets OTC、depeg、Hex Safe webhook/API、reconciliation、Macau access exclusion、Hex Trust custody evidence
- 旧 `/treasury-controls` 仅作后台**别名**保留；**不要**从客户 Dashboard / Deposit Success 链接过去（旧 `TreasuryControls.tsx` 已删）
- custody evidence（冷存储/RBAC/quorum/maker-checker/保险 SLA）明确标注为 **Hex Trust provided controls**，不是 HyperTransfer 自营托管

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

**BTC 地址注意**：永久地址 `addressIndex=false, change=false`（只能创建一次）；旋转地址 `addressIndex=true, change=false`。单次入金应用旋转地址。

### 4.5b 短信网关（Hypervelocity simpleSend）

- **Endpoint**:`POST https://hv-test.hypervelocity.cn/api/sms/simpleSend`（QA 环境，测试免白名单）
- **Body**:`{areaCode, phoneNumber, textMessage, sign}`；大陆号码 sign 用 `【武汉极数信息技术】`，国际用 `[Hypervelocity]`
- **成功判定**:文档写 `code:"200"`，但**实测返回 `code:"0"` + `message:"SUCCESS"`** → 代码两者都兼容
- 接口文档原件:`~/Downloads/sms-simpleSend API Documentation_HV.docx`

### 4.6 演示账号（仅本地 mock，**禁止用于任何真实环境**）

```
Username: va.host.demo@wynn.example
Password: Wynn#2026!
```

- `wynn.example` 是文档保留域名（RFC 2606），不是真实邮箱
- 该账号**仅**作为 demo 登录流程的硬编码占位（见 `src/components/pad-deposit-app.tsx`）
- 正式版必须接 Okta OIDC + MFA（推荐 Passkey / WebAuthn / FIDO2，不用 SMS OTP）

## 5. 第一版范围边界

**包含**：

- 员工 Pad App 流程（登录 mock → patron 搜索 → 入金录入 → KYT → Travel Rule → 发址 → 监听 → Transaction KYT Clear/Dirty → WTA 入账）
- **Funds Dirty 完整分支**（到账后 KYT 判 dirty → 阻断 + 地址作废提示）
- 运营后台（队列 / 详情 / case / audit）
- 全部 mock provider；内置 5 个客户（含 expired / missing KYC 状态演示）
- **Treasury WTA 页面**、**Refund / Payout 模块**、Compliance Case **Request Documents** 动作
- **HyperTransfer 认证模块**（`hypertransfer-main/`）：注册 / 短信 OTP / TOTP MFA / 两步登录，已接真实 FastAPI 后端 + 真实短信
- **HyperTransfer 客户端入金流 + 赌场后台**（见 §4.4c）：客户端 KYC→KYT→Travel Rule→发址→确认→入金成功（全 mock）；赌场工作人员后台 `/casino-ops`（WTA settlement / HT Markets OTC / depeg / Hex Safe webhook / reconciliation / Macau access exclusion / custody evidence，全 mock）

**不包含**（**不要在当前版本加这些**）：

- 真实资金转移、真实托管签名、真实链上转账
- 真实 Okta SSO、真实 MFA（Hex Safe API 的 `x-api-key` + JWT 也是 mock）
- 真实多签移动审批 App / 真实 STR / SAR / HKFIO 报送
- Prime Broker 报价交易 / WTA 实际清算
- Admin / 集成配置 UI（provider 配置、风险阈值管理）
- 数据库持久化（Wynn Demo 一切 in-memory mock；HyperTransfer 认证用 SQLite 演示，未上生产 DB）

## 6. 编码约定（项目特定 — 覆盖用户级默认）

### 6.1 通用

- **TypeScript strict + `noUncheckedIndexedAccess`**：数组/对象索引访问要处理 `undefined`
- **Next.js App Router**（Wynn Demo）：默认 RSC，需要交互的组件加 `"use client"`
- **路径**：Wynn Demo 用 `@/*` 别名；HyperTransfer 前端用 `@/` → `client/src`
- **样式**：Wynn Demo 集中在 `app/globals.css`，**不要**引入 Tailwind；HyperTransfer 前端用 Tailwind 4 + shadcn/ui（两套独立,别混）
- **移动端全高容器用 `100svh`，不要用 `100dvh`**（HyperTransfer 前端）：`dvh` 会随软键盘弹起实时伸缩，导致 `min-h` 容器 + `mt-auto` 贴底元素反复重排、页面上下抖动；`svh` 是固定小视口高度,键盘弹出不变 → 布局锁死。`Shell.tsx`/`Landing.tsx`/`ProtectedRoute.tsx` 已统一 `svh`。注:`body` 已 `@apply bg-background`,与全高容器同色,svh 底部不会露缝
- **数据**：Wynn Demo 演示数据放 `src/data/seed.ts`；不要在组件里再造 seed
- **校验**：表单用 Zod / 现有 `lib/validation.ts`

### 6.2 领域代码（Wynn Demo）

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

- Wynn Demo:`npm run typecheck` + `npm run build` 必须通过
- HyperTransfer 前端:`corepack pnpm run check`（tsc）必须通过
- 不要 commit `.env*` / `*.key` / `*.pem` / `*.db` / `.venv` / `node_modules`
- diff 中**不能**出现真实 11 位手机号、18 位身份证、真实姓名（demo `Avery Chen / Morgan Lee / Taylor Wong / Iris Lau / Noah Ho / Mia Chan` 是虚构演示名，允许）。
  注:一次性联调测试手机号不要写进任何提交。

## 7. 合规与数据要求

- 任何代码 / 注释 / commit message / 文档中：**禁止**出现真实客户姓名、护照号、证件号、wallet 实控人信息
- PII 准则照搬用户级 `~/AGENTS.md` 的金融/PII 规则
- 涉及监管口径修改（KYT 决策树、Travel Rule 字段、Hex Trust 接口边界）必须**先**核对 `ProjectInfo/design.md`，**再**改代码
- 跨境数据传输 / VASP 监管：HK 与 Macau 合规要求不同，对外口径不要含糊

## 8. 已知技术债 / TODO（按优先级）

1. **无任何测试** — 至少要加状态机 + Zod schema + provider mock 的单测
2. **无持久化（Wynn Demo）** — 计划：Prisma + SQLite 起步
3. **`src/index.ts`** 是老 Node 入口残留，可清理
4. **`pad-deposit-app.tsx`** / `kyc-pad-app.tsx` / `refund-pad-app.tsx` 均超过 200 行，后续按 step/view 拆分
5. **Wynn Demo 路由缺统一导航**
6. **mock 决策依赖钱包地址字符串关键字** —— 仅适合 demo
7. **Refund / Payout** 目前只有 mock 提交，无真实 Hex Safe withdrawal 调用
8. **KYC + Deposit 两个 Pad App 流程仍隔离**
9. **HyperTransfer 认证**:SQLite 非生产 DB；TOTP/OTP 密钥明文存储；会话用 localStorage token 而非 HttpOnly Cookie；缺 TOTP 恢复码 / 换机流程 / 图形验证码防短信轰炸 / step-up（生产化清单见 `hypertransfer-main/backend/server.py` 底部）

## 8.5 商业化上下文（**修改报价 / 方案 / 客户材料前必读**）

| 项 | 值 |
|---|---|
| 公司名 | **Heypervelocity** |
| 产品名 | **HyperTransfer** |
| 产品站点 | `https://h5.hypercypto.com` |
| HyperTransfer **实际**技术栈 | **React 19 + Vite + Tailwind 4 + shadcn/ui + Wouter（前端，见 `hypertransfer-main/`）+ Python/FastAPI（认证后端）+ SQLite**。⚠️ 早期商业方案写的"Vue 3 + Python"是**规划口径**;落地的真实前端代码是 **React**,以此为准 |
| 最新报价（Phase 1） | **USD 146,250**（325 人天 × USD 450/人天），另 10% 年维护费 USD 14,625 |
| 报价文件 | `ClientMeetings/HyperTransfer-Development-Quotation.xlsx` |
| 最新客户会议纪要 | `ClientMeetings/2026-06-05-Crypto-Compliance-KYC-Rollout-Meeting-Notes.md`（2026-06-05 Granola 摘要整理；涉及 Hex Trust / KYC / Travel Rule / testing timeline；具体细节以该文件为准） |
| 客户 Hex Trust 澄清回复 | `ProjectInfo/Wynn_Macau_VA_Hex_Trust_Clarification_Request_Completed_04_June.pdf`（36 问澄清；Phase1 网络/确认数 EVM5·Tron4/Webhook·API/TR 平台边界/KYT/冷存储/资质——客户端业务规则的权威口径来源） |
| HT Markets OTC 口径 | USDT/USDC ↔ USD 双向，**0.50% all-in fee，USD 150 minimum**；脱锚阈值 0.95 触发 24/7 OTC（详见 §4.4c） |
| 商业方案 | `CompanyPlan/HyperTransfer-HK-Business-Plan.md` |
| 牌照路线图 | `CompanyPlan/HK-Licensing-Roadmap.md`（各阶段时间/投入/解锁能力，权威来源） |
| 第三方服务成本 | `CompanyPlan/Third-Party-Services-Cost.md`（客户自采，非我方报价） |
| 目标客户 | OTC Desk（最快出单）、博彩/综合度假村（最高客单价）、持牌 VATP、奢侈酒店、家族办公室、稳定币发行方 |
| 核心合作方 | Hex Trust（托管）、Chainalysis/TRM/Elliptic（KYT）、Sumsub/Onfido（KYC） |
| 牌照路线 | **Phase 0** 无需牌照（纯技术服务商，立即）→ **Phase 1** MSO（法币兑换结算）→ **Phase 2** VA Dealing（自营 OTC）→ **Phase 3** VA Custody（自营托管，可选）。⚠️ 此处 Phase 0–3 是**牌照阶段**编号，与报价里的 "Phase 1 = USD 146,250 开发交付" 不是同一套编号；详见 `CompanyPlan/HK-Licensing-Roadmap.md` |

**注意**：
- **Wynn Demo 和 HyperTransfer 是两个产品**，技术栈不同，报价分开
- 报价单中**不含税**，需要时明确注明 "excl. tax"；货币一律用 `"USD "#,##0` 格式（避免 Excel locale 把 `$` 替换成 `¥`）
- 报价使用 **Item 01–11** 编号，不用 Phase（Phase 已用于 HyperTransfer 商业化阶段）
- `ClientMeetings/` 下可能包含 Excel 临时文件（`~$*.xlsx`），不要 commit

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
| 新增依赖 | Wynn Demo 用 `npm install`；HyperTransfer 用 `corepack pnpm add`；不要手写版本号 |
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

*最后更新：2026-06-19（§3 补 `.github/workflows/` 顶级目录(hypertransfer-check CI 门禁 + hypertransfer-deploy-hk 自动部署)；§3 + §4.4b 记后端**生产可配置化**(CORS `HT_ALLOWED_ORIGINS` / 短信 `SMS_API_URL` / `HT_DB_PATH` 走环境变量,默认仍 demo 值,production 部署对 `*`/QA 会拒绝)。对应已推送 commit `afb216c`。AGENTS.md 已自带这些,无需改）*
*历史：2026-06-08（**按 `AGENTS.md`(Codex 2026-06-08 大改)同步至最新**：顶部新增 AGENTS.md 交叉引用；§1+§9 修正 Git 口径——实际已接 `origin → github.com/eason36/Hyper-Transfer`、走任务分支+PR+Squash（非"无 commit/无 remote"）；§3 补 HyperTransfer 新 lib(`compliance/travel-rule/hex-safe/treasury-ops/demo-auth.ts`)、`CasinoOpsPortal.tsx`(/casino-ops)、`docs/app-flow.*`、ProjectInfo 客户 Hex Trust 澄清 PDF；新增 §4.4c HyperTransfer 客户端 mock 模型+赌场后台（含**新 TR 状态枚举**、`canIssueAddress`三条件、Phase1 网络白名单、确认数 EVM5/Tron4、HT Markets OTC 0.50%/USD150、客户端 vs /casino-ops 边界）；§5 补客户端入金流+casino-ops；§8.5 补澄清 PDF+OTC 口径。注：Wynn Demo 的 `src/domain/types.ts` TR 枚举仍是旧版`pending/submitted`，未动）*
*历史：2026-05-31（§6.1 新增移动端约定:全高容器用 `100svh` 而非 `100dvh`,修复 HyperTransfer 前端软键盘弹起时页面上下抖动 —— `Shell.tsx`×2 + `Landing.tsx` + `ProtectedRoute.tsx` 已 dvh→svh,typecheck 通过。同日:§3 为 `hypertransfer-main/` 新增运维一键部署:`docker-compose.yml`+`Dockerfile.frontend`+`backend/Dockerfile`+`deploy/nginx.conf`+`.env.example`+`DEPLOY.md`。架构=nginx 服务前端静态产物并反代 `/api`→backend:8000(uvicorn),SQLite 落命名卷 `ht-db` 持久化;已本地 docker 实测全链路通过。配套源码微调:移除 index.html 坏掉的 Manus analytics 脚本、server.py 的 `DB_PATH` 改读 `HT_DB_PATH` 环境变量(本地行为不变)。给运维的干净 tar 包打在 `~/Downloads/hypertransfer-deploy-<date>.tar.gz`(剔除 node_modules/.venv/*.db/日志)。注:CORS=`["*"]` 与 QA 短信网关仍为演示态,DEPLOY.md §5 已标注上线前必改）*
*历史：2026-05-31（§3 + §8.5 补登 `CompanyPlan/` 两份文档：`HK-Licensing-Roadmap.md` 香港牌照三阶段路线图、`Third-Party-Services-Cost.md` 客户自采第三方服务成本估算；并将 §8.5 牌照路线编号对齐路线图文档为 Phase 0–3，与报价 Phase 编号区分）*
*历史：2026-05-30（接入 `hypertransfer-main/` 真实产品前端 = React19+Vite+Tailwind4+shadcn/ui+Wouter，配合 FastAPI 认证后端 `backend/` 打通 注册 / 短信OTP第一因子 / TOTP第二因子 / 两步登录;新增 api.ts+AuthContext+ProtectedRoute+authFlow，vite proxy /api→8000，dev.sh 一键起全栈。更正 §8.5：HyperTransfer 实际前端为 React 非 Vue。另含早期独立原型 `hypertransfer-auth-demo/` 与短信网关接入要点 §4.5b）*
*维护者：陈亦玮 / Eason Chen + AI 助手协作维护*
