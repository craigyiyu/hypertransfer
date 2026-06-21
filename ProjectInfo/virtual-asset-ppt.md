---
marp: true
theme: default
paginate: true
---

# Virtual Asset Management

## 模块化产品设计与 Hex Trust API 接入说明

面向永利员工、合规团队、财务团队的虚拟资产入金、退款、兑换与资金路由平台。

---

# 1. 项目定位

本项目不是单一的 crypto deposit 页面，而是一套虚拟资产业务编排系统。

核心目标：

- 员工通过 Okta 安全登录后办理虚拟资产业务。
- 系统把 KYC、KYT、Travel Rule、托管地址、链上监控、WTA 入账、退款、兑换等流程模块化。
- 所有外部能力通过 provider adapter 接入，例如 Hex Trust、KYT provider、Travel Rule provider、Prime Broker。
- 关键操作写入审计日志，满足内部合规和监管问询。

---

# 2. 系统角色

主要使用者：

- Host / Account Manager：为客户发起 deposit、退款或相关办理流程。
- Compliance Officer：处理 KYC、EDD、KYT 风险、Travel Rule、Funds Dirty case。
- Treasury / Finance：查看 WTA 入账、退款出金、Prime Broker 兑换和资金对账。
- Admin：配置 Okta、角色权限、供应商接口、风险阈值和审批策略。

---

# 3. 模块总览

建议拆成以下业务模块：

- Okta Setup & Employee Access 模块
- Patron / KYC 模块
- User Deposit 模块
- KYT / Wallet Screening 模块
- FATF Travel Rule 模块
- Hex Trust Custody / Address 模块
- On-chain Monitoring & WTA Settlement 模块
- User Refund / Payout 模块
- Prime Broker Conversion 模块
- Compliance Case & EDD 模块
- Audit / Reporting 模块
- Admin / Integration Configuration 模块

---

# 4. 高层业务地图

```text
Okta Login
  -> Patron / KYC
  -> Deposit Request
  -> Source Wallet KYT
  -> Travel Rule
  -> Hex Trust Deposit Address
  -> On-chain Monitoring
  -> Transaction KYT Clear
  -> WTA Settlement

Separate flows:
  -> Refund / Payout
  -> Prime Broker Conversion
  -> Compliance Case / EDD
```

---

# 5. Okta Setup & Employee Access 模块

模块目标：

- 管理永利员工身份认证。
- 控制谁可以进入 Virtual Asset Management App。
- 根据 Okta group / claim 映射业务角色。
- 对高风险动作触发 MFA 或 step-up authentication。

用户链路：

```text
Employee opens Pad App
  -> Redirect to Okta
  -> Corporate credential login
  -> MFA with Okta Verify / Passkey
  -> App validates token
  -> App maps employee role
  -> Employee enters workspace
```

---

# 6. Okta 模块边界

Okta 负责：

- 员工账号、密码策略、MFA、登录策略。
- 员工 group、基础权限 claim。
- 用户生命周期，例如 active、suspended、deactivated。

本系统负责：

- 业务角色映射。
- 每个业务动作的授权判断。
- 业务 session。
- 审计日志。
- Deposit、refund、conversion、compliance case 等业务记录。

---

# 7. Patron / KYC 模块

模块目标：

- 建立或查询客户档案。
- 判断客户是否已有可用 KYC 状态。
- 对高风险客户触发 EDD。
- 把客户身份与 deposit、refund、conversion 记录关联。

用户链路：

```text
Host searches patron
  -> System returns patron profile
  -> System checks KYC status
  -> If verified, continue business flow
  -> If EDD required, create compliance case
  -> If blocked, stop business flow
```

---

# 8. KYC 状态判断

核心状态：

- Verified：客户身份已通过，可进入 deposit / refund 流程。
- EDD Required：需要增强尽调，进入 compliance review。
- Blocked：客户不允许继续办理。
- Expired / Missing：需要补充或重新完成 KYC。

判断依据：

- 客户身份资料完整性。
- Jurisdiction / residency risk。
- PEP / sanctions / adverse media 命中情况。
- 业务金额、频率、历史异常记录。

---

# 9. User Deposit 模块

模块目标：

- Host 为客户创建稳定币入金办理单。
- 采集资产、网络、金额和客户来源钱包。
- 发地址前完成 KYT 和 Travel Rule。
- 通过 Hex Trust 签发或分配入金地址。
- 到账后入账 WTA。

当前 deposit demo 范围：

- 支持稳定币 deposit，例如 USDT / USDC。
- Prime Broker conversion 不放在当前 deposit 主流程中。
- 非目标稳定币或误入资产进入单独 exception / conversion flow；Phase 1 不处理 BTC / ETH 资产。

---

# 10. Deposit 用户链路

```text
Host selects verified patron
  -> Host enters asset / network / expected amount
  -> Host enters patron source wallet address
  -> System runs pre-deposit wallet KYT
  -> If Pass, collect Travel Rule data
  -> System requests Hex Trust deposit address
  -> Host securely sends address / link to patron
  -> Patron transfers funds
  -> Hex Trust webhook detects incoming tx
  -> System runs transaction KYT
  -> Funds clear
  -> Stable coin settles to WTA
```

---

# 11. KYT / Wallet Screening 模块

模块目标：

- 发地址前筛查客户提供的 source wallet。
- 到账后筛查真实 incoming transaction。
- 判断 Pass、EDD、Fail 或 Funds Dirty。

用户链路：

```text
Host inputs source wallet
  -> System sends address to KYT provider
  -> Provider returns risk score and reason codes
  -> Pass: continue Travel Rule
  -> EDD: create compliance case
  -> Fail: block address issuance
```

核心指标：

- Sanctions hit
- Tainted exposure
- Mixer / darknet / scam exposure
- Hop count
- Risk score

---

# 12. FATF Travel Rule 模块

模块目标：

- 收集 originator / beneficiary 信息。
- 判断是否达到 Travel Rule 阈值。
- 保存或传递给 Travel Rule provider / custody provider。
- 为后续监管审计保留数据。

用户链路：

```text
KYT Pass
  -> Host reviews originator information
  -> System pre-fills Wynn beneficiary information
  -> Host submits Travel Rule form
  -> System validates required fields
  -> Travel Rule status becomes ready
  -> Deposit address can be issued
```

---

# 13. Hex Trust Custody / Address 模块

模块目标：

- 在合规步骤完成后，向 Hex Trust 请求 deposit address。
- 把 addressId、asset、network、memo/tag、expiry 等信息保存到 deposit request。
- 支持一次性地址或客户级地址策略。
- 避免员工手动录入托管地址。

用户链路：

```text
Travel Rule ready
  -> App requests custody deposit address
  -> Hex Trust returns address / memo / addressId
  -> App stores address metadata
  -> Host sends secure link to patron
  -> Deposit status becomes Waiting for Funds
```

---

# 14. On-chain Monitoring & WTA Settlement 模块

模块目标：

- 监听客户是否打款。
- 根据 txHash、addressId、toAddress 匹配 deposit request。
- 确认 required confirmations。
- 通过交易级 KYT 后，将稳定币资金路由到 WTA。

用户链路：

```text
Patron sends funds
  -> Hex Trust detects incoming transaction
  -> Hex Trust sends webhook to App
  -> App matches transaction to deposit request
  -> App waits for confirmations
  -> App runs transaction KYT
  -> If clear, route stable coin to WTA
  -> App records settlement
```

---

# 15. User Refund / Payout 模块

模块目标：

- 处理客户退款、出金或 payout。
- 出金前再次筛查 destination wallet。
- 走内部审批和托管方 transfer policy。
- 支持多签、限额、白名单地址和审计。

用户链路：

```text
Host / Finance creates refund request
  -> System checks patron eligibility
  -> User provides destination wallet
  -> System screens destination wallet
  -> Compliance approves if required
  -> Treasury submits payout transfer
  -> Hex Trust policy requires approval
  -> Transfer broadcasts on-chain
  -> App records txHash and payout status
```

---

# 16. Prime Broker Conversion 模块

模块目标：

- 单独处理非目标稳定币或误入资产兑换；Phase 1 不处理 BTC / ETH 资产。
- 不放在 deposit 主流程中，避免 deposit 逻辑过重。
- Treasury 根据资金策略决定是否兑换成 WTA 目标稳定币。
- 兑换完成后再进入 WTA settlement 或 treasury accounting。

用户链路：

```text
Treasury opens conversion request
  -> Select source asset and target asset
  -> App requests Prime Broker quote
  -> Treasury reviews rate / fee / expiry
  -> Treasury accepts quote
  -> App creates broker order
  -> Hex Trust transfers source asset if needed
  -> Broker settles target stable coin
  -> App records conversion and WTA impact
```

---

# 17. Compliance Case & EDD 模块

模块目标：

- 集中处理所有需要人工复核的场景。
- 包括 KYC EDD、source wallet EDD、Travel Rule exception、Funds Dirty、refund risk、conversion exception。
- 保留 reviewer、decision、reason 和附件。

用户链路：

```text
System detects risk
  -> Create compliance case
  -> Compliance officer reviews evidence
  -> Request additional documents if needed
  -> Approve, reject, or escalate
  -> App updates related business flow
  -> Audit log records final decision
```

---

# 18. Audit / Reporting 模块

模块目标：

- 记录关键业务动作。
- 支持内部审计、合规复盘和监管问询。
- 汇总 deposit、refund、conversion、KYT、Travel Rule、WTA settlement 报表。

审计对象：

- Employee login and MFA
- Patron lookup
- KYC decision
- Wallet screening result
- Travel Rule submission
- Address issuance
- Incoming transaction
- WTA settlement
- Refund transfer
- Broker conversion
- Compliance decision

---

# 19. Admin / Integration Configuration 模块

模块目标：

- 配置外部 provider adapter。
- 管理风险阈值和业务规则。
- 管理角色权限和审批矩阵。
- 管理 webhook endpoint、API key、IP allowlist、签名验证策略。

用户链路：

```text
Admin opens integration settings
  -> Configure Hex Trust credentials
  -> Configure webhook signing secret
  -> Configure KYT / Travel Rule provider
  -> Configure risk thresholds
  -> Configure approval policies
  -> Save and audit configuration change
```

---

# 20. Hex Trust API 使用范围

Hex Trust 在本项目中主要承担 custody / wallet infrastructure 角色。

可能使用的 Hex Trust 能力：

- Vault / account 查询
- Asset / network 查询
- Deposit address 生成或分配
- Incoming transaction 查询
- Webhook 事件推送
- Internal transfer / sweep to WTA
- Balance 查询
- Withdrawal / payout transfer
- Approval policy / multi-party approval
- Whitelisted address 管理
- Statement / reconciliation 数据

注意：以下 endpoint 是概念清单，真实名称需要以 Hex Trust 合同和 API 文档为准。

---

# 21. Hex Trust API：基础与账户

用途：

- 连接 Hex Trust custody 环境。
- 查询永利可用 vault、asset、network 和余额。
- 为 deposit、refund、conversion 做账户映射。

概念接口：

```text
GET  /custody/vaults
GET  /custody/vaults/{vaultId}
GET  /custody/vaults/{vaultId}/assets
GET  /custody/vaults/{vaultId}/balances
GET  /custody/assets
GET  /custody/networks
GET  /custody/network-fees
```

关键字段：

```text
vaultId, vaultName, asset, network, availableBalance,
lockedBalance, custodyAccountId, wtaVaultId
```

---

# 22. Hex Trust API：Deposit Address

用途：

- 给客户 deposit request 签发或分配入金地址。
- 返回 addressId、address、memo/tag、asset、network。
- 支持一次性地址、客户级地址或 collection wallet 策略。

概念接口：

```text
POST /custody/deposit-addresses
GET  /custody/deposit-addresses/{addressId}
GET  /custody/vaults/{vaultId}/addresses
POST /custody/deposit-addresses/{addressId}/disable
```

关键字段：

```text
depositId, vaultId, asset, network, address,
memoOrTag, addressId, singleUse, expiresAt, status
```

---

# 23. Hex Trust API：Transaction Monitoring

用途：

- 获取 incoming transaction。
- 监听 transaction detected / confirmed / failed / flagged。
- 根据 addressId 或 txHash 匹配 deposit request。

概念接口：

```text
POST /custody/webhooks
DELETE /custody/webhooks/{webhookId}
GET  /custody/transactions?addressId=
GET  /custody/transactions/{txId}
GET  /custody/vaults/{vaultId}/transactions
```

Webhook 事件：

```text
transaction.detected
transaction.confirming
transaction.confirmed
transaction.failed
transaction.flagged
```

---

# 24. Hex Trust API：Travel Rule / Compliance 状态

用途：

- 如果 Hex Trust custody flow 要求 Travel Rule 信息，可把相关字段附加到 custody transfer / transaction。
- 查询 custody 侧合规状态。
- 与专门 Travel Rule provider 组合使用。

概念接口：

```text
POST /custody/transfers/{transferId}/travel-rule-info
GET  /custody/transfers/{transferId}/compliance-status
GET  /custody/transactions/{txId}/compliance-status
```

关键字段：

```text
originatorName, originatorAccount, originatorAddress,
beneficiaryName, beneficiaryAccount, beneficiaryVasp,
asset, network, amount, travelRuleStatus
```

---

# 25. Hex Trust API：Sweep / WTA Settlement

用途：

- 资金 clear 后，从 deposit collection wallet 路由到 WTA vault。
- 查询 internal transfer 状态。
- 记录 settlementId，用于财务对账。

概念接口：

```text
POST /custody/transfers
GET  /custody/transfers/{transferId}
GET  /custody/vaults/{vaultId}/balances
GET  /custody/vaults/{vaultId}/transactions
```

关键字段：

```text
sourceVaultId, destinationVaultId, asset, network,
amount, transferId, approvalStatus, settlementStatus, txHash
```

---

# 26. Hex Trust API：Refund / Payout

用途：

- 发起客户 refund / payout 出金。
- 结合白名单地址、审批策略和多签规则。
- 查询 transfer approval 和链上广播状态。

概念接口：

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
payoutId, destinationAddress, asset, network,
amount, approvalQuorum, approvers, transferId, txHash
```

---

# 27. Hex Trust API：Prime Broker Conversion 相关

Prime Broker conversion 本身通常由 broker API 处理报价和订单。

Hex Trust 在该模块中的角色通常是：

- 把需要兑换的资产从 custody vault 转到 broker settlement wallet。
- 接收 broker 结算回来的目标稳定币。
- 查询转账状态和余额变化。
- 把目标稳定币路由到 WTA vault。

概念接口：

```text
POST /custody/transfers
GET  /custody/transfers/{transferId}
GET  /custody/vaults/{vaultId}/balances
GET  /custody/transactions/{txId}
POST /custody/webhooks
```

---

# 28. Hex Trust API：Reconciliation / Reporting

用途：

- 对账 deposit、refund、conversion 和 WTA settlement。
- 支持财务日报、审计和监管问询。
- 交叉验证 App 内部记录与 custody 侧记录。

概念接口：

```text
GET /custody/vaults/{vaultId}/balances
GET /custody/vaults/{vaultId}/transactions
GET /custody/transfers/{transferId}
GET /custody/statements
GET /custody/statements/{statementId}
```

关键字段：

```text
statementId, periodStart, periodEnd, openingBalance,
closingBalance, transactionList, fee, settlementStatus
```

---

# 29. 成功 Deposit 的接口调用顺序

```text
1. Okta login and MFA
2. GET  /api/patrons?query=
3. GET  /api/patrons/{patronId}/kyc-status
4. POST /api/deposit-requests
5. POST /api/deposit-requests/{depositId}/screen-source-wallet
6. POST /api/deposit-requests/{depositId}/travel-rule
7. POST /api/deposit-requests/{depositId}/issue-address
8. POST /custody/deposit-addresses
9. POST /api/webhooks/custody/hex-trust
10. GET  /custody/transactions/{txId}
11. POST /api/transactions/{txId}/screen
12. POST /api/deposit-requests/{depositId}/route-to-wta
13. POST /custody/transfers
14. GET  /api/wta/settlements/{settlementId}
```

---

# 30. Refund / Payout 的接口调用顺序

```text
1. Host / Finance creates refund request
2. GET  /api/patrons/{patronId}/kyc-status
3. POST /api/payouts
4. POST /api/payouts/{payoutId}/screen-destination-wallet
5. POST /api/payouts/{payoutId}/submit-for-approval
6. POST /custody/whitelisted-addresses if required
7. POST /custody/transfers
8. POST /custody/transfers/{transferId}/approve
9. Webhook: transfer.broadcasted
10. Webhook: transfer.completed
11. App records txHash and closes payout
```

---

# 31. Prime Broker Conversion 的接口调用顺序

```text
1. Treasury creates conversion request
2. POST /api/conversions/quote
3. POST /broker/quotes
4. Treasury accepts quote
5. POST /api/conversions/{conversionId}/accept
6. POST /broker/orders
7. POST /custody/transfers to broker settlement wallet if needed
8. Webhook confirms source asset transfer
9. Broker settles target stable coin
10. Hex Trust detects incoming target asset
11. POST /custody/transfers to WTA vault if needed
12. App records conversion, settlement, and audit log
```

---

# 32. 推荐实施顺序

第一阶段：Demo / MVP

- Okta 模拟登录与角色。
- Patron / KYC mock。
- Stable coin deposit flow。
- KYT mock。
- Travel Rule form。
- Hex Trust address / webhook mock。
- WTA settlement mock。

第二阶段：真实集成

- Okta OIDC + MFA。
- Hex Trust custody API。
- KYT provider。
- Travel Rule provider。
- Audit and reporting。

第三阶段：扩展流程

- Refund / payout。
- Prime Broker conversion。
- Advanced EDD case management。
- Finance reconciliation。

---

# 33. 关键设计原则

- Deposit 主流程保持简单，只处理 supported stable coin 入金。
- Prime Broker conversion 单独拆成 Treasury / Conversion flow。
- Refund / payout 不复用 deposit 页面，但复用 KYC、KYT、Travel Rule、custody transfer、audit 能力。
- Hex Trust 作为托管与资金移动基础设施，不直接替代 App 的业务状态机。
- App 保存业务上下文，Hex Trust 保存 custody 侧资产和转账事实。
- 所有关键动作都要有 actor、timestamp、reason 和 immutable audit trail。
