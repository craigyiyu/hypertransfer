# AGENTS.md

> 本文件是 Codex / OpenAI agents 在本仓库的项目级工作入口，承载 Release Notes、测试入口、代码管理策略，并与 `CLAUDE.md` **保持同步**。  
> **`CLAUDE.md` 是本项目的主口径 / 权威基准**（用户 2026-06-28 确认）。两者冲突时**以 `CLAUDE.md` 为准**；改动业务流 / 版本时两份都要更新。Codex 仍以本文件为执行入口，但口径以 `CLAUDE.md` 为准。

## 项目身份

- 仓库：`VirtualAsset`
- 路径：`/Users/yiweichen/Documents/Code/VirtualAsset`
- 性质：虚拟资产合规入金编排系统，包含 Operator 员工端 Demo、HyperTransfer 客户端产品、香港商业化规划与客户材料。
- 核心定位：不是钱包工具，不是交易所；重点是合规编排、KYC/KYT、Travel Rule、托管地址签发、入金监听、WTA 入账与异常处理。
- 商业化主体：`Heypervelocity`（香港公司，计划注册）
- 对外产品名：`HyperTransfer`，站点 `h5.hypercypto.com`
- 当前 Git：已连接 GitHub private repo `origin -> https://github.com/eason36/Hyper-Transfer.git`；`main` 是稳定主线，日常走任务分支 + PR + squash merge。只有用户明确要求 commit / push 时才做 git 提交或推送。

## 代码地图

- `app/` + `src/`：Operator 员工端虚拟资产入金编排 Demo，Next.js App Router + React + TypeScript。
- `src/domain/`：Operator Demo 领域核心，包含 `types.ts`、`state-machine.ts`、`providers.ts`。改业务规则先看这里。
- `src/data/seed.ts`：Operator Demo mock 数据来源；不要在组件里重复造 seed。
- `app/globals.css`：Operator Demo 唯一样式入口，深色 Operator 金色风；不要引入 Tailwind。
- `.github/workflows/hypertransfer-check.yml`：HyperTransfer PR/main CI，运行 typecheck 与 production build。
- `.github/workflows/hypertransfer-deploy-hk.yml`：HyperTransfer 香港服务器自动发布 workflow；main 自动发 staging，workflow_dispatch 可选 production。
- `hypertransfer-main/`：真正的 HyperTransfer 产品前端，React 19 + Vite + Tailwind 4 + shadcn/ui + Wouter。
- `hypertransfer-main/DEPLOY.md`：Docker Compose 手工部署与 GitHub Actions 香港自动发布说明。
- `hypertransfer-main/docker-compose.yml`：HyperTransfer 前端 nginx + FastAPI backend + SQLite volume 容器编排。
- `hypertransfer-main/client/src/lib/compliance.ts`：HyperTransfer Phase 1 网络、Travel Rule threshold、链上确认数、HT Markets OTC fee calculator。
- `hypertransfer-main/client/src/lib/travel-rule.ts`：Travel Rule 数据模型、状态机、provider adapter mock；后续接 Hex Trust/Sumsub/Notabene/Sygna/TRP 先从这里扩展。
- `hypertransfer-main/client/src/lib/refund-process.ts`：Refund / payout 数据模型、状态机、destination-wallet KYT mock、treasury approval mock、Hex Safe payout mock。
- `hypertransfer-main/client/src/lib/sumsub.ts`：Sumsub KYC applicant start/status、access-token、connection test API 客户端；KYC 当前走 API-only demo，不在客户页嵌入 Sumsub WebSDK；不保存或暴露 app secret。
- `hypertransfer-main/client/src/lib/app-version.ts`：前端构建版本标签，格式 `v<package.json version>+<git short sha>`，用于首页与 Git 版本对齐。
- `hypertransfer-main/client/src/lib/hex-safe.ts`：Hex Safe deposit status、confirmation count、vault balance、transaction logs 的 mock API/webhook 模型。
- `hypertransfer-main/client/src/lib/treasury-ops.ts`：OTC conversion、depeg liquidation、reconciliation、Macau access exclusion、custody evidence 的后台运营 mock 模型。
- `hypertransfer-main/client/src/pages/RefundProcess.tsx`：客户侧 Refund Request 页面，路由 `/refund`；客户确认退款原因和 destination wallet，跑 refund KYT 后提交 treasury approval。
- `hypertransfer-main/client/src/pages/CasinoOpsPortal.tsx`：澳门赌场工作人员后台运营站点，路由 `/casino-ops`；当前只展示 Deposits、Withdrawals、Access Requests、Staff Admin 四个工作区，Deposits 页保留 active deposit case 摘要与 WTA settlement/marker 控件，旧 HT Markets OTC、depeg、Hex Safe live custody、Treasury & Compliance 展示入口已从 demo UI 移除。
- `hypertransfer-main/backend/server.py`：HyperTransfer 认证后端原型，FastAPI + SQLite，含短信 OTP、TOTP、恢复码、会话。
- `hypertransfer-auth-demo/`：早期独立认证 H5 原型。
- `ProjectInfo/design.md`：业务设计权威来源；涉及监管、术语、状态流、Travel Rule、Hex Trust 边界时必须核对。
- `ProjectInfo/Operator_Macau_VA_Hex_Trust_Clarification_Request_Completed_04_June.pdf`：客户提供的 Hex Trust 36 问澄清回复；涉及 Phase 1 网络、确认数、Webhook/API、Travel Rule 平台边界、KYT、冷存储、监管资质时必须核对。
- `ProjectInfo/HyperTransfer_One Page Process Map_v1.pptx`：HyperTransfer one-page process map 的可编辑 PPT 源文件。
- `ProjectInfo/HyperTransfer_One Page Process Map_v1.pdf`：HyperTransfer one-page process map 的 PDF 交付/转发版本。
- `ProjectInfo/Sumsub-Trial-Integration-Assessment.md`：Sumsub trial 能力、HyperTransfer 接入架构、难度评估与 sales 会议问题；评估 KYC、AML、Device Intelligence、Questionnaire、Transaction Monitoring、Travel Rule、Crypto Monitoring、Case Management 等模块时先看这里。
- `ProjectInfo/Refund-Process-Research-and-Design.md`：Refund Process 的内部资料依据、公开市场参考、HyperTransfer 采用方案、状态机和产品/后台改动；解释为什么不默认退回原付款地址。
- `ProjectInfo/HyperTransfer_Refund_Process_Security_v1.pptx`：英文客户版 Refund Process Security Controls PPT，覆盖 refund request、destination KYT、treasury approval、Hex Safe payout、webhook/reconciliation/audit。
- `ProjectInfo/HyperTransfer_Refund_Process_Security_v2.pptx`：优化版英文客户 PPT，采用更清爽的浅色咨询材料风格，修正 v1 过暗、留白过大和局部版式松散问题。
- `ProjectInfo/HyperTransfer_Refund_Process_Security_v3.pptx`：PowerPoint 安全版英文客户 PPT，按 Microsoft PowerPoint 实际渲染风险重新加大行高、文本框高度和卡片留白。
- `ClientMeetings/`：客户会议材料与报价。最新会议纪要：`ClientMeetings/2026-06-05-Crypto-Compliance-KYC-Rollout-Meeting-Notes.md`。
- `CompanyPlan/`：香港商业化方案、牌照路线与第三方服务成本。

## 常用命令

根目录 Operator Demo：

```bash
npm run dev
npm run typecheck
npm run build
npm run start
```

HyperTransfer：

```bash
cd hypertransfer-main
corepack pnpm run check
corepack pnpm run build
./dev.sh
```

新增依赖：Operator Demo 用 `npm install`；HyperTransfer 用 `corepack pnpm add`。不要手写版本号。

## 业务规则

> **⚠️ 最新口径（2026-06-23《HyperTransfer 最终流程 v1》，优先级最高）**：客户已确认最终流程 `ProjectInfo/20260623_Hypertransfer_process_v1.md`，决策记录 + 改造方案见 `ProjectInfo/20260623-System-Adjustment-Plan-vs-Process-v1.md` §〇。以下与之冲突的旧表述以 v1 决策为准：
> - **退款**：只退回客户此前提供并验证过的**原钱包地址之一、不能输新地址**、退款前再次合规筛查（**取代**本文件下方及历史 Release Notes 中"客户确认新 destination wallet / 不要默认原路退回"）。原钱包失效走线下，不在 APP scope。**退款金额不绑定入金额（可多可少），客户端不设上限——对应 process v1 §C「Sufficient Fund in Vault?」由员工端 vault 余额校验 + 管理层审批兜底；后端 `/api/refunds` 已支持任意 `amountDecimal`。退款入口在 Dashboard（KYC approved + 有 verified wallet 才可点）+ `/refund` 页（重构为"退回已验证钱包"：选已验证原钱包 + 自由输入金额 + 可选原因，不再以单笔入金为中心、不再写死金额）。**
> - **三道合规闸门执行方（2026-06-29 用户确认，入金/退款通用）**：① **KYC** = Sumsub API 自动核验，有效期 6 个月、超期重做。② **Wallet KYT（来源/退款原钱包筛查）** = 走 **Hex Safe API**（需调研其 KYT 端点；sandbox 暂无文档化端点 → 确认前回落 Chainalysis/TRM/Elliptic；现为 `screen_source_wallet` mock 占位）。③ **Sufficient Fund in Vault** = **人工登录 Hex Trust 后台**核对 vault 余额，非应用内自动查。casino-ops 退款队列 UI（`RefundQueuePanel.tsx`）已为每道闸门标注 provider。
> - **Travel Rule 阈值**：USD 1,000 ≈ HKD 8,000（**取代** 8000；旧 8000 实为把港币法定门槛当美元的 bug）。✅ 代码已改。
> - **资产**：Phase 1 仅 USDT（**取代** USDT+USDC；USDC 前端禁用、保留代码备 Phase 2）。✅ 代码已改。
> - **注册 / 2FA**：邀请制 + Email OTP（短信留 step-up）、2FA 可选 + 入金/退款 step-up 强制（已决策，代码待改造）。
> - 其余新增（KYC 6 个月有效期、Marker 回录、Forex 法币结算、RBAC 5 角色、数据隔离、保留到账后 KYT）见决策记录。

Operator Demo 核心流程：

1. Patron source wallet screened
2. Travel Rule data captured
3. Hex Trust address issued
4. Funds detected on-chain
5. Compliance engine clears transaction
6. Stable coin lands in WTA

Deposit 状态机要点：

- `requiresTravelRule`：`amount >= 8000`；BTC / ETH 资产不在 Phase 1 支持范围内，不再作为 Travel Rule 触发资产。
- Travel Rule status 使用 `not_required`、`travel_rule_required`、`travel_rule_submitted`、`travel_rule_accepted`、`travel_rule_rejected`、`manual_review`。
- `canIssueAddress`：必须同时满足 `KYC approved`、`source wallet KYT passed`、`Travel Rule gate passed`，才能请求 Hex Safe 地址。
- `fail` / `edd` 路径绝不签发地址。
- 到账后 KYT 为 dirty 时进入 `funds_dirty`，开 urgent compliance case，并作废收款地址。
- Pre-deposit wallet screening 不能替代到账后的 transaction KYT。
- HyperTransfer 客户端 Phase 1 默认只开放 `USDT on ERC-20/TRC-20` 与 `USDC on ERC-20`；BTC 和 ETH 资产不处理。注意 ERC-20 是稳定币网络 rail，不代表支持 ETH 资产。
- Refund / payout 是 treasury-controlled withdrawal flow：客户侧只创建 refund request 并提交 destination wallet；后台必须做 destination-wallet KYT、treasury/compliance approval、Hex Safe custody transfer、webhook/polling completion、reconciliation 和 audit。
- 不要默认把退款直接打回 original source address；CEX pooled wallet 场景可能导致客户无法自动入账。必须使用客户认证会话确认的 refund destination，除非后续合规批准单独 auto-refund 策略。
- HyperTransfer 客户端是澳门赌场客户/玩家使用的入金产品，不暴露 WTA、OTC、Hex Safe webhook/API、Macau operator access、custody controls evidence 等后台运营控制。
- 赌场工作人员后台运营能力放在 `/casino-ops`，旧 `/treasury-controls` 仅作为后台别名保留；不要从客户 Dashboard 或 Deposit Success 链接过去。
- Travel Rule gate 必须在 Hex Safe 地址签发前由 HyperTransfer / WML 执行；Hex Trust/Sumsub 可以作为 provider 选项，但不要假设当前香港 Hex Trust Limited 合同下平台层会自动 hard-freeze 等待 TR。
- Sumsub trial 当前仅作为候选合规 provider 评估；可覆盖 KYC、AML screening、questionnaire、Device Intelligence、Transaction Monitoring、Travel Rule、Crypto Monitoring、Case Management 等能力，但不得替代 Hex Trust / Hex Safe 的托管、vault、地址签发和链上 webhook 边界。
- Sumsub KYC applicant 是 Sumsub 侧的被验证人档案；HyperTransfer 用户通过后端映射到一个 deterministic `externalUserId` 和一个 Sumsub `applicantId`。当前客户页走 API-only demo：后端创建/复用 applicant 并拉取 status，前端不嵌入 Sumsub WebSDK 面板；access-token API 仅保留给连接测试或未来可选 WebSDK 模式。
- Hex Trust 链上确认门槛按链定义，不能承诺 Operator 自定义确认数；当前客户回复口径为 EVM 5 confirmations、Tron 4 confirmations。
- Hex Trust / Hex Safe 真实 API 当前尚未接入产品；`hex-safe.ts`、`treasury-ops.ts`、`refund-process.ts` 中的 Hex Safe、HT Markets、reconciliation、refund payout 仍是 mock。不要对用户或客户声称已经完成 Hex Trust API live integration。
- `ProjectInfo/virtual-asset-ppt.md` 中的 Hex Trust endpoint 名称是概念清单；真实开发必须以 Hex Trust 合同、正式 API 文档、sandbox、webhook payload sample、OpenAPI/Postman collection 为准。
- HT Markets OTC 可做 USDT/USDC 与 USD 双向兑换；客户回复口径为 0.50% all-in fee、USD 150 minimum fee。
- **入金费用模型（2026-06-30 用户确认，demo）**：**Gas 费由客户承担并从到账金额扣除**（口径已从早前"Hex Trust 承担 / 免 gas"**反转**为用户自付）。`MainDeposit` 确认前展示费用明细（汇率 + gas），`estimatedReceived = deposit − gas`；`DepositSuccess` credited 用 `estimatedReceived`。费用模型 `lib/currency.ts` `DEPOSIT_FEE_MODEL`（demo 值 `networkGasFeeUsdt: 0.03`，不展示 wallet screening fee）。**Step 1 验证款按实际到账金额计入总计划金额**：真实用户可能少于/多于 1 USDT，Step 2 只提示/模拟发送 `max(total − actual_step1, 0)` 的剩余主入金；若 `actual_step1 >= total`，不要求二次转，成功页显示实际到账合计并保留 Planned Amount 提醒。Step 2 顶部金额框只读显示剩余待转金额，verified receiving address 只展示、不提供 copy/edit。后端 `/api/deposits/{id}/main` 仍记录计划总金额用于 Travel Rule/后台，demo settlement 与成功页记录实际到账合计。**汇率**用 demo（Hex Trust 汇率口径待实接），展示为 **HKD** 估值。**txHash** 在完成页作区块浏览器链接（`lib/compliance.ts` `blockExplorerTxUrl`：tron→tronscan、ethereum→etherscan），仅代表链上交易凭证/receipt id，不代表 casino marker 已入账。**客户 History 入金状态三态**：`Pending`（流程中）→ `Deposit Completed`（链上入金完成/到账）→ `Settled`（staff 后台录入 marker reference，marker/筹码已给到客户）。录 Marker 前结算显示「in progress · pending marker」，录入后完成页与 History 显示 `Settled · <marker ref>`。**全额容错**：客户若直接把全额打进 1 USDT 验证地址，`handleFullAmountDetected` 兜住不卡流程。
- **邀请流（2026-06-30 用户确认口径）**：审批 **3 态收敛** `submitted / approved / rejected`（去掉 `issued`，批准即自动签发）；拒绝**必填原因**；RM 可 **resubmit**；批准后转 **RM 交付**（RM 页展示可复制 **邀请链接 + 二维码 + 时效状态**，过期可 resend）。RM 表单**字段简化**：`Member ID`（白标，**禁用「Win ID」**）、`First Name` + `Last Name`、`Email`（去掉 Age/Phone/Passport）。**邀请链接有效期 6 小时**（`INVITE_TTL`，原 72h）。
- **工作人员端登录 = Okta SSO（demo，免 2FA）**：`/ops`（`StaffLogin.tsx`）主按钮「Sign in with Okta」直接进后台（demo 不真实接 Okta，admin 全权限）；邮箱+密码为次要入口。生产需真实接 Okta OIDC。
- **Demo 便利（全部 gated on 后端 `HT_DEMO_BYPASS_2FA` / 非 production）**：Email/SMS OTP 发送后**自动填码**、2FA 首登/登录/忘密**自动填 6 位 + 点击必过**、已存在用户重复注册也显示成功、邀请可重复跑。**入金 skip 按钮不再用 `import.meta.env.DEV` 门槛**（会误伤线上 demo），改由**后端驱动的 demo 条件**（网络未配置 / `network==="demo"`）控制，线上 demo 也能跑。

Provider adapter 约定：

- Operator Demo 外部能力必须走 `src/domain/providers.ts` 的 adapter 接口。
- HyperTransfer 客户端 mock 外部能力先放在 `hypertransfer-main/client/src/lib/travel-rule.ts`、`hex-safe.ts`、`treasury-ops.ts`，未来接真实 provider 时保持同一 adapter/模型边界。
- 如接 Sumsub，优先在后端新增 provider adapter：前端只拿短期 WebSDK access token；`SUMSUB_APP_TOKEN`、`SUMSUB_SECRET_KEY`、webhook secret 等只放服务器环境变量或 GitHub secrets，绝不写入仓库。
- 组件或路由里不要直接调用真实 provider SDK / API。
- Mock provider 保持纯函数、可预测，方便 demo 和后续测试。

术语口径：

- `KYC` 是客户身份识别；`KYT` 是钱包/交易级风险分析，二者不要混用。
- `WTA` 是 Treasury Account，分层 vault 结构，不是单一地址。
- `Hex Trust` 是托管方 / custodian；`Hex Safe` 是 Hex Trust 的托管平台 / API，不要把二者混写成两个托管方。
- `Source Wallet Address` 是客户来源钱包，不等于 Hex Trust 签发给 Operator 的 receiving address。
- 不要写“Frax 是私钥托管方”“WTA 是单一地址”“Pad 端填 vault ID”等错误说法。

## 编码约定

- TypeScript strict；注意 `noUncheckedIndexedAccess`，索引访问要处理 `undefined`。
- Next.js App Router 默认 RSC，需要交互的组件加 `"use client"`。
- Operator Demo 用 `@/*` 指向仓库根；HyperTransfer 前端用 `@/` 指向 `client/src`。
- Operator Demo 样式集中在 `app/globals.css`；HyperTransfer 使用 Tailwind 4 + shadcn/ui，两套不要混。
- HyperTransfer 移动端全高容器用 `100svh`，不要用 `100dvh`，避免软键盘导致页面抖动。
- 业务状态、枚举或字段变化时，同步更新 label、badge、mock seed 与相关 UI。
- 注释只解释非显然的原因；demo / mock 桩位置用 `// MOCK:` 前缀。
- 新增或替换 provider：先扩接口，再加 mock，最后接组件。

## 合规与数据

- 不要在代码、注释、文档或 commit message 中写真实客户姓名、证件号、护照号、wallet 实控人信息。
- Demo 账号 `va.host.demo@operator.example` / `Operator#2026!` 是本地 mock，占位用途，不视为真实凭据。
- `operator.example` 是保留域名，不是真实邮箱。
- 不要提交 `.env*`、`*.key`、`*.pem`、`*.db`、`.venv`、`node_modules`。
- `ClientMeetings/` 可能有 Excel 临时文件 `~$*.xlsx`，不要 commit。
- 涉及 HK / Macau 监管、KYT 决策树、Travel Rule 字段、Hex Trust 接口边界时，先核对 `ProjectInfo/design.md`。

## 商业化上下文

- HyperTransfer Phase 1 最新报价：USD 146,250（325 人天 x USD 450/人天），另 10% 年维护费 USD 14,625。
- 报价文件：`ClientMeetings/HyperTransfer-Development-Quotation.xlsx`。
- 最新客户会议纪要：`ClientMeetings/2026-06-05-Crypto-Compliance-KYC-Rollout-Meeting-Notes.md`，主题为 Hex Trust、KYC、Travel Rule、testing timeline。
- One-page process map：`ProjectInfo/HyperTransfer_One Page Process Map_v1.pptx` 与 `ProjectInfo/HyperTransfer_One Page Process Map_v1.pdf`。
- Sumsub trial 评估：`ProjectInfo/Sumsub-Trial-Integration-Assessment.md`。
- 商业方案：`CompanyPlan/HyperTransfer-HK-Business-Plan.md`。
- 牌照路线：Phase 0 纯技术服务商 -> Phase 1 MSO -> Phase 2 VA Dealing -> Phase 3 VA Custody；详见 `CompanyPlan/HK-Licensing-Roadmap.md`。
- 报价单金额格式用 `"USD "#,##0`，避免 Excel locale 将 `$` 替换成 `¥`。
- 报价使用 Item 01-11 编号，不用 Phase 编号，避免与牌照阶段混淆。

## 本地测试入口

当前 HyperTransfer 本地前端默认运行在 `http://127.0.0.1:3003`。后端认证 API 默认由 Vite 代理到 `http://127.0.0.1:8001`。

客户/玩家端入口：

- `http://127.0.0.1:3003/`：**Demo 首页 hub**（`DemoHome.tsx`）——客户端入口（→ `/welcome`）+ 工作人员端入口（→ `/ops`）两张卡，方便演示切换。
- `http://127.0.0.1:3003/welcome`：HyperTransfer landing page（原 `/` 的 Landing），含 referral QR demo、Create Account、Sign In。
- `http://127.0.0.1:3003/login`：客户登录页；本地 demo 可用 `Use Demo Account` 或 `demo.user@hypercrypto.com` / `Demo@12345`。
- `http://127.0.0.1:3003/invite?token=<签发的token>`：邀请落地页（公开）；token+邮箱校验 → Email OTP 注册 → setup-2fa。需先由 staff 走邀请流程签发 token。
- `http://127.0.0.1:3003/register`：客户注册页（手机短信 OTP 自助注册并存；邀请制为主入口，见 /invite）。
- `http://127.0.0.1:3003/setup-2fa`：注册后的 TOTP 绑定页。
- `http://127.0.0.1:3003/verify-2fa`：登录第二因子验证页。
- `http://127.0.0.1:3003/kyc`：客户身份验证页。
- `http://127.0.0.1:3003/kyc-status`：客户 KYC review 状态页。
- `http://127.0.0.1:3003/dashboard`：客户账户首页，只保留客户可见功能；不要出现 Treasury / OTC / custody 后台入口。
- `http://127.0.0.1:3003/new-deposit`：客户创建入金请求，选择资产、网络、预期金额。
- `http://127.0.0.1:3003/wallet-screening`：客户来源钱包 KYT 筛查。
- `http://127.0.0.1:3003/travel-rule`：客户 Travel Rule 信息收集与 gate。
- `http://127.0.0.1:3003/deposit-address`：Hex Safe 地址签发前的客户提示页。
- `http://127.0.0.1:3003/main-deposit`：客户 1-unit verification deposit + main deposit 合并流程。
- `http://127.0.0.1:3003/deposit-success`：客户入金成功页，保留客户下一步提示，不暴露后台 Treasury controls。
- `http://127.0.0.1:3003/refund`：客户退款请求页；从已完成 deposit 创建 refund case，收集 refund reason 和 destination wallet，跑 refund destination KYT，并提交后台审批。
- `http://127.0.0.1:3003/history`：客户交易历史。
- `http://127.0.0.1:3003/support`：客户支持页。
- `http://127.0.0.1:3003/settings`：客户 profile / settings。

澳门赌场工作人员后台入口：

- `http://127.0.0.1:3003/ops`：**工作人员登录页**（`StaffLogin.tsx`）——主入口 Okta SSO（demo 免 2FA，直接进后台），次要入口邮箱+密码。
- `http://127.0.0.1:3003/casino-ops`：Operator VA Operations Portal，面向 casino treasury / compliance / finance / audit staff（登录后落地）。
- `http://127.0.0.1:3003/treasury-controls`：后台别名，暂时保留兼容旧链接；不要从客户端导航过去。

## 线上测试入口

当前线上站点：`https://h5.hypercypto.com`。

Demo 登录：

- Email：`demo.user@hypercrypto.com`
- Password：`Demo@12345`
- 也可以在登录页点击 `Use Demo Account`。

客户/玩家端入口：

- `https://h5.hypercypto.com/`：HyperTransfer landing page。
- `https://h5.hypercypto.com/login`：客户登录页。
- `https://h5.hypercypto.com/kyc`：客户身份验证页。
- `https://h5.hypercypto.com/dashboard`：客户账户首页。
- `https://h5.hypercypto.com/new-deposit`：客户创建入金请求。
- `https://h5.hypercypto.com/refund`：客户 withdrawal 请求 demo（兼容旧路由）。

澳门赌场工作人员后台入口：

- `https://h5.hypercypto.com/casino-ops`：Operator VA Operations Portal。

## Release Notes

每次形成新版本或完成一组可测试改动时，必须在本节追加详细 release notes。Release notes 至少包含：

- 版本名 / 日期 / 测试 URL。
- 客户端入口变化。
- 客户端新增功能与行为变化。
- 工作人员后台新增功能与行为变化。
- 业务规则、合规口径、术语变化。
- 新增 / 修改 / 删除的关键代码文件。
- 验证结果，包括 `corepack pnpm run check`、`corepack pnpm run build` 或无法运行的原因。
- 已知限制、mock 边界、下一步建议。

### 2026-07-02 线上版本号 build metadata 修复

- **日期 / 范围**：2026-07-02。HyperTransfer Demo 首页版本号显示与 Docker/GitHub Actions 部署链路。
- **客户端入口变化**：无路由变化；修复 `/` Demo hub 底部 build label 从 `v1.0.0+local` 退回 fallback 的问题。
- **客户端功能 / 行为变化**：前端静态包仍按 `v<package.json version>+<git short sha>` 显示版本号；Docker 构建时通过 `VITE_GIT_COMMIT` build arg 注入 Git short SHA。
- **部署 / 运维变化**：
  - `Dockerfile.frontend` 新增 `ARG/ENV VITE_APP_VERSION`、`VITE_GIT_COMMIT`，供 Vite build 读取。
  - `docker-compose.yml` 将 `VITE_APP_VERSION`、`VITE_GIT_COMMIT` 作为 web build args 传入前端镜像构建。
  - GitHub Actions 香港部署 workflow 在远端执行 `docker compose up --build` 前导出 `VITE_GIT_COMMIT="${GITHUB_SHA::7}"`。
  - `deploy.sh` 手工部署时用 `git rev-parse --short HEAD` 导出 `VITE_GIT_COMMIT`，避免 Docker build context 不包含仓库根 `.git` 时继续显示 `local`。
- **业务规则 / 合规口径**：无。
- **关键代码文件**：`.github/workflows/hypertransfer-deploy-hk.yml`、`hypertransfer-main/Dockerfile.frontend`、`hypertransfer-main/docker-compose.yml`、`hypertransfer-main/deploy.sh`。
- **验证**：`VITE_GIT_COMMIT=versioncheck corepack pnpm run build` ✅，构建产物包含 `v1.0.0+versioncheck`；`VITE_GIT_COMMIT=composecheck docker compose config` ✅，确认 web build args 含 `VITE_GIT_COMMIT: composecheck`；`corepack pnpm run check` ✅；`git diff --check` ✅。
- **已知限制 / mock 边界**：已构建出的旧前端镜像仍会显示旧 label，必须重新部署/重建前端镜像后页面才会从 `local` 变为新 commit short SHA。

### 2026-07-02 PDF 修改意见全量收口 + Travel Rule Sumsub 核对

- **日期 / 范围**：2026-07-02。HyperTransfer 客户端 KYC / Travel Rule / Dashboard / Deposit flow + 工作人员后台 Deposits。隔离本地测试 URL：`http://127.0.0.1:3123/kyc`、`/travel-rule`、`/dashboard`、`/deposit-success`、`/casino-ops`（前端 `3123` 代理后端 `8123`，测试 DB `/tmp/hypertransfer-test-8123.db`）。
- **客户端入口变化**：客户仍从 `/kyc`、`/new-deposit`、`/travel-rule`、`/main-deposit`、`/deposit-success`、`/dashboard` 进入；Dashboard 不再提供 withdrawal 入口，也不再显示 History quick link，Recent Activity 自身承担最近交易展开查看。
- **客户端功能 / 行为变化**：
  - **KYC**：承接并收口 `2026-07-02 KYC 必填星号与字段说明收口`；必填字段与材料清单使用星号 `*`，底部备注 `Fields marked with * are mandatory.`，页面不再出现 `Optional` / `May be required` / `REQUIRED` badge、`Legal First/Last Name`、KYC 6 个月有效期提示；section title 全局使用更突出的标题层级。
  - **Travel Rule**：客户页移除 `Beneficiary Route` 与 `Provider Strategy` 两个输入；`Originating VASP / Wallet Provider` 改为下拉选择；CTA 从长按钮改为 `Next`；页面文案不出现 Hex / Wynn；hidden data 仍固定写入 `HyperTransfer custody deposit account` 与 `Sumsub Travel Rule adapter`，避免旧 session state 污染提交记录。
  - **Travel Rule provider guard**：提交前先读取 `/api/sumsub/config`。若 Sumsub 未配置，直接走本地 demo adapter，不再制造一个预期失败的 provider 调用；若配置存在但模块未开通或调用失败，继续走既有 fallback 并给 toast 说明。
  - **Main Deposit**：删除主入金确认后的中间 `Deposit Confirmed` 页面；主入金确认完成后直接记录 completion 并进入 `/deposit-success`。
  - **Dashboard**：Account Status approved 文案改为 `Verified`（不再显示 `Deposit enabled`）；Start Deposit 按钮改为金色文字 + 金色边框；删除 `Deposit Overview`、`Withdraw Funds`；Recent Activity 折叠态只显示 amount、transfer date、状态（WIP / Transferred / Settled / Rejected），点击交易行才展开 Reference ID 与 tx hash。
  - **History**：保留 `/history` 兼容路由，但状态 label 同步为 `WIP` / `Transferred` / `Settled`，与 Dashboard 口径一致。
- **工作人员后台变化**：
  - `DepositQueuePanel.tsx` 将 Deposits 队列标题改成 staff task 口径：逐个 review deposit session 并录入 marker settlement；每个 session 卡片显示 `Session date`，marker 输入框改为金色边框并标注 `Marker ref *`。
  - `CasinoOpsPortal.tsx` 的 active deposit case 明确提示 staff task，摘要区增加 Session date；后台仍只保留 `Deposits / Withdrawals / Access Requests / Staff Admin` 四个工作区。
- **业务规则 / 合规口径**：
  - 已按用户提醒核对 Sumsub 官方 Travel Rule 文档：Sumsub 的 Travel Rule transaction 需要 originator / beneficiary 信息、资产与链标识；API 示例中 counterparty 类型、姓名/全名、钱包地址等为 required；counterparty VASP `institutionInfo.internalId` 是 optional 但 strongly recommended。因此产品决策为：**客户页不暴露 Beneficiary Route / Provider Strategy，但系统仍保留并固定提交 counterparty/beneficiary 路由信息**，避免把合规必需数据从模型中删掉。
  - 参考：Sumsub `How to submit Travel Rule transactions via API`、`Transaction types`、`Travel Rule settings`。
- **关键代码文件**：`hypertransfer-main/client/src/pages/{KYC,TravelRule,Dashboard,History,MainDeposit,CasinoOpsPortal}.tsx`、`hypertransfer-main/client/src/components/DepositQueuePanel.tsx`、`hypertransfer-main/client/src/contexts/{DemoContext,DemoModeContext}.tsx`。
- **验证**：
  - `cd hypertransfer-main && corepack pnpm run check` ✅。
  - `cd hypertransfer-main && corepack pnpm run build` ✅（仅 Vite chunk-size warning）。
  - Chrome Playwright（system Chrome）隔离服务完整验证：KYC 页面无旧文案、section title `16px` > label `12px`；KYC demo approve → Dashboard verified → New Deposit 1,002 USDT → Wallet Screening → Travel Rule → Main Deposit Step 1/2 → Deposit Success；确认无 `Deposit Confirmed` 中间页、Deposit Success 无 `Return to Dashboard` / `Request Withdrawal`；Header 回 Dashboard 后 Recent Activity 可展开 Reference ID 与 tx hash。
  - Chrome Playwright staff 验证 `/casino-ops`：仅四个工作区；deposit session、session date、`Marker ref *` 必填输入可见；保存 `MK-PW-1002-001` 后 session 进入 settled；客户链路与 staff 链路均无业务 API 4xx/5xx、无 console error/warn（忽略 favicon）。
  - 截图留存：`/tmp/hypertransfer-qa-kyc.png`、`/tmp/hypertransfer-qa-travel-rule.png`、`/tmp/hypertransfer-qa-dashboard.png`、`/tmp/hypertransfer-qa-casino-ops.png`。
- **已知限制 / mock 边界**：Sumsub Travel Rule 在本地未配置 secrets 时走 demo adapter；Travel Rule 真实协议、counterparty matching、VASP directory / institution internalId 仍需生产 Sumsub/Cockpit 配置和真实 provider account 验证。

### 2026-07-02 KYC 必填星号与字段说明收口

- **日期 / 范围**：2026-07-02。HyperTransfer 客户端 KYC 页面。本地测试 URL：`http://localhost:3000/kyc`。
- **客户端入口变化**：无新增路由；客户仍从 `/kyc` 进入 Identity Verification。
- **客户端功能 / 行为变化**：
  - `KYC.tsx` 将字段与材料清单的 `REQUIRED` badge 改为星号 `*`，并在页面底部统一备注 `Fields marked with * are mandatory.`。
  - 删除页面可见的 `Optional`、`May be required`、`REQUIRED` badge 文案；非必填字段不再显示状态标签，placeholder 改为 `If applicable`。
  - `Legal First Name` / `Legal Last Name` 改为 `First Name` / `Last Name`。
  - 顶部提示 box 删除 `KYC approval is valid for 6 months...` 续期说明，只保留处理 crypto deposits 前需要身份核验的提示。
  - `Applicant data`、`Identity document`、`Residential address`、`Compliance questionnaire`、`What you'll need` 等 section title 统一使用更大的分区标题样式（`text-base`、更大金色图标、统一间距），使所有区域标题都明显高于字段内容层级。
- **工作人员后台变化**：无。
- **业务规则 / 合规口径**：仅调整客户页展示口径；KYC 6 个月有效期规则仍保留在业务规则与后端状态逻辑中，只是不再出现在该提示 box。
- **关键代码文件**：`hypertransfer-main/client/src/pages/KYC.tsx`。
- **验证**：`corepack pnpm run check` ✅；`corepack pnpm run build` ✅（仅 Vite chunk-size warning）；Browser 验证移动端 `393x852` 与桌面 `1280x720` 的 `/kyc` 页面均无旧 `REQUIRED` / `Optional` / `May be required` / `Legal First` / `Legal Last` 文案，section title 加粗放大，星号必填标记可见；填写 First Name 交互成功；滚动到底部确认 mandatory 备注可见；console 无 error/warn。
- **已知限制 / mock 边界**：本次不改变 Sumsub/后端 KYC provider、KYC 有效期、提交必填校验与材料上传边界；document photos 与 selfie/liveness 仍只是客户准备清单，不在此页上传。

### 2026-07-01 KYC 页面完整字段 + 邀请交付增强 + History 空态 + Deposit Success marker 同步 + Withdrawal 术语收尾

- **日期 / 范围**：2026-07-01。HyperTransfer 客户端 + 工作人员后台。本地测试 URL：`http://localhost:3000/dashboard`、`/kyc`、`/history`、`/refund`、`/new-deposit`、`/deposit-success`、`/casino-ops`。
- **客户端入口变化**：`/refund` 继续作为兼容路由保留，但用户可见文案统一为 **withdrawal / withdraw**；Dashboard、Deposit Success、History、Support FAQ、withdrawal 表单和流程说明不再显示 `refund` 字眼。
- **客户端功能 / 行为变化**：
  - **首页版本号**：`DemoHome.tsx` 底部显示 `v<package version>+<git short sha>`（例如 `v1.0.0+8457a9b`），由 `vite.config.ts` 注入 `VITE_APP_VERSION` / `VITE_GIT_COMMIT`，方便线上页面与 Git commit 对齐。
  - **KYC 页面补齐字段与材料清单**（`KYC.tsx`）：增加 legal name、nationality、DOB、tax residence、mobile、document fields、residential address、occupation、source of funds、consent；显示 ID document photos、selfie/liveness、proof of address、phone/email verification、compliance questionnaire，并区分 Required / Optional / May be required；KYC 有效期文案标明 6 months；移除客户页可见 provider 品牌。
  - **KYC pending**：顶部改旋转 loading；移除手动 demo approve 按钮；demo/non-production 提交后 5 秒自动 approve 跳过 review 页；页面可见文案去除 provider 名。
  - **History**：使用 compact layout，移除无效 filter icon；入金状态改为 All / Pending / Deposit Completed / Settled 过滤。客户能在已结算记录里看到工作人员录入的 marker reference；空态 footer 不再被大块空白推到底。
  - **Withdrawal 文案收尾**：`Dashboard.tsx` 的「Request a refund」改「Request a withdrawal」；`RefundProcess.tsx`、`refund-process.ts`、`RefundQueuePanel.tsx`、`CasinoOpsPortal.tsx`、`HexSafeLivePanel.tsx`、`Support.tsx`、`DepositSuccess.tsx`、`History.tsx` 全部改为 withdrawal 口径；后端错误提示与 audit action 也改为 withdrawal。
  - **New Deposit demo path**：`NewDeposit.tsx` 在 Hex Safe network 未配置时，主按钮直接使用内部 demo rail 进入 `/wallet-screening`；删除单独的 `Demo: skip & continue` 按钮。
  - **Travel Rule 快速填充**：`TravelRule.tsx` 监听全局 demo autofill 事件，闪电按钮会填充 residential address、city、country、source of funds、originating wallet provider、beneficiary route 和 provider strategy；`DemoModeContext.tsx` 补齐 address/city/country 与 VASP 字段映射，避免通用填充把 Originating VASP 误写成 wallet address。
  - **Deposit Address demo path**：`DepositAddress.tsx` 在未创建真实后端入金单或 Hex Safe network 未配置时，会自动补齐 demo 入金状态、生成本地占位地址，并自动进入 `/main-deposit`；不再显示 `Address blocked` 卡片卡住 demo 流程。
  - **Main Deposit 剩余金额口径**：`MainDeposit.tsx` 将 Expected Deposit Amount 作为计划入金金额，但 Step 1 使用链上实际到账金额计算剩余主入金；新增 demo 按钮模拟用户误转 `100 USDT`。Step 1 确认后与 Step 2 摘要/按钮显示 `max(planned − actual_step1, 0)`（例如计划 1,002、Step 1 实到 100 → Step 2 发送 902）；Step 2 顶部金额框改为只读的剩余待转金额，计划金额只保留在 summary；若 Step 1 实到金额已覆盖计划金额，则不要求二次转，成功页显示实际到账额并保留 Planned Amount。
  - **Step 2 地址与费用展示**：Step 1 已验证收款地址后，Step 2 只展示 verified receiving address，不提供 copy/edit；fees 只显示 Network gas fee，不再显示 wallet screening。
  - **Deposit Success 收尾**：`DepositSuccess.tsx` 删除底部 `Return to Dashboard` 与 `Request Withdrawal` 辅助按钮，只保留 `Make Another Deposit`；Header `HyperTransfer` 品牌链接可回当前身份首页（客户→`/dashboard`，staff→`/casino-ops`）；Credited 行显示被扣除的 Gas fee；Settlement 行在 staff 后台录入 marker 后自动从 `In progress · pending marker` 更新为 `Settled · <ref>`；tx hash 保留为链上交易凭证。
- **工作人员后台变化**：
  - `InvitationReviewPanel.tsx`：RM 交付卡新增复制链接、发送客户邮件、过期置灰、重新签发 6h 链接；access request 列表最多 5 条/页。
  - `CasinoOpsPortal.tsx` / `RefundQueuePanel.tsx`：侧栏与队列可见名称改为 Withdrawals / Withdrawal Queue。
  - `CasinoOpsPortal.tsx`：后台侧栏移除 `Custody (Hex Safe)` 与 `Treasury & Compliance` 两个旧入口；Deposits 页下方删除 `HT Markets OTC` 与 `Depeg Response` 旧 demo 卡片，只保留 active deposit case 摘要和 WTA settlement/marker 相关控件。active deposit case 用于展示当前员工正在处理的客户入金，驱动 settlement/marker 控件。
  - `DemoModeToggle.tsx` / `DemoModeContext.tsx`：浮动按钮可一键填充当前 demo 数据并全局生效。
  - `DepositQueuePanel.tsx`：纯 demo 入金（未创建真实后端入金单）会读取 `demo-deposit-settlement` 共享记录，marketing/ops/admin 可保存 external marker reference；保存 marker 即视为 casino marker 已发给客户，demo/后端入金单状态进入 `settled`，客户 `/deposit-success` 与 `/history` 同步显示 `Settled · <marker ref>`。
- **业务规则 / 合规口径**：KYC approval valid for 6 months；withdrawal 只能退回此前已验证钱包，仍沿用 `/refund` 技术路由与 `/api/refunds` 兼容接口，避免破坏现有数据和链接；tx hash 是链上 transaction hash/receipt id，用于区块浏览器核验、对账、客服查询与审计留痕；客户入金状态三态为 `Pending` / `Deposit Completed` / `Settled`，只有录入 marker reference 后才算真正给到客户 marker/筹码。
- **关键代码文件**：`client/src/pages/{KYC,KYCStatus,Dashboard,History,RefundProcess,DepositSuccess,Support,TravelRule,NewDeposit,DepositAddress,CasinoOpsPortal,DemoHome,MainDeposit}.tsx`、`client/src/components/{InvitationReviewPanel,RefundQueuePanel,DepositQueuePanel,DemoModeToggle,Shell,HexSafeLivePanel}.tsx`、`client/src/contexts/{DemoContext,DemoModeContext}.tsx`、`client/src/lib/{api,app-version,sumsub,refund-process,compliance,currency,demo-deposit-settlement}.ts`、`backend/server.py`、`vite.config.ts`。
- **验证**：`corepack pnpm run check` ✅；`corepack pnpm run build` ✅（仅 Vite chunk-size warning）；`python3 -m py_compile hypertransfer-main/backend/server.py` ✅；Browser 验证 `/dashboard`、`/history`、`/refund` 可见页面无 `refund` 字眼，History All / Pending / Deposit Completed / Settled tab 交互正常，`/refund` 页面显示 `Request a Withdrawal`；Playwright 验证 `/new-deposit` 无 Hex Safe network 时主按钮可点击、无 skip 按钮、点击进入 `/wallet-screening`；Browser 验证 `/travel-rule` 闪电按钮填充 address/city/country/source/provider 后 submit 可用且 console 无错误；Browser 验证 `/deposit-address` 自动进入 `/main-deposit`、无 `Address blocked`，并可完成 demo 入金到 `/deposit-success`；Chrome Playwright 完整验证 `login → new-deposit(500 USDT) → wallet-screening → deposit-address → main-deposit → deposit-success → brand 回 dashboard → ops Okta → casino-ops Deposits 保存 MK-DEMO-500-001 → deposit-success`，确认 Gas fee 可见、`Return to Dashboard` 不存在、Settlement 更新为 `Settled · MK-DEMO-500-001`；Browser 复验 `/deposit-success` 应用根节点无 `Request Withdrawal` / `Return to Dashboard`，控制台无 error/warn；Chrome Playwright 验证 `new-deposit(1,002 USDT) → wallet-screening → travel-rule → main-deposit`，Step 1 确认后显示 `remaining 1,001 USDT`、Step 2 摘要显示 `Total planned deposit 1,002.00` / `Already verified 1.00` / `Remaining to send 1,001.00`；Chrome Playwright 验证 `1,002 USDT` + demo Step 1 实到 `100 USDT` 后 Step 2 剩余 `902 USDT`，以及计划 `50 USDT` + Step 1 实到 `100 USDT` 后无需二次转、成功页显示 Planned `50 USDT` / Amount Sent `100 USDT`；Browser 复验 `/casino-ops` 仅显示 `Deposits / Withdrawals / Access Requests / Staff Admin` 四个侧栏入口，无 `Custody (Hex Safe)` / `Treasury & Compliance` / `HT Markets OTC` / `Depeg Response`，active deposit case 与 WTA settlement 仍存在，console 无 error/warn；Browser 验证 `/casino-ops` 录入 `MK-HIST-SETTLED-001` 后后台卡片变 `settled`，客户 `/history` 显示 `Settled` 并在展开详情中显示 Reference ID、Transaction Hash、Marker Reference，`/deposit-success` 显示 `Settled · MK-HIST-SETTLED-001`；上述 console 均无 error/warn。
- **已知限制 / mock 边界**：KYC provider 与 Hex Safe/withdrawal payout 仍为 demo/mock 或 adapter 边界；真实 provider、邮件中继、Hex Safe funded vault/quorum 仍需生产凭据与合同接口确认；纯 demo marker 同步使用浏览器本地共享记录模拟 staff 回写，真实后端入金单仍以 `/api/deposits` 的 marker/settlement 字段为准。

### 2026-06-30 邀请流打磨 + 入金费用/汇率/容错 + Okta 员工登录 + Demo 首页 hub + demo 便利

- **日期 / 范围**：2026-06-30 ~ 07-01。HyperTransfer 客户端 + 工作人员后台。分支 `feat/invite-flow-and-demo-login`（PR #10，Squash 待合并 `main`）。本地前端 3000 / 后端 8000 已起，Chrome MCP 真机点测通过。
- **客户端入口变化**：
  - **新增 Demo 首页 hub**（`pages/DemoHome.tsx`，路由 `/`）：客户端入口 → `/welcome`、工作人员端入口 → `/ops` 两张卡，演示时一处切换。原 Landing 移到 `/welcome`（`App.tsx`）。卡片动画只做 y-slide 不做 opacity（规避 framer-motion 在自动化下 RAF 节流导致卡片停在 opacity:0 的问题）。
  - **工作人员登录页 `/ops` 改 Okta SSO**（`StaffLogin.tsx`）：主按钮「Sign in with Okta」直接进 `/casino-ops`（demo 不真接 Okta、免 2FA、admin 全权限），邮箱+密码降为次要入口。
- **客户端功能 / 行为变化**：
  - **入金费用明细 + 汇率 + 完成页凭证**（`MainDeposit.tsx` / `DepositSuccess.tsx` / `lib/currency.ts` / `lib/compliance.ts`）：确认前展示汇率（**HKD** 估值，demo）+ 费用明细；**Gas 费由客户承担并从到账扣除**（`estimatedReceived = deposit − gas`，口径较早前"免 gas"**已反转**）；完成页显示 **txHash（区块浏览器链接）+ Reference ID + 结算「in progress · pending marker」**；**全额容错** `handleFullAmountDetected`（客户直接打全额进验证地址不卡流程）；`formatNetworkRail` 展示网络 rail（含 TRC-20/ERC-20 说明）。
  - **Demo 便利（全 gated on 后端 `HT_DEMO_BYPASS_2FA` / 非 production）**：Email/SMS OTP 发送后自动填码（`Invite.tsx`/`ForgotPassword.tsx`/`Login.tsx` 带回 `demo` flag）、**首登/登录/忘密 2FA 自动填 6 位 + 点击必过**（`Setup2FA.tsx`/`Verify2FA.tsx`/`StaffLogin.tsx`）、已存在用户重复注册也显示成功、邀请可重复跑（后端 `register_invite` + `invitation_is_redeemable` demo 放宽）。
  - **入金 skip 按钮门槛修复**：`NewDeposit.tsx` / `DepositAddress.tsx` 的「skip & continue」原用 `import.meta.env.DEV` 门槛（线上 build 为 false → 线上 demo 点不了），改为**后端驱动条件**（网络未配置 / `selectedNetwork==="demo"`），线上 demo 也能跑。
- **工作人员后台变化（邀请审核面板 `InvitationReviewPanel.tsx`）**：
  - **审批 3 态收敛** `submitted / approved / rejected`（去 `issued`，**批准即自动签发**）；**拒绝必填原因**（存 `details_json.rejectReason`）；RM 可 **resubmit**（`invitationApi.resubmit` + 后端端点）；Marketing 列表过滤掉已批准/已消费，批准后**转 RM 交付**。
  - **RM 交付卡**：持久展示**邀请链接 + 二维码（`inv.qrPngBase64`）+ 链接时效状态**（`Valid · Xh Ym left` / `Link expired`，由 `expiresAt` 计算）+ Copy/Resend；去重掉重复的「Resend invite email」按钮。
  - **RM 表单字段简化**：`Member ID`（白标，**禁「Win ID」**）+ `First Name` + `Last Name` + `Email`（去 Age/Phone/Passport）；`patronName = First + " " + Last`；Created 显示到秒（`toLocaleString`）。表单标签移到输入框上方（共享 `LabeledInput`，`ops-ui.tsx`）。
  - 后台底部「Staff portal boundary」横幅（含 Open Customer Dashboard 按钮）**已删除**（`CasinoOpsPortal.tsx`）。
- **业务规则 / 合规口径**：Gas 费口径**反转**为客户承担（见 §业务规则「入金费用模型」）；邀请链接 TTL 72h→6h；邀请审批 3 态；工作人员端登录改 Okta SSO demo；均已回写 §业务规则 + `CLAUDE.md`。**白标**：Member ID 取代「Win ID」。
- **后端变化**（`server.py`）：`DEMO_STAFF_SESSION_TOKEN` 识别 + `demo-staff-id`→admin 角色；`approve_invitation` 批准即签发；`reject_invitation` 必填原因；新增 `resubmit_invitation`；`invitation_public` 为已签发补 `inviteLink + qrPngBase64`；`INVITE_TTL` 6h；OTP/2FA/register/redeem 一系列 demo 放宽（gated on `HT_DEMO_BYPASS_2FA` + 非 prod）。`seed_demo.py` **不再预置** `newvip@demo.local` 测试邀请（邀请队列演示时现场提交）。
- **关键代码文件**：新增 `pages/DemoHome.tsx`、`lib/currency.ts`；改 `App.tsx`、`pages/{StaffLogin,MainDeposit,DepositSuccess,Invite,Setup2FA,Verify2FA,ForgotPassword,Login,NewDeposit,DepositAddress,History,CasinoOpsPortal}.tsx`、`components/{InvitationReviewPanel,ops-ui,DepositQueuePanel,StaffAdminPanel,HexSafeLivePanel}.tsx`、`lib/{api,authFlow,compliance,currency}.ts`、`backend/{server.py,seed_demo.py}`。
- **验证**：`corepack pnpm run check`（tsc）✅；**Chrome MCP 真机点测通过**（邀请→Email OTP→注册→2FA→KYC→入金→退款 + 登录/忘密/Okta 全链路自动填/一键过；退款自由金额建单；TravelRule 提交后回 `/main-deposit` 不弹回验证页）。
- **已知限制 / mock 边界**：Okta 未真实接；汇率 / gas 为 demo 值（真实待 Hex Trust 汇率口径）；所有 demo 便利仅在 `HT_DEMO_BYPASS_2FA` + 非 production 生效，生产不受影响。DemoHome/Okta/费用模型随本分支上线，线上 `main` 合并后 §线上测试入口再补 `/` 与 `/ops`。

### 2026-06-29 退款重构（退回已验证钱包 + 自由金额 + 首页入口）+ 两处入金流 bug 修复

- **日期 / 范围**：2026-06-29。HyperTransfer 客户端入金 / 退款流。线上测试入口同 §线上测试入口（`/dashboard`、`/refund`、`/new-deposit`、`/casino-ops`）。
- **客户端入口变化**：
  - **退款入口加到首页 Dashboard**（`pages/Dashboard.tsx` 新增「Request a refund」卡片）；**门槛**：KYC approved **且**至少一个已验证原钱包（后端 `refundApi.wallets()`，demo 回退=本会话已完成入金的来源钱包）才可点，否则置灰 + 文案提示。`/refund` 返回键改回 `/dashboard`（原为 `/deposit-success`）。
- **客户端功能 / 行为变化**：
  - **`/refund` 重构为"退回已验证钱包"**（`pages/RefundProcess.tsx`）：不再以单笔已完成入金为中心、不再把金额写死成 `latestMainTx.amount`。改为 **选已验证原钱包 → 自由输入退款金额（可多可少，带 HKD 估值）→ 可选原因 → 创建**。资格 = 有已验证钱包。明确提示"金额可与入金不同；treasury 放款前校验 vault 余额"。
  - **Bug 修复①（退款报错）**：「Demo: skip & continue」把网络设为占位 `"demo"`，导致 `createRefundRequest` 的 Phase 1 网络白名单拦截抛 "Refunds are limited to supported Phase 1 stablecoin assets and networks."。现让 `"demo"` 占位**网络**豁免网络白名单（资产白名单仍始终生效，demo 也只用 USDT）；真实网络照旧拦截。
  - **Bug 修复②（Travel Rule 跳回 1 USDT 验证页）**：`pages/TravelRule.tsx` 完成后**无条件** `navigate("/deposit-address")`，导致从 main_input「Proceed」绕到 TR 提交后被弹回"先发 1 USDT"说明页（还会重新发址覆盖原地址）。现按阶段返回：已发址 / 已过验证步骤（`testPaymentConfirmed || depositAddress`）回 `/main-deposit` 续主入金，否则才回 `/deposit-address`。
- **业务规则 / 合规口径**：对齐 process v1 §C / 规则 #10·#11——退款**只退已验证原钱包**（前端 picker 禁自由输入 + 后端 `refund_create` 校验 walletId 必属本人 `verified_wallets`，双重落地）；退款**金额不绑定入金额**（后端 `/api/refunds` 已支持任意 `amountDecimal`），上限由员工端 vault 余额 + 管理层审批兜底（对应 "Sufficient Fund in Vault?"）。`REFUND_PROCESS_STEPS` 文案同步对齐（第 2 步=选已验证原钱包、第 4 步=审批含 vault 余额）。
- **关键代码文件**：`client/src/pages/RefundProcess.tsx`（重写）、`client/src/pages/Dashboard.tsx`（入口 + 门槛）、`client/src/lib/refund-process.ts`（demo 网络豁免 + steps 文案）、`client/src/pages/TravelRule.tsx`（返回路由）。
- **验证**：`corepack pnpm run check`（tsc）✅ + `corepack pnpm run build` ✅。浏览器自动验证**未跑**：preview 工具在本机环境无法 spawn（沙箱 getcwd / Operation not permitted），dev server 已恢复在 3000 供人工眼测。
- **已知限制 / mock 边界**：vault 余额是否充足、管理层审批、Hex Safe 放款仍是 `/casino-ops` 退款队列 mock（compliance screen → approve → execute）——demo **不会真的校验 vault 余额**，属 treasury 侧职责。退款金额客户端不设上限，真实放行需 funded vault + Hex Safe quorum。

### 2026-06-28 内部管理界面（staff 后台 4 块接真实后端）

- staff 后台 `/casino-ops` 新增 4 个真实管理面板（之前只有 demo + Hex Safe live 面板）。共用 `components/ops-ui.tsx`；均按 `useAuth().user.roles` 显隐按钮，**真正防越权靠后端 `require_role`**，无权访问的角色得到友好 403 提示。
- `RefundQueuePanel`（`/api/refunds*`）：compliance KYT screen → management approve → custodian execute；execute 无 Hex Safe 凭据时如实 toast。
- `DepositQueuePanel`（`/api/deposits`）：入金队列 + Marker 录回(marketing/ops) + settle(custodian/ops, Forex 兑法币 demo + receipt)。
- `InvitationReviewPanel`（`invitationApi`）：RM 提交 → Marketing 批准/拒绝 → 签发 single-use+72h link（展示 inviteLink）。
- `StaffAdminPanel`（`adminApi.createStaff`，admin 限定）：建员工 + 分配角色，返回 TOTP 绑定 QR（新员工 pending_totp，需 confirm-totp 激活）。
- `lib/api.ts` 补 `depositApi.queue/marker/settle`（invitationApi/adminApi 已有）。验证：`tsc` + `vite build` 全绿 + TestClient（退款 staff 链 10/10、邀请+员工 13/13）。⚠️ 浏览器渲染未做（preview-MCP 沙箱受限）。本批按用户确认直接 commit + 推送 main。
- 仍无 UI 的后端能力：reconciliation / depeg / OTC 自动化等仍为 demo（见 casino-ops 下方旧 demo 区）。

### 2026-06-28 入金编排后端 + ②KYC 硬阻断 + ③真实发址 + ①退款前端 wallet-picker

- 测试方式：后端 **TestClient 31/31** + **活动服务器 curl 全链路** deposit→refund；前端 `corepack pnpm run check`(tsc) + `corepack pnpm run build`(vite) **全绿**。⚠️ 浏览器可视化验证被 preview-MCP 沙箱 cwd 故障阻断（环境问题，非代码）。
- 本批次按用户确认**直接 commit + 推送 `main`**（沿用上一批 Hex Safe `983ba99` 的做法）。
- 本机**无 Hex Safe 凭据**：发址 / 1 USDT 轮询 / refund withdrawal 的真实路径已编码但本地走 demo 占位；Forex / Wallet-KYT 端点无法实地探测，已如实回报。

**②KYC 硬阻断（真实）**
- 闸门 `user_kyc_ok`（approved 且 `valid_until` 未过 6 个月）/ `require_kyc`，挂 `/api/deposits` 的 create / screen / issue-address / main。
- `GET /api/deposits/eligibility` 返回 `accountState: active|hold`（**hold→active = KYC 有效性本身**，不加独立 hold 列）。`/api/hexsafe/*` 仍是 staff 手工工具，KYC gate 落在 patron 编排层。

**③入金编排后端（`deposit_requests` 表 + `/api/deposits*`）**
- 状态机 `created → screening_passed/screening_failed → address_issued → verified → main_submitted → settled`。
- patron 端点：`create`（KYC gate，仅 USDT，network→chainId）、`screen`（来源钱包 KYT，server 端 mock adapter `screen_source_wallet`，可换真实 KYT）、`issue-address`（三闸门后发址：配 Hex Safe 调 `create_deposit_address`，否则非 prod demo 占位）、`confirm-test`（1 USDT 到账 → **写 `verified_wallets`**：配 Hex Safe + txHash 调 `get_deposit_by_tx_hash`，否则非 prod demo 确认）、`main`（最终金额，≥USD1k 标 TR）。
- staff 端点：`GET /api/deposits` 队列、`marker`（⑤ demo）、`settle`（④+⑤ demo Forex 兑法币 + receipt）。

**③入金流前端（backend-first + mock 回退，演示不中断）**
- `client/src/lib/api.ts` 新增 `depositApi` / `refundApi`；`contexts/DemoContext.tsx` 加 `depositRequestId`。
- `NewDeposit`（建单）、`WalletScreening`（后端筛查 + mock 回退）、`DepositAddress`（真实发址 + 占位回退）、`MainDeposit`（1 USDT confirm 写 verified_wallets + main 回填）。后端不可用/未登录/未过 KYC → 落回原 mock。

**①退款前端 wallet-picker（合规红线 UI 落地）**
- `pages/RefundProcess.tsx`：自由地址 `<input>` → **verified-wallet picker**（`refundApi.wallets()`，demo 回退=入金来源钱包）。只能选已验证原钱包，无自由输入；前后端双重落地（后端 `refund_create` 校验 walletId 必属本人）。

**④Forex（探测 + demo）**
- `GET /api/hexsafe/forex/probe`：只读端点探测 + 如实回报（无凭据→ unconfigured）。据 Hex Trust 口径 HT Markets OTC 无 quote/order API，`settle` 兑法币用 `DEPOSIT_FIAT_RATE` demo。

**⑥SMTP / 迁移**
- `send_email` 已 env-gated（`SMTP_HOST` 配则真发，否则 console）；`.env.example` 补 `EMAIL_FROM`/`SMTP_*` + `HEXSAFE_CHAIN_*` + `DEPOSIT_FIAT_*`。
- 持久库 `hypertransfer_auth.db`（旧 phone-PK schema）在 init_db 自动迁移（→user_id + 全部新表含 `deposit_requests` + `.bak`），已在**副本**验证（0 用户无损）。

**关键文件**：`backend/server.py`（deposit_requests schema + 编排端点 + KYC 闸门 + forex probe + record_verified_wallet 幂等化）、`client/src/lib/api.ts`、`contexts/DemoContext.tsx`、`pages/{NewDeposit,WalletScreening,DepositAddress,MainDeposit,RefundProcess}.tsx`、`.env.example`。

**已知限制 / 下一步**
- 真实 Hex Safe 联调（发真实地址 / 轮询真实 1 USDT 到账 / refund 真实放行）需 sandbox 凭据 + funded vault + quorum。
- Wallet KYT 仍 server 端 mock（Hex Safe sandbox 无 screening 端点；真实口径=Chainalysis/TRM 或 Hex Trust KYT 合同级）。
- Travel Rule 真实化待 Sumsub 账户激活 TR 产品。
- 生产化：SMTP 真实中继、PostgreSQL 迁移、2FA 可选 + 入金/退款 step-up 强制。

### 2026-06-28 Hex Safe Sandbox 集成 + Sumsub Travel Rule + 退款后端

- 测试方式：后端 TestClient + 对 Hex Safe / Sumsub **真实 sandbox 实测**；前端 `tsc` 通过 + vite proxy 端到端；⚠️ 未做真机浏览器渲染（preview 沙箱受限）。
- ⚠️ 本批次按用户要求**直接提交并推送 `main`**（不走 PR），并删除历史残枝、只留 main。

**Hex Safe (Hex Trust) 托管 — sandbox 实接（不再纯 mock）**
- 客户端 `backend/hexsafe_client.py`：`create_deposit_address`（`POST /v1/vaults/{id}/address`，body 仅 `{chainId}`，地址按 vault×链固定）、到账查询 `list_transactions`/`get_transaction`/`get_deposit_by_tx_hash`、`create_withdrawal`（6 字段）、`list_enterprises`、`min_confirmations`，全部对 sandbox 实测。
- 后端 `backend/server.py` `/api/hexsafe/*`（staff/custodian RBAC + 审计 + 提现幂等持久化 `hexsafe_idempotency`）：health / vaults / deposit-address / transactions(+`/{traceId}`) / deposit/{txHash} / withdrawal。
- 前端 `client/src/components/HexSafeLivePanel.tsx`（casino-ops 用真实 `hexsafeApi`，`lib/api.ts` 新增）。
- 到账监听 = **轮询**（sandbox 无 webhook 注册 API）；提现验证到余额边界（0 余额→业务层拒，无转账）。配置走 env（`.env.example` 补 `HEXSAFE_*`），密钥在仓库外 `~/hexsafe-keys/`。

**Sumsub Travel Rule — 代码接好，账户未激活**
- 口径：**KYC + Travel Rule 都走 Sumsub**（KYC 已可用）。
- 后端 `/api/sumsub/travel-rule/submit` + `/transactions`（复用 KYC applicant，`POST /resources/applicants/{id}/kyt/txns/-/data` type=travelRule，Content-Type application/json）；前端 `TravelRule.tsx` 接真实 + mock 回退；`lib/sumsub.ts` 新增。
- ⛔ 账户未激活 Travel Rule 产品 → `403 "This type of check is not allowed"`（用账户 level 列表证实：仅 3 个 KYC level，无 TR）。需 Sumsub Cockpit 装/激活 Travel Rule 规则包 + Settings 配置（可能需 sales 开通）。激活后代码即用。

**退款后端 — process v1 RETURN（合规红线落地）**
- 表 `verified_wallets`（入金验证过的原钱包）+ `refund_requests`；端点 `/api/refunds*`（wallets/create/mine/queue/screen/approve/reject/execute）。
- **合规红线**：退款只能退本人已验证**原钱包**（传非本人 `walletId`→400），不接受自由输入新地址（取代旧 `destinationAddress` 自由输入）。
- 流程：re-KYC 闸门（`user_kyc_ok`/`require_kyc`）+ compliance KYT 决策 + 管理层 approve（角色守卫）+ vault 余额校验 + 真实 hexsafe withdrawal + `transfer_id↔request_id` + 全程 audit。TestClient 实测全绿。

**已知限制 / 下一步**
- 客户入金流仍 mock（`DepositAddress` 随机地址）；真实化需「入金单 + TK 审批后 staff 发址」编排（③）；`record_verified_wallet` 钩子已留给入金流写 `verified_wallets`。
- KYC 硬阻断闸门函数已写（`require_kyc`）但未挂到入金/发址端点（②）。
- 待做：Wallet Screening / 1 USDT 验证用 Hex Safe API、Forex 兑法币（④，先探 sandbox 是否有 forex/兑换端点；Fiat account 归属 + HexTrust 是否提供法币 rail 待客户/HT 确认）；Marker / Receipt→Settlement = demo（⑤）；SMTP 真实投递（⑥，现 console）。
- ① 退款前端 `RefundProcess.tsx` 改 wallet-picker 接真实（去自由地址）待做。

### 2026-06-24 Auth Process v1: RBAC + user_id 重建 + 邀请制 + Email OTP

合并 PR #5 / #6 / #7（最终流程 v1 认证改造第一批），main commits `71ed4fe` / `2171cad` / `8e42478`。

客户端入口变化：
- 新增公开邀请落地页 `/invite?token=`：token+邮箱校验 → Email OTP 注册 → `/setup-2fa`。
- 登录页新增 `Use Demo Staff (Ops Portal)` 旁路（staff 视角进 `/casino-ops`）；普通 `Use Demo Account` 为 patron，已不能进后台（越权修复）。
- `/new-deposit` 仅显示 USDT（USDC 前端禁用、代码保留）。

业务规则 / 合规口径：
- 资产仅 USDT；Travel Rule 阈值改 USD 1,000（≈ HKD 8,000，修正旧 8000 把港币门槛当美元的 bug）。
- 准入改邀请制：RM 提交 → Marketing 审核 → 签发 single-use + 72h 邀请链接 → 客户 Email OTP 注册。手机短信注册并存保留。
- RBAC：`user_type`(patron/staff) + `user_roles`(rm/marketing/compliance/ops/custodian/admin) + `require_role` 端点级校验；`/casino-ops` 仅 staff。

后端关键变化（`backend/server.py`）：
- `users` 主键 phone→`user_id`(uuid)，email/phone 可空唯一；幂等迁移 + `.bak` 备份 + 行数校验。
- 新端点：`/api/admin/staff`、invitations CRUD（提交/审核/签发/verify）、`/api/email/send-otp`、`/api/register/invite`。
- 新表：`invitations`、`audit_trail`、`email_otps`；`users.invited_by` 列。
- admin env 种子：`HT_ADMIN_EMAIL` / `HT_ADMIN_PASSWORD`。邮件投递为 mock（console），`SMTP_*` env 预留未接。

验证：
- 前端 `corepack pnpm run check`（tsc）+ `build` 通过；后端 `py_compile` 通过。
- 后端 TestClient 邀请全流程 42/42 断言；user_id 迁移演练（幂等 + 关联表映射 + 旧库兼容）由主会话独立复核通过。
- 对抗性安全审计（5 攻击面多智能体）：无 blocker / high / medium；10 low + 2 none。

生产化 backlog（low，demo 不阻塞）：
- Email send-otp 枚举旁路（429 / 时延差）→ 统一限频 + 异步邮件投递。
- Email OTP 每日上限随消费重置 → 独立限频表 + IP 维度限流。
- `invitations.details_json` 明文 PII → 生产加密 / 最小化 + 收紧可见角色。
- admin 创建员工拿到其 TOTP secret → 生产改员工自助绑定。
- 明文 TOTP/OTP、console 邮件 = demo 已知限制。

不含（后续）：2FA 可选 / step-up（PR③）、KYC 6 月有效期 / hold→active 闸门（PR④）、退款方向反转、Marker/Forex。

### 2026-06-22 Production Test Links And Hex Trust API Meeting Prep

测试入口：

- 线上首页：`https://h5.hypercypto.com/`
- 线上登录：`https://h5.hypercypto.com/login`
- 线上 KYC：`https://h5.hypercypto.com/kyc`
- 线上 Dashboard：`https://h5.hypercypto.com/dashboard`
- 线上新建入金：`https://h5.hypercypto.com/new-deposit`
- 线上 Refund demo：`https://h5.hypercypto.com/refund`
- 线上赌场工作人员后台：`https://h5.hypercypto.com/casino-ops`

Demo 登录口径：

- `demo.user@hypercrypto.com` / `Demo@12345`。
- 用户自己在线上注册的账号密码不会明文保存；忘记密码只能走 `Forgot password?` 重置。

Hex Trust API 会议口径：

- 当前产品尚未接入真实 Hex Trust / Hex Safe API；已有的是流程、页面、mock adapter 和状态模型。
- `hypertransfer-main/client/src/lib/hex-safe.ts`：仍是 Hex Safe deposit status、confirmation count、vault balance、custody logs mock。
- `hypertransfer-main/client/src/lib/treasury-ops.ts`：仍是 HT Markets OTC、depeg、reconciliation、Macau access exclusion、custody evidence mock。
- `hypertransfer-main/client/src/lib/refund-process.ts`：仍是 refund destination KYT、treasury approval、Hex Safe payout mock。
- 下午与 Hex Trust 会议的目标是把对方从“商业上可用”推进到“工程上可接”：拿到正式 API docs、sandbox credentials、webhook payload examples、OpenAPI/Postman、vault/address/transfer/statement schema。

需要向 Hex Trust 确认：

- API auth、IP allowlist、key rotation、sandbox/production 切换方式。
- Deposit address 创建/获取/禁用、one-time/session address、memo/tag/expiry。
- Webhook event list、payload、signature、retry、idempotency、ordering、replay protection。
- 查询接口是否支持按 `txHash`、`addressId`、`transferId`、`vaultId` 拉 status。
- Confirmation payload 是否返回 `confirmationCount`、`requiredConfirmations`、finality timestamp。
- Transfer/refund 是否要求 whitelisted address，以及 approval/reject/cancel/failure retry/quorum/maker-checker API。
- Travel Rule 在香港 Hex Trust Limited 合同下的责任边界，特别是平台层是否仍不 hard-freeze pending Travel Rule。
- Reconciliation 的 API/webhook/SFTP/monthly statement schema、时区、fee 字段。
- HT Markets OTC 是否有 quote/order API，或仅 desk channel/email。

验证结果：

- `curl -L -s -o /dev/null -w "%{http_code}"` 检查 `/`、`/login`、`/kyc`、`/dashboard`、`/new-deposit`、`/refund`、`/casino-ops`：均返回 200。
- 本次仅更新文档，未改产品代码；无需运行 `corepack pnpm run check` / `corepack pnpm run build`。

已知限制：

- 线上可跑 demo 页面，不代表 Hex Trust / Hex Safe 真实资金、真实托管签名、真实链上 webhook 已接入。
- Sumsub KYC API-only demo 与 Hex Trust custody API 是两条边界；Sumsub 不替代 Hex Safe vault、地址签发、链上交易状态、payout 和 reconciliation。

### 2026-06-21 Sumsub API-Only KYC Demo And Refund Demo Seed

测试入口：

- 客户 KYC：`http://127.0.0.1:3003/kyc`
- 客户 Refund：`http://127.0.0.1:3003/refund`
- 赌场工作人员后台 refund queue：`http://127.0.0.1:3003/casino-ops`

客户端更新：

- KYC 页不再嵌入 Sumsub WebSDK / Sumsub panel。
- KYC Submit 改为 API-only demo：客户仍在 HyperTransfer 自有页面填写字段，前端调用后端 `/api/sumsub/kyc/start`，后端用 signed API 创建/复用 Sumsub applicant 并返回 applicantId / reviewStatus。
- KYC pending 页文案改为 `Sumsub API Status`，展示 provider API / webhook status，不再描述成客户在 Sumsub 面板内完成文档采集。
- Refund 空态新增 `Load Demo Refund Case`，一键注入 12,500 USDT TRC-20 cleared deposit、source wallet、Travel Rule accepted、KYC approved 等测试上下文。
- Refund 地址输入区新增 `Use Demo TRC-20/ERC-20 Wallet`，便于直接触发 destination KYT pass。
- Refund approval pending 状态新增 `Open Staff Approval Demo`，直接跳 `/casino-ops` 完成 staff approve / broadcast。

后端更新：

- `POST /api/sumsub/kyc/start` 新增 `apiOnly` 参数。
- `apiOnly=true` 时只创建/复用 applicant、更新 fixedInfo、拉取 review status，不生成 WebSDK access token；响应返回 `mode=api_only`、`token=""`、`expiresIn=0`。
- `apiOnly=false` 保留旧 WebSDK token 模式，供 connection test 或未来可选模式使用。

关键代码文件：

- 修改 `hypertransfer-main/backend/server.py`。
- 修改 `hypertransfer-main/client/src/lib/sumsub.ts`。
- 修改 `hypertransfer-main/client/src/pages/KYC.tsx`。
- 修改 `hypertransfer-main/client/src/contexts/DemoContext.tsx`。
- 修改 `hypertransfer-main/client/src/pages/RefundProcess.tsx`。

验证结果：

- `cd hypertransfer-main && corepack pnpm run check`：通过。
- `cd hypertransfer-main && corepack pnpm run build`：通过；Vite 仍有 chunk size warning。
- `cd hypertransfer-main/backend && ./.venv/bin/python -m py_compile server.py`：通过。
- 本地后端 `GET /api/health`：通过，`sumsubConfigured=true`。
- `POST /api/sumsub/kyc/start` with `apiOnly=true`：通过，返回真实 sandbox `applicantId`、`reviewStatus=init`、`mode=api_only`、`token=""`。
- 路由 smoke：`/refund`、`/kyc`、`/casino-ops` 均返回 200。

已知限制：

- API-only demo 当前只验证 Sumsub applicant / fixedInfo / status API 链路，不在客户页采集证件影像或 liveness。
- 如生产坚持完全自有 UI，需要后续开发文件上传、影像采集、活体检测/face match 的原生采集链路，并按 Sumsub 对应 API 和合规要求上传材料。
- Refund demo seed 是前端内存测试数据，刷新页面或 reset 后会消失；真实生产仍需后端订单、退款和审计持久化。

### 2026-06-21 Stablecoin-Only Assets and Refund Process

测试入口：

- 客户入金：`http://127.0.0.1:3003/new-deposit`
- 客户退款：`http://127.0.0.1:3003/refund`
- 交易历史退款入口：`http://127.0.0.1:3003/history`
- 入金成功页退款入口：`http://127.0.0.1:3003/deposit-success`
- 赌场工作人员后台 refund queue：`http://127.0.0.1:3003/casino-ops`

客户端更新：

- Phase 1 客户可见资产继续只保留 USDT / USDC；BTC 和 ETH 资产不处理。
- 客户可见网络文案改为 `ERC-20 stablecoin rail` / `TRC-20 stablecoin rail`，避免误解成 ETH 资产支持。
- Travel Rule 触发逻辑改为只看 `amount >= 8000`；不再因为 BTC / ETH 资产自动触发，因为这两个资产已不在支持范围内。
- Deposit Success 新增 `Request Refund` 入口。
- History 的 completed main deposit 明细新增 `Request Refund` 入口。
- 新增 `/refund` 客户侧退款页：
  - 读取已完成 deposit 的 original txHash / sessionId / amount / asset / network。
  - 客户选择 refund reason。
  - 客户提交同一稳定币 rail 的 destination wallet。
  - ERC-20 / TRC-20 地址格式校验。
  - Refund destination KYT mock：pass / manual review / reject。
  - KYT pass 后提交 treasury approval，客户侧显示 pending / completed / rejected / manual review 状态。
- Support FAQ 更新为 Phase 1 只支持 USDT/USDC 稳定币 rail，并加入 refund 说明。

工作人员后台更新：

- `/casino-ops` 新增 `Customer refund queue`。
- 后台可查看 refund amount、status、destination wallet、original txHash、KYT decision、audit trail。
- 后台新增 mock 操作：`Submit Approval`、`Approve`、`Broadcast`。
- Broadcast 会生成 mock Hex Safe transferId / payout txHash，并将 refund case 标记为 completed。

业务规则 / 资料更新：

- 新增 `ProjectInfo/Refund-Process-Research-and-Design.md`，整理内部资料依据和公开市场参考。
- Refund 不作为简单 reversal；它是 payout / withdrawal flow。
- 不默认退回 original source address；客户必须通过认证会话确认 refund destination，避免 CEX pooled wallet 场景造成资金归属问题。
- Refund 必须经过 destination-wallet KYT、treasury/compliance approval、custody transfer、webhook/polling completion、reconciliation、audit。
- `ClientMeetings/2026-06-08-HyperTransfer-Complete-Process-Flow.md` 更新 Phase 1 资产/网络口径和 Refund Process。

关键代码文件：

- 新增 `hypertransfer-main/client/src/lib/refund-process.ts`。
- 新增 `hypertransfer-main/client/src/pages/RefundProcess.tsx`。
- 修改 `hypertransfer-main/client/src/App.tsx`。
- 修改 `hypertransfer-main/client/src/components/Shell.tsx`。
- 修改 `hypertransfer-main/client/src/contexts/DemoContext.tsx`。
- 修改 `hypertransfer-main/client/src/lib/compliance.ts`。
- 修改 `hypertransfer-main/client/src/lib/currency.ts`。
- 修改 `hypertransfer-main/client/src/lib/validation.ts`。
- 修改 `hypertransfer-main/client/src/pages/DepositAddress.tsx`。
- 修改 `hypertransfer-main/client/src/pages/DepositSuccess.tsx`。
- 修改 `hypertransfer-main/client/src/pages/History.tsx`。
- 修改 `hypertransfer-main/client/src/pages/Support.tsx`。
- 修改 `hypertransfer-main/client/src/pages/WalletScreening.tsx`。
- 修改 `hypertransfer-main/client/src/pages/MainDeposit.tsx`。
- 修改 `hypertransfer-main/client/src/pages/CasinoOpsPortal.tsx`。
- 新增 `ProjectInfo/Refund-Process-Research-and-Design.md`。
- 修改 `ClientMeetings/2026-06-08-HyperTransfer-Complete-Process-Flow.md`。

验证结果：

- `cd hypertransfer-main && corepack pnpm run check`：通过。
- `cd hypertransfer-main && corepack pnpm run build`：通过；Vite 仍有 chunk size warning。
- 浏览器 smoke：
  - `/new-deposit`：只显示 USDT / USDC；未显示 BTC / ETH 资产；网络显示 ERC-20 / TRC-20 stablecoin rail。
  - `/refund`：在未完成 deposit 的当前浏览器状态下正确显示 `No refundable deposit found` 和 `Return to Dashboard`。
  - `/casino-ops`：显示 `Customer refund queue`，无 active refund 时显示空队列说明。
  - Console error/warn：0。
- 浏览器截图捕获两次因 in-app browser CDP screenshot timeout 未成功；DOM / console 验证通过。

已知限制：

- Refund 当前为前端 deterministic mock，未接真实 Hex Safe withdrawal / custody transfer API。
- Destination KYT 当前为 mock adapter；生产需接 Chainalysis/TRM/Elliptic/Sumsub Crypto Monitoring 或 Hex Safe 可用能力。
- 当前只支持针对最近完成 deposit 的 refund demo；生产需要多笔订单选择、部分退款、拒绝/取消/重开地址链接、通知模板和真实 audit export。

### 2026-06-21 Refund Process Security PPT

资料更新：

- 新增 `ProjectInfo/HyperTransfer_Refund_Process_Security_v1.pptx`。
- PPT 为英文客户版，共 11 页，主题为 `Refund Process Security Controls`。
- 内容覆盖：
  - Refund is a controlled payout, not a blockchain reversal。
  - No blind auto-return to original source address。
  - Refund request 与 original DepositRequest / txHash 绑定。
  - Phase 1 only USDT / USDC on ERC-20 / TRC-20 rails。
  - Customer-confirmed refund destination。
  - ERC-20 / TRC-20 address validation。
  - Destination-wallet KYT pass / manual review / reject。
  - Treasury/compliance approval、RBAC、maker-checker、Macau access exclusion。
  - Hex Safe custody payout、transferId、txHash。
  - Webhook / polling、reconciliation、audit pack。
  - Current prototype vs production integration gap。
- Reference basis slide 纳入内部项目资料和 BitPay、Crypto.com Pay、Cobo、BVNK、Coinbase 公开 refund guidance。

验证结果：

- 使用 artifact-tool 生成 PPTX，并导出 11 页 PNG 预览。
- 已检查 contact sheet、Slide 1、Slide 3、Slide 7、Slide 11 原尺寸预览。
- Layout JSON 越界检查：0 个 out-of-bounds element。
- 未改产品代码；无需运行 `corepack pnpm run check` / `corepack pnpm run build`。

### 2026-06-21 Refund Process Security PPT v2 Style Optimization

资料更新：

- 新增 `ProjectInfo/HyperTransfer_Refund_Process_Security_v2.pptx`，作为优化后的客户展示版本。
- 保留 `ProjectInfo/HyperTransfer_Refund_Process_Security_v1.pptx` 便于对比和回滚。

版式优化：

- 从 v1 的深色大画布改为浅色咨询材料风格，整体更像客户会议材料。
- 重做封面、security stance、end-to-end control map、request eligibility、approval、execution、reconciliation 等 11 页版式。
- 修正原截图中第 4 页大面积空框、内容松散、视觉重心失衡的问题。
- 减少无信息留白，改用紧凑卡片、表格、流程块和底部 evidence / guardrail 条。
- 保持英文客户版文案，继续强调 `USDT / USDC only`、`BTC and ETH are excluded`、refund 是 controlled custody payout 而不是 blockchain reversal。

验证结果：

- 使用 artifact-tool 重新生成 PPTX，并导出 11 页 PNG 预览。
- 已检查全页 contact sheet，并单独查看 Slide 1、Slide 4、Slide 7 原尺寸预览。
- Layout JSON 越界检查：0 个 out-of-bounds element。
- 未改产品代码；无需运行 `corepack pnpm run check` / `corepack pnpm run build`。

### 2026-06-21 Refund Process Security PPT v3 PowerPoint Layout Fix

资料更新：

- 新增 `ProjectInfo/HyperTransfer_Refund_Process_Security_v3.pptx`，作为 Microsoft PowerPoint 安全版。
- 未覆盖 v2，避免用户已打开 PowerPoint 文件时产生自动保存冲突；v1 / v2 继续保留用于对比。

版式优化：

- 全 deck 重新调整文本框高度、卡片高度、表格行高和左右留白，按 PowerPoint 可能更高的文字渲染来留安全空间。
- Slide 7 `Treasury and compliance approval` 重点修复：左侧 evidence 行从紧凑行改为 72px 高行，`Operational evidence` 缩短为 `Ops evidence`，正文允许两行显示。
- Slide 10 表格重排为更宽松的三列表格，说明文字改为 `What is available now...`，避免非正式表达和潜在换行。
- Slide 4 / 6 / 11 的长句进一步缩短，减少 PowerPoint 中换行导致的贴边或压线风险。
- 保持客户版英文口径：USDT / USDC only、BTC and ETH excluded、refund as controlled payout。

验证结果：

- 使用 artifact-tool 重新生成 PPTX，并导出 11 页 PNG 预览。
- 已检查全页 contact sheet，并单独查看 Slide 4、Slide 7、Slide 10、Slide 11 原尺寸预览。
- Layout JSON 越界检查：0 个 out-of-bounds element。
- `unzip -t ProjectInfo/HyperTransfer_Refund_Process_Security_v3.pptx`：通过。
- 未改产品代码；无需运行 `corepack pnpm run check` / `corepack pnpm run build`。

### 2026-06-20 Sumsub KYC Closed Loop

测试入口：

- 客户端 KYC：`http://127.0.0.1:3003/kyc`
- 客户端 KYC 状态：`http://127.0.0.1:3003/kyc-status`
- 后台 Sumsub 状态面板：`http://127.0.0.1:3003/casino-ops`

客户端更新：

- KYC 页保持原 HyperTransfer 视觉，不暴露 provider selector。
- Submit 后由后端创建或复用 Sumsub applicant，再返回短期 WebSDK token；前端在原 KYC 页面内嵌 Sumsub WebSDK，完成证件采集、liveness、face match。
- 创建 applicant 后不提前切到 pending，避免 WebSDK 容器被卸载；只有用户提交完成、Sumsub 回调或最终结果返回后才切状态。
- KYC Status 页不再本地假装通过，改为调用 `GET /api/sumsub/kyc/status` 读取 Sumsub applicant review status 并同步本地 KYC 状态。
- GREEN review result -> approved；RED review result -> rejected；pending / init / queued -> pending。

后端更新：

- `hypertransfer-main/backend/server.py` 新增 Sumsub applicant 闭环：
  - `POST /api/sumsub/kyc/start`：认证用户创建或复用 applicant，写入支持的 fixedInfo，记录 `externalUserId` / `applicantId`，生成 WebSDK token。
  - `GET /api/sumsub/kyc/status`：按本地 applicant 映射拉取 Sumsub review status 并归一为 HyperTransfer KYC 状态。
  - `POST /api/webhooks/sumsub`：接收 Sumsub webhook，配置 `SUMSUB_WEBHOOK_SECRET_KEY` 时校验 digest，记录事件并回写本地 KYC 状态。
- 新增 SQLite 表 `sumsub_kyc_applications` 与 `sumsub_webhook_events`，用于 applicant 映射、状态缓存和 webhook 审计。
- fixedInfo 仅预填 Sumsub 支持的姓名/邮箱/电话、DOB、nationality/country、address 等字段；证件影像、liveness、face match 仍由 Sumsub WebSDK 采集。

配置更新：

- `.env.example`、`docker-compose.yml`、`DEPLOY.md` 增加 `SUMSUB_WEBHOOK_SECRET_KEY`。
- 线上完整测试必须在服务器配置 `SUMSUB_APP_TOKEN`、`SUMSUB_SECRET_KEY`、`SUMSUB_KYC_LEVEL_NAME`、`SUMSUB_WEBHOOK_SECRET_KEY`，并在 Sumsub Cockpit 配置 webhook URL：`https://<domain>/api/webhooks/sumsub`。

未接入但可后续接入的 Sumsub 能力：

- AML screening、Questionnaires、Device Intelligence、Transaction Monitoring、Travel Rule、Crypto Monitoring、Case Management、KYB、Workflow Builder。
- 当前这些能力只保留在评估文档和 `/casino-ops` provider capability 展示中，不进入客户 KYC 主链路。

关键代码文件：

- 修改 `hypertransfer-main/backend/server.py`。
- 修改 `hypertransfer-main/client/src/lib/sumsub.ts`。
- 修改 `hypertransfer-main/client/src/pages/KYC.tsx`。
- 修改 `hypertransfer-main/client/src/pages/KYCStatus.tsx`。
- 修改 `hypertransfer-main/.env.example`、`hypertransfer-main/docker-compose.yml`、`hypertransfer-main/DEPLOY.md`。
- 修改 `ProjectInfo/Sumsub-Trial-Integration-Assessment.md`。

验证结果：

- `cd hypertransfer-main && corepack pnpm run check`：通过。
- `cd hypertransfer-main && corepack pnpm run build`：通过；Vite 仍有 chunk size warning。
- `cd hypertransfer-main/backend && ./.venv/bin/python -m py_compile server.py`：通过。
- `git diff --check`：通过。
- 后端本地 TestClient：
  - `GET /api/sumsub/kyc/status`：未配置凭证时返回 `status=not_started`。
  - `POST /api/sumsub/kyc/start`：未配置凭证时返回 503，符合预期，不假装提交成功。
  - `POST /api/webhooks/sumsub`：无 webhook secret 的本地测试 payload 可被接收并归一为 `approved`。

已知限制：

- 本地未配置真实 Sumsub app token / secret，不能声称真实 trial API 已连通；完整线上测试需要先注入服务器环境变量并重启后端。
- `Document Number` 当前只作为 HyperTransfer 页面前置字段，不写入 Sumsub fixedInfo；正式生产是否本地持久化证件号需要单独做 PII 合规评估。

### 2026-06-21 Sumsub Sandbox Credentials And Webhook Setup

配置完成：

- 已登录 Sumsub Cockpit sandbox account，创建 sandbox app token：`HyperTransfer Sandbox KYC`。
- 已将 `管理固定信息` 权限补进 app token，用于后端 `PATCH /resources/applicants/{applicantId}/fixedInfo`。
- 已确认真实可用 KYC level：`idv-and-phone-verification`，包含 ID document、SMS verification、liveness check。
- 已创建并启用 Sumsub webhook：`HyperTransfer KYC Webhook`。
- Webhook URL：`https://h5.hypercypto.com/api/webhooks/sumsub`。
- Webhook events：`applicantCreated`、`applicantPending`、`applicantReviewed`、`applicantOnHold`、`applicantAwaitingUser`、`applicantAwaitingService`。
- Webhook applicant type：all applicant types。
- Webhook signature algorithm：`HMAC_SHA256_HEX`。

本地 / GitHub 配置：

- 已创建本地忽略文件 `hypertransfer-main/.env`，权限 `600`；包含 Sumsub sandbox app token、secret、webhook secret、KYC level。该文件被 `.gitignore` 排除，绝不提交。
- 已设置 GitHub repository secret `HK_ENV_FILE`，供 `.github/workflows/hypertransfer-deploy-hk.yml` 写入香港服务器 `.env`。
- `.env.example` 默认 KYC level 改为 `idv-and-phone-verification`。
- `hypertransfer-main/backend/server.py` 启动时会自动读取 `hypertransfer-main/.env`，方便本地直接运行 FastAPI 时加载 Sumsub 配置。

验证结果：

- `cd hypertransfer-main && corepack pnpm run check`：通过。
- `cd hypertransfer-main && corepack pnpm run build`：通过；Vite 仍有 chunk size warning。
- `cd hypertransfer-main/backend && ./.venv/bin/python -m py_compile server.py`：通过。
- `git diff --check`：通过。
- 已确认可提交文件中没有真实 Sumsub app token、secret、webhook secret 或 Sumsub 登录密码。
- 本地后端读取真实 sandbox env 后：`GET /api/sumsub/health` 返回 `configured=true`、`environment=sandbox`、`kycLevelName=idv-and-phone-verification`。
- 本地后端 `POST /api/sumsub/connection-test`：通过，成功拿到 Sumsub SDK token。
- 本地后端 `POST /api/sumsub/kyc/start`：通过，成功创建 sandbox applicant，并返回 WebSDK token。
- 本地后端 `GET /api/sumsub/kyc/status`：通过，sandbox applicant 当前状态 `pending / init`。
- Sumsub Cockpit `Test webhook` 已能请求线上域名，但线上当前返回 `404 {"detail":"Not Found"}`，说明线上后端仍是旧版或反代未部署新 webhook endpoint。

线上待补：

- GitHub repo secret 里已有 `HK_ENV_FILE`，但当前未发现 `HK_HOST`、`HK_SSH_PORT`、`HK_SSH_USER`、`HK_SSH_KEY`、`HK_DEPLOY_PATH` 等服务器部署 secrets；自动部署到香港服务器仍缺这些信息。
- 只有把包含 `/api/webhooks/sumsub` 的新后端代码部署到 `h5.hypercypto.com` 后，Sumsub webhook 测试才会从 404 变成 200。

### 2026-06-19 Sumsub Trial Integration Assessment

资料更新：

- 新增 `ProjectInfo/Sumsub-Trial-Integration-Assessment.md`，整理 Sumsub trial 能力范围、HyperTransfer 适配方式、接入难度、POC 计划与 sales 会议问题。
- 评估模块包括 KYC WebSDK 2.0、AML screening、questionnaires、Device Intelligence、Transaction Monitoring、Travel Rule、Crypto Monitoring、Workflow Builder、Case Management、KYB、webhooks 与 app tokens。
- 明确产品边界：Sumsub 可作为 KYC / KYT / Travel Rule / Transaction Monitoring 候选 provider；Hex Trust / Hex Safe 仍负责托管、vault、地址签发、deposit status 和链上 webhook；HyperTransfer 继续做合规编排与审计状态归一。
- 明确安全口径：Sumsub 账号密码、app token、secret、webhook secret、申请人 PII 和客户证件资料不得写入仓库；未来接入时只通过服务器环境变量或 GitHub secrets 注入。

验证结果：

- 未改产品代码；无需运行 `corepack pnpm run check` / `corepack pnpm run build`。
- 已核对 Sumsub 官方文档：API overview、WebSDK、app tokens、webhooks、Transaction Monitoring、Travel Rule、Crypto Monitoring、Workflow Builder、Device Intelligence。

已知限制：

- 本次只完成官方文档级评估；本地浏览器自动化到达 Sumsub Cockpit 登录页和 cookie prompt，但未完成 trial 控制台内的完整 walkthrough。
- 下一步需要 trial owner 在 Cockpit 确认已启用模块，并在 Dev Space 创建 sandbox app token/secret 后再做真实 WebSDK / webhook POC。

### 2026-06-19 Sumsub Product Integration

产品更新：

- 客户 KYC 页保持原 HyperTransfer 视觉与表单结构，不做独立 provider 页面或 provider selector。
- KYC 页基础字段保留在 HyperTransfer：nationality、date of birth、ID document type、document number。
- 原 demo upload / selfie upload 按钮移除；证件采集、活体检测和 face match 改由 Sumsub WebSDK 在提交后处理。
- KYC 页 Submit 动作改为真实 Sumsub 接入路径：
  - 未配置 `SUMSUB_APP_TOKEN` / `SUMSUB_SECRET_KEY` 时，保留当前页面并显示英文 provider setup pending / not connected 提示，不再假装 demo 成功；用户端不直接暴露密钥变量名。
  - 已配置时，从 HyperTransfer 后端获取短期 WebSDK access token，并在原 KYC 页面内加载 Sumsub 官方 WebSDK。
  - WebSDK 事件会同步本地 KYC 状态：submitted -> pending，GREEN final result -> approved。
- `/casino-ops` 新增 Sumsub provider 面板，展示 configured / missing env、environment、KYC level、能力标签与 connection test。

后端更新：

- `hypertransfer-main/backend/server.py` 新增 Sumsub adapter：
  - `GET /api/sumsub/config`
  - `GET /api/sumsub/health`
  - `POST /api/sumsub/access-token`
  - `POST /api/sumsub/connection-test`
  - `POST /api/webhooks/sumsub`
- 后端按 Sumsub 官方要求生成 `X-App-Token`、`X-App-Access-Ts`、`X-App-Access-Sig`，签名材料为 timestamp + HTTP method + path/query + exact body，HMAC-SHA256 lowercase hex。
- `GET /api/health` 额外返回 `sumsubConfigured`。

配置更新：

- `.env.example`、`docker-compose.yml`、`DEPLOY.md` 新增：
  - `SUMSUB_BASE_URL`
  - `SUMSUB_ENVIRONMENT`
  - `SUMSUB_APP_TOKEN`
  - `SUMSUB_SECRET_KEY`
  - `SUMSUB_KYC_LEVEL_NAME`
  - `SUMSUB_TR_LEVEL_NAME`
  - `SUMSUB_WEBSDK_TTL`
- Sumsub app token、secret、webhook secret、申请人 PII、客户证件资料不得写入仓库；只能放服务器 `.env`、GitHub Secrets 或安全密钥管理系统。

验证结果：

- `cd hypertransfer-main && corepack pnpm run check`：通过。
- `cd hypertransfer-main && corepack pnpm run build`：通过；Vite 仍有 chunk size warning。
- `cd hypertransfer-main/backend && ./.venv/bin/python -m py_compile server.py`：通过。
- `git diff --check`：通过。
- 本地临时后端 `http://127.0.0.1:8000/api/sumsub/health`：返回 `configured=false` / `status=missing_credentials`，符合未配置凭证状态。
- 本地 KYC 页面 `http://127.0.0.1:3003/kyc`：已验证原 KYC 样式保留、无中文残留、无 demo upload/selfie upload、Submit 后显示 provider setup pending / identity verification not connected 英文提示。
- 本地后台 `http://127.0.0.1:3003/casino-ops`：已验证 Sumsub provider 面板、能力标签、missing env 状态。
- 真实 Sumsub API 连通测试需要先配置 `SUMSUB_APP_TOKEN` / `SUMSUB_SECRET_KEY`。

已知限制：

- 当前没有 Sumsub sandbox app token/secret，因此只能验证代码、未配置状态和本地 API 行为；不能声称真实 Sumsub trial 已连通。
- `POST /api/webhooks/sumsub` 目前先完成接收/ack 与状态归一入口；生产前需按 Sumsub webhook 签名/安全要求补强验签和事件持久化。

### 2026-06-09 HK Auto Deploy Foundations

部署/CI 更新：

- `HyperTransfer Check` CI 从仅 typecheck 扩展为 typecheck + production build。
- 新增 `.github/workflows/hypertransfer-deploy-hk.yml`：
  - `main` push 自动部署到 GitHub Environment `staging`。
  - 支持 `workflow_dispatch` 手动选择 `staging` 或 `production`。
  - 通过 SSH + rsync 同步代码到香港服务器。
  - 保留服务器 `.env`、SQLite DB、backups、logs、node_modules、dist 等运行时文件。
  - 如配置 `HK_ENV_FILE` secret，会自动写入服务器 `hypertransfer-main/.env`。
  - 发布前备份 SQLite，发布后检查 `/api/health`。
  - production 模式下阻止 `HT_ALLOWED_ORIGINS=*` 或 QA 短信网关上线。
- 后端 `backend/server.py` 新增生产环境变量：
  - `HT_ALLOWED_ORIGINS`
  - `SMS_API_URL`
  - `SMS_SIGN_CN`
  - `SMS_SIGN_INTL`
- `docker-compose.yml` 已透传上述环境变量，`.env.example` 已补默认配置。
- `DEPLOY.md` 新增 GitHub Environments、Secrets、服务器首次准备、自动发布流程说明。

验证结果：

- `cd hypertransfer-main && corepack pnpm run check`：通过。
- `cd hypertransfer-main && corepack pnpm run build`：通过；Vite 仍有 chunk size warning。
- `python3 -m py_compile hypertransfer-main/backend/server.py`：通过。
- `cd hypertransfer-main && docker compose config`：通过。
- GitHub workflow YAML parse 与 `git diff --check`：通过。
- `cd hypertransfer-main && docker compose build`：未运行成功，因为本机 Docker daemon 未启动；服务器侧首次部署时仍需实测镜像构建。
- 服务器信息未配置前，无法实测 SSH 部署。

服务器侧待补信息：

- 香港服务器公网 IP / 域名、SSH 端口、部署用户名。
- 部署用户 SSH key、公钥安装状态、known_hosts。
- 部署目录，例如 `/opt/hypertransfer/app`。
- staging / production 域名与 HTTPS 反代方案。
- 生产短信网关 URL 与签名。
- `HT_ALLOWED_ORIGINS` 正式值。
- 是否同一台服务器承载 staging 和 production，还是分两台。

### 2026-06-09 ProjectInfo Process Map Documents

资料更新：

- 新增 `ProjectInfo/HyperTransfer_One Page Process Map_v1.pptx`，作为 HyperTransfer one-page process map 的可编辑 PPT 源文件。
- 新增 `ProjectInfo/HyperTransfer_One Page Process Map_v1.pdf`，作为 HyperTransfer one-page process map 的 PDF 交付/转发版本。
- 两个文件来自用户提供的 Downloads 版本，复制后 SHA-256 与源文件一致。

验证结果：

- 未改产品代码；无需运行 `corepack pnpm run check` / `corepack pnpm run build`。
- 已更新本文件的 `代码地图` 与 `商业化上下文`，方便后续查找客户展示材料。

### 2026-06-08 Local Demo Version

测试入口：

- 客户端 landing：`http://127.0.0.1:3003/`
- 客户端 dashboard：`http://127.0.0.1:3003/dashboard`
- 客户端入金流程起点：`http://127.0.0.1:3003/new-deposit`
- 澳门赌场工作人员后台：`http://127.0.0.1:3003/casino-ops`
- 后台兼容别名：`http://127.0.0.1:3003/treasury-controls`

客户端新增 / 调整：

- 登录页新增本地 demo session：`Use Demo Account`；也支持 `demo.user@hypercrypto.com` / `Demo@12345`。
- 登录错误、注册 OTP、2FA、忘记密码等客户可见提示统一为英文。
- KYC 日期输入从浏览器原生 `type="date"` 改为自控 `YYYY-MM-DD`，避免系统语言显示中文日期占位。
- Landing referral card 点击弹出 demo QR code。
- 新增 Phase 1 网络限制：`USDT on ERC-20/TRC-20`、`USDC on ERC-20`；BTC / ETH 资产不处理。
- New Deposit 增加预期入金金额，后续用于 Travel Rule threshold 和 treasury mock。
- Wallet Screening 通过后设置 Travel Rule 状态：需要 TR 时进入 `travel_rule_required`。
- Travel Rule 页面新增完整数据模型：originator、beneficiary、VASP、wallet、asset、amount、jurisdiction、provider reference、status。
- Travel Rule provider adapter 先接 mock，可后续替换 Hex Trust/Sumsub、Notabene、Sygna、TRP。
- 地址签发 gate 改为必须满足 `KYC approved + source wallet KYT passed + Travel Rule gate passed`。
- Main Deposit 页面加入链上确认数：EVM 5 confirmations、Tron 4 confirmations。
- Main Deposit 完成后生成 Hex Safe deposit status、vault balance、custody logs mock。
- Deposit Success 移除 `Review Treasury Controls` 按钮，只保留客户下一步：再次入金或返回 dashboard。
- Dashboard 移除 `Treasury` 快捷入口，只保留客户功能：History、Support、Profile。

工作人员后台新增 / 调整：

- 新增 `CasinoOpsPortal.tsx`，路由 `/casino-ops`。
- 后台标题为 `Operator VA Operations Portal`，定位为 casino treasury / compliance / finance / audit staff portal。
- 后台展示 active deposit case 摘要：asset、network、KYT 状态、金额、HKD 估算。
- 后台 WTA settlement：confirmation gate、latest txHash、Hex Trust chain-defined threshold。
- 后台 HT Markets OTC：quote、0.50% fee、USD 150 minimum、net USD、Prepare Quote、Approve & Settle。
- 后台 OTC workflow：quote + fee、approval、execution、settlement、receipt、audit trail。
- 后台 depeg response：0.95 trigger threshold、demo price、HT Markets 24/7 OTC channel、banking-hours warning。
- 后台 Hex Safe webhook/API：deposit status、confirmation count、vault balance、transaction logs。
- 后台 reconciliation：API、Webhook、SFTP、Monthly statement。
- 后台 Macau access exclusion：IP/location policy、non-Macau operator provisioning、Hex Safe client-side Okta limitation、operator audit log。
- 后台 custody evidence：100% cold storage、RBAC/quorum、maker-checker、insurance/SLA；明确为 Hex Trust provided controls，不是 HyperTransfer-owned custody service。
- 旧 `/treasury-controls` 暂时保留为后台别名，但客户端不得链接。

关键代码文件：

- 新增 `hypertransfer-main/client/src/pages/CasinoOpsPortal.tsx`。
- 新增 `hypertransfer-main/client/src/lib/compliance.ts`。
- 新增 `hypertransfer-main/client/src/lib/travel-rule.ts`。
- 新增 `hypertransfer-main/client/src/lib/hex-safe.ts`。
- 新增 `hypertransfer-main/client/src/lib/treasury-ops.ts`。
- 新增 `hypertransfer-main/client/src/lib/demo-auth.ts`。
- 修改 `hypertransfer-main/client/src/App.tsx`。
- 修改 `hypertransfer-main/client/src/contexts/AuthContext.tsx`。
- 修改 `hypertransfer-main/client/src/contexts/DemoContext.tsx`。
- 修改 `hypertransfer-main/client/src/pages/Login.tsx`。
- 修改 `hypertransfer-main/client/src/pages/Register.tsx`。
- 修改 `hypertransfer-main/client/src/pages/Setup2FA.tsx`。
- 修改 `hypertransfer-main/client/src/pages/Verify2FA.tsx`。
- 修改 `hypertransfer-main/client/src/pages/ForgotPassword.tsx`。
- 修改 `hypertransfer-main/client/src/pages/KYC.tsx`。
- 修改 `hypertransfer-main/client/src/pages/Landing.tsx`。
- 修改 `hypertransfer-main/client/src/pages/NewDeposit.tsx`。
- 修改 `hypertransfer-main/client/src/pages/WalletScreening.tsx`。
- 修改 `hypertransfer-main/client/src/pages/TravelRule.tsx`。
- 修改 `hypertransfer-main/client/src/pages/DepositAddress.tsx`。
- 修改 `hypertransfer-main/client/src/pages/MainDeposit.tsx`。
- 修改 `hypertransfer-main/client/src/pages/DepositSuccess.tsx`。

验证结果：

- `cd hypertransfer-main && corepack pnpm run check`：通过。
- `cd hypertransfer-main && corepack pnpm run build`：通过；Vite 仍有 chunk size warning，暂不影响本地测试。
- `http://127.0.0.1:3003/casino-ops`：返回 200。
- 客户 Dashboard / Deposit Success 已确认不再包含后台 treasury link。

已知限制：

- 当前 Hex Safe、Travel Rule provider、HT Markets OTC、reconciliation、Macau access exclusion 均为前端 mock 模型，未接真实 provider API。
- 本地 demo login 是为了测试流程可用，不能当作生产认证设计。
- Staff portal 当前复用同一个 auth context，尚未实现真实 staff/operator RBAC、独立登录域、审计账号体系。
- `/treasury-controls` 仅为兼容旧链接保留；后续可在确认无引用后删除或重定向。

## 工作方式

- 用户说“评估一下”：只输出方案 / 风险 / 成本，不动文件。
- 用户说“动手 / 开干 / 做吧”：直接执行。
- 用户说“提交 / commit”：才 `git add` + `git commit`；不要直接提交到 `main`，从最新 `main` 新建任务分支后提交。
- 用户说“推送 / push”：才 `git push`；remote 已配 `origin -> github.com/eason36/Hyper-Transfer`，默认推当前任务分支并通过 GitHub PR 合并到 `main`。
- 修改业务流或术语：同步检查 `ProjectInfo/design.md`，必要时更新本文档。
- 改文件不少于 3 个或跨多模块改动时，先列简短计划。
- 完成改动后，按风险运行最小必要验证；无法运行时说明原因。

## 代码管理策略

- `main` 是稳定主线，只放可演示、可交付、可回滚的版本。
- 日常开发不要直接推 `main`；从最新 `main` 新建任务分支，完成后通过 GitHub PR 合并。
- 分支命名：
  - `feature/<scope>`：新功能。
  - `fix/<scope>`：bug 修复。
  - `docs/<scope>`：会议纪要、报价、商业方案、项目文档。
  - `ops/<scope>`：部署、CI、GitHub 设置、环境配置。
  - `codex/<scope>`：Codex 代办任务分支。
- 合并 `main` 前必须确认：
  - diff 中没有 `.env*`、DB、Office 临时文件、node_modules、日志、真实手机号、PII 或密钥。
  - HyperTransfer 前端至少通过 `cd hypertransfer-main && corepack pnpm run check`。
  - 涉及业务术语、Travel Rule、Hex Trust、报价或会议纪要时，相关文档已同步。
- GitHub `main` 目标保护策略：
  - 禁止直接 push，必须通过 PR。
  - 禁止 force push 和删除分支。
  - 要求分支与 `main` 保持最新后合并。
  - 必须通过 `HyperTransfer Typecheck` GitHub Actions 检查。
- 当前 GitHub private repo 的已落地设置：
  - 已启用 squash merge。
  - 已禁用 merge commit 和 rebase merge。
  - 已启用合并 PR 后自动删除 head branch。
  - 已启用 PR update branch。
  - `main` branch protection 因当前 GitHub private repo/账号限制暂不能强制开启；不要把仓库改成 public 来绕过，因为本项目含客户材料。升级 GitHub Pro 后再启用上述保护策略。
- 合并方式优先使用 Squash merge，让 `main` 历史保持简洁。

## 维护本文件

出现以下变化时更新 `AGENTS.md`：

- 新增 / 移除依赖或主要脚本。
- 新增 / 重命名顶级目录、主路由或核心模块。
- 商业化上下文变化，包括报价、客户会议、牌照、公司名、产品名、技术栈。
- 新增 / 修改业务实体、状态、字段、provider adapter。
- 业务术语、合规口径、监管边界变化。
- 完成重要 TODO 或新增关键技术债。
- 每次新版本 / 可测试批次完成后，必须更新上方 `Release Notes`，让用户能逐条确认入口、功能、文件、验证与已知限制。

最后更新：2026-07-02（线上版本号 build metadata 修复），新增 `2026-07-02 线上版本号 build metadata 修复` release note：前端 Docker build 新增 `VITE_APP_VERSION` / `VITE_GIT_COMMIT` build args，compose 传入 build args，GitHub Actions 香港部署用 `GITHUB_SHA::7` 导出 `VITE_GIT_COMMIT`，手工 `deploy.sh` 用 `git rev-parse --short HEAD` 导出，修复 Demo hub 版本号显示 `v1.0.0+local` 的问题。验证 `VITE_GIT_COMMIT=versioncheck corepack pnpm run build` ✅（产物包含 `v1.0.0+versioncheck`）、`VITE_GIT_COMMIT=composecheck docker compose config` ✅、`corepack pnpm run check` ✅、`git diff --check` ✅。CLAUDE.md 文末同步。
