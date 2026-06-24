# 2026-06-22 Hex Trust 会议纪要：托管平台接入、交易流程及合规风控沟通

> 来源：AI 会议摘要（图中标注「内容由 AI 生成，仅供参考」）
> 会议时间：2026-06-22 下午（中国标准时间）
> 整理时间：2026-06-22
> 会议主题：托管平台账户设置、移动端审批、API 集成、资金接收与合规筛查、法币兑换流程
> 主要参会方：服务提供方 = Hex Trust（说话人 1）；客户方技术 / 运营团队（说话人 2、4、5 等）
> 备注：本纪要由 AI 自动摘要整理。Hex Trust 的真实 API 仍以正式 API 文档 / sandbox / webhook 样例 / OpenAPI / Postman 为准；本纪要口径需与正式材料和后续邮件确认。

## 一句话结论

Hex Trust 将提供**沙盒测试环境**协助客户完成托管平台初始设置；确认**移动端 APP 仅用于交易审批、支持自定义多签**；明确**资产接收地址固定 + Chainalysis 自动化合规筛查**；法币兑换目前为**高触（High-touch）人工模式**，并约定通过即时通讯工具建立高频指令沟通与支持通道。

## 关键决议

- 提供沙盒测试环境。
- 确认多签审批机制（可自定义比例、按 Vault 独立策略）。
- 明确合规筛查自动化流程（Chainalysis 实时筛查）。
- 约定通过聊天工具进行高频交易指令沟通。

## 账户初始化与移动端访问

- **初始设置状态**：KYC 完成后已发送邀请邮件；需确认管理员（Craig）是否已登录平台（纪要记为 "Graph 平台"，疑为 Hex Safe 控制台，待确认）并添加其他用户角色。
- **移动端 APP 功能**：
  - APP 主要用于**批准托管相关交易**，非所有用户均需下载。
  - 审计员等只读角色无需安装 APP，仅需网页端访问权限。
  - 用户登录后在设置中扫码下载 iOS 或 Android 版本。
- **多签审批策略**：
  - 平台**不强制推荐**特定多签比例，客户可按组织需求灵活配置（如 2/3、1/2、5/5）。
  - 不同钱包（Vault）可设置**独立交易策略**：高频钱包门槛较低，冷钱包门槛较高。

## 资产接收与钱包架构

- **入金权限**：接收资产无需额外权限审批——区块链性质决定任何人均可向公开地址发送资金。
- **存款地址机制**：
  - 每个 Vault 拥有独立的链上钱包地址。
  - 除比特币因隐私保护可能**轮换显示地址**（旧地址仍有效）外，**稳定币等其他资产的存款地址保持固定不变**。
- **内部转账**：支持 Vault 间内部转移（如接收 Vault → 国库 Vault）；此类操作视为链上转账，需遵循相应发起与审批流程。
- **操作主体**：日常运营可由被授权操作员执行，无需账户创建者（如 Craig）亲自参与每笔交易。

## API 集成与开发支持

- **API 功能**：支持通过 API 发起交易指令，无需强制登录网页端。
- **沙盒环境**：Hex Trust 将为客户创建独立测试环境（Sandbox）账户，供开发团队做 API 集成测试。
- **技术支持**：
  - 提供 7×24 小时电子邮件支持。
  - 可建立即时通讯群组（Slack / Telegram / WhatsApp）以快速响应开发问题。
- **生产环境切换**：从测试到生产无复杂技术障碍，主要取决于客户内部准备情况及 KYC 流程完成度。

## 合规筛查与风控流程

- **筛查机制**：所有出入金交易均自动经 **Chainalysis** 等工具做制裁名单、黑客地址等风险筛查。
- **异常处理**：
  - 触发红旗预警时，资金被**暂时冻结**，不可提现或转移。
  - 合规团队人工介入调查：误报则解冻，确认高风险则可能**退回资金**。
  - 筛查为自动化实时进行，通常秒级完成，无需人工预先标记。
- **退款流程**：资金退回或拒绝由**合规团队手动处理**；**目前不支持通过 API 自动接收退款信号**。

## 法币兑换与交易执行

- **兑换模式**：
  - 当前主要为**"高触"（High-touch）模式**：通过专用交易聊天室（Trading Chat）由人工交易员执行兑换指令。
  - 托管账户**仅持有数字资产**；法币余额存放于独立银行账户结构，不在托管 UI 直接显示。
- **对账与报告**：
  - 交易确认后即时发送电子邮件报告。
  - 法币余额可经交易员查询，或依赖定期报告对账。
- **自动化探索**：
  - 客户询问是否可经 Chatbot 或 API 实现自动化询价与交易。
  - Hex Trust 表示可将**经合规批准的 Bot 加入交易聊天室**，且后端正在使用 Symphony 等合规通讯工具。
  - 高频或大额需求未来可探讨 API 直连交易，但目前建议先以人工模式熟悉流程。

## 行动项（Action Items）

| 优先级 | 事项 | Owner | 状态 |
|---|---|---|---|
| P0 | 发送沙盒测试环境账户信息给客户 | Hex Trust | 待办 |
| P0 | 确认管理员 Craig 收到初始设置邮件并协助完成用户添加 | Hex Trust / Craig | 进行中 |
| P0 | 提供技术支持联系方式或建立即时通讯群组 | Hex Trust | 待办 |
| P0 | 技术团队利用沙盒环境进行 API 流程测试 | 客户方技术 | 待办 |
| P1 | 内部梳理交易审批权限结构及多签策略 | 客户方运营 | 待办 |
| P1 | 整理剩余技术细节问题清单，后续与 Hex Trust 对接 | 客户方 | 待办 |

## 对照既往 Hex Trust 问题清单（见 `AGENTS.md` 2026-06-22 release note）

**本次已（部分）澄清：**

- Sandbox / production 切换：会提供 sandbox 账户；生产切换无复杂技术障碍，取决于客户准备与 KYC。
- Deposit address：每 Vault 独立链上地址；**稳定币地址固定不变**，BTC 可能轮换显示地址（旧地址仍有效）。
- Transfer / refund 审批：多签可自定义比例、按 Vault 独立策略；移动端 APP 用于审批。
- 合规筛查：Chainalysis 自动实时（秒级），红旗冻结 + 人工调查 + 可能退回。
- 退款：合规团队**手动处理**，**无 API 自动退款信号**。
- HT Markets / 法币兑换：当前为**高触人工 Trading Chat**，托管只持数字资产，法币在独立银行账户；暂无 quote/order API，未来高频大额可议。
- 技术支持：7×24 邮件 + 可建即时通讯群组。

**本次仍未澄清（需正式材料 / 后续会议补）：**

- API auth、IP allowlist、key rotation 的具体机制。
- Webhook 事件清单、payload、signature、retry、idempotency、ordering、replay protection。
- 按 `txHash` / `addressId` / `transferId` / `vaultId` 的查询接口与 status schema。
- Confirmation payload 是否返回 `confirmationCount` / `requiredConfirmations` / finality timestamp（上午客户口径仍为 EVM 5 / Tron 4，需 Hex Trust 文档背书）。
- **Travel Rule 在香港 Hex Trust Limited 合同下的责任边界，平台层是否仍不 hard-freeze pending Travel Rule**（本次会议未直接讨论）。
- Reconciliation 的 API / webhook / SFTP / monthly statement schema、时区、fee 字段。

## ⚠️ 对现有产品设计的影响（需评估，先不改代码）

1. **存款地址固定 vs 现有 single-use 假设（重要）**：Hex Trust 明确稳定币存款地址**固定不变**；但现有设计（`CLAUDE.md` §4.1/§4.3 `DepositAddress` "single-use 原则"、`funds_dirty` 时 `voided`）假设的是**一次性地址**。需重新评估发址与作废逻辑。
2. **法币兑换无 OTC API vs 现有 HT Markets OTC 建模**：会议口径为高触人工 Trading Chat，暂无 quote/order API；现有 `casino-ops` / `treasury-ops.ts` 把 HT Markets OTC 建模为可 quote/settle 的自动流程（0.50% / USD 150）。需确认哪部分是 mock 演示、哪部分对得上 Hex Trust 真实能力。
3. **退款无 API 信号 vs 现有 refund 自动化**：Hex Trust 退款由合规团队手动处理、无 API 自动退款信号；现有 refund demo 假设可程序化推进。需重新设计退款回执与对账的获取方式（可能依赖邮件报告 / 人工）。
4. **Webhook 未确认**：现有 `hex-safe.ts` mock 了 webhook 模型，但本次 Hex Trust 未提供 webhook 细节，到账监听机制（webhook vs 轮询）仍待正式材料确认。
5. **多签审批走 Hex Trust 移动端 APP**：审批不在 HyperTransfer 内完成，而在 Hex Trust APP；产品侧需明确"我方编排 + Hex Trust APP 审批"的职责边界。
