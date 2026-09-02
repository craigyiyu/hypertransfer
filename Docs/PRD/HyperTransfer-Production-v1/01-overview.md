# 01 — Product Overview, Scope, Glossary & Version Log

## 1.1 产品定位

HyperTransfer 是 **Heypervelocity**（香港公司）面向 B2B 客户的**虚拟资产合规入金 + 法币结算**编排系统，部署在 `h5.hypercypto.com`。  
**不是钱包工具、不是交易所**：核心能力是 KYC/KYT/Travel Rule 编排、托管地址签发、链上监听、到账后合规清算与 WTA 入账。

| 项 | 值 |
|---|---|
| 公司主体 | Heypervelocity (HK) |
| 产品名 | HyperTransfer |
| 站点 | https://h5.hypercypto.com |
| 客户 | 澳门赌场 VIP（核心试点）、OTC Desk、持牌 VATP、酒店、家族办公室、稳定币发行方 |
| 托管方 | Hex Trust / Hex Safe |
| 监管口径 | 香港 AMLO（FATF Travel Rule，阈值 USD 1,000 ≈ HKD 8,000） |

## 1.2 三端边界（不容混淆）

| 端 | URL 前缀 | 用途 | 详见 |
|---|---|---|---|
| **Client（VIP）** | `/welcome`、`/login`、`/invite`、`/kyc`、`/dashboard`、`/new-deposit`、`/history`、`/refund`、`/settings`、`/support` | 客户身份识别、身份验证、入金、退款 | §3.5 |
| **Staff（运营方员工）** | `/ops`（登录）、`/casino-ops`（主后台）、`/treasury-controls`（别名） | 邀请、审批、风控、对账、托管编排 | §3.1–3.4 |
| **Internal API** | `/api/*`（不可外网） | 后端服务（FastAPI） | §2.4 |

> **客户不得看到** 内部审批、Vault 余额、Hex Safe webhook/凭据、HT Markets OTC、Macau operator access、custody evidence。这些界面与控制点全部驻留于 `/casino-ops`。

## 1.3 第一版范围边界（In/Out of Scope）

### 1.3.1 包含

| 类别 | 内容 | 状态 |
|---|---|---|
| Host 端 | 创建 case → 双通道邀请（email link + QR session）→ 跟进（remind / revoke） | **CONFIRMED** |
| VIP 端 | 邀请认领 → Email OTP 注册 → 2FA（TOTP） → KYC（Sumsub API-only） → Dashboard → 入金（Step 1 verify + Step 2 main）→ 退款（verified-wallet picker）→ History | **CURRENT** |
| Leader 端 | 单一 leader 用户对 case 决策（approve/reject），拒绝必填业务原因 | **CURRENT** |
| HK Operations | Cage confirmation 录入、Finance reconciliation 录入 | **CURRENT** |
| Finance | Reconciliation 报告导出、retention ≥5 年 | **CURRENT** |
| Compliance | KYT 筛查 + 每笔 Transaction Compliance Pack（独立不可变） | **CURRENT** |
| Staff 入口 | 公司邮箱自助注册（host/leader/ops 三角色）+ Okta SSO demo 占位 | **CURRENT** |
| Demo 便利 | `HT_DEMO_BYPASS_2FA` 下自动填码 / 跳过 2FA / 邀请可重复跑 / 一键四角色 | **CURRENT** |
| CI/CD | PR/main 门禁（typecheck + build + vitest）+ 香港服务器自动部署 | **CURRENT** |

### 1.3.2 不包含（Out of Scope，禁止本期开发）

| 类别 | 理由 |
|---|---|
| 真实资金转移 / 链上真实转账 | 托管层由 Hex Trust 控制，本期仅 demo / sandbox |
| 真实 Okta SSO | demo 仅占位；生产需 OIDC + MFA policy（详见 §6.3） |
| 真实 STR / SAR / HKFIO 报送 | 监管报送接口属客户/Hex Trust 责任边界 |
| Prime Broker 自营报价 | 客户回复口径已确认无 API，仅可 demo 占位 |
| 管理员配置 UI（provider / 风险阈值 / RBAC） | 本期走 env + seed |
| 真实生产数据库迁移 | 本期 SQLite 演示；Postgres / 多区容灾在 §6.4 |
| USDC 上 Production Hex Safe 真实合约 | 当前 sandbox 已通，mainnet 待客户业务开通（详见 §6.1 `INT-HEX-002`） |

## 1.4 术语表（Glossary）

> 仅列易混 / 高频 / 监管相关的术语。完整业务术语以 `CLAUDE.md` §4.3 为权威来源。

| 术语 | 含义 | 易混点 |
|---|---|---|
| **KYC** | Know Your Customer 客户身份识别 | ≠ KYT |
| **KYT** | Know Your Transaction 钱包/交易级风险分析 | ≠ KYC；Pre-deposit（发址前）+ Post-deposit（到账后）两段都做 |
| **Travel Rule** | FATF VASP 间转账信息传递规则 | 阈值 = USD 1,000 ≈ HKD 8,000（不是 8000 USD） |
| **WTA** | Treasury Account，运营方金库 | 不是单一地址，是分层 vault 结构 |
| **Hex Trust / Hex Safe** | 托管方 / 托管平台 | 二者是一个供应商的两个层级，不要混写为两个 |
| **Hex Safe API** | 真实托管 API（`POST /vaults/{id}/address`、`POST /transactions/withdrawal`、`GET /deposit/{txHash}`、`POST /deposit/submit_travel_rule_details` 等） | sandbox 已通，mainnet 待合同启用 |
| **Source Wallet** | 客户打款用的钱包 | ≠ Hex Trust 签发的 receiving address |
| **Hop Count** | 链上交易图距离 | 1-hop sanctions = Fail；2-3 hop mixer 中低额 = EDD |
| **Verified Wallet** | 已通过测试入金验证的客户钱包 | 退款时只允许从此名单选择 |
| **Marker Reference** | 赌场后台手录入账的筹码编号 | 入账的"业务完成"信号 |
| **Cage Confirmation** | 赌场金库（cage）确认 ID | 由 HK Operations 录入 |
| **Reconciliation** | Finance 对账（链上到账 vs 业务入账） | retention ≥5 年 |
| **Transaction Compliance Pack** | 每笔转账独立不可变合规包（含 basic/enhanced 字段） | 实际确认指纹变更 → 强制重验 |
| **Settlement Journey** | 资金从链上到账 → Cage → Reconciled | 由 payments 推导，详见 §5.3 |
| **Admission Journey** | 客户从邀请到 Service Enabled | 由 admission case status 推导，详见 §5.2 |
| **Phase 1 网络** | 仅 `USDT on ERC-20/TRC-20` + `USDC on ERC-20` | BTC / ETH 资产不处理 |
| **demo 旁路** | `HT_DEMO_BYPASS_2FA=true` 启用免 2FA、自动填码 | 仅非生产生效 |

**停用术语**（不得出现）：
- "Frax 是私钥托管方"
- "WTA 是单一地址"
- "Pad 端填 vault ID"
- "BTC / ETH 资产在 Phase 1 支持"

## 1.5 监管与合规口径

| 项 | 口径 | 来源 |
|---|---|---|
| Travel Rule 阈值 | USD 1,000 ≈ HKD 8,000 | HK AMLO / FATF；客户 Hex Trust 36 问澄清 PDF |
| 资产范围 | USDT（ERC-20/TRC-20）+ USDC（ERC-20） | Phase 1 客户确认 |
| 链上确认数 | EVM 5 confirmations；Tron 4 confirmations | Hex Trust |
| KYC 有效期 | 6 个日历月（按 `valid_until` 判定） | PR③ / 最终流程 v1 |
| 退款钱包 | 仅 verified-wallet picker；禁止自由输入新地址 | PR C1 / 最终流程 v1 |
| 三道闸门 | ①KYC（Sumsub） ②Wallet KYT（Hex Safe API / 第三方 KYT fallback） ③Sufficient Fund in Vault（人工 Hex Trust 后台） | 2026-06-29 用户确认 |
| 数据保留 | Reconciliation ≥5 年 | Finance retention policy |
| 单点登录 / MFA | Staff = Okta OIDC；VIP = TOTP（兼容 GA / MS Authenticator） | PR① / 客户确认 |
| 字段展示 | 金额 / 数量 / 统计千分位；ID / 验证码 / 钱包地址不格式化 | 客户体验 |

## 1.6 版本记录（Version Log）

| 版本 | 日期 | 主要变化 | 状态 |
|---|---|---|---|
| **v1.1** | 2026-09-01 | v1.0 基础上：① TR 全量触发 ② Wallet KYT 切 Sumsub adapter（mock 默认）③ Deposit Completed 通知 Admin ④ Admin 可录 Cage ⑤ New Deposit Originating Wallet Picker + 6h KYT TTL ⑥ Refund UI 占位（backend 保留）⑦ Phase 1 网络默认 USDT ERC-20。全部 8 项客户确认，已落地代码 + 测试。 | **CONFIRMED** |
| **v1.0** | 2026-08-28 | PRD 首版出包（基线 `main @ 13e1c61`）。包含 Host-led VIP admission + per-transfer Compliance Packs + 单一 leader approval + Sumsub adapter + Hex Safe sandbox | **CONFIRMED** |
| v0.x（演进历史） | 2026-04 → 2026-08 | Operator Demo → HyperTransfer 客户端 → 4 角色 demo → Host-led 改造 | `AGENTS.md` Release Notes |

> 历史口径以 `ProjectInfo/20260623_Hypertransfer_process_v1.md` 为权威基准；本 PRD 仅描述**当前生产架构**下的口径，不追溯 demo 早期探索。

---

*最后更新：2026-08-28*