# HyperTransfer 端到端流程（最终版 v1）

> 来源：`ProjectInfo/20260623_Hypertransfer_process_v1.pptx`（用户 2026-06-23 提供，标注为"最终的流程"）
> 转换方式：markitdown 文本提取 + 人工重建（本机未装 LibreOffice，无法渲染图片）。
> 说明：原文件为流程图 / 泳道图，**箭头连线方向以原 PPT 为准**；本 md 按文本与业务逻辑重建，决策分支用 `→` 和 `No/Yes` 标注。
> 范围：one-page view，from invite approval to deposit settlement and refund。

---

## Slide 1 — End-to-end process diagram

分三大阶段块：**ACCESS + ACCOUNT** → **DEPOSIT + SETTLEMENT** → **RETURN（退款）**。

### A. ACCESS + ACCOUNT（准入 + 开户）

1. **Manager submits Patron details and email**（客户经理提交客户资料与邮箱发起）
2. **Internal & Int'l Marketing review request** → **Approved?**
   - No → reject or re-apply
   - Yes → 继续
3. **Access request** → 签发 **QR / link**（*single-use or time-limited；send it to patron email*）
4. **Patron login using application email and OTP**（**Email OTP**，用申请邮箱登录）
5. **Account setup**（Profile、password、**optional 2FA**）
6. **Sumsub KYC screening** → **KYC clear?**
   - No → account on hold
   - Yes → **Account moves from hold to active** → **Deposits enabled**
7. **KYC Status valid for 6 months**（KYC 有效期 6 个月）

> 关键词：邀请制（RM 发起）、邮箱 OTP、可选 2FA、Sumsub KYC、6 个月有效期、membership review。

### B. DEPOSIT + SETTLEMENT（入金 + 结算）

1. **Select network, input wallet address**（*USDT is the only acceptable asset* — **仅 USDT**）
2. **Wallet Screening**（*proof of wallet control*）→ **Wallet clear?**
3. **1 USDT verification**（1 USDT 验证打款，证明钱包控制权）
4. **Main deposit amount** → **Patron enters final amount**（客户输入最终金额）
5. **>= USD 1k?**
   - Yes → **collect Travel Rule info**（≥ USD 1,000 触发 Travel Rule）
   - No → 继续
6. **Custodian confirms; Move to vault / Forex order to Fiat account**（*Provided by HexTrust* — 托管确认后入 vault / 下 Forex 单兑法币）
7. **Int'l Marketing Issue Marker, input reference into HyperTransfer**（国际市场部签发 Marker，把 reference 录回 HyperTransfer）
8. **Receipt** → **Settlement**（回执 → 结算）

> 关键词：**仅 USDT**、wallet screening + 1 USDT 验证、**Travel Rule 阈值 USD 1,000**、HexTrust 托管确认入 vault、Forex 兑法币、**Marker** 录入。

### C. RETURN（退款 / 退回）

1. **Patron submit request in HyperTransfer** → **Refund request**
2. **KYC clear?**（Sumsub KYC screening，valid 6 months）
   - No → account on hold
3. **Wallet clear?**
   - No → compliance hold
4. **Approved?**（*Recommendation: By Management* — 管理层审批）
   - No → reject or re-apply
5. **Sufficient Fund in Vault?**
   - No → notify ops to deposit / hold
6. **Return funds**：**Fund can only be sent back to the original wallet address**（**只能退回原钱包地址**）
7. **Custodian sends to original wallet. Transfer ID saved against Request ID**（托管方退至原钱包，Transfer ID 关联 Request ID 留痕）

> 关键词：**强制原路退回原钱包**、退款前重新 KYT/KYC 筛查、**管理层审批**、vault 余额校验、Transfer ID ↔ Request ID 留痕。

---

## Slide 2 — Cross-functional swimlane（跨职能泳道）

四个阶段：**Phase 1 Access Approval** · **Phase 2 Secure Onboarding** · **Phase 3 Deposit and Settle** · **Phase 4 Refund and Return**

| 角色（Owner） | 定位 | Phase 1 准入 | Phase 2 开户 | Phase 3 入金结算 | Phase 4 退款 |
|---|---|---|---|---|---|
| **Patron** | Customer action | Enter email | Complete email OTP · Setup 2FA · Create account + KYC | Send wallet for screening · Send 1 USDT verification · Send main deposit · Track settlement (marker ref) | Request refund · Confirm original wallet · Track payment status |
| **Relationship Manager** | Access sponsor | Capture Patron details · Submit access request | No role | No role | No role |
| **HyperTransfer Platform** | System orchestration | Create time-limited QR/link · Bind to application email · Record audit trail · Match email to invitation · Send OTP | Gate KYC before deposits | Verify source wallet · Trigger Travel Rule at USD 1,000+ · Track receipt and settlement | Send refund request to approver · Show verified wallet only · Check refund eligibility · Re-screen wallet · Initiate transfer |
| **Int'l Marketing / Compliance / Ops** | Human review | Check membership status · Approve access request | Review KYC exceptions | Move Fund to Treasury Vault | Refund approves · Compliance clears risk alerts |
| **Custodian / Finance** | Asset control | No role | No role | Wallet Screening · API confirms receipt · Move Fund to Treasury Vault | Send payment as per instruction · Move fund between vault as per instruction |

> 注：泳道单元格按 markitdown 文本 + 业务逻辑归位，个别动作的精确所属阶段以原 PPT 为准。

---

## 从最终流程提炼的关键业务规则

| # | 规则 | 口径 |
|---|---|---|
| 1 | 准入为**邀请制** | RM 提交客户资料 → Internal & Int'l Marketing 审核 → 签发 single-use / time-limited QR/link 至客户邮箱 |
| 2 | 登录第一因子为 **Email OTP** | 用申请邮箱 + OTP 登录 |
| 3 | **2FA 可选** | Account setup 阶段 optional 2FA |
| 4 | **KYC = Sumsub，有效期 6 个月** | KYC clear 才解 hold；过期需复核 |
| 5 | **仅接受 USDT** | USDT is the only acceptable asset |
| 6 | 入金前 **Wallet Screening + 1 USDT 验证** | proof of wallet control |
| 7 | **Travel Rule 阈值 = USD 1,000** | ≥ USD 1k 收集 Travel Rule 信息 |
| 8 | 托管 = **HexTrust**，确认后入 vault / Forex 兑法币 | Custodian confirms; move to vault / forex order to fiat |
| 9 | **Marker** 由 Int'l Marketing 签发并录回系统 | issue marker, input reference |
| 10 | **退款强制原路退回原钱包** | fund can only be sent back to the original wallet address；Transfer ID ↔ Request ID |
| 11 | 退款需 **管理层审批 + 重新 KYC/KYT + vault 余额校验** | recommendation by Management |
| 12 | 多角色协同 | Patron / RM / Platform / Marketing·Compliance·Ops / Custodian·Finance |

---

## ⚠️ 与现有系统 / 既往口径的差异（供系统调整方案使用）

| 主题 | 最终流程 v1 | 现有系统 / 既往口径 | 差异 |
|---|---|---|---|
| 注册方式 | **邀请制**（RM 发起，邮箱收 QR/link） | 开放自助注册 | 🔴 重大 |
| 第一因子 OTP | **Email OTP** | 手机号 + 短信 OTP | 🔴 重大 |
| 2FA | **可选** | TOTP 强制 | 🟠 |
| 支持资产 | **仅 USDT** | USDT + USDC（ERC-20/TRC-20） | 🔴 收窄 |
| Travel Rule 阈值 | **USD 1,000** | `amount >= 8000` | 🔴 重大 |
| 退款方向 | **强制原路退回原钱包** | 客户认证会话确认新 destination（06-21 已实现） | 🔴 直接相反 |
| Marker / 法币结算 | Marker 签发 + Forex 兑法币 | 未建模（稳定币入 WTA 为主） | 🟠 新增 |
| KYC 有效期 | **6 个月** | 未建模 | 🟠 新增 |
| 角色体系 | 5 类角色泳道（RM / Marketing / Compliance / Ops / Custodian） | 单一用户 + casino-ops 后台，无 RM/邀请角色 | 🟠 |
