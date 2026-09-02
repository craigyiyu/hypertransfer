# HyperTransfer Project Handover — v1.1

> **给后续接手 agent / 工程师 / PM 的快速入口**
>
> **版本**：v1.1 (2026-09-01)
> **代码基线**：`main @ bbeaa79` + `feature/v1.1-decisions` 分支（commit `42dd38c`）
> **GitHub 仓库**：https://github.com/craigyiyu/hypertransfer
> **目标 PR**：https://github.com/craigyiyu/hypertransfer/pull/new/feature/v1.1-decisions
>
> **本 README 是后续 agent 的"第一天"。**读完它 + `00-index.md` + `08-modules-roadmap.md`，就能直接动手。

---

## 0. 一页速查

| 项 | 值 |
|---|---|
| **产品名** | HyperTransfer（澳门赌场 VIP 虚拟资产入金 + 法币结算） |
| **公司主体** | Heypervelocity (HK, 计划注册) |
| **客户** | 澳门赌场 VIP（核心试点） + OTC Desk + 持牌VATP |
| **核心托管** | Hex Trust / Hex Safe |
| **KYC + Travel Rule** | Sumsub（sandbox 已通，mainnet 凭据待客户配） |
| **代码栈** | Next.js 16 + React 19 + FastAPI + SQLite（demo） |
| **生产部署** | GitHub Actions SSH/rsync 到 HK 服务器（需 `HK_*` secrets） |
| **生产 URL** | https://h5.hypercypto.com |

---

## 1. 仓库目录（30 秒懂）

```
hypertransfer/
├── apps/
│   ├── web/                        # ★ HyperTransfer 客户端（Next.js 16，静态导出）
│   └── operator/                   # Operator Pad Demo（独立产品）
├── packages/
│   ├── ui/                         # 共享设计系统（Base UI vega + emerald）
│   └── ...
├── hypertransfer-main/
│   └── backend/                    # ★ FastAPI 后端（认证 + 入金编排 + 合规）
├── Dockerfile.frontend             # 多阶段构建（Next 静态 + nginx）
├── docker-compose.yml              # 一键部署 web + backend + sqlite 卷
├── deploy/nginx.conf
├── .github/workflows/
│   ├── hypertransfer-check.yml      # PR/main 门禁（typecheck + build + test）
│   └── hypertransfer-deploy-hk.yml  # 香港服务器自动部署（需 HK_* secrets）
├── ProjectInfo/
│   └── design.md                   # 业务术语权威来源
├── Docs/                           # 运维/演示账户文档
├── ClientMeetings/                 # 客户会议纪要 + 报价单
├── CompanyPlan/                     # HK 商业方案 + 牌照路线
├── Docs/PRD/HyperTransfer-Production-v1/  # ★ 完整 Production PRD (10 文件)
├── PROJECT_HANDOVER_v1.1.md        # ★ 本文件（入口）
└── AGENTS.md / CLAUDE.md           # 项目级 AI 协作记忆（claude/codex agent 必读）
```

---

## 2. v1.1 改了什么（一页概览）

### 客户决议落地的 8 项
- ✅ Q1/Q8 — Travel Rule 全量触发（`requiresTravelRule()` 永远 `true`，监管口径保留阈值常量）
- ✅ Q2 — Wallet KYT 走 Sumsub（`sumsub_kyt_adapter.py`，mock fallback 默认）
- ✅ Q3 — Deposit Completed 后通知 Admin（`transaction_pack_record_transfer` 加 admin 邮件）
- ✅ Q4 — Cage confirmation admin 也可录（代码已支持，PRD §4.4 RULE-OPS-005 已更新）
- ✅ Q5 — Originating Wallet Picker + 6h KYT TTL（`verified_wallets.last_kyt_*` + `/api/deposits/wallets`）
- ✅ Q6 — Refund UI 占位（`RefundPlaceholder.tsx`，backend 保留便于 Phase 2 恢复）
- ✅ Q7 — Phase 1 网络默认 USDT TRC-20（upstream 已是该实现，v1.1 不再改动）
- ✅ Q8 — 同 Q1

详细落地位置：见 `Docs/PRD/HyperTransfer-Production-v1/00-decisions.md`

### 新增文件
- `hypertransfer-main/backend/sumsub_kyt_adapter.py` (Q2 adapter)
- `hypertransfer-main/backend/test_sumsub_kyt_adapter.py` (Q2 tests, 7 cases)
- `apps/web/src/views/RefundPlaceholder.tsx` (Q6 UI)
- `Docs/PRD/HyperTransfer-Production-v1/00-decisions.md` (决议记录)
- `Docs/PRD/HyperTransfer-Production-v1/00-index.md` ... `08-modules-roadmap.md` (PRD 9 文件)

### 修改文件
- `apps/web/src/lib/compliance.ts` (Q1/Q8 + Q3 文档注释)
- `apps/web/src/lib/api.ts` (Q5 `depositApi.originatingWallets()` + `OriginatingWallet` type + `screen()` 加 walletId)
- `apps/web/src/views/NewDeposit.tsx` (Q5 picker UI + screen call 接 walletId)
- `apps/web/app/refund/page.tsx` (Q6 占位)
- `hypertransfer-main/backend/server.py` (Q2 委托 + Q3 admin 邮件 + Q5 `/api/deposits/wallets` + 缓存命中逻辑)
- `docker-compose.yml` (Q2 env vars)

### 关键 schema 变更（migration 自动）
- `verified_wallets` 表加 `last_kyt_at INTEGER` + `last_kyt_decision TEXT`（幂等补列，已有库 OK）

---

## 3. 给后续 agent 的"如何接手"清单

### 3.1 第一次看代码（必读顺序）
1. `CLAUDE.md` — 项目级 AI 协作记忆（口径权威）
2. `AGENTS.md` — Codex/OpenAI agent 入口 + Release Notes + 分支策略
3. `Docs/PRD/HyperTransfer-Production-v1/00-index.md` — PRD 索引
4. `Docs/PRD/HyperTransfer-Production-v1/00-decisions.md` — v1.1 8 项决议
5. `Docs/PRD/HyperTransfer-Production-v1/08-modules-roadmap.md` — AI 开发模块地图
6. `hypertransfer-main/backend/server.py:3629` — `screen_source_wallet` (Q2 委托)
7. `hypertransfer-main/backend/sumsub_kyt_adapter.py` — Q2 新增 adapter
8. `apps/web/src/views/NewDeposit.tsx:461` — Q5 picker UI

### 3.2 开发环境
```bash
# 后端
cd hypertransfer-main/backend
.venv/bin/python -m unittest discover -p "test_*.py"   # 204 tests

# 前端
npm install
npm run typecheck
npm run build
npm test --workspace=web                               # 62 tests
```

### 3.3 本地运行
```bash
# 后端
cd hypertransfer-main/backend
.venv/bin/python server.py     # localhost:8000

# 前端（dev mode）
npm run dev                     # localhost:3000

# 一键起后端+前端（项目根）
docker compose up -d --build    # localhost:8090 (nginx) → /api/* → backend:8000
```

### 3.4 部署
- **生产部署走 GitHub Actions**：`.github/workflows/hypertransfer-deploy-hk.yml`
- 需在 repo Settings → Secrets 配：`HK_HOST`, `HK_USER`, `HK_SSH_KEY`, `HK_DEPLOY_PATH`
- 详见 `DEPLOY.md` §5

### 3.5 真实部署前的必做项（OPEN 状态）
- 配置 Sumsub mainnet 凭据 → `SUMSUB_APP_TOKEN` + `SUMSUB_SECRET_KEY` + `SUMSUB_WEBHOOK_SECRET_KEY`
- 配置 Hex Safe mainnet 凭据 → `HEXSAFE_API_KEY` + `HEXSAFE_PRIVATE_KEY` + `HEXSAFE_VAULT_ID` + `HEXSAFE_ENTERPRISE_ID`
- 配置真实短信网关 → `SMS_API_URL` + `SMS_SIGN_CN/INTL`
- 配置 Okta OIDC → `HT_LEADER_USER_ID` 等
- 配置 Sumsub KYT（Q2） → `SUMSUB_KYT_APP_TOKEN` + `SUMSUB_KYT_SECRET_KEY` + `HT_KYT_PROVIDER=sumsub`
- 配置 CORS → `HT_ALLOWED_ORIGINS=https://h5.hypercypto.com`
- 配 `SUMSUB_ENVIRONMENT=production`（触发 prod fail-closed）

---

## 4. AI / Codex agent 工作约定

| 场景 | 默认行为 |
|---|---|
| 用户说"动手" | 直接执行（已开启自动模式）） |
| 看到 `OPEN` 项 | ⛔ 禁止开发，必须人工确认 |
| 看到 `PROPOSED` 项 | ⏸ 必须人工确认后才能开发 |
| 看到 `CURRENT` / `CONFIRMED` | ✅ 可直接开发 |
| 修改 RBAC / 资金端点 / 监管字段 | ⛔ 必须停下确认（参见 `CLAUDE.md` §0.3） |
| 提交代码 | 用 `feature/` 或 ` 分支；commit 前必过 typecheck + build + tests |
| Push | 通过 feature 分支 PR + squash merge；不直推 main |

---

## 5. 测试

```bash
# 后端 (Python unittest, ~204 用例, ~80s)
cd hypertransfer-main/backend
.venv/bin/python -m unittest discover -p "test_*.py"

# 前端 (Vitest, 62 用例, ~25s)
npm test --workspace=web

# 前端 typecheck + build
npm run typecheck
npm run build
```

---

## 6. 联系方式 & 链接

| 渠道 | 值 |
|---|---|
| GitHub 仓库 | https://github.com/craigyiyu/hypertransfer |
| v1.1 PR | https://github.com/craigyiyu/hypertransfer/pull/new/feature/v1.1-decisions |
| Production URL | https://h5.hypercypto.com |
| 内部 PRD | `Docs/PRD/HyperTransfer-Production-v1/` |
| 客户会议纪要 | `ClientMeetings/` |
| 业务术语权威 | `ProjectInfo/design.md` |
| HK 商业方案 | `CompanyPlan/HyperTransfer-HK-Business-Plan.md` |

---

## 7. 已知 Open 项 / 下一步建议（仅记录，不在本版本修）

- ⚠️ Sumsub KYT 真实端点未对接（需先与 Sumsub sales 确认 Crypto Monitoring API 文档 + rate limit）
- ⚠️ Refund UI 占位（Phase 2 恢复）
- ⚠️ KYT TTL 6h 是 v1.1 假设值，可按合规反馈调整 `KYT_CACHE_TTL_SECONDS`
- ⚠️ Production 主凭据未配（Sumsub/Hex Safe/Okta/SMS）— 见 §3.5
- ⚠️ 域名 SSL / WAF / OTel / 告警 — 见 `Docs/PRD/HyperTransfer-Production-v1/06-integrations-uat-nfr.md` §6.3 / §6.4

---

*最后更新：2026-09-01（v1.1 落地版本）*
*本文档由 HyperTransfer Agent 起草；后续修改请同步更新版本号与日期。*