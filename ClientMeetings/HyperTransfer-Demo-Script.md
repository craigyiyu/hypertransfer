# HyperTransfer 客户演示脚本（v1）

> 用途：把系统按 **3 个主要流程** 逐页、逐步演示给客户。每步含【页面/路由】【操作】【讲给客户的话术（合规/业务价值）】【真实 / demo 标注】。
> 对应 `ProjectInfo/20260623_Hypertransfer_process_v1.md` 的三大阶段：**① 准入+开户 → ② 入金+结算 → ③ 退款**。
> 最后更新：2026-06-29。

---

## 0. 演示前准备（环境 + 账号）

### 0.1 演示环境（二选一）

| 选项 | 地址 | 含哪些 | 适用 |
|---|---|---|---|
| **A. 线上 h5（旧版）** | `https://h5.hypercypto.com` | 仅**客户端**流程（注册/KYC/入金/退款），**为本次新功能之前的版本** | 快速给客户看"客户端体验"；**不含**新的内部管理后台、真实入金编排、退款 wallet-picker |
| **B. 本地全量（新版，推荐）** | `http://localhost:3000` | **完整新系统**：客户端新流程 + `/casino-ops` 内部管理后台 4 面板 + 真实编排骨架 | 给客户演示**端到端 + 后台审批 + 合规闭环** |

> ⚠️ 本次会话新增的（入金编排后端、退款 wallet-picker、内部管理界面 4 块）**尚未部署到线上 h5**（HK 服务器未落点）。要完整演示请用**选项 B 本地**，或先部署。

### 0.2 本地起服务（选项 B）

```bash
cd hypertransfer-main
./dev.sh        # 一键起 后端(8000)+前端(3000)，并打印手机访问地址
# 或手动：backend/run.sh 起后端；另开终端 corepack pnpm dev 起前端
```

`.env`（仓库外不入 git）建议配：
- `HT_ADMIN_EMAIL` / `HT_ADMIN_PASSWORD` → 启动自动种一个 **admin 员工账号**（后台演示用，admin 角色可操作全部 4 面板）
- `SUMSUB_*` → 真实 Sumsub sandbox KYC（已可用）
- `HEXSAFE_*`（可选）→ 配了走**真实** Hex Safe sandbox 发址/到账/提现；不配则非生产**demo 占位**（流程照走，地址/到账为演示数据）

### 0.3 演示账号

| 角色 | 账号 | 说明 |
|---|---|---|
| **客户（patron）** | 走"流程一"现注册；或 `/login` 点 **Use Demo Account** / `demo.user@hypercrypto.com` `Demo@12345` | demo 账号无真实 KYC，适合**只看客户端 UI**；要喂后台真实队列请走真实注册+KYC |
| **员工（staff）** | `.env` 里 `HT_ADMIN_EMAIL`/`HT_ADMIN_PASSWORD` 种的 admin | **admin 一个账号即可操作全部后台面板**（后端 `require_role` admin 全通） |
| 要演示 **RBAC 分权** | 用 admin 在「员工管理」面板建 rm / marketing / compliance / custodian 账号，分别登录看"只看到本角色按钮" | 见流程一第 6 步 |

### 0.4 全局"真实 vs demo"边界（演示时如实说，建立信任）

- **真实**：Sumsub KYC、认证（邮箱 OTP / TOTP）、RBAC 角色守卫、退款"只退已验证原钱包"硬规则、（配凭据时）Hex Safe 发址/到账/提现。
- **demo（占位，结构已对接真实，待外部依赖）**：来源钱包 KYT（真实口径=Chainalysis/TRM 或 Hex Trust KYT 合同级）、Travel Rule（Sumsub 账户未激活 TR 产品）、Forex 兑法币（Hex Trust OTC 无 quote/order API）、Marker/Receipt。

---

## 流程一：准入 + 开户（ACCESS + ACCOUNT）

> 口径：**邀请制**（RM 提交→Marketing 审核→签发 single-use 链接）→ 客户邮箱 OTP 登录 → 可选 2FA → Sumsub KYC（6 个月有效）→ 账户 hold→active 解锁入金。

### A 段 · 后台（员工：邀请审核）

**1. 内部管理后台 — `/casino-ops` → 「Invitations」面板**（员工，admin/rm/marketing）
- 操作：在 **RM — submit patron** 输入客户邮箱（+姓名）→ Submit。
- 讲给客户："准入是**邀请制**，不是谁都能注册。客户经理（RM）先提交客户资料，进入审核队列。"
- 标注：✅ 真实（`/api/invitations`）

**2. 同面板 — Marketing 审核 + 签发链接**（员工，admin/marketing）
- 操作：队列里该申请 → **Approve** → **Issue link**，复制弹出的 **single-use + 72h** 邀请链接。
- 讲给客户："市场/合规复核通过后，系统签发一条**一次性、72 小时过期**的邀请链接，发到客户**申请时填的邮箱**——链接和邮箱绑定，杜绝转发滥用。"
- 标注：✅ 真实（链接形如 `/invite?token=...`）

### B 段 · 客户端（客户：注册 + KYC）

**3. 邀请落地 — `/invite?token=...`**（客户）
- 操作：打开邀请链接 → 校验 token + 邮箱。
- 讲给客户："客户点邮件里的链接进来，系统校验 token 与邮箱一致才放行。"
- 标注：✅ 真实

**4. 注册 — `/register`（邮箱 OTP 第一因子 + 设密码）**（客户）
- 操作：收**邮箱验证码**（demo 环境打到后端 console；生产走真实 SMTP）→ 填姓名+密码。
- 讲给客户："第一因子是**邮箱 OTP**（最终流程 v1 口径）。"
- 标注：✅ 真实（邮件 demo 态 console，生产 SMTP 已 env-gated 就绪）

**5. 双因子 — `/setup-2fa`（可选 TOTP）+ 恢复码**（客户）
- 操作：扫二维码绑定 Authenticator → 验码激活 → 保存一次性**恢复码**。
- 讲给客户："2FA **可选**但推荐；标准 TOTP，兼容 Google/Microsoft Authenticator、1Password、苹果密码；另发 10 个一次性恢复码防丢机。"
- 标注：✅ 真实

**6. KYC — `/kyc` → `/kyc-status`（Sumsub）**（客户）
- 操作：进入 Sumsub KYC（sandbox 上传测试件）→ 通过后状态从 **hold → active**，**入金入口解锁**。
- 讲给客户："KYC 走 **Sumsub**，**有效期 6 个月**；未通过/过期账户处于 **hold**，关键动作被**硬阻断**——KYC 不是走过场，是发地址/入金/退款的前置闸门。"
- 标注：✅ 真实（KYC=Sumsub；6 个月有效期 + 硬阻断已落地）

**7.（可选）RBAC 分权展示 — `/casino-ops` →「Staff Admin」面板**（员工，admin）
- 操作：admin 建一个 compliance（或 rm/marketing/custodian）账号 → 退出 → 用该账号登录 `/casino-ops`，展示"只看到本角色能操作的面板/按钮"。
- 讲给客户："5 类员工角色分权，前端按角色显隐、**后端 `require_role` 才是真守卫**——越权直接 403。"
- 标注：✅ 真实

---

## 流程二：入金 + 结算（DEPOSIT + SETTLEMENT）

> 口径：选网络+来源钱包 → Wallet Screening → **1 USDT 验证**（证明钱包控制权）→ 主入金 →（≥USD1k 触发 Travel Rule）→ 托管确认入 vault / Forex 兑法币 → **Marker 录回** → Receipt → Settlement。**仅 USDT**。

### A 段 · 客户端（客户：入金）

**1. 仪表盘 — `/dashboard` → New Deposit**（客户，已 active）
- 讲给客户："KYC 通过后入金入口才点得动。"

**2. 新建入金 — `/new-deposit`**（客户）
- 操作：选资产 **USDT**（仅此一种）→ 选网络（ERC-20 / TRC-20）→ 填预计金额。
- 讲给客户："Phase 1 **只接 USDT**；填到 **≥USD 1,000** 会提示触发 **Travel Rule**。"
- 标注：✅ 资产/阈值规则真实；后端建入金编排单（配置时真实，否则 demo）

**3. 来源钱包筛查 — `/wallet-screening`**（客户）
- 操作：填客户**来源钱包地址** → 提交筛查（演示可用 `bad...` 开头看拦截）。
- 讲给客户："发收款地址前先对**客户来源钱包**做 KYT 风险筛查，命中黑名单/制裁直接拦。"
- 标注：🟡 demo（server 端 mock adapter，真实口径 Chainalysis/TRM/Hex Trust KYT，已封装可换）

**4.（≥USD1k）Travel Rule — `/travel-rule`**（客户）
- 操作：填 FATF Travel Rule 信息 → 通过。
- 讲给客户："超阈值按 FATF 旅行规则收集发起方信息；走 Sumsub。"
- 标注：🟡 demo（Sumsub 账户未激活 TR 产品；代码已对接，激活即真实）

**5. 发收款地址 — `/deposit-address`**（客户）
- 操作：三闸门（KYC + 钱包 KYT + Travel Rule）全过 → 签发地址。
- 讲给客户："**只有三道合规闸门全绿才发地址**；地址按 vault×链固定（Hex Trust 稳定币地址不变）。"
- 标注：✅ 闸门逻辑真实；发址配 Hex Safe 走真实、否则 demo 占位

**6. 1 USDT 验证 + 主入金 — `/main-deposit`**（客户）
- 操作：先打 **1 USDT** 验证 → 系统确认到账（证明钱包控制权，**写入"已验证原钱包"**）→ 再打主入金 → 确认。
- 讲给客户："先 1 USDT 小额验证钱包控制权——**这步把这个钱包记成客户的'已验证原钱包'，退款时只能退回这里**。然后才打全额。"
- 标注：✅ 验证→写 verified_wallets 真实；到账确认配 Hex Safe 走真实、否则 demo

**7. 入金成功 — `/deposit-success`**（客户）
- 讲给客户："客户侧到此结束，看到入账与结算摘要。"

### B 段 · 后台（员工：处理入金 + 结算）

**8. 内部管理后台 — `/casino-ops` →「Deposit Queue」面板**（员工，compliance/ops/custodian）
- 操作：看入金队列（每单的 KYT/1USDT 验证/TR/地址状态）→ **Marker** 录回外部编号 → **Settle**（兑法币 + 生成 Receipt）。
- 讲给客户："运营在后台看到每笔入金的合规状态；国际市场部把外部 **Marker** 编号录回系统；托管确认后 settle（兑法币、出回执）。"
- 标注：✅ 队列/Marker 真实；Forex 兑法币 + Receipt = **demo**（Hex Trust OTC 无 API）

**9.（可选）真实托管面板 — `/casino-ops` →「Hex Safe — Live Custody」**（员工，配了 HEXSAFE_*）
- 操作：看真实 vault 列表、到账交易（轮询）、按链签发真实地址。
- 讲给客户："这块是**真接 Hex Trust sandbox**——真实 vault、真实发址、真实到账查询。"
- 标注：✅ 真实（需配凭据）

---

## 流程三：退款（RETURN）

> 口径（合规红线）：**只能退回客户此前已验证过的原钱包**，严禁输新地址；退款前重新 KYC + 原钱包 KYT + **管理层审批** + vault 余额校验 → 托管退回，Transfer ID ↔ Request ID 留痕。

### A 段 · 客户端（客户：发起退款）

**1. 发起退款 — `/deposit-success` 或 `/refund`**（客户）
- 操作：选退款原因。
- 讲给客户："客户在 APP 内自助发起退款。"

**2. 选退款钱包 — `/refund`（verified-wallet picker）**（客户）
- 操作：**从下拉/单选里挑一个"已验证原钱包"**——**没有自由输入地址框** → 提交。
- 讲给客户（重点）："这是合规红线。退款**只能退回客户此前在入金时验证过的原钱包**，界面上**根本没有让你输新地址的框**，杜绝资金被导向陌生地址。后端还会再校验这个钱包确属本人，否则直接拒。"
- 标注：✅ 真实（前后端双重落地：picker + 后端 walletId 必属本人，否则 400）

### B 段 · 后台（员工：审批 + 放款）

**3. 内部管理后台 — `/casino-ops` →「Refund Queue」面板**（员工，分权）
- 操作（按角色依次）：
  1. **compliance**：对原钱包做 **KYT screen**（Pass / Manual review / Reject）
  2. **management（compliance/admin）**：**Approve**（要求 KYC ok + KYT pass）
  3. **custodian**：**Execute payout** → 调 Hex Safe withdrawal 退回原钱包
- 讲给客户："退款是**人工分权闭环**：合规先重新筛查原钱包，管理层审批，最后托管执行放款；每步都有角色守卫和审计留痕，Transfer ID 关联 Request ID。"
- 标注：✅ 审批链/角色/留痕真实；execute 配 Hex Safe 走真实提现、否则如实提示"未配置凭据"（真实放款另需 funded vault + Hex Trust quorum）

---

## 附 A. 演示时强调的合规亮点（一句话版）

1. **邀请制准入** — 一次性 72h 链接绑邮箱，不是公开注册。
2. **KYC=Sumsub + 6 个月有效 + 硬阻断** — 过期/未过直接卡住关键动作。
3. **入金三闸门** — KYC + 来源钱包 KYT + Travel Rule 全绿才发地址。
4. **1 USDT 验证钱包控制权** — 并据此锁定"可退回的原钱包"。
5. **退款只退原钱包（红线）** — 界面无新地址输入框 + 后端归属校验。
6. **退款人工分权审批** — 合规筛查→管理层批→托管放款，全程留痕。
7. **RBAC 5 角色** — 前端显隐 + 后端 `require_role` 真守卫，越权 403。

## 附 B. 当前真实 / demo 一览（被问到就如实答）

| 能力 | 状态 | 切真实需要 |
|---|---|---|
| 认证（邮箱 OTP / TOTP / RBAC） | ✅ 真实 | — |
| KYC | ✅ 真实（Sumsub sandbox） | 生产 Sumsub 账户 |
| 邀请制 + 内部管理后台 4 面板 | ✅ 真实 | — |
| 退款"只退原钱包"红线 + 审批链 | ✅ 真实 | — |
| Hex Safe 发址 / 到账 / 提现 | ✅ 真实（配凭据时） | Hex Safe sandbox 凭据 + funded vault + quorum |
| 来源钱包 KYT | 🟡 demo | Chainalysis/TRM 或 Hex Trust KYT 合同端点 |
| Travel Rule | 🟡 demo | Sumsub 激活 TR 产品 |
| Forex 兑法币 / Marker / Receipt | 🟡 demo | Hex Trust 多为人工/无 API（按口径） |

---

*演示动线建议：先 admin 登录把后台 4 面板过一遍（让客户看到"运营/合规视角"），再用客户账号走一遍客户端三流程，每到一步回切后台看队列里实时出现的单据，体现"客户操作 → 后台合规闭环"的端到端。*
