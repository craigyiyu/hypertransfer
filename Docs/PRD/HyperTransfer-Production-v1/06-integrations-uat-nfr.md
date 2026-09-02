# 06 — External Integrations, UAT, Non-Functional Requirements & Productionization Gaps

> 本章覆盖：外部 provider 集成、UAT 验收清单、非功能需求（NFR）、生产化缺口。  
> 所有真实 provider 凭据 / 主键 / 合同条款 **禁止写入本文档**（参见 `CLAUDE.md` §6.5 / `AGENTS.md` 合规与数据）。

---

## 6.1 外部集成清单

### 6.1.1 集成矩阵

| ID | Provider | 类型 | 用途 | 状态 | 实现位置 |
|---|---|---|---|---|---|
| INT-SMS-001 | Hypervelocity simpleSend | 短信 | 手机号 OTP | **CURRENT**（QA env），生产需切换 | `server.py send_otp` |
| INT-SMS-002 | SMTP（飞书 SMTP） | 邮件 | Email OTP / 邀请 / 通知 | **CURRENT**（默认 console；env 配则真发） | `server.py send_email` |
| INT-KYC-001 | Sumsub | KYC | applicant 创建 / status / webhook | **CURRENT**（sandbox + demo approve 占位），生产需 mainnet | `/api/sumsub/kyc/*` |
| INT-KYC-002 | Sumsub WebSDK | KYC（Web） | access-token 拉取 | **CURRENT**（仅留接口；客户面走 API-only demo） | `/api/sumsub/access-token` |
| INT-TR-001 | Sumsub Travel Rule | TR | 提交 / 接受 / 拒绝 / manual_review | **CURRENT**（sandbox） | `/api/sumsub/travel-rule/*` |
| INT-TR-002 | Notabene | TR（候选） | Travel Rule | **PROPOSED**（已封装 `notabene_adapter.py`，production 启用） | `notabene_adapter.py` |
| INT-CUST-001 | Hex Safe REST | 托管 | 发址 / 到账 / 提现 / vault | **CURRENT**（sandbox 实接），生产需 mainnet | `hexsafe_client.py` + `/api/hexsafe/*` |
| INT-CUST-002 | Hex Trust 后台（人工） | Vault 余额核对 | Sufficient Fund in Vault | **CURRENT**（口径标注人工） | 文案 + staff 工作流 |
| INT-CUST-003 | Hex Safe webhook | 通知 | 提现 / 入金回调 | **CURRENT**（sandbox 注册 webhook 待评估） | `/api/webhooks/sumsub` 模板 |
| INT-KYT-001 | Hex Safe KYT | KYT | source wallet screening | **CURRENT**（mock `screen_source_wallet`，sandbox 无文档化端点） | `screen_source_wallet` |
| INT-KYT-002 | Chainalysis / TRM / Elliptic | KYT（fallback） | sandbox 不可用回落 | **OPEN** | 待选 |
| INT-AUTH-001 | Okta OIDC | SSO | staff 登录 | **PROPOSED**（demo 占位；production 必接） | `/api/staff/okta/link`、`StaffLogin` |
| INT-AUTH-002 | TOTP RFC 6238 | 2FA | VIP 2FA | **CURRENT** | `pyotp` |
| INT-AUTH-003 | Google Authenticator / Microsoft Authenticator | 2FA App | 兼容 | **CURRENT** | 同上 |
| INT-OBS-001 | （无） | 监控 | 日志 / 指标 / Trace | **OPEN** | 待选 |
| INT-OBS-002 | （无） | 告警 | PagerDuty / 飞书 | **OPEN** | 待选 |
| INT-CACHE-001 | （无） | 缓存 | rate limit / session | **OPEN**（当前 SQLite + in-process） | — |
| INT-FX-001 | Hex Trust 汇率 | Forex | USDT→HKD / USD | **OPEN**（demo 占位，无 quote/order API） | `/api/hexsafe/forex/probe` |

### 6.1.2 集成边界与失败模式

| ID | Provider | 失败模式 | 系统行为 |
|---|---|---|---|
| FAIL-SMS-001 | Hypervelocity | 网络超时 / 5xx | OTP 接口 502，UI 提示"Failed to send OTP, please retry" |
| FAIL-KYC-001 | Sumsub | 网络超时 / 5xx | KYC start 失败 → 客户面中性提示；admin 监控告警 |
| FAIL-KYC-002 | Sumsub | webhook 丢失 | staff 手动 `connection-test` + 客户面 retry |
| FAIL-TR-001 | Sumsub / Notabene | rejected | 阻止发址；TR manual_review 提示客户补充 |
| FAIL-CUST-001 | Hex Safe | API 4xx/5xx | 发址失败 → 客户面"Address issuance failed"；staff 监控 |
| FAIL-CUST-002 | Hex Safe | withdrawal 失败 | refund execute 返回失败；staff 重试或人工复核 |
| FAIL-AUTH-001 | Okta | OIDC discovery 失败 | staff 登录页回退到邮箱+密码次入口（demo）；生产 503 |
| FAIL-EMAIL-001 | SMTP | 邮件发送失败 | console 模式打印；生产需监控 |

---

## 6.2 UAT 验收清单

### 6.2.1 客户旅程（VIP）

| ID | 场景 | 验收条件 | 状态 |
|---|---|---|---|
| UAT-VIP-001 | 邀请认领（Email link） | Email token 校验通过 → 跳转 `/invite?token=...`；输入邮箱 + Email OTP → 跳转 `/setup-2fa` | **CURRENT** |
| UAT-VIP-002 | 邀请认领（QR session） | QR 扫码 → 邮箱校验 + Email OTP → 注册 | **CURRENT** |
| UAT-VIP-003 | TOTP 绑定（GA / MS Authenticator） | QR 扫描 → 6 位码 → 恢复码展示 → 进入 `/kyc` | **CURRENT** |
| UAT-VIP-004 | TOTP 登录 | 邮箱+密码 → TOTP 6 位 → Dashboard | **CURRENT** |
| UAT-VIP-005 | KYC 提交 | 必填字段 + 同意 → Sumsub review → KYC passed → 跳转 Dashboard | **CURRENT** |
| UAT-VIP-006 | KYC 拒绝 | Sumsub review rejected → `kyc_failed` 状态 → Host 收到受限原因 | **CURRENT** |
| UAT-VIP-007 | 入金（USDT ERC-20） | Step 1 1 USDT → Step 2 主入金 → Deposit Completed → Settled | **CURRENT** |
| UAT-VIP-008 | 入金（USDT TRC-20） | 同上，链上确认数 4 | **CURRENT** |
| UAT-VIP-009 | 入金（USDC ERC-20） | 同 USDT，链上确认数 5 | **CURRENT** |
| UAT-VIP-010 | 全额容错 | 直接打全额到 1 USDT 验证地址 → Step 2 自动跳过 | **CURRENT** |
| UAT-VIP-011 | Travel Rule ≥ USD 1,000 | 触发 TR 表单 → Sumsub 接受 → 发址 | **CURRENT** |
| UAT-VIP-012 | Travel Rule rejected | 阻止发址；TR manual_review 提示 | **CURRENT** |
| UAT-VIP-013 | 退款（verified wallet picker） | 选 verified wallet → 自由金额 → 可选原因 → 提交 | **CURRENT** |
| UAT-VIP-014 | 退款（自由输入新地址） | 后端 400（禁自由输入） | **CURRENT** |
| UAT-VIP-015 | KYC 过期 | 6 个月后强制重做；闸门阻断入金 | **CURRENT** |
| UAT-VIP-016 | 邀请过期 | TTL 到期 → 跳转 `/invite?token=...&expired=1` | **CURRENT** |
| UAT-VIP-017 | 同案另一渠道认领 | 旧 session 410 | **CURRENT** |
| UAT-VIP-018 | 客户面不得见内部信息 | Dashboard / History / Refund 流程无 Vault / Hex Safe 痕迹 | **CURRENT** |

### 6.2.2 Host 旅程

| ID | 场景 | 验收条件 | 状态 |
|---|---|---|---|
| UAT-HOST-001 | Host 激活 | 公司邮箱 → TOTP 绑定 → 落 `host` 角色 | **CURRENT** |
| UAT-HOST-002 | 建 case | Member ID + 姓名 + Email → 提交 → 返回 case_id | **CURRENT** |
| UAT-HOST-003 | 邀请交付 | Email 链接 + QR 二维码展示；时效状态正确 | **CURRENT** |
| UAT-HOST-004 | Resend | 重置 TTL；过期可触发 | **CURRENT** |
| UAT-HOST-005 | Revoke | case → revoked；客户已认领的也失效 | **CURRENT** |
| UAT-HOST-006 | case 列表 | 待处理 / 已生效 两段；不重复已完成态标签 | **CURRENT** |
| UAT-HOST-007 | Host note | 输入后 leader dossier 可见；VIP 不可见 | **CURRENT** |
| UAT-HOST-008 | 受限 KYC 原因 | Host 仅见 `kycHostMessage`；不暴露证件号 / 原始 detail | **CURRENT** |

### 6.2.3 Leader 旅程

| ID | 场景 | 验收条件 | 状态 |
|---|---|---|---|
| UAT-LEADER-001 | Leader 登录 | role=leader 或 `HT_LEADER_USER_ID` 命中 → 进入 leader queue | **CURRENT** |
| UAT-LEADER-002 | Approve | case → service_enabled；客户 + Host 收到邮件 | **CURRENT** |
| UAT-LEADER-003 | Reject | case → rejected；reason 必填；邮件通知 | **CURRENT** |
| UAT-LEADER-004 | 越权拒绝 | Host / Compliance / Marketing / Admin 决策 → 403 | **CURRENT** |
| UAT-LEADER-005 | 未配 `HT_LEADER_USER_ID` | production 下 503 | **CURRENT** |

### 6.2.4 Operations 旅程

| ID | 场景 | 验收条件 | 状态 |
|---|---|---|---|
| UAT-OPS-001 | Payment intent | 创建 → source-classification → actual-confirmation | **CURRENT** |
| UAT-OPS-002 | Compliance Pack | 创建 → screen → issue-address → record-transfer | **CURRENT** |
| UAT-OPS-003 | Cage confirmation | ops 录入 → pack → cage_confirmed | **CURRENT** |
| UAT-OPS-004 | Finance reconciliation | finance 录入 → reconciliation record | **CURRENT** |
| UAT-OPS-005 | 导出 reconciliation | CSV / JSON，retention ≥5 年 | **CURRENT** |
| UAT-OPS-006 | 监控标记 | 关联转账给 Compliance | **CURRENT** |
| UAT-OPS-007 | Sumsub / Hex Safe 缺配置 | production → 503 fail closed | **CURRENT** |
| UAT-OPS-008 | Pack 实际确认指纹变更 | 作废旧 pack、强制重验、阻发地址 | **CURRENT** |

### 6.2.5 邀请兼容流（legacy）

| ID | 场景 | 验收条件 | 状态 |
|---|---|---|---|
| UAT-INV-001 | RM 提交 | Member ID + 姓名 + Email → submitted | **CURRENT** |
| UAT-INV-002 | Marketing 审批 | approve → 6h token 自动签发；reject 必填原因 | **CURRENT** |
| UAT-INV-003 | Resubmit | RM 修改后重新提交 | **CURRENT** |
| UAT-INV-004 | 交付卡 | 链接 + QR + 时效状态展示 | **CURRENT** |

### 6.2.6 通用

| ID | 场景 | 验收条件 | 状态 |
|---|---|---|---|
| UAT-NFR-001 | 移动端适配 | ≤393px 宽无横向滚动；按钮可点；输入可填 | **CURRENT** |
| UAT-NFR-002 | 千分位展示 | 金额 / 数量 / 统计千分位；标识符不格式化 | **CURRENT** |
| UAT-NFR-003 | iOS Safari OTP 自动填 | `autocomplete="one-time-code"` 触发弹窗 | **CURRENT** |
| UAT-NFR-004 | iOS Chrome OTP | 已知不弹（文档已记录，非代码 bug） | **CURRENT** |
| UAT-NFR-005 | en/zh 切换 | `LanguageSwitcher` 在 staff + staff login 顶部；切换正确 | **CURRENT** |

---

## 6.3 非功能需求（NFR）

### 6.3.1 性能

| ID | 需求 | 当前 | 目标 |
|---|---|---|---|
| NFR-PERF-001 | 首屏 TTFB（静态） | < 200ms（nginx） | < 200ms |
| NFR-PERF-002 | API 响应 p95 | 待测 | < 500ms（除 KYT / TR / Hex Safe 外部调用） |
| NFR-PERF-003 | 静态导出体积 | 首屏 < 200KB JS（gzip） | 同上 |
| NFR-PERF-004 | 移动端 Lighthouse | 待测 | Performance ≥ 80，Accessibility ≥ 90 |

### 6.3.2 安全

| ID | 需求 | 状态 |
|---|---|---|
| NFR-SEC-001 | Bearer token hash 存储；前端仅持有 | **CURRENT** |
| NFR-SEC-002 | TOTP 防重放（窗口内禁止复用） | **CURRENT** |
| NFR-SEC-003 | OTP 限频（60s/日上限/试错上限）+ 用后即焚 | **CURRENT** |
| NFR-SEC-004 | CORS 收窄到正式域名（production 必填） | **CURRENT** |
| NFR-SEC-005 | Webhook 签名校验（Sumsub） | **CURRENT** |
| NFR-SEC-006 | Hex Safe JWT ES256 签名 | **CURRENT** |
| NFR-SEC-007 | `x-request-id` 幂等（提现） | **CURRENT** |
| NFR-SEC-008 | PII 不入库（演示账号、客户资料、证件、wallet 实控人） | **CURRENT** |
| NFR-SEC-009 | 白标脱敏（"永利"/"Wynn" 等客户名一律替换） | **CURRENT** |
| NFR-SEC-010 | `.env*` / `*.key` / `*.pem` / `*.db` 不入 Git | **CURRENT** |
| NFR-SEC-011 | Recovery codes 明文仅返回一次（一次性码） | **CURRENT** |
| NFR-SEC-012 | Step-up 5min TTL 用于资金动作 | **CURRENT** |
| NFR-SEC-013 | Rate-limit per IP / per session | **OPEN**（当前为 SQLite + in-process） |
| NFR-SEC-014 | WAF / DDoS 防护 | **OPEN**（nginx + Cloudflare） |
| NFR-SEC-015 | audit_trail retention ≥ 5 年（监管） | **OPEN**（当前 SQLite 演示） |

### 6.3.3 可用性 / 可访问性

| ID | 需求 | 状态 |
|---|---|---|
| NFR-A11Y-001 | landmark / contrast / aria-label / 触摸目标 | **CURRENT**（WCAG 审计已修复） |
| NFR-A11Y-002 | 错误状态文案明确（中英文） | **CURRENT** |
| NFR-A11Y-003 | Loading / Empty / Error 统一 | **CURRENT** |

### 6.3.4 可观测性

| ID | 需求 | 状态 |
|---|---|---|
| NFR-OBS-001 | 结构化 JSON 日志 | **OPEN** |
| NFR-OBS-002 | 请求 trace id（端到端） | **OPEN** |
| NFR-OBS-003 | Metrics（prometheus / otel） | **OPEN** |
| NFR-OBS-004 | Pager / 告警通道 | **OPEN** |
| NFR-OBS-005 | audit_trail 可导出 | **OPEN** |

### 6.3.5 可移植性

| ID | 需求 | 状态 |
|---|---|---|
| NFR-PORT-001 | docker-compose 一键部署（web + backend + sqlite） | **CURRENT** |
| NFR-PORT-002 | CI / CD 门禁（typecheck + build + vitest） | **CURRENT** |
| NFR-PORT-003 | 香港服务器自动部署（GitHub Actions） | **CURRENT** |
| NFR-PORT-004 | 切换 Postgres / 多区容灾 | **OPEN** |

---

## 6.4 生产化缺口（Productionization Gaps）

> 本节列出**当前 main 已识别但未完成**的生产化缺口；逐项给出 `OPEN` / `PROPOSED` 状态与建议决议路径。

| ID | 缺口 | 状态 | 决议路径 |
|---|---|---|---|
| GAP-001 | Production 数据库迁移（Postgres / 多区） | **OPEN** | 客户业务量决定时点；建议 Phase 1 试运营后启动 |
| GAP-002 | Production Okta OIDC 真实接入（demo 仅占位） | **OPEN** | 客户提供 Okta 租户 + Client ID + Client Secret + MFA policy |
| GAP-003 | Production SMS 网关切换（当前 QA） | **OPEN** | 客户提供正式网关 + Sign 名义 |
| GAP-004 | Production Sumsub mainnet 凭据（当前 sandbox） | **OPEN** | 客户提供 Sumsub 正式 App Token + Secret + Webhook Secret |
| GAP-005 | Production Hex Safe mainnet 凭据（当前 sandbox） | **OPEN** | Hex Trust 合同启用 + 提供 `x-api-key` + ES256 私钥 |
| GAP-006 | Travel Rule 主 provider 收敛（当前 Sumsub，已封装 Notabene fallback） | **PROPOSED** | 待客户决定 TR 主 provider |
| GAP-007 | KYT 提供商收敛（Hex Safe API 无文档化 → 回落第三方 KYT） | **OPEN** | 评估 Chainalysis / TRM / Elliptic 任选 |
| GAP-008 | 汇率 provider（Hex Trust 当前无 quote/order API） | **OPEN** | 客户 / Hex Trust 后续提供 API |
| GAP-009 | `HT_ALLOWED_ORIGINS` 收窄 | **CURRENT**（env 已支持，部署需收窄） | 部署时通过 .env / GitHub Secrets 注入 |
| GAP-010 | `HT_DEMO_BYPASS_2FA` 生产必须留空 | **CURRENT** | 部署时检查 |
| GAP-011 | audit_trail retention 持久化（当前 SQLite） | **OPEN** | 客户监管口径（建议 ≥5 年） |
| GAP-012 | WAF / DDoS 防护 | **OPEN** | Cloudflare + nginx rate-limit |
| GAP-013 | 结构化日志 + Trace | **OPEN** | OTel + JSON logger |
| GAP-014 | 告警通道 | **OPEN** | PagerDuty / 飞书 webhook |
| GAP-015 | 域名 SSL（当前 nginx + 客户域名） | **CURRENT** | 客户提供域名 + 证书（Let's Encrypt 自动续签） |
| GAP-016 | staff 邮箱域名白名单 | **OPEN** | 客户提供域名列表 |
| GAP-017 | RBAC 细化（demo staff 全 admin） | **PROPOSED** | 按 §4.10 矩阵收紧 |
| GAP-018 | VIP 步骤引导（Step 1 → Step 2 全额容错边界） | **CURRENT** | `handleFullAmountDetected` |
| GAP-019 | Stripe / 法币出金（out of scope） | **DEPRECATED** | 不在 Phase 1 |
| GAP-020 | Prime Broker 自营报价（out of scope） | **DEPRECATED** | 不在 Phase 1 |
| GAP-021 | 真实 STR / SAR / HKFIO 报送 | **DEPRECATED** | 客户 / Hex Trust 责任 |
| GAP-022 | Admin / 集成配置 UI（provider / 风险阈值 / RBAC） | **OPEN** | 走 env + seed；UI 留待 Phase 2 |

> **❓ 客户确认问题汇总**：
> 1. Okta 租户与 MFA policy 何时提供？（GAP-002）
> 2. SMS 网关正式环境何时切？（GAP-003）
> 3. Sumsub mainnet 凭据何时配？（GAP-004）
> 4. Hex Safe mainnet 凭据何时配？（GAP-005）
> 5. Travel Rule 主 provider 选定 Sumsub 还是 Notabene？（GAP-006）
> 6. KYT 第三方提供商选定？（GAP-007）
> 7. staff 邮箱白名单域名？（GAP-016）

---

## 6.5 UAT 数据 / 演示账户

| 角色 | 账户 | 入口 |
|---|---|---|
| VIP Patron | `demo.user@hypercrypto.com` / `Demo@12345` | `/login`（"Use Demo Account"） |
| Host | seed demo host | `/staff-onboard` |
| Leader | seed demo leader | `/casino-ops` |
| HK Ops | seed demo ops | `/casino-ops` |
| Marketing | seed demo marketing | `/casino-ops` |
| Finance | seed demo finance | `/casino-ops` |
| Compliance | seed demo compliance | `/casino-ops` |
| Custodian | seed demo custodian | `/casino-ops` |
| Admin | seed demo admin（`HT_ADMIN_EMAIL` / `HT_ADMIN_PASSWORD`） | `/casino-ops` |

> 演示账户均来自 `hypertransfer-main/backend/seed_demo.py`，可入库（不含真实 PII）。  
> 线上生产 demo 凭据见 `Docs/Demo-Accounts.md`。

---

*最后更新：2026-08-28*