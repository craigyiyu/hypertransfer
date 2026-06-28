# VirtualAsset / HyperTransfer 项目级待办清单（TODO）

> 本文件是**项目级**滚动待办，区别于用户级 `~/.claude/todolist.md`（个人 / 跨项目每日待办）。
> 时间一律 CST（UTC+8）；相对时间转绝对日期 `YYYY-MM-DD（周X）`。
> 维护机制：每天（或每次进入本项目工作时）跟进更新——完成的标 ✅ 注完成日期，新增的追加，过期的调状态，并更新下方「最后更新」。
> 状态：⬜ 待办 / 🔄 进行中 / ❓ 待决策 / ⛔ 阻塞 / ✅ 已完成
>
> **最后更新：2026-06-28（周日）**

## 🎯 里程碑

| 里程碑 | 目标日期 | 状态 |
|---|---|---|
| Hex Trust sandbox API 联调启动 | 2026-06 下旬 | ⬜ 待办 |
| 双方 QA 测试启动（客户口径"7 月中旬"） | 2026-07-15（周三）前后 | ⬜ 待办 |

---

## P0 — 阻塞推进 / 必须先定

| 状态 | 事项 | 负责人 | 目标日期 | 来源 |
|---|---|---|---|---|
| ❓ | **退款方向口径对齐（三方冲突）**：客户要求"原路返回原钱包、严禁新地址" vs 现有产品"客户认证会话确认新 destination" vs Hex Trust"合规团队手动、无 API 退款信号"。需产品 + 合规拍板 | 产品 / 合规 | 2026-06-26（周五） | 客户会 + HT 会 |
| ⬜ | 向 Hex Trust 取得 **sandbox 账户信息**并启动 API 联调 | HT（发）/ 技术（测） | 2026-06 下旬 | HT 会 |
| 🔄 | 确认管理员 **Craig** 收到初始设置邮件并完成用户角色添加 | HT / Craig | — | HT 会 |
| ⬜ | 技术方发送**香港实体公司信息**供客户法务审核 | 技术方 | 本周 | 客户会 |
| ⬜ | 绘制**完整业务流程图** + 起草 **T&C 初稿** | 技术方 | QA 前 | 客户会 |
| 🔄 | 整理 / 推进 **Hex Trust 问题清单**（下午会已答一部分，见 P1 未答项） | 技术方 | 持续 | 客户会 + HT 会 |
| ⛔ | 获取并整理 **HT Q&A exercise 附件**（supported networks / gas fee / wallet arch / security & breach / confirmation policy & 通知 / Hex Safe API / reporting / access controls）——附件未到，阻塞 P1 多项 | 用户 / 技术 | ASAP | HT 补充邮件 |

## P1 — Hex Trust 仍待澄清（技术对接）

| 状态 | 事项 | 负责人 | 目标日期 | 来源 |
|---|---|---|---|---|
| ⬜ | API **auth / IP allowlist / key rotation** 机制 | 技术 / HT | sandbox 期 | HT 会未答 |
| ⬜ | **Webhook** 事件 / payload / signature / retry / idempotency；到账监听是 webhook 还是轮询 | 技术 / HT | sandbox 期 | HT 会未答 |
| ⬜ | 查询接口 schema（按 `txHash` / `addressId` / `transferId` / `vaultId`） | 技术 / HT | sandbox 期 | HT 会未答 |
| ⬜ | **Confirmation payload** 字段（`confirmationCount` / `requiredConfirmations` / finality）+ 到账通知机制（待 Q&A 附件确认） | 技术 / HT | sandbox 期 | HT 会 / 待附件 |
| ⬜ | **Travel Rule 平台责任边界**：港 Hex Trust Limited 合同下平台层是否仍不 hard-freeze pending TR（本次会议未讨论，重要缺口） | 合规 / HT | QA 前 | 两会均未闭环 |
| ⬜ | **Reconciliation** API / webhook / SFTP / monthly statement schema、时区、fee 字段 | 技术 / HT | QA 前 | HT 会未答 |
| ⬜ | supported networks / **gas fee 处理** / breach handling / reporting / access controls（以 Q&A 附件为准核对） | 技术 / HT | 附件到后 | 待附件 |

## P1 — 客户侧业务 / 合规决策

| 状态 | 事项 | 负责人 | 目标日期 | 来源 |
|---|---|---|---|---|
| ⬜ | 客户协调合规负责人 **Malcolm** 审核流程图与 T&C 草案 | 客户法务 | — | 客户会 |
| ⬜ | 客户确认 **TK Team 与 CFO** 在新流程中的职责 | 客户方 | — | 客户会 |
| ❓ | 决策：**邮箱注册 + Salesforce 背景查询 + 账户 6 个月有效期** 是否纳入产品（现有为手机号 + 短信 OTP） | 产品 / 合规 | — | 客户会 |
| ❓ | 决策：存款发址前增加 **TK Team 人工前置审批** 节点（现有 `canIssueAddress` 无人工审批） | 产品 / 合规 | — | 客户会 |
| ⬜ | 客户内部梳理**多签审批策略** + 各 Vault 交易门槛（高频低门槛 / 冷钱包高门槛） | 客户运营 | — | HT 会 |
| ⬜ | 建立即时通讯支持群组（Slack / Telegram / WhatsApp） | 双方 | — | HT 会 |

## P1 — 文档 / 交付准备

| 状态 | 事项 | 负责人 | 目标日期 | 来源 |
|---|---|---|---|---|
| ⬜ | **准备系统安全开发项目文档**（安全开发生命周期 / 安全设计 / 威胁建模 / 访问控制 / 数据加密 / breach 处理 等；呼应 HT 会 security & access controls、客户会 2FA + 数据库加密 + HTTPS + 备份） | Eason / 技术方 | — | 用户 2026-06-23 |

## P2 — 产品 / 代码评估（由会议引出，先评估不急改）

| 状态 | 事项 | 负责人 | 目标日期 | 来源 |
|---|---|---|---|---|
| ⬜ | 评估**存款地址固定（非 single-use）**对 `DepositAddress` / `voided` 逻辑的影响（HT：稳定币地址固定不变） | 技术 | — | HT 会 |
| ⬜ | 评估 **HT Markets OTC 高触人工（无 quote/order API）** 对 `casino-ops` / `treasury-ops.ts` 自动化建模的影响 | 技术 | — | HT 会 |
| ⬜ | 明确**多签审批在 Hex Trust APP 完成**后"我方编排 + HT 审批"的职责边界 | 产品 | — | HT 会 |
| ⬜ | 退款回执 / 对账获取方式设计（HT 无 API 退款信号，依赖邮件报告 / 人工） | 技术 / 产品 | — | HT 会 |
| ⬜ | **Marker ID / 法币结算 / 线下纸质凭证** 业务建模（澳门现场只见法币 + Marker ID） | 产品 | — | 客户会 |
| ⬜ | 确认部署落点 **阿里云香港节点**（现有部署文档为通用香港服务器 + SSH/rsync） | 技术 / 运维 | QA 前 | 客户会 |

---

## 最终流程 v1 改造（2026-06-23，决策已确认）

> 决策记录 + 详细方案见 `ProjectInfo/20260623-System-Adjustment-Plan-vs-Process-v1.md`；流程源文件 `ProjectInfo/20260623_Hypertransfer_process_v1.md`。推进顺序：RBAC 地基 → 越权修复 → 认证主路径 → KYC 有效期 → 退款反转 → Marker/Forex/结算（XL，最后）。

| 状态 | 事项 | 负责人 | 优先级 |
|---|---|---|---|
| ✅ | 资产收窄仅 USDT（前端禁用 USDC、保留代码） | 技术 | P0 |
| ✅ | Travel Rule 阈值改 USD 1,000（≈HKD 8,000，修 bug） | 技术 | P0 |
| ✅ | RBAC 地基：后端 user_type + user_roles + require_role + me 返回角色；前端 requireStaff 守卫 | 技术 | P0 |
| ✅ | `/casino-ops` 后台越权修复（staffGuard 重定向 patron；后端 require_role 实测 403） | 技术 | P0 |
| ✅ | 认证改造：邀请制 + Email OTP + user_id 主键重建（短信注册并存；hold→active KYC 闸门挪 PR④） | 技术 | P0 |
| ⬜ | 退款方向反转：只退历史已验证原钱包 + re-KYC/原钱包KYT + Management 审批 + vault 余额 gate（不足挂起等补） | 技术 | P0 |
| ⬜ | 2FA 改可选 + 入金/退款前 step-up 强制 | 技术 | P1 |
| ⬜ | KYC 6 个月有效期 + 到期硬阻断、必须重跑 Sumsub | 技术 | P1 |
| ⬜ | 保留到账后 Transaction KYT（funds-dirty 分支） | 技术 | P1 |
| ⬜ | Marker 回录（外部编号只读）+ Forex 兑法币 + Receipt/Settlement 建模 | 技术 | P1 |
| ⬜ | 数据隔离：澳门 operator 角色只见 Marker+法币视图（随 RBAC） | 技术 | P1 |
| ⬜ | 邀请审核界面：Marketing 在本系统"批准申请 + 签发链接"（single-use+72h） | 技术 | P1 |
| ⬜ | 同步口径文档 AGENTS/CLAUDE/design.md（退款/TR/资产/认证/2FA） | 文档 | P0 |
| ❓ | 待客户确认：Forex 渠道 + 目标法币、Management 审批条件、TK Team/CFO 职责 | 客户 | P1 |

## 入金 / 退款流真实化 — 构建清单（2026-06-28 用户决策，本次主攻）

> 决策来源：用户 2026-06-28。**真实**=接 Hex Safe sandbox / Sumsub 真实 API；**demo**=本地 mock 即可。
> 已铺好的地基（本会话，⚠️未提交）：Hex Safe 客户端（发址/到账/提现/min_confirmations）+ 后端 `/api/hexsafe/*`（RBAC+审计+提现幂等持久化）+ casino-ops `HexSafeLivePanel`；Sumsub KYC 真实可用 + TR 后端代码已接（账户未激活 TR，止于 403）。
> 建议推进顺序：① 退款流（合规红线，现状相反）→ ② KYC 硬阻断 → ③ 客户入金接真实发址 → ④ Forex（先探端点）→ ⑤ Marker/Receipt(demo) → ⑥ SMTP/迁移收尾。

### 基础设施 / 收尾
| 状态 | 事项 | 真实/demo | 备注 |
|---|---|---|---|
| ⬜ | **邮件投递接真实 SMTP**（现 `send_email` 仅 console 打印；`SMTP_*` env 已预留） | 真实(生产) | 邀请链接 + Email OTP 都依赖；上线前必接 |
| ⬜ | 核实并迁移持久化 demo 库到新 schema（invitations/user_id/totp_enabled）；现有 `hypertransfer_auth.db` 可能仍旧 schema | — | 审计旗标；新建库已 OK |

### KYC — 完成未做完的部分（真实）
| 状态 | 事项 | 真实/demo | 备注 |
|---|---|---|---|
| ⬜ | **发址/入金前硬阻断**：KYC approved 且未过期才放行（现仅角色守卫，无 KYC gate） | 真实 | 在 `/api/hexsafe/deposit-address` 等加 KYC `valid_until` 校验 |
| ⬜ | **KYC 6 个月到期硬阻断**（status 已有 expired 标记，但关键操作未卡） | 真实 | 关键操作前查过期 |
| ⬜ | hold→active 显式状态（users 表无 hold 字段，KYC 未过未显式 hold） | 真实 | |

### 入金流真实化
| 状态 | 事项 | 真实/demo | 备注 |
|---|---|---|---|
| ⬜ | **Wallet Screening 用 Hex Safe API**（现纯前端 mock `bad*`） | 真实(Hex Safe) | ⚠️ 先探测 sandbox 是否有 screening/KYT 端点 |
| ⬜ | **1 USDT 验证用 Hex Safe API**（发真实地址 + 轮询到账 1 USDT） | 真实(Hex Safe) | 复用 `create_deposit_address` + `list_transactions`/`get_deposit_by_tx_hash` |
| ⬜ | 客户端 DepositAddress 接真实发址（替换随机假地址）——需「入金单 + TK 审批后 staff 发址」编排 | 真实(Hex Safe) | 后端发址已就绪；缺 patron 入金单 + 审批编排 |
| 🟡 | **Travel Rule：因 Sumsub 账户未激活 TR，仅做 demo 效果** | demo | 前端已有 mock 回退；账户激活后切真实（后端代码已就绪） |
| ⬜ | **Forex 兑法币（USDT→HKD/USD 结算法币账户）用真实 Hex Safe sandbox API** | 真实(Hex Safe) | ⚠️ **先探测 sandbox 是否有 forex/conversion/OTC 端点**；无则如实回报再定 |
| 🟡 | Int'l Marketing 签发 Marker + reference 录回 | **demo** | 仅 demo（外部编号录入展示） |
| 🟡 | Receipt → Settlement | **demo** | 仅 demo |

### 退款流（整体做好 —— 现状最弱，含合规红线）
| 状态 | 事项 | 真实/demo | 备注 |
|---|---|---|---|
| ⬜ | **提交退款请求：补齐前端 mock + 后端退款单端点**（现前端 mock 不完整、无后端、不持久化） | 前端 mock 补全 + 后端真实 | |
| ⬜ | 重新 KYC（6 个月有效期）校验 | 真实(Sumsub) | 现退款流完全不查 |
| ⬜ | 重新 Wallet KYT | 真实(Hex Safe，同 wallet screening) | 现 mock |
| ⬜ | 管理层审批（后端端点 + 角色守卫 + 留痕） | 真实 | 现仅前端按钮 mock |
| ⬜ | Vault 余额校验（不足挂起/通知 ops） | 真实(Hex Safe vaults) | 现无 |
| ⬜ | **只能退回原钱包（禁止输新地址；与历史已验证钱包比对）** | 真实 | ⚠️**合规红线，现状相反**（前端允许输任意地址） |
| ⬜ | Custodian 真实退款（调 `hexsafe withdrawal`）+ TransferID↔RequestID 留痕 | 真实(Hex Safe) | 现 mock txHash，未调真实 withdrawal |

---

## ✅ 已完成（近期）

- 2026-06-22 整理客户会议纪要 `ClientMeetings/2026-06-22-Crypto-Deposit-Refund-Process-and-Compliance-Architecture.md`
- 2026-06-22 整理 Hex Trust 会议纪要 `ClientMeetings/2026-06-22-Hex-Trust-Custody-Platform-Onboarding-and-Compliance.md`
- 2026-06-23 最终流程 v1 归档 + 转 md + 多智能体系统调整方案 + 决策记录（`ProjectInfo/20260623_Hypertransfer_process_v1.*`、`20260623-System-Adjustment-Plan-vs-Process-v1.md`）
- 2026-06-23 代码快改：仅 USDT（禁用 USDC）+ Travel Rule 阈值 USD 1,000，typecheck 通过
- 2026-06-23 认证+RBAC 数据模型设计（`ProjectInfo/20260623-Auth-RBAC-Data-Model-Design.md`）
- 2026-06-23 PR① 认证+RBAC 地基：user_type/user_roles、require_role、`/casino-ops` staffGuard 越权修复、admin env 种子、demo-staff 旁路（typecheck + 后端 smoke 实测 403/401 通过）
- 2026-06-24 PR②-1 合并：users 主键 phone→user_id(uuid) 重建迁移（幂等 + .bak + 行数校验，独立复核全绿）
- 2026-06-24 PR②-2 合并：邀请制 + Email OTP + 前端 /invite（TestClient 42 断言 + 对抗安全审计无 blocker）
- 2026-06-24 PR #5/#6/#7 全部 squash 合并 main（71ed4fe / 2171cad / 8e42478）
- 2026-06-27 Hex Safe sandbox 客户端 commit 71c394b（ES256 JWT，GET 端点实测）
- 2026-06-28 **Hex Safe 集成地基（⚠️未提交，在工作区）**：客户端写端点（发址按 vault×链固定 / 提现 schema 验证到余额边界 / 到账查询 / min_confirmations）+ 后端 `/api/hexsafe/*` 7 路由（RBAC+审计+错误映射）+ 提现幂等持久化（TestClient 全绿）+ casino-ops `HexSafeLivePanel`（proxy 端到端验证）；查清到账监听=轮询（sandbox 无 webhook 注册 API）
- 2026-06-28 **Sumsub TR 后端代码已接**（`/api/sumsub/travel-rule/*`，端点/类型/签名实测正确）+ 前端 `TravelRule.tsx` 接真实并 mock 回退；⛔ **账户未激活 Travel Rule 产品**（403 "this type of check is not allowed"，需 Cockpit 激活，见 memory `tr-provider-sumsub`）
- 2026-06-28 决策：KYC+TR=Sumsub；本次入金/退款真实化构建清单见上（含 SMTP/KYC硬阻断/Wallet Screening+1USDT用HexSafe/Forex真实/Marker+Receipt仅demo/退款整体做好）
- 2026-06-28 **① 退款后端完成+TestClient 实测（⚠️未提交）**：`verified_wallets`+`refund_requests` 表；`/api/refunds*` 端点（wallets/create/mine/queue/screen/approve/reject/execute）；**合规红线落地：退款只能退本人已验证原钱包(非本人 walletId→400)**；re-KYC 闸门(`user_kyc_ok`/`require_kyc`，②复用)；compliance screen+管理层 approve(角色守卫)；vault 余额校验(sandbox 0→insufficient_funds)；execute 调真实 hexsafe withdrawal + transfer_id↔request_id；全程 audit。**剩：① 前端 RefundProcess.tsx 改 wallet-picker 接真实(去掉自由地址输入)；与 ③ 耦合(verified_wallets 由入金流写入)**
