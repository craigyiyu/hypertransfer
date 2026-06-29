# 2026-06-05 客户会议纪要：Crypto Compliance and KYC Rollout

> 来源：Granola 共享纪要  
> 原始标题：Crypto compliance and KYC rollout - hex trust contract, travel rules, and testing timeline  
> Granola 文档时间：2026-06-05 07:00 UTC / 15:00 中国时间  
> 整理时间：2026-06-07  
> 来源链接：https://notes.granola.ai/d/4afedd0c-b7f2-4149-b4a1-e4c0e34155c0  
> Transcript chat 链接：https://notes.granola.ai/t/65c7fa85-1f8a-471b-a0be-9b56c5ea04f7  
> 备注：当前共享页公开的是 Granola 摘要面板，页面 payload 中 `documentTranscript` 为空，未取得完整逐字稿。

## 一句话结论

Hex Trust 合约已进入最终签署阶段，项目推进的主要阻塞点集中在三件事：Hex Trust KYC 集成、Travel Rule 合规方案、以及客户端/接口开发。所有合同签完后，预计还需要 3 到 4 周完成开发、测试和培训。

## 会议核心结论

### 1. Hex Trust 合约状态

- Hex Trust 合约签署正在推进。
- 客户侧已经给出继续推进的绿灯，目前等待最终文件完成。
- 仍有三个未关闭事项：
  - Hex Trust KYC integration
  - Travel Rule compliance
  - Interface development

### 2. KYC 与 Travel Rule 实施路径

- 当前识别出两支外部供应商团队：
  - Benny 团队：只负责 KYC。
  - Subnian 团队：只负责 Travel Rule。
- 两支团队都需要与客户侧直接签约。Granola 摘要中写作 `Wings`，需确认是否指 Operator / Macau operator / Wings 相关主体。
- 法务对第三方 KYC provider 存在顾虑：
  - 如果不完全信任 Hex Trust，为什么还要信任其他第三方 KYC 供应商，需要给出合规逻辑。
  - 会议中提出可考虑使用现有 gaming compliance team。
  - 多数目标客户可能本来就是现有会员，已完成一定程度 KYC。
- 需要补充的钱包和资金安全措施：
  - Proof of Funds verification，避免欺诈性入金。
  - Wallet ownership validation，确认客户确实控制来源钱包。
  - Refund process 需要配合合法地址验证，避免退款打到错误或未验证地址。

### 3. 开发、测试与培训时间线

- 合同全部签署后，预计 3 到 4 周完成。
- 该时间线包含完整测试和培训。
- 现有 prototype 已经具备以下能力：
  - Google Authenticator MFA 可用。
  - 注册流程已完成。
  - Deposit page 可访问。
- 培训可与部分开发/测试并行，以压缩总周期。

### 4. 法务与合规评审

- 计划下周安排 Malcolm（Head of Legal）和 Craig 参加的法务沟通。
- Granola 摘要显示 Malcolm 当时在 UAE，Craig 下周在 Macao。
- 法务需要确认客户侧应采用的 KYC compliance level。
- Travel Rule 实施仍待法务批准。
- 会议提到 Singapore MBS 与 UAE properties 使用本地 KYC 系统，并且只服务 existing customers，可作为实施边界参考。

## 待办事项

| 优先级 | 事项 | Owner / 参与方 | 状态 |
|---|---|---|---|
| P0 | 安排 Malcolm、Craig 与法务团队下周沟通 | 客户法务 / Craig | 待安排 |
| P0 | 完成 Hex Trust 合同最终文件 | 客户侧 / Hex Trust | 进行中 |
| P0 | 确认 KYC 最终路径：Hex Trust KYC、第三方 KYC、还是现有 gaming compliance team | 客户法务 / 合规团队 | 待决策 |
| P0 | Travel Rule 方案取得法务批准 | 客户法务 / Travel Rule vendor | 待审批 |
| P1 | 推进 KYC vendor 与客户侧直接合同谈判 | Benny 团队 / 客户侧 | 待推进 |
| P1 | 推进 Travel Rule vendor 与客户侧直接合同谈判 | Subnian 团队 / 客户侧 | 待推进 |
| P1 | 明确 Proof of Funds 与 wallet ownership validation 的产品和流程要求 | 产品 / 合规 / 技术 | 待细化 |
| P1 | 明确 refund address verification 与异常退款处理流程 | 产品 / 合规 / 技术 | 待细化 |
| P2 | 设置 Macao vendor pool 所需实体 | Granola 摘要写作 Hypervelocity | 待确认 |
| P2 | 建立 Hong Kong entity，支持未来合同安排 | 公司侧 | 待推进 |

## 对当前项目范围的影响

- KYC 模块可能发生范围调整：如果客户决定使用现有 gaming compliance team，则产品重点会从“第三方 KYC 供应商接入”转向“读取/复用客户既有 KYC 状态、补充 Proof of Funds、钱包所有权验证和例外处理”。
- Travel Rule 仍是上线阻塞项：需要客户法务批准具体 vendor 和字段/流程边界。
- 合同结构需要前置确认：Benny 团队和 Subnian 团队应与客户侧直接签约，我们的交付范围更可能是集成、编排和前端/接口开发。
- 3 到 4 周时间线应从“所有合同签署完成”开始计算，不应从本次会议日期直接起算。
- Refund / payout 流程需要纳入 wallet ownership 和合法地址校验，否则会成为合规审查缺口。

## 需确认的口径差异

- `Wings`：Granola 摘要多处使用该名称，需确认是否为 Operator / Macau operator / Operator 内部会员体系的转写或误写。
- `Hypervelocity`：Granola 摘要写作 Hypervelocity entity setup；项目记忆中商业化主体为 `Heypervelocity`，需确认是否为同一主体、拼写差异，或不同实体。
- `Hex Trust KYC integration`：需确认是使用 Hex Trust 自带 KYC/KYT 能力、第三方 KYC vendor，还是客户现有 gaming compliance team 的结果接入。

## 原始摘要要点（中文整理）

- Hex Trust 合约：已获推进许可，等待最终文件。
- 未完成事项：KYC 集成、Travel Rule 合规、接口开发。
- 外部团队：Benny 团队做 KYC，Subnian 团队做 Travel Rule，均需与客户直接签约。
- 法务关注：第三方 KYC provider 的可信性、是否可复用现有 gaming compliance team、现有会员 KYC 状态。
- 安全措施：Proof of Funds、wallet ownership validation、退款地址合法性。
- 时间线：合同签署后 3 到 4 周，包含测试和培训。
- Prototype 状态：MFA、注册、deposit page 已可用。
- 下一步：法务会议、Hex Trust 合同、vendor 合同、Macao vendor pool entity、Hong Kong entity。
