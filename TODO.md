# VirtualAsset / HyperTransfer 项目级待办清单（TODO）

> 本文件是**项目级**滚动待办，区别于用户级 `~/.claude/todolist.md`（个人 / 跨项目每日待办）。
> 时间一律 CST（UTC+8）；相对时间转绝对日期 `YYYY-MM-DD（周X）`。
> 维护机制：每天（或每次进入本项目工作时）跟进更新——完成的标 ✅ 注完成日期，新增的追加，过期的调状态，并更新下方「最后更新」。
> 状态：⬜ 待办 / 🔄 进行中 / ❓ 待决策 / ⛔ 阻塞 / ✅ 已完成
>
> **最后更新：2026-06-29（周一）— 加决策项「我方是否代运营 Hex Trust 账号」**

---

> ## ▶ 下一步从这里继续（新会话入口）
> **②③④⑤⑥ + ①前端 已全部实现并验证（本批已直接 commit + 推送 main(按用户确认)）**：见 §「入金/退款流真实化 — 构建清单」逐项状态。
> 已落地：**②KYC 硬阻断**（`require_kyc` 挂 create/screen/issue/main）；**③入金编排后端**（`deposit_requests` 表 + `/api/deposits*` 状态机：create→screen→issue-address→confirm-test(1USDT→写 verified_wallets)→main + staff 队列/marker/settle + forex probe）；**③前端**（NewDeposit/WalletScreening/DepositAddress/MainDeposit backend-first + mock 回退）；**①前端**（RefundProcess 自由地址输入→**verified-wallet picker**，合规红线落地）；**④Forex**（探测端点 + demo 结算，无真实 OTC API 如实回报）；**⑤Marker/Receipt**（demo）；**⑥SMTP**（已 env-gated 真实化 + `.env.example` 补全）+ **迁移**（旧库迁移在副本上验证通过）。
> 验证：后端 TestClient 31/31 + 活动服务器 curl 全链路 deposit→refund 通过；前端 `tsc` + `vite build` 全绿。（浏览器可视化验证被 preview-MCP 沙箱 cwd 故障阻断，非代码问题。）
> **下一步（需外部依赖，本机无凭据无法做）**：①接 Hex Safe sandbox 真实凭据 → 把 issue-address / 1 USDT 轮询 / refund withdrawal 从 demo 切真实；②真实 Wallet KYT（Chainalysis/TRM 或 Hex Trust KYT 合同端点，现为 server 端 mock adapter 占位，已结构化可换）；③Sumsub 账户激活 Travel Rule 产品后切真实；④生产化（SMTP 真实中继、PostgreSQL 迁移、2FA 可选 + step-up）。
> 口径见 `AGENTS.md` 2026-06-28 release note + memory `tr-provider-sumsub`。

---

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
| ❓ | **决策：我方是否帮客户「运营」Hex Trust 托管账号**（代运营托管/审批操作 vs 客户自运营，我方仅软件编排）。影响职责/责任边界、牌照与合规暴露、商业模式（管理服务 vs 纯软件）、报价与人力。需商务+合规+客户三方拍板 | 商务 / 产品（Eason）/ 客户 | — | 用户 2026-06-29 |
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
| ✅ | 退款方向反转：只退历史已验证原钱包 + re-KYC/原钱包KYT + Management 审批 + vault 余额 gate（后端 commit `983ba99` + 前端 picker 本批；KYT 仍 staff 录入 mock） | 技术 | P0 |
| ⬜ | 2FA 改可选 + 入金/退款前 step-up 强制（2FA 可选已做；入金/退款 step-up 强制待接） | 技术 | P1 |
| ✅ | KYC 6 个月有效期 + 到期硬阻断（`require_kyc`/`user_kyc_ok` 查 `valid_until`，挂入金/退款关键动作；本批） | 技术 | P1 |
| ⬜ | 保留到账后 Transaction KYT（funds-dirty 分支） | 技术 | P1 |
| ⬜ | Marker 回录（外部编号只读）+ Forex 兑法币 + Receipt/Settlement 建模 | 技术 | P1 |
| ⬜ | 数据隔离：澳门 operator 角色只见 Marker+法币视图（随 RBAC） | 技术 | P1 |
| ✅ | 邀请审核界面：Marketing 在本系统"批准申请 + 签发链接"（single-use+72h）（`InvitationReviewPanel.tsx` 接 `invitationApi`，2026-06-28） | 技术 | P1 |
| ⬜ | 同步口径文档 AGENTS/CLAUDE/design.md（退款/TR/资产/认证/2FA） | 文档 | P0 |
| ❓ | 待客户确认：Forex 渠道 + 目标法币、Management 审批条件、TK Team/CFO 职责 | 客户 | P1 |

## 入金 / 退款流真实化 — 构建清单（2026-06-28 用户决策，本次主攻）

> 决策来源：用户 2026-06-28。**真实**=接 Hex Safe sandbox / Sumsub 真实 API；**demo**=本地 mock 即可。
> 已铺好的地基（已提交 main commit `983ba99`）：Hex Safe 客户端（发址/到账/提现/min_confirmations）+ 后端 `/api/hexsafe/*`（RBAC+审计+提现幂等持久化）+ casino-ops `HexSafeLivePanel`；Sumsub KYC 真实可用 + TR 后端代码已接（账户未激活 TR，止于 403）。
> 建议推进顺序：① 退款流（合规红线，现状相反）→ ② KYC 硬阻断 → ③ 客户入金接真实发址 → ④ Forex（先探端点）→ ⑤ Marker/Receipt(demo) → ⑥ SMTP/迁移收尾。

### 基础设施 / 收尾
| 状态 | 事项 | 真实/demo | 备注 |
|---|---|---|---|
| ✅ | **邮件投递接真实 SMTP**（`send_email` 已 env-gated：`SMTP_HOST` 配则真发，否则 console；`.env.example` 已补 `EMAIL_FROM`/`SMTP_*`） | 真实(env-gated) | 上线前填真实中继即可；2026-06-28 完成 |
| ✅ | 核实并迁移持久化 demo 库到新 schema | — | 在持久库**副本**上跑 `init_db()`：旧 phone-PK → user_id + 全部新表(含 `deposit_requests`) + `.bak` 备份，0 用户无损；持久库下次起后端自动迁移。2026-06-28 完成 |

### KYC — 完成未做完的部分（真实）
| 状态 | 事项 | 真实/demo | 备注 |
|---|---|---|---|
| ✅ | **发址/入金前硬阻断**：KYC approved 且未过期才放行 | 真实 | `require_kyc` 挂在 `/api/deposits` create/screen/issue-address/main（patron 编排层，非 staff `/api/hexsafe/*`）；2026-06-28 |
| ✅ | **KYC 6 个月到期硬阻断** | 真实 | `user_kyc_ok` 查 `valid_until`；TestClient 验证过期→403 |
| ✅ | hold→active 显式状态 | 真实 | 无独立 hold 列，KYC 有效性即闸门；`/api/deposits/eligibility` 返回 `accountState` active/hold |

### 入金流真实化
| 状态 | 事项 | 真实/demo | 备注 |
|---|---|---|---|
| 🟡 | **Wallet Screening**（现 server 端 mock adapter `screen_source_wallet`） | mock(可换) | ⚠️ Hex Safe sandbox 无文档化 screening/KYT 端点 + 本机无凭据无法探测；真实 KYT 口径=Chainalysis/TRM 或 Hex Trust KYT(合同级)。已封装成 server 端 adapter，接通仅换实现 |
| ✅/🟡 | **1 USDT 验证**（发址 + 确认到账 → 写 verified_wallets） | 真实(配置时)/demo | `confirm-test`：配 Hex Safe + txHash → `get_deposit_by_tx_hash` 核到账；否则非 prod demo 确认。均写 verified_wallets。轮询真实到账需凭据 |
| ✅/🟡 | 客户端 DepositAddress 接真实发址（替换随机假地址）+ 入金单编排 | 真实(配置时)/demo | `deposit_requests` 编排 + `issue-address` 调 `create_deposit_address`(配置时)，否则 demo 占位；前端 backend-first + mock 回退。注：v1 未强制 TK 前置审批(❓未决)，故未加该节点 |
| 🟡 | **Travel Rule：因 Sumsub 账户未激活 TR，仅做 demo 效果** | demo | 前端已有 mock 回退；账户激活后切真实（后端代码已就绪） |
| 🟡 | **Forex 兑法币** —— 探测无真实 OTC API，结算用 demo 汇率 | demo + 探测 | `/api/hexsafe/forex/probe`(只读端点探测 + 如实回报)；据 Hex Trust 口径 HT Markets OTC 无 quote/order API；`settle` 用 `DEPOSIT_FIAT_RATE` demo 兑换 |
| 🟡 | Int'l Marketing 签发 Marker + reference 录回 | **demo** | `/api/deposits/{id}/marker`(marketing 角色，外部编号只读录入) |
| 🟡 | Receipt → Settlement | **demo** | `/api/deposits/{id}/settle` → 生成 `receipt_ref` + 法币结算(demo) |

### 退款流（整体做好 —— 现状最弱，含合规红线）
| 状态 | 事项 | 真实/demo | 备注 |
|---|---|---|---|
| ✅ | **提交退款请求**：后端退款单端点 + 前端 wallet-picker | 后端真实 + 前端接真实 | `①后端`commit `983ba99` + `①前端`本批：RefundProcess 自由地址输入→verified-wallet picker |
| ✅ | 重新 KYC（6 个月有效期）校验 | 真实(本地 KYC 表) | `refund_create` 调 `user_kyc_ok`，不过则 `kyc_failed` |
| 🟡 | 重新 Wallet KYT | mock(可换) | `refund_screen` 由 compliance 录入决策；真实 KYT 同入金 wallet screening 待接 |
| ✅ | 管理层审批（后端端点 + 角色守卫 + 留痕） | 真实 | `refund_approve`(compliance/admin) 要求 kyc_ok + kyt pass + 审计 |
| ✅/🟡 | Vault 余额校验（不足挂起/通知 ops） | 真实(配置时) | `refund_execute` 调 `_hexsafe_vault_has_balance`(配置时)；sandbox 空 vault → insufficient_funds |
| ✅ | **只能退回原钱包（禁止输新地址；与历史已验证钱包比对）** | 真实 | ⚠️**合规红线落地**：后端 walletId 必属本人 verified_wallets(否则 400)；前端 picker 无自由输入。TestClient + 活动服务器 curl 双验证 |
| ✅/🟡 | Custodian 真实退款 + TransferID↔RequestID 留痕 | 真实(配置时) | `refund_execute` 调 `hexsafe withdrawal`(配置时) + `transfer_id↔id`；真实放行需 funded vault + Hex Safe quorum |

---

## 内部管理界面（staff 后台对接真实后端 — 2026-06-28）

> 后端 staff 端点均已就绪；本节是纯前端把 `/casino-ops` 从 mock 接到真实端点的对接工作。

| 状态 | 事项 | 备注 |
|---|---|---|
| ✅ | **退款队列审批**（compliance KYT screen → management approve → custodian execute，角色分权） | `components/RefundQueuePanel.tsx` 接真实 `/api/refunds*`，嵌入 `/casino-ops`；按 `useAuth` 角色显隐按钮，后端 require_role 实测守卫；TestClient 10/10。2026-06-28 |
| ✅ | **入金队列 + Marker/结算** | `components/DepositQueuePanel.tsx` 接 `/api/deposits` queue + `marker`(marketing/ops) + `settle`(custodian/ops, Forex demo)。2026-06-28 |
| ✅ | **邀请审核界面**（RM 提交 → Marketing 批准 → 签发 single-use+72h link） | `components/InvitationReviewPanel.tsx` 接 `invitationApi`(create/list/approve/reject/issue)，签发后展示 inviteLink；TestClient 邀请链验证。与 §最终流程 v1 改造表"邀请审核界面"同项(亦 ✅)。2026-06-28 |
| ✅ | **员工账号管理**（admin 开户 + 分配角色 + 返回 TOTP 绑定 QR） | `components/StaffAdminPanel.tsx` 接 `adminApi.createStaff`(admin 限定)。2026-06-28 |

## ✅ 已完成（近期）

- 2026-06-28 **内部管理界面·全部 4 块完成**（嵌入 `/casino-ops`，`components/ops-ui.tsx` 共用展示组件）：
  - 退款队列 `RefundQueuePanel`（`/api/refunds*`：screen/approve/reject/execute，角色守卫，execute 无凭据如实 toast；TestClient 10/10）
  - 入金队列 `DepositQueuePanel`（`/api/deposits` queue + marker + settle）
  - 邀请审核 `InvitationReviewPanel`（`invitationApi` create/list/approve/reject/issue + inviteLink 展示）
  - 员工管理 `StaffAdminPanel`（`adminApi.createStaff`，admin 限定，返回 TOTP 绑定 QR）
  - 全部按 `useAuth().user.roles` 显隐按钮 + 友好 403；tsc + vite build + TestClient（退款 10/10、邀请/员工 13/13）全绿；`lib/api.ts` 补 `depositApi.queue/marker/settle`
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
- 2026-06-28 **Hex Safe 集成地基（已提交 commit `983ba99`）**：客户端写端点（发址按 vault×链固定 / 提现 schema 验证到余额边界 / 到账查询 / min_confirmations）+ 后端 `/api/hexsafe/*` 7 路由（RBAC+审计+错误映射）+ 提现幂等持久化（TestClient 全绿）+ casino-ops `HexSafeLivePanel`（proxy 端到端验证）；查清到账监听=轮询（sandbox 无 webhook 注册 API）
- 2026-06-28 **Sumsub TR 后端代码已接**（`/api/sumsub/travel-rule/*`，端点/类型/签名实测正确）+ 前端 `TravelRule.tsx` 接真实并 mock 回退；⛔ **账户未激活 Travel Rule 产品**（403 "this type of check is not allowed"，需 Cockpit 激活，见 memory `tr-provider-sumsub`）
- 2026-06-28 决策：KYC+TR=Sumsub；本次入金/退款真实化构建清单见上（含 SMTP/KYC硬阻断/Wallet Screening+1USDT用HexSafe/Forex真实/Marker+Receipt仅demo/退款整体做好）
- 2026-06-28 **① 退款后端完成+TestClient 实测**：`verified_wallets`+`refund_requests` 表；`/api/refunds*` 端点（wallets/create/mine/queue/screen/approve/reject/execute）；**合规红线落地：退款只能退本人已验证原钱包(非本人 walletId→400)**；re-KYC 闸门(`user_kyc_ok`/`require_kyc`，②复用)；compliance screen+管理层 approve(角色守卫)；vault 余额校验(sandbox 0→insufficient_funds)；execute 调真实 hexsafe withdrawal + transfer_id↔request_id；全程 audit。（commit `983ba99`）
- 2026-06-28 **②③④⑤⑥ + ①前端 完成（本批已直接 commit + 推送 main(按用户确认)）**：
  - **②KYC 硬阻断**：`require_kyc` 挂 `/api/deposits` create/screen/issue-address/main；`user_kyc_ok` 查 approved + `valid_until`(6 个月)；`/api/deposits/eligibility` 返回 active/hold（hold→active = KYC 有效性，无独立列）。
  - **③入金编排后端**：`deposit_requests` 表 + 状态机 `created→screening_passed/failed→address_issued→verified→main_submitted→settled`；patron 端点 create/screen/issue-address/confirm-test(1USDT→写 `verified_wallets`)/main + staff 端点 queue/marker/settle；发址/1USDT 配 Hex Safe 走真实、否则非 prod demo 占位。
  - **③前端**：NewDeposit/WalletScreening/DepositAddress/MainDeposit backend-first + mock 回退（不破坏 demo）；`lib/api.ts` 加 `depositApi`/`refundApi`；DemoContext 加 `depositRequestId`。
  - **①前端**：RefundProcess 自由地址输入 → **verified-wallet picker**（后端 `refundApi.wallets()`，demo 回退=入金来源钱包），合规红线 UI 落地。
  - **④Forex**：`/api/hexsafe/forex/probe`（只读端点探测 + 如实回报无 OTC API）+ `settle` demo 兑换。
  - **⑤Marker/Receipt**：`marker`/`settle` demo 端点。
  - **⑥SMTP**：`send_email` 已 env-gated 真实化 + `.env.example` 补全；持久库迁移在副本验证通过。
  - 验证：后端 TestClient 31/31 + 活动服务器 curl 全链路 deposit→refund 通过；前端 `tsc` + `vite build` 全绿。（浏览器可视化被 preview-MCP 沙箱 cwd 故障阻断，非代码问题。）
