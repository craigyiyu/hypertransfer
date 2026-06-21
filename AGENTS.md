# AGENTS.md

> 本文件是 Codex / OpenAI agents 在本仓库的项目级工作说明。  
> `CLAUDE.md` 是历史上为 Claude/Cursor 维护的长版项目记忆，可作为补充参考；**Codex 执行本项目时以本文件为入口和优先工作口径**。如发现两份文件冲突，优先更新本文件，并视需要同步 `CLAUDE.md`。

## 项目身份

- 仓库：`VirtualAsset`
- 路径：`/Users/yiweichen/Documents/Code/VirtualAsset`
- 性质：虚拟资产合规入金编排系统，包含 Wynn 员工端 Demo、HyperTransfer 客户端产品、香港商业化规划与客户材料。
- 核心定位：不是钱包工具，不是交易所；重点是合规编排、KYC/KYT、Travel Rule、托管地址签发、入金监听、WTA 入账与异常处理。
- 商业化主体：`Heypervelocity`（香港公司，计划注册）
- 对外产品名：`HyperTransfer`，站点 `h5.hypercypto.com`
- 当前 Git：已连接 GitHub private repo `origin -> https://github.com/eason36/Hyper-Transfer.git`；`main` 是稳定主线，日常走任务分支 + PR + squash merge。只有用户明确要求 commit / push 时才做 git 提交或推送。

## 代码地图

- `app/` + `src/`：Wynn 员工端虚拟资产入金编排 Demo，Next.js App Router + React + TypeScript。
- `src/domain/`：Wynn Demo 领域核心，包含 `types.ts`、`state-machine.ts`、`providers.ts`。改业务规则先看这里。
- `src/data/seed.ts`：Wynn Demo mock 数据来源；不要在组件里重复造 seed。
- `app/globals.css`：Wynn Demo 唯一样式入口，深色 Wynn 金色风；不要引入 Tailwind。
- `.github/workflows/hypertransfer-check.yml`：HyperTransfer PR/main CI，运行 typecheck 与 production build。
- `.github/workflows/hypertransfer-deploy-hk.yml`：HyperTransfer 香港服务器自动发布 workflow；main 自动发 staging，workflow_dispatch 可选 production。
- `hypertransfer-main/`：真正的 HyperTransfer 产品前端，React 19 + Vite + Tailwind 4 + shadcn/ui + Wouter。
- `hypertransfer-main/DEPLOY.md`：Docker Compose 手工部署与 GitHub Actions 香港自动发布说明。
- `hypertransfer-main/docker-compose.yml`：HyperTransfer 前端 nginx + FastAPI backend + SQLite volume 容器编排。
- `hypertransfer-main/client/src/lib/compliance.ts`：HyperTransfer Phase 1 网络、Travel Rule threshold、链上确认数、HT Markets OTC fee calculator。
- `hypertransfer-main/client/src/lib/travel-rule.ts`：Travel Rule 数据模型、状态机、provider adapter mock；后续接 Hex Trust/Sumsub/Notabene/Sygna/TRP 先从这里扩展。
- `hypertransfer-main/client/src/lib/sumsub.ts`：Sumsub WebSDK 2.0 前端加载、KYC applicant start/status、access-token API 客户端、connection test API 客户端；不保存或暴露 app secret。
- `hypertransfer-main/client/src/lib/hex-safe.ts`：Hex Safe deposit status、confirmation count、vault balance、transaction logs 的 mock API/webhook 模型。
- `hypertransfer-main/client/src/lib/treasury-ops.ts`：OTC conversion、depeg liquidation、reconciliation、Macau access exclusion、custody evidence 的后台运营 mock 模型。
- `hypertransfer-main/client/src/pages/CasinoOpsPortal.tsx`：澳门赌场工作人员后台运营站点，路由 `/casino-ops`；承载 WTA settlement、HT Markets OTC、depeg、Hex Safe webhook/API、reconciliation、Macau access exclusion、Hex Trust custody evidence。
- `hypertransfer-main/backend/server.py`：HyperTransfer 认证后端原型，FastAPI + SQLite，含短信 OTP、TOTP、恢复码、会话。
- `hypertransfer-auth-demo/`：早期独立认证 H5 原型。
- `ProjectInfo/design.md`：业务设计权威来源；涉及监管、术语、状态流、Travel Rule、Hex Trust 边界时必须核对。
- `ProjectInfo/Wynn_Macau_VA_Hex_Trust_Clarification_Request_Completed_04_June.pdf`：客户提供的 Hex Trust 36 问澄清回复；涉及 Phase 1 网络、确认数、Webhook/API、Travel Rule 平台边界、KYT、冷存储、监管资质时必须核对。
- `ProjectInfo/HyperTransfer_One Page Process Map_v1.pptx`：HyperTransfer one-page process map 的可编辑 PPT 源文件。
- `ProjectInfo/HyperTransfer_One Page Process Map_v1.pdf`：HyperTransfer one-page process map 的 PDF 交付/转发版本。
- `ProjectInfo/Sumsub-Trial-Integration-Assessment.md`：Sumsub trial 能力、HyperTransfer 接入架构、难度评估与 sales 会议问题；评估 KYC、AML、Device Intelligence、Questionnaire、Transaction Monitoring、Travel Rule、Crypto Monitoring、Case Management 等模块时先看这里。
- `ClientMeetings/`：客户会议材料与报价。最新会议纪要：`ClientMeetings/2026-06-05-Crypto-Compliance-KYC-Rollout-Meeting-Notes.md`。
- `CompanyPlan/`：香港商业化方案、牌照路线与第三方服务成本。

## 常用命令

根目录 Wynn Demo：

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

新增依赖：Wynn Demo 用 `npm install`；HyperTransfer 用 `corepack pnpm add`。不要手写版本号。

## 业务规则

Wynn Demo 核心流程：

1. Patron source wallet screened
2. Travel Rule data captured
3. Hex Trust address issued
4. Funds detected on-chain
5. Compliance engine clears transaction
6. Stable coin lands in WTA

Deposit 状态机要点：

- `requiresTravelRule`：`amount >= 8000` 或资产为 `BTC` / `ETH`。
- Travel Rule status 使用 `not_required`、`travel_rule_required`、`travel_rule_submitted`、`travel_rule_accepted`、`travel_rule_rejected`、`manual_review`。
- `canIssueAddress`：必须同时满足 `KYC approved`、`source wallet KYT passed`、`Travel Rule gate passed`，才能请求 Hex Safe 地址。
- `fail` / `edd` 路径绝不签发地址。
- 到账后 KYT 为 dirty 时进入 `funds_dirty`，开 urgent compliance case，并作废收款地址。
- Pre-deposit wallet screening 不能替代到账后的 transaction KYT。
- HyperTransfer 客户端 Phase 1 默认只开放 `USDT on Ethereum/Tron` 与 `USDC on Ethereum`；其他网络先走例外审批。
- HyperTransfer 客户端是澳门赌场客户/玩家使用的入金产品，不暴露 WTA、OTC、Hex Safe webhook/API、Macau operator access、custody controls evidence 等后台运营控制。
- 赌场工作人员后台运营能力放在 `/casino-ops`，旧 `/treasury-controls` 仅作为后台别名保留；不要从客户 Dashboard 或 Deposit Success 链接过去。
- Travel Rule gate 必须在 Hex Safe 地址签发前由 HyperTransfer / WML 执行；Hex Trust/Sumsub 可以作为 provider 选项，但不要假设当前香港 Hex Trust Limited 合同下平台层会自动 hard-freeze 等待 TR。
- Sumsub trial 当前仅作为候选合规 provider 评估；可覆盖 KYC、AML screening、questionnaire、Device Intelligence、Transaction Monitoring、Travel Rule、Crypto Monitoring、Case Management 等能力，但不得替代 Hex Trust / Hex Safe 的托管、vault、地址签发和链上 webhook 边界。
- Sumsub KYC applicant 是 Sumsub 侧的被验证人档案；HyperTransfer 用户通过后端映射到一个 deterministic `externalUserId` 和一个 Sumsub `applicantId`，前端只拿短期 WebSDK token。
- Hex Trust 链上确认门槛按链定义，不能承诺 Wynn 自定义确认数；当前客户回复口径为 EVM 5 confirmations、Tron 4 confirmations。
- HT Markets OTC 可做 USDT/USDC 与 USD 双向兑换；客户回复口径为 0.50% all-in fee、USD 150 minimum fee。

Provider adapter 约定：

- Wynn Demo 外部能力必须走 `src/domain/providers.ts` 的 adapter 接口。
- HyperTransfer 客户端 mock 外部能力先放在 `hypertransfer-main/client/src/lib/travel-rule.ts`、`hex-safe.ts`、`treasury-ops.ts`，未来接真实 provider 时保持同一 adapter/模型边界。
- 如接 Sumsub，优先在后端新增 provider adapter：前端只拿短期 WebSDK access token；`SUMSUB_APP_TOKEN`、`SUMSUB_SECRET_KEY`、webhook secret 等只放服务器环境变量或 GitHub secrets，绝不写入仓库。
- 组件或路由里不要直接调用真实 provider SDK / API。
- Mock provider 保持纯函数、可预测，方便 demo 和后续测试。

术语口径：

- `KYC` 是客户身份识别；`KYT` 是钱包/交易级风险分析，二者不要混用。
- `WTA` 是 Wynn Treasury Account，分层 vault 结构，不是单一地址。
- `Hex Trust` 是托管方 / custodian；`Hex Safe` 是 Hex Trust 的托管平台 / API，不要把二者混写成两个托管方。
- `Source Wallet Address` 是客户来源钱包，不等于 Hex Trust 签发给 Wynn 的 receiving address。
- 不要写“Frax 是私钥托管方”“WTA 是单一地址”“Pad 端填 vault ID”等错误说法。

## 编码约定

- TypeScript strict；注意 `noUncheckedIndexedAccess`，索引访问要处理 `undefined`。
- Next.js App Router 默认 RSC，需要交互的组件加 `"use client"`。
- Wynn Demo 用 `@/*` 指向仓库根；HyperTransfer 前端用 `@/` 指向 `client/src`。
- Wynn Demo 样式集中在 `app/globals.css`；HyperTransfer 使用 Tailwind 4 + shadcn/ui，两套不要混。
- HyperTransfer 移动端全高容器用 `100svh`，不要用 `100dvh`，避免软键盘导致页面抖动。
- 业务状态、枚举或字段变化时，同步更新 label、badge、mock seed 与相关 UI。
- 注释只解释非显然的原因；demo / mock 桩位置用 `// MOCK:` 前缀。
- 新增或替换 provider：先扩接口，再加 mock，最后接组件。

## 合规与数据

- 不要在代码、注释、文档或 commit message 中写真实客户姓名、证件号、护照号、wallet 实控人信息。
- Demo 账号 `va.host.demo@wynn.example` / `Wynn#2026!` 是本地 mock，占位用途，不视为真实凭据。
- `wynn.example` 是保留域名，不是真实邮箱。
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

- `http://127.0.0.1:3003/`：HyperTransfer landing page，含 referral QR demo、Create Account、Sign In。
- `http://127.0.0.1:3003/login`：客户登录页；本地 demo 可用 `Use Demo Account` 或 `demo.user@hypercrypto.com` / `Demo@12345`。
- `http://127.0.0.1:3003/register`：客户注册页，真实短信 OTP + password。
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
- `http://127.0.0.1:3003/history`：客户交易历史。
- `http://127.0.0.1:3003/support`：客户支持页。
- `http://127.0.0.1:3003/settings`：客户 profile / settings。

澳门赌场工作人员后台入口：

- `http://127.0.0.1:3003/casino-ops`：Wynn VA Operations Portal，面向 casino treasury / compliance / finance / audit staff。
- `http://127.0.0.1:3003/treasury-controls`：后台别名，暂时保留兼容旧链接；不要从客户端导航过去。

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
- 新增 Phase 1 网络限制：`USDT on Ethereum/Tron`、`USDC on Ethereum`。
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
- 后台标题为 `Wynn VA Operations Portal`，定位为 casino treasury / compliance / finance / audit staff portal。
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

最后更新：2026-06-21，完成 Sumsub sandbox app token、本地 `.env`、GitHub `HK_ENV_FILE` secret、KYC level、Cockpit webhook 配置，并补 `2026-06-21 Sumsub Sandbox Credentials And Webhook Setup` release note。
