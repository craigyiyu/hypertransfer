# 第三方服务成本估算 — HyperTransfer

> 内部参考文档 · 2026-05-25
>
> 货币：所有金额以 **USD 计**
>
> 用途：HyperTransfer 客户在采购我们的开发服务**之外**，需要自行采购的第三方服务清单与成本估算
>
> 典型场景：客户首年预期 5,000 个 B2C 终端用户 + 50 个客户内部员工 + 月均 50,000 笔交易

---

## 一、第三方服务全景

HyperTransfer 是技术服务商，自身不持有以下服务的牌照或资源。客户在使用 HyperTransfer 平台时，需要单独采购以下 6 类外部服务：

| 类别 | 必需性 | 客户自采年费区间（USD） |
|---|---|---|
| 1. KYC 身份验证 | 必需 | 5,000–30,000 |
| 2. KYT 链上钱包筛查 | 必需 | 15,000–270,000 |
| 3. FATF Travel Rule | 必需 | 0–45,000 |
| 4. MFA 身份认证 | 必需 | 2,000–13,000 |
| 5. Hex Trust 托管 API | 必需 | 50,000–150,000 |
| 6. 云基础设施 + 监控 + SMS/Email | 必需 | 14,000–40,000 |
| **客户自采服务年成本合计** | | **86,000–548,000** |

---

## 二、KYC 身份验证

### 2.1 推荐供应商对比

| 供应商 | 每次验证 | 月最低承诺 | 实施费 | 5K 验证/年总成本 | 最适合 |
|---|---|---|---|---|---|
| **Sumsub Compliance**（含 AML + Travel Rule）⭐推荐 | USD 1.85 | USD 299 | 无 | **~13,000** | 跨境 VASP、亚洲市场、需要 Travel Rule 一站式 |
| Sumsub Basic | USD 1.35 | USD 149 | 无 | ~8,500 | 仅基础 KYC，无 AML |
| Veriff | USD 0.80–2.20 | 无 | 低 | 5,000–11,000 | 强反欺诈、自助快速接入 |
| Onfido（Entrust 旗下） | USD 1.50–3.50 | USD 2,500+/月 | USD 5,000–40,000 | 30,000+ | 大型企业、欧洲/英国市场 |
| Jumio | USD 1.80–3.80 | USD 2,000+/月 | USD 5,000–50,000 | 25,000+ | 美国市场、政府/银行客户 |

### 2.2 推荐配置

**Sumsub Compliance Plan**。理由：
- 单一供应商同时覆盖 KYC + AML + Travel Rule + 交易监控
- 集成成本最低（一套 SDK 即可）
- 亚洲市场支持完善（含中文 OCR、香港 HKID 识别）
- crypto 行业份额最大

**年成本估算（5,000 用户）**：

| 项目 | USD |
|---|---|
| 基础验证 5,000 × USD 1.85 | 9,250 |
| 月最低承诺 USD 299 × 12 | 3,588（已含在验证费内，按更高者计） |
| AML 持续监控 USD 0.08 × 5,000 × 12 | 4,800 |
| **首年总计** | **~13,000–14,000** |

---

## 三、KYT 链上钱包筛查

### 3.1 推荐供应商对比

| 供应商 | 中型 CASP 年费（USD） | 单座位价 | 特点 | 最适合 |
|---|---|---|---|---|
| **TRM Labs** ⭐推荐 | **65,000–160,000** | — | USDT/USDC 归因最深、Solana/Tron 优势、价格最低 | 中小型 VASP、稳定币流量大 |
| Elliptic | 85,000–195,000 | — | 欧洲监管关系最好、MiCA 友好 | 欧洲市场为主 |
| Chainalysis KYT | 130,000–270,000 | USD 21,000/座位/年 | 行业标杆、Reactor 调查工具最强 | 大型机构、需要侦查能力 |
| Chainalysis KYT（小型双座位） | 42,000 起 | USD 21,000/座位 | 仅基础筛查 | 小型 VASP 入门 |
| Crystal Intelligence | 15,000–40,000 | — | 中小型友好、330+ 链覆盖 | 预算敏感的中小 VASP |
| Merkle Science | 15,000–40,000 | — | 主流链 + DeFi 覆盖 | 中等规模 |

### 3.2 推荐配置

**TRM Labs**。理由：
- 稳定币流量归因优势直接匹配目标客户（OTC desk、Travel Rule 重点都是 USDT/USDC）
- 价格比 Chainalysis 低 30%+
- 支持 190+ 链，覆盖广
- 已集成 Notabene/Veriscope，Travel Rule 数据交换更顺

**HyperTransfer 需要双层 KYT**：

| 层 | 调用场景 | 月调用量估算（5K 用户） |
|---|---|---|
| Pre-deposit | 客户提交 source wallet 时 | ~5,000 次/月 |
| Post-arrival | Hex Trust 检测到入金后 | ~5,000 次/月 |
| **合计** | | **~10,000 次/月 = 120,000 次/年** |

**年成本估算**：

| 配置 | USD |
|---|---|
| TRM Labs KYT API + 预筛查 + 到账后筛查（中量级） | **~80,000** |
| Chainalysis KYT 双座位（如果选 Chainalysis） | 42,000–100,000 |

---

## 四、FATF Travel Rule

### 4.1 供应商对比

| 供应商 | 年费（USD） | 模型 | 特点 |
|---|---|---|---|
| **Notabene SafeTransact-Rise** ⭐冷启动 | **0** | 免费版 | 月发送上限 USD 10K，接收无限 |
| **Sumsub Travel Rule** ⭐推荐 | **0**（已含在 Sumsub Compliance Plan 中） | 一体化 | 与 KYC/KYB/Transaction Monitoring 同平台 |
| Notabene 企业版 | 24,000（基础） / 45,000（企业） | SaaS 路由器 | 多协议互操作、165+ VASP 网络、Notabene Flow 稳定币付款 |
| Global Travel Rule | 询价 | 单一集成 | 已接入全球前 10 大交易所中 6 家（Binance/OKX/Bybit/Gate.io/Bitget/BingX） |
| TRP（开源） | 0（自部署） + 维护成本 | 去中心化 | 隐私性最高、零供应商绑定 |
| Sygna | 询价（年费 + 一次性接入费） | API 联盟 | 含分析 + 钱包筛查 |
| TRISA | 会员费 | PKI 权威 | 托管方友好、审计回执完整 |

### 4.2 推荐配置

**第一年用 Sumsub Travel Rule**（与 KYC 捆绑，零增量成本），客户量大或对手方网络需求升级后再切 Notabene。

| 阶段 | 配置 | 年成本（USD） |
|---|---|---|
| 第 1 年（< USD 1M 交易量） | Sumsub Travel Rule（含在 KYC 中） | **0** |
| 第 2 年（> USD 10M 交易量） | Notabene 企业版 | 24,000–45,000 |

---

## 五、MFA 身份认证

### 5.1 场景与方案对比

**场景**：5,000 个 B2C 终端用户 + 客户内部 50 个员工。

| 方案 | 客户端 MFA（5K MAU） | 员工端 MFA（50 人） | 首年总成本（USD） | 评价 |
|---|---|---|---|---|
| **方案 A**：自建（TOTP + Twilio SMS） | 已含在 HyperTransfer Item 09 开发中 | 同左 | **~2,000**（仅 SMS 费） | 最低成本，但失去现成厂商背书 |
| **方案 B**：Google Identity Platform + Microsoft Entra ⭐推荐 | 50,000 MAU 免费 = 0 | Microsoft Entra ID P1: USD 6/人/月 × 50 = USD 3,600 | **~3,600** | 性价比最高 |
| 方案 C：Auth0 B2C + 自建员工端 | Auth0 B2C Essentials USD 35/月（500 MAU 起）= USD 420/年；扩展到 1,000 MAU 后 USD 240/月 = USD 2,880/年 | 自建 | ~3,000 | 客户端有大牌背书 |
| 方案 D：Okta 全套（客户端 Auth0 + 员工端 Okta Workforce） | Auth0 B2C Professional USD 2,880/年 | Okta Workforce Essentials USD 17/人/月 × 50 = **USD 10,200/年** | **~13,000** | 最贵，最强企业品牌 |

### 5.2 主流供应商定价参考

| 供应商 | 模式 | 起步价 | 完整生产价 |
|---|---|---|---|
| **Okta Workforce**（员工端） | 按人/月，年付，USD 1,500 年合同最低 | USD 6/人/月（Starter） | USD 17/人/月（Essentials，含 MFA）|
| **Auth0 B2C**（客户端，Okta 旗下） | 按 MAU | USD 35/月（500 MAU） | USD 240/月（1K MAU）|
| **Auth0 B2B**（客户端，企业账号） | 按 MAU | USD 150/月（500 MAU） | USD 800/月（1K MAU）|
| **Google Identity Platform** | 按 MAU + 短信费 | 50K MAU 免费 | USD 0.0055/MAU 后 |
| **Microsoft Entra ID（前 Azure AD）** | 按人/月 | USD 6/人/月（P1） | USD 9/人/月（P2，含条件访问） |
| **AWS Cognito** | 按 MAU | 50K MAU 免费 | USD 0.0055/MAU 后 |

### 5.3 推荐方案

**方案 B**（Google + Microsoft Entra）。理由：
- 客户端 5K MAU 完全在 Google 免费额度内
- 员工端 Microsoft Entra ID 性价比最高，且与企业 IT 兼容性最好
- 如客户坚持 Okta 品牌，给出方案 D 作为升级选项

---

## 六、Hex Trust 托管 API

### 6.1 服务范围

| 类别 | 服务内容 |
|---|---|
| Custody | 单次地址签发、私钥保管、vault 管理 |
| Transaction Monitoring | Webhook + 交易状态 API |
| Travel Rule Integration | 支持 Hex Safe Travel Rule endpoint |
| Sweep | 资金从 deposit collection 转 WTA vault |
| Withdrawal | 出金交易 + 多方审批 |

### 6.2 定价区间

Hex Trust 不公开定价，需直接询价。基于行业惯例：

| 业务规模 | 估算年费（USD） |
|---|---|
| 小型（单 vault，月交易 < 1,000 笔） | 30,000–50,000 |
| 中型（多 vault，月交易 1,000–10,000 笔）⭐ HyperTransfer 客户场景 | **50,000–150,000** |
| 大型（专属 vault 集群，月交易 > 10,000 笔） | 150,000+ |

通常按"基础年费 + 按 vault 数收费 + 按月交易量阶梯计费"。

### 6.3 备选方案

| 供应商 | 特点 | 价格区间 |
|---|---|---|
| **Hex Trust** ⭐主选 | 香港 TCSP + 新加坡 MPI + Dubai VARA，亚洲深度合作 | USD 50,000–150,000/年 |
| BitGo | 美国背景，全球覆盖 | USD 50,000–200,000/年 |
| Fireblocks | 机构托管 + 策略引擎 + 支付网络，市占率最大 | USD 100,000–500,000/年（一般有最低承诺） |

---

## 七、云基础设施与运维

### 7.1 推荐配置（中型部署，AWS）

| 服务 | 用途 | 估算月费（USD） |
|---|---|---|
| RDS PostgreSQL（db.r6g.xlarge） | 主数据库 | 350 |
| RDS 只读副本 | 报表查询 | 200 |
| EC2（应用服务器，2 × t3.large） | API 服务 | 120 |
| S3 + CloudFront | KYC 文档存储 + CDN | 150 |
| Application Load Balancer | | 25 |
| API Gateway | | 50 |
| CloudWatch + 日志 | 监控 | 80 |
| 数据传输（出站流量） | | 100 |
| 备份与快照 | | 50 |
| **月小计** | | **~1,125** |
| **年小计** | | **~13,500** |

### 7.2 监控与运维

| 服务 | 用途 | 年费（USD） |
|---|---|---|
| Sentry（Team） | 错误监控 | 312 |
| Better Uptime（Solo） | 可用性监控 | 240 |
| Datadog（可选，更专业） | APM | 1,500+ |

### 7.3 通信服务

| 服务 | 估算月用量 | 年费（USD） |
|---|---|---|
| Twilio SMS（USD 0.05/条） | ~10,000 条/年 OTP + 状态推送 | **500–2,000** |
| SendGrid（Essentials 50K 邮件/月） | ~100,000 封/年 | **100–500** |

### 7.4 推荐总额

| 类别 | 年费（USD） |
|---|---|
| AWS 云（中型部署） | 13,500–24,000 |
| Sentry + Better Uptime | 600 |
| SMS（Twilio） | 1,500 |
| Email（SendGrid） | 300 |
| **小计** | **~16,000–26,500** |

---

## 八、完整成本汇总表（典型客户首年 TCO）

| 项目 | 由谁出 | USD |
|---|---|---|
| **HyperTransfer 一次性开发费** | 客户付 Heypervelocity | **146,250** |
| HyperTransfer 年维护费（10%） | 客户付 Heypervelocity | 14,625 |
| **Heypervelocity 收入小计** | | **160,875** |
| KYC（Sumsub Compliance + Travel Rule） | 客户自采 | 13,000 |
| KYT（TRM Labs） | 客户自采 | 80,000 |
| MFA（Google + Microsoft Entra，推荐方案） | 客户自采 | 3,600 |
| Hex Trust 托管 API | 客户自采 | 80,000 |
| 云基础设施（AWS 中型） | 客户自采 | 20,000 |
| SMS + Email + 监控 | 客户自采 | 2,400 |
| **第三方服务小计（客户自采）** | | **~199,000** |
| **客户首年总持有成本 TCO** | | **~360,000** |

---

## 九、给客户的成本沟通话术

### 9.1 三档配置方案

为不同预算客户提供三档：

| 配置 | 适用场景 | 年第三方成本（USD） |
|---|---|---|
| **Conservative**（精简版） | 月交易 < USD 500K、< 1,000 用户 | **70,000–100,000** |
| **Recommended**（推荐配置） | 月交易 USD 1–10M、5,000 用户 | **190,000–220,000** |
| **Premium**（旗舰版） | 月交易 > USD 10M、> 10,000 用户 | **300,000–500,000+** |

### 9.2 Conservative 配置详情

| 项目 | 供应商 | USD/年 |
|---|---|---|
| KYC | Sumsub Basic | 8,500 |
| KYT | Crystal Intelligence | 20,000 |
| Travel Rule | Notabene Rise（免费） | 0 |
| MFA | 自建 + Twilio SMS | 2,000 |
| Hex Trust | 小型方案 | 35,000 |
| 云 + 监控 + 通信 | AWS 小型 | 10,000 |
| **合计** | | **~75,500** |

### 9.3 Premium 配置详情

| 项目 | 供应商 | USD/年 |
|---|---|---|
| KYC | Sumsub Compliance Enterprise | 30,000 |
| KYT | Chainalysis KYT + Reactor | 200,000 |
| Travel Rule | Notabene 企业版 | 45,000 |
| MFA | Okta 全套 | 13,000 |
| Hex Trust | 大型方案 | 200,000 |
| 云 + 监控 + 通信 | AWS 大型 + Datadog | 40,000 |
| **合计** | | **~528,000** |

---

## 十、Heypervelocity 的代采购机会

为客户提供"一站式服务"的机会，每个供应商谈批量折扣后赚取价差或佣金：

| 类型 | 价值 |
|---|---|
| 转售佣金 | 各供应商 partner program 通常给 10%–20% reseller commission |
| 批量折扣 | 谈到 5+ 客户后可拿到 enterprise 价（节省 20%–40%） |
| 价差 | 以企业价采购，按 list price 卖给客户，价差留在自己手里 |

**潜在年化代采购收入**（10 个客户规模）：

| 项目 | 客户自采均价（USD） | 转售毛利率 | 单客户年化毛利（USD） | 10 客户年化（USD） |
|---|---|---|---|---|
| KYC | 13,000 | 15% | 1,950 | 19,500 |
| KYT | 80,000 | 10% | 8,000 | 80,000 |
| MFA | 3,600 | 10% | 360 | 3,600 |
| Hex Trust | 80,000 | 15% | 12,000 | 120,000 |
| 云基础设施 | 20,000 | 30%（AWS reseller） | 6,000 | 60,000 |
| **合计** | | | **~28,310/客户** | **~283,100** |

**Heypervelocity 通过整合采购，每年可额外创造 USD 280K+ 收入**，且客户成本不变甚至降低。

---

*文档更新日期：2026-05-25*
*维护者：陈亦玮 / Eason Chen*
