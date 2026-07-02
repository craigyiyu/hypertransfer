# HyperTransfer 虚拟资产系统 — 完整安全架构与威胁模型方案

> **文档性质**:HyperTransfer(Heypervelocity)虚拟资产合规入金编排系统的端到端安全方案 —— 覆盖系统后端、客户端、与 Hex Trust 托管的集成、合规控制、基础设施、运营与治理。
> **目标**:确保系统与客户端安全、虚拟资产不被盗取、不造成资金损失。对标 Fireblocks / Copper / Anchorage / Coinbase / Circle 等世界级机构级做法与 CCSS / SOC2 / ISO 27001 / OWASP 标准。
> **生成方式**:多智能体安全工作流(攻击面代码摸底 → 分域深挖 → 世界级对标 → STRIDE 威胁建模 → 红队 kill-chain 推演 → CISO 综合 → 独立完整性审查)。
> **日期**:2026-07-01  ·  **状态**:v1 草案,待安全负责人 + 合规评审。

---

> 本部分是整份安全方案的"总纲":它不重复十二个分域小节的细节,而是**整合、排序、定调**——先给管理层与 Hex Trust 一个可签字的安全立场,再把八条设计原则、纵深分层架构、Top 10 资产控制、分阶段路线图与 KPI/KRI 串成一条主线。分域细节请见后续《一、托管与密钥管理》至《十二、治理、保障与认证》。

---

## A. 执行摘要(Executive Summary)

**一句话安全立场**:HyperTransfer 是 Hex Trust 之上的**合规入金编排层**,平台**永不持有链上私钥**(fail-closed、assume-breach 设计),我们保护的核心资产不是私钥,而是**"促成一笔提现/退款到达攻击者钱包的能力"**与**"翻转 KYC / KYT / Travel Rule 裁决以打通资金链的能力"**——这两条被以纵深防御(defense-in-depth)+ 零信任(zero-trust)锁死,任何单点失陷都不足以造成资金损失。

**我们面对的核心风险**(威胁模型已锚定真实代码对象):
- **绕过白名单直提**:`/api/hexsafe/withdrawal`(`server.py`)当前接受任意 `toAddress`,`verified_wallets` 白名单可被越过 → 资金直达攻击者钱包(T1,P0)。
- **翻转合规裁决**:Sumsub webhook 未配 secret 时 fail-open、`issue-address`/`main` 信任前端回填的 `travelRuleStatus` → 合成身份/未做 TR 即打通闸门(S2/T2,P0)。
- **Demo 旁路泄入生产**:`DEMO_STAFF_SESSION_TOKEN`、`HT_DEMO_BYPASS_2FA`(任意 6 位码通过)一旦随 `vite build` 或环境错配进生产 → 冒充 admin 直达提现(S1,P0)。
- **假币到账**:`get_deposit_by_tx_hash` 只按金额+资产名判定,不校验合约地址 → 假 USDT 结算真法币(T3,P0)。
- **会话/审计薄弱**:token 明文存 `localStorage`(XSS 可窃)、`audit_trail` 无哈希链(内鬼可抹痕)(I1/R2,P1)。

**方案如何确保"系统与客户端安全、虚拟资产不被盗、不造成损失"**:三重保证——(1)**平台无私钥 + 提现必经 Hex Safe quorum**,即便应用层完全失陷也无法单方面搬走资金;(2)**所有 money-touching 规则的执行权收在后端**(白名单校验、TR 闸门、合约白名单、SoD/quorum),前端与前端回填的任何字段一律不可信;(3)**fail-closed 默认拒绝 + 全链路可审计**,任何缺失凭据/未验签/未配置的敏感路径一律拒绝而非放行。P0 控制在 0–3 个月内闭合,直接消灭上述资金被盗路径。

---

## B. 安全设计原则(Security Design Principles)

- **纵深防御(Defense-in-Depth)**:客户端→边界→应用→数据→托管出网→监控六层各自独立设防,单层被破不等于资金损失——白名单在应用层与 Hex Safe policy engine **双重**执行。
- **零信任(Zero-Trust)**:不信任前端、不信任内网、不信任供应商响应;`issue-address`/`main` 的 TR 状态一律后端回查 Sumsub,`_hexsafe_call` 响应逐字段比对本地意图。
- **最小权限(Least-Privilege)**:RBAC 5 角色(rm/marketing/compliance/custodian/admin)按 `require_role()` 精确授权,custodian 才能 execute 提现,发起交易者不得自审。
- **假设已失陷(Assume-Breach)**:平台不持私钥,即便 root/DB 被攻陷也搬不走链上资产;`audit_trail` 上哈希链 + 外部 WORM 副本,保证失陷后仍可取证。
- **职责分离(Segregation-of-Duties, SoD)**:退款 maker-checker(compliance screen → management approve → custodian execute)升级为强制 quorum,发起人 ≠ 审批人,防单一内鬼独立完成放款。
- **平台永不持私钥(Never Hold Keys)**:密钥/签名/冷存储全归 Hex Trust;我们只"发起交易 + 定义规则 + 留痕",最后一道放行由 Hex Safe quorum 兜底。
- **失败即拒绝(Fail-Closed)**:未配 webhook secret→401 而非入库,未配 Hex Safe 且 `SUMSUB_ENVIRONMENT=production`→503 而非静默 demo,合约不在白名单→拒绝到账。
- **隐私最小化(Privacy-by-Minimization)**:仅采集 KYC/TR 法定必需字段,PII 加密存储、按辖区隔离(HK↔Macau),白标脱敏(仅 Operator / Member ID / Treasury Account),日志不落明文 PII。

---

## C. 分层安全架构总览(Layered Architecture Overview)

纵深六层,每层给出关键控制:

- **① 客户端 / 终端(Client)**:H5(`client/src`)+ 员工端 `/ops`。控制=CSP `frame-ancestors 'none'` 防 iframe 克隆钓鱼、字体自托管、Trusted Types 缓解 XSS、passkey/WebAuthn 优先(SMS 降级为 step-up)、生产关闭全部 demo 旁路。客户端**只展示、不裁决**。
- **② 边界(Perimeter — WAF/TLS)**:nginx(`deploy/nginx.conf`)反代 `/api`。控制=强制 TLS1.2+/HSTS、WAF 过滤注入、速率限制防 OTP 轰炸与暴力破解、CORS 从 `*` 收窄到 `h5.hypercypto.com`、安全响应头下发。
- **③ 应用(Application — FastAPI/RBAC/step-up)**:`server.py`。控制=`require_role()` 授权 + SoD/quorum 校验、敏感动作 step-up 二次强认证、后端权威计算(白名单、TR 闸门、合约校验、金额/gas)、业务层幂等 key、`user_from_token` 会话解析拒绝 demo actor。**所有 money-touching 规则的执行权在此。**
- **④ 数据(Data — 加密/隔离)**:SQLite→PostgreSQL。控制=静态加密、TOTP/OTP/恢复码不明文(改 KMS 加密)、按 Operator/辖区逻辑隔离、`verified_wallets` 白名单为退款唯一可选目的地、`audit_trail` 哈希链 append-only。
- **⑤ 托管出网(Custody Egress — Hex Safe/allowlist/quorum)**:`hexsafe_client.py`(ES256 JWT + `x-request-id` 幂等)。控制=出站为**最高敏感信任边界**——withdrawal 目的地强制 ∈ `verified_wallets`、Hex Safe policy engine + quorum 二次放行、响应零信任比对、证书 pinning、`OFFICIAL_CONTRACTS` 合约白名单。
- **⑥ 监控 / 审计(Monitoring & Audit)**:控制=资金动作全量审计到自然人 `user_id`、白名单外提现拦截告警、异常裁决/重放/失败登录检测、MTTD/MTTR SLA、外部 WORM 审计副本供取证与 IR。

---

## D. Top 10 资产安全优先控制(P0 优先,防资金被盗)

| # | 控制(一句话) | 优先级 | Owner |
|---|---|---|---|
| 1 | `/api/hexsafe/withdrawal` 端点内强制 `toAddress+chainId ∈ verified_wallets[user_id]`,否则 403,与 `refund_create` 对齐 | P0 | Backend Lead |
| 2 | 生产**硬关**全部 demo 旁路:tree-shake `DEMO_*SESSION_TOKEN`、gate 改"非 prod **且** `HT_DEMO_BYPASS_2FA=1`"多条件 AND + 启动 fail-fast + CI grep 门禁 | P0 | Platform/DevSecOps |
| 3 | Sumsub webhook 未配 secret 对非 sandbox 直接 401(去 fail-open)+ 时间戳防重放 + 服务端主动回查裁决为准 | P0 | Backend/Compliance |
| 4 | `issue-address`/`main` 的 TR 闸门后端回查 Sumsub 真实结果,拒绝信任前端 `travelRuleStatus` | P0 | Backend Lead |
| 5 | 到账 `OFFICIAL_CONTRACTS` 合约地址白名单强校验(TRC-20/ERC-20),假币 → `screening_failed` | P0 | Backend/Compliance |
| 6 | 敏感动作(发址/放款/改白名单/改权限)强制 quorum + SoD(发起人 ≠ 审批人),≥2 角色/人 | P0 | Security Architect |
| 7 | 会话 token 迁 HttpOnly+Secure+SameSite=Strict Cookie,退出 `localStorage` 存储 + CSP/Trusted Types | P0/P1 | Frontend Lead |
| 8 | `verified_wallets` 白名单**新增即冷静期(time-lock)**,白名单增删本身当敏感动作走审批 | P1 | Backend/Compliance |
| 9 | `audit_trail` 哈希链(`prev_hash`/`row_hash`)+ append-only + 外部 WORM 副本,资金动作 actor 必须真实 `user_id` | P1 | DevSecOps |
| 10 | 员工端 `/ops` 落真实 Okta OIDC + Passkey,退款/提现走交易级 step-up(非仅登录一次 2FA) | P1 | IAM/Platform |

---

## E. 分阶段实施路线图(Roadmap · 映射牌照 Phase 0→3)

- **0–3 个月 · P0(牌照 Phase 0 — 纯技术服务商)**:闭合上表 1–7 全部资金被盗路径;里程碑=生产零 demo 旁路、白名单/TR/合约闸门后端强执行、withdrawal 白名单硬校验。认证=首次外部**渗透测试(pentest)**聚焦提现/退款/闸门绕过 + 依赖 SCA。人力/预算=**小规模、高杠杆**(2–3 人 × 1 季 + 一次 pentest 费用),ROI 最高。
- **3–6 个月 · P1(牌照 Phase 1 — MSO 法币兑换结算)**:上表 8–10 + 数据加密/隔离、审计哈希链、IAM 升级。里程碑=Cookie 会话、Okta/Passkey、quorum/SoD、SQLite→PostgreSQL、KMS 密钥管理。认证=启动 **SOC 2 Type I** 与 **ISO 27001** 差距评估、**CCSS**(加密货币安全标准)自评。人力/预算=**中等**(专职安全 1–2 人 + 合规顾问 + 云安全基线投入)。
- **6–12 个月 · P2(牌照 Phase 2 — VA Dealing 自营 OTC)**:里程碑=SOC 2 Type II 观察期跑满、ISO 27001 认证、7×24 监控/IR 演练、第三方红队。认证=**SOC 2 Type II + ISO 27001 正式认证 + CCSS Level 2、年度 pentest**,对齐 SFC VASP 制度要求。人力/预算=**较高**(建独立安全团队 + SOC/SIEM + 审计费),为自营托管 Phase 3 预留 HSM/quorum 治理基础。

---

## F. 安全 KPI / KRI(可度量指标)

| 指标 | 类型 | 目标 |
|---|---|---|
| MFA / Passkey 覆盖率(员工端+敏感动作 step-up) | KPI | 员工端 100%,敏感动作 step-up 100% |
| P0 漏洞修复 SLA | KPI | P0 ≤ 24h、P1 ≤ 7d、P2 ≤ 30d 内修复率 ≥ 95% |
| 提现全部经 quorum + 白名单校验比例 | KPI | 100%(任何绕过即 P0 事故) |
| 白名单外提现拦截率 | KRI | 拦截率 100%;拦截事件数环比趋零 |
| 生产 demo 旁路残留数(CI grep) | KRI | 恒为 0(非 0 即阻断部署) |
| 告警 MTTD / MTTR(资金相关异常) | KPI | MTTD < 15min、MTTR < 1h |
| 合规裁决翻转异常告警数(KYC/KYT/TR) | KRI | 未经服务端回查的翻转 = 0 |
| 假合约到账拦截数 | KRI | 100% 拦截,趋势可视 |
| 审计哈希链完整性校验通过率 | KPI | 每日校验 100% 通过,断链即告警 |
| Pentest / 红队高危发现闭环率 | KPI | 高危 ≤ 30d 闭环率 100% |


---

# 附录 T · 威胁模型(Threat Model / STRIDE + 风险登记册)

> 范围:HyperTransfer 合规入金编排平台(`hypertransfer-main/`)。平台**不持链上私钥**(资产托管在 Hex Trust / Hex Safe,quorum 放行),因此威胁模型的资产不是"私钥"而是**"能促成一笔提现/退款到达攻击者钱包的能力"**,以及**"能翻转合规裁决(KYC/KYT/TR)从而打通资金链的能力"**。所有威胁锚定真实对象:`backend/server.py`、`hexsafe_client.py`、`client/src/lib/{api,demo-auth}.ts`、表 `verified_wallets`/`refund_requests`/`deposit_requests`/`audit_trail`/`hexsafe_idempotency`,及开关 `HT_DEMO_BYPASS_2FA`/`DEMO_STAFF_SESSION_TOKEN`/`SUMSUB_ENVIRONMENT`。

---

## 一、STRIDE 逐类威胁(资产/入口 → 威胁 → 影响 → 缓解控制)

### S — Spoofing(仿冒身份 / 伪造来源)

- **S1 · Demo staff token 冒充 admin**。资产/入口:`user_from_token`(server.py:1263)识别硬编码 bearer `DEMO_STAFF_SESSION_TOKEN="demo-local-staff-session"` → 合成 admin 全角色,`client/src/lib/demo-auth.ts` 明文携带。**威胁**:任何拿到该常量的人(它随 `vite build` 打进生产 bundle)在 `SUMSUB_ENVIRONMENT` 配错时冒充 admin。**影响**:直达 `/api/hexsafe/withdrawal`、退款 execute → 资金损失。**缓解**:生产构建期 tree-shake 剔除 demo 常量(`import.meta.env.PROD`)+ 后端 gate 改多条件 AND(非 production **且** 显式 `HT_DEMO_BYPASS_2FA=1`)+ 启动自检 fail-fast + CI grep 门禁扫 `DEMO_*SESSION_TOKEN`(§4/§10/§11.5,P0)。
- **S2 · 伪造 Sumsub webhook 翻转 KYC=GREEN**。入口:`sumsub_webhook`(server.py:2725)仅当 `SUMSUB_WEBHOOK_SECRET_KEY` 非空才验签,**未配置时 fail-open 照常入库并翻转 KYC**。**威胁**:伪造一条 `reviewAnswer=GREEN` 凭空过 `user_kyc_ok`。**影响**:打通入金/退款闸门(合成身份洗钱通道)。**缓解**:未配 secret 对非 sandbox 直接 401(移除 fail-open)+ 时间戳 ±5min 防重放 + `applicantId+ts` 幂等 + 服务端主动回查 `sumsub_get_review_status` 为准(§三C,P0)。
- **S3 · SIM-swap 冒充 patron**。入口:第一因子短信 OTP(`/api/send-otp` + QA 网关 `SMS_API_URL`)。**威胁**:SIM-swap 后接管账号;`HT_DEMO_BYPASS_2FA` 下任意 6 位码过 `login/verify`。**影响**:接管账号发起退款到攻击者的(伪装)已验证钱包。**缓解**:passkey/WebAuthn 优先、SMS 降 step-up(`webauthn_credentials` 表)+ 生产关 bypass(§6.2,P1)。
- **S4 · 假站钓鱼/iframe 克隆**。入口:`index.html` 无 CSP、无 `X-Frame-Options`。**威胁**:整页克隆 H5 骗 Member ID+密码+2FA。**影响**:凭据被钓 → 会话劫持。**缓解**:nginx 下发 `CSP frame-ancestors 'none'` + 字体自托管 + 邀请/短信文案钉死官方域 `h5.hypercypto.com`(§7.1,P0)。

### T — Tampering(篡改数据 / 请求)

- **T1 · 篡改提现目标地址(BFLA)**。入口:`/api/hexsafe/withdrawal`(server.py:2999,仅 `require_role("custodian")`)**接受任意 `toAddress`**,注释自认"原钱包校验由上层保证"。**威胁**:绕过 `/api/refunds` 直调,向任意外部地址提现,`verified_wallets` 白名单形同虚设。**影响**:直接资金损失。**缓解**:端点内强制 `toAddress+chainId ∈ verified_wallets[user_id]` 否则 403,与 `refund_create`(server.py:3144)对齐(§1.2/§三B/§八8.3,P0)。
- **T2 · 前端回填绕过 Travel Rule gate**。入口:`issue-address`/`main`(server.py:3515)取**前端传入 `travelRuleStatus` 字符串**对齐入金单。**威胁**:客户端直接传 `travel_rule_accepted` 越过 TR。**影响**:USD≥1,000 未做 Travel Rule 即发址 → 合规违规。**缓解**:后端回查 Sumsub `/api/sumsub/travel-rule/*` 真实结果作闸门,不信前端(§三C/§四3/§九9.3,P0)。
- **T3 · 假 USDT 合约到账**。入口:`get_deposit_by_tx_hash` 只按金额+资产名判到账,不校验 contract address。**威胁**:部署自命名"USDT"的假 TRC-20/ERC-20 打入 vault。**影响**:误判到账 → 写 `verified_wallets` → 结算真法币(直接损失)。**缓解**:`OFFICIAL_CONTRACTS` 白名单强校验(TRC-20/ERC-20 官方合约),否则 `fake_token_rejected` + `screening_failed`(§二1,P0)。
- **T4 · 篡改 gas/金额展示套利**。入口:`estimatedReceived` 前端算的展示值(`lib/currency.ts`)。**威胁**:篡改 gas=0 套全额或展示欺骗。**影响**:结算金额偏差。**缓解**:credited 金额后端在 `deposit_main`/`settle` 权威计算并落 `deposit_requests`,前端 `DepositSuccess.tsx` 只读(§二9,P1)。
- **T5 · 篡改 Hex Safe 响应(供应商被攻陷/MITM)**。入口:`_hexsafe_call` 无证书 pinning、响应无真实性校验。**威胁**:返回被篡改的 amount/to/chainId。**影响**:按被篡改数据记账/放款。**缓解**:响应零信任逐字段比对本地意图 + fail-closed + 证书 pinning(§三B,P0/P1)。

### R — Repudiation(抵赖 / 无法追责)

- **R1 · Demo actor 掩盖真实操作人**。入口:`write_audit`(server.py:1124)在 demo 会话下 `actor_user_id` 恒为 `demo-staff-id`/`demo-user-id`。**威胁**:资金动作无法追责到自然人。**影响**:内鬼/误操作无法溯源。**缓解**:production 禁 demo actor 落审计(启动 assert)+ 资金端点 actor 必须真实 `user_id`(§9.6/§12.1,P0)。
- **R2 · 审计被篡改/删除**。入口:`audit_trail` SQLite 明文、无哈希链,root/DB 访问者可 `UPDATE/DELETE`。**威胁**:内鬼抹除提现痕迹。**影响**:事件无法取证。**缓解**:`prev_hash`/`row_hash=sha256(prev+payload)` 哈希链 + 迁 PG append-only 触发器 + WORM(S3 Object Lock)外部副本(§9.6/§10.3/§11.1,P1)。

### I — Information Disclosure(信息泄露)

- **I1 · XSS 盗 localStorage token**。入口:`lib/api.ts:8-24` 会话 token 明文存 `localStorage("ht_token")`。**威胁**:任一 XSS 读取整表会话。**影响**:会话劫持。**缓解**:token 迁 HttpOnly+Secure+SameSite=Strict Cookie + CSP/Trusted Types + 审计 `chart.tsx:81` 的 `dangerouslySetInnerHTML`(§5.2/§6.3/§7.2,P0/P1)。
- **I2 · ES256 私钥明文泄露**。入口:`hexsafe_client.py::_load_private_key` 把 PEM 明文常驻 `self.private_key`,靠 `.env` 存放,无轮换/吊销。**威胁**:core dump/日志/仓库泄露即可冒充本企业发提现指令。**影响**:配合无 allowlist 时接近直接资金损失(仍卡 Hex Safe quorum)。**缓解**:迁 KMS/HSM 签名(私钥不出边界)+ IP allowlist + 90 天轮换 + gitleaks CI(§1.1/§三A/§八8.4,P0/P1)。
- **I3 · 明文 HTTP 传输**。入口:`docker-compose.yml` 仅暴露 HTTP:8080。**威胁**:中间人截获 token/OTP/PII。**影响**:凭据/PII 泄露 + WebAuthn 等 secure-context 能力不可用。**缓解**:Caddy/Traefik 自动 TLS + HSTS + 80→443 301(§7.7/§8.1,P0)。
- **I4 · 邮件 HTML 注入**。入口:`send_invitation_email` 把 `patronName` 直接插 HTML。**威胁**:用户名注入 → 邮件 XSS/钓鱼。**影响**:凭据钓取。**缓解**:`markupsafe.escape` 模板转义(§6.6/§7.5,P0)。

### D — Denial of Service(拒绝服务 / 资源耗尽)

- **D1 · 登录撞库无节流**。入口:`login/start` 密码错误**无限频**,nginx 无 `limit_req`。**威胁**:无限撞库 + 短信刷量放大。**影响**:账号被爆破 + 短信网关成本/封禁。**缓解**:账号级失败锁定(`login_attempts` 表,5 次/15min)+ nginx `limit_req_zone` + Cloudflare WAF(§5.1/§7.2/§8.2,P0)。
- **D2 · 无边缘 DDoS 防护**。入口:源站直接暴露。**威胁**:L7 DDoS 打垮编排后端。**影响**:入金/结算不可用。**缓解**:Cloudflare 唯一入口 + 源站只放行回源 IP 段(§8.2,P0/P1)。
- **D3 · 幂等缓存无 TTL 膨胀**。入口:`hexsafe_idempotency` 永不过期且明文缓存 to/from/金额。**威胁**:缓存无界增长 + 敏感明文堆积。**影响**:存储膨胀 + 泄露面扩大。**缓解**:`expires_at` + 定时清理 + 敏感字段加密(§1.2,P1)。

### E — Elevation of Privilege(越权提升)

- **E1 · Admin 隐式全通资金链**。入口:`require_role` 里 `if "admin" in roles` 让 admin 单人跑完 `refund_screen→approve→execute`。**威胁**:单一 admin 独立促成提现(Bybit/DMM 教训)。**影响**:内鬼单人转出资产。**缓解**:admin 拆 `platform_admin`(管账号)与业务角色互斥 + 资金动作强制 `compliance≠custodian≠approver` 三人 + Hex Safe quorum(§10.1,P0)。
- **E2 · maker=checker 同角色批准**。入口:`refund_screen`(compliance)与 `refund_approve`(compliance/admin)可同一自然人。**威胁**:一人先筛后批。**影响**:退款审批形同虚设。**缓解**:`refund_approve` 断言 `approver_id != screen_actor_id`(反查 audit)+ execute 前金额/walletId 二次冻结校验(§1.3/§10.1,P0)。
- **E3 · applicant 串号(BOLA)**。入口:`sumsub_webhook`/`sumsub_ensure_applicant` 未强绑 `applicant_id ↔ user_id`。**威胁**:用他人 applicant 的 GREEN 覆盖自己 KYC。**影响**:越权过 KYC。**缓解**:`external_user_id` 派生自 `user_id` + webhook 命中校验归属,拒绝跨用户覆盖(§三C,P0)。
- **E4 · 无服务端 step-up 直接资金动作**。入口:step-up 仅前端 `totpEnabled` 判定。**威胁**:直接调资金端点绕过二次验证。**影响**:凭据被盗后无二道门。**缓解**:`require_step_up()` 服务端强制 5 分钟内新鲜 WebAuthn/TOTP 断言(`step_up_challenges` 表),挂 `issue-address`/`withdrawal`/`refund execute`(§6.4,P0/P1)。

---

## 二、风险登记册(Risk Register)

> 固有风险 = 未缓解前 可能性×影响 的量级;残余风险 = 落地缓解后剩余等级。Owner 角色对应 RBAC(rm/marketing/compliance/custodian/admin/平台安全)。

| 编号 | 威胁场景 | 可能性 | 影响 | 固有风险 | 关键缓解 | 残余风险 | Owner 角色 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| R-01 | `/api/hexsafe/withdrawal` 接受任意 `toAddress`,绕退款流直提任意地址 | 中 | 高 | 极高 | 端点强校 `toAddress∈verified_wallets` + Hex Safe quorum 兜底 | 低 | Custodian / 平台安全 | P0 |
| R-02 | Demo token / `HT_DEMO_BYPASS_2FA` 配错→冒充 admin+任意码过 2FA | 中 | 高 | 极高 | 构建期剔除 demo 常量 + 多条件 AND gate + 启动 fail-fast + CI grep | 低 | 平台安全 / Admin | P0 |
| R-03 | ES256 API 私钥明文常驻、无轮换/吊销,泄露即冒充发指令 | 中 | 高 | 高 | 迁 KMS/HSM 签名 + IP allowlist + 90 天轮换 + gitleaks | 中 | Custodian / 平台安全 | P0 |
| R-04 | 伪造 Sumsub webhook(fail-open)翻转 KYC=GREEN 打通资金链 | 中 | 高 | 高 | 强制验签(去 fail-open)+ 时间戳防重放 + 主动回查为准 | 低 | Compliance / 平台安全 | P0 |
| R-05 | 假 USDT 合约到账被误判 → 写 verified_wallets → 结算真法币 | 中 | 高 | 高 | `OFFICIAL_CONTRACTS` 官方合约白名单强校验 | 低 | Compliance / Custodian | P0 |
| R-06 | Reorg / 确认数不足(前端 Tron=4 vs 后端 19 不一致)交易回滚 | 中 | 中 | 中高 | 单一真相源 + 按金额动态确认 + settle 前复查 finality | 低 | Custodian | P0 |
| R-07 | 前端回填 `travelRuleStatus` 越过 Travel Rule gate | 高 | 中 | 高 | 后端回查 Sumsub TR 真实结果,不信前端 | 低 | Compliance | P0 |
| R-08 | 内鬼:admin 隐式全通 / maker=checker 单人跑完退款链转出资产 | 低 | 高 | 高 | admin 去隐式全通 + approver≠screener 断言 + 三人分离 + quorum | 低 | 平台安全 / Admin | P0 |
| R-09 | XSS 盗 localStorage token 劫持会话发起退款 | 中 | 高 | 高 | token 迁 HttpOnly Cookie + CSP + Trusted Types | 低 | 平台安全 / 前端 | P0/P1 |
| R-10 | double-credit 并发:同 txHash 两次 confirm-test 都记账 | 低 | 高 | 中高 | `(chain,tx_hash)` UNIQUE 约束 + CAS 事务 / FOR UPDATE | 低 | 平台安全 | P0 |
| R-11 | 零/负/超额金额注入(`amountDecimal` 仅 `min_length=1`) | 高 | 中 | 高 | Pydantic `condecimal(gt=0)`+上限 + 速率/时间锁 | 低 | 平台安全 / Compliance | P0 |
| R-12 | 明文 HTTP + CORS `*` 截获 token/OTP/PII、跨站盗会话 | 高 | 高 | 高 | 强制 TLS/HSTS + CORS 收窄正式域名(默认拒绝) | 低 | 平台安全 / 运维 | P0 |
| R-13 | 撞库 / 短信轰炸(login/start 无节流,nginx 无 limit_req) | 高 | 中 | 中高 | 账号级失败锁定 + nginx limit_req + Cloudflare WAF | 低 | 平台安全 / 运维 | P0 |
| R-14 | 供应链投毒 / 无签镜像(tag 非 digest,root 运行,无 SCA/SBOM) | 中 | 高 | 中高 | digest pin + SBOM + SCA + cosign 验签 + 非 root/只读根 | 中 | 平台安全 / DevOps | P1 |
| R-15 | 审计被篡改抹除痕迹(无哈希链、demo actor 无法追责) | 低 | 高 | 中高 | 哈希链 + PG append-only + WORM 外部副本 + 真实 actor | 低 | 平台安全 / Compliance | P1 |
| R-16 | Wrong-network 打款(TRC-20→ERC-20 地址)资金锁死 | 中 | 中 | 中 | 收款页链锁 badge + `chainId` 一致性校验 + 人工队列 | 低 | Custodian / 前端 | P1 |
| R-17 | 来源/退款钱包事后被标脏(KYT 仍 mock,execute 前不复筛) | 中 | 高 | 中高 | 真实 KYT(Hex Safe→Chainalysis/TRM)+ 提现前复筛 | 中 | Compliance | P0/P1 |
| R-18 | 幂等 key 客户端可指定/覆盖 + 无 TTL → double-withdrawal | 低 | 高 | 中 | 服务端派生 idem_key(`sha256(request_id|amount|to)`)+ TTL | 低 | 平台安全 / Custodian | P1 |
| R-19 | USDT depeg 时按 1:1 结算法币致 Treasury 亏损 | 低 | 中 | 中 | settle 前预言机报价 + `DEPEG_HALT_THRESHOLD` 熔断 | 低 | 平台安全 / 财务 | P1 |
| R-20 | 香港部署 SSH 长期私钥 + `rsync --delete` 全量覆盖误上线 | 低 | 高 | 中 | deploy key 最小权限/OIDC + dry-run diff + 人工 approval | 低 | DevOps / 平台安全 | P1 |

---

## 三、"资产被盗 / 直接资金损失"路径 Top 5(最高优先级)

以下 5 条是**能让资产真正离开 Treasury Account 或凭空放法币**的直接损失链,须在**上线前(牌照 Phase 0)全部闭合**:

1. **R-01 提现地址越权(BFLA)——头号路径**。`/api/hexsafe/withdrawal` 接受任意 `toAddress`,只要拿到 custodian 权限(或经 R-02 合成)即可绕过退款流向攻击者地址提现。唯一硬拦截当前只剩 Hex Safe 侧 quorum。**必做**:端点内强制 `toAddress∈verified_wallets` + 应用层 maker-checker,把白名单下沉到资金出口本身。

2. **R-02 Demo 旁路合成 admin/custodian**。`DEMO_STAFF_SESSION_TOKEN`→admin 全权 + `HT_DEMO_BYPASS_2FA` 任意 6 位码过 2FA,仅靠 `SUMSUB_ENVIRONMENT` 单字符串开关兜底,配错即完全失守并直通 R-01。**必做**:构建期物理剔除 + 多重 gate + 生产启动检测到任一 demo 开关为真则**拒绝启动**。

3. **R-04 伪造 webhook 翻转 KYC + R-07 绕过 Travel Rule**。`sumsub_webhook` fail-open + `issue-address` 信前端 `travelRuleStatus`,攻击者用合成身份过 KYC/TR → 打通"入金→退款到自有钱包"的洗钱/盗提通道。**必做**:强制验签 + 服务端回查为唯一权威。

4. **R-05 假 USDT 合约 + R-03 私钥泄露**。假代币被判到账后进入 `settle` 换出**真法币**(直接损失);ES256 私钥若泄露则可冒充企业发提现指令(配合 R-01 缺失时接近直接损失)。**必做**:官方合约白名单 + 私钥迁 KMS/HSM + IP allowlist。

5. **R-08 内鬼单人转出(SoD 缺失)**。admin 隐式全通 + maker=checker 同角色,使**一个内部人或一套被盗内部凭据即可独立走完 refund_create→approve→execute**——这正是 Bybit(约 15 亿美元)与 DMM(约 3.05 亿美元)的核心失陷模式。**必做**:三人职责分离(compliance≠approver≠custodian)+ approver≠screener 断言 + 依赖 Hex Trust quorum,做到"即使后端被完全攻陷,单方也无法把资产转出"。

**共性收敛点**:上述 5 条最终都汇聚到两个真实对象——`/api/hexsafe/withdrawal` 的地址白名单校验,与 demo bypass 的生产剥离。这两处是投入产出比最高、上线前不可妥协的 P0 红线。

---

# 附录 R · 红队攻击链推演(Red-Team Kill-Chains)

> 攻击者视角:目标是让 USDT 离开 Treasury Account(WTA)或造成合规/账目损失。本系统的结构性优势是**平台不持链上私钥**——最终放款卡在 Hex Safe quorum。因此绝大多数链的"变现"依赖两件事之一:(a) **Hex Safe 侧 quorum/maker-checker 兜底是否存在**;(b) **绕过退款/发址闸门,让本系统对 Hex Safe 发出"看似合规"的提现指令**。下面每条链锚定 `server.py`/`hexsafe_client.py` 的真实端点、行号、表与 env 开关。
>
> **贯穿全局的三个"母缺口"**(多条链共用):① `hexsafe_withdrawal`(server.py:3000)只 `require_role("custodian")`、**不校验 `toAddress ∈ verified_wallets`**;② `sumsub_webhook`(server.py:2730)**fail-open**——`SUMSUB_WEBHOOK_SECRET_KEY` 未配则签名恒不校验仍翻转 KYC;③ demo 旁路(`DEMO_STAFF_SESSION_TOKEN`→synthetic admin server.py:1263-1289、`HT_DEMO_BYPASS_2FA` 任意 6 位码)全靠 `SUMSUB_ENVIRONMENT!="production"` **单字符串**兜底。

---

## KC-1(重点必答)伪造 / 重放 Sumsub webhook 把 KYC 翻转成 GREEN

- **攻击者类型**:外部黑客(无需任何本系统凭据)。
- **初始入口**:公网 `POST /api/sumsub/webhook`(`sumsub_webhook`,server.py:2725)。攻击者构造 `{"applicantId": <目标 applicantId 或猜测>, "externalUserId": <目标 user_id 派生值>, "reviewResult":{"reviewAnswer":"GREEN"}, "reviewStatus":"completed"}`。
- **提权 / 横向**:**无需提权**。致命点在 server.py:2730——签名校验被包在 `if SUMSUB_WEBHOOK_SECRET_KEY:` 里,**若该 env 未配置**(演示态默认空,line 114),`signature_valid` 恒为 `None`,代码**跳过 401 直接入库并 UPDATE `sumsub_kyc_applications`**;随后 `sumsub_persist_validity`(server.py:2470/2798)落 `status=approved` + `valid_until=+6 个月`。即便配了 secret,缺 `x-timestamp`/event-id 幂等 → 可**重放**一条合法 GREEN 到另一 applicant,或对 `external_user_id` 分支(server.py:2777)做**串号覆盖**(BOLA)——把攻击者自己的 GREEN 结果绑到受害/傀儡 user_id。
- **触达资产控制点**:`user_kyc_ok`(server.py:3039)从此对该账户返回真;`require_kyc`(挂在 `/api/deposits` create/screen/issue-address/confirm-test/main 与退款链)全部放行。攻击者用合成身份/骡子账户完成入金→打 1 USDT 写入 `verified_wallets`→退款把资金提到自己钱包(见 KC-6),或直接把脏币"洗白"入金再结算法币。
- **变现 / 损失**:合成/盗用身份通过 AML 闸门 → 洗钱通道打通;监管层面即"KYC 形同虚设",可致牌照/HKFIO 处罚级损失,叠加 KC-6 直接盗提。
- **检测点**:`sumsub_webhook_events.signature_valid` 出现 `NULL` 或 `0`;同一 `applicantId` 短时多条 GREEN(重放);webhook 上报的 GREEN 与**主动回查** `sumsub_get_review_status(applicantId)` 结果不一致;`audit_trail` 里 KYC approved 无对应 Sumsub 出站回查记录。
- **阻断控制(哪些 P0 斩断)**:
  - **P0 移除 fail-open**:非 sandbox 下 `SUMSUB_WEBHOOK_SECRET_KEY` 未配置即**启动拒绝 / webhook 直接 401**(把 line 2730 的 `if` 改成"缺 secret 且非 sandbox → 401")。**这一条单独即斩断本链**。
  - **P0 webhook 只当触发器,结论以服务端主动回查为准**:UPDATE `sumsub_kyc_applications` 前调 Sumsub API 回查该 applicant 真实 reviewAnswer;伪造 payload 因回查不到 GREEN 而失效。
  - **P0 applicantId 强绑 user_id**:`sumsub_ensure_applicant` 以 `external_user_id` 派生自 `user_id`,webhook 命中后校验 applicant 归属当前 user,拒绝 `external_user_id` 分支跨用户覆盖(闭合 BOLA)。
  - **P0 防重放**:`x-timestamp` ±5min 窗口 + `sumsub_webhook_events` 对 (applicantId, event ts) 幂等去重。

---

## KC-2(重点必答)Hex Safe ES256 私钥 / x-api-key 泄露 → 直接盗提

- **攻击者类型**:外部黑客(经 KC-8 CI 投毒 / 日志泄露 / core dump)或供应链。
- **初始入口**:`hexsafe_client.py` 的 `_load_private_key()` 把 `HEXSAFE_PRIVATE_KEY`(PEM 明文)读入并长驻 `self.private_key`;泄露途径:服务器 `.env`(chmod 600 但明文)、进程内存 dump、误打日志(`seed_staff_admin` 已有打 secret 先例)、CI secret 泄露、GitHub Actions `HK_SSH_KEY` 落地后读盘。
- **提权 / 横向**:拿到 PEM + `HEXSAFE_API_KEY` 后,攻击者在**任意主机**自建 `_build_jwt`(claims `api-key/nonce/uri/exp` + POST `digest=SHA-512(body)`),即可冒充本企业对 `api.hexsafe.hextrust.com` 发任意请求。
- **触达资产控制点**:直接 `POST /v1/transactions/withdrawal`(6 必填 `{enterpriseId,ticker,chainId,amountDecimal,from,to}`),`to` 填攻击者钱包。**是否得手取决于两道兜底**:(a) **Hex Safe 侧 IP allowlist**——若已配香港固定出口 IP,则异地请求被拒;(b) **Hex Safe 侧 quorum/maker-checker**——单纯持 API 签名密钥**不等于**链上放行,提现仍需托管方多方审批。**当前差距**:代码/文档**无 IP allowlist、无密钥轮换/吊销路径**,故一旦泄露且 Hex Safe 侧未强制 quorum,即可直接盗提全额。
- **变现 / 损失**:Treasury Account 全额可被转出(受 Hex Safe quorum 上限约束),DMM/Bybit 量级。
- **检测点**:Hex Safe 侧出现**非白名单源 IP**的 API 调用;本系统 `hexsafe_idempotency` / `audit_trail` 无对应 `withdrawal.submit` 记录却发生了链上提现(带外 vs 台账**对账缺口**);vault 余额与内部 `deposit_requests`/`refund_requests` 台账日结差异告警。
- **阻断控制**:
  - **P0 IP allowlist**(向 Hex Trust 申请,只放行香港固定 egress IP)——泄露的 key 从任意主机不可用,**即便无 quorum 也斩断**。
  - **P0 依赖 Hex Safe quorum/maker-checker 兜底**:合同 SLA 明确"单方 API 凭据无法独立放行提现",做到即便本系统被完全攻陷单方也转不出资产。
  - **P0 私钥迁 KMS/HSM**:签名在 KMS 内完成(`_build_jwt` 改调 KMS `Sign(ECDSA_SHA_256)`),私钥**永不出边界、永不落 .env/日志**,从源头消除泄露面;sandbox/prod 密钥物理分离(不同 keyId + IAM)。
  - **P1 轮换 / 即时吊销 runbook**(90 天 + 事件驱动)、gitleaks CI 门禁、KMS canary + 出站异常告警。

---

## KC-3 盲签 / UI 伪造诱导 quorum 审批(Bybit 2025 范式)

- **攻击者类型**:外部黑客(污染前端/托管审批 UI)或内鬼。
- **初始入口**:攻破 `Dockerfile.frontend` 构建产物或 Hex Trust 审批界面渲染层(经 KC-8 依赖投毒 / KC-10 XSS 篡改 `/casino-ops` 展示),让 quorum 审批人看到的"收款地址/金额"与实际签发的 Hex Safe 提现指令**不一致**。
- **提权 / 横向**:攻击者不改后端逻辑,只改**审批人所见的 UI 字符串**,诱导 custodian/quorum 成员对一笔"看似退给原钱包"的交易点批准,实际 `to` 已被替换为攻击者地址。
- **触达资产控制点**:被诱导的 quorum 签名使 Hex Safe 真实放行 → 资金出账。
- **变现 / 损失**:全额,且带**合法审批签名**,事后难追责。
- **检测点**:审批 UI 展示值 vs 后端 `refund_requests.to_address`/`deposit_requests` 权威值逐字段比对不符;`_hexsafe_call` 响应 `to/amount/chainId` 与本地意图不一致。
- **阻断控制**:
  - **P0 响应零信任 + WYSIWYS(所见即所签)**:审批端展示的地址/金额必须直接取自后端权威列并做**独立通道二次核对**(地址后 6 位带外确认);`_hexsafe_call` 返回后逐字段比对 `amount/to/chainId/vaultId` 与 `refund_requests`,不符即 fail-closed + `audit_trail("withdrawal.tamper")`。
  - **P0 前端 CSP + SRI + Trusted Types**(`deploy/nginx.conf`)防注入篡改展示层;字体自托管去外链信任面。
  - **P0/P1 maker-checker 分离 + Hex Safe quorum**:发起人≠审批人≠执行人,叠加托管方多方审批,单一被诱导者无法独立放款。

---

## KC-4 `/api/hexsafe/withdrawal` 地址越权(BFLA)—— 绕退款流直提任意地址

- **攻击者类型**:内鬼(custodian)或凭 KC-1/KC-10 拿到 custodian 会话的外部黑客。
- **初始入口**:直接调 `POST /api/hexsafe/withdrawal`(server.py:3000,仅 `require_role("custodian")`)。
- **提权 / 横向**:**无需**走 `/api/refunds`(create→screen→approve→execute)编排。端点 body `HexSafeWithdrawalIn`(server.py:2890)的 `toAddress` **接受任意字符串**,注释自认"原钱包校验由上层保证"——但该端点本身**不查 `verified_wallets`**(对比 `refund_create` server.py:3148 强制 walletId 属本人)。`amountDecimal` 仅 `min_length` 校验(可 0/负/超额)。
- **触达资产控制点**:直接对 Hex Safe 发提现,`from`=vault、`to`=攻击者地址。
- **变现 / 损失**:退款白名单红线形同虚设,资金出账(受 Hex Safe quorum 约束)。
- **检测点**:`hexsafe.withdrawal.submit` 的 `to` 不在该 user `verified_wallets`;无对应 `refund_requests` 记录却发起提现;金额异常(0/负/极大)。
- **阻断控制**:
  - **P0 出口强制白名单**:`hexsafe_withdrawal` 提交前 `SELECT 1 FROM verified_wallets WHERE user_id=? AND address=? AND chain_id=?`,不命中即 403(与 `refund_create` 对齐);或干脆禁止外部直调,仅允许 `refund_execute` 内部调用。
  - **P0 金额校验**:`HexSafeWithdrawalIn` 用 Pydantic `condecimal(gt=0)` + 上限。
  - **P0 maker-checker**:`refund_screen`(compliance)≠`refund_approve`(management)≠`refund_execute`(custodian)强制不同自然人;`require_role` 里 `admin` 隐式全通拆分(admin 不得单人跑完全链)。

---

## KC-5 幂等 / 竞态 double-withdrawal & double-credit

- **攻击者类型**:内鬼或拿到 custodian/patron 会话的外部黑客。
- **初始入口**:并发重发同一 `refund_execute` / 并发 `confirm-test`(同 txHash)。
- **提权 / 横向**:(a) **提现侧**:`hexsafe_withdrawal` 的 `idempotencyKey` **由客户端传入**(server.py:3012),攻击者传**不同** key 绕过 `hexsafe_idempotency` 去重 → 对同一退款单发起两次放款;或探测/覆盖缓存。(b) **入金侧**:`confirm-test`(server.py:3542)写 `verified_wallets` 无 `(chain,tx_hash)` UNIQUE 约束,SQLite 无行级锁,两并发请求可**各自** `get_deposit_by_tx_hash` 通过后都记账 → double-credit,再结算法币套利。
- **触达资产控制点**:退款/结算重复放款;入金重复记账后经 `settle` 转成多份法币。
- **变现 / 损失**:同一笔资金被提两次 / 一笔入金结两份法币。
- **检测点**:同一 `refund_requests.id` 出现两个 `transfer_id`;同一 `(chain,tx_hash)` 多条 credit;对账日结差异。
- **阻断控制**:
  - **P0 服务端派生幂等 key**:`sha256(user_id|refund_request_id|amount|to)`,禁客户端指定;`hexsafe_idempotency` 加 `expires_at` + TTL 清理。
  - **P0 入金唯一约束**:`deposit_requests`(或新 `credited_txs` 表)对 `(chain, tx_hash)` 加 UNIQUE;记账走 `BEGIN IMMEDIATE` + `WHERE status!='settled'` 的 compare-and-set;迁 PostgreSQL 后 `SELECT … FOR UPDATE`。

---

## KC-6 退款已验证钱包白名单绕过 / 退款洗钱

- **攻击者类型**:内鬼(compliance/custodian)或社工受害者。
- **初始入口**:`/api/refunds`(create→screen→approve→execute)。`refund_create`(server.py:3145)已强制 `walletId ∈ verified_wallets`——**这是好设计**;绕过点在其**上游与下游**:(a) 若攻击者先通过 KC-1 翻转 KYC + 完成入金写入**攻击者控制的** `verified_wallets`,则退款"合法"地退到攻击者钱包;(b) `refund_screen`+`refund_approve` 可由**同一 compliance 自然人**完成(maker≠checker 未强制),内鬼单人推进;(c) 绕过整条退款流直接走 KC-4 的 withdrawal 端点。
- **提权 / 横向**:利用"入金时钱包已 KYT 通过"的信任,但**退款执行时该地址可能已被标脏**(赃款事后被标记)——当前 `refund_execute`(server.py:3236)**不再筛查**。
- **触达资产控制点**:`refund_execute` → Hex Safe withdrawal 到"已验证"但实为攻击者/已污染钱包。
- **变现 / 损失**:把入 vault 的资金"合规地"退到攻击者地址,完成洗钱闭环。
- **检测点**:入金后极短时间即发起等额退款;`verified_wallets` 写入源钱包 KYT 风险快照缺失;screener==approver 同一 actor。
- **阻断控制**:
  - **P0 maker-checker**:`refund_approve` 断言 `approver_id != screen_actor_id`(反查 `audit_trail`)。
  - **P0 execute 前再筛**:`refund_execute` 对目标 `verified_wallets` 地址跑一次实时 KYT(见 KC-11),命中即拒。
  - **P0 上游闭合 KC-1**(webhook 强校验),防污染 `verified_wallets` 的信任锚。

---

## KC-7 假 USDT 合约 / wrong-network 入金

- **攻击者类型**:外部黑客(链上)。
- **初始入口**:向本系统 vault 地址打入**自命名 "USDT" 的假 ERC-20/TRC-20**,或用错网络(TRC-20 打到 ERC-20 地址)。
- **提权 / 横向**:`confirm-test`/`deposit_main` 经 `hexsafe_client.get_deposit_by_tx_hash` 按金额+资产名判定到账,**不校验发起 transfer 的官方合约地址**;假币被误判到账 → 写 `verified_wallets` 甚至 `settle` 结算真法币。
- **触达资产控制点**:`settle`(法币结算,demo `DEPOSIT_FIAT_RATE`)。
- **变现 / 损失**:攻击者用零成本假币套取真法币;wrong-network 则资金永久锁死(损失/客诉)。
- **检测点**:到账 `contractAddress` ≠ 官方 USDT 合约;`chainId` 与单据不符。
- **阻断控制**:
  - **P0 官方合约白名单**:`OFFICIAL_CONTRACTS`(tron `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` / eth `0xdAC17F958D2ee523a2206206994597C13D831ec7`),写 `verified_wallets`/结算前断言合约匹配,否则 `screening_failed`。
  - **P0 wrong-network 一致性**:`confirm-test` 校验 `get_deposit_by_tx_hash` 返回 `chainId`==单据 `chainId`;`MainDeposit.tsx` 收款页链锁 badge。
  - **P1 depeg circuit-breaker + 结算金额后端权威**(防 gas 套利):`settle` 前查预言机,USDT/USD<`DEPEG_HALT_THRESHOLD` 冻结;credited 后端算,前端 `DepositSuccess.tsx` 只读。

---

## KC-8 CI/CD 或依赖投毒(供应链)

- **攻击者类型**:供应链攻击者。
- **初始入口**:npm/pip 依赖投毒(`pnpm-lock.yaml`/`requirements.txt`)、`Dockerfile.frontend` 用 tag 非 digest 基镜像被替换、CI 无 SCA/SBOM/镜像扫描。
- **提权 / 横向**:恶意依赖在 build/运行时读取 `HEXSAFE_PRIVATE_KEY`/`SUMSUB_*`(→喂 KC-2)、或注入前端窃 token(→KC-10)、或篡改审批 UI(→KC-3);`hypertransfer-deploy-hk.yml` 的 `rsync --delete` 直接把投毒产物上线香港生产。
- **触达资产控制点**:间接触达全部(密钥、会话、UI)。
- **变现 / 损失**:全面失守。
- **检测点**:lockfile 变更未过审;镜像 digest 漂移;CI 无签名产物。
- **阻断控制**:
  - **P1 SBOM(syft/CycloneDX)+ SCA(`pnpm audit`/`pip-audit`)+ Trivy 镜像扫描 + Dockerfile pin `@sha256:`**,进 `hypertransfer-check.yml`。
  - **P1 cosign 签名 + GitHub OIDC keyless**,部署侧只放行已签镜像;`--delete` 前 dry-run + approval。
  - **P0 CI grep 门禁**:main 命中 `DEMO_STAFF_SESSION_TOKEN`/`HT_DEMO_BYPASS_2FA` 参与授权路径即 fail;资产签名库(`eth_account` 等)禁入。

---

## KC-9 SMS OTP / SIM-swap 账户接管

- **攻击者类型**:外部黑客 + 电信社工。
- **初始入口**:第一因子是手机短信 OTP(`/api/send-otp`,`SMS_API_URL` QA 网关);SIM-swap 后接管短信。
- **提权 / 横向**:接管首因子;若 `HT_DEMO_BYPASS_2FA` 误开(单 env 兜底),`login/verify`(server.py:1100)/`verify_email_otp` **接受任意 6 位码**,TOTP 第二因子也失效;`login/start` 密码错误无节流,可撞库。
- **触达资产控制点**:接管 patron 账户 → 入金/退款到攻击者钱包(叠 KC-6);或接管员工账户。
- **变现 / 损失**:受害者资金经退款流被引出。
- **检测点**:新设备/异地登录无告警;`login/start` 高频失败无锁定;`HT_DEMO_BYPASS_2FA` 生产为真。
- **阻断控制**:
  - **P0 login/start 限频**(账号+IP 计数锁定)+ nginx `limit_req`。
  - **P1 passkey/WebAuthn 优先,SMS 降为 step-up**(免疫 SIM-swap);`webauthn_credentials` 表。
  - **P0 资金动作服务端 step-up**(`require_step_up`,5min 新鲜断言,非前端 `totpEnabled`)。
  - **P0 demo 多重 gate + 生产构建剥离**(见 KC-12)。

---

## KC-10 CORS/XSS 窃取 localStorage token + 明文传输

- **攻击者类型**:外部黑客。
- **初始入口**:`lib/api.ts` 把会话 token 明文存 `localStorage("ht_token")`;`client/index.html` 无 CSP,`ui/chart.tsx:81` 有 `dangerouslySetInnerHTML`,`send_invitation_email` 用户名插 HTML(邮件注入);`HT_ALLOWED_ORIGINS` 默认 `*`;compose 仅 HTTP:8080 明文传 token/OTP/PII。
- **提权 / 横向**:任一 XSS/中间人窃取 token → 冒充会话;若窃到 custodian token → 直接走 KC-4 提现。
- **触达资产控制点**:凭盗得会话调 `/api/refunds`/`/api/hexsafe/withdrawal`。
- **变现 / 损失**:会话劫持 → 资金引出。
- **检测点**:异常 Origin 的跨站请求;同一 token 多地并发。
- **阻断控制**:
  - **P0 CSP + Trusted Types + 安全响应头**(nginx),字体自托管;`send_invitation_email` HTML 转义。
  - **P0 CORS 收窄** `https://h5.hypercypto.com`(默认拒绝,staging 也禁 `*`)。
  - **P0 TLS/HSTS 前置**(Caddy/Traefik)。
  - **P1 token 迁 HttpOnly+Secure+SameSite=Strict Cookie**,`api.ts` 去 `TOKEN_KEY`。

---

## KC-11 出站集成被 SSRF 滥用 & 供应商侧被攻破返回篡改数据

- **攻击者类型**:外部黑客(SSRF)/ 供应链(Hex Trust/Sumsub 侧被攻陷或中间人)。
- **初始入口**:任何把**用户可控输入拼进出站 URL / 目的地**的路径;供应商响应被信任(`_hexsafe_call`、`sumsub_get_review_status`)。
- **提权 / 横向**:(a) SSRF——若 `chainId`/`toAddress`/回调地址未白名单枚举,攻击者诱导后端向内网/攻击者端点发请求;(b) 供应商被攻陷或 MITM 返回伪造 GREEN(→KC-1)或伪造"到账"(→KC-7)或篡改 withdrawal 响应(→KC-3)。`hexsafe_client` 用 `urllib` + 伪装 UA、**无证书 pinning**。
- **触达资产控制点**:合规裁决(Sumsub)与资金响应(Hex Safe)均被污染。
- **变现 / 损失**:闸门被上游数据污染,间接放行盗提/洗钱。
- **检测点**:出站目的非 allowlist host;供应商响应字段与本地意图不符;TLS 指纹变化。
- **阻断控制**:
  - **P0 响应零信任**:`_hexsafe_call` 逐字段比对本地意图,fail-closed;KYC 以服务端主动回查为准(闭合 KC-1)。
  - **P1 内部集成网关**:所有出站集中鉴权/限频/**SSRF 防护(目的 host 白名单枚举,禁用户可控 URL)**;`chainId`/`toAddress` 枚举校验。
  - **P1 证书 pinning** `api.hexsafe.hextrust.com`,恢复正规 UA + 靠 IP allowlist 而非伪装。
  - **P0 fail-closed**:Hex Safe/Sumsub 不可达时 `issue-address`/`withdrawal` 冻结,绝不降级绕过。

---

## KC-12 内鬼单人转出 + demo 旁路合成 admin(最高危复合链)

- **攻击者类型**:内鬼 / 配错生产环境的运维 / 拿到任一路径的外部黑客。
- **初始入口**:`user_from_token` 认 `DEMO_STAFF_SESSION_TOKEN="demo-local-staff-session"`(server.py:1263)即合成 `demo-staff-id`,`get_user_roles`(server.py:1289)直接给 `["admin"]`;`require_role` 里 admin 隐式全通;仅靠 `SUMSUB_ENVIRONMENT!="production"` **单字符串**兜底。`/api/sumsub/kyc/demo-approve` 一键标 KYC approved。
- **提权 / 横向**:生产 `SUMSUB_ENVIRONMENT` 配错 / demo 常量随 `vite build` 打进 bundle → **固定 token 免密冒充 admin**,单人跑完 `refund_create→screen→approve→execute`;或内鬼本就有 custodian 走 KC-4。审计 actor 恒为 `demo-staff-id`,**无法追责到自然人**且 `audit_trail` 无哈希链可被 DB 直接抹除。
- **触达资产控制点**:admin 单人通吃全部资金端点 + Hex Safe withdrawal。
- **变现 / 损失**:单人独立转出(Bybit/DMM 教训),事后无痕。
- **检测点**:生产 `audit_trail` 出现 `demo-staff-id` actor;单一 actor 跑完退款全链;哈希链断裂。
- **阻断控制**:
  - **P0 demo 多重 gate + fail-closed 自检**:`ENV==production` 且 `HT_DEMO_BYPASS_2FA` 未设 且无 demo token 常量,任一不满足即**拒绝启动**;`SUMSUB_ENVIRONMENT` 缺失时默认按 production 关闭旁路。
  - **P0 生产构建物理剔除** demo 常量(`Dockerfile.frontend` `NODE_ENV=production` tree-shake `demo-auth.ts`)+ CI grep 门禁。
  - **P0 maker-checker + admin 去隐式全通**:发起人≠审批人≠执行人;admin 拆 `platform_admin`(管账号)与业务角色互斥,叠 Hex Safe quorum → 单人无法独立放款。
  - **P1 audit_trail 哈希链(`prev_hash`/`row_hash`)+ append-only + WORM**,生产禁 demo actor 落审计。

---

## 汇总:攻击链 → 关键检测点 → P0 斩断控制 → 本系统落点

| # | Kill-Chain | 检测点 | P0 斩断控制 | 端点/文件/表 |
|---|---|---|---|---|
| 1 | 伪造/重放 Sumsub webhook 翻转 KYC=GREEN | `signature_valid` NULL/0、GREEN vs 回查不符 | 移除 fail-open(缺 secret→401)+ 主动回查 + applicant 绑 user_id + 防重放 | `sumsub_webhook`(server.py:2725/2730)、`SUMSUB_WEBHOOK_SECRET_KEY`、`sumsub_kyc_applications` |
| 2 | Hex Safe 私钥/api-key 泄露→盗提 | 非白名单源 IP、带外提现无台账 | IP allowlist + Hex Safe quorum 兜底 + 私钥迁 KMS | `hexsafe_client._load_private_key`/`_build_jwt`、`HEXSAFE_*` |
| 3 | 盲签/UI 伪造诱导 quorum | 审批展示值 vs 后端权威不符 | 响应零信任逐字段比对 + WYSIWYS + CSP + maker-checker | `_hexsafe_call`、`refund_requests`、`deploy/nginx.conf` |
| 4 | withdrawal 地址越权(BFLA) | `to`∉verified_wallets、无 refund 记录 | 出口强校 `verified_wallets` + 金额`condecimal(gt=0)` + maker-checker | `/api/hexsafe/withdrawal`(server.py:3000)、`verified_wallets` |
| 5 | 幂等/竞态 double-withdrawal/credit | 同单多 transfer_id、同 txHash 多 credit | 服务端派生 idem_key + `(chain,tx_hash)` UNIQUE + CAS 事务 | `hexsafe_idempotency`、`confirm-test`、`deposit_requests` |
| 6 | 退款白名单绕过/洗钱 | 入金即等额退款、screener==approver | maker≠checker + execute 前再筛 + 闭合 KC-1 | `refund_screen/approve/execute`、`verified_wallets` |
| 7 | 假 USDT 合约 / wrong-network | contractAddress≠官方、chainId 不符 | 官方合约白名单 + chainId 一致性校验 | `get_deposit_by_tx_hash`、`confirm-test`、`OFFICIAL_CONTRACTS` |
| 8 | CI/CD/依赖投毒 | lockfile 未过审、digest 漂移 | CI grep 门禁 + digest pin;（P1）SBOM/SCA/cosign | `hypertransfer-check.yml`、`Dockerfile.frontend` |
| 9 | SMS OTP/SIM-swap 接管 | 异地登录无告警、撞库无锁 | login/start 限频 + 资金 step-up + demo gate | `/login/start`、`/login/verify`、`SMS_API_URL` |
| 10 | CORS/XSS 窃 token + 明文传输 | 异常 Origin、token 多地并发 | CSP/Trusted Types + CORS 收窄 + TLS/HSTS | `lib/api.ts`、`index.html`、`HT_ALLOWED_ORIGINS`、`deploy/nginx.conf` |
| 11 | SSRF / 供应商返回篡改数据 | 出站非 allowlist、响应与意图不符 | 响应零信任 + fail-closed;（P1）SSRF 白名单 + cert pinning | `_hexsafe_call`、`sumsub_get_review_status` |
| 12 | 内鬼单人转出 + demo 合成 admin | 生产 `demo-staff-id` actor、单人跑完全链 | demo 多重 gate + 构建剥离 + maker-checker + admin 去全通 | `DEMO_STAFF_SESSION_TOKEN`、`user_from_token`(1263)、`get_user_roles`(1289)、`require_role` |

**结论(红队视角)**:本系统最致命、且**当前代码已确证存在**的三个"一步致命"缺口是——(1) **KC-1**:`sumsub_webhook` fail-open(server.py:2730),缺 `SUMSUB_WEBHOOK_SECRET_KEY` 即可无凭据翻转任意账户 KYC=GREEN;(2) **KC-4**:`hexsafe_withdrawal`(server.py:3000)不校验 `toAddress∈verified_wallets`,拿到 custodian 会话即向任意地址提现;(3) **KC-12/KC-2**:demo 旁路单 env 兜底 + 私钥明文常驻,配错/泄露即完全失守。三者的 P0 斩断控制(webhook 强校验+主动回查、withdrawal 出口白名单、demo 多重 gate+私钥迁 KMS+Hex Safe quorum/IP allowlist 兜底)是**上线前的绝对前置**,缺一即整条 kill-chain 贯通。

---

# 分域安全控制(Domain Controls)

## 一、托管与密钥管理安全(Custody & Key Management)


### 1.1 责任边界:平台永不持私钥,资产密钥全在 Hex Safe

HyperTransfer 的托管模型是**非自营托管(non-custodial-of-keys)**:客户资产私钥由 Hex Trust 以 MPC + HSM 保管在其托管平台 Hex Safe,本平台**只做编排与授权提交**,永不接触资产私钥。当前代码已符合这一边界——`hexsafe_client.py` 里签发交易只持有一把 **API 签名私钥**(ES256,用于对 Hex Safe REST 请求做 JWT 签名),而非任何链上资产私钥;`create_withdrawal` 的真实放行由 Hex Safe 侧 quorum/maker-checker 决定。这条原则必须写进架构红线并在 CI 中静态检查:**禁止在 `hypertransfer-main/` 出现 `eth_account`/`bitcoinlib`/助记词/`sign_transaction` 等资产签名符号**(P0,Phase 0),放一条 `grep` 门禁进 `.github/workflows/hypertransfer-check.yml`。责任划分对齐 Anchorage/BitGo 的"qualified custodian 持密钥、平台方仅发指令"模型:托管方 = Hex Trust(MPC 分片、HSM、冷存储、保险、quorum);平台方 = HyperTransfer(KYC/KYT/TR 闸门 + 提现指令构造 + 审计留痕)。

**当前差距(API 签名私钥):** `hexsafe_client.py` 的 `_load_private_key()` 把 ES256 PEM 从 `HEXSAFE_PRIVATE_KEY`(内容或路径)读入,长驻 `self.private_key` 明文内存;无版本、无轮换、无吊销路径,泄露即可冒充本企业发提现指令(放行仍卡在 Hex Safe quorum,但仍是重大暴露)。

- **改成如何(P0/Phase 0→1):** 将 ES256 私钥从 `.env` 明文迁到 **KMS/HSM**——香港服务器阶段先用云 KMS(AWS KMS/GCP KMS)托管,`hexsafe_client.py` 改为调 KMS `sign` 接口出签名而非本地 `jwt.encode(...private_key...)`,进程内**不再常驻私钥**;并加 `HEXSAFE_KEY_ID` + 轮换脚本,记录 `key_version`。对齐 Circle/Coinbase 的"签名密钥进 HSM、应用只拿签名结果"。
- **IP allowlist + key rotation(P0/Phase 1):** 向 Hex Trust 申请 API key 的 IP allowlist,只放行香港生产出口 IP;`DEPLOY.md` 增加密钥轮换 runbook(90 天)+ 紧急吊销演练。

### 1.2 提现授权链:allowlist 强校验是当前最大缺口

**当前差距(高危):** `/api/hexsafe/withdrawal`(server.py:2999)只有 `require_role("custodian")`,端点本身**接受任意 `toAddress`**——注释写"to 只能是已验证原钱包,由上层退款流保证",但该端点若被直接调用即可绕过退款流向任意地址提现。这是典型的 OWASP API#1 BOLA/授权缺陷:控制散落在上层而非资金出口本身。

- **改成如何(P0/Phase 0):** 在 `hexsafe_withdrawal` 内做**服务端强制 allowlist 校验**——提交前查 `verified_wallets`,`toAddress`+`chainId` 必须命中当前 patron 名下已验证原钱包,否则 400,与 `refund_create`(server.py:3144,已校验 `walletId ∈ verified_wallets`)对齐。伪代码:
  ```python
  row = conn.execute(
      "SELECT 1 FROM verified_wallets WHERE user_id=? AND address=? AND chain_id=?",
      (owner_id, body.toAddress, body.chainId)).fetchone()
  if row is None:
      raise HTTPException(403, "Withdrawal destination not in verified_wallets allowlist")
  ```
  这就是 Fireblocks/Copper 的 **Transfer Whitelist/allowlisting** 在本栈的落地:withdrawal 出口只认白名单地址。
- **幂等 key 服务端派生(P1/Phase 1):** 现 `idempotencyKey` 由客户端传入(server.py:3012),可被探测/覆盖缓存。改为服务端从 `refund_requests.id`+金额派生 `idem_key`(如 `sha256(request_id|amount|to)`),客户端不再直接指定;`hexsafe_idempotency` 表增 `expires_at` + 定时清理(现永不过期且缓存含 to/from/金额明文入 SQLite)。
- **金额/速率/时间锁(P1/Phase 1):** 现 `refund_create`/`deposit_main` 的 `amountDecimal` 仅 `min_length=1`,可提 "0"/"-100"/超额。加**服务端金额校验**(> 0、精度、单笔上限)+ 逐日**速率限制**(每 patron/每 vault 提现次数与累计额度)+ 大额**time-lock/cool-down**(如 > USD 50k 强制 24h 冷静期,期间可撤销),落在退款状态机 `refund_approve→refund_execute` 之间新增 `cooldown_until` 列。对齐 BitGo/Anchorage 的 velocity limits + delayed withdrawal。

### 1.3 Treasury Account 分层 vault + maker-checker/M-of-N quorum

Treasury Account(WTA)是**分层 vault 结构**而非单地址。目标态:**cold**(离线,存 ≥95% 净头寸,仅定期补温层)/ **warm**(MPC 多签,日结算缓冲)/ **hot**(小额自动退款/结算,设硬上限如 ≤ USD 20k)。当前 `hexsafe_client.py` 的 `list_vaults`/`enterpriseId` 已能列 vault,但代码未表达分级与资金上限。

- **改成如何(P1/Phase 1):** 在配置层(`.env` + 后端常量)声明 `HEXSAFE_VAULT_HOT/WARM/COLD` + 每层上限;退款/结算 `settle` 优先走 hot,超限自动升级到 warm 并触发 maker-checker。
- **maker-checker/quorum(P0/Phase 0):** 现退款 `refund_screen→refund_approve→refund_execute` 三步,但同一 `compliance` 角色可能既 screen 又 approve。强制**职责分离**:screen(compliance)≠ approve(management/admin)≠ execute(custodian),后端在 `refund_approve` 校验 `actor ≠ screener`;链上放行的 **M-of-N** 由 Hex Safe quorum 策略提供(平台不自建多签)。对齐 CCSS Level 3 的 maker-checker + 多方审批。

### 1.4 Key ceremony、保险、proof-of-reserves、误发防护

- **Key ceremony / rotation(P1/Phase 1):** 资产密钥 ceremony 由 Hex Trust 执行(平台方作为见证 + 存档 custody evidence,在 `/casino-ops` 展示为 "Hex Trust provided controls",不冒认自营);平台侧 ES256 API 签名密钥 ceremony 写入 runbook(见 1.1)。
- **Crime insurance / Lloyd's + proof-of-reserves(P2/Phase 2→3):** 展示 Hex Trust 的犯罪险/Lloyd's 承保 SLA 与 PoR 证明为托管方能力;Phase 3 若自营托管才需自建 PoR。对齐 Coinbase/BitGo 的保险 + 第三方 attestation。
- **Wrong-address 防护(P0/Phase 0):** 因 allowlist 只允许 `verified_wallets` 原钱包 + 入金先打 1 USDT 验证(`confirm-test` 写 `verified_wallets`,server.py:3073),误发面已大幅收敛;再补**链/资产/校验和一致性**(chainId 与地址格式匹配、EIP-55/TRON base58check 校验),落在 `record_verified_wallet` 与 withdrawal 入口。
- **Demo 旁路收口(P0/Phase 0):** `DEMO_STAFF_SESSION_TOKEN`→admin、`HT_DEMO_BYPASS_2FA` 仅靠 `SUMSUB_ENVIRONMENT != "production"` 单开关兜底,配错即 custodian 全失守。改为**多重 gate**(`ENV==production` 且 `HT_DEMO_BYPASS_2FA` 未设 且无 demo token 常量,任一不满足即拒启动),并在 CI 中禁止 demo 常量进生产 bundle。

### 1.5 该域 Top 威胁 → 缓解控制 → 本系统文件/端点/表

| Top 威胁 | 缓解控制 | 涉及文件/端点/表 |
|---|---|---|
| 提现出口无 allowlist,可发往任意地址 | 出口强制校验 `verified_wallets`(P0) | `/api/hexsafe/withdrawal`(server.py:2999)、`verified_wallets` |
| ES256 API 私钥明文常驻、无轮换/吊销 | 迁 KMS/HSM 签名 + IP allowlist + 90 天轮换(P0/P1) | `hexsafe_client.py` `_load_private_key`/`_sign`、`HEXSAFE_*` env |
| 客户端可指定/覆盖幂等 key,缓存永存明文 | 服务端派生 idem_key + TTL 清理(P1) | `_hexsafe_idem_get/put`、`hexsafe_idempotency` 表 |
| 零/负/超额提现、无速率与时间锁 | 金额校验 + velocity limit + cool-down(P1) | `refund_create`/`deposit_main`、`refund_requests`(新增 `cooldown_until`) |
| maker=checker 同角色批准 | 职责分离 + Hex Safe M-of-N quorum(P0) | `refund_screen/approve/execute`、`require_role` |
| Demo 旁路合成 admin/custodian 全权 | 多重 gate + CI 剥离 demo 常量(P0) | `HT_DEMO_BYPASS_2FA`、`DEMO_STAFF_SESSION_TOKEN`、`require_role` |
| 无资产签名符号越界(平台误持私钥) | CI grep 门禁禁资产签名库(P0) | `.github/workflows/hypertransfer-check.yml` |


---

## 二、链上与虚拟资产特有威胁(On-Chain & Crypto-Specific)

本域威胁不同于传统 Web 安全:攻击面在链上(合约、地址、确认数、mempool)与本系统「入金编排 + Hex Safe 托管」的接缝处。以下每条控制均锚定 `hypertransfer-main` 的真实对象,格式为「现状 → 目标态(落到哪个文件/函数/表/配置)」。

### 1. 入金伪造 / 假代币合约(fake-USDT / 假 TRC-20·ERC-20)【P0,牌照 Phase 0】

- **现状差距**:资产/网络白名单只限「USDT + ethereum/tron」(见 `deposit_requests` 状态机与 `client/src/lib/compliance.ts`),但**没有对代币合约地址做白名单**。`confirm-test` / `deposit_main` 只按 `txHash` 经 `hexsafe_client.get_deposit_by_tx_hash` 查到账,不校验发起该 transfer 的 **contract address** 是否为官方 USDT 合约。攻击者部署一个自命名为「USDT」的假 ERC-20/TRC-20,向我方 vault 地址打入大额假币,`get_deposit_by_tx_hash` 若只看金额+资产名即可能被误判到账 → 写 `verified_wallets` 甚至进入 `settle` 结算法币。
- **目标态**:在 `backend/hexsafe_client.py` 增加 `OFFICIAL_CONTRACTS` 常量并在到账判定处强校验——
  ```python
  OFFICIAL_CONTRACTS = {
    "tron": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",   # USDT-TRC20 官方
    "ethereum": "0xdAC17F958D2ee523a2206206994597C13D831ec7", # USDT-ERC20 官方
  }
  ```
  `confirm_test` / `deposit_main` 在写 `verified_wallets` 前必须断言 `deposit.contractAddress.lower() == OFFICIAL_CONTRACTS[chain]`,否则记 `deposit.fake_token_rejected` 审计并置 `screening_failed`。**对标**:Circle/Coinbase 均只认发行方规范合约(canonical contract),CCSS 要求「asset provenance verification」。

### 2. Address Poisoning / Dusting【P0–P1,Phase 0】

- **现状差距**:退款只退 `verified_wallets` 里的原钱包(`refund_create` 强制 `walletId` 属本人,`to_address` 由服务端从表冗余写入),这是**很好的抗 address-poisoning 设计**。但入金侧 `verified_wallets` 的写入来源是「客户输入的 source wallet + 1 USDT 验证」,若前端展示历史地址列表时对相似地址(仿冒前后 4 位的投毒地址)不做视觉去混淆,Member 可能选错。此外 dust 转入我方 vault 地址会污染 `list_transactions` 轮询。
- **目标态**:(a) `verified_wallets` 表增 `label` 与「显示完整地址 + checksum 高亮中段」的前端规则(`RefundProcess.tsx` 的 wallet picker 不能只显示 `0x1234…5678`);(b) 后端 `record_verified_wallet` 落库前对新地址与该用户既有 verified 地址做 Levenshtein 近似告警;(c) 轮询侧对 < `min_confirmations` 且金额低于 dust 阈值(如 < 1 USDT 且非验证单)的 transfer 直接忽略、不进合规队列。**对标** BitGo/Fireblocks 的 address allowlist + 转账前地址确认。

### 3. 确认数与 Reorg 攻击【P0,Phase 0】

- **现状差距(高危不一致)**:`hexsafe_client.min_confirmations` 返回 **sandbox 实测值 Sepolia=5 / Tron Nile=19**,而客户端 `lib/compliance.ts` 硬编码 **Tron=4 confirmations**——前端展示与后端放行阈值不一致,且 4 个 Tron 确认对大额 finality 不足。更关键:确认数是**静态**的,不随金额升高。小额 51% / reorg 攻击可在低确认窗口内让「已到账」交易回滚,而我方已写 `verified_wallets`、甚至已 `settle` 放法币。
- **目标态**:(a) 统一 confirmation 单一真相源——前端从 `GET /api/deposits/eligibility` 或新增 `/api/config/confirmations` 读后端 `min_confirmations`,删除 `compliance.ts` 硬编码;(b) 在 `hexsafe_client.min_confirmations(chain, amount_usd)` 引入**按金额动态提高**:
  ```python
  def required_confirmations(chain, amount_usd):
      base = {"tron": 19, "ethereum": 5}[chain]
      if amount_usd >= 100_000: return base * 3
      if amount_usd >= 10_000:  return base * 2
      return base
  ```
  (c) `confirm_test`/`deposit_main` 只有达到动态阈值才 `verify_status="confirmed"`;(d) `deposit_requests` 增 `reorg_watch` 态,`settle` 前再查一次 finality。**对标** Coinbase/Kraken 按金额分档确认;NIST/CCSS 的 finality 要求。

### 4. Wrong-Network Deposit(TRC-20 打到 ERC-20 地址)与不可退【P1,Phase 0】

- **现状差距**:Hex Safe 地址「按 vault×链固定」(`create_deposit_address` 只传 `chainId`),若 Member 把 TRC-20 USDT 打到我方 ERC-20 地址,链不匹配,资金可能永久锁死。`issue-address` / `MainDeposit.tsx` 未在 UI 强绑定「已发地址所属链」与用户选择的网络。
- **目标态**:`issue-address` 返回体带 `chainId` 并在 `deposit_requests` 落库;`MainDeposit.tsx` 收款页把链标签做成不可切换的醒目 badge + 「仅限 {TRC-20} 网络,打错网络资金不可退回」硬警示;后端 `confirm_test` 若 `get_deposit_by_tx_hash` 返回的 `chainId` ≠ 单据 `chainId`,置 `wrong_network` 态并进人工队列(不自动退,因退款也只走原链原钱包)。**对标** Binance/Coinbase 存款页的网络锁 + wrong-network 找回流程。

### 5. 内部转账 double-credit / 竞态【P0,Phase 0】

- **现状差距**:`deposit_main` 幂等再确认「不回退状态」,`refund_execute` 用 Hex Safe `idempotency_key`——方向正确。但 SQLite 下若无行级锁,两个并发 `confirm-test`(同 txHash)可能各自通过 `get_deposit_by_tx_hash` 后**都** `INSERT` 记账。`hexsafe_idempotency` 表用 `INSERT OR IGNORE` 防并发,但**入金侧到账写账没有等价的 tx-hash 唯一约束**。
- **目标态**:(a) `deposit_requests`(或新 `credited_txs` 表)对 `(chain, tx_hash)` 加 **UNIQUE 约束**,double-credit 直接被 DB 拒;(b) 记账走 `BEGIN IMMEDIATE` 事务 + `WHERE status != 'settled'` 的条件 UPDATE(compare-and-set);(c) 迁移到 PostgreSQL 后用 `SELECT … FOR UPDATE` 锁单据行。**对标** 交易所 ledger 的幂等 idempotency-key + 唯一 tx 约束。

### 6. 退款 / Payout 滥用 + `/api/hexsafe/withdrawal` 地址越权【P0,Phase 0–1】

- **现状差距(高危)**:`POST /api/hexsafe/withdrawal`(`require_role("custodian")`)接受**任意 `toAddress` / `amountDecimal` 字符串**,端点注释自认「原钱包校验由上层保证」。绕过 `/api/refunds` 退款流直接调该端点,即可向**任意外部地址**提现,`verified_wallets` 白名单形同虚设。且 `amountDecimal` 仅 `min_length` 校验,可传「0/-100/超额」。
- **目标态**:(a) `/api/hexsafe/withdrawal` 内**强制**校验 `toAddress` 存在于本次退款单关联的 `verified_wallets`(或干脆禁止直接调用、只允许 `refund_execute` 内部调用);(b) 在 `RefundCreate`/`WithdrawalBody` 的 Pydantic model 加 `amount_decimal: condecimal(gt=0)` 与上限校验;(c) 落地真正的 **maker-checker**——`refund_screen`(compliance)、`refund_approve`(management)、`refund_execute`(custodian)必须为**不同自然人**,`approve→execute` 之间对金额/钱包做二次冻结哈希校验。**对标** Fireblocks/Copper 的 transaction policy + 4-eyes;CCSS 的 dual-control。

### 7. USDT depeg 处置【P1,Phase 1(MSO)】

- **现状差距**:`settle` 的 USDT→法币按 `DEPOSIT_FIAT_RATE` 固定 demo 汇率,`treasury-ops.ts` 有 0.95 触发阈值但仅 mock。真实脱锚时按 1:1 结算法币会造成 Treasury Account 亏损。
- **目标态**:`settle` 前查实时预言机报价,若 USDT/USD < 可配 `DEPEG_HALT_THRESHOLD`(默认 0.98)则**冻结自动结算**、进人工 + HT Markets OTC 通道;阈值入环境变量。**对标** Circle/Kraken 的 stablecoin depeg circuit-breaker。

### 8. Mempool / 抢跑 & 链上实时监控 / 地址标签【P1–P2,Phase 1–2】

- **现状差距**:到账靠 `list_transactions` 轮询(sandbox 无 webhook),无 mempool 层监控,无地址标签/黑名单。Wallet KYT `screen_source_wallet` 仍是**按地址子串的 mock**。
- **目标态**:(a) 把 `screen_source_wallet` 换成真实 KYT(据 CLAUDE.md 口径优先 Hex Safe KYT 端点,未文档化前回落 Chainalysis/TRM),对来源钱包与退款原钱包做制裁/mixer/tainted-exposure 打标,写入 `verified_wallets` 的风险快照;(b) 提现前对 `toAddress` 再跑一次实时 KYT(地址可能在验证后被标脏);(c) Phase 2 引入 mempool 监听防大额 payout 抢跑。**对标** Chainalysis KYT + Elliptic 实时地址监控。

### 9. Gas 承担变更的安全副作用【P1,Phase 1】

- **现状差距**:口径已从「免 gas」反转为「gas 由客户承担、从到账金额扣除」(`lib/currency.ts` `DEPOSIT_FEE_MODEL`,`estimatedReceived = deposit − gas`)。安全副作用:若 gas 值前端可篡改或后端不校验,攻击者可把 gas 置 0 套取全额,或反向被展示层欺骗。`estimatedReceived` 目前是前端算的展示值。
- **目标态**:credited 金额必须由**后端**在 `deposit_main`/`settle` 权威计算并落 `deposit_requests`,前端 `DepositSuccess.tsx` 只读展示;费用模型参数(gas、筛查费)入后端配置,不接受客户端传入。**对标** 结算金额服务端权威、客户端只读。

### 本域 Top 威胁 → 缓解控制 → 涉及本系统对象

| Top 威胁 | 缓解控制 | 本系统文件 / 端点 / 表 |
|---|---|---|
| 假 USDT 合约到账 | 官方合约地址白名单强校验 | `hexsafe_client.get_deposit_by_tx_hash`、`confirm-test`、`OFFICIAL_CONTRACTS` |
| Reorg / 确认数不足 | 单一真相源 + 按金额动态确认 | `hexsafe_client.min_confirmations`、`lib/compliance.ts`、`/api/deposits` |
| withdrawal 地址越权 | `toAddress` 强绑 `verified_wallets` + maker-checker | `/api/hexsafe/withdrawal`、`refund_execute`、`verified_wallets`、`refund_requests` |
| double-credit 竞态 | `(chain,tx_hash)` UNIQUE + CAS 事务 | `deposit_requests`、`confirm-test`、`deposit_main` |
| 金额 0/负/超额 | Pydantic `condecimal(gt=0)` + 上限 | `RefundCreate`/`WithdrawalBody` model、`refund_create` |
| Wrong-network 打款 | 收款页链锁 + `chainId` 一致性校验 | `issue-address`、`MainDeposit.tsx`、`get_deposit_by_tx_hash` |
| USDT depeg | 结算前预言机 + circuit-breaker | `settle`、`treasury-ops.ts`、`DEPEG_HALT_THRESHOLD` |
| 来源/退款钱包脏地址 | 真实 KYT 替换 mock + 提现前复筛 | `screen_source_wallet`、`refund_screen`、`verified_wallets` |
| Address poisoning | 地址近似告警 + 全址展示 | `record_verified_wallet`、`RefundProcess.tsx` picker |
| gas 套利 / 展示欺骗 | credited 金额后端权威计算 | `deposit_main`/`settle`、`lib/currency.ts`、`DepositSuccess.tsx` |

**优先级摘要**:P0(上线前必须,Phase 0)= 假合约白名单、确认数统一+动态、withdrawal 地址越权、double-credit 唯一约束、金额校验、maker-checker;P1(0–3 月)= wrong-network 链锁、depeg circuit-breaker、真实 KYT、gas 后端权威;P2(3–12 月,随 Phase 2 自营 OTC)= mempool 抢跑监控、地址标签图谱。

---

## 三、Hex Safe 与 Sumsub 第三方 API 调用安全(出站集成 — 最高敏感信任边界)

Hex Safe 与 Sumsub 是本平台**唯一能触达"资金动作"与"合规裁决"的出站集成**:前者经 `hexsafe_client.py` 的 `create_withdrawal` / `create_deposit_address` 直接驱动 Treasury Account 出入金,后者经 `/api/sumsub/*` + webhook 决定 `user_kyc_ok` 从而放行整条入金/退款闸门。任一被攻破 = 资产被转走或凭空翻转 KYC。因此这两条出站链路是本系统的 crown-jewel 信任边界,须单独成域、按最严标准治理。

### A. Hex Safe(资金侧)ES256 私钥 + x-api-key 全生命周期

**现状**:`_load_private_key()` 直接读 `HEXSAFE_PRIVATE_KEY`(PEM 明文)或 `_PATH`,`HexSafeClient.__init__` 把私钥常驻 `self.private_key` 内存,`_build_jwt` 用 `jwt.encode(claims, self.private_key, algorithm="ES256")` 在进程内签名。这意味着私钥明文躺在容器环境变量/SQLite 同宿主的文件里,`hypertransfer-check.yml` 若误打日志或 core dump 即泄露,且无版本/轮换/吊销路径,sandbox 与 prod 共用同一套 `HEXSAFE_*` env 无物理隔离。

**目标态(改哪里)**:
- **P0** 私钥迁入云 KMS(AWS KMS / GCP KMS,ECDSA P-256),**签名在 KMS 内完成**:改造 `_build_jwt`,把本地 `jwt.encode` 换成"构造 JWT header+payload → 送 KMS `Sign(digest, ECDSA_SHA_256)` → 拼接 DER→JOSE 签名"。私钥永不出 KMS、永不落 `.env`/仓库/日志/前端,`_load_private_key()` 降级为"仅拿 KMS keyId"。对齐 Fireblocks/Copper 的"签名材料不出 HSM 边界"。
- **P0** sandbox 与 prod 密钥**物理分离**:不同 KMS keyId + 不同 IAM 角色,部署 workflow 的 production 守卫扩展为"检测到 sandbox keyId 即拒绝部署"(复用现有 `HT_ALLOWED_ORIGINS=*` 拒绝部署那套逻辑)。
- **P0** 出站走**固定 egress IP**(香港服务器 NAT 静态出口),在 Hex Safe 侧配 **IP allowlist**,使 `HEXSAFE_API_KEY` 即便泄露也无法从任意主机使用;`docker-compose.yml` 增加 egress 约束。
- **P1** 定期(90 天)+ 事件驱动轮换与即时吊销,`api-key`/KMS key 双人保管(KMS grant + GitHub Environment 双 approver),对齐 CCSS Level 2 密钥管理。

**每请求防篡改/重放已有基础**:`_build_jwt` 的 `exp`(默认 60s 短 TTL)、`nonce = secrets.randbits(63)`、写操作 `digest = SHA-512(body)` 已到位,保留即可;应补 **P1** TLS 证书 pinning——现状 `urllib.request.urlopen` 仅默认校验且 `User-Agent` 伪装成浏览器绕 Cloudflare,应固定 `api.hexsafe.hextrust.com` 的证书指纹/CA。

### B. 提现幂等与响应零信任(防 double-withdrawal / 供应商投毒)

**现状**:`_hexsafe_idem_put` 用 `INSERT OR IGNORE INTO hexsafe_idempotency(idem_key,…)` 服务端持久化去重、仅缓存成功、`create_withdrawal` 带 `x-request-id`,方向正确。但缺陷:(1) `idem_key` 可由调用方指定,攻击者传相同 key 可探测/覆盖缓存;(2) `hexsafe_idempotency` 永不过期且明文存 to/from/金额;(3) `create_withdrawal` 接受任意 `to_address`,注释称"原钱包校验由上层保证",绕过退款流直调即可向任意地址提现。

**目标态**:
- **P0** `idem_key` **服务端派生**——`sha256(user_id + walletId + amountDecimal + refund_request_id)`,禁用客户端传入;`hexsafe_idempotency` 加 `expires_at` + 定时清理。
- **P0** `to` 地址**应用层强白名单**:`create_withdrawal` 落地前强制校验 `to_address ∈ verified_wallets[user_id]`(与 `refund_create` 的 400 校验对齐),把退款红线下沉到最贴近资金动作的一层,防越过 `refund_screen→approve` 编排。
- **P0** 对 Hex Safe 响应**零信任**:`_hexsafe_call` 返回后逐字段比对 `amount/to/chainId/vaultId` 与 `deposit_requests`/`refund_requests` 本地意图,任一不符即 fail-closed + 审计 `withdrawal.tamper`,防中间人或供应商被攻陷返回被篡改数据。
- **P0** 关键资金动作**绝不单靠我方**:强制依赖 Hex Safe 侧 quorum/maker-checker,做到"即使我方后端被完全攻陷,单方也无法把资产转出"——对齐 BitGo/Anchorage 多签托管边界;应用层再叠 maker-checker(现状退款 `screen→approve` 可同一 compliance 角色,**P1** 拆成不同自然人)。
- **P0** 超时/熔断/重试**一律 fail-closed**:Hex Safe 不可达时 `/api/deposits/issue-address` 与 `/api/hexsafe/withdrawal` 直接冻结(现 production 未配置返回 503,须扩展到运行时不可达),**绝不降级绕过或放行**。

### C. Sumsub(合规裁决侧)webhook 入站——最危险面

**现状**:`sumsub_webhook`(server.py:2725)已校验 `x-payload-digest` HMAC + `compare_digest`,签名不符抛 401——方向正确。但**致命 fail-open**:仅当 `SUMSUB_WEBHOOK_SECRET_KEY` 非空才校验,未配置时 `signature_valid` 恒为 `None` 且**照常入库并翻转 KYC**。攻击者对未配 secret 的实例伪造一条 `reviewAnswer=GREEN` 即可凭空过 KYC,绕过 `user_kyc_ok` → 打通入金/退款。

**目标态**:
- **P0** webhook **强制校验**:`SUMSUB_WEBHOOK_SECRET_KEY` 未配置时对非 sandbox **直接 401**(移除 fail-open 分支);叠加 `x-timestamp` 防重放(拒绝 >5min 偏移)+ 基于 `applicantId+ts` 幂等。
- **P0** KYC/AML 结论以**服务端主动回查**为准:webhook 只当"触发器",实际以 `sumsub_get_review_status(applicant_id)` 回查 API 结果写 `sumsub_kyc_applications`,状态变更写不可变审计(`audit_trail` **P1** 加哈希链)。这也解决现状 TR gate 被前端回填绕过——`/api/deposits/issue-address` 的 `travelRuleStatus` 应改为后端回查 Sumsub 而非信客户端字符串。
- **P0** applicantId/结论**严格绑定 user_id**(防 BOLA/串号):`sumsub_ensure_applicant` 以 `external_user_id` 派生自 `user_id`,webhook 命中后须校验 `applicant_id` 归属当前 user,拒绝跨用户覆盖。
- **P1** Sumsub App Token/Secret 同入 KMS、最小 scope、按 `SUMSUB_ENVIRONMENT` 隔离;`send_invitation_email` 用户名插 HTML 的注入面顺带修掉(转义)。

### D. 通用:内部集成网关 + 泄露检测

**P1** 所有对二者的出站调用统一经**内部集成网关模块**(封装 `hexsafe_client` / `sumsub_request`):集中鉴权、限频、SSRF 防护(**禁止用户可控输入拼进出站 URL**——现 `to_address`/`chainId` 须白名单枚举)、审计每次调用的请求/响应指纹 + 关联 `x-request-id`。**P1** 密钥泄露检测:GitHub secret scanning + gitleaks 进 `hypertransfer-check.yml`、KMS/Sumsub 埋 canary token、出站异常(非 allowlist IP、异常频率)告警。对标 Fireblocks/Circle:托管与 KYC 凭据隔离存储、按环境轮换、最小授权、签名不出边界。

### Top 威胁 → 缓解 → 涉及对象

| Top 威胁 | 缓解控制(优先级 / Phase) | 本系统文件/端点/表 |
|---|---|---|
| ES256 私钥泄露 → 任意提现 | KMS 内签名 + IP allowlist + sandbox/prod 分离(P0 / Phase 0-1) | `hexsafe_client.py::_build_jwt`/`_load_private_key`、`HEXSAFE_*`、docker-compose egress |
| double-withdrawal / 重复放款 | 服务端派生 `idem_key` + 加 TTL + `INSERT OR IGNORE`(P0 / Phase 0) | `_hexsafe_idem_put`、`hexsafe_idempotency` 表 |
| 越过退款流向任意地址提现 | `to_address ∈ verified_wallets` 强校验(P0 / Phase 0) | `create_withdrawal`、`/api/hexsafe/withdrawal`、`verified_wallets` |
| 供应商被攻陷返回篡改数据 | 响应零信任逐字段比对 + fail-closed(P0 / Phase 1) | `_hexsafe_call`、`deposit_requests`/`refund_requests` |
| 后端单方转出资产 | 依赖 Hex Safe quorum + 应用层 maker-checker(P0 / Phase 1-2) | `refund_screen`/`refund_approve`/`refund_execute` |
| 伪造 webhook 翻转 KYC=GREEN | 强制签名(移除 fail-open)+ 主动回查 + 幂等(P0 / Phase 0) | `sumsub_webhook`、`SUMSUB_WEBHOOK_SECRET_KEY`、`sumsub_get_review_status`、`sumsub_kyc_applications` |
| TR gate 前端回填绕过 | 后端回查 Sumsub TR 结果(P0 / Phase 1) | `/api/deposits/issue-address`、`/api/sumsub/travel-rule/*` |
| applicant 串号(BOLA) | applicantId 绑定 user_id 校验(P0 / Phase 0) | `sumsub_ensure_applicant`、`sumsub_webhook_events` |
| 密钥入仓/日志泄露 | secret scanning + canary + 出站告警(P1 / Phase 1) | `hypertransfer-check.yml`、KMS grant |

---

## 四、API 与集成安全（API & Integration Security）

本节聚焦 HyperTransfer 三条外部信任面——**Hex Safe 托管 API（出金/发址）、Sumsub（KYC/Travel Rule）、自有 REST API（`/api/deposits*`、`/api/refunds*`、`/api/hexsafe/*`）**——的入站/出站安全，以及跨切面的 OWASP API Top 10。资金动作全部经这三条链，任何一环签名、幂等或越权失守都可导致 Treasury Account 直接失血。

## 1. Hex Safe 出站签名与密钥托管

**现状**：`backend/hexsafe_client.py` 已做对：每请求新签 ES256 JWT（claims `exp`/`api-key`/`uri`/`nonce=secrets.randbits(63)`，POST/PUT 加 `digest=SHA-512(body)` base64url），`exp` 默认 60s（`HEXSAFE_JWT_TTL`），写操作带 `x-request-id`。**差距**：`_load_private_key()` 把 PEM 明文读进 `self.private_key` 长驻进程内存，靠 `HEXSAFE_PRIVATE_KEY`/`_PATH` 环境变量存放；无密钥轮换、无 IP allowlist、无证书 pinning、响应体无真实性校验。

**目标态**：
- **密钥迁 KMS/HSM（P0，Phase 0）**：`_load_private_key()` 改为不再返回明文 PEM，而是把 ES256 签名动作下沉到 **AWS KMS `Sign`（ECC_NIST_P256）或云 HSM**——`hexsafe_client.py` 只持有 `keyId`，私钥永不出 HSM 边界。参照 Fireblocks/BitGo 的 co-signer 私钥不落盘做法。过渡期若暂用 KMS，至少将 `.env` 里的裸 PEM 换成 KMS 加密的密文（envelope encryption）。
- **密钥轮换（P1）**：`HEXSAFE_API_KEY`/私钥支持双版本并存（`HEXSAFE_KEY_ID` claim 标注版本），配 GitHub Actions/密钥管理服务定期轮换（90 天）+ 泄露即时吊销 runbook。
- **IP allowlist（P0）**：向 Hex Trust 申请把出站源 IP（香港服务器）加入其 allowlist；`deploy/nginx.conf` 前无需改，但部署 runbook 固定出口 IP。
- **exp/nonce/digest 已达标（保持）**：仅需把 `HEXSAFE_JWT_TTL` 从 60s 保持短、并**验证 nonce 位宽足够**（`randbits(63)` OK）。补做**响应校验**：`_hexsafe_call` 对返回体做 schema 校验（P1）。

## 2. 出金幂等与 `to` 地址强校验

**现状**：`hexsafe_idempotency` 表按 `idem_key` 持久化、仅缓存 2xx、`INSERT OR IGNORE` 防并发，重放走 `withdrawal.replay` 审计——设计良好。**两处高危差距**：(a) `/api/hexsafe/withdrawal`（`server.py:3000`，`require_role("custodian")`）本身接受任意 `toAddress`，注释称"原钱包校验由上层保证"，**绕过退款流直调即可向任意地址提现**；(b) 幂等 key 可由调用方指定、永不过期、明文缓存 to/from/金额入 SQLite。

**目标态**：
- **P0**：在 `hexsafe_withdrawal` 内部**强制**回查 `SELECT id FROM verified_wallets WHERE user_id=? AND address=?`（同 `refund_create` 的红线），`toAddress` 不属本人 verified_wallets 直接 403——把退款流的合规红线下沉到托管端点本身，防 BFLA/参数越权。参照 Anchorage/Copper 的 withdrawal address allowlist 强制。
- **P1**：幂等 key **服务端派生**（`hash(user_id+refund_id+amount+to)`）而非客户端传入，防探测/覆盖缓存；给 `hexsafe_idempotency` 加 `created_at` TTL 清理任务，敏感字段迁 PostgreSQL 后做**列级加密**（现明文入非生产 SQLite）。

## 3. Sumsub 与所有入站 Webhook

**现状**：KYC/TR 走 Sumsub（`/api/sumsub/*`），但 `deposit_requests` 的 TR gate 在 `issue-address`/`main` 里**取前端传入的 `travelRuleStatus` 字符串**对齐，后端未回查 Sumsub 真实结果——客户端可直接传 `travel_rule_accepted` 越过 Travel Rule（中危）。`/api/sumsub/kyc/demo-approve` 仅靠 `SUMSUB_ENVIRONMENT!="production"` 单开关拦截。

**目标态**：
- **Webhook 签名校验（P0）**：为 Sumsub webhook 新增 `POST /api/sumsub/webhook`，用 `hmac.compare_digest` 校验 Sumsub 的 `x-payload-digest`（HMAC-SHA256，密钥走 `SUMSUB_WEBHOOK_SECRET` 环境变量）+ **时间戳窗口 ±5min 防重放** + **event_id 幂等表**（复用 `hexsafe_idempotency` 模式建 `webhook_events` 表）。KYC/TR 状态**只以 webhook 回调为准**落库，`issue-address`/`main` 改为**服务端回查 `deposit_requests.travel_rule_status`**（后端权威列），不再信前端字符串。
- **通用入站 webhook 中间件（P0）**：所有第三方回调统一走 `verify_webhook(provider, body, headers)`——HMAC 校验 + 时间戳 + 幂等三件套，失败即 401 且不落任何状态。世界级做法（Circle/Coinbase）webhook 一律签名+重放窗口。
- **demo 旁路收敛（P0）**：`demo-approve`/`DEMO_STAFF_SESSION_TOKEN`/`HT_DEMO_BYPASS_2FA` 增加**第二独立开关**（如 `HT_ENV=prod` 编译期剔除 + 部署 workflow 硬断言），不再单靠 `SUMSUB_ENVIRONMENT` 一个字符串。

## 4. OWASP API Top 10 与横切控制

- **BOLA/BFLA（P0，已部分达标）**：patron 端点 `_deposit_owned_or_404` 用 404 不泄露归属、staff 端点 `require_role` 服务端强制——保持。补：为 `require_role` 加**单元测试矩阵**确保每个资金端点都挂了守卫（漏配即暴露），并对退款 `screen→approve→execute` 强制**maker-checker 分离**（现同一 compliance 角色可 screen+approve）。
- **Mass Assignment（P1）**：入金/退款入参已用 Pydantic `Field`，但 `amountDecimal` 仅 `min_length=1` 字符串——**加 `>0` 与上限校验**（现可提交 "0"/"-100"/超额），落在 `RefundCreateIn`/`DepositMainIn` 的 validator。
- **速率限制与配额（P0）**：`login/start` 对密码错误**无节流**（可无限撞库）、nginx 无 `limit_req`。落地：nginx `deploy/nginx.conf` 加 `limit_req_zone`（登录/OTP/发址接口）+ 应用层对 `login/start` 加账号级失败计数锁定 + 前置 WAF（Phase 1）。
- **SSRF（P1）**：`_hexsafe_call`/`send_email` 的目标 host 走环境变量常量（`SMS_API_URL`/`SMTP_HOST`），保持**不接受任何用户可控 URL**；新增第三方对接时禁止用户输入决定回调/请求地址。
- **mTLS / 请求签名（P2，Phase 1–2）**：Operator 后台 `/api/hexsafe/*`、`/casino-ops` 员工面引入 **mTLS 客户端证书**（nginx `ssl_verify_client`）作为第二因子；对外 API 逐步引入请求签名（HMAC over method+path+body+timestamp）。
- **OpenAPI 契约校验（P1）**：FastAPI 已自带 schema，补 **CI 阶段用 `schemathesis` 对 OpenAPI 做属性化 fuzz**（`hypertransfer-check.yml` 加一步），并对入站 body 做**严格模式**（`model_config = ConfigDict(extra="forbid")`）拒未知字段。
- **传输安全（P0）**：compose 仅暴露 HTTP:8080，token/OTP/PII 明文传输 + `lib/api.ts` 的 localStorage token 放大风险。落地：nginx 终止 TLS（Caddy/Traefik 自动证书）、`CORS` 从默认 `*` 收窄到 `HT_ALLOWED_ORIGINS=https://h5.hypercypto.com`（现仅 production 分支被 workflow 拦，staging/手动 compose 仍放开）。

## 5. 威胁 → 缓解 → 涉及对象

| Top 威胁 | 缓解控制 | 本系统文件/端点/表 |
|---|---|---|
| 私钥泄露→伪造出金 | ES256 签名迁 KMS/HSM + 密钥轮换 + IP allowlist | `backend/hexsafe_client.py` `_load_private_key`/签名 |
| 绕退款流向任意地址提现（BFLA） | withdrawal 端点强制回查 verified_wallets | `/api/hexsafe/withdrawal`、`verified_wallets` |
| 出金重放/幂等覆盖 | 服务端派生幂等 key + TTL + 列加密 | `hexsafe_idempotency`、`hexsafe_withdrawal` |
| 前端伪造 TR gate 越过 Travel Rule | webhook 签名回落权威状态、后端回查不信前端 | `/api/sumsub/*`、`deposit_requests.travel_rule_status`、`/api/deposits`(issue-address/main) |
| 入站 webhook 伪造/重放 | HMAC 校验 + 时间戳窗口 + event 幂等 | 新增 `/api/sumsub/webhook`、`verify_webhook`、`webhook_events` |
| demo 旁路被误开→冒充 admin | 双开关 + 编译剔除 + 部署断言 | `HT_DEMO_BYPASS_2FA`、`DEMO_STAFF_SESSION_TOKEN`、`SUMSUB_ENVIRONMENT` |
| 登录撞库/OTP 刷量 | nginx limit_req + 账号级失败锁定 + WAF | `deploy/nginx.conf`、`/login/start`、`/api/send-otp` |
| 零/负/超额金额注入 | Pydantic validator `>0`+上限 | `RefundCreateIn`/`DepositMainIn`、`/api/refunds`/`/api/deposits`(main) |
| 明文传输/CORS 放开 | TLS 终止 + CORS 收窄正式域名 | `docker-compose.yml`、`deploy/nginx.conf`、`HT_ALLOWED_ORIGINS` |

**优先级映射**：Phase 0（技术服务商，上线前）必须完成 KMS 签名、withdrawal 地址强校验、webhook 签名、demo 双开关、TLS+CORS、限频（全 P0）；Phase 1（MSO）补密钥轮换、幂等派生、OpenAPI fuzz、maker-checker（P1）；Phase 2–3（VA Dealing/Custody）叠加 mTLS、请求签名、CCSS/SOC2/ISO 27001 审计证据链（P2）。


---

## 五、应用安全与安全 SDLC(AppSec & Secure SDLC)

HyperTransfer 是一条把 patron 资金从来源钱包搬进 Treasury Account、再经 Hex Safe 提现的编排链。任何一处应用层缺陷都可能被放大成资金越权或合规闸门旁路,因此 AppSec 的目标不是"通用加固清单",而是把 `server.py` 的每个资金/合规端点、`client/` 的每个信任边界、以及 CI/CD 与供应链都收敛到可审计、可吊销、无 demo 后门的状态,并按 CCSS Level 2/SOC 2/OWASP ASVS L2 + API Top 10 对标 Fireblocks/Anchorage/Circle 的做法。

### 5.1 后端 FastAPI 加固

**输入校验(Pydantic 严格化)。** 现状:`refund_create`/`deposit_main` 的 `amountDecimal` 仅 `min_length=1` 字符串,能提交 `"0"`/`"-100"`/超额;`issue-address`/`main` 直接吃前端传入的 `travelRuleStatus`。目标态:在 `backend/server.py` 为这些 body 定义 `class RefundCreate(BaseModel)`,`amountDecimal` 用 `condecimal(gt=0, max_digits=18, decimal_places=8)`、`walletId` 用 `constr(pattern=…)`,`model_config = ConfigDict(extra="forbid")` 拒绝多余字段;金额上限交由服务端从 `verified_wallets`/vault 状态推导,**绝不信任前端**。TR gate 改由 `issue-address` 回查 `/api/sumsub/travel-rule` 真实结果而非对齐前端字符串——这直接消除 §入金评估里"TR gate 可被前端回填绕过"。**[P0,Phase 0]**

**参数化 SQL / 防注入。** 现状已达标:全查询走 `?` 占位,唯一 f-string(`_deposit_update` 拼内部列名)值仍参数化。目标态:迁 PostgreSQL 时保持 psycopg3 参数化,把 `_deposit_update` 的列名改为白名单 `dict` 映射而非字符串拼接,杜绝将来误引外部值。**[P1,Phase 1]**

**错误脱敏 + 安全响应头。** 现状:`_hexsafe_call` 已把 HexSafeError→502 且不外泄堆栈,登录错误已模糊化。差距:无全局 500 兜底、无安全响应头。目标态:加 `@app.exception_handler(Exception)` 统一返回 `{"detail":"internal_error","ref":<uuid>}`(ref 落 `audit_trail` 便于溯源),并在 nginx 反代或 FastAPI middleware 注入 `Strict-Transport-Security`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`——当前 `deploy/nginx.conf` 只有 `Cache-Control`,一条 `add_header` 都没有。**[P0,Phase 0]**

**登录限频。** 现状:OTP/challenge 有限频,`login/start` 密码错误无节流,可无限撞库。目标态:在 `login/start` 加基于 `(email, client_ip)` 的滑动窗口计数(复用 SQLite 或迁 Redis),N 次失败锁定 + 指数退避,对齐 ASVS V2.2。**[P0,Phase 0]**

### 5.2 前端 React 加固

**Token 存储。** 现状:`lib/api.ts` 把会话 token 明文写 `localStorage("ht_token")`,任一 XSS 即可盗整表。目标态:后端 `login/verify` 改经 `Set-Cookie: HttpOnly; Secure; SameSite=Strict` 下发,`lib/api.ts` 去掉 `TOKEN_KEY` 读写、请求带 `withCredentials`;`AuthContext.tsx` 启动仍调 `/me` 但不再持有 token。这是与 §客户端清单一致的头号项。**[P0,Phase 1]**

**CSP / Trusted Types / DOM sink。** 现状:`client/index.html` 无任何 CSP,直连 Google Fonts 无 SRI,`components/ui/chart.tsx:81` 存在 `dangerouslySetInnerHTML`。目标态:nginx 下发 `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'`,Google Fonts 自托管进 bundle 去掉外链信任面;审计 `chart.tsx` 的注入内容确保仅来自内部常量(qrPngBase64 等 base64 用 `<img src>` 而非 innerHTML)。对标 Coinbase 前端全站 CSP + Trusted Types。**[P0,Phase 0]**

### 5.3 移除生产 demo bypass(资金安全红线)

现状最危险:`DEMO_STAFF_SESSION_TOKEN="demo-local-staff-session"` 是硬编码 bearer,`user_from_token` 认到即合成 **admin 全权限**;`DEMO_LOCAL_SESSION_TOKEN` 冒充任意 patron;`HT_DEMO_BYPASS_2FA` 下 `login/verify`/`verify_email_otp` 接受任意 6 位码;`/api/sumsub/kyc/demo-approve` 一键标 KYC approved。**全部仅靠 `SUMSUB_ENVIRONMENT != "production"` 一个字符串开关兜底,配错即完全失守。** 目标态:①这些常量/端点用编译期剔除——把 demo-auth 逻辑抽到独立模块,生产 Docker build 阶段用环境或构建参数彻底不打包(`client/src/lib/demo-auth.ts` 走 Vite `import.meta.env` tree-shake + 后端 `if not DEMO_ENABLED: return None` 前置);②增加"fail-closed 自检":`SUMSUB_ENVIRONMENT` 无法解析或缺失时**默认按 production 关闭旁路**,而非默认 sandbox;③CI 加一条 gitleaks/grep 断言:main 分支若命中 `DEMO_STAFF_SESSION_TOKEN` 参与授权路径则 fail。这是上线前的绝对前置。**[P0,Phase 0]**

### 5.4 供应链安全

现状:`Dockerfile.frontend` 用 `node:22-slim`/`nginx:1.27-alpine` tag 非 digest,CI 只跑 typecheck+build,无 SBOM、无 SCA、无镜像扫描。目标态:①`.github/workflows/hypertransfer-check.yml` 加 `pnpm audit --audit-level=high` + `pip-audit`(锁 `pnpm-lock.yaml`/`requirements.txt`),开 Dependabot/Snyk PR 门禁;②每次 build 用 `syft` 生成 CycloneDX SBOM 作为 artifact;③Dockerfile 全部 pin 到 `@sha256:` digest,镜像过 `trivy image`;④npm 投毒防护:`pnpm config set minimum-release-age`(延迟拉新版)+ CI 校验 lockfile 未被篡改 + 关键依赖 provenance;⑤构建产物用 cosign 签名 + GitHub OIDC keyless,部署侧 `hexsafe-deploy-hk.yml` 只放行已签镜像,对标 Circle/Kraken 的 SLSA build provenance。**[P1,Phase 1]**

### 5.5 Secure SDLC

**威胁建模。** 对资金链(`/api/deposits/issue-address`→`confirm-test`→`/api/hexsafe/withdrawal`)与退款链做 STRIDE,重点覆盖"绕过退款流直接调 withdrawal 向任意 `to_address` 提现"——现 withdrawal 端点仅 `custodian` 角色但不强校验目标属 `verified_wallets`,应在端点内加 `assert to_address in verified_wallets(user_id)`。**[P0,Phase 0]**

**SAST/DAST/IaC + pre-commit secret 扫描。** 现状 CI 无安全扫描,`seed_demo.py` 固定 TOTP secret、`seed_staff_admin` 把 secret 打日志。目标态:CI 加 Semgrep(FastAPI/React 规则集)+ Bandit + OWASP ZAP baseline 打 staging;`.pre-commit-config.yaml` 接 **gitleaks** 阻断 `HEXSAFE_PRIVATE_KEY`/TOTP secret/`SMTP_*` 入库;docker-compose/nginx.conf 过 `checkov`/`hadolint`(检出 Dockerfile 无 `USER` 非特权用户、镜像 root 运行)。**[P0→P1,Phase 0-1]**

**Code review + 分支保护。** GitHub 开启 main 必需 PR + ≥1 审批 + 全 status check 通过 + 禁止 force-push;资金/合规端点(`server.py` 的 `require_role`/`user_kyc_ok`/`refund_execute`)与 `hexsafe_client.py` ES256 签名列为 CODEOWNERS 强制安全评审。**[P0,Phase 0]**

### 5.6 该域 Top 威胁 → 缓解控制 → 涉及对象

| Top 威胁 | 缓解控制 | 本系统文件 / 端点 / 表 |
|---|---|---|
| Demo bypass 冒充 admin/patron 越权 | 生产剔除常量 + fail-closed 自检 + CI 断言 | `server.py` `user_from_token`、`DEMO_STAFF_SESSION_TOKEN`、`HT_DEMO_BYPASS_2FA`、`lib/demo-auth.ts` |
| 绕退款流向任意地址提现 | withdrawal 端点强校验目标属已验证钱包 | `/api/hexsafe/withdrawal`、`refund_execute`、`verified_wallets` 表 |
| 前端回填绕过 TR / 零负超额金额 | Pydantic 严校 + 服务端回查 Sumsub TR | `/api/deposits/issue-address`、`main`、`deposit_requests` 表 |
| XSS 盗 localStorage token | HttpOnly Cookie + CSP + Trusted Types | `lib/api.ts`、`client/index.html`、`deploy/nginx.conf`、`ui/chart.tsx` |
| 撞库 / 短信轰炸 | 登录限频 + WAF/`limit_req` | `/login/start`、`/api/send-otp`、`deploy/nginx.conf` |
| 供应链投毒 / 无签镜像 | SBOM + SCA + digest pin + cosign 签名 | `Dockerfile.frontend`、`hypertransfer-check.yml`、`pnpm-lock.yaml` |
| 私钥/密钥泄露入库 | pre-commit gitleaks + CODEOWNERS 评审 | `hexsafe_client.py`、`seed_demo.py`、`.env`、`audit_trail` 表 |


---

## 六、身份、认证与授权(Identity, AuthN & AuthZ)

身份域是本平台的最高价值攻击面:一次会话劫持或一次越权提现,直接等于资金离开 Treasury Account。本节以「现状 → 目标态」逐条锚定 `hypertransfer-main/backend/server.py`、`client/src/lib/api.ts`、`hexsafe_client.py` 等真实对象给出控制。

### 6.1 员工端 Okta OIDC/SSO + phishing-resistant MFA(P0,Phase 0)

- **现状**:`/ops` 走 `StaffLogin.tsx` 的「Sign in with Okta」按钮,实际调 `finish(DEMO_STAFF_TOKEN, ...)` 直接注入静态 bearer `demo-local-staff-session`(`demo-auth.ts:4`),后端 `user_from_token`(server.py:1263)识别该 token **合成 admin 全角色**,仅靠 `SUMSUB_ENVIRONMENT != "production"` 一个字符串开关兜底。这是 Fireblocks/Anchorage 级别产品绝不允许的「后门 admin」。
- **目标态**:后端新增 `/api/staff/oidc/callback`,用 `authlib` 校验 Okta 签发的 ID Token(验 `iss`/`aud`/`exp`/`nonce`,JWKS 轮询),从 `groups` claim 映射 `user_roles`;`user_from_token` 删除 `DEMO_STAFF_SESSION_TOKEN` 与 `DEMO_LOCAL_SESSION_TOKEN` 两条合成分支,demo bypass 移到独立 `dev_only.py` 且构建时不打包。Okta 侧 **Authentication Policy 强制 FIDO2/WebAuthn**(Okta Verify + security key),对 custodian/admin 关闭 SMS/Email OTP factor。对齐 CCSS Level 2「operator MFA」与 SOC2 CC6.1。**上线前必须完成**——它同时闭合 demo 简报里「配错即完全沦陷」的 P0 缺口。

### 6.2 Patron 端认证升级:passkey 优先、SMS 仅 step-up(P1,Phase 0→1)

- **现状**:第一因子是手机短信 OTP(`/api/send-otp` + `SMS_API_URL` QA 网关),第二因子 TOTP;SMS 作主因子易遭 SIM-swap,且 `HT_DEMO_BYPASS_2FA` 下 `verify_otp`/`login_verify`(server.py:1100/1822)接受任意 6 位码。
- **目标态**:后端加 `webauthn` 库实现 `/api/webauthn/register-options`、`/verify`,新增 `webauthn_credentials` 表(存 credential_id/public_key/sign_count,**替代**明文 OTP 依赖);`Login.tsx`/`Verify2FA.tsx` 优先走 `navigator.credentials`,SMS 降级为「新设备/异地」时的 step-up 而非主因子。对齐 Coinbase/Kraken 的 passkey-first。`HT_DEMO_BYPASS_2FA` 加运行时断言:`assert not (BYPASS and ENV=="production")`,启动即 fail-fast。

### 6.3 会话安全:HttpOnly Cookie + 短 TTL + 吊销(P0/P1,Phase 0)

- **现状(高危)**:`api.ts:8-24` 把会话 token 明文存 `localStorage("ht_token")`,任一 XSS 即可读取盗会话;会话固定 12h 无旋转、无绝对上限;`ProtectedRoute.tsx` 仅内存 `user` 判定。
- **目标态**:后端签发 **HttpOnly + Secure + SameSite=Strict Cookie**(FastAPI `response.set_cookie(..., httponly=True, secure=True, samesite="strict")`),`sessions` 表加 `refresh_expires_at`(access 15min / refresh 8h 滑动、绝对上限 12h)与 `revoked_at`;`api.ts` 改 `withCredentials: true` 并删 `TOKEN_KEY`。**并发会话控制**:`/me` 展示活跃会话列表 + 「登出其它设备」(`DELETE FROM sessions WHERE user_id=? AND id!=?`),沿用改密即 `DELETE FROM sessions` 全踢的既有逻辑扩成按会话粒度。nginx 补 CSP/HSTS/X-Frame-Options,消除 `index.html` 无安全头的差距。对齐 OWASP ASVS V3 会话管理。

### 6.4 RBAC 最小权限 + 敏感动作 step-up(P0,Phase 0→1)

- **现状**:`require_role`(server.py:1296)服务端强制已到位——提现 `/api/hexsafe/withdrawal` 限 `custodian`、发址限 `custodian/ops`、退款 execute 限 `custodian`,这是好底子。**但** step-up 仅前端 `totpEnabled` 判定,资金动作缺服务端二次强验;退款 `screen→approve` 可同一 compliance 完成,maker-checker 不足。
- **目标态**:新增 `require_step_up()` 依赖,对 `/api/deposits/issue-address`、`/api/hexsafe/withdrawal`、`/api/refunds/{id}/execute` 强制携带 5 分钟内的新鲜 WebAuthn/TOTP 断言(`step_up_challenges` 表),**服务端**而非前端判定。退款强制 maker≠checker:在 `refund_approve`(server.py:3209)加 `assert approver != screener`,`refund_execute` 前对金额/walletId 做二次冻结校验。与 §6.5 的 vault quorum 叠加成 defense-in-depth,对齐 CCSS「授权分离」与 NIST AC-5。

### 6.5 密钥加密存储:KMS 封装(P1,Phase 1→2)

- **现状**:TOTP secret、OTP、Hex Safe ES256 私钥均**明文**——`seed_demo.py` 固定 TOTP secret 且 `seed_staff_admin` 把 secret 打进日志;`hexsafe_client.py` 的 `_load_private_key()` 从 env/PEM 明文读入,进程内 `self.private_key` 长驻。
- **目标态**:引入 envelope encryption——TOTP/OTP 列用 KMS(AWS KMS / GCP KMS,HK 就近区)派生的 DEK 加密后入库,`hash_password` 已达标不动;Hex Safe 私钥迁 **KMS/HSM 托管签名**或至少 KMS 解封后仅内存持有 + 定期轮换。SQLite→PostgreSQL 迁移时列级加密随迁。对齐 CCSS「key storage」与 ISO 27001 A.10。

### 6.6 账号找回、换机与邀请链接安全(P1,Phase 0→1)

- **现状**:忘密 `/password/send-otp`+`/password/reset` 有防枚举 + 改密踢会话,较完善;但 **TOTP 无换机流程**,恢复码是唯一逃生;邀请链接 `INVITE_TTL=6h` single-use、`invitation_is_redeemable`(server.py:1405)校验邮箱绑定已到位,惟 demo 下 `register_invite` 放宽可重复兑换。
- **目标态**:换机走 WebAuthn 重注册 + 恢复码消费 + 强制 step-up 通知邮件;邀请 demo 放宽分支加 `ENV != "production"` 断言,`invitation_is_redeemable` 保持 single-use + 邮箱强绑 + 过期即拒。`send_invitation_email` 把用户名插入 HTML 的邮件注入面改用模板转义(`markupsafe.escape`)。对齐 OWASP ASVS V2 账号恢复。

### 6.7 服务间身份:mTLS / 工作负载身份(P2,Phase 2→3)

- **现状**:`docker-compose.yml` 内 `web`(nginx)→`backend`(uvicorn:8000)为内网明文 HTTP,无双向认证;backend→Hex Safe 已有 ES256 JWT + digest + `x-request-id` 幂等(`hexsafe_idempotency` 表),是外呼身份的正确范式。
- **目标态**:引入 service mesh(Linkerd/Istio)或至少 compose 内 mTLS,给 backend 配 SPIFFE/工作负载身份;GitHub Actions 部署密钥从长期 `HK_SSH_KEY` 迁 OIDC 短期凭据。对齐 NIST 800-207 零信任、CCSS「网络分段」。

### 6.8 本域 Top 威胁 → 缓解 → 涉及对象

| Top 威胁 | 缓解控制 | 本系统文件/端点/表 |
|---|---|---|
| Demo 后门 admin 越权提现 | 删合成 token 分支 + 真 Okta OIDC + 启动 fail-fast 断言 | `server.py:user_from_token`、`demo-auth.ts`、`HT_DEMO_BYPASS_2FA`/`SUMSUB_ENVIRONMENT` |
| XSS 盗会话 | localStorage→HttpOnly Cookie + CSP/HSTS | `client/src/lib/api.ts`、`sessions` 表、`deploy/nginx.conf` |
| SIM-swap 冒充 patron | passkey 优先、SMS 降 step-up | `Login/Verify2FA.tsx`、`webauthn_credentials` 表、`SMS_API_URL` |
| 无 step-up 直接资金动作 | 服务端 `require_step_up` + maker≠checker | `/api/hexsafe/withdrawal`、`/api/deposits/issue-address`、`/api/refunds/*execute`、`refund_requests` |
| 私钥/OTP 明文泄露 | KMS envelope 加密 + 私钥轮换 | `hexsafe_client.py`、`seed_demo.py`、`users`/`email_otps` 表 |
| 邀请链接盗用/重复兑换 | single-use+6h+邮箱强绑 + demo 放宽加断言 | `INVITE_TTL`、`invitation_is_redeemable`、`register_invite`、`invitations` 表 |
| 服务间明文冒充 | mTLS/工作负载身份 + 部署 OIDC 凭据 | `docker-compose.yml`、`deploy/nginx.conf`、`hexsafe-deploy-hk.yml` |


---

## 七、客户端与终端用户安全(Client & End-User Security)

> 本域的威胁模型:HyperTransfer 是给澳门赌场终端用户(Member)的 H5/PWA,资金最终从 Treasury Account 经 Hex Safe 提出。攻击者不必攻破后端——只要能钓鱼骗到 Member ID + 密码 + 2FA、劫持会话、或篡改退款收款地址,就能把合法退款/入金引向自己的钱包。本节把每条控制锚定到 `hypertransfer-main/client` 与 `backend/server.py` 的真实对象,给出"现状→改成"路径。

### 7.1 反钓鱼与官方渠道一致性(域名 / 反假站)

- **现状**:`index.html` 直连 `fonts.googleapis.com`/`gstatic.com`(第 14–16 行),无 CSP、无 `X-Frame-Options`、无 SRI;`deploy/nginx.conf` 也未下发安全头。假站可整页克隆 H5 且我方无 iframe 反嵌、无域名钉死信号。
- **目标态(P0,Phase 0)**:在 `deploy/nginx.conf` 的 `add_header` 下发 `Content-Security-Policy`(`default-src 'self'; connect-src 'self' https://api.hexsafe.hextrust.com; frame-ancestors 'none'; script-src 'self'`)、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`、`Strict-Transport-Security`。Google Fonts **自托管**进 Vite bundle 以清空外部 `connect-src`/`script-src` 白名单(对齐 OWASP ASVS V14.4、Coinbase/Kraken 的严格 CSP 实践)。
- **P1(Phase 0–1)**:唯一官方域 `h5.hypercypto.com` 写进邀请邮件与 2FA 短信文案;`send_invitation_email`(server.py)与短信模板里显式声明"我们只用此域,任何要你去别处输入验证码的都是诈骗"。反假站监测(域名相似度、证书透明日志 CT scan)纳入 Phase 1 运营 SOP。

### 7.2 SIM-swap / 社工 / 会话劫持防护

- **现状**:第一因子是**手机短信 OTP**(`/api/send-otp`),SIM-swap 后攻击者可接管;会话 token 由 `lib/api.ts` 的 `TOKEN_KEY="ht_token"` 明文存 `localStorage`(第 8、16–24 行),任意 XSS 可整表窃取;`login/start` 对密码错误**无限频/无锁定**(现状简报确认),可撞库。
- **目标态**:
  - **P0**:`login/start` 加密码错误节流——按 `user_id`+IP 计数写入新表 `login_attempts`,5 次/15 分钟锁定,复用 OTP 已有的 `compare_digest` + 冷却范式;nginx 加 `limit_req` 作 L7 兜底(现状简报指出缺此层)。
  - **P0**:资金动作(`/api/hexsafe/withdrawal`、退款 `refund_execute`、`/api/deposits/main`)一律**服务端 step-up**——现状 step-up 由前端 `totpEnabled` 决定(简报确认仅前端判定),改为在这些端点内强制校一次性 challenge(TOTP),不信任前端 `step-up 已过` 的入参。对齐 Fireblocks/BitGo 的"每笔提现独立审批"。
  - **P1**:会话 token 从 `localStorage` 迁 **HttpOnly + Secure + SameSite=Strict Cookie**,`clearToken()`/`setToken()`(api.ts)改为不再触碰 `localStorage`,配合 CSRF token;短信 OTP 降级为 step-up,首因子推 **TOTP / WebAuthn Passkey**(需 §7.7 的 HTTPS),从根上免疫 SIM-swap(对齐 NIST 800-63B 对 SMS OTP 的降级建议)。
  - **P1**:会话加**绝对上限 + 旋转**——现状 12h token 无旋转;`user_from_token` 增 `rotated_at`,敏感动作后重签。

### 7.3 交易确认 UX:收款地址/网络显式确认、金额二次确认、地址簿白名单

- **现状**:退款后端已落地"只退已验证原钱包"红线——`refund_create`(server.py 3145+)强制 `walletId` 必属本人 `verified_wallets`,`to_address` 由服务端从 `verified_wallets` 冗余写入(表定义 3299 行注释"非自由输入"),`RefundProcess.tsx` 已从自由输入改 wallet-picker。**但金额零/负/超额无校验**(简报:`amountDecimal` 仅 `min_length=1`),`MainDeposit.tsx` 确认页虽展示 HKD 汇率 + gas + 筛查费,但**无强制二次确认门**。
- **目标态**:
  - **P0**:`refund_create`/`deposit_main` 加金额 `Decimal(amountDecimal) > 0` 且 ≤ 单笔上限校验,拒 "0"/"-100";前端 `MainDeposit.tsx`/`RefundProcess.tsx` 确认页做**收款地址后 4 位 + 网络(TRC-20/ERC-20)+ 金额**三要素的显式二次点击确认(对齐硬件钱包"地址逐位核对"范式)。
  - **P0**:入金地址由 `/api/deposits/issue-address` 经三闸门签发,**必须**在 `DepositSuccess.tsx`/`MainDeposit.tsx` 展示 `blockExplorerTxUrl`(compliance.ts,tron→tronscan/eth→etherscan)让用户自查,并明确标注该地址由 Hex Safe vault×链固定(非随机),防"改一位地址"钓鱼。
  - **P1**:退款 wallet-picker 即天然**地址簿白名单**(`verified_wallets`),扩展为新增白名单钱包需重走 1 USDT 验证(现有 `confirm-test` 写 `verified_wallets` 逻辑复用),对齐 Copper/Anchorage 的 withdrawal allowlist。

### 7.4 剪贴板地址劫持 / malware 改地址提示

- **现状**:入金/退款地址均由服务端下发(vault×链固定或 `verified_wallets`),用户不手输地址——**这已从架构上消除了最危险的剪贴板劫持面**,是本系统相较通用钱包的结构性优势,应在文案中明确宣讲。
- **目标态(P1)**:`DepositSuccess.tsx` 复制地址按钮旁固定提示"官方地址由系统下发,请与页面显示的后 6 位比对,切勿相信任何聊天/剪贴板里手输的地址";退款页因走 picker,提示"我们绝不接受手输新地址"。这条把 §7.3 的白名单机制转成用户可感知的反劫持教育。

### 7.5 客户教育与主动告警(登录/提现通知)+ 客服社工防线

- **现状**:`send_email`(server.py)已 SMTP env-gated,`audit_trail` 覆盖 withdrawal/发址/退款各动作,但**无用户侧安全告警邮件/短信**;`send_invitation_email` 把用户名直接插 HTML(简报:邮件 XSS 风险)。
- **目标态**:
  - **P0**:修 `send_invitation_email` 的 HTML 注入——对 `patronName` 做 HTML 转义再拼模板。
  - **P1**:复用 `write_audit` 触发点,在**新设备登录、提现提交(`withdrawal.submit`)、退款创建、密码/2FA 变更**时经 `send_email`+短信发通知(含时间/IP/金额/地址后 6 位),给用户"这不是我"的申诉窗口(对齐 Coinbase/Kraken 的 withdrawal 邮件确认 + 提现地址新增 24h 冷静期)。
  - **P1**:**客服社工防线**——客服不得凭电话身份重置 2FA/加白名单;此类动作走后端 `require_role` 限定 + 双人复核(maker-checker),`audit_trail` 落自然人 actor。

### 7.6 移动端安全 + demo bypass 剥离(客户端最高危)

- **现状(严重)**:`demo-auth.ts` 硬编码明文密码 `Demo@12345`、staff token `demo-local-staff-session`(直映 `admin` 全角色),`AuthContext` 识别 demo token 即免 `/me` 授 admin;这些常量随生产 `vite build` 打进 bundle,仅靠后端 `SUMSUB_ENVIRONMENT != "production"` + `HT_DEMO_BYPASS_2FA` 单点软关。配置错位即"固定 token 冒充 admin + 任意 6 位码过 2FA"。
- **目标态**:
  - **P0**:demo 常量与自动填码逻辑用 `import.meta.env.PROD` 编译期 **tree-shake 出生产 bundle**(`Dockerfile.frontend` 构建阶段强制 `NODE_ENV=production`),而非仅运行时判断;后端把 `HT_DEMO_BYPASS_2FA`/`DEMO_*_SESSION_TOKEN` 的 gate 从"单一字符串开关"改为**多条件 AND**(非 production **且** 显式 `HT_DEMO_BYPASS_2FA=1` **且** 部署 workflow 已确认非 HK production 环境)。这是本域回报最高的一条。
  - **P2(Phase 1–2)**:PWA 加**证书固定(certificate pinning)**限连 `api.hexsafe.hextrust.com` 与自有域;**越狱/root 检测**作可选风险信号(检出则对 withdrawal 强制额外 step-up),对齐 CCSS 对终端设备完整性的要求。这些多需 secure context,依赖 §7.7 HTTPS 就位。

### 7.7 传输层前置(HTTPS,承载上述所有能力)

- **现状**:`docker-compose.yml` 只暴露 HTTP:8080,TLS 依赖"外部网关自备"——**明文传 token/OTP/PII**,且 WebAuthn/Passkey/剪贴板/PWA 等 secure-context 能力在 `http://` 下全不可用,§7.2/§7.6 无法落地。
- **目标态(P0,Phase 0)**:compose 内置 Caddy/Traefik 自动签发 Let's Encrypt 证书 + HSTS,`deploy/nginx.conf` 收 HTTP→HTTPS 301。这是 §7.1–7.6 多条控制的**前置依赖**。

### 7.8 Travel Rule 客户端数据最小化

- **现状**:`issue-address`/`main` 的 `travelRuleStatus` 取**前端传入字符串**对齐入金单(简报:后端未回查 Sumsub 真实 TR),客户端可直接传 `travel_rule_accepted` 越过 Travel Rule(server.py 2579 附近)。TR 数据从客户端流入。
- **目标态**:
  - **P0**:`issue-address`/`deposit_main` **不信前端 `travelRuleStatus`**,改为服务端回查 Sumsub `/api/sumsub/travel-rule/*` 真实结果作闸门(闭合此越权)。
  - **P1**:客户端**只收 Travel Rule 最小必要字段**(beneficiary VASP、金额、原/收钱包已由系统持有),不在 Pad/H5 端让用户填 vault ID/路由 ID(项目术语红线);TR PII 在 `deposit_requests`/相关表加密列存储(SQLite→PostgreSQL 迁移时用 pgcrypto),对齐 ISO 27001 A.8 数据最小化与 FATF Travel Rule 的目的限定。仅 USDT + USD 1,000 阈值(compliance.ts)下才触发采集,低于阈值走 `not_required` 不收 TR 数据。

### 7.9 本域 Top 威胁 → 缓解控制 → 涉及本系统对象

| Top 威胁 | 缓解控制(优先级) | 本系统文件 / 端点 / 表 |
|---|---|---|
| Demo 常量/固定 token 冒充 admin + 任意码过 2FA | 编译期剥离 demo 常量 + gate 多条件 AND(P0) | `client/src/lib/demo-auth.ts`、`contexts/AuthContext.tsx`、`Dockerfile.frontend`、env `HT_DEMO_BYPASS_2FA`/`DEMO_STAFF_SESSION_TOKEN`/`SUMSUB_ENVIRONMENT` |
| 会话劫持(XSS 窃 localStorage token) | token 迁 HttpOnly Cookie + CSP + 安全头(P0/P1) | `lib/api.ts`(`TOKEN_KEY`)、`deploy/nginx.conf`、`index.html` |
| SIM-swap / 撞库夺号 | 登录密码限频 + TOTP/Passkey 首因子 + 资金动作服务端 step-up(P0/P1) | `/login/start`、`/login/verify`、`user_from_token`、新 `login_attempts` 表 |
| 钓鱼假站 / iframe 克隆 | CSP `frame-ancestors none` + 字体自托管 + 官方域教育(P0/P1) | `deploy/nginx.conf`、`index.html`、`send_invitation_email` |
| 退款/提现改收款地址(剪贴板/自由输入) | 强制 `verified_wallets` 白名单 + 地址三要素二次确认 + 金额>0 校验(P0) | `refund_create`/`refund_execute`、`/api/deposits/main`、`verified_wallets`、`RefundProcess.tsx`、`MainDeposit.tsx` |
| 直连 withdrawal 绕退款流向任意地址 | 端点内强校 `to` 属本人 `verified_wallets`(P0) | `/api/hexsafe/withdrawal`、`hexsafe_client.py`、`verified_wallets` |
| 前端回填绕过 Travel Rule gate | 服务端回查 Sumsub 真实 TR 结果(P0) | `issue-address`、`deposit_main`、`/api/sumsub/travel-rule/*` |
| 明文传输截获 token/OTP/PII | HTTPS + HSTS 前置(P0) | `docker-compose.yml`、`deploy/nginx.conf` |
| 客服社工重置 2FA/加白名单 | `require_role` 限定 + 双人复核 + 自然人审计(P1) | `require_role`、`audit_trail` |
| 邮件 HTML 注入 | 用户名 HTML 转义(P0) | `send_invitation_email`(server.py) |
| 无提现/登录告警,受害无感知 | `write_audit` 触点驱动邮件/短信告警(P1) | `send_email`、`audit_trail`、`withdrawal.submit` |

**Phase 映射小结**:P0(上线前)覆盖 Phase 0 纯技术服务商即须闭合的会话/2FA/地址/TLS/demo-bypass 红线;P1(0–3 月)在 Phase 0–1(MSO,涉法币结算与 PII)补告警、白名单冷静期、TR 回查与最小化;P2(3–12 月)随 Phase 1–2(VA Dealing)上证书固定、越狱检测等终端完整性控制,对齐 CCSS Level 2 / SOC2 / OWASP ASVS L2。

---

## 八、基础设施、网络与云安全(Infrastructure & Network)

本域覆盖 HyperTransfer 从公网入口到 Hex Safe 出网的整条链路。当前部署栈为 `docker-compose.yml`(nginx `web` + FastAPI `backend` + SQLite 卷 `ht-db`)+ `.github/workflows/hypertransfer-deploy-hk.yml`(SSH/rsync 到香港服务器),整体尚处演示态,基础设施安全是上线前的最大短板。

### 8.1 传输层与入口:强制 TLS、HSTS、CORS 收窄

**现状** → `docker-compose.yml` 的 `web` 只 `ports: "8080:80"` 暴露明文 HTTP,`deploy/nginx.conf` 无 `listen 443 ssl`、无证书、无 HSTS;TLS 终止依赖"外部网关自备"。叠加 `lib/api.ts` 把会话 token 存 `localStorage`、认证走短信/Email OTP,明文链路会直接泄露 token/OTP/PII。CORS 方面 `HT_ALLOWED_ORIGINS` 默认 `*`,仅 production 分支被 workflow 的 `grep -Eq '^HT_ALLOWED_ORIGINS=\*$'` 拦截,staging/手动 compose 全放开。

**目标态**(P0,牌照 Phase 0 上线前必须):
- 在 `deploy/nginx.conf` 增加 `listen 443 ssl http2;`,由 Cloudflare 或前置 Caddy/Traefik 做证书自动签发与续期;强制 `ssl_protocols TLSv1.2 TLSv1.3;`、`ssl_ciphers` 只留 AEAD 套件;`add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"`;`location /` 前加 80→443 `return 301`。补齐 `X-Frame-Options DENY`、`Referrer-Policy strict-origin-when-cross-origin`、`X-Content-Type-Options nosniff` 与 CSP(见客户端小节),弥补 `index.html` 缺失的安全头。
- CORS:把 `server.py` 读取 `HT_ALLOWED_ORIGINS` 的逻辑改为**默认拒绝**——未显式配置即空列表而非 `*`;并把 workflow 的 production 守卫下沉到所有环境(staging 也禁 `*`)。对标 Circle/Coinbase 的 API,`Access-Control-Allow-Origin` 永不回显任意来源,只白名单 `https://h5.hypercypto.com`。

### 8.2 WAF + 反 DDoS + 应用层限频

**现状** → `deploy/nginx.conf` 无 `limit_req`,前置无 WAF。后端仅在业务逻辑里对 OTP/challenge 限频,但 `login/start` 的密码错误**无节流**(现状简报确认可无限撞库),`/api/send-otp`、`/password/send-otp` 缺 L7 防刷,短信网关有被刷量放大攻击风险。

**目标态**:
- P0:nginx 增 `limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;`,对 `location ~ ^/api/(send-otp|login|password)` 套 `limit_req burst=10 nodelay;`;并在 `server.py` 的 `login/start` 加账号级失败计数+锁定(复用现有 OTP 限频表结构)。
- P0/P1:接 Cloudflare 作为唯一入口(反 DDoS + WAF 托管规则 + Bot 管理),源站 nginx 用 `allow` 只放行 Cloudflare 回源 IP 段;WAF 规则针对 `/api/hexsafe/withdrawal`、`/api/deposits/*`、`/api/refunds/*` 这些 money-touching 端点做加严速率与地理规则。对标 Kraken/BitGo 的托管 WAF + 边缘限频,回扣我们即 Cloudflare 前置 + nginx `limit_req` 双层。

### 8.3 网络分段与零信任出网(Hex Safe egress 隔离)

**现状** → compose 内 `backend` 不暴露端口、仅被 `web` 反代,已有分段雏形,但**出网无管控**:`hexsafe_client.py` 从 `backend` 容器直接以 `urllib` 出公网调 `api.hexsafe.hextrust.com`,与处理公网用户请求的是同一进程/同一网络出口,没有独立 egress、没有源 IP 固定,故 Hex Safe 侧无法配 IP allowlist(现状简报确认代码/文档均无 allowlist 概念)。

**目标态**(P1,牌照 Phase 1 结算上线前):
- 三层隔离落到 compose network:`edge`(nginx)/`app`(FastAPI)/`custody-egress`。把 Hex Safe 与 Sumsub 出站流量经固定出口 NAT/egress 网关(如专用 `egress` sidecar 或云 NAT 固定 EIP),将该 EIP 报给 Hex Trust 加入其 IP allowlist,`custody-egress` 只允许目的 `api.hexsafe.hextrust.com:443`,默认 deny-all 出网。
- 零信任:`hexsafe_client.py` 增证书 pinning(现状简报指出无 pinning 且 `User-Agent` 伪装绕 Cloudflare,应改回正规 UA 并在 Hex Trust 侧 allowlist 源 IP 而非靠伪装)。`/api/hexsafe/withdrawal`(仅 `custodian` 角色)在应用层强制 `toAddress` 必属本人 `verified_wallets`——现状该端点接受任意 `toAddress`,应在函数内查表校验,防绕过退款流直提任意地址。对标 Fireblocks/Anchorage 的 policy engine + 出网白名单,我们即 egress 固定 + `require_role('custodian')` + `verified_wallets` 白名单三重。

### 8.4 机密管理:杜绝 .env 明文与仓库泄露

**现状** → 已做到 `.env` 不入库(`.gitignore`/`.dockerignore` 排除),凭据经 GitHub Environment Secrets + 服务器 `.env`(chmod 600)注入。缺口:所有密钥(`HEXSAFE_PRIVATE_KEY` PEM、`SUMSUB_SECRET_KEY`、`SMTP_*`)以明文常驻服务器 `.env` 与进程内存(`self.private_key` 长驻),无版本/轮换/过期管理,泄露后无快速吊销路径。

**目标态**(P1):引入 HashiCorp Vault 或云 KMS——`hexsafe_client.py` 的 `_load_private_key()` 改为运行时从 KMS/Vault 拉取或用 KMS 做签名代理(ES256 私钥不落地进程);`.env` 里只放 Vault token/KMS 引用,不放 secret 明文。仓库侧加 gitleaks/trufflehog 到 `hypertransfer-check.yml` CI 门禁,阻断 secret 误提交。密钥轮换:为 `HEXSAFE_*`、`SUMSUB_*`、`HK_SSH_KEY` 定 90 天轮换 SLA。对标 CCSS Level 2/3 的密钥管理与 SOC2 CC6,回扣我们即 KMS 托管 + gitleaks CI + 轮换 SLA。

### 8.5 SQLite → PostgreSQL + 静态加密 + 备份

**现状** → SQLite 落 `ht-db` 卷,`backend/Dockerfile` 注释自认"SQLite 不支持多进程并发写";DB 明文存 TOTP secret、OTP、`hexsafe_idempotency` 里的 to/from/金额敏感数据;`seed_demo.py` 固定 TOTP secret 且把 secret 打进日志;备份仅部署时刻 `docker compose cp` 本地快照,无异地/加密/定时/保留。

**目标态**(P1):迁 PostgreSQL(承载 `users`/`deposit_requests`/`refund_requests`/`verified_wallets`/`audit_trail` 等表),启 TDE 或云盘静态加密;敏感列(TOTP secret、OTP)应用层 envelope 加密(KMS 数据密钥),不再明文入库。备份:pgBackRest 定时全量+增量、备份加密、异地(香港境内合规区,见 8.7)、恢复演练。给 `hexsafe_idempotency` 加 TTL 清理(现状永不过期且缓存敏感明文)。对标 Anchorage/BitGo 静态加密全覆盖 + 异地加密备份。

### 8.6 容器 / 镜像加固

**现状** → `Dockerfile.frontend`(`node:22-slim`/`nginx:1.27-alpine`)与 `backend/Dockerfile`(`python:3.12-slim`)均**无 `USER`,以 root 运行**;基镜像用 tag 非 digest;CI 无镜像扫描、无 SBOM、无签名。

**目标态**(P1):两个 Dockerfile 加非特权 `USER app`、`--read-only` 根文件系统 + `tmpfs` 可写目录、compose 里 `cap_drop: [ALL]`、`security_opt: no-new-privileges`;基镜像 pin `@sha256:` digest;`hypertransfer-check.yml` 接 Trivy/Grype 扫描 + Syft 生成 SBOM,镜像用 cosign 签名并在部署前验签。对标 CCSS/NIST 800-190 容器加固,回扣即非 root + 只读根 + digest pin + cosign。

### 8.7 香港数据驻留与 HK↔Macau 跨境隔离

**现状** → 部署即在香港服务器,但无数据分类/边界控制,Operator(澳门)工作人员数据与香港客户数据混在同一 SQLite。

**目标态**(P0 合规基线/P1 强化):PostgreSQL 及备份锁定香港境内可用区,不出境;Operator/Member 侧数据按 `user_type`/`user_roles` 做逻辑隔离,casino-ops(`/casino-ops`)访问经独立审计;`audit_trail` 记录跨境访问。对齐 HK PDPO 与 FATF 跨境口径,澳门访问隔离在 `lib/treasury-ops.ts` 已有 mock 概念,应下沉到后端行级隔离。

### 8.8 CI/CD 部署凭据最小权限与轮换

**现状** → workflow 已做 `ssh-keyscan`/`HK_SSH_KNOWN_HOSTS` 主机指纹校验、部署前备份、`/api/health` 检查、production 守卫、`concurrency` 串行。缺口:`HK_SSH_KEY` 为长期私钥、`rsync -az --delete` 全量覆盖(误删/供应链改动即时上线)。

**目标态**(P1):`HK_SSH_KEY` 改为最小权限 deploy key(仅 `HK_DEPLOY_PATH`,`command=` 约束 forced-command 只跑部署脚本)、走跳板机、定期轮换;用 GitHub OIDC 短时凭据替代长期 secret 优先;`--delete` 前置 dry-run diff + 人工 approval(production Environment 已支持 approval,扩到 rsync 步骤)。

### 8.9 本域 Top 威胁 → 缓解控制 → 涉及本系统对象

| Top 威胁 | 缓解控制 | 本系统文件/端点/表 |
|---|---|---|
| 明文链路窃取 token/OTP/PII | 强制 TLS1.2+/HSTS、Cloudflare 前置 | `deploy/nginx.conf`、`lib/api.ts`(localStorage token)、`docker-compose.yml` |
| CORS 放开被跨站盗用会话 | 默认拒绝 + 白名单正式域名 | `HT_ALLOWED_ORIGINS`、`server.py`、deploy workflow 守卫 |
| L7 撞库/短信刷量 DDoS | nginx `limit_req` + WAF + `login/start` 锁定 | `deploy/nginx.conf`、`/api/send-otp`、`/api/login/start` |
| Hex Safe 出网被伪冒/无 allowlist | egress 固定 IP + Hex Trust allowlist + 证书 pinning | `hexsafe_client.py`(ES256)、`/api/hexsafe/withdrawal`、`custody-egress` network |
| 绕退款流直提任意地址 | 端点强校验 `verified_wallets` + `require_role('custodian')` | `/api/hexsafe/withdrawal`、`verified_wallets` 表 |
| 私钥/密钥明文泄露、无轮换 | KMS/Vault 托管 + gitleaks CI + 轮换 SLA | `HEXSAFE_PRIVATE_KEY`、`SUMSUB_SECRET_KEY`、`hypertransfer-check.yml` |
| DB 明文敏感数据/备份缺失 | PostgreSQL+TDE、列级加密、异地加密备份 | `ht-db` 卷、`users`/`hexsafe_idempotency`/`audit_trail`、`seed_demo.py` |
| 容器以 root + 未扫描镜像 | 非 root + 只读根 + digest pin + cosign + Trivy | `Dockerfile.frontend`、`backend/Dockerfile`、`docker-compose.yml` |
| SSH 长期私钥 + 全量 `--delete` 覆盖 | deploy key 最小权限/OIDC + dry-run + approval | `.github/workflows/hypertransfer-deploy-hk.yml`、`HK_SSH_KEY` |
| 跨境数据混存违规 | 香港驻留 + `user_roles` 行级隔离 + 跨境审计 | PostgreSQL、`user_roles`、`audit_trail`、`/casino-ops` |

---

## 九、合规即安全控制(Compliance-as-Security)


在 HyperTransfer 这类"平台不持私钥、资金托管在 Hex Safe"的编排系统里,**合规闸门就是最外层的资产安全控制面**——盗币者和洗钱者要么被 KYC 挡在门外、要么被 Wallet KYT 拦在发址前、要么被制裁筛查冻结在到账后。因此本节把每道 AML/CFT 控制都当作 security control 来加固,并锚定 `backend/server.py` 的真实端点/函数/表。

### 9.1 KYC 准入闸门(Sumsub,6 月有效期)—— 阻断合成身份 / 盗号入金

- **现状**:`user_kyc_ok(user_id)`(server.py:3039)校验 `approved` + `valid_until` 未过 6 个月,`require_kyc`(3052)已硬挂在入金 `create/screen/issue-address/confirm-test/main` 与退款链路;`sumsub_persist_validity`(2470)在 GREEN 时落 `valid_until = approved_at + 6 个月`。**缺口**:`/api/sumsub/kyc/demo-approve` 只靠单个 `SUMSUB_ENVIRONMENT != "production"` 字符串开关拦截(1603),配错即绕过真实核验;`user_from_token` 里 `DEMO_LOCAL_SESSION_TOKEN`/`DEMO_STAFF_SESSION_TOKEN`(server.py:1250/1263)同样单开关兜底。
- **目标态(P0,Phase 0)**:把 demo bypass 从"运行期字符串判断"改为**构建期剥离**——在 `Dockerfile.frontend` 生产 stage 用 `define` 剔除 `demo-auth.ts` 常量,后端 demo 分支加 `assert SUMSUB_ENVIRONMENT != "production"` 并要求同时置位 `HT_DEMO_BYPASS_2FA`+独立 `HT_DEMO_ALLOW=1`(双开关 fail-closed);`.github/workflows/hypertransfer-deploy-hk.yml` 的 production 守卫已能拦 CORS/短信,追加拦 `HT_DEMO_*` 非空即拒部署。**KYC 复核到期主动阻断**(P1):`valid_until` 前 30 天在 `deposit_requests` 建单前触发重新核验提示,避免临界期资金动作卡死。对齐 Coinbase/Kraken 的分层 KYC + 制裁再筛,Sumsub 侧启用 liveness + document + ongoing monitoring。

### 9.2 Wallet KYT / 交易监控 —— 盗币赃款阻断的核心

- **现状**:`screen_source_wallet(address, chain_id)`(3302)仍是**确定性 mock**——按地址子串 `ofac/sanction/blocked → fail`、`mixer/tornado → edd`;退款侧 `refund_screen`(3194)由 compliance 手工录 decision。这意味着当前"1-hop sanctions=Fail"只是字符串匹配,**不是真链上图谱分析**。
- **目标态(P0,Phase 1)**:保持 `screen_source_wallet` 的函数边界不变(编排不动),仅换实现为**真实 KYT provider**——按 CLAUDE.md §4.4 优先 Hex Safe KYT 端点,未开通前回落 Chainalysis/TRM/Elliptic REST。伪代码落在同一函数:
  ```python
  res = kyt_provider.screen(address, chain_id)  # 返回 riskScore/exposure/hopCount/sanctionHit
  if res.sanctionHit and res.minHop <= 1: return {"decision": "fail", ...}   # 1-hop 制裁=硬 Fail
  if res.mixerExposure and res.riskScore >= EDD_TH: return {"decision": "edd", ...}
  ```
  在 `issue-address`(3515 附近)三闸门里,`screening_status != "pass"` 一律 409 不发址(已有护栏,只需真数据喂入)。**退款钱包同源筛查**:`refund_create`(3144)已强制 `walletId ∈ verified_wallets`(3151 否则 400),再加 execute 前对该 verified wallet 做**再筛查**(赃款可能事后被标记),而非仅信任入金时结果。对齐 Fireblocks/BitGo 的 pre-transfer screening + 持续 re-screen。

### 9.3 FATF Travel Rule(USD 1,000)—— 数据完整性与对手方核验

- **现状**:`issue-address`/`main` 的 TR gate 取**前端传入的 `travelRuleStatus` 字符串**回填入金单(server.py:3515-3517、3591),后端未回查 Sumsub 真实 TR 结果——**客户端可直接传 `travel_rule_accepted` 越过 Travel Rule**,这是数据完整性缺口。
- **目标态(P0,Phase 1)**:`issue-address` 不再信任前端字段,改为**服务端回查** `/api/sumsub/travel-rule/status`(server.py 已有 Sumsub TR 端点),以后端权威结果对齐 `deposit_requests.travel_rule_status`;`amount ≥ USD 1,000` 时 `travel_rule_required=1` 且 status 必须 `travel_rule_accepted` 才发址,rejected/manual_review 一律 409。VASP 对手方核验走 Sumsub/Hex Safe VASP directory,beneficiary VASP 由后端配置、**绝不让 patron 前端填**(符合 CLAUDE.md §4.3)。TR 提交字段(originator/beneficiary name+address+wallet)入 `deposit_requests` 并纳入审计。

### 9.4 制裁 / OFAC / UN 名单实时筛查

- **现状**:仅 `screen_source_wallet` 的子串规则,**无独立制裁名单实时筛查**(自然人姓名/实体/地址)。
- **目标态(P0)**:KYC 层由 Sumsub 覆盖 sanctions/PEP/adverse-media 持续监控;钱包地址层由 9.2 的 KYT provider 覆盖 OFAC SDN 地址;二者结果写入 `audit_trail`(server.py:252)。**1-hop sanctions = Fail 为不可覆盖的硬规则**——即使 compliance 角色也不能在 `refund_approve`(3209)里手动放行制裁命中单,应在 approve 前加 `if audit 命中 sanction: raise 403`。

### 9.5 可疑交易监测与 STR/SAR 触发

- **现状**:`write_audit` 全动作留痕(1124),但**无规则引擎**将 EDD/dirty/结构化拆分聚合成 STR/SAR 候选。
- **目标态(P1,Phase 1→2)**:新增 `str_alerts` 表 + 后台 `/api/compliance/alerts` 队列,规则命中(EDD、funds_dirty、退款金额异常、短窗高频)自动建 case;`refund_create`/`deposit_main` 的 `amountDecimal` 现仅 `min_length=1`(3125),**必须补 `> 0` 且非负校验**(否则可提交 "0"/"-100" 触发对账偏差),异常金额直接进 alert 队列。STR/SAR 报送本身(HKFIO)Phase 1 不自动化,但要产出可导出的合规包。

### 9.6 记录留存与不可篡改审计(HK 要求)

- **现状**:`audit_trail` 的 actor 取自会话,但 demo token 下 actor 恒为 `demo-staff-id`(1289)、**无哈希链**,可被 DB 直接改写;SQLite 为演示态,`hexsafe_idempotency`(275)缓存含金额/地址明文且无 TTL。
- **目标态(P1,Phase 1)**:`write_audit` 增加 `prev_hash`/`entry_hash = sha256(prev_hash + payload)` 形成 append-only 哈希链,迁 PostgreSQL 后对审计表设 row-level 只写权限 + WORM 归档(S3 Object Lock);留存周期按 HK ≥ 7 年,`hexsafe_idempotency` 敏感字段加应用层加密并设保留期。**maker-checker**:退款 `refund_screen→approve→execute` 当前可为同一 compliance 角色(3194/3209),应强制 screen 与 approve 不同自然人,execute 限 `custodian`(已限,见 3236),approve→execute 间对金额/walletId 做二次冻结校验。

### 9.7 HK vs Macau 管辖边界与数据流合规

- **现状**:CORS 默认 `*`、部署在香港服务器,`HT_ALLOWED_ORIGINS` 生产已被 workflow 拦。跨境 patron(澳门玩家)PII 流向 HK 后端。
- **目标态(P0/P1)**:`HT_ALLOWED_ORIGINS` 收窄到 `h5.hypercypto.com`;数据落地遵循 HK PDPO,澳门访问隔离(treasury-ops 已有 Macau access exclusion 概念)在后端以 RBAC + 区域标签强制,Operator 后台 `/casino-ops` 与 patron 客户端严格边界(不暴露 WTA/OTC/custody evidence)。跨境传输走加密通道(补 TLS,现 compose 仅 HTTP:8080)。

### 9.8 该域 Top 威胁 → 缓解控制 → 涉及本系统对象

| Top 威胁 | 缓解控制 | 涉及文件 / 端点 / 表 |
|---|---|---|
| 合成身份 / 盗号入金 | KYC 硬闸门 + 6 月有效期,demo-approve 构建期剥离 | `user_kyc_ok`/`require_kyc`、`sumsub_persist_validity`、`sumsub_kyc_applications.valid_until`、`/api/sumsub/kyc/demo-approve` |
| 赃款 / 制裁地址入金 | 真实 Wallet KYT + 1-hop sanction=Fail | `screen_source_wallet`、`/api/deposits/issue-address`、`deposit_requests.screening_status` |
| Travel Rule 前端绕过 | 服务端回查 Sumsub TR,不信前端字段 | `deposit_main`/issue-address TR gate(server.py:3515)、`/api/sumsub/travel-rule/*`、`deposit_requests.travel_rule_status` |
| 退款洗钱 / 任意提现 | 只退 verified wallet + execute 前再筛 + maker-checker | `refund_create`(3151)、`refund_screen/approve/execute`、`verified_wallets`、`/api/hexsafe/withdrawal` |
| 异常金额 / 结构化拆分 | `amountDecimal>0` 校验 + STR alert 队列 | `RefundCreateIn`(3125)、`deposit_main`、新增 `str_alerts` |
| 审计篡改 / 无法追责 | 哈希链审计 + 真实 actor + WORM 留存 | `write_audit`、`audit_trail`、`hexsafe_idempotency`、`user_from_token`(demo actor) |
| 越权 admin(demo token) | 双开关 fail-closed + 生产构建剥离 | `DEMO_STAFF_SESSION_TOKEN`、`SUMSUB_ENVIRONMENT`、`HT_DEMO_BYPASS_2FA`、`require_role` |
| 跨境数据违规 | CORS 收窄 + Macau 隔离 + TLS | `HT_ALLOWED_ORIGINS`、`deploy/nginx.conf`、`/casino-ops` 边界 |

**优先级映射**:P0(上线前 / Phase 0-1)= 9.1 demo 剥离、9.2 真实 KYT、9.3 TR 服务端核验、9.4 制裁硬阻断、9.7 CORS/TLS;P1(0-3 月 / Phase 1)= 9.5 STR 队列、9.6 哈希链审计 + maker-checker;P2(3-12 月 / Phase 2-3)= 自动化报送、KYT 持续再筛、WORM 归档合规审计。这些控制的共同价值:在平台不持私钥的前提下,把"资产被盗与损失"的风险在**入金前(KYC/KYT)、发址前(三闸门)、到账后(制裁/dirty)、退款前(verified wallet + 再筛)**四个节点分层拦截。


---

## 十、内部威胁、运营安全与职责分离(Insider Threat & OpSec)

托管资金的平台,真正的对手往往在内部或已拿到内部凭据。Bybit 2025(约 15 亿美元,通过污染 Safe 多签前端 UI 骗签)与 DMM Bitcoin 2024(约 3.05 亿美元,私钥侧信道)都证明:**只要单一环节能让一个人独立促成一笔资产转出,SoD 与四眼原则就是最后一道防线**。HyperTransfer 资金虽最终由 Hex Trust quorum 放行,但发址、退款审批、Marker 回录、员工/角色管理这些编排动作全在本仓库 `server.py` 里,内控必须落到本系统的真实对象上。

**1. SoD 与四眼原则 / maker-checker(P0)。** 当前差距:退款链 `refund_screen`(`require_role("compliance")`)与 `refund_approve`(`require_role("compliance","admin")`)**允许同一个 compliance 自然人先筛后批**,只有 `refund_execute`(`require_role("custodian")`)在角色上分离;更致命的是 `require_role` 里 `if "admin" in roles` 让 admin **单人通吃 screen→approve→execute 全链**。目标态:在 `refund_approve` 增加断言 `approver_id != screen_actor_id`(从 `audit_trail` 反查 `withdrawal.screen` 的 `actor_user_id`),并移除 admin 对资金端点的隐式全通——把 admin 拆成 `platform_admin`(管账号/角色)与业务角色互斥,资金动作强制 `compliance≠custodian≠approver` 三人。发址侧 `/api/deposits/issue-address` 与 `/api/hexsafe/deposit-address` 现为单角色即可发,应引入 maker-checker:issue 记 `pending_checker`,由第二人 `require_role("compliance")` 复核 KYC+screening+TR gate 后才真正 `create_deposit_address`。对齐 Fireblocks/BitGo 的 transaction policy 与 CCSS L3、SOC2 CC6.1:任何 money-touching endpoint 都不得让发起人自我批准。

**2. 特权访问管理(PAM,JIT + 审批 + 录屏,P1)。** 现状:`custodian` 是常驻角色,`seed_staff_admin` 用 `HT_ADMIN_EMAIL/HT_ADMIN_PASSWORD` 种一个长期 admin,`/api/hexsafe/withdrawal` 只看角色不看"此刻是否有获批工单"。目标态:`user_roles` 表补 `granted_until`/`grant_ticket_id`,`get_user_roles` 过滤过期授权,custodian 执行退款前必须有一条对应 `withdrawal.approve` 且 JIT 授权在有效窗内(默认 30 分钟);提权走 `/api/admin/grant` 二次审批 + 全程 `write_audit("role.jit_grant")`。生产接 Okta OIDC 后,把 `/casino-ops` 与 Hex Trust 后台登录纳入 PAM 会话录屏(Teleport/StrongDM 级别),对齐 Anchorage/Copper 的 quorum-governed operator access。

**3. audit_trail 防篡改(P0/P1)。** 现状 `write_audit` 只是 `INSERT INTO audit_trail`,SQLite 明文、无哈希链、任何有 DB 文件访问权的人(或 root)可 `UPDATE/DELETE` 抹除痕迹,且 demo 会话下 `actor_user_id` 恒为 `"demo-staff-id"`/`"demo-user-id"`,**无法追责到自然人**。目标态:①迁 PostgreSQL 后对 `audit_trail` 建 append-only(触发器禁 `UPDATE/DELETE` + 应用账号只授 `INSERT/SELECT`);②`write_audit` 增列 `prev_hash`/`row_hash = SHA256(prev_hash‖actor‖action‖target‖detail‖ts)` 形成哈希链,后台跑校验 job 断链即告警;③关键动作(`withdrawal.*`、`role.*`、`staff.create`)异步复制到外部 WORM 存储(S3 Object Lock / 独立 append-only 桶);④生产禁用 demo 合成 actor(见第 7 条),确保每条审计绑真实 `user_id`。对齐 ISO 27001 A.12.4 与 SOC2 CC7.2。

**4. 澳门 access exclusion(P1,牌照 Phase 0/1 硬要求)。** 现状仅前端 `lib/treasury-ops.ts` 有 Macau access exclusion 的展示 mock,后端 `require_role`/`user_from_token` **无地理/数据隔离**——HK↔Macau 数据边界形同虚设。目标态:`users`/`sessions` 记 `data_region`,在 `require_role` 之外加 `require_region_boundary` 依赖,阻断跨境读取运营方 patron PII;casino-ops 涉澳门访问的读端点按 region 做行级过滤,并把每次跨境访问 `write_audit("access.cross_border")`。这对应 FATF Travel Rule 与港澳分辖的合规口径。

**5. 员工入职/离职凭据回收 + 背景调查(P0)。** 现状:staff 由 `adminApi.createStaff` 建,离职无自动化回收,`sessions` 12h 才自然过期,`DEMO_STAFF_SESSION_TOKEN="demo-local-staff-session"` 是硬编码常驻 bearer。目标态:离职端点一次性 `DELETE FROM sessions WHERE user_id=?` + `DELETE FROM user_roles` + Okta 停用 + 撤 Hex Trust 后台账户 + 轮换其经手的 `HEXSAFE_*` 若有共享;custodian/compliance/admin 入职强制背景调查(制度层)。凭据回收纳入 offboarding checklist,并 `write_audit("staff.offboard")`。

**6. 根/管理员治理与 break-glass(P1)。** 现状 admin 单账号、`hmac`+PBKDF2 存密码但无 break-glass 概念。目标态:平台 root 用 Shamir/双人保管的封存凭据,日常禁用;真正需要时走 break-glass 流程——双人授权解封、限时、全程录屏、事后强制 24h 内轮换 + 复盘,`write_audit("breakglass.open/close")`。admin 拆分见第 1 条,避免 admin=上帝。

**7. 消灭"单人可独立转出"与内鬼/社工场景(P0)。** 这是 Bybit/DMM 的核心教训。当前最大裂缝是 demo 旁路:`user_from_token` 认 `DEMO_STAFF_SESSION_TOKEN` 即合成 admin、`get_user_roles("demo-staff-id")` 直接给 `["admin"]`,只靠 `SUMSUB_ENVIRONMENT != "production"` 一个字符串兜底;`HT_DEMO_BYPASS_2FA` 让任意 6 位码过 2FA;`hexsafe_client.py` 的 ES256 私钥 PEM 明文常驻内存,`lib/api.ts` 的 token 明文存 localStorage(XSS 即盗会话)。目标态:①生产构建**物理剔除** demo 常量与 bypass 分支(编译期 `if PROD: raise`,而非运行期软判),CI 加 grep 门禁扫 `DEMO_*SESSION_TOKEN`/`HT_DEMO_BYPASS_2FA`;②资金转出强制"发起人≠审批人≠执行人"三人 + Hex Trust quorum,任何单一角色(含 admin)都无法独立走完 `refund_create→approve→execute`;③对 custodian/compliance 做反社工演练与"任何要求你单独发起大额提现的指令都需带外二次确认"的制度红线;④HexSafe 私钥迁 KMS/HSM、token 迁 HttpOnly Cookie,削减凭据被盗后单人转出的可行性。

**该域 Top 威胁 → 缓解控制 → 本系统对象**

| Top 威胁 | 缓解控制 | 本系统文件/端点/表 |
|---|---|---|
| compliance/admin 单人跑完退款全链 | maker-checker + approver≠screener 断言 + admin 去隐式全通 | `server.py` `require_role`/`refund_screen`/`refund_approve`/`refund_execute` |
| 发址无二次复核 | issue→pending_checker 四眼放行 | `/api/deposits/issue-address`、`/api/hexsafe/deposit-address` |
| 内鬼抹除操作痕迹 | append-only + 哈希链 + WORM 外部副本 | `write_audit`、`audit_trail`、迁 PostgreSQL |
| demo 旁路冒充 admin/绕 2FA | 生产编译期剔除 + CI grep 门禁 | `user_from_token`、`get_user_roles`、`DEMO_STAFF_SESSION_TOKEN`、`HT_DEMO_BYPASS_2FA` |
| 常驻特权无时限 | JIT 提权 + 审批 + 录屏 | `user_roles`(补 `granted_until`)、`seed_staff_admin`、Okta |
| 离职凭据未回收 | 一键吊销会话/角色 + 停 Okta/Hex Trust | `sessions`、`user_roles`、`adminApi.createStaff` |
| HK↔Macau 越界访问 | region 边界依赖 + 行级过滤 | `user_from_token`、casino-ops 读端点、`lib/treasury-ops.ts` |
| 私钥/token 被盗后单人转出 | KMS/HSM + HttpOnly Cookie + Hex Trust quorum | `hexsafe_client.py`(ES256)、`lib/api.ts`(localStorage) |

---

## 十一、监控、检测与事件响应(Monitoring, Detection & IR)

HyperTransfer 编排的是 Operator 的 crypto 入金与法币结算,资金托管在 Hex Trust,平台本身不持私钥——因此本域的核心不是"防黑客进服务器",而是**能在密钥/凭据泄露、非白名单提现、demo 旁路被误开的第一时间发现并冻结**。当前 `write_audit` 只是把动作写进 `audit_trail`(SQLite 单表,无哈希链、无外发),没有 SIEM、没有链上实时监控、没有 kill-switch,IR 完全靠人肉翻 DB。以下按"现状→改成如何(落在哪个文件/函数/表/配置)"给出。

### 11.1 集中日志与 SIEM(P0 / Phase 0)

**现状**:`write_audit(actor, action, target_type, target_id, ...)` 写 `audit_trail`,`_hexsafe_call` 只在异常时抛 `HTTPException`,nginx 访问日志留在容器内;三类事件(应用/API、Hex Safe 托管、链上到账)散落且随容器重建丢失。

**目标态**:在 `write_audit` 内追加一个 `emit_siem(event)` 旁路——把每条审计以 JSON 结构化推到集中管道。落地方式:`docker-compose.yml` 加一个 `vector`/`fluent-bit` sidecar,tail `backend` 的 stdout + `deploy/nginx.conf` 的 `access_log`,转发到托管 SIEM(Phase 0 用 Grafana Loki+Alloy 或 Datadog,不必自建 ELK)。关键**必采事件**直接锚到现有函数:`hexsafe.withdrawal.submit`/`.replay`(`server.py:3015-3019`)、`require_role` 抛 403、`login/verify` 失败、`/api/sumsub/kyc/demo-approve`、`user_from_token` 命中 `DEMO_STAFF_SESSION_TOKEN`(`server.py:1263`)。对齐 SOC2 CC7.2 与 CCSS Level 2 的"审计日志集中且防篡改":给 `audit_trail` 加 `prev_hash`/`row_hash` 列做哈希链(每条 `sha256(prev_hash+payload)`),迁 PostgreSQL 后启 append-only 触发器——修掉现状简报里"审计无哈希链、demo token 下 actor 恒为 demo-staff-id 无法追责"的问题。SOC 值守:Phase 1 起接第三方 MDR(24/7),P0 先配 PagerDuty on-call。

### 11.2 链上实时监控与"命中即冻结"(P0 / Phase 0)

**现状**:到账靠 `hexsafe_client.get_deposit_by_tx_hash`/`list_transactions` 轮询 + `min_confirmations`;`/api/hexsafe/withdrawal` 端点接受任意 `toAddress`,注释称"原钱包校验由上层保证"——绕过退款流直接调该端点即可向任意地址提现。

**目标态**:(a) **应用层强制白名单**——在 `hexsafe_withdrawal`(`server.py:2999`)提交前,强制 `SELECT ... FROM verified_wallets WHERE user_id=? AND address=?`,`to` 不在本人 `verified_wallets` 即 403 并 `write_audit("withdrawal.blocked.nonwhitelist")`,不再信任"上层保证"。(b) **链上监控 worker**:新增 `backend/chain_monitor.py`,轮询 Hex Safe 交易 + 接 Chainalysis/TRM 的 address-screening,命中规则即调 kill-switch:非白名单目标、单笔 > 阈值(如 > USD 50k)、地址标签命中(sanctioned/mixer/被盗名单)、单位时间提现速度超基线。命中即写 `audit_trail` 高危事件 + 推 SIEM + **自动置全局 freeze flag**(见 11.5)。对齐 Fireblocks/BitGo 的 policy engine 与 CCSS 的 transaction monitoring——我们不复刻其 co-signer,而是把"发起前校验"落在 `deposit_issue_address`/`hexsafe_withdrawal`,把"事后异常检测"落在独立 worker。

### 11.3 欺诈与异常检测(P1 / Phase 1)

**现状**:`login/start` 密码错误**无节流**(仅 OTP/challenge 限频),可无限撞库;无登录设备/地理基线;`amountDecimal` 仅 `min_length=1`,可提交 "0"/"-100"/超额退款。

**目标态**:(a) 在 `login_start` 加基于 `redis`(Phase 1 引入)或 SQLite 计数的失败限频(如 5 次/账号/10min → 锁定 + `write_audit("login.bruteforce")`)。(b) **金额校验**:`refund_create`/`deposit_main` 用 Pydantic `condecimal(gt=0)` + 上限,拒 0/负/异常大额。(c) **行为基线/速度规则**:在 SIEM 侧对 `deposit_requests`/`refund_requests` 跑规则——同一 patron 短时多笔退款、首笔即大额、KYC 通过后立即大额提现,触发 review。对齐 Coinbase/Kraken 的 velocity limits。

### 11.4 IR 剧本(P0 基线 / Phase 0)

针对本系统 5 类事件各写一份 runbook(存 `hypertransfer-main/docs/ir/`):

- **密钥/凭据泄露**:`HEXSAFE_PRIVATE_KEY`/`HEXSAFE_API_KEY`/`SUMSUB_*`/`SMTP_*` 泄露 → 立即在 Hex Trust 后台吊销 API key、轮换 GitHub Environment Secrets + 服务器 `.env`、`DELETE FROM sessions` 全踢、置 freeze flag。现状私钥明文常驻 `hexsafe_client.self.private_key`,P1 迁 KMS/HSM。
- **托管方事件**(Hex Safe 不可用/被攻破):停 `issue-address`/`withdrawal`,只读展示、走 11.6 DR 预案。
- **疑似盗币**:命中 11.2 即冻结,保全 `audit_trail` + Hex Safe transfer_id ↔ `refund_requests.transfer_id` 对账链。
- **Travel Rule 拒绝**:`travel_rule_rejected` 时确保 `deposit_issue_address` 已 409 不发址,记录并转 compliance。
- **Depeg**:USDT < 0.95 触发 → 暂停结算侧 OTC、走 casino-ops 手工。

### 11.5 冻结/熔断 kill-switch(P0 / Phase 0)

**现状**:无。**目标态**:`server.py` 加全局开关 `SYSTEM_FREEZE`(env + DB flag),在 `deposit_issue_address`(`server.py:3503`)、`hexsafe_withdrawal`、`refund_execute`(`server.py:3236`)入口统一 `require_not_frozen()`,置位则 503 + 审计。分级:`freeze_issue`(停发址)、`freeze_withdrawal`(停提现),admin 经 `require_role("admin")` 一键触发。对齐 CCSS 的紧急停机。**同时把 demo 旁路纳入熔断**:现状 `DEMO_STAFF_SESSION_TOKEN`→admin、`HT_DEMO_BYPASS_2FA` 任意 6 位码通过,仅靠 `SUMSUB_ENVIRONMENT != "production"` 单开关兜底——P0 增加启动自检:production 下若检测到任一 demo 开关为真,**拒绝启动**并告警(比"配错即沦陷"更硬)。

### 11.6 BCP/DR、取证与桌面演练(P1–P2 / Phase 1–2)

**BCP/DR**(P1):现状仅部署时刻 `docker cp` 快照 SQLite,无异地/加密/定时。目标:PostgreSQL PITR + 每日加密备份异地存,**RPO ≤ 15min、RTO ≤ 2h**;`verified_wallets`/`refund_requests`/`hexsafe_idempotency` 属资金关键表优先恢复;每季度实跑一次 restore 演练。托管方不可用预案:降级只读 + 人工对账。**取证与保全**(P1):事件时冻结 `audit_trail`(哈希链保证完整性)、导出 Hex Safe 交易与幂等缓存、快照 SQLite/PG。**桌面演练**(P2):每半年针对 11.4 五类剧本各跑一次 tabletop,对齐 SOC2 CC7.4/ISO 27001 A.5.24-30。

### 11.7 该域 Top 威胁 → 缓解控制 → 本系统落点

| Top 威胁 | 缓解控制 | 涉及文件/端点/表 |
|---|---|---|
| 绕过退款流向任意地址提现 | 提交前强制 `verified_wallets` 白名单校验 + 非白名单即冻结 | `server.py:2999 /api/hexsafe/withdrawal`、`verified_wallets` |
| demo 旁路被误开冒充 admin | production 启动自检拒启 + demo token 事件推 SIEM | `HT_DEMO_BYPASS_2FA`、`DEMO_STAFF_SESSION_TOKEN`、`user_from_token(server.py:1263)` |
| 密钥/凭据泄露无快速吊销 | IR runbook + KMS + 轮换 + 全会话踢出 | `hexsafe_client._load_private_key`、`HEXSAFE_*`、`sessions` |
| 撞库 / 短信轰炸 | `login_start` 失败限频 + nginx `limit_req` + 图形验证码 | `server.py login_start`、`deploy/nginx.conf` |
| 异常/大额/黑名单提现 | 链上监控 worker + policy 命中即 kill-switch | `chain_monitor.py`(新)、`SYSTEM_FREEZE`、`refund_execute(server.py:3236)` |
| 审计被篡改/无法追责 | `audit_trail` 哈希链 + 集中 SIEM + append-only | `write_audit(server.py:1124)`、`audit_trail` |
| 托管方不可用 / 数据丢失 | RPO≤15min/RTO≤2h + 异地加密备份 + restore 演练 | PostgreSQL 备份、`docker-compose.yml`、`verified_wallets`/`refund_requests` |

---

## 十二、治理、保障与认证(Governance, Assurance & Certifications)

本域把 HyperTransfer 从"代码里做对了几件事"提升到"可被监管、审计师、Hex Trust 与 Operator 反复审查而不塌"的治理层。所有控制都锚定本仓库真实对象,并映射香港 SFC/VASP 与 FATF 期望。

## 1. 安全组织与问责(P0)

**现状**:安全责任隐含在代码里(`require_role`、`write_audit`),无书面 owner。审计以 `audit_trail` 表记录 `actor_user_id`,但 demo 会话下 `DEMO_STAFF_SESSION_TOKEN`→`demo-staff-id`,`actor` 恒为占位,**无法追责到自然人**。

**目标态**:
- 设 **CISO / 安全负责人**(Phase 0 可由 CTO 兼)+ 季度 **Security Committee**(工程 / 合规 / Hex Trust 联络人)。
- 建 **Risk Register**(先落 `CompanyPlan/` 下 `Risk-Register.md`,后迁 GRC):每条风险=威胁 / 现有控制(引用具体端点)/ 残余风险 / owner / 复评日期。首批必录:demo bypass 未关(见 §4)、`localStorage` token 的 XSS 面(`lib/api.ts:16-24`)、无 TLS(`docker-compose.yml`)。
- 把 `audit_trail` 升级为**问责级**:`write_audit`(server.py:1124)在 `SUMSUB_ENVIRONMENT=="production"` 下**禁止** demo actor 写入(启动即 `assert` 拒绝 `demo-staff-id` 落审计),资金端点(`/api/hexsafe/withdrawal`、`refund_execute`)的 actor 必须是真实 `user_id`。

对标 Coinbase/Kraken 的 CISO + 独立安全委员会;映射 **SFC VASP** 对"负责人员 / 治理架构"的要求。

## 2. 认证路线(P1–P2,按 Phase 分阶段)

| 认证 | 目标 Phase | 在本系统的落点 |
|---|---|---|
| **SOC 2 Type II** | Phase 0→1(P1 启动观察期) | 控制映射 `require_role`/`user_kyc_ok`/`write_audit`/`hexsafe_idempotency`;审计师最看重的证据链已存在,缺的是**期间证据**(需先关 demo bypass、开审计防篡改) |
| **ISO 27001** + **27017**(云) + **27018**(PII) | Phase 1 | ISMS 覆盖 `docker-compose`/nginx/GitHub Actions 部署链;27018 对齐 Sumsub KYC PII |
| **CCSS**(CryptoCurrency Security Standard) | Phase 1→2 | 直接命中 `hexsafe_client.py` 的 key ceremony、`min_confirmations`(EVM5/Tron4)、proof-of-reserves |
| **ISO 27701**(隐私) | Phase 2(可选) | KYC / Travel Rule 数据主体权利,配合香港 PDPO |

CCSS 是本项目**最相关**的标准(Fireblocks/BitGo 均持):Level 1 要求 key generation、key storage、proof-of-reserves、audit logs——我们私钥托管在 Hex Trust 侧(减轻自持负担),但**应用侧**须补:私钥非明文常驻(现 `_load_private_key` 明文入内存,P1 迁 KMS/HSM)、`hexsafe_idempotency` 加密敏感字段。

## 3. 渗透测试与红队(P0/P1)

**现状**:无任何外部测试记录。

**目标态**:
- **P0**:上线前一次**独立第三方 web+API 渗透测试**,范围锁定 OWASP API Top 10——重点验 `/api/deposits/issue-address`(三闸门可否绕过)、`/api/hexsafe/withdrawal`(`to` 地址是否强校验 `verified_wallets`)、`/login/start`(无密码限频→撞库)、demo token 面。
- **P1**:**定期**(半年)+ **重大变更触发**——CI 增门:`hexsafe_client.py`/`server.py` 资金端点或 `require_role` 变更即打 `pentest-required` label,阻断 `hypertransfer-deploy-hk.yml` 直到复测。
- **P2**:红队演练(社工 + 供应链 + SSH 部署面 `HK_SSH_KEY`)。对标 Anchorage/Copper 的年度红队。

## 4. 漏洞赏金 / 负责任披露(P1)

**现状**:无 `SECURITY.md`、无披露渠道。
**目标态**:P1 上 `SECURITY.md` + `security@` 邮箱(90 天披露窗)+ safe harbor;Phase 2 上私有 bug bounty(HackerOne/私邀),范围**排除** demo 环境但**必须含**生产 `HT_ALLOWED_ORIGINS` 收窄后的域。**上线前置条件**:先关 `HT_DEMO_BYPASS_2FA` 与 demo token,否则赏金猎人第一个提交就是"admin 免密登录"。

## 5. 第三方 / 供应商风险管理(P0/P1)

四个核心供应商各建 **vendor file**:
- **Hex Trust**:索取 **SOC 2 Type II** + CCSS 证明;合同 SLA 明确 quorum/maker-checker、保险条款、`x-api-key` 轮换与 IP allowlist(现 `hexsafe_client.py` **无 allowlist / 无轮换**,P1 补密钥版本表)。
- **Sumsub**:SOC2 + GDPR/PDPO DPA;`SUMSUB_ENVIRONMENT` 生产化时确认数据驻留。
- **短信网关**:现默认 QA(`SMS_API_URL`),P0 切正式 + SLA;`hypertransfer-deploy-hk.yml` 已对 QA 网关拒绝 production 部署,保留此门禁。
- **云**:索取 27017/27018;镜像 P1 pin digest + CI 加 SCA/SBOM。

每年复审 SOC2 报告有效期,录入 Risk Register。对标 Circle 的供应商 SOC2 索取制度。

## 6. 托管保险 / key ceremony / proof-of-reserves(P1,映射 CCSS)

- **保险**:Treasury Account 资产托管在 Hex Trust,合同须写明其 **crime insurance / custody 保险**额度与 SLA;Operator 侧留证据副本入 vendor file。
- **Key ceremony**:`hexsafe_client` 的 ES256 私钥签发 / 轮换须走**双人 ceremony**(录像 + 见证签字),私钥 P1 迁 KMS,`HEXSAFE_PRIVATE_KEY` 明文环境变量退役。
- **Proof-of-reserves**:process v1 §C "Sufficient Fund in Vault" 现为人工登录 Hex Trust 后台。P2 增**定期对账**:`/api/hexsafe/vaults` 余额 vs 内部 `deposit_requests`/`refund_requests` 台账日结,差异告警。

## 7. 安全预算与人力(建议)

Phase 0–1:1 名安全负责人(兼)+ 外包渗透测试(约 USD 15–30k/年)+ SOC2 审计(USD 30–50k 首年)。Phase 2:专职安全工程师 1 名 + bug bounty 池。预算优先级:先花在**关 demo bypass + TLS + token 迁 Cookie**(近零成本、最高 ROI),再投认证。

## Top 威胁 → 缓解 → 本系统落点

| Top 威胁 | 缓解控制 | 涉及文件 / 端点 / 表 |
|---|---|---|
| demo bypass 配错→admin 免密沦陷 | 生产 startup 硬断言 + 关旁路 + 审计禁 demo actor | `server.py` `DEMO_STAFF_SESSION_TOKEN`/`HT_DEMO_BYPASS_2FA`、`write_audit`、`audit_trail` |
| 提现绕过退款流打任意地址 | 端点内强校 `verified_wallets` + key ceremony | `/api/hexsafe/withdrawal`、`refund_execute`、`verified_wallets` 表 |
| 私钥泄露无吊销 | KMS/HSM + 轮换 + IP allowlist(供应商 SLA) | `hexsafe_client.py` `_load_private_key`、`HEXSAFE_*` |
| XSS 盗会话 | token 迁 HttpOnly Cookie + CSP + 渗透测试 | `lib/api.ts:16-24`、`index.html` |
| 撞库 / 短信轰炸 | 登录限频 + WAF/`limit_req` + bug bounty | `/login/start`、`deploy/nginx.conf` |
| vault 余额不足 / 对账缺口 | proof-of-reserves 日结告警(CCSS) | `/api/hexsafe/vaults`、`deposit_requests`、`refund_requests` |
| 供应商断保 / 无 SOC2 | vendor file + 年度 SOC2 索取 + 保险证据 | Hex Trust / Sumsub / SMS / 云 vendor files |


---

# 附录 A · 世界级产品与标准对标

### 机构级托管密钥安全最佳实践 → HyperTransfer(Hex Trust 之上的编排层)可直接借鉴的 8–12 条

## 前提定位

HyperTransfer 是 **Hex Trust / Hex Safe 之上的合规编排层,不自持私钥**。因此 MPC/HSM/冷存储/多签这类"底层密钥安全"由 Hex Trust 承担,我们**不重复造轮子**;但机构级托管商的一整套 **policy engine、allowlist、quorum、时间锁、分层、可审计性、认证、储备证明** 的思想,恰恰是**编排层最该继承的部分**——我们是"发起交易 + 定义规则 + 留痕"的一方,这些正是编排层的核心职责。下面每条都对齐到本仓库的真实代码锚点。

---

### 1. Policy Engine 在硬件隔离环境内强制执行(而非仅前端校验)
**关键实践**:Fireblocks 把策略规则放进 Intel SGX / AWS Nitro 硬件飞地(secure enclave)内执行——"即便拿到特权基础设施访问权也无法绕过交易审批",构成 MPC-CMP / Secure Enclave / Policy Engine / Network 四层防御。([Fireblocks Security](https://www.fireblocks.com/platforms/security))
**对我们的启示**:当前 `components/ProtectedRoute.tsx` 明确只是 UX 守卫,真正授权靠后端 `require_role()`——方向正确,必须**继续把所有 money-touching 规则的执行权收在后端**(`/api/deposits` 的 `issue-address`/`main`、`/api/refunds` 的 `create/execute`),前端只负责展示。三道合规闸门(KYC / Wallet KYT / Sufficient Fund)绝不能在客户端可跳过。**真正的密钥级 policy 交给 Hex Safe policy engine**,我们的 policy engine 定位为"发起前的合规门"。

### 2. 提现地址 Allowlisting + 新增地址冷静期(time-lock)
**关键实践**:机构普遍要求提现只能打到**白名单地址**,且**新加入白名单的地址锁定 24 小时**才可用(Crypto.com 24h withdrawal lock),Xapo 金库出金设 48 小时窗口。([Crypto.com 24h Lock](https://help.crypto.com/en/articles/6006803-24h-withdrawal-lock))
**对我们的启示**:我们的退款"只退已验证原钱包、禁自由输入新地址"(前后端双重校验 `refund_create` 校验 walletId∈本人 `verified_wallets`)本质就是 allowlist——非常正确。可再增强:① `verified_wallets` 新增记录后设一段**冷静期**再允许作为退款目的地;② 白名单**增删本身**当作敏感动作走审批(见第 3 条),防止有人先偷偷加地址再退款。

### 3. 敏感动作需 Admin Quorum(双人/多人审批,防内鬼)
**关键实践**:Fireblocks Admin Quorum——增删用户、加白名单地址、批准网络连接等敏感变更需**最少 N 个管理员**共同批准,专门"防止恶意管理员把自己钱包加白名单偷钱";Anchorage HSM 内建逻辑校验所有敏感请求(提现/改策略/加用户)须由**客户端有效 quorum + Anchorage 双方**批准。([Fireblocks Capabilities](https://developers.fireblocks.com/docs/capabilities),[Anchorage Smart Storage](https://www.anchorage.com/insights/smart-storage-how-anchorage-provides-crypto-investors-greater-security-and-usability))
**对我们的启示**:退款流已是 maker-checker 雏形(compliance screen → management approve → custodian execute)。应把它**升级为强制 quorum**:大额退款/白名单变更/员工权限变更需≥2 个不同角色/人审批,且**发起人不能同时是审批人**。后端 `require_role` 之上加"分离职责(SoD)"校验;真正的放款 quorum 由 Hex Safe 提现审批兜底。

### 4. 交易发起幂等 + 全链路防重放
**关键实践**:Fireblocks/Hex Safe 发起交易带 `x-request-id`(UUID)幂等头,重发同值返回原结果;签名协议内建防重放。([Fireblocks MPC-CMP](https://www.fireblocks.com/blog/pushing-mpc-wallet-signing-speeds-8x-with-mpc-cmp-9))
**对我们的启示**:已有 `hexsafe_idempotency` 表 + 提现幂等——保持并扩展到**所有发起交易的编排动作**(issue-address / main / refund execute),用业务层 idempotency key 防止网络重试导致重复发址/重复放款。这是编排层比底层更容易出错的地方(重试逻辑在我们这)。

### 5. Cold / Warm / Hot 分层 + 资金隔离(不与他人混同)
**关键实践**:BitGo 地理分布式冷存储 + 多签,冷钱包与联网系统完全隔离;Coinbase Custody **segregated cold storage**,各客户数字资产**不混同**;Anchorage HSM 让"冷存储级安全跑出热钱包速度"。([BitGo Custody](https://www.bitgo.com/products/custody-wallets/),[Coinbase Prime Custody](https://www.coinbase.com/prime/custody))
**对我们的启示**:分层与隔离由 Hex Trust 提供(custody evidence 已标注为 "Hex Trust provided controls")。编排层要做的是**在数据模型上体现隔离**——WTA 是**分层 vault 结构而非单一地址**(CLAUDE.md 已明确),每个 Operator/客户的结算资金在 `deposit_requests`/vault 映射上逻辑隔离,对账时能证明"谁的钱在哪个 vault"。

### 6. 每笔交易授权走独立 quorum + 交易级(非仅钱包级)风控
**关键实践**:Fireblocks Policy Engine 按发起人、金额、资产、目的地等过滤器决定 block/approve/加签;Anchorage 每个用户有唯一 user key,须经多重生物识别才能批准单笔交易。([Fireblocks Capabilities](https://developers.fireblocks.com/docs/capabilities))
**对我们的启示**:呼应我们"pre-deposit KYT 不能替代到账后 transaction KYT"的口径。规则要**分级**:小额自动过、大额/新目的地/EDD 命中强制人工加签。退款金额客户端不设上限时,后端更要按金额档位触发不同审批深度(现在靠员工端 vault 余额 + 管理层审批兜底,应把档位规则显式化)。

### 7. 认证升级:从 SMS OTP 走向 Passkey/生物识别 + 敏感动作 step-up
**关键实践**:Anchorage 用 iPhone 生物识别做登录**和**交易审批,每个用户唯一 user key;机构标准是强 MFA + 交易级二次确认,而非仅登录一次。([Anchorage Smart Storage](https://www.anchorage.com/insights/smart-storage-how-anchorage-provides-crypto-investors-greater-security-and-usability))
**对我们的启示**:CLAUDE.md 已把"接 Okta OIDC + Passkey/WebAuthn(不用 SMS OTP)"列为生产目标。优先级应提高:① 员工端 `/ops` 尽快落真实 Okta(现为 `DEMO_STAFF_TOKEN` demo 旁路);② **敏感动作 step-up**(发址/放款/改白名单时二次强认证),而不只是登录时一次 2FA;③ 生产必须关闭 `HT_DEMO_BYPASS_2FA` 等全部 demo 旁路(任意 6 位码通过、自动填码)。

### 8. 会话与密钥卫生:HttpOnly Cookie + 密钥加密存储 + 轮换
**关键实践**:机构级平台强调 API key rotation、IP allowlist、密钥不落明文;MPC 保证"完整私钥任何时刻都不在单一位置组装"。([Fireblocks MPC 101](https://www.fireblocks.com/report/what-is-mpc))
**对我们的启示**:直接对齐 §8/§9 已知技术债——① 会话从 localStorage token 改 **HttpOnly + Secure + SameSite Cookie**(防 XSS 窃取);② TOTP/OTP secret **明文存储**必须改为加密(KMS/信封加密);③ Hex Safe 的 `x-api-key`/ES256 私钥走密钥管理服务 + 定期轮换 + IP allowlist,不进代码库/不进 `.env` 明文。

### 9. 全动作不可篡改审计留痕(交易可追溯 + 合规证据链)
**关键实践**:SOC 2 五大准则(安全/可用/处理完整性/保密/隐私)要求可审计控制;托管商保留完整操作日志与 custody evidence 供审计。([Coinbase SOC 报告](https://www.coinbase.com/blog/coinbase-inc-completes-initial-prime-broker-prime-soc-1-and-soc-2-type-2))
**对我们的启示**:已有 `audit_trail` 表——要保证**所有关键动作强制留痕且不可删改**(append-only):发址、KYT 判定、Travel Rule 提交、退款审批链、员工权限变更、白名单增删,每条含 who/what/when/前后状态。这是未来过 SOC 2 / 应对监管问询的地基,也是"谁批准了这笔可疑退款"的举证依据。

### 10. 独立第三方审计 + 认证(SOC 2 / ISO 27001 / CCSS),别只靠自证
**关键实践**:Anchorage 拿 SOC 2 + OCC 联邦银行牌照;Coinbase Prime 完成 SOC 1/SOC 2 Type 2;BitGo 为受监管合格托管人。([Coinbase Custody SOC](https://www.crowdfundinsider.com/2020/02/157497-coinbase-custody-completes-soc-1-soc-2-examinations/),[BitGo Qualified Custody](https://www.bitgo.com/products/qualified-custody/))
**对我们的启示**:托管合规由 Hex Trust 背书,但**编排层自身**也应走向 SOC 2 Type 2 / ISO 27001。对齐 §8.5 牌照路线图(Phase 0 纯技术服务商 → MSO):即使不持牌,**认证是 B2B 企业客户(赌场/OTC)采购的入场券**。近期先做:第三方渗透测试 + 依赖漏洞扫描(CI 已有门禁,补 SAST/SCA)。

### 11. 对账 / 储备证明:定期证明"链上余额 = 账面负债"
**关键实践**:Circle 由四大之一(Deloitte)**每月**做 USDC 储备 AUP 证明,**每周**披露储备构成 + mint/burn 流,并有 BlackRock 独立第三方报告;PoR(proof-of-reserves)是稳定币/托管透明度标配。([Circle Transparency](https://www.circle.com/transparency))
**对我们的启示**:我们不发币,但作为"入金→结算"编排方,应建**定期对账机制**证明 vault 链上余额与 `deposit_requests`/结算账面一致(§4.4c reconciliation mock 要落地为真实对账 job)。这既是内控,也是给 Operator 客户的透明度承诺——对应 process v1 §C "Sufficient Fund in Vault"(现为人工登 Hex Trust 后台核对,应自动化拉取 vault 余额做日终对账 + 差异告警)。

### 12. 脱锚 / 稳定币风险的实时监控与应急通道
**关键实践**:Circle 储备高流动性(80%+ 在 BlackRock 管理的 2a-7 政府货币基金,加权到期<60 天,BNY Mellon 托管)+ 法律隔离,支撑锚定稳定性。([Circle USDC](https://www.circle.com/usdc))
**对我们的启示**:已有 depeg 0.95 触发阈值 → HT Markets 24/7 OTC 通道(`lib/treasury-ops.ts`)。应把它从 mock 做成**实时价格监控 + 自动告警 + 熔断**:当 USDT 脱锚时暂停结算/自动路由到 OTC,并在客户端/后台明确提示。这是"只做 USDT"单一资产集中风险的必要对冲。

---

## 落地优先级建议(编排层视角)

| 优先级 | 条目 | 理由 |
|---|---|---|
| **P0 生产必做** | #7 关 demo 旁路 + 员工端真 Okta;#8 HttpOnly Cookie + 密钥加密;#9 审计留痕不可篡改 | 上线前的安全红线,现全是已知技术债 |
| **P1 近期** | #2 白名单冷静期;#3 强制 quorum + 职责分离;#4 幂等扩展 | 直接防内鬼 / 防重复放款,编排层最易出错处 |
| **P2 中期** | #10 SOC 2 认证;#11 自动对账;#12 脱锚熔断 | B2B 采购入场券 + 资金安全兜底 |

**核心判断**:因为我们不持私钥,底层密钥安全(MPC/HSM/冷存储)交给 Hex Trust 即可,**不要自建**。编排层真正的价值与风险都在 **policy / allowlist / quorum / 幂等 / 审计 / 对账** 这六件事上——这恰是上述机构做得最重的部分,也是我们代码里已有雏形、最该补强的地方。

## Sources
- [Fireblocks — Crypto Enterprise-Grade Security Platform](https://www.fireblocks.com/platforms/security)
- [Fireblocks — Key Features & Capabilities (Developer Docs)](https://developers.fireblocks.com/docs/capabilities)
- [Fireblocks — MPC-CMP 8X signing speed](https://www.fireblocks.com/blog/pushing-mpc-wallet-signing-speeds-8x-with-mpc-cmp-9)
- [Fireblocks — What is MPC (MPC 101)](https://www.fireblocks.com/report/what-is-mpc)
- [Anchorage Digital — Smart Storage (HSM + quorum + biometrics)](https://www.anchorage.com/insights/smart-storage-how-anchorage-provides-crypto-investors-greater-security-and-usability)
- [BitGo — Custodial Wallets for Institutions](https://www.bitgo.com/products/custody-wallets/)
- [BitGo — Institutional / Qualified Custody](https://www.bitgo.com/products/qualified-custody/)
- [Coinbase Prime — Custody](https://www.coinbase.com/prime/custody)
- [Coinbase — Prime SOC 1 & SOC 2 Type 2](https://www.coinbase.com/blog/coinbase-inc-completes-initial-prime-broker-prime-soc-1-and-soc-2-type-2)
- [Coinbase Custody — SOC 1 & SOC 2 examinations](https://www.crowdfundinsider.com/2020/02/157497-coinbase-custody-completes-soc-1-soc-2-examinations/)
- [Circle — Transparency & Stability (Deloitte monthly attestation, weekly disclosure)](https://www.circle.com/transparency)
- [Circle — USDC (reserve composition)](https://www.circle.com/usdc)
- [Crypto.com — 24h Withdrawal Lock on newly-added address](https://help.crypto.com/en/articles/6006803-24h-withdrawal-lock)

### 加密资产被盗根因与 world-class 防御 —— 对 HyperTransfer 最相关的 10 条

## 一、近年重大盗币事件根因(联网核实)

| 事件 | 规模 | 根因(怎么发生的) | 攻击类别 |
|---|---|---|---|
| **Bybit(2025.02)** | ~$1.4B ETH | Safe{Wallet} **开发者机器被入侵 → 篡改前端 JS**,冷钱包签名人在被伪造的 UI 上**盲签**(blind signing),UI 显示正常交易、底层却把 Proxy Multisig 升级为恶意实现(19 小时前预部署) | **前端供应链 + UI 伪造 + 盲签** |
| **DMM Bitcoin(2024.05)** | ~$305M BTC | 钱包软件商 **Ginco 员工**被 LinkedIn 假招聘钓鱼(恶意 Python "笔试")→ 窃取 session cookie 冒充 → 篡改 DMM 员工发起的合法交易 | **供应链 + 内部访问 + 会话劫持** |
| **WazirX(2024.07)** | ~$230M | Gnosis Safe 4/6 多签;Liminal 托管**界面显示的交易与实际 payload 不一致**,签名人依赖网页显示而盲签硬件设备(不显示 token/目标地址)→ 多签被换成攻击者 8 天前部署的恶意合约 | **payload 不一致 + 盲签 + UI 欺骗** |
| **Ronin Bridge(2022.03)** | ~$620M | Sky Mavis 高级工程师被 LinkedIn 假 offer 钓鱼 → 拿到私钥;验证节点仅 9 个、5/9 即可放行,且给 Axie DAO 的**临时签名权限从未回收** | **私钥泄露 + 社工 + 权限未回收** |
| **npm 供应链(2025)** | 波及 20 亿+周下载 | debug/chalk 等热门包被植入 **crypto drainer**,在前端把"标准 token approval"偷换成宽授权 permit,横扫资产 | **依赖供应链 + 前端注入** |
| **CoW Swap 前端** | — | **DNS 劫持**指向恶意服务器,伪造像素级相同 UI(复用原 CSS/图),核心是 Wallet Drainer 脚本 | **DNS 劫持 + UI 伪造** |
| Mt.Gox(历史)/ Ronin | — | 长期私钥/热钱包管理失控,少数密钥单点失守即全盘 | **密钥管理单点** |

**贯穿性根因**:① 几乎全是**朝鲜 Lazarus/TraderTraitor**;② 极少是智能合约漏洞,**绝大多数是"人 + 前端 + 密钥"**——盲签、UI/payload 不一致、开发者机器/供应链、社工钓鱼、权限未回收。这与我们"平台不持私钥、托管在 Hex Trust"的架构高度相关:**我们的攻击面主要在前端、员工端、审批编排和供应链,不在链上。**

## 二、适用安全标准
- **CCSS v9.0(2024.12,C4 组织)**:专为加密系统的密钥管理标准。要求密钥用 NIST SP 800-90A DRBG(≥2 独立熵源)生成、非用时强加密存储、多签密钥由**不同操作者/独立实体分持**。与 ISO 27001 / SOC 2 互补(后者建基线信任,CCSS 补密钥空白)。[cryptoconsortium.org](https://cryptoconsortium.org/cryptocurrency-security-standard-documentation/details/)
- **NIST CSF / SP 800-90A**、**ISO 27001**、**SOC 2**、**OWASP ASVS / API Security Top 10 / SRI+CSP+第三方 JS 管理 Cheat Sheet**。

## 三、对 HyperTransfer 最相关的 10 条防御要点

> 结合我们真实代码锚点(`backend/server.py`、`hexsafe_client.py`、`client/src/lib/api.ts`、`deploy/nginx.conf`、`docker-compose.yml`、RBAC/审批编排)。

1. **消灭盲签、强制"所见即所签"** —— Bybit/WazirX 的核心。任何触发 Hex Safe `create_withdrawal` 的退款/结算,员工端必须显示**解析后**的 `{ticker, chainId, amountDecimal, to}` 与硬件/后端实际签名 payload **逐字段一致校验**,目标地址只能从 `verified_wallets` 选、禁止自由输入(退款已做,须扩到全部出金)。[nccgroup.com](https://www.nccgroup.com/research/in-depth-technical-analysis-of-the-bybit-hack/) · [blockaid.io](https://www.blockaid.io/blog/the-230m-blind-spot)

2. **前端完整性:SRI + 严格 CSP + 锁死第三方 JS** —— 对抗 Bybit/CoW/npm 式前端注入。`deploy/nginx.conf` 加严格 `Content-Security-Policy`(禁 inline、白名单 source),所有外链脚本加 **Subresource Integrity(SRI)哈希**,减少 CDN 依赖。[owasp.org SRI](https://owasp.org/www-community/controls/SubresourceIntegrity) · [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

3. **依赖供应链治理** —— npm drainer 教训。锁定 lockfile + 校验 hash、CI 加 `pnpm audit`/SCA + 依赖签名验证、CI/CD 最小权限、`Dockerfile.frontend` 用固定 digest 基镜像。[paloaltonetworks.com](https://www.paloaltonetworks.com/blog/cloud-security/npm-supply-chain-attack/)

4. **托管出金走多签 quorum + maker-checker,严禁单点** —— Ronin(5/9 即失守)、CCSS 多签分持要求。退款编排(compliance screen → management approve → custodian execute)是正确骨架,须落成**独立角色独立设备**审批,单角色不能同时发起并放行。[roninchain.com](https://roninchain.com/blog/posts/community-alert-ronin-validators-6513cc78a5edc1001b03c366) · [CCSS](https://cryptoconsortium.org/cryptocurrency-security-standard-documentation/details/)

5. **员工端反社工/反钓鱼 + 抗钓鱼 MFA** —— DMM/Ronin 全从 LinkedIn 假招聘起手。工作人员端(拟接 Okta)必须**强制 FIDO2/WebAuthn Passkey**(而非短信 OTP),对 custodian/admin 高危角色做设备绑定与反钓鱼演练。[fbi.gov](https://www.fbi.gov/news/press-releases/fbi-dc3-and-npa-identification-of-north-korean-cyber-actors-tracked-as-tradertraitor)

6. **权限最小化 + 定期回收(尤其临时授权)** —— Ronin 临时签名权永不回收致命。对 `user_roles`/RBAC 加**到期回收、定期 access review、离职/换岗即撤**;`require_role` 守卫要覆盖每个 money-touching 端点(现已部分做),配自动化审计。[grvt.io](https://grvt.io/blog/crypto-history-ronin-bridge-hack/)

7. **消除 demo bypass 混入生产的风险** —— 我们自身最大风险面。`HT_DEMO_BYPASS_2FA`、`DEMO_STAFF_TOKEN`(直给 admin 全权)、任意 6 位码通过、重复注册成功——**必须在生产构建期硬移除/编译剔除**,而非仅运行时判 `SUMSUB_ENVIRONMENT`;部署 workflow 已对 CORS=`*`/QA 短信拒绝部署,应把 demo 开关也纳入同一红线门禁。(对应 Bybit"预部署恶意实现"教训:任何隐藏后门都是灾难)

8. **会话安全硬化** —— DMM 靠**窃取 session cookie 冒充**得手。token 从 localStorage 迁到 **HttpOnly + Secure + SameSite Cookie**,加短 TTL、设备指纹、异常地理/并发检测、高危动作 **step-up 重认证**;当前 `client/src/lib/api.ts` 的 localStorage 方案须改。[thehackernews.com DMM](https://thehackernews.com/2024/12/north-korean-hackers-pull-off-308m.html)

9. **密钥/凭据按 CCSS 管理,退出明文存储** —— 现状 TOTP/OTP 密钥明文存 SQLite 是技术债。`HEXSAFE_*` 私钥、TOTP secret 迁入 **KMS/HSM 或密封保管**,ES256 签名密钥定期轮换(`hexsafe_client.py`),密钥非用时强加密,符合 CCSS 生成/存储/多操作者分持要求。[cryptoconsortium.org](https://cryptoconsortium.org/cryptocurrency-security-standard-documentation/details/)

10. **纵深监控 + 异常出金熔断 + 可验证审计** —— Bybit/WazirX 均在**恶意合约预部署数日/数小时**后才触发,有可观测窗口。基于 `audit_trail` 做**防篡改审计**(append-only/外部锚定),对出金加**金额阈值、目标地址白名单外、速率异常**的实时告警与自动冻结,并纳入 SOC 2 / ISO 27001 监控控制族。[chainalysis.com](https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2025/) · [halborn.com Bybit](https://www.halborn.com/blog/post/how-the-bybit-hack-happened-and-how-to-prevent-the-next-one-with-seraph)

---

**一句话结论**:近年巨额盗币**几乎不是链上合约被破**,而是**前端被注入 + 员工被钓鱼 + 盲签 + 密钥/权限管理失控**。HyperTransfer 不持私钥不代表安全——我们的命门在**前端完整性、员工端抗钓鱼、审批编排的所见即所签、以及生产环境彻底清除 demo bypass**。上述 10 条按此排序,前 3 条(反盲签、前端 SRI/CSP、供应链)与第 7 条(demo bypass)应最优先。

### 主要来源
- Bybit:[NCC Group](https://www.nccgroup.com/research/in-depth-technical-analysis-of-the-bybit-hack/) · [The Hacker News](https://thehackernews.com/2025/02/bybit-hack-traced-to-safewallet-supply.html) · [Halborn](https://www.halborn.com/blog/post/how-the-bybit-hack-happened-and-how-to-prevent-the-next-one-with-seraph)
- DMM:[FBI](https://www.fbi.gov/news/press-releases/fbi-dc3-and-npa-identification-of-north-korean-cyber-actors-tracked-as-tradertraitor) · [The Hacker News](https://thehackernews.com/2024/12/north-korean-hackers-pull-off-308m.html) · [Halborn](https://www.halborn.com/blog/post/explained-the-dmm-bitcoin-hack-may-2024)
- WazirX:[Blockaid](https://www.blockaid.io/blog/the-230m-blind-spot) · [Halborn](https://www.halborn.com/blog/post/explained-the-wazirx-hack-july-2024) · [Wikipedia](https://en.wikipedia.org/wiki/2024_WazirX_hack)
- Ronin:[Ronin 官方](https://roninchain.com/blog/posts/community-alert-ronin-validators-6513cc78a5edc1001b03c366) · [GRVT](https://grvt.io/blog/crypto-history-ronin-bridge-hack/)
- 供应链/前端:[Palo Alto Networks](https://www.paloaltonetworks.com/blog/cloud-security/npm-supply-chain-attack/) · [KuCoin CoW Swap DNS](https://www.kucoin.com/blog/cow-swap-frontend-attack-explained-dns-hijacking-how-it-works-and-how-to-protect-your-wallet-in-defi)
- 标准:[CCSS v9.0 (C4)](https://cryptoconsortium.org/cryptocurrency-security-standard-documentation/details/) · [OWASP SRI](https://owasp.org/www-community/controls/SubresourceIntegrity) · [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- 年度趋势:[Chainalysis 2025](https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2025/)

### 监管与安全硬约束清单:香港 SFC/AMLO/PDPO + FATF Travel Rule 对 HyperTransfer 的强制条款

> 研究口径:本清单聚焦**对 HyperTransfer 安全/合规方案构成硬约束的条款**,并映射到本项目真实代码锚点(`backend/server.py` 端点、`hexsafe_client.py`、`deposit_requests` 状态机、三道合规闸门等)。**前提定性**:HyperTransfer 现走**Phase 0(纯技术服务商)→ Phase 1 MSO** 路线,私钥托管在**第三方 Hex Trust(持牌 VATP/TCSP)**,平台本身不持私钥。因此下列 SFC VATP「保管/冷存储/保险」条款**主要落在 Hex Trust 身上**,但一旦平台被认定触及 VA custody/dealing 或自营环节,即直接适用——这是最大的定性风险点,方案必须明确边界。

---

## 一、香港 SFC 虚拟资产交易平台(VATP)——保管/私钥/网络安全(自 2023-06-01 生效)

| # | 硬约束条款 | 对 HyperTransfer 的影响 / 代码锚点 |
|---|---|---|
| 1.1 | **≥98% 客户虚拟资产须存冷存储**,≤2% 可放热钱包及其他存储(SFC 个案豁免除外) | 由 **Hex Trust/Hex Safe** 承担;方案须在合同层确认 Hex Trust 冷热比例合规,`hexsafe_client.py` 的 `create_withdrawal` 走的是托管方热钱包额度,平台**不得**自建热钱包缓冲资金 |
| 1.2 | **种子与私钥(含备份)须存于经认证的 HSM**(SFC 明确"currently expects ... appropriately certified HSM") | 平台**永不接触私钥**是合规基线;`server.py` / DB(users/verified_wallets)**禁止**存储任何私钥、助记词、Hex Safe 签名密钥明文。当前 `HEXSAFE_*`(ES256 签名密钥)属**API 调用凭据**而非资产私钥,但仍须迁至 HSM/KMS/密管服务,不得明文入库或进 git |
| 1.3 | **保险/赔偿安排**:冷存储客户资产覆盖 ≥50%、热存储及其他 ≥100%;可用第三方保险 / 信托留存 / 香港持牌行担保组合 | 属 Hex Trust 义务;方案对客户口径中的"custody evidence / 保险 SLA"须标注为 **Hex Trust provided controls**(与 `CasinoOpsPortal` custody evidence 展示一致) |
| 1.4 | **客户资产须与平台自有资产隔离**;须**每日**监控托管客户资产总值 | 对应 process v1 §C「Sufficient Fund in Vault」=**人工登录 Hex Trust 后台核对 vault 余额**(现为 casino-ops `RefundQueuePanel` mock);方案须落地每日对账 job + 审计留痕(`audit_trail`) |
| 1.5 | HSM 之外的替代托管方案须待行业安全标准共识,SFC 个案审批 | 约束"未来自营托管(牌照 Phase 3)"路线,现阶段**不适用**,但方案里"自营托管"选项须显式标注需 SFC 批准 |

来源:
- [O'Melveny — HK VATP Licensing Regime](https://www.omm.com/insights/alerts-publications/hong-kong-launches-new-virtual-asset-trading-platform-licensing-regime/)
- [Hong Kong Lawyer — Recent Updates on VATP Regulatory Requirements(98%/HSM/50%-100% 保险原文)](https://www.hk-lawyer.org/content/recent-updates-regulatory-requirements-virtual-asset-trading-platform-operators)
- [Charltons — SFC Finalises Regulation of VATPs](https://www.charltonslaw.com/hong-kong-sfc-finalises-regulation-of-virtual-asset-trading-platforms/)

---

## 二、FATF Travel Rule(香港经 AMLO Ch.12 落地,自 2023-06-01)

| # | 硬约束条款 | 对 HyperTransfer 的影响 / 代码锚点 |
|---|---|---|
| 2.1 | **阈值 HKD 8,000 ≈ USD 1,000**:达标交易须传 originator 姓名+账号/唯一参考 + 地址/客户ID/证件号/出生日期,及 beneficiary 姓名+账号 | 对应 `deposit_requests.main`「≥USD1k 标 TR」;须确保阈值取 **HKD 8,000 / USD 1,000** 口径(CLAUDE.md 已记早前把港币门槛当美元的 bug 已修) |
| 2.2 | **门槛以下仍须传** originator/beneficiary 姓名+账号(简化字段);**稳定币转账香港采零门槛**(每笔都要) | HyperTransfer Phase 1 **仅 USDT(稳定币)**→ 若被认定属稳定币 rail,须评估**是否所有金额都要 TR**,不能只在 ≥USD1k 触发;`/api/sumsub/travel-rule/*` 逻辑须按此复核 |
| 2.3 | TR 数据须在**转账前或同时**传递,不论金额 | 对应 `canIssueAddress` 三闸门之「TR gate passed」须在 **Hex Safe 发址前**完成(`issue-address` 端点先于 `create_deposit_address`)——现有编排顺序正确,须保持不可绕过 |
| 2.4 | **IVMS101** 为业界标准数据模型;须用兼容协议传输 originator/beneficiary | `lib/travel-rule.ts` 数据模型 + Sumsub Travel Rule 对接须产出 **IVMS101 字段**;方案须确认 Sumsub 输出符合 IVMS101 |
| 2.5 | **对手方 VASP 尽调**:须核验对手方 VASP 身份、评估其 AML/CFT 监管质量与控制充分性、数据保护能力,并取得高管批准 | 现无对手方 VASP 核验逻辑;方案须补 counterparty VASP 目录/尽调流程(Hex Safe `GET /travel_rule/vasp` 可作数据源) |
| 2.6 | **自托管(unhosted)钱包**转入转出须评估风险并采缓释措施 + 采集钱包地址与本人身份标识(所有权验证) | **强约束本项目核心流**:入金来源钱包即自托管钱包 → 现有「先打 1 USDT 验证 → 写 `verified_wallets`」正是所有权验证(satisfies ownership proof);须在方案中明确定性为 self-hosted wallet 风险缓释措施 |
| 2.7 | **Sunrise / 对手方不可识别**:对手方无法识别或不合规时,须能**拒绝/暂停**转账 | `screen_source_wallet`(Wallet KYT)+ 失败即不发址(`screening_failed`)须硬阻断,不得 demo bypass 进真实资金路径;方案须支持"TR 数据无法获得即拒付" |
| 2.8 | 记录保存 **5 年**(TR 数据 + 交易记录) | SQLite→PostgreSQL 迁移须保证 `deposit_requests`/`refund_requests`/`audit_trail`/`verified_wallets` **保存 ≥5 年**且防篡改 |

来源:
- [21 Analytics — Hong Kong Travel Rule Regulation(HKD 8,000 阈值/字段/时机/自托管/对手方尽调/5 年留存)](https://www.21analytics.co/travel-rule-regulations/hong-kong-travel-rule-regulation/)
- [FATF — Updated Guidance for VA and VASPs](https://www.fatf-gafi.org/content/dam/fatf-gafi/guidance/Updated-Guidance-VA-VASP.pdf)
- [FATF — Best Practices on Travel Rule Supervision (2025)](https://www.fatf-gafi.org/content/dam/fatf-gafi/recommendations/Best-Practices-Travel-Rule-Supervision.pdf)
- [Notabene — What is the Crypto Travel Rule(IVMS101/对手方 KYC 责任)](https://notabene.id/crypto-travel-rule-101/what-is-the-crypto-travel-rule)

---

## 三、MSO / AMLO(Cap. 615,海关 C&ED 监管)——Phase 1 法币结算直接适用

| # | 硬约束条款 | 对 HyperTransfer 的影响 / 代码锚点 |
|---|---|---|
| 3.1 | **无 MSO 牌照经营货币服务=刑事罪**(罚款 HKD 100 万 + 监禁 2 年);法币↔虚拟资产兑换结算(HT Markets OTC / Forex)即触 MSO | Phase 1「法币结算」(`settle` 端点 / `DEPOSIT_FIAT_RATE`)**必须先取得 MSO 牌照**,否则该功能不得对港客户上线;方案须把 `settle` 的上线 gated on 牌照状态 |
| 3.2 | **CDD**:交易 > HKD 8,000 须核验身份,高风险客户加强尽调(EDD) | 对应 KYC 闸门 `user_kyc_ok`;须确保 KYC(Sumsub)覆盖率与 EDD 分流,`require_kyc` 挂在所有 money-touching 端点 |
| 3.3 | **记录保存 ≥6 年**(客户与交易记录) | 注意:MSO 是 **6 年**、TR 是 5 年 → 方案取**较长者 6 年**为统一保留基线 |
| 3.4 | **持续监控可疑活动 + 无延迟向 JFIU 报送 STR** | 现无 STR/可疑交易监控与报送流程;方案须补 KYT 命中(dirty/sanction)→ 案件→ STR 报送闭环(现 casino-ops 为 mock) |
| 3.5 | **须委任 MLRO(洗钱报告主任)+ 合规主任**;须有 CDD/记录/培训内部程序 | 对应 RBAC 的 `compliance` 角色;方案须把 MLRO 定为具名岗位而非 demo admin,`require_role("compliance")` 守卫报送动作 |

来源:
- [HK Customs & Excise — Supervision of MSOs](https://www.customs.gov.hk/en/service-enforcement-information/anti-money-laundering/msos/index.html)
- [C&ED — MSO Licensing Guide (2026)](https://eservices.customs.gov.hk/MSOS/download/guideline/Licensing_Guide_en.pdf)
- [Ascentium — MSO Licence Complete Guide(6 年留存/CDD/MLRO/罚则)](https://www.ascentium.com/hong-kong/insights/money-service-operator-mso-licence-in-hong-kong-a-complete-guide)

---

## 四、PDPO 个人资料私隐 + HK↔Macau 跨境数据

| # | 硬约束条款 | 对 HyperTransfer 的影响 / 代码锚点 |
|---|---|---|
| 4.1 | **PDPO 六项保护原则(DPP1-6)全程适用**:收集限于必要、保留不超必要期限、安全保障、目的限制 | KYC/TR 采集的姓名/证件/地址/钱包属敏感 PII;`users`/`verified_wallets`/`email_otps` 须最小化采集 + 加密存储 + 到期清理 |
| 4.2 | **§33 跨境传输限制迄今未生效**——但 PCPD 强烈建议**主动遵循**:传输前须确保对方地有同等保护法、或书面同意、或尽职调查确保等同保护 | HK↔Macau 数据流(赌场 Operator 在澳门,数据可能跨境)须走 **PCPD 建议标准合约条款(2022 Model Contractual Clauses)** + 数据处理协议;方案须落地跨境 DPA,不能因 §33 未生效而忽略 |
| 4.3 | PCPD 已发布**跨境转移建议标准合约条款**(2022)与实务指引(2014) | 与 Hex Trust / Sumsub / 短信网关(武汉极数,数据出境至内地)等**所有第三方处理者**须签 DPA + 采用 Model Clauses;短信 OTP 走内地网关是明确的跨境数据出境点,须评估 |
| 4.4 | 澳门有独立个资法(第 8/2005 号法律),与 HK PDPO 不同,跨境须双向合规 | 白标口径(禁客户真名)与数据隔离(澳门 access exclusion)须在方案中作为 PDPO+澳门法双合规控制项 |

来源:
- [PCPD — Section 33 介绍](https://www.pcpd.org.hk/english/resources_centre/publications/guidance/fact1_intro_1.html)
- [Hogan Lovells — PCPD Model Contractual Clauses for Cross-border Transfers](https://www.hoganlovells.com/en/publications/hong-kong-pcpd-publishes-model-contractual-clauses-for-cross-border-data-transfers)
- [Tanner De Witt — Cross-border transfers & Section 33](https://www.tannerdewitt.com/cross-border-transfers-section-33/)
- [Baker McKenzie — HK International Data Transfer](https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/asia-pacific/hong-kong/topics/international-data-transfer)

---

## 五、对 HyperTransfer 安全方案的直接落地要求(综合导出)

1. **私钥/托管边界(P0)**:平台代码库与 DB **绝不出现资产私钥/助记词**;`HEXSAFE_*` 签名密钥、`SMTP_*`、`SMS_API_URL` 凭据一律迁 KMS/HSM/密管,当前明文入库 + demo bypass 属**上线前必修 blocker**(对应记忆里已列安全技术债)。
2. **生产环境全面关闭 demo bypass(P0)**:`HT_DEMO_BYPASS_2FA`、任意 6 位码通过、自动填码、重复注册成功、`DEMO_STAFF_SESSION_TOKEN`→admin 直登——这些在真实资金/PII 路径下违反 AMLO CDD 与 SFC 网络安全期望,`SUMSUB_ENVIRONMENT==production` 须硬关闭全部旁路。
3. **会话/认证加固(P1)**:localStorage token → **HttpOnly + Secure Cookie**;CORS `*` → 收窄正式域名;补图形验证码防短信轰炸 + 敏感动作 step-up(提现/退款/改密)——满足 SFC 对客户端网络安全的期望。
4. **数据保留统一 6 年 + 防篡改(P0)**:SQLite→PostgreSQL,`audit_trail`/交易记录 WORM/防篡改,满足 MSO 6 年 + TR 5 年取长。
5. **Travel Rule 阈值与稳定币零门槛(P1)**:复核 USDT 是否触发香港稳定币**零门槛** TR;`main` 的 ≥USD1k 触发逻辑可能不足,须评估每笔都传简化字段。
6. **对手方/自托管钱包(P1)**:「1 USDT 验证 + `verified_wallets`」定性为自托管钱包所有权验证 + 风险缓释;补对手方 VASP 尽调(若目的地为交易所)。
7. **STR/MLRO 闭环(P1,Phase 1 前置)**:补可疑交易监控→ JFIU 报送流程 + 具名 MLRO(RBAC compliance 角色真守卫)。
8. **跨境 DPA(P1)**:与 Hex Trust / Sumsub / 短信内地网关签 PCPD Model Clauses 版 DPA,短信出境至内地为明确跨境点。

> **定性红线提醒**:上述 SFC VATP 保管条款(§一)是否直接约束 HyperTransfer,取决于平台是否被认定从事 VA custody/dealing。当前"纯编排 + 第三方托管"设计使主要托管义务落在 Hex Trust;方案须在合同与技术边界上**持续证明平台不接触私钥、不自营托管、不做自营 dealing**,否则将被拉入 SFC VATP 全套要求。**牌照定性与 STR/MSO 义务建议取得香港持牌律师正式意见**,本清单为技术合规映射,非法律意见。

---

# 附录 C · 完整性审查与上线前 Go/No-Go 清单

## 总评

方案的**威胁模型质量很高**——我逐条比对了 `server.py`，T1（withdrawal 越白名单）、S2（webhook fail-open）、T2（前端回填 TR）、T3（假币合约）、I1（token 存 localStorage）、R2（audit 无哈希链）**全部在真实代码中复现无误**，不是纸面威胁。综合部分（A–E）的**排序与定调**也正确：把"资金被盗"和"翻转裁决"两条主线拎出来，P0 聚焦提现/闸门绕过，符合 assume-breach 视角。

问题出在**综合部分（总纲）本身仍偏"总纲话术"**：Top 10 表和六层架构里有相当一部分控制**只说了'做什么'，没说'改 `server.py` 的哪一行 / 哪张表 / 哪个开关'**——而分域小节尚未展开，导致管理层拿这份总纲无法直接派工。下面按 4 项要求逐条给出。

---

## 一、方案尚缺或偏薄之处（遗漏的攻击面 / 未覆盖的控制 / 矛盾）

### 1. 遗漏或偏薄的攻击面

- **邀请链路整条未进威胁模型**。`create_invitation`/`approve_invitation`/`register_invite`/`invitation_public`/`invitation_is_redeemable`（server.py:2016–2143）是**账号准入的唯一入口**，且 `HT_DEMO_BYPASS_2FA` 下"邀请可重复跑、重复注册也成功"。缺失威胁：**单一 RM 自批自发**（`create_invitation` 要 `rm`、`approve` 要 `marketing`，但没写"同一自然人不得兼两角色"的 SoD 约束）、**邀请链接 6h TTL（`INVITE_TTL`）在 demo 放宽后是否泄入生产**、**`invitation_public` 落地页的枚举/爆破**。这是合成身份洗钱的**上游**，比 S2 更靠前，方案却只在 S2 提了 Sumsub。
- **`register_invite` 的邮箱绑定与 verified_wallets 的所有权链**未审。攻击者若能在邀请注册阶段绑定受害者邮箱 / 或在 KYC 阶段用他人证件（Sumsub liveness 之外），后续 `verified_wallets[user_id]` 的"本人原钱包"前提即被架空——**T1 的修复（提现∈verified_wallets）依赖 verified_wallets 本身可信**，这条依赖链没被显式论证。
- **`deposit_confirm_test` → `record_verified_wallet`（server.py:3540/3567）是 verified_wallets 的唯一写入口**，却几乎没被威胁模型点名。1 USDT 验证一旦被伪造到账（T3 假币 / 或 demo 占位路径），就把攻击者地址写进白名单 → 之后 T1/退款全部"合法"。**这才是白名单污染的根**，应升为 P0 与 T1 并列。
- **幂等表 `hexsafe_idempotency` 的投毒/重放**未覆盖。`hexsafe_withdrawal`（server.py:3011–3016）用客户端可控的 `idempotencyKey` 做缓存键：攻击者**预置一个 key 的"成功响应"**或**复用他人 key** 时的行为边界没定义。
- **`_hexsafe_call` 响应零信任比对**在 C 层④/⑤反复承诺，但代码里 withdrawal（3023）拿到 result 后**未回比 `to/amount/chainId` 是否等于本地意图**就落缓存返回。这是方案自己立的原则，代码没兑现，属"控制声明与实现的缺口"，应列为明确待办而非泛泛而谈。
- **短信/邮件 OTP 轰炸与成本攻击**只在 S3 一笔带过。`/api/send-otp` 走 QA 网关 `SMS_API_URL`，缺**图形验证码 / 设备指纹 / 每 IP+每号双维限频**的具体设计——CLAUDE.md 技术债里明确列了"缺图形验证码防短信轰炸"，方案未把它锚定到 `/api/send-otp` 与 `/api/password/send-otp`。
- **DB 迁移期的攻击面**（server.py:388 起 `users_new` 等一批 `*_new` 表 + `.bak`）无人管。旧 `hypertransfer_auth.db` 自动迁移会生成 `.bak` 明文副本（含 TOTP/OTP 明文），**备份即数据泄露面**，方案④数据层没提"迁移产物与备份的加密/销毁"。

### 2. 未覆盖的控制

- **密钥管理具体化缺失**：`HEXSAFE_*`（ES256 私钥、api-key）、`SUMSUB_WEBHOOK_SECRET_KEY`、会话签名密钥的**存放（KMS/HSM vs env 明文）、轮换、泄露应急吊销**全无。方案说"迁 KMS 加密"但没说 Hex Safe 那把 ES256 私钥怎么托管——**它一旦泄露等同拿到出网签名权**，比 DB 里的 TOTP 更致命。
- **供应链 / 构建完整性**：D2 提了 CI grep 门禁扫 demo 常量，但没提**`vite build` 产物完整性、依赖 SCA/SBOM、`corepack pnpm` lockfile 校验、镜像签名**。demo 旁路"随 vite build 打进 bundle"本质是构建期问题，只 grep 不够。
- **数据保留 / 删除 / 跨境**：九、合规即安全只有标题。HK↔Macau 数据隔离方案 C④只说"逻辑隔离"，缺**物理/逻辑隔离的判定、跨境传输的法律基础、KYC PII 保留期与到期销毁**（KYC 6 个月有效期 ≠ 数据保留期，两者方案没区分）。

### 3. 彼此矛盾之处

- **T1 缓解 vs withdrawal 端点定位**：D 表第 1 条要"端点内强制 toAddress∈verified_wallets"，但 `/api/hexsafe/withdrawal` 是**casino-ops 员工手工托管工具**（`require_role("custodian")`），其调用方还包括退款 execute。若无脑加"必须∈发起人 user_id 的 verified_wallets"，会**打断 staff 手工运维场景**（staff 的 user_id 名下没有 patron 的钱包）。方案没说清"按 patron user_id 校验"还是"按 refund_request 关联校验"——**这是落地会直接卡住的矛盾**，必须改成"withdrawal 必须携带 refund_request_id / deposit_id，由后端反查该单归属 patron 的 verified_wallets"。
- **Fail-Closed 原则 vs 现有 demo 回退**：B/D 反复讲"未配置即 503 不静默 demo"，但现网大量路径是"未配 Hex Safe 且非 production → demo 占位"。原则与现状的**边界线（哪些环境变量组合触发 fail-closed）**没给判定表，容易两边打架。

---

## 二、量身打造审查（重点）——仍过于通用、需锚定具体对象的表述

| # | 方案里的通用表述 | 应锚定到的本系统具体对象 |
|---|---|---|
| 1 | C③"`user_from_token` 会话解析拒绝 demo actor" | 太笼统。应写：**`user_from_token`（server.py:1246）在 `SUMSUB_ENVIRONMENT=="production"` 时，命中 `DEMO_LOCAL_SESSION_TOKEN`(1250) 或 `DEMO_STAFF_SESSION_TOKEN`(1263) 一律 raise，而非返回合成 admin**；并在应用启动时 assert 三者互斥。 |
| 2 | D 表 1"与 refund_create 对齐" | 对齐点要点名：`refund_create`（server.py:3144–3151）的校验是 `SELECT * FROM verified_wallets WHERE id=? AND user_id=?`；withdrawal 应**反查 `refund_requests.wallet_id`→`verified_wallets`**，而不是信 `body.toAddress`。 |
| 3 | D 表 4 / T2"后端回查 Sumsub 真实结果" | 具体到行：`deposit_issue_address`（server.py:3503，**3515–3516 用 `body.travelRuleStatus` 覆盖 `tr_status`**）与 `deposit_main`（3581，**3591 同样信 body**）。改为**调 `sumsub_get_review_status` / 查 `sumsub_kyc_applications` 表**，删掉这两处 `body.travelRuleStatus` 覆盖分支。 |
| 4 | D 表 5 / T3"OFFICIAL_CONTRACTS 合约白名单" | 落点是 `get_deposit_by_tx_hash`（`hexsafe_client.py`）与 `deposit_confirm_test`（server.py:3540）：在**写 `record_verified_wallet`(3567) 之前**校验合约地址；且要新增常量 `OFFICIAL_CONTRACTS`（当前代码里**根本不存在**，方案默认它有）。 |
| 5 | C④"TOTP/OTP/恢复码不明文（改 KMS 加密）" | 锚定表：`otps`(184) / `email_otps`(264) / `recovery_codes`(193) / `users` 表里的 TOTP secret 列 / **及迁移产物 `*.bak`**。逐表列出哪列要加密。 |
| 6 | C⑥/D 表 9"audit_trail 哈希链 prev_hash/row_hash" | `audit_trail`（server.py:252–260）**现有 7 列无任何 hash 列**。要改 `write_audit`（server.py:1124）在 INSERT 时计算 `row_hash=H(prev_hash‖行内容)`。方案把它当"补强"，实为"新增列 + 改写入函数 + 回填"。 |
| 7 | D 表 3"服务端主动回查裁决为准" | 点名 `sumsub_webhook`（server.py:2725）**2730 的 `if SUMSUB_WEBHOOK_SECRET_KEY:` 是 fail-open 开关**——改为"secret 为空且非 sandbox 直接 401"，并在消费 `sumsub_webhook_events` 翻转 KYC 前回查。 |
| 8 | C③"业务层幂等 key" | 具体：`hexsafe_withdrawal` 用 `body.idempotencyKey`（server.py:3011）+ 表 `hexsafe_idempotency`(275)。要规定**key 由后端按 refund_request_id 派生、不接受纯客户端自选**，防投毒。 |
| 9 | B"Wallet KYT 双重执行" | `screen_source_wallet`（server.py:3302）**当前是纯 mock**。方案讲"应用层+Hex Safe policy 双重"，但应用层这半边现在是假的——要写明"接 Hex Safe KYT 端点或第三方（Chainalysis/TRM）前，此闸门等于不设防"。 |
| 10 | E"settle 结算金额后端权威计算" | 锚定 `deposit_settle`（server.py:3615）**当前用静态 `DEPOSIT_FIAT_RATE`（3284，demo 7.8）**。要标注 Forex 是 demo，真实汇率口径未定，settle 金额**不可作为对客户的最终结算承诺**。 |
| 11 | C①"生产关闭全部 demo 旁路" | 除 `HT_DEMO_BYPASS_2FA`(122) 外，还要点名 **`/api/sumsub/kyc/demo-approve`（server.py:2683 附近，把 KYC 直接标 approved）** 和 `/login/verify` 的"任意 6 位码"(server.py:1100)——这三处是同一类，CI 门禁 grep 名单要三个都列。 |
| 12 | C②"边界 CORS 收窄" | 锚 `HT_ALLOWED_ORIGINS` env + `deploy/nginx.conf`；并复用 `.github/workflows/hypertransfer-deploy-hk.yml` 里"production 下仍是 `*` 则拒绝部署"的已有门禁作为验收点。 |

---

## 三、最容易被跳过、但一旦跳过就致命的 5 项控制

1. **withdrawal 端点内的白名单硬校验（T1）**。它现在是**注释里的一句"由上层保证"**——落地时最容易被当成"上层已经做了"而跳过，结果 `/api/hexsafe/withdrawal` 对任意 `toAddress` 放行，直达资金损失。**必须在端点内、按 refund/deposit 单反查 verified_wallets 落地，且写测试断言非白名单地址返回 403。**
2. **verified_wallets 写入口（`deposit_confirm_test`/`record_verified_wallet`）的到账真实性 + 合约白名单**。跳过它，前面所有"只退已验证原钱包"的红线都建在**被污染的白名单**上，等于零。
3. **Sumsub webhook 的 fail-closed（S2）**。`if SUMSUB_WEBHOOK_SECRET_KEY:` 这个 gate 太"顺手放行"——运维忘配 secret 时系统**照常翻转 KYC=GREEN**，是最典型的"没报错所以以为没问题"。
4. **生产环境 demo 旁路的多条件 AND + 启动 fail-fast + CI grep**。三处旁路（`HT_DEMO_BYPASS_2FA`、`demo-approve`、任意 6 位码）任一泄入生产即全线失守。单靠"记得关"必被跳过，**必须启动期 assert + CI 门禁双保险**。
5. **敏感动作的 SoD/quorum（发起人≠审批人）真正落到自然人 user_id**。退款 maker-checker 现有 `require_role` 只校角色不校"是否同一个人"；admin 单角色可横跨。跳过"同一 user_id 不得既 create 又 approve"的校验，内鬼一人即可走完全程。

---

## 四、上线前（P0）Go/No-Go 验收清单

> 每条可勾选；括号内为对应本系统改动点。**任一未通过 = No-Go。**

- [ ] **1. 提现白名单硬校验**：`/api/hexsafe/withdrawal`（server.py:2999）与退款 execute 携带 `refund_request_id/deposit_id`，后端反查该单归属 patron 的 `verified_wallets`，非白名单 `toAddress` 返回 403；有自动化测试覆盖。
- [ ] **2. verified_wallets 写入口收口**：`deposit_confirm_test`（3540）写 `record_verified_wallet`(3567) 前，到账经 `OFFICIAL_CONTRACTS` 合约白名单校验（新增常量），假币 → `screening_failed`。
- [ ] **3. TR 闸门去前端信任**：删除 `deposit_issue_address`(3515–3516) 与 `deposit_main`(3591) 中用 `body.travelRuleStatus` 覆盖的分支，改查 `sumsub_kyc_applications` / `sumsub_get_review_status`。
- [ ] **4. Sumsub webhook fail-closed**：`sumsub_webhook`(2730) 未配 `SUMSUB_WEBHOOK_SECRET_KEY` 且非 sandbox → 401；加时间戳 ±5min 防重放 + `applicantId+ts` 幂等。
- [ ] **5. Demo 旁路生产清零**：`HT_DEMO_BYPASS_2FA`(122)、`/api/sumsub/kyc/demo-approve`(2683 区)、`/login/verify` 任意 6 位码(1100)、`DEMO_*SESSION_TOKEN`(116/117) 在 `SUMSUB_ENVIRONMENT=production` 下**启动 fail-fast**；CI grep 门禁扫这 4 个标识符；`vite build` 产物 grep 确认无 `demo-local-staff-session`。
- [ ] **6. user_from_token 拒 demo actor**：`user_from_token`(1246) 在 production 命中任一 demo token 直接 raise（不返回合成 admin）。
- [ ] **7. SoD 到自然人**：退款 `create`(3144)/`screen`(3194)/`approve`(3209)/`execute` 校验**同一 `user_id` 不得跨相邻两步**；admin 不得单人走完全程。
- [ ] **8. 会话迁 Cookie**：`client/src/lib/api.ts`(ht_token localStorage) 迁 HttpOnly+Secure+SameSite=Strict Cookie；nginx 下发 CSP `frame-ancestors 'none'` + Trusted Types。
- [ ] **9. CORS/TLS 收窄**：`HT_ALLOWED_ORIGINS` 收到 `h5.hypercypto.com`；沿用 `hypertransfer-deploy-hk.yml` 门禁"production 下 `*` 则拒绝部署"；强制 TLS1.2+/HSTS。
- [ ] **10. 密钥托管**：`HEXSAFE_*`（ES256 私钥/api-key）、`SUMSUB_WEBHOOK_SECRET_KEY`、会话密钥入 KMS/HSM（非 env 明文）；定义轮换与泄露吊销流程。
- [ ] **11. 敏感数据加密 + 迁移产物销毁**：`otps`/`email_otps`/`recovery_codes`/users.TOTP secret 静态加密；DB 迁移产生的 `*.bak`（含明文密钥）加密或安全销毁；`HT_DB_PATH` 指向加密卷。
- [ ] **12. audit 哈希链 + actor 真实性**：`audit_trail`(252) 新增 `prev_hash/row_hash`，`write_audit`(1124) 计算链式哈希 + append-only + 外部 WORM 副本；资金动作 `actor_user_id` 必为真实自然人（拒 demo actor）。
- [ ] **13. OTP 轰炸防护**：`/api/send-otp` 与 `/api/password/send-otp` 加图形验证码/设备指纹 + 每 IP+每号双维限频。
- [ ] **14. 幂等 key 防投毒**：`hexsafe_withdrawal` 的 `idempotencyKey`(3011) 由后端按 refund_request_id 派生并写 `hexsafe_idempotency`(275)，不接受纯客户端自选；`_hexsafe_call` 结果回比 `to/amount/chainId` 后才落缓存。
- [ ] **15. 上线前外部渗透测试**：聚焦提现绕过、TR/KYC 闸门绕过、白名单污染、demo 旁路残留；依赖 SCA/SBOM 无高危；报告高危清零方可 Go。

---

**相关代码锚点（均绝对路径）**：
- `/Users/yiweichen/Documents/Code/VirtualAsset/hypertransfer-main/backend/server.py`（withdrawal 2999、webhook 2725、user_from_token 1246、TR 闸门 3503/3581、audit_trail 252 / write_audit 1124、screen_source_wallet 3302 mock、deposit_confirm_test 3540、DEPOSIT_FIAT_RATE 3284、demo 开关 116/117/122）
- `/Users/yiweichen/Documents/Code/VirtualAsset/hypertransfer-main/client/src/lib/api.ts`（token 存 localStorage:8/17）
- `/Users/yiweichen/Documents/Code/VirtualAsset/hypertransfer-main/backend/hexsafe_client.py`（ES256 签名 / create_withdrawal / get_deposit_by_tx_hash）
- `/Users/yiweichen/Documents/Code/VirtualAsset/hypertransfer-main/.github/workflows/hypertransfer-deploy-hk.yml`（可复用为 CORS/demo 门禁验收点）

---

# 附录 B · 现状攻击面摸底(Recon 基线)

### 后端认证/会话/授权安全现状清单
## 已有的安全措施

- **密码存储**:`hash_password` 用 PBKDF2-HMAC-SHA256、200k 迭代 + 16 字节随机 salt;`verify_password` 走 `hmac.compare_digest` 常量时间比较。
- **SQL 全参数化**:所有查询用 `?` 占位符;唯一的 f-string(`_deposit_update` 行 3370)拼的是内部列名、值仍参数化,无注入面。
- **OTP 限频/防爆破**:短信与 Email OTP 均 60s 冷却、每日上限 10 次、校验错误上限 5 次、用后即焚,比较用 `compare_digest`。
- **TOTP 防重放**:`verify_totp` 记录 `last_counter`,拒绝 ≤ 已用 counter 的码;窗口 ±1。
- **两步登录**:`login/start` 密码正确才发一次性 `challenge`(5 分钟、5 次上限),`login/verify` 校 TOTP;登录错误信息模糊化(`Incorrect account or password`)。
- **会话/challenge**:`secrets.token_urlsafe` 生成不透明 token(会话 12h);改密后 `DELETE FROM sessions` 踢掉全部旧会话;OTP send 防账号枚举。
- **RBAC 服务端强制**:`require_role` 依赖 `user_from_token` 解析会话 + `get_user_roles`,admin 全通,否则 403;注释明确"前端守卫只是 UX"。
- **恢复码**:一次性、sha256 存储、消费即作废。
- **CORS/密钥**:Sumsub/HexSafe/SMTP 密钥全走环境变量不入库;HexSafe 用 ES256 JWT + digest + x-request-id 幂等。

## 明显的安全差距/风险

- **Demo 旁路面过大**:`DEMO_BYPASS_2FA` 下 `verify_otp`/`verify_email_otp`/`login_verify` 接受任意 6 位码 → 2FA 形同虚设;`DEMO_LOCAL_SESSION_TOKEN`/`DEMO_STAFF_SESSION_TOKEN` 是硬编码 bearer,后者直接合成 **admin 全权限**。仅靠 `SUMSUB_ENVIRONMENT != "production"` 这一个字符串开关兜底,配错即完全沦陷。
- **无登录密码限频**:`login/start` 对密码错误无节流/锁定,可无限撞库(仅 OTP/challenge 有限频)。
- **会话为 localStorage token 非 HttpOnly Cookie**、无旋转/无绝对上限刷新;TOTP secret、OTP 明文入库;`seed_demo.py` 固定 TOTP secret 且 `seed_staff_admin` 把 TOTP secret 打印到日志。
- **step-up 仅前端判定**:`totpEnabled`/step-up 由前端决定是否二次验证,资金动作缺服务端强制。
- **CORS 默认 `*`**、短信默认 QA 网关;`send_invitation_email` 把用户名直接插入 HTML(邮件 XSS/注入风险)。
- **无图形验证码/无短信轰炸防护**(仅时间窗限频)。


### HyperTransfer 客户端(浏览器)安全现状清单
审计范围:`hypertransfer-main/client/src` 的 `lib/api.ts`、`contexts/AuthContext.tsx`、`components/ProtectedRoute.tsx`、`lib/demo-auth.ts`、`lib/authFlow.ts` 与 `index.html`。

## 已有措施
- **Token 自动注入 + 401 自愈**:`api.ts` 请求拦截器统一加 `Authorization: Bearer`,响应拦截器遇 `401` 自动 `clearToken()`,避免陈旧会话残留(`api.ts:26-38`)。
- **错误信息统一脱敏**:后端 detail 经 `ERROR_MESSAGE_MAP`/`normalizeApiMessage` 转英文文案,登录失败模糊化(不区分账号/密码),不外泄内部堆栈(`api.ts:40-78`)。
- **前端不落敏感数据**:未见明文存储密码/私钥/TOTP secret 到 localStorage;`authFlow.ts` 的 pending 态仅用 `sessionStorage`(会话级、跨页短窗、失败即清)。
- **启动会话校验**:`AuthContext` 启动时对本地 token 调 `/me` 校验,失败即 `clearToken()`(`AuthContext.tsx:37-54`)。
- **staff/客户端边界注释明确**:`api.ts:300-301` 注明 Hex Safe 端点客户端不直连;`ProtectedRoute.tsx:33` 注明前端守卫仅 UX、真授权在后端 `require_role`。

## 差距 / 风险
- **Token 存 localStorage(高危)**:`TOKEN_KEY="ht_token"` 明文存于 `localStorage`(`api.ts:8,16-24`),任何 XSS 即可读取整表并盗取会话;应改 HttpOnly + Secure + SameSite Cookie。
- **无 CSP / 无安全头**:`index.html` 未设 Content-Security-Policy、X-Frame-Options、Referrer-Policy 等 meta;XSS/点击劫持无纵深防御(反代 nginx 是否补需另查)。
- **第三方脚本外链**:`index.html:14-16` 直连 Google Fonts(fonts.googleapis/gstatic),无 SRI、无 CSP 白名单约束,构成外部信任面。
- **路由守卫仅 UX、可绕过**:`ProtectedRoute` 基于内存 `user` 判定,前端可篡改;越权防护完全依赖后端,若某后端端点漏配 `require_role` 即暴露。
- **Demo bypass 混入客户端 bundle(严重)**:`demo-auth.ts` 硬编码 demo 明文密码 `Demo@12345`、staff token `demo-local-staff-session`(直接映射 `admin` 全角色);`AuthContext:43-44` 识别 demo token 即免 `/me` 授予 admin。这些常量随生产 build 打包,若后端未严格 gate `HT_DEMO_BYPASS_2FA`/非 production,即可用固定 token 冒充 admin。自动填码(任意 6 位 2FA 通过)同链路存在。
- **无 XSS 主动防护声明**:依赖 React 默认转义,但项目多处 base64/HTML 拼装(如 qrPngBase64、错误文案)需确认无 `dangerouslySetInnerHTML`。
- **建议**:生产 build 剥离 demo-auth 常量、token 迁 Cookie、加 CSP + 安全头、Google Fonts 自托管或加 CSP 白名单。

### Hex Safe 托管集成安全现状清单
## 已有措施

- **私钥/Key 不入库**:`HEXSAFE_API_KEY`、`HEXSAFE_PRIVATE_KEY`(或 `_PATH`)全走环境变量,`_load_private_key()` 支持 PEM 内容或文件路径。
- **ES256 JWT 每请求新签**:claims 含 `exp`(默认 60s 短 TTL)、`api-key`、`uri`、`nonce`(`secrets.randbits(63)` 随机);写操作(POST/PUT)额外带 `digest`=SHA-512(body) base64url,绑定请求体防篡改。
- **幂等**:写操作发 `x-request-id`(UUID);后端 `hexsafe_idempotency` 表按 `idem_key` 持久化,**仅缓存成功响应**,失败不缓存可重试;重放命中直接返回缓存 + 审计 `withdrawal.replay`;`INSERT OR IGNORE` 防并发重复写。
- **提现授权最严**:`/api/hexsafe/withdrawal` 仅 `custodian` 角色;发址 `custodian/ops`;其余读端点 `STAFF_ROLES`。放行最终由 Hex Safe 侧 quorum/maker-checker 决定。
- **审计留痕**:提现在**提交前先审计**(`withdrawal.submit`),即使上游超时也有记录;发址也写审计。
- **错误处理**:`_hexsafe_call` 统一把 HexSafeError→HTTPException(4xx 透传/5xx·网络归 502);`get_transaction` 400 当"查无此笔"。
- **到账轮询**:sandbox 无 webhook 注册端点,走 `list_transactions`/`get_deposit_by_tx_hash` 轮询 + `min_confirmations` 阈值判定。

## 差距 / 风险

- **无 IP allowlist / 无密钥轮换机制**:代码与文档均无 allowlist 概念,私钥无版本/轮换/过期管理,泄露后无快速吊销路径。
- **私钥明文常驻**:PEM 明文存环境变量/文件,进程内 `self.private_key` 长驻内存,无 KMS/HSM 托管。
- **未验证 TLS 主机 / 无证书固定**:`urllib` 默认校验但无 pinning;`User-Agent` 伪装成浏览器绕 Cloudflare。
- **幂等 key 无 TTL / 无清理**:`hexsafe_idempotency` 永不过期,且缓存响应含 to/from/金额等敏感数据明文入 SQLite(非生产 DB)。
- **应用层无 `to` 地址白名单强校验**:withdrawal 端点注释称"原钱包校验由上层保证",但该端点本身接受任意 `toAddress`,绕过上层退款流即可向任意地址提现(需强制校验 `verified_wallets`)。
- **响应无签名校验**:未校验 Hex Safe 返回体真实性(依赖 TLS)。
- **幂等 key 可由客户端指定**:调用方传入相同 `idempotencyKey` 可探测/覆盖返回缓存,建议服务端派生。


### 入金/退款编排与合规闸门安全性评估
## 已有措施

- **KYC 硬阻断闸门（②）落在服务端**：`require_kyc` 挂在入金 `create/screen/issue-address/confirm-test/main` 与退款关键校验，非仅前端；`user_kyc_ok` 校验 `approved` + 6 个月 `valid_until`，`issue-address`/`confirm-test` 再次校验防中途过期。
- **三闸门发址（③）后端强制**：`issue-address` 同时验 KYC + `screening_status=="pass"` + TR gate（`travel_rule_accepted/not_required`），失败/EDD 一律 409 不发址。
- **退款只退原钱包，前后端双重校验**：`refund_create` 强制 `walletId` 属本人 `verified_wallets`（否则 400），`to_address` 由服务端从 verified_wallets 冗余写入，不接受自由地址。
- **1 USDT 验证防伪造**：配置 Hex Safe 时 `confirm-test` 必须真实 txHash 且 `get_deposit_by_tx_hash` 查得到才写 verified_wallets；production 未配置直接 503（不静默 demo）。
- **状态机护栏**：`screen` 仅限发址前状态、`main` 要求 `verify_status=="confirmed"`、幂等再确认不回退状态、`settled/cancelled` 单拒续。
- **RBAC 真守卫 + 单据归属**：staff 端点 `require_role`，patron 端点 `_deposit_owned_or_404` 用 404 不泄露他人单据。
- **资产/网络白名单**：仅 USDT，网络限 ethereum/tron。**审计全覆盖**：每个动作 `write_audit`。
- **退款执行 vault 余额 + 幂等**：`refund_execute` 校验余额、custodian 限定、Hex Safe idempotency_key。

## 差距 / 风险

- **金额零/负/超额无校验（高）**：`amountDecimal` 仅 `min_length=1` 字符串，`refund_create`/`deposit_main` 未校验 >0 或与入金上限，可提交 "0"、"-100"、任意超额退款（后端注释自认不校验 vault，靠人工兜底）。
- **demo 旁路可越权（高，非 prod）**：`DEMO_STAFF_SESSION_TOKEN` 静态 token → admin 全权限，`DEMO_LOCAL_SESSION_TOKEN` → 任意 patron；`/api/sumsub/kyc/demo-approve` 直接把 KYC 标 approved 绕过真实核验。仅 `SUMSUB_ENVIRONMENT!="production"` 单一开关拦截，配置错即全线失守。
- **TR gate 可被前端回填绕过（中）**：`issue-address`/`main` 的 `travelRuleStatus` 取前端传入字符串对齐入金单，后端未回查 Sumsub 真实 TR 结果，客户端可直接传 `travel_rule_accepted` 越过 Travel Rule。
- **Wallet KYT 仍 mock（中）**：`screen_source_wallet` 按地址子串判定，退款 `refund_screen` 由 compliance 手工录 decision，无真实 KYT provider。
- **审计可信度弱（中）**：`audit_trail` 无哈希链/防篡改，actor 取自会话；demo token 下 actor 恒为 `demo-staff-id`，无法追责到自然人。
- **maker-checker 不足（低）**：退款 `screen→approve` 可为同一 compliance 角色；approve 后到 execute 间金额/钱包无二次冻结校验。


### 部署 / 基础设施 / 密钥管理 / CI-CD 安全现状
## 已有措施

- **密钥不入库**：`.env` 未被 git 跟踪(仅 `.env.example` 占位空值),`.dockerignore` + `.gitignore` 排除 `.env*`/`*.db`/`backups`;所有真实凭据(`HK_SSH_KEY`/`SUMSUB_*`/`HEXSAFE_*`/`SMTP_*`)通过 GitHub Environment Secrets 与服务器 `.env`(chmod 600)注入,Hex Safe 私钥支持 PEM 内容或路径二选一。
- **网络分段雏形**:`backend`(uvicorn:8000)**不对外暴露端口**,仅 compose 内网被 `web`(nginx)反代访问;SQLite 落命名卷 `ht-db`(`/data`),容器重建不丢。
- **CI/CD 门禁**:PR 与 main push 跑 typecheck+build;部署 workflow 用 `concurrency` 串行、`ssh-keyscan`/`HK_SSH_KNOWN_HOSTS` 校验主机指纹、部署前自动备份 SQLite、`/api/health` 健康检查、production 环境守卫(`HT_ALLOWED_ORIGINS=*` 或 QA 短信网关则**拒绝部署**),支持 GitHub Environment 人工 approval。
- **配置默认安全提示**:`DEPLOY.md` §6/§7 明列上线必改项(CORS、短信网关、HTTPS)。反代已透传 `X-Forwarded-*`。

## 差距 / 风险

- **无 TLS**:compose 只暴露 HTTP:8080,TLS 终止依赖"外部网关自备",仓库无 Caddy/Traefik/证书方案→**明文传输 token/OTP/PII**,localStorage token 场景风险放大。
- **CORS 默认 `*`**:仅 production 分支被 workflow 拦,staging/手动 compose 仍放开全部来源。
- **容器以 root 运行**:前后端 Dockerfile 均无 `USER` 非特权用户,健康检查/nginx 均 root。
- **无 WAF / 无速率限制层**:nginx 未配 `limit_req`,前置无 WAF,短信/登录接口暴露刷量风险(应用层限频不足以防 L7)。
- **SSH 部署面**:`HK_SSH_KEY` 为长期私钥、`rsync --delete` 全量覆盖(误删/供应链改动即时上线),建议改 deploy key 最小权限 + 只读跳板 + 审计。
- **备份策略薄弱**:仅部署时刻 `docker cp` 本地快照,**无异地/加密/定时/保留策略**,DB 明文(TOTP/OTP 密钥明文存储)。
- **镜像未扫描/未 pin digest**:基础镜像用 tag(`node:22-slim`/`nginx:1.27-alpine`)非 digest,CI 无 SCA/镜像漏洞扫描、无 SBOM。
- **demo bypass 随包部署**:`HT_DEMO_BYPASS_2FA` 等仅靠 `SUMSUB_ENVIRONMENT=production` 软关,配置错位即绕过 2FA。

**关键文件**:`hypertransfer-main/docker-compose.yml`、`Dockerfile.frontend`、`backend/Dockerfile`、`deploy/nginx.conf`、`.env.example`、`DEPLOY.md`、`.github/workflows/hypertransfer-deploy-hk.yml`。