# HyperTransfer · 香港公司商业方案

> 内部文档 · 2026-05-24
>
> 基于 HyperTransfer 产品在港成立公司，面向企业客户提供虚拟资产合规入金与法币结算服务。

---

## 一、产品定位

HyperTransfer 不是交易所，也不是钱包。它是：

> **企业级虚拟资产入金合规编排系统（Crypto Deposit Compliance Orchestration）**
> 帮助需要接受加密货币的企业，把 KYC → KYT → Travel Rule → 托管地址 → 链上监听 → 合规清算 这一整套流程合规地跑通。

客户自己不是交易所——他们是**需要收取虚拟资产的传统企业或新兴金融机构**。

---

## 二、市场时机

| 信号 | 数据 |
|---|---|
| 2026 年新法案 | FSTB + SFC 正在提交 AMLO 修订草案，新增 VA Dealing、VA Custody、VA Advisory、VA Management **四类牌照**，所有现有和新参与者**必须申牌**，无过渡期安排 |
| 稳定币发牌 | 2026 年 4 月 HKMA 批出首批两张牌照：**汇丰银行（HSBC）** + **Anchorpoint Financial（渣打 + HKT + Animoca Brands 合资）**，后者发行 **HKDAP**（港元 1:1 稳定币） |
| SFC 已发牌 VATP | **13 家**持牌交易平台（HashKey、OSL、HKVAX、HKbitEX、VDX、Bullish 等） |
| SFC 申牌中 | **37 家**正在申请（含 Crypto.com、Matrixport HK、WhaleFin、Bybit 等） |
| HashKey 托管规模 | HKD 200 亿+，机构客户 100+，涵盖券商、银行、支付、资管 |
| 澳门博彩回暖 | 2026 Q1 全澳 GGR 同比 +14% 至 HKD 640 亿，访客 1,120 万 |
| 奢侈酒店先例 | Capella Hotel Group 已在新加坡/马尔代夫接受 BTC/ETH/USDT/USDC（通过 dtcpay） |
| OTC Desk 合规压力 | 2026 新法覆盖所有 OTC 交易商，无过渡期，必须持牌才能继续运营 |

**关键洞察**：新法案要求**所有** VA 参与者合规，大量传统企业第一次面临"我需要 KYT/Travel Rule/托管对接"的问题，但他们不会自己建——这就是市场。

---

## 三、目标客户（六类）

| # | 客户类型 | 痛点 | HyperTransfer 的价值 | 客单价估算 | 获客难度 |
|---|---|---|---|---|---|
| **T1** | **博彩/综合度假村** | 高净值客户要求加密入金，但监管严格（澳门 DICJ 禁止赌场直接处理 VA）；合规技术能力为零 | 合规的"非赌场实体"加密入金通道（如通过 HK 子公司酒店/零售侧收取） | $150K–$300K | 高 |
| **T2** | **OTC Desk** | 2026 新法要求所有 OTC 交易商持牌，持牌条件包括 KYT、Travel Rule、审计；很多小型 OTC desk 靠 Excel 手工操作 | 现成的 KYT + Travel Rule + 审计日志 + Hex Safe 托管对接 | $80K–$150K | 中 |
| **T3** | **持牌/申牌 VATP 交易所** | 大平台自建系统，但二三线持牌/申牌平台缺工程资源 | 白标或模块化部署：KYT adapter、Travel Rule 提交、存款状态机 | $100K–$200K | 中 |
| **T4** | **奢侈酒店/零售** | Capella 已在新加坡用 dtcpay 收加密货币；HK/Macau 五星酒店有相同需求但还没做 | 客户端 H5 收款页 + 后端合规编排 | $80K–$120K | 低 |
| **T5** | **家族办公室/财富管理** | 高净值客户要把加密资产入账到托管结构，缺合规通道；2026 新法覆盖 VA Management | KYC → KYT → Hex Safe 托管入账全流程 | $100K–$150K | 中 |
| **T6** | **稳定币发行方/支付公司** | 首批牌照刚发，需要合规入出金前端 + Travel Rule 实现 | 入金 H5 + API adapter 层 | $120K–$200K | 中高 |

### OTC Desk 具体案例

| 公司 | 位置 | 规模 | 说明 |
|---|---|---|---|
| ETH Pro / Crypto Pro (Bitvast) | 尖沙咀新港中心 | 日均 10M+ USDT | 香港最知名 ETH OTC 专营店，有实体店面 |
| Genesis Block | 湾仔/铜锣湾 | — | 早期 Bitcoin ATM 起家，后转 OTC desk |
| OSL Digital | 中环 | HKEX 上市公司旗下 | SFC 持牌 VATP + OTC block trading |
| HKVAX | 中环 | SFC 持牌 | VATP + OTC brokerage + 托管 |
| Matrixport HK | — | SFC 申请中 | 吴忌寒旗下，OTC + 结构化产品 |
| Crypto.com (Foris DAX HK) | — | SFC 申请中 | 全球 OTC desk + 香港本地团队 |
| Wintermute Asia | — | 独立监管实体 | 全球最大 OTC/做市商之一，亚洲分支 |
| Cumberland (DRW) | 芝加哥为主 + 亚洲覆盖 | TradFi 背景 | 机构 OTC desk |

香港 OTC desk 估计 50–100 家（上环/铜锣湾/尖沙咀集中），触达渠道：行业活动（TOKEN2049 HK、FinTech Week）、Telegram/WhatsApp 群、SFC 申牌名单。

---

## 四、获客策略（按优先级）

### 策略 1：用 Wynn 做案例，横扫博彩/酒店（T1 + T4）

| 步骤 | 动作 |
|---|---|
| 包装案例 | 制作 1-pager：「永利虚拟资产入金合规系统 — 内部演示已验证，end-to-end 6 步流程」（脱敏，用"Top-6 IR Operator in Macau"） |
| 触达名单 | Galaxy（刚开 Capella Macau）、SJM Holdings（Grand Lisboa）、Melco（Studio City）、Sands China — 共 5 家特许经营商 |
| 入口人 | 每家 IR 的 Treasury / CFO / CIO 或 VIP Host 负责人 |
| 定价 | $150K 起 + 二期运营后台 $100K–$200K |

Galaxy 2026 年 4 月刚开 Capella at Galaxy Macau，Francis Lui 明确强调"top percentile VIP guests"——这个客群和加密货币持有者高度重叠。

### 策略 2：打 OTC Desk 法规驱动需求（T2）

| 步骤 | 动作 |
|---|---|
| 时间窗口 | 2026 年法案提交 LegCo → 通过后所有 OTC Desk 必须持牌 |
| 包装 | 「HyperTransfer Compliance Suite — 帮你达到 SFC VA Dealing 牌照的系统要求」 |
| 触达 | 行业活动 + 实体扫街（上环/铜锣湾/尖沙咀）+ Telegram/WhatsApp 群 + SFC 申牌名单 |
| 定价 | $80K–$120K |

优势：数量大、决策链短、**法规驱动 = 必须买**。

### 策略 3：做 HashKey / HKVAX 生态的 ISV 合作伙伴（T3）

| 步骤 | 动作 |
|---|---|
| 逻辑 | HashKey Omnibus 已对接 100+ 机构客户，这些机构需要自己的前端入金页 |
| 动作 | 联系 HashKey BD 团队，提出做「Omnibus Partner — Client-Facing Deposit UI」 |
| 价值 | 帮 HashKey 解决"最后一公里"，HashKey 帮你带客户 |

### 策略 4：对接稳定币发行方（T6）

| 步骤 | 动作 |
|---|---|
| 时机 | HSBC 和 Anchorpoint/渣打 已获首批稳定币发行牌照，HKDAP 预计 2026 下半年上线 |
| 价值 | HyperTransfer 支持 HKDAP 作为新入金资产；Anchorpoint 股东 Animoca Brands 和 HKT 各有大量 B2C 场景 |
| 触达 | 通过 Hex Trust 关系链接触渣打/Anchorpoint 团队 |

---

## 五、竞争格局

| 竞品 | 定位 | HyperTransfer 的差异 |
|---|---|---|
| Chainalysis / TRM / Elliptic | 只做 KYT（筛查），不做入金流程、不做 UI、不做托管对接 | 全链路：KYT 只是其中一个 adapter |
| dtcpay | 支付网关（收加密→转法币），新加坡 MPI 牌照；面向零售商户 POS/QR 小额场景 | HyperTransfer 做大额 B2B 合规入金（KYT/Travel Rule/审计），层次完全不同；可互补 |
| Notabene / Sygna | 专做 Travel Rule 消息协议 | Travel Rule adapter 可以接他们的 API，互补关系 |
| Fireblocks / BitGo | 托管基础设施（类似 Hex Safe） | 不同层——HyperTransfer 是应用层，他们是基础设施层 |
| Hex Trust / Hex Safe | 托管方 | **合作关系**——帮 Hex Trust 客户做前端 + 合规编排 |

**真正的竞争对手**：客户自己用 Excel 手工做合规 + 找外包从零建。HyperTransfer 的优势是**产品已经存在 + 有真实客户验证**。

---

## 六、Hex Trust 牌照与合作关系

Hex Trust 已持有完整牌照矩阵：

| 地区 | 牌照 |
|---|---|
| **香港** | Trust Company 注册（《信托条例》）+ **TCSP 牌照**（AMLO） |
| **新加坡** | **MPI 牌照**（MAS 主要支付机构，2025 年 3 月获批） |
| **迪拜** | VARA 注册 |
| **法国 + 意大利** | 当地注册 |
| **安全审计** | SOC 1 Type 2 + SOC 2 Type 2 + CSA STAR Level 2（2026 年 3 月确认） |

HyperTransfer 与 Hex Trust 的关系：**应用层 + 托管层分工**。客户不需要自己持有托管牌照，资产托管由 Hex Trust 承担，HyperTransfer 提供应用层和合规编排层。

### 什么是 TCSP？

**TCSP = Trust or Company Service Provider（信托或公司服务提供者）**，是 AMLO 下的一类牌照，由公司注册处发出。凡是代客户持有/管理资产、提供信托服务、公司注册/秘书服务的机构都需要。

Hex Trust 目前用 TCSP 牌照在香港合法托管客户私钥。2026 新法案通过后，预计会申请专项 VA Custody 牌照。

---

## 七、VA Custody 牌照要求（2026 草案）

| 要求 | 数字 |
|---|---|
| **牌照全称** | VA Custodian Service Provider Licence |
| **法律依据** | AMLO (Cap. 615) 修订 |
| **监管机构** | SFC（主监管）+ HKMA（对银行/SVF 前线监管） |
| **核心定义** | 以业务方式保管使客户虚拟资产可转移的工具（即私钥） |
| **最低实缴资本** | **HK$1,000 万** |
| **最低流动资本** | **HK$300 万** |
| **申牌费（估算）** | ≥ HK$129,730/年 |
| **技术中立** | MPC、HSM 等技术方案均可 |
| **申请时间** | 法案通过后才能正式申请；目前接受预申请接触（fintech@sfc.hk） |

**结论**：HK$1,000 万资本门槛过高，初期不适合申请。让 Hex Trust 做托管是正确选择。

---

## 八、牌照路线图

| 阶段 | 时间 | 牌照 | 资本要求 | 作用 |
|---|---|---|---|---|
| **Phase 1（现在）** | 立刻 | **无需牌照** | 无 | 纯技术服务商：卖 HyperTransfer 软件，托管交给 Hex Trust |
| **Phase 2（6–12 个月）** | 2026 H2 | **MSO（货币服务经营者）** | 低（申请费约 HK$11,600，无硬性最低资本） | 合法做法币兑换结算，打通"加密 → HKD/USD"最后一步 |
| **Phase 3（12–24 个月）** | 2027 | **VA Dealing 牌照** | HK$500 万实缴 | 自己做 OTC 兑换，不再依赖第三方 broker |
| **Phase 4（可选，3 年后）** | 2028+ | **VA Custody 牌照** | HK$1,000 万实缴 | 自己托管客户私钥，不依赖 Hex Trust |

### 各牌照说明

- **MSO（Money Service Operator）**：香港海关管理，门槛最低，2–4 个月审批，持牌后可合法做加密 ↔ 法币兑换
- **VA Dealing**：2026 新法下的交易商牌照，覆盖 OTC、block trading、向港人营销 VA 产品；HK$500 万实缴
- **VA Custody**：托管牌照，HK$1,000 万实缴；Hex Trust 已走此路径，初期无需重复投入
- **VA Management / VA Advisory**：资产管理和投顾牌照，**与 HyperTransfer 业务无关，不建议申请**

---

## 九、完整 B2B 业务模型

### 系统架构

```
企业客户（博彩/OTC/酒店/VASP）有加密货币需要入账
        ↓
[HyperTransfer 平台]
KYC 身份验证  →  KYT 钱包筛查（双层）  →  FATF Travel Rule
        ↓
[Hex Trust（TCSP/托管资质）]
签发单次收款地址  →  链上监听到账  →  到账后二次 KYT
        ↓
[法币结算层（需 MSO 牌照）]
稳定币 → 法币兑换 → 企业银行账户收款
（或对接持牌银行/兑换商完成最后一步）
        ↓
企业收到 HKD / USD
```

### 收入来源

| 收入类型 | 金额 | 说明 |
|---|---|---|
| **一次性开发费** | $80K–$200K/客户 | HyperTransfer Phase 1 定制部署 |
| **年维护费** | 10% = $8K–$20K/年/客户 | 系统维护、安全更新、provider 版本升级 |
| **交易手续费（持 MSO 后）** | 每笔加密↔法币兑换 0.3%–1% | 法币结算层收入 |
| **SaaS 月费（标准化后）** | $5K–$15K/月/客户 | 中长期向 SaaS 模式过渡 |

### 与 dtcpay 的本质差异

| 维度 | dtcpay | HyperTransfer |
|---|---|---|
| 做什么 | POS 终端 + QR 收款 + Visa 卡，商户收加密即时转法币 | 企业级入金合规编排：KYC → KYT → Travel Rule → 托管 → 清算 |
| 面向谁 | 零售商户（咖啡店、奢侈店、酒店前台） | 金融机构、博彩、大额 B2B 入金场景 |
| 合规深度 | 浅（MAS MPI 牌照，做支付通道） | 深（KYT 双层筛查、Travel Rule、合规案件管理、审计日志） |
| 牌照 | MAS MPI（新加坡） | 初期无需牌照（技术服务商），后续 MSO → VA Dealing |
| 关系 | 可以是补充（商户端小额场景） | 做的是大额、合规密集、需要 KYT/Travel Rule 的场景 |

---

## 十、公司结构

| 项 | 建议 |
|---|---|
| **注册地** | 香港 Limited Company（BVI/Cayman 控股可选） |
| **牌照** | Phase 1 不需要牌照；Phase 2 申请 MSO |
| **初始团队** | 1 BD/Sales + 1 产品 + 2–3 开发 |
| **市场定位** | Virtual Asset Compliance Infrastructure（虚拟资产合规基础设施提供商） |
| **核心合作方** | Hex Trust（托管）、Chainalysis/TRM（KYT）、Sumsub/Onfido（KYC） |

---

## 十一、稳定币发牌与 HyperTransfer 的关系

### 首批获牌方（2026 年 4 月 HKMA 批出）

| 发行方 | 股东 | 稳定币 |
|---|---|---|
| **汇丰银行（HSBC）** | 汇丰自己 | 待公布（预计港元挂钩） |
| **Anchorpoint Financial** | 渣打银行 + HKT + Animoca Brands 合资 | **HKDAP**（HKD At Par，港元 1:1，已在 Ethereum 测试） |

### 直接关系

1. 稳定币发行方需要**入出金前端**——客户用法币兑换 HKDAP 或反向操作，需要 KYC + AML/KYT + 审计完整流程。HyperTransfer 直接适用
2. HyperTransfer 可支持 **HKDAP 作为新入金资产**（在 USDT/USDC 之外新增港元稳定币），对客户是巨大卖点
3. Anchorpoint 股东 **Animoca Brands**（Web3 巨头）和 **HKT**（全港最大电讯商）各有大量 B2C 场景，都是潜在客户或合作伙伴

---

## 十二、关键行动项

| 优先级 | 行动 | 时间 | 负责 |
|---|---|---|---|
| **P0** | 注册香港公司 | 1–2 周 | 创始人 |
| **P0** | 完成 Wynn 项目交付，获取可引用的案例 | 持续中 | 开发团队 |
| **P1** | 制作脱敏 1-pager 案例材料 | 1 周 | BD |
| **P1** | 联系 Galaxy / SJM 的 Treasury / CIO | 2–4 周 | BD |
| **P1** | 触达 5–10 家香港 OTC desk（WhatsApp/Telegram/实体） | 2–4 周 | BD |
| **P2** | 联系 HashKey BD 团队提出 ISV 合作 | 4 周 | BD |
| **P2** | 启动 MSO 牌照申请准备 | 2026 Q3 | 创始人 + 法律顾问 |
| **P2** | 联系 SFC Fintech 团队（fintech@sfc.hk）做 VA Dealing 预沟通 | 2026 Q3 | 创始人 |
| **P3** | 产品标准化为可配置 SaaS 部署模式 | 2026 Q4 | 产品 + 开发 |
| **P3** | 对接 Anchorpoint / HKDAP 作为新支持资产 | HKDAP 上线后 | 开发 |

---

*文档更新日期：2026-05-24*
