# 00-decisions — 客户决议记录（v1.1）

> **本文档用途**：记录 v1.1 新增 / 升级的全部 `PROPOSED` 与 `OPEN` 决议。
> 状态：✅ 全部 8 项均经客户确认（2026-09-01），已落地代码 + 转为 `CONFIRMED`。
>
> **后续决议流程**：v1.2 / v1.3 等后续 PR 中如再有 PROPOSED/OPEN 项，仍按本文档格式登记并等客户勾选。

---

## 决议汇总（2026-09-01）

| ID | 标题 | 客户决议 | 落地状态 |
|---|---|---|---|
| Q1 / Q8 | Travel Rule 默认触发范围 | ✅ 接受（所有入金都触发） | 代码 + PRD §5.1 / §3.1.4 已改 |
| Q2 | Wallet KYT Provider 选定 | ✅ 接受（走 Sumsub） | `sumsub_kyt_adapter.py` + `HT_KYT_PROVIDER=mock` 默认 |
| Q3 | Deposit Completed 后通知范围 | ✅ 接受（Admin 也收） | `transaction_pack_record_transfer` 加 admin 邮件 |
| Q4 | Cage Confirmation 录入角色 | ✅ 接受（Admin 也可） | 代码已支持 (`_operations_roles` 包含 admin); 文档同步 |
| Q5 | New Deposit Originating Wallet Picker | ✅ 接受（picker + 6h TTL） | `verified_wallets` 加 `last_kyt_*` + `/api/deposits/wallets` + UI picker |
| Q6 | Refund 范围 | ✅ 接受（隐藏 UI，保留 backend） | `/refund` 路由 → `RefundPlaceholder.tsx`; `/api/refunds*` 全保留 |
| Q7 | Phase 1 网络 | ✅ 接受（默认 USDT ERC-20） | `DEFAULT_PHASE_ONE_NETWORK` 常量 + NewDeposit UI 隐藏网络切换 |
| Q8 | "所有入金都 ≥ HKD 8,000" 假设 | ✅ 接受 | 同 Q1（同一代码改动） |

---

## Q1 — Travel Rule 默认触发范围 ✅ **CONFIRMED**

| 字段 | 内容 |
|---|---|
| **客户决议** | ✅ 接受（所有入金都触发 Travel Rule） |
| **实施位置** | `apps/web/src/lib/compliance.ts: requiresTravelRule()` → 永远 `true` |
| **影响** | ① 所有客户都需填 Travel Rule 表单 ② Sumsub TR 调用量增加 ③ `requiresTravelRule` 函数语义变化 |
| **回滚路径** | 还原为 `return amount >= TRAVEL_RULE_THRESHOLD_USD;`（阈值常量保留） |

---

## Q2 — Wallet KYT Provider 选定 ✅ **CONFIRMED**

| 字段 | 内容 |
|---|---|
| **客户决议** | ✅ 接受（Wallet KYT 走 Sumsub Crypto Monitoring） |
| **实施位置** | `hypertransfer-main/backend/sumsub_kyt_adapter.py` (新); `server.py: screen_source_wallet()` 委托给 `screen_source_wallet_v2` |
| **环境变量** | `HT_KYT_PROVIDER=mock`（默认）/ sumsub; `SUMSUB_KYT_APP_TOKEN` + `SUMSUB_KYT_SECRET_KEY`（切到真实路径必填） |
| **生产行为** | `SUMSUB_ENVIRONMENT=production` 且 `SUMSUB_KYT_*` 未配 → fail closed (RuntimeError → 503) |
| **本地/Demo 行为** | 默认 mock（关键字判定，与 v1.0 同口径） |
| **回滚路径** | 设 `HT_KYT_PROVIDER=mock` |

---

## Q3 — Deposit Completed 后通知范围 ✅ **CONFIRMED**

| 字段 | 内容 |
|---|---|
| **客户决议** | ✅ 接受（Admin 收邮件通知） |
| **实施位置** | `hypertransfer-main/backend/server.py: transaction_pack_record_transfer()` — admin 邮件逻辑 |
| **通知通道** | `send_email`（与 Host/VIP 通知复用） |
| **Admin 邮箱来源** | ① `users.user_roles.role='admin'` ② + `HT_ADMIN_EMAIL` env（兼容） |
| **失败处理** | admin 邮件失败不阻塞主流程，写 audit `transaction.pack.admin_notify_failed` |
| **回滚路径** | 删除 admin 邮件逻辑块 |

---

## Q4 — Cage Confirmation 录入角色 ✅ **CONFIRMED**

| 字段 | 内容 |
|---|---|
| **客户决议** | ✅ 接受（Admin 也可录 Cage） |
| **实施状态** | **代码已支持**（`_operations_roles()` 返回 `("ops", "custodian", "compliance", "admin")`） |
| **PRD 文档同步** | §4.4 RULE-OPS-005 文档过时 → 改为"cage confirmation 可由 ops / custodian / compliance / admin 角色录入" |
| **回滚路径** | 从 `_operations_roles()` 移除 `admin` |

---

## Q5 — New Deposit Originating Wallet Picker ✅ **CONFIRMED**

| 字段 | 内容 |
|---|---|
| **客户决议** | ✅ 接受（picker + 6h KYT TTL） |
| **TTL** | 6 小时（`KYT_CACHE_TTL_SECONDS` 常量，可调） |
| **实施位置** | ① `verified_wallets` 表加 `last_kyt_at` + `last_kyt_decision`（migration 自动） ② `/api/deposits/wallets` 返回用户历史 originating wallets ③ `deposits/{id}/screen` 接受 `walletId` 命中缓存则跳过 screening ④ `NewDeposit.tsx` UI picker |
| **缓存语义** | `kyt_cache_fresh` = `0 ≤ now - last_kyt_at ≤ 6h AND last_kyt_decision == 'pass'` |
| **回滚路径** | `KYT_CACHE_TTL_SECONDS = 0`（永远不命中）或修改 NewDeposit picker UI |

---

## Q6 — Refund 范围 ✅ **CONFIRMED（隐藏 UI，保留 backend）**

| 字段 | 内容 |
|---|---|
| **客户决议** | ✅ 接受（Refund 不在 v1.1 scope，UI 占位，backend 保留） |
| **实施位置** | ① `apps/web/app/refund/page.tsx` → `<RefundPlaceholder />`（替代 `<RefundProcess />`） ② `apps/web/src/views/RefundPlaceholder.tsx`（新占位组件，显示 "Under development"） ③ `apps/web/src/views/RefundProcess.tsx`（保留，便于 Phase 2 恢复） ④ `/api/refunds*` 8 endpoints 端全部保留（staff `RefundQueuePanel.tsx` 仍可用） |
| **客户可见性** | 客户访问 `/refund` 看到 "Under development"；Dashboard 无 Refund 入口 |
| **可逆性** | 改一行 page.tsx 即可恢复（`<RefundProcess />`） |
| **回滚路径** | `app/refund/page.tsx` 改回 `<RefundProcess />` |

---

## Q7 — Phase 1 网络白名单 ✅ **CONFIRMED**

| 字段 | 内容 |
|---|---|
| **客户决议** | ✅ 接受（仅默认一个 rail = USDT ERC-20；USDC 也用 ethereum） |
| **实施位置** | `apps/web/src/lib/compliance.ts: DEFAULT_PHASE_ONE_NETWORK` 常量；`NewDeposit.tsx` 网络 UI 改为只读徽章 |
| **后续客户决策** | 如需切到 TRC-20 / 其他 rail → 改 `DEFAULT_PHASE_ONE_NETWORK` 常量 |
| **回滚路径** | NewDeposit.tsx 恢复网络选择按钮组 |

---

## Q8 — "所有入金都 ≥ HKD 8,000" 假设 ✅ **CONFIRMED**

| 字段 | 内容 |
|---|---|
| **客户决议** | ✅ 接受 |
| **实施位置** | 同 Q1（同一代码改动） |

---

*最后更新：2026-09-01（v1.1 全部 8 项已落地）*