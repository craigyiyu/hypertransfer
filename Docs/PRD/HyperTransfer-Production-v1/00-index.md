# HyperTransfer Production PRD — Master Index

> **Doc set version**: v1.0  
> **Code baseline**: `main @ 13e1c61` (ahead of `bbeaa793`)  
> **Authoritative sources**: `CLAUDE.md`, `AGENTS.md`, `ProjectInfo/design.md`  
> **Status legend**: see §0.3
>
> 本文档包描述 HyperTransfer 的生产级（Production）需求规格，用于业务/合规审阅与 AI 按模块开发。所有 `PROPOSED` 与 `OPEN` 项必须先经人工确认。

---

## 0.1 文件清单

| # | 文件 | 用途 | 目标读者 |
|---|---|---|---|
| 00 | [`00-index.md`](./00-index.md) | 主索引、状态图例、阅读顺序 | 所有人 |
| 00d | [`00-decisions.md`](./00-decisions.md) | **v1.1 待客户确认决议清单（Q1–Q8）** | 业务 / 客户 / PM |
| 01 | [`01-overview.md`](./01-overview.md) | 产品概览、范围、术语、版本记录 | 业务 / 合规 / 产品 |
| 02 | [`02-architecture.md`](./02-architecture.md) | 当前代码与架构（前端/后端/数据/部署/测试/旧 Vite 风险） | 工程 / SRE / AI 开发 |
| 03 | [`03-user-journeys.md`](./03-user-journeys.md) | Customer / Host / Manager / Operations / VIP 五端旅程 | 业务 / UX / 合规 |
| 04 | [`04-functional-requirements.md`](./04-functional-requirements.md) | 功能需求、业务规则、权限、数据可见性 | 业务 / 工程 / AI 开发 |
| 05 | [`05-state-machine.md`](./05-state-machine.md) | 状态机、状态词汇表 | 工程 / AI 开发 / 合规 |
| 06 | [`06-integrations-uat-nfr.md`](./06-integrations-uat-nfr.md) | 外部集成、UAT、非功能需求、生产化缺口 | 工程 / 合规 / 客户 |
| 07 | [`07-traceability-matrix.md`](./07-traceability-matrix.md) | 需求 → 规则 → 状态 → 代码 → 测试 追踪 | 工程 / 合规 / QA |
| 08 | [`08-modules-roadmap.md`](./08-modules-roadmap.md) | AI 可独立开发模块 + 路线图 | AI 开发 / PM |

## 0.2 阅读顺序建议

- **业务 / 合规**：01 → 03 → 04 → 05（仅 PR 章节） → 06
- **工程 / SRE**：02 → 04 → 05 → 06 → 07 → 08
- **AI 辅助开发**：02 → 05 → 07 → 08（按 08 路线图顺序实施）

## 0.3 状态图例（每条需求必填）

| Tag | 含义 | AI 是否可开发 |
|---|---|---|
| **CURRENT** | 已实现在当前 `main` | ✅ 可理解 / 重构 / 文档化 |
| **CONFIRMED** | 经人工确认，可开发 | ✅ 可开发 |
| **PROPOSED** | 建议方案，待人工确认 | ⏸ 必须先人工确认 |
| **OPEN** | 缺少决定 / 待客户 / 监管决定 | ⛔ 禁止开发 |
| **DEPRECATED** | 历史实现，仅参考 | 🚫 不要照搬，需迁移到 CONFIRMED |

**AI 开发硬规则**：

1. 只能为 `CONFIRMED` 项编写新代码。
2. 任何 `OPEN`、监管规则修改（FATF AMLO、KYT 决策树、Travel Rule 阈值/字段）、资金控制（Hex Safe 真实接口、`/api/hexsafe/*`）、真实外部密钥（Sumsub `SUMSUB_*`、Okta `HT_LEADER_USER_ID`、Hex Trust `x-api-key`）、权限边界（RBAC 角色矩阵）或破坏性数据库迁移（删表、改主键、`HT_DB_PATH` 迁移），**必须停下并要求人工确认**。
3. `DEPRECATED` 路径仅作为迁移参考，禁止新增依赖。
4. 任何代码改动前必须先核对 `CLAUDE.md` §4 业务术语 + `ProjectInfo/design.md`。

## 0.4 出包基线（基线检查点）

- 生产前端：`apps/web`（Next.js 16 App Router + React 19 + Tailwind 4 + shadcn/ui(Base UI vega) + emerald 主题）
- 生产后端：`hypertransfer-main/backend/`（FastAPI + SQLite + uvloop）
- 部署入口：仓库根 `docker-compose.yml`（web nginx 静态 + 反代 + backend uvicorn + SQLite 持久卷 `ht-db`）
- CI：`.github/workflows/hypertransfer-check.yml`（PR/main 门禁：typecheck + build + vitest）
- 已冻结（仅迁移参考）：`hypertransfer-main/client/`（旧 React+Vite+wouter，前端已迁入 `apps/web`）

## 0.5 已确认产品原则（不可更改）

> 来自用户 2026-08 PRD 指令，优先级最高。任何 PRD 内容与之冲突的，以本节为准。

1. **VIP admission 状态收敛**：Host-led VIP admission 统一状态序列 = `Invited → Account Created → KYC Submitted → KYC Approved → Service Enabled`；若 KYC Rejected，系统发邮件通知 Host 与 VIP（完整枚举见 `05-state-machine.md` §5.1）。
2. **列表状态显示**：已完成状态不应在列表中重复作为"当前状态"标签；列表主要显示待处理状态（如 `Pending Approval`、`KYC Action Required`、`Invitation Expired`）。
   - `Pending Approval`：KYC 已通过，等待 Admin / Leader 手动最终批准。
   - `KYC Action Required`：VIP KYC 信息未完成，或系统要求 VIP 提供更多信息。
3. **KYC / Travel Rule Provider**：计划接入 Sumsub，但本文档**不得描述为已上线**；当前为后端 adapter + `HT_DEMO_BYPASS_2FA` 旁路 + sandbox 配置可选。
4. **Staff 登录 / 2FA**：生产计划 Okta OIDC；demo 使用 `DEMO_STAFF_TOKEN` 旁路（免 2FA），本文档不得描述为已对接真实 Okta。
5. **VIP 端 2FA**：标准 RFC 6238 TOTP（SHA1/6位/30 秒），兼容 Google Authenticator 与 Microsoft Authenticator（也兼容 Authy、1Password、苹果密码）。
6. **金额 / 数量 / 统计显示**：千分位格式；验证码、ID、钱包地址等标识符**不**使用千分位。
7. **移动端适配**：所有客户面页面必须 mobile-first；全高容器用 `100svh`，禁用 `100dvh`（软键盘抖动）。
8. **客户可见边界**：客户端不得看到内部审批、Vault、托管、风控细节或后台控制信息。
9. **合规 / 资金控制边界**：保留 KYC / KYT / Travel Rule / Approval / Address issuance / 到账后筛查 / Cage confirmation / Finance reconciliation 八个边界。
10. **数据脱敏**：不写入真实密钥、客户身份资料、证件信息或钱包实控人信息；所有 PII 占位均使用虚构演示名（如 `Avery Chen`、`Morgan Lee`）。

## 0.6 文档维护约定

- 每个 PR 在 `Docs/PRD/HyperTransfer-Production-v1/` 下同步更新。
- 字段变化（ID、状态枚举、阈值）必须同步 §5 状态词汇表与 §4 业务规则。
- 任何 `OPEN → CONFIRMED` 的决议必须附决议来源（会议纪要、客户邮件、监管文件）。

---

*最后更新：2026-08-28（基于代码基线 `main @ 13e1c61`，PRD v1.0 出包）*