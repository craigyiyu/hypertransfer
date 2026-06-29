# Virtual Asset Management Pad App 设计文档

## 1. 产品定位

本项目第一版 demo 的目标不是传统管理后台，而是一个给运营方员工在 Pad 上使用的 **Virtual Asset Management** 办理 App。

主要使用者：

- Host / Account Manager：面向客户发起 crypto deposit 办理流程。
- Compliance Officer：处理高风险钱包、EDD、Travel Rule、异常资金等合规事项。
- Treasury / Finance：查看 WTA 入账、Prime Broker 兑换、银行清算或 payout 路由状态。
- Admin：配置角色权限、供应商接口、风险阈值和审计策略。

核心演示目标：

- 员工必须先通过安全登录和二次验证。
- 员工选择或创建客户记录。
- 员工录入客户希望使用的资产、网络、金额和来源钱包。
- 系统在发出收款地址前执行 pre-deposit wallet screening。
- 通过筛查后收集 FATF Travel Rule 所需信息。
- 系统通过地址服务生成一次性收款地址。
- 客户打款后进入 on-chain monitoring、Funds Clear / Dirty 判断、稳定币入账 WTA。
- Prime Broker 兑换不放在当前 deposit demo 主流程中，后续单独设计 conversion / treasury flow。

## 2. 视觉与交互方向

参考 `ProjectInfo` 中的产品截图风格：

- 深色背景。
- 金色强调色。
- 居中卡片式办理流程。
- Pad / kiosk 式大按钮、大输入框。
- 重点状态用绿色、黄色、红色区分：通过、需复核、阻断。
- 页面不以后台表格为主，而是以员工可逐步操作的办理向导为主。

当前 demo 首页应表现为：

```text
Virtual Asset Management
Employee Pad App

Secure Login
  -> Patron Lookup & KYC Status Check
  -> Crypto Deposit Setup
  -> Pre-Deposit Screening
  -> FATF Travel Rule
  -> Request Hex Trust Deposit Address
  -> On-chain Monitoring
  -> Transaction Compliance Clear
  -> Stable Coin Lands in WTA
```

## 3. 员工登录与 Okta 设计

### 3.1 Okta 在本项目中的作用

Okta 用于员工身份认证，不用于客户登录。

它负责确认当前操作人是否是授权的运营方员工，并把员工身份、角色、权限和登录上下文传给 Virtual Asset Management App。

在正式系统中，Pad App 不应保存员工密码。员工登录时应跳转到 Okta，完成企业账号登录和 MFA 后，再回到 App。

### 3.2 推荐认证流程

正式版建议使用：

- OIDC Authorization Code Flow with PKCE。
- Okta 托管登录页或企业统一登录页。
- MFA policy。
- Okta Groups / Claims 做角色映射。
- App 自己保存业务 session，不保存员工密码。
- 所有关键业务动作绑定 Okta user id，写入审计日志。

流程：

```text
Pad App
  -> Redirect to Okta authorize endpoint
  -> Employee enters corporate credential
  -> Okta enforces MFA
  -> Okta returns authorization code
  -> App exchanges code for tokens
  -> App validates ID token / access token
  -> App maps employee group to app role
  -> App creates local session
  -> Employee can start crypto deposit flow
```

### 3.3 MFA / 2FA 最佳实践

参考 OWASP MFA、NIST Digital Identity、OIDC/OAuth 业界实践：

- 优先使用 phishing-resistant MFA，例如 Passkey / WebAuthn / FIDO2。
- 也可支持 TOTP，例如 Okta Verify、Google Authenticator、Microsoft Authenticator。
- 可使用安全 push，但要防止 push fatigue attack。
- SMS OTP 不应作为唯一第二因素。
- MFA 验证应限速，失败多次后锁定或提升验证要求。
- 高风险行为应触发 step-up authentication，例如生成地址、人工放行 EDD、批准 payout。

### 3.4 Demo 中的测试账号

当前 demo 用本地测试账号模拟 Okta + Okta Verify Push：

```text
Username: va.host.demo@operator.example
Password: Operator#2026!
```

演示逻辑：

- 未登录时不能进入后续流程。
- 先模拟 `Sign in with Okta`。
- 再模拟 `Okta Verify Push` 发送到员工注册设备。
- 员工点击 `Simulate Approve in Okta Verify` 后完成 MFA。
- 通过后才能进入客户识别、钱包筛查、Travel Rule 和发址流程。

正式版中这些凭据不应写在前端代码里，应由 Okta 托管登录页、Okta Verify 和后端 session 管理。Pad 端不应显示 OTP；如果采用 TOTP，也应由员工打开 Okta Verify 获取 6 位动态码。

## 4. 员工角色与权限

### Host / Account Manager

可做：

- 登录 Pad App。
- 查找或选择客户。
- 录入客户资产、网络、金额和来源钱包。
- 发起 pre-deposit screening。
- 在筛查通过后提交 Travel Rule 基础信息。
- 获取系统签发的收款地址或链接。

不可做：

- 绕过筛查。
- 修改风险阈值。
- 手动批准 blocked / EDD case。
- 手动触发 payout。

### Compliance Officer

可做：

- 查看 EDD / blocked case。
- 查看完整 wallet screening 结果。
- 要求补充资料。
- 关闭、批准或拒绝人工复核。
- 查看 Travel Rule 完整数据。

### Treasury / Finance

可做：

- 查看 Funds Clear 后的资金路由。
- 查看 Prime Broker 兑换状态。
- 查看 WTA 入账状态。
- 查看银行清算或 payout 准备状态。

### Admin

可做：

- 配置供应商 adapter。
- 配置风险阈值。
- 配置角色权限。
- 查看完整系统审计。

## 5. 核心业务流程

### 5.1 Pre-Deposit Wallet Screening

含义：

在给客户生成运营方收款地址前，先筛查客户提供的来源钱包。

这里的筛查通常属于 KYT，即 Know Your Transaction。KYT 不是判断“资产运行在哪里”，而是分析钱包地址和链上交易风险：这个地址过去和哪些地址交互、是否接近 mixer / scam / darknet / sanctions 地址、资金污染比例是多少、真实到账交易是否和客户声明一致。

Network 才是资产运行在哪条链上，例如：

```text
USDT on TRON      -> TRC20
USDT on ERC-20    -> Ethereum network stablecoin rail
USDC on ERC-20    -> Ethereum network stablecoin rail
```

Phase 1 不处理 BTC 或 ETH 资产。这里的 ERC-20 指 USDT / USDC 的稳定币网络 rail，不代表支持 ETH 资产。

Source Wallet Address 是客户准备用来打款的钱包地址，和 Hex Trust 后续签发给运营方的 receiving address 不同。

检查内容包括：

- 是否命中制裁名单。
- 是否接近 mixer、darknet、诈骗、被盗资金等高风险地址。
- 是否有 tainted exposure。
- 与高风险地址的 hop count。
- 是否需要 EDD。

Hop count 的含义：

Hop count 是链上交易图里的距离概念，用来描述当前客户钱包和某个风险地址之间隔了几层转账关系。

示例：

```text
0 hop: 当前钱包本身就是风险地址
1 hop: 当前钱包直接和风险地址发生过转账
2 hops: 当前钱包 -> 中间钱包 -> 风险地址
3 hops: 当前钱包 -> 中间钱包 A -> 中间钱包 B -> 风险地址
```

为什么重要：

- hop count 越小，说明和风险来源越近，风险通常越高。
- 1-hop mixer / sanctions exposure 通常比 5-hop exposure 更严重。
- 高金额交易时，系统可能要求更深追踪，例如 3-hop 或 5-hop。
- hop count 不能单独决定结果，还要结合金额、tainted exposure、风险类别、时间、交易方向和客户资料。

示例判断：

```text
1-hop sanctions true hit
  -> Fail / Block

2-3 hop mixer exposure with low amount
  -> EDD

5-hop low tainted exposure with known exchange cluster
  -> Pass or monitor
```

为什么要做：

- 防止把运营方收款地址发给高风险来源。
- 把合规控制前置到地址签发之前。
- 让系统可以在客户打款前阻断风险。

结果：

```text
Pass -> 继续 Travel Rule
EDD  -> 开合规 case，人工复核
Fail -> 阻断，不签发地址
```

Demo 表现：

- 员工输入或选择一个 source wallet address。
- 点击 `Run KYT Pre-Deposit Wallet Screening`。
- 后端调用 KYT provider，例如 Chainalysis / TRM / Elliptic / Hex Trust KYT。
- 系统显示 `Pass / EDD / Fail`、risk score、tainted exposure、hop count 和 source wallet。
- `Low risk / EDD / Fail` 不应是正式业务按钮；demo 中只作为示例地址快速填充，帮助演示不同筛查结果。

登录前封面页展示当前 deposit 主流程 6 步：

```text
1. Patron source wallet screened
2. Travel Rule data captured
3. Hex Trust address issued
4. Funds detected on-chain
5. Compliance engine clears transaction
6. Stable coin lands in WTA
```

### 5.0 Patron Lookup & KYC Status Check

含义：

这一步不是完整 KYC 本身，而是员工在 Pad App 中先查找客户，并确认客户是否已有可用 KYC 状态。

名单来源不应是 Hex Trust。推荐来源是运营方自己的客户系统：

- Operator CRM / Patron database。
- Gaming profile / membership profile。
- 外部 KYC provider 返回的 verification status。
- 如果已有 Frax / custody profile，可在本地记录中保存外部关联 ID。

典型逻辑：

```text
Employee searches patron
  -> App queries Operator CRM / gaming profile
  -> Backend returns patron profile and KYC status
  -> If KYC verified, continue deposit flow
  -> If KYC missing or expired, trigger KYC collection / verification
  -> If KYC blocked, stop crypto deposit flow
```

为什么要做：

- 先确认“这个客户是谁”。
- 避免给未完成 KYC 或 blocked 客户发起虚拟资产入金。
- 把运营方内部客户 ID、KYC 状态、后续 deposit request 和 custody address 绑定起来。

新客户处理：

```text
New patron
  -> collect minimum identity information
  -> submit KYC provider verification
  -> create Operator patron / external profile link
  -> only after KYC verified can continue to wallet screening
```

### 5.0.1 KYC 状态判断规则

运营方需要拥有自己的 KYC records、policy 和 decision ownership。KYC 服务可以由第三方 provider 提供，例如 Sumsub、Onfido、Jumio、Trulioo 或现有 casino KYC 系统，但最终能否办理 virtual asset deposit 应由运营方的业务规则和合规决策确认。

推荐分层：

```text
Operator App / Backend
  -> Operator KYC orchestration layer
  -> Third-party KYC provider / existing casino KYC system
  -> Operator KYC policy engine
  -> Compliance review if needed
  -> Final KYC status
```

KYC 判断输入：

- identity check。
- document check。
- liveness / face match。
- sanctions screening。
- PEP screening。
- adverse media。
- jurisdiction。
- internal casino risk flags。
- source of funds / source of wealth。
- expected transaction amount。
- wallet screening result。

#### verified

含义：

客户 KYC 已通过，可以继续办理 crypto deposit。

典型判断：

- 证件真实有效。
- 人脸核验和活体检测通过。
- 姓名、生日、证件信息和客户资料一致。
- 地址或居住地满足要求。
- 制裁名单没有 true hit。
- 司法辖区允许服务。
- 内部黑名单没有命中。
- 风险评分低于 verified threshold。

系统动作：

```text
status = verified
-> allow deposit flow
-> continue to source wallet screening
```

#### blocked

含义：

客户命中不可接受风险，不能继续办理 crypto deposit。

典型判断：

- 制裁名单 true hit。
- 恐怖融资、通缉、监管禁止名单命中。
- 证件伪造或严重不一致。
- 活体检测失败且无法解释。
- 禁止服务司法辖区。
- 内部黑名单命中。
- 已有严重 AML case。
- 资金来源无法解释且风险过高。

系统动作：

```text
status = blocked
-> stop flow
-> no wallet screening
-> no address issuance
-> create / show compliance case
```

#### enhanced_due_diligence / EDD required

含义：

客户不是直接拒绝，但风险高于普通客户，需要增强尽调、补充资料或人工复核。

典型判断：

- PEP 命中或 PEP close associate。
- 高风险国家/地区。
- 高金额交易。
- 职业、资金来源或财富来源需要说明。
- 地址验证不完整。
- adverse media 有风险但不是直接阻断。
- 客户资料不完整。
- 客户行为和已知 gaming profile 不一致。
- 钱包筛查中等风险，例如 mixer exposure 但未命中制裁。
- 多个风险因子叠加。

系统动作：

```text
status = enhanced_due_diligence
-> pause normal flow
-> request additional documents / source of funds
-> compliance review
-> approve or reject
```

#### 决策顺序

系统应先执行 hard block rules，再判断是否需要 EDD，最后才给 verified。

```text
1. Identity verification
2. Sanctions / watchlist screening
3. Jurisdiction eligibility
4. PEP / adverse media screening
5. Internal blacklist / casino risk flags
6. Source of funds / source of wealth requirement
7. Risk scoring
8. Final decision
```

示例规则：

```text
if sanctions_true_hit
or prohibited_jurisdiction
or forged_document
or internal_blacklist_hit
or unacceptable_aml_risk:
  status = blocked

else if pep_possible_hit
or high_risk_jurisdiction
or high_value_customer
or source_of_funds_required
or risk_score between edd_threshold and block_threshold:
  status = enhanced_due_diligence

else if identity_passed
and liveness_passed
and sanctions_no_hit
and jurisdiction_allowed
and internal_blacklist_no_hit
and risk_score < verified_threshold:
  status = verified
```

最终状态应保留原因码：

```text
status = enhanced_due_diligence
reasons = [
  "PEP proximity",
  "Expected transaction above HKD 120,000",
  "Source of funds documentation required"
]
```

最终判断不应完全交给 provider。推荐边界是：

```text
Provider result + Operator policy + Compliance decision = final KYC status
```

### 5.2 FATF Travel Rule

含义：

Travel Rule 是 FATF 针对虚拟资产转账的信息传递要求。达到监管阈值或适用场景时，VASP 需要收集并传递/保留交易发起方和受益方信息。

本项目中需要收集：

- Originator name。
- Originator wallet / account。
- Originator address 或 national ID。
- Transaction amount。
- Transaction date。
- Beneficiary name。
- Beneficiary VASP / custody route。

Pad 端字段原则：

- 员工需要填写或确认客户侧 originator 信息。
- Beneficiary name 可以展示为固定业务名称，例如 `Macau operator Treasury Account`。
- Beneficiary VASP / custody route 不建议让员工填写，也不建议在 Pad 端暴露真实 vault ID、account ID 或内部路由 ID。
- 正式系统应由后端配置固定 beneficiary / custodian 信息，例如 `Hex Trust Custody Provider`、`wtaVaultId`、`travelRuleProviderRef`。

推荐：

```text
Pad shows:
  Beneficiary VASP / custody route is system-configured

Backend submits:
  beneficiaryVaspId
  custodianProvider = HEX_TRUST
  wtaVaultId
  travelRuleProviderRef
```

为什么要做：

- 满足 AML/CFT 监管要求。
- 让入金交易可以追溯到明确主体。
- 后续如出现 STR / SAR / HKFIO 报送需要有数据基础。

### 5.3 Request Hex Trust Deposit Address

含义：

筛查通过且 Travel Rule 信息完整后，系统才向 Hex Trust / Custody Provider 请求生成或分配本次交易的收款地址。

设计原则：

- 地址应通过 Hex Trust Custody API / Custodian API 生成或分配。
- Frax 如果存在，应作为业务记录、客户关联或编排层，不应被描述为实际托管地址签发方。
- 地址应尽量为 single-use / one-time address。
- 地址签发动作必须写入审计日志。
- Host 是否能看到地址、是否只发送链接，需要由业务和合规决定。

为什么要做：

- 避免员工手工复制地址导致错误。
- 让每个地址绑定客户、Host、筛查结果和 Travel Rule 数据。
- 方便后续链上到账归因和异常处理。

### 5.4 On-Chain Monitoring / WTA Routing

含义：

客户打款后，系统监听链上交易，并持续判断资金是否合规，然后把资金路由到合适的清算路径。

核心步骤：

```text
Funds arrive at generated wallet
  -> On-chain monitoring detects transaction
  -> Compliance engine checks funds
  -> Funds Clear or Funds Dirty
  -> If clear and asset is supported stable coin, settle to WTA
  -> If dirty, block / return / create compliance case
```

为什么要做：

- Pre-deposit screening 只能检查客户声明的钱包，不能完全替代到账后的真实交易监控。
- 客户可能从不同钱包、交易所或混合来源打款。
- 到账后仍需判断资金是否 clear。
- 入金后还要判断真实到账交易是否 clear，以及是否可以进入 Treasury Account。

按资产类型的路由逻辑：

```text
Stable coin already matches WTA base asset
  -> Funds Clear
  -> Move / sweep to WTA directly

Funds Dirty
  -> Block / hold / return decision
  -> Compliance case
  -> No automatic WTA settlement

Asset requires conversion
  -> Excluded from this deposit demo
  -> Hand off to separate Prime Broker / Treasury Conversion flow
```

业务解释：

- WTA 是最终资金池，不一定是客户直接打款的地址。
- 客户打款地址是交易级或客户级的入金地址，用来识别“这笔钱是谁打来的”。
- WTA 是运营方的 treasury 账户，用来集中持有、清算、转银行或支持后续 payout。
- 当前 deposit demo 默认演示可直接入账的稳定币。Prime Broker 兑换逻辑从本流程拆出，后续单独设计。

## 6. Project C 流程图中的系统组件

### Frax API

Frax API 如果参与本项目，应定位为业务系统和客户/交易记录之间的接口层，或作为调用托管方的编排层。它不应被默认描述为私钥托管方或地址实际签发方。

可能职责：

- 创建或同步客户记录。
- 关联外部系统 ID。
- 向 Hex Trust / Custody Provider 请求生成收款地址。
- 同步 KYC / KYT 状态。
- 向下游钱包托管或地址服务发请求。

在 demo 中，地址生成由 mock custody provider 模拟；正式系统中应由 Hex Trust / Custody Provider 执行地址生成或分配。

### KYC

KYC 是 Know Your Customer，即客户身份识别。

本项目中用于确认：

- 客户真实姓名。
- 证件或护照。
- 地址。
- 所属司法辖区。
- 是否已有 gaming profile。
- 是否需要增强尽调。

KYC 解决的是“这个客户是谁”的问题。

### 地址生成

地址生成是系统为客户本次入金创建一个接收地址。

推荐设计：

- 每次入金使用单次地址。
- 地址与客户、deposit request、Travel Rule、screening result 绑定。
- 地址过期后不能复用。
- 地址签发前必须经过合规 gate。

### Funds Clear / Dirty

Funds Clear：

资金通过链上合规分析，可以继续兑换、清算或进入 WTA。

Funds Dirty：

资金来源高风险、命中制裁、污染比例超阈值或触发 AML typology，需要阻断、退回或人工复核。

### Prime Broker

Prime Broker 是负责报价和兑换的交易/流动性服务商。

例子：

- 非目标稳定币或误入资产需要在 treasury exception flow 中处理。
- Prime Broker 提供报价并执行兑换。
- 稳定币之间也可能通过 broker 做 swap。

### WTA

WTA 是 Treasury Account，即运营方金库账户/资金清算账户。

它是虚拟资产资金最终集中管理的位置。

用途：

- 接收转换后的稳定币。
- 持有资金。
- 后续转银行。
- 后续用于客户 payout。

WTA 通常由 Custodian Wallet Provider 管理，例如 BitGo、Fireblocks、Stripe 类托管钱包服务。

更准确地说，WTA 不是一个普通“钱包地址”，而是运营方在托管方体系中的 treasury account / vault / wallet structure。

WTA 可以有一个主账户，也可以有多个账户。推荐不要只设计成一个单一地址，而是设计成分层账户结构：

```text
Operator Custody Entity
  -> WTA - USDC Treasury Vault
  -> WTA - USDT Treasury Vault
  -> WTA - Unsupported-asset exception vault
  -> Deposit Collection Wallets / Addresses
  -> Payout Wallets / Whitelisted Destination Controls
```

建议账户模型：

- **客户入金地址**：面向单笔 deposit request 或单个 patron 生成，用于收款和归因。
- **Collection wallet / deposit wallet**：托管方内部用于接收客户入金的地址集合。
- **WTA treasury vault**：运营方最终清算和持有资金的 treasury 账户。
- **Payout wallet / policy-controlled wallet**：用于出金，必须有白名单、审批和出金前筛查。

WTA 和入金地址的区别：

| 项目 | 入金地址 | WTA |
| --- | --- | --- |
| 作用 | 接收客户本次转账 | 运营方集中持有和清算资金 |
| 生命周期 | 建议单次或短期有效 | 长期存在 |
| 是否给客户看 | 会给客户或通过链接展示 | 通常不给客户直接看 |
| 合规用途 | 交易归因、监控、筛查绑定 | treasury、清算、payout、对账 |
| 风险 | 地址被复用会增加归因和污染风险 | 直接暴露 WTA 会增加安全和运营风险 |

地址是否一直变化：

- 推荐 **每笔入金生成一个新地址** 或至少每个客户/交易场景生成专用地址。
- 不建议让所有客户都打到同一个 WTA 地址。
- 原因是单次地址更容易做客户归因、链上监控、Travel Rule 绑定、异常冻结和审计。
- 实际是否每次都变，取决于托管方 API、链、资产、费用和业务流程；但 demo 和目标设计应按 single-use / one-time address 展示。

### Payouts 路由

Payouts 是客户赢钱或提现时的出金路径。

可能路径：

```text
WTA stable coin -> customer wallet
WTA stable coin -> approved stablecoin customer wallet
WTA -> bank/off-ramp path
```

出金前还需要做 pre-withdrawal wallet screening，确认客户收款钱包不是高风险地址。

## 7. Hex Trust / Hex Safe 接入设计

### 7.1 Hex Trust 能提供什么

根据 Hex Trust 公开资料，Hex Trust 的托管平台 / Hex Safe 主要提供：

- Institutional custody。
- Segregated on-chain wallets。
- HSM / FIPS 140-3 Level 3 key management。
- MPC / 多方审批或多角色授权能力。
- Custody API / UI / WalletConnect 等接入方式。
- 交易发起、KYT、策略校验、客户授权、签名和链上广播流程。
- Chainalysis KYT 集成。
- 自定义 transaction policies，例如金额限制、频率限制、白名单/黑名单、审批流。
- 多实体账户结构，用于不同司法辖区或业务实体。
- 审计、proof of control、保险和 24/7 运维能力。

### 7.2 在本项目里怎么用 Hex Trust

本项目不应让 Pad App 直接管理私钥，也不应让员工手工生成地址。

推荐方式：

```text
Pad App
  -> Virtual Asset Backend
  -> Custody Adapter
  -> Hex Trust Custody API
  -> Hex Safe Vault / Wallet / Address
```

各层职责：

- **Pad App**：员工操作界面，只发起业务请求。
- **Virtual Asset Backend**：保存 deposit request、Travel Rule、screening result、audit log。
- **Custody Adapter**：屏蔽不同托管方 API 差异，负责调用 Hex Trust 或未来其他 provider。
- **Frax / Business Adapter（如使用）**：同步客户记录、外部系统 ID 或流程状态，不直接承担托管地址签发职责。
- **Hex Trust**：负责托管钱包、地址生成、策略控制、签名、广播和托管安全。

### 7.3 典型 API 调用场景

正式集成时需要确认 Hex Trust 合同和 API 文档。基于公开资料，系统至少需要以下 adapter 能力：

```ts
type CustodyProvider = {
  createDepositAddress(request: DepositRequest): Promise<DepositAddress>;
  getAddressStatus(addressId: string): Promise<DepositAddressStatus>;
  listTransactions(addressId: string): Promise<CustodyTransaction[]>;
  getTransaction(txId: string): Promise<CustodyTransaction>;
  createTransfer(request: TransferRequest): Promise<Transfer>;
  getTransferStatus(transferId: string): Promise<TransferStatus>;
};
```

入金地址生成：

```text
1. App 完成 pre-deposit screening 和 Travel Rule。
2. Backend 创建 DepositRequest。
3. Backend 调用 CustodyProvider.createDepositAddress。
4. Adapter 调用 Hex Trust API 创建或分配地址。
5. Backend 保存 addressId、chain、asset、expiresAt、depositId。
6. App 显示地址或安全链接给员工/客户。
```

到账监听：

```text
1. Backend 定时轮询 Hex Trust transaction API，或接收 webhook。
2. 根据 addressId / txHash 找到 DepositRequest。
3. 调用 KYT / screening provider 做到账后分析。
4. 标记 Funds Clear 或 Funds Dirty。
5. Clear 后进入 sweep / conversion / WTA routing。
```

员工操作边界：

- 员工点击 `Start On-Chain Monitoring` 不是手工查链。
- 该动作只是把 deposit request 标记为 waiting for incoming funds。
- 后端应自动订阅 Hex Trust webhook，或定时轮询 Hex Trust transaction API。
- 客户打款后，Hex Trust / custody provider 推送或返回 incoming transaction。
- 系统根据 addressId / txHash 自动匹配 deposit request，并推进状态。

Demo 设计：

```text
Host sends address / secure link
  -> Host clicks Start On-Chain Monitoring
  -> UI shows Listening for Hex Trust transaction webhook
  -> after 3 seconds demo simulates webhook received
  -> Funds detected on-chain
  -> Compliance engine clears transaction
  -> Stable coin lands in WTA
```

Demo 页面拆分：

- Step 4 `Funds detected on-chain`：展示 Hex Trust webhook / transaction API 返回到账事件，并把 tx 匹配到 deposit request。
- Step 5 `Compliance engine clears transaction`：展示到账后的交易级 KYT / compliance clear，不应只依赖入金前 source wallet screening。
- Step 6 `Stable coin lands in WTA`：展示 WTA 入账完成，并提供收据、通知、treasury record、开始新入金等后续操作。

Prime Broker 说明：

- Prime Broker 兑换不属于当前 deposit demo 主流程。
- 如果客户误入非支持资产或非目标稳定币，应进入独立的 exception / treasury flow。
- 当前 demo 只演示“supported stablecoin deposit -> WTA settlement”。

资金路由：

```text
If asset is target WTA stable coin:
  Hex Trust wallet movement / sweep -> WTA vault

If asset is unsupported or non-target stable:
  Stop current deposit flow before normal WTA settlement
  Hand off to separate Prime Broker / Treasury Conversion workflow
```

出金：

```text
1. Payout request created。
2. Pre-withdrawal wallet screening。
3. Travel Rule / payout compliance checks。
4. Hex Trust policy engine checks amount, whitelist, role approvals。
5. Multi-approval / mobile approver app。
6. Hex Trust signs and broadcasts transaction。
```

### 7.4 关键设计问题

需要和 Hex Trust / Frax / 运营方业务方确认：

- Hex Trust API 是否支持按单笔交易生成独立 deposit address。
- 地址是 chain account、sub-wallet、vault address，还是 memo/tag 模型。
- 是否支持 webhook。
- 是否支持 Travel Rule 字段透传或只做本系统留存。
- KYT 是由 Hex Trust 集成 Chainalysis 提供，还是运营方需要独立直连 Chainalysis / TRM / Elliptic。
- WTA 应按资产分 vault，还是按业务实体 / 司法辖区分 vault。
- Stable coin 的目标资产是 USDC、USDT，还是多个 WTA vault 并存。
- Prime Broker 与 Hex Trust 之间是链上转账、内部账户划转，还是 broker API 直连。
- Payout 的审批流由 Hex Trust policy engine 完成，还是运营方本地先审批再提交 Hex Trust。

### 7.5 当前 demo 的抽象

当前 demo 中：

- `AddressProvider` 模拟 Hex Trust / Custody Provider 地址生成。
- `ChainMonitorProvider` 模拟到账监听。
- `ScreeningProvider` 模拟 Chainalysis / KYT。
- `TravelRuleProvider` 模拟 Travel Rule 数据提交。

后续真实接入时，应保留 provider adapter 设计，把 mock provider 替换成 Hex Trust API client 和真实合规供应商。

## 8. 可能使用的接口清单

本节是概念接口清单，不代表 Hex Trust、Okta、Prime Broker 或 Travel Rule provider 的真实 endpoint 名称。正式开发前必须以供应商合同和 API 文档为准。

### 8.1 Okta / 员工认证接口

用途：员工登录、MFA、角色/组信息、session 建立。

可能接口：

```text
GET  /oauth2/v1/authorize
POST /oauth2/v1/token
GET  /oauth2/v1/userinfo
POST /oauth2/v1/logout
GET  /.well-known/openid-configuration
GET  /oauth2/v1/keys
```

本系统内部接口：

```text
POST /api/auth/okta/callback
POST /api/auth/session
GET  /api/me
POST /api/logout
```

关键字段：

```text
oktaUserId
email
name
groups
mfaMethod
sessionId
role
permissions
```

### 8.2 客户 / KYC / Patron 接口

用途：查找客户、创建轻量客户记录、同步 KYC 状态、关联 external system id / Frax id。

本系统内部接口：

```text
GET  /api/patrons?query=
GET  /api/patrons/{patronId}
POST /api/patrons
PATCH /api/patrons/{patronId}
GET  /api/patrons/{patronId}/kyc-status
POST /api/patrons/{patronId}/external-links
```

可能对接 Frax / KYC provider：

```text
POST /frax/customers
GET  /frax/customers/{fraxCustomerId}
PATCH /frax/customers/{fraxCustomerId}
GET  /kyc/customers/{customerId}/status
POST /kyc/verifications
```

关键字段：

```text
patronId
gamingProfileId
fraxCustomerId
kycStatus
jurisdiction
riskTier
externalSystemId
```

### 8.3 Deposit Request 接口

用途：员工在 Pad App 创建入金办理单。

本系统内部接口：

```text
POST /api/deposit-requests
GET  /api/deposit-requests/{depositId}
PATCH /api/deposit-requests/{depositId}
GET  /api/deposit-requests?status=
POST /api/deposit-requests/{depositId}/cancel
```

关键字段：

```text
depositId
patronId
hostUserId
asset
network
expectedAmount
sourceWalletAddress
status
createdAt
updatedAt
```

### 8.4 Pre-Deposit Wallet Screening / KYT 接口

用途：发地址前筛查客户来源钱包。

本系统内部接口：

```text
POST /api/deposit-requests/{depositId}/screen-source-wallet
GET  /api/wallet-screenings/{screeningId}
POST /api/wallet-screenings/{screeningId}/override-request
```

可能对接 Chainalysis / TRM / Elliptic / Hex Trust KYT：

```text
POST /kyt/wallet-screenings
GET  /kyt/wallet-screenings/{screeningId}
GET  /kyt/addresses/{address}/risk
POST /kyt/transactions/screen
```

关键字段：

```text
address
asset
network
riskScore
riskLevel
sanctionsHit
taintedExposurePercent
hopCount
decision: PASS | EDD | FAIL
reasonCodes
providerReportUrl
```

### 8.5 Compliance Case / EDD 接口

用途：处理 EDD、Fail、Funds Dirty、人工复核。

本系统内部接口：

```text
POST /api/compliance-cases
GET  /api/compliance-cases/{caseId}
GET  /api/compliance-cases?status=
POST /api/compliance-cases/{caseId}/approve
POST /api/compliance-cases/{caseId}/reject
POST /api/compliance-cases/{caseId}/close
POST /api/compliance-cases/{caseId}/request-documents
```

关键字段：

```text
caseId
depositId
patronId
caseType
priority
status
reviewerUserId
decision
decisionReason
attachments
```

### 8.6 FATF Travel Rule 接口

用途：收集、校验、保存或传递 originator / beneficiary 信息。

本系统内部接口：

```text
POST /api/deposit-requests/{depositId}/travel-rule
GET  /api/deposit-requests/{depositId}/travel-rule
PATCH /api/travel-rule-submissions/{submissionId}
POST /api/travel-rule-submissions/{submissionId}/submit
```

可能对接 Travel Rule provider，例如 Notabene / Sygna / TRP：

```text
POST /travel-rule/transfers
GET  /travel-rule/transfers/{transferId}
POST /travel-rule/transfers/{transferId}/submit
GET  /travel-rule/vasps
POST /travel-rule/counterparty-verification
```

可能对接 Hex Trust 的合规字段：

```text
POST /custody/transfers/{transferId}/travel-rule-info
GET  /custody/transfers/{transferId}/compliance-status
```

关键字段：

```text
originatorName
originatorAccount
originatorAddress
originatorNationalId
beneficiaryName
beneficiaryAccount
beneficiaryVasp
transactionAmount
asset
network
travelRuleStatus
```

### 8.7 Hex Trust / Custody 地址生成接口

用途：筛查和 Travel Rule 完成后，生成或分配客户入金地址。

本系统内部接口：

```text
POST /api/deposit-requests/{depositId}/issue-address
GET  /api/deposit-addresses/{addressId}
POST /api/deposit-addresses/{addressId}/void
```

Custody adapter 概念接口：

```text
POST /custody/deposit-addresses
GET  /custody/deposit-addresses/{addressId}
GET  /custody/vaults
GET  /custody/vaults/{vaultId}/addresses
```

关键字段：

```text
depositId
vaultId
asset
network
address
memoOrTag
addressId
expiresAt
singleUse
provider: HEX_TRUST
```

### 8.8 Hex Trust / Custody 交易监听接口

用途：监听客户是否打款、到账确认数、tx 状态。

本系统内部接口：

```text
POST /api/webhooks/custody/hex-trust
GET  /api/deposit-requests/{depositId}/transactions
POST /api/deposit-requests/{depositId}/refresh-chain-status
```

Custody adapter 概念接口：

```text
GET  /custody/transactions?addressId=
GET  /custody/transactions/{txId}
GET  /custody/vaults/{vaultId}/transactions
POST /custody/webhooks
DELETE /custody/webhooks/{webhookId}
```

Webhook 事件：

```text
transaction.detected
transaction.confirming
transaction.confirmed
transaction.failed
transaction.flagged
transfer.approval_required
transfer.broadcasted
transfer.completed
```

关键字段：

```text
txHash
asset
network
fromAddress
toAddress
amount
confirmations
blockNumber
custodyTransactionId
depositId
```

### 8.9 Funds Clear / Dirty 到账后筛查接口

用途：对真实到账交易做 KYT，不只依赖客户预先提供的来源钱包。

本系统内部接口：

```text
POST /api/transactions/{txId}/screen
GET  /api/transactions/{txId}/risk-result
POST /api/transactions/{txId}/mark-clear
POST /api/transactions/{txId}/mark-dirty
```

可能对接 KYT provider：

```text
POST /kyt/transactions
GET  /kyt/transactions/{kytTransactionId}
GET  /kyt/transactions/{kytTransactionId}/alerts
```

关键字段：

```text
txHash
fromAddress
toAddress
amount
asset
riskScore
alertType
exposureCategory
decision
```

### 8.10 Prime Broker 报价与兑换接口

用途：非目标稳定币或误入资产兑换成 WTA 目标稳定币。

本系统内部接口：

```text
POST /api/conversions/quote
POST /api/conversions
GET  /api/conversions/{conversionId}
POST /api/conversions/{conversionId}/accept
POST /api/conversions/{conversionId}/cancel
```

Prime Broker 概念接口：

```text
POST /broker/quotes
GET  /broker/quotes/{quoteId}
POST /broker/orders
GET  /broker/orders/{orderId}
GET  /broker/balances
GET  /broker/settlements/{settlementId}
```

关键字段：

```text
fromAsset
toAsset
fromAmount
quoteId
quoteType
rate
fee
expiresAt
orderId
settlementWallet
settlementStatus
```

### 8.11 Sweep / WTA 入账接口

用途：资金 clear 后，把资金从 deposit collection wallet 路由到 WTA vault。

本系统内部接口：

```text
POST /api/deposit-requests/{depositId}/route-to-wta
GET  /api/wta/vaults
GET  /api/wta/balances
GET  /api/wta/settlements/{settlementId}
```

Custody adapter 概念接口：

```text
POST /custody/transfers
GET  /custody/transfers/{transferId}
GET  /custody/vaults/{vaultId}/balances
GET  /custody/vaults/{vaultId}/assets
```

关键字段：

```text
sourceVaultId
destinationVaultId
asset
network
amount
transferId
approvalStatus
settlementStatus
wtaVaultId
```

### 8.12 Payout / Withdrawal 接口

用途：客户出金、赢钱 payout、退回资金。

本系统内部接口：

```text
POST /api/payouts
GET  /api/payouts/{payoutId}
POST /api/payouts/{payoutId}/screen-destination-wallet
POST /api/payouts/{payoutId}/submit-for-approval
POST /api/payouts/{payoutId}/cancel
```

Custody adapter 概念接口：

```text
POST /custody/transfers
GET  /custody/transfers/{transferId}
POST /custody/transfers/{transferId}/approve
POST /custody/transfers/{transferId}/reject
GET  /custody/policies
GET  /custody/whitelisted-addresses
POST /custody/whitelisted-addresses
```

关键字段：

```text
payoutId
patronId
destinationAddress
asset
network
amount
screeningDecision
approvalQuorum
approvers
transferId
txHash
```

### 8.13 审计和报表接口

用途：记录谁在什么时候做了什么，支持内部审计和监管问询。

本系统内部接口：

```text
GET  /api/audit-logs?entityId=
POST /api/audit-logs
GET  /api/reports/deposits
GET  /api/reports/compliance-cases
GET  /api/reports/travel-rule
GET  /api/reports/transactions
```

关键字段：

```text
auditId
actorUserId
actorOktaId
action
entityType
entityId
timestamp
ipAddress
deviceId
metadata
```

### 8.14 接口调用顺序示例

成功入金路径：

```text
1. GET  /oauth2/v1/authorize
2. POST /oauth2/v1/token
3. GET  /api/me
4. GET  /api/patrons?query=
5. POST /api/deposit-requests
6. POST /api/deposit-requests/{depositId}/screen-source-wallet
7. POST /api/deposit-requests/{depositId}/travel-rule
8. POST /api/deposit-requests/{depositId}/issue-address
9. POST /custody/deposit-addresses
10. POST /api/webhooks/custody/hex-trust
11. POST /api/transactions/{txId}/screen
12. POST /api/deposit-requests/{depositId}/route-to-wta
13. POST /custody/transfers
14. GET  /api/wta/settlements/{settlementId}
```

高风险钱包路径：

```text
1. POST /api/deposit-requests
2. POST /api/deposit-requests/{depositId}/screen-source-wallet
3. POST /api/compliance-cases
4. No address issuance
```

需要 Prime Broker 的路径：

```text
1. Incoming tx confirmed
2. Transaction KYT clear
3. POST /api/conversions/quote
4. POST /broker/quotes
5. POST /api/conversions/{conversionId}/accept
6. POST /broker/orders
7. Settlement stable coin received
8. POST /api/deposit-requests/{depositId}/route-to-wta
```

## 9. 员工信息和权限放在哪里

### Okta 云端保存的内容

Okta 通常保存企业身份和访问控制相关信息：

- 员工账号。
- 员工姓名、邮箱、部门。
- 员工所属 groups。
- MFA 配置。
- 登录策略。
- 设备/网络/条件访问策略。
- 用户生命周期状态，例如 active、suspended、deactivated。

### 本地业务系统保存的内容

Virtual Asset Management App / 后端应保存业务相关内容：

- App 内部角色映射。
- 员工在本系统中的业务权限快照。
- Session。
- Audit logs。
- Deposit request。
- Travel Rule submission。
- Compliance case。
- Wallet screening result。

### 推荐边界

Okta 是身份源头，负责认证和基础授权信号。

本地业务系统是业务记录源头，负责把 Okta 身份映射成具体业务权限，并记录员工做过的每个业务动作。

推荐设计：

```text
Okta owns identity
App owns business authorization and audit
```

也就是说：

- 员工是谁、是否还能登录，由 Okta 管。
- 员工在本系统里能不能发地址、能不能审批 EDD，由 App 根据 Okta group / claim 和本地权限规则共同决定。
- 员工具体做了什么，由 App 本地审计日志记录。
