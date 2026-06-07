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
- 当前 Git：仓库已 init，`main` 尚无 commit；只有用户明确要求 commit / push 时才做 git 提交或推送。

## 代码地图

- `app/` + `src/`：Wynn 员工端虚拟资产入金编排 Demo，Next.js App Router + React + TypeScript。
- `src/domain/`：Wynn Demo 领域核心，包含 `types.ts`、`state-machine.ts`、`providers.ts`。改业务规则先看这里。
- `src/data/seed.ts`：Wynn Demo mock 数据来源；不要在组件里重复造 seed。
- `app/globals.css`：Wynn Demo 唯一样式入口，深色 Wynn 金色风；不要引入 Tailwind。
- `hypertransfer-main/`：真正的 HyperTransfer 产品前端，React 19 + Vite + Tailwind 4 + shadcn/ui + Wouter。
- `hypertransfer-main/backend/server.py`：HyperTransfer 认证后端原型，FastAPI + SQLite，含短信 OTP、TOTP、恢复码、会话。
- `hypertransfer-auth-demo/`：早期独立认证 H5 原型。
- `ProjectInfo/design.md`：业务设计权威来源；涉及监管、术语、状态流、Travel Rule、Hex Trust 边界时必须核对。
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
- `canIssueAddress`：只能在 `travel_rule_pending` 且 `travelRule.status === "submitted"` 时发地址。
- `fail` / `edd` 路径绝不签发地址。
- 到账后 KYT 为 dirty 时进入 `funds_dirty`，开 urgent compliance case，并作废收款地址。
- Pre-deposit wallet screening 不能替代到账后的 transaction KYT。

Provider adapter 约定：

- 所有外部能力必须走 `src/domain/providers.ts` 的 adapter 接口。
- 组件或路由里不要直接调用真实 provider SDK / API。
- Mock provider 保持纯函数、可预测，方便 demo 和后续测试。

术语口径：

- `KYC` 是客户身份识别；`KYT` 是钱包/交易级风险分析，二者不要混用。
- `WTA` 是 Wynn Treasury Account，分层 vault 结构，不是单一地址。
- `Hex Trust / Hex Safe` 是托管方 / custody provider。
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
- 商业方案：`CompanyPlan/HyperTransfer-HK-Business-Plan.md`。
- 牌照路线：Phase 0 纯技术服务商 -> Phase 1 MSO -> Phase 2 VA Dealing -> Phase 3 VA Custody；详见 `CompanyPlan/HK-Licensing-Roadmap.md`。
- 报价单金额格式用 `"USD "#,##0`，避免 Excel locale 将 `$` 替换成 `¥`。
- 报价使用 Item 01-11 编号，不用 Phase 编号，避免与牌照阶段混淆。

## 工作方式

- 用户说“评估一下”：只输出方案 / 风险 / 成本，不动文件。
- 用户说“动手 / 开干 / 做吧”：直接执行。
- 用户说“提交 / commit”：才 `git add` + `git commit`；首次 commit 前确认 commit message 风格。
- 用户说“推送 / push”：才 `git push`；当前未配置 remote 时先确认。
- 修改业务流或术语：同步检查 `ProjectInfo/design.md`，必要时更新本文档。
- 改文件不少于 3 个或跨多模块改动时，先列简短计划。
- 完成改动后，按风险运行最小必要验证；无法运行时说明原因。

## 维护本文件

出现以下变化时更新 `AGENTS.md`：

- 新增 / 移除依赖或主要脚本。
- 新增 / 重命名顶级目录、主路由或核心模块。
- 商业化上下文变化，包括报价、客户会议、牌照、公司名、产品名、技术栈。
- 新增 / 修改业务实体、状态、字段、provider adapter。
- 业务术语、合规口径、监管边界变化。
- 完成重要 TODO 或新增关键技术债。

最后更新：2026-06-07，改为 Codex/OpenAI agents 可直接执行的项目级说明，并登记最新客户会议纪要。
