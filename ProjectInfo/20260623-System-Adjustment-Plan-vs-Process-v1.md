# 系统调整方案 — 对照《HyperTransfer 最终流程 v1》

> 生成日期：2026-06-23（周二）
> 输入：`ProjectInfo/20260623_Hypertransfer_process_v1.md`（最终流程 v1）+ 现有代码库 + 2026-06-22 两份会议纪要
> 方法：多智能体只读审计（6 子系统并行 gap 分析 + 综合），未改动任何产品代码。
> 状态：**5 项关键决策 + 衍生口径已于 2026-06-23 由用户确认（见〇 决策记录）**；#3 仅 USDT、#4 TR=USD1,000 两项快改已落地代码并通过 typecheck，其余按工作流推进。

---

## 〇、决策记录（2026-06-23 已确认）

> 用户 2026-06-23 拍板结果，作为后续改造的**权威口径**，本文件其余章节据此执行。

### 已锁定
1. **退款地址**：线上 APP 只能退回客户此前在 APP 提供并验证过的来源地址**之一**（从历史已验证地址中选，**不能输入新地址**）；退款前必须**再次合规确认**（KYC + 原钱包 KYT）。原钱包失效等异常**走线下，不在 APP scope**，APP 内不设换地址例外通道。
2. **注册**：邀请制 + Email OTP，两者都做；短信保留为可选（找回 / step-up）；邮箱为主标识（phone→email 分阶段迁移）。
3. **准入审核**：Marketing 在**外部系统**做背景尽调；本系统只负责"批准申请 + 签发邀请链接"的界面动作。
4. **邀请链接**：single-use + **72h 限时**。
5. **角色**：**真实权限账户（RBAC）**；RM / Marketing / Compliance / Ops / Custodian 为**不同独立角色**；支持一人兼多角色（多对多）。
6. **员工登录**：员工不走邀请制，管理员后台预置账号，邮箱 + 密码 + **强制 2FA**。
7. **资产**：**仅 USDT**（USDC 前端禁用、保留代码备 Phase 2）。✅ 已落地代码
8. **Travel Rule 阈值**：**USD 1,000（≈ HKD 8,000）**，修正此前把港币门槛当美元的 bug。✅ 已落地代码
9. **2FA**：默认可选 + **入金 / 退款前 step-up 强制**。
10. **KYC**：Sumsub，**6 个月有效期**；到期硬阻断，必须重新申请 KYC（重跑完整 Sumsub）。
11. **1 USDT 验证**：恰好 1 USDT，必须来自**已通过筛查的 source wallet**（钱包控制权证明）；该笔可退。
12. **到账后 Transaction KYT**：保留 funds-dirty 分支（入金前筛查不替代到账后筛查；尽量采用 Hex Trust / Chainalysis 结果）。
13. **退款侧 Travel Rule**：自动复用入金时已收集的 TR 信息，不让客户重填；是否正式提交以原钱包是否 VASP 托管 + Hex Trust / 合规要求为准（对客户无感）。
14. **Marker**：外部博彩系统给编号，本系统**只读回录**。
15. **vault 余额不足**：退款请求**挂起等补仓**（不拒绝）。
16. **TK Team 前置审批**：建模为可选内部审批角色，触发条件 / SLA 待客户会确认。
17. **数据隔离**：用 RBAC 落地——澳门 operator 角色只见 Marker + 法币结算视图，看不到 wallet / crypto / vault 明细。

### 待澄清（不阻塞当前快改）
- **Forex 兑法币**：另有渠道（非现有 HT Markets OTC mock），渠道细节 + 目标法币（HKD?）"之后再说"，暂以 HKD + mock 占位。
- **Management 审批条件**：暂不细化。
- TK Team / CFO 具体职责、跨境数据隔离细节 —— 待 06-22 客户会后续。

---

## 一、总览

最终流程 v1 **不是微调，而是对入口、合规闸门、退款方向的结构性重写**：

- 准入：开放自助注册 → **邀请制**（RM 发起 → Int'l Marketing 审核 → 邮箱单次/限时 link）
- 第一因子：手机短信 OTP → **Email OTP**
- 2FA：强制 TOTP → **可选**
- 账户：引入 KYC 驱动的 **hold→active 服务端状态机**，KYC 增 **6 个月有效期**
- 退款：**彻底反转** —— 从"客户确认新地址"改为"**强制原路退回原始来源钱包**"（Hex Trust 口径为人工无 API）
- 资产：USDT+USDC → **仅 USDT**
- Travel Rule 阈值：**8000 → 1000**（收紧 8 倍）
- 新增概念：**Marker 签发/录回、Forex 兑法币结算、5 类角色泳道、RBAC、后台越权隔离**

改造重心集中在 **hypertransfer-main 产品端**（React + FastAPI + SQLite）；**Operator Demo 建议保持独立旧口径，仅加注释**。绝大多数 blocker 集中在**认证账户体系、退款方向、角色隔离**三条线，且互相依赖（邀请制依赖角色模型；退款 gate 依赖 KYC 有效期；后台隔离依赖角色字段）——需先打地基再铺业务。当前全处 mock/demo 阶段（Hex Trust 真实 API 未接），纯逻辑风险可控。

---

## 二、必须先拍板的 5 个关键决策

> 这些决策工作量大、部分不可逆，**建议 2026-06-26（周五）前定**，再动代码。每条附 workflow 的推荐。

### 决策 1 — 退款方向（最高优先 / 合规核心）
- **冲突**：最终流程 v1 + 06-22 客户会 + Hex Trust 会三方一致要求"**只能原路退回原钱包**"；但现有 `refund-process.ts` / `RefundProcess.tsx` + AGENTS.md/CLAUDE.md 全按"客户确认新 destination"建模（理由是 CEX pooled wallet 风险）。方向完全相反。Hex Trust 退款为**人工无 API**。
- **选项**：① 完全改强制原路退回，删新地址输入 ② **原路退回为默认 + 合规审批例外通道**（原钱包失效/被盗/pooled）③ 维持现状（不推荐）
- **推荐：选项 ②** —— 默认原路退回满足客户与监管口径；pooled wallet/原钱包失效是真实风险,例外走 Management+Compliance 双签留痕;Transfer ID↔Request ID 绑定作为人工指令的审计闭环。

### 决策 2 — 注册/准入方式（工作量最大之一）
- **冲突**：最终流程要邀请制 + Email OTP；现有开放自助注册 + 短信 OTP，`users` 表以 phone 为主键。
- **选项**：① 全量切换（主标识 phone→email，短信彻底移除）② **分阶段并存**（先并存 email-OTP + 邀请实体，主标识保留 phone 兼容，短信留作可选 step-up）③ 维持现状（不推荐）
- **推荐：选项 ②** —— phone→email 主键迁移牵动全部认证端点，SQLite 一次性硬迁移风险高;先跑通邀请制主路径,主标识迁移后续收口。邀请 link 建议 single-use + 72h 过期。

### 决策 3 — 支持资产收窄至仅 USDT
- **冲突**：最终流程"USDT only"；现有 `SUPPORTED_PHASE_ONE_ASSETS=[USDT,USDC]`。
- **选项**：① 彻底删 USDC ② **前端禁用 USDC + 保留代码**（Phase 2 备用）③ 维持（不推荐）
- **推荐：选项 ②** —— 收窄必须做,但 Phase 2 大概率恢复 USDC,删码损失复用;前端禁用 + 文案收口即可。需业务确认"仅 USDT"是否 Phase 1 最终决定。

### 决策 4 — Travel Rule 阈值 8000 → 1000
- **冲突**：最终流程 PPT 要 1000；现有 8000（来源 Hex Trust 36 问澄清 PDF）。两个权威来源冲突。
- **选项**：① **改 1000（以最终流程为最新口径）** ② 保持 8000（以澄清 PDF 为准）③ 暂缓
- **推荐：选项 ①** —— 最终流程是三方最新一致口径,时间晚于澄清 PDF;改动集中(`compliance.ts` 一个常量 + `MainDeposit` 一处文案)。文档注明旧口径来源;Operator Demo 保持 8000 加注释。

### 决策 5 — 2FA 强制 → 可选
- **冲突**：最终流程列 2FA optional；现有注册即强制 TOTP。放宽会降低资金场景安全等级。
- **选项**：① 全量改可选 ② **默认可选 + 入金/退款前 step-up 强制** ③ 保留强制（安全最高，但与流程冲突）
- **推荐：选项 ②** —— 满足 account setup 阶段低摩擦,又在资金动作前强制 2FA;恢复码仅启用 TOTP 时签发。**须经合规/风控确认**再落地。

---

## 三、改造工作流（Workstreams）

| 工作流 | 优先级 | 工作量 | 摘要 | 主要依赖 |
|---|---|---|---|---|
| 认证与账户体系（邀请制 + Email OTP + 状态机） | P0 | XL | 入口改邀请制、第一因子改 Email OTP、引入 KYC 驱动 hold→active | 邮件通道选型；共用角色/invitation 模型；主标识迁移建议并存先行 |
| 角色权限与后台隔离（RBAC + 5 泳道 + maker-checker） | P0 | XL | 建 5 类角色 RBAC、修 `/casino-ops` 越权、审批升 maker-checker | **地基，须最先做**；前端守卫必须配后端端点级校验 |
| 入金与结算（仅 USDT + TR 1000 + Marker/Forex/Receipt） | P0 | L | 资产/阈值快改 + Marker 签发录回 + Forex 兑法币 + Settlement 状态机 | Marker/Forex 跨客户端与后台两层；Forex 目标币种(HKD?)待确认 |
| 退款（原路退回 + 三闸门 + Management 审批） | P0 | L | 方向反转 + re-KYC + 原钱包 KYT 复筛 + vault 余额 gate | 依赖 KYC 6 个月有效期；Hex Trust 人工无 API |
| KYC（Sumsub 6 个月有效期 + 复核 + on_hold） | P1 | L | 增有效期/到期复核，KYC approved 作激活与入金/退款双闸门 | 入金/退款双闸门依赖；基准时间/时区需统一 |
| 文档口径同步（AGENTS/CLAUDE/TODO + Operator 注释） | P0 | M | 修正退款方向/TR 阈值/仅 USDT/认证方式矛盾，补"v1 新增需求 vs 现状" | 决策拍板后回写；文档不应领先于代码 |

### 各工作流关键改动点（文件级）

**认证与账户体系**
- 后端 `invitations` 表（token / patron_email 绑定 / single_use / expires_at / status：草稿→提交→审核→签发→消费→过期）+ `audit_trail` 表 + RM 提交 / Marketing 审核 / 签发 / 校验端点（`backend/server.py`）
- 邮件发送适配器（仿 `send_sms`）+ email-OTP 签发/校验端点；注册改"邀请 token + 申请邮箱 + Email OTP"；主标识 phone→email 分阶段
- `users.status` 扩为 invited/onboarding/on_hold/active/suspended，激活解耦 TOTP，改由 KYC approved 驱动；`ProtectedRoute`/`AuthContext` 读 status 前置入金校验
- 前端 `Landing` 移除开放 Register CTA 改邀请落地页；`Register.tsx` 改邮箱+Email OTP；`Login`/`api.ts`/`App.tsx` 配合
- 2FA 改 optional（`totp_enabled` + Setup2FA 跳过 + 登录条件跳过）；补齐缺失的 `RecoveryCodes.tsx`

**角色权限与后台隔离**
- 后端 `users` 加 role/roles + 会话/me 返回角色 + **服务端中间件按角色校验后台端点**（防越权根基）
- 前端 `AuthUser`/`demo-auth`/`AuthContext` 加 role 与 `hasRole`；`requireRole` 守卫，`/casino-ops`、`/treasury-controls` 仅 staff 可访问，Patron 重定向
- `CasinoOpsPortal`（660 行）按 5 类角色职能分区显隐（先分区后抽组件）
- `treasury-ops.ts` `requiredRole` 从展示字符串升为可校验角色；`approveAndSettleOtc` 拆 approve+settle 两步记发起/审批人；refund 分离 Management 批准 vs Custodian 广播

**入金与结算**
- `compliance.ts`：`SUPPORTED_PHASE_ONE_ASSETS=[USDT]`、`TRAVEL_RULE_THRESHOLD_USD` 8000→1000；`MainDeposit.tsx` 硬编码文案改引用常量
- 1 USDT 验证常量化 + 来源钱包一致性校验占位
- `DemoState` 加 markerReference/forexOrder/settlementReceipt；新建 `settlement.ts`（forex order mock + receipt + settlement 状态机：custodian_confirmed→moved_to_vault→forex_ordered→marker_issued→settled）
- Marker 录入归后台角色，客户端 `DepositSuccess` 只读展示 marker ref + 法币结算金额

**退款**
- 重构 `RefundRequest`：移除可写 destinationAddress，新增只读 originalSourceWallet（来自原入金 `state.sourceWallet`）
- `RefundProcess.tsx` 移除新地址输入与 Use Demo Wallet（约行 233-269），改只读展示原钱包 + Confirm；步骤改 申请→KYC复核→原钱包KYT复筛→Management审批→Vault校验→Custodian原路退回
- 三道 gate：re-KYC + 原钱包 KYT 复筛 + Sufficient Fund in Vault；`RefundStatus` 枚举重定义；`broadcastRefundPayout` 记录 Transfer ID↔Request ID

**KYC**
- `sumsub_kyc_applications` 加 approved_at/valid_until(=GREEN+180d)；新增 expired 派生态
- `lib/kyc-status.ts` 枚举加 expired/on_hold/manual_review，对 expired/on_hold 返回 canDeposit=false
- `KYC.tsx` approved 后展示 Valid until；Compliance 角色预留 KYC exception 复核队列

---

## 四、推荐推进顺序

0. **决策前置（2026-06-26 前）**：5 个关键决策交业务+合规拍板（退款方向、注册方式、仅 USDT、TR 阈值、2FA），尤其退款方向与认证方式不可逆，必须先定。
1. **地基**：后端角色模型（`users.role` + 中间件 + me 返回）+ 前端 role 字段与 `requireRole` ——邀请制/后台隔离/maker-checker 的共同根因。
2. **快改 blocker（与 1 并行）**：资产收窄仅 USDT + TR 阈值 8000→1000 + 文档口径同步——改动小、风险低、立即对齐，可先进 QA。
3. **后台越权修复**：`/casino-ops` 路由级 + 服务端角色隔离，Patron 不可达（安全 blocker）。
4. **认证主路径**：邀请实体 + Email OTP 并存 + hold→active 状态机 + 前端邀请落地页/Register 改造。
5. **KYC 有效期**：Sumsub 6 个月 + expired/on_hold（退款/入金双闸门依赖）。
6. **退款方向反转**：原路退回 + 三道 gate + Management 审批。
7. **结算新建模（XL，最后）**：Marker/Forex/Receipt-Settlement + CasinoOps 角色拆分 + maker-checker；Hex Trust sandbox 未就绪则先 mock 进 QA。

**7 月中旬 QA 必达范围建议**：第 2/3 步（快改 + 越权修复）+ 第 4 步认证主路径 + 第 5/6 步退款 gate。第 7 步 Marker/Forex/Settlement 与 CasinoOps 大拆分,若 Hex Trust sandbox 未就绪,先以 mock + 角色分区进 QA,真实 API 待 sandbox/正式合同。

---

## 五、主要风险

- **退款方向反转是资金安全核心**：文档与代码若不同步会产生新不一致；Hex Trust 人工无 API，Transfer ID↔Request ID 留痕缺失则审计断链。
- **主标识 phone→email 迁移**牵动全部认证端点，SQLite 一次性硬迁移易破坏现有 demo/旁路账号 → 并存先行。
- **2FA 改可选**未经合规确认即放宽 = 风控漏洞 → 保留入金/退款 step-up 强制。
- **前端角色守卫仅 UX 层**，不配后端端点校验则越权未真正消除。
- **KYC 6 个月基准时间/时区**算错会在双闸门误放/误拦真实资金。
- **TR 阈值来源冲突**（澄清 PDF 8000 vs 最终流程 1000）未定优先级直接改 design.md 会与 Hex Trust 合同口径打架；降 8 倍后绝大多数入金触发 TR，需确认 Hex Safe TR 提交容量。
- **Hex Trust 稳定币地址固定**（06-22 会）与现有 single-use/voided 假设冲突，发址逻辑可能需重构，依赖 sandbox 材料，存在 QA 前材料未就绪的进度风险。
- **CasinoOps 660 行按 5 角色拆分（XL）** + RefundStatus 枚举牵连多页徽章/disabled 判断，遗漏会渲染 Unknown 或放行错误状态。
- **Marker/Forex 法币结算**属博彩业务侧、跨境数据隔离敏感,需待客户确认 TK Team/CFO 职责后细化,过早建模可能返工。

---

## 六、需同步更新的文档（决策拍板后）

- `AGENTS.md` —— 退款方向、TR 阈值、支持资产、认证方式标注，补"最终流程 v1 新增需求 vs 现状"，Release Notes 标产品代码待改造。
- `CLAUDE.md` —— §4.2/§4.4c TR 阈值与资产、§4.4b 认证口径、§4.4c 退款方向、§5 边界补 v1 并声明 Operator Demo 不跟随、§4.3 术语表 single-use vs 地址固定待核。
- `TODO.md` —— P0 退款方向拍板(2026-06-26)、P1 认证改造与 TK Team 前置审批、P2 Marker/Forex/地址固定及代码改造项。
- `ProjectInfo/design.md` —— TR 阈值/仅 USDT/退款方向/邀请制等监管口径变更须先核对再回写。
- `src/domain/{state-machine,types}.ts`、`components/refund-pad-app.tsx` —— 加注释声明 Operator Demo 保持独立旧口径。
- `hypertransfer-main/AUTH_INTEGRATION.md` —— 认证架构口径同步。
