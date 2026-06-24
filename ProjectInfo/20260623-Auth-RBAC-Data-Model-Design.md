# 认证 + RBAC 数据模型设计（供审阅）

> 日期：2026-06-23
> 范围：`hypertransfer-main/backend/server.py`（FastAPI + SQLite）+ 前端 auth 配套
> 依据：最终流程 v1 决策记录（`20260623-System-Adjustment-Plan-vs-Process-v1.md` §〇）决策 2/3/4/5/6/9/10
> 状态：**设计草案，待用户确认迁移路径后再写代码**。本文件不含代码改动。

---

## 1. 现状（已核对 server.py）

- `users` 表：**主键 = `phone`**；`email` 可空 + 唯一索引；`totp_secret NOT NULL`（强制 2FA）；`status` 仅 `pending_totp` / `active`；无 role。
- 关联表均以 `phone` 为外键：`sessions(phone)`、`challenges(phone)`、`otps(phone PK)`、`recovery_codes(phone)`、`sumsub_kyc_applications(phone PK)`。
- 注册：手机号 + 短信 OTP → `pending_totp` → confirm-totp → `active`（**强制 TOTP**）。
- 登录：`/login/start`(email 或 mobile + 密码 → challenge) → `/login/verify`(TOTP) / `/login/recovery`(恢复码)。
- 无邀请、无角色、无 KYC 有效期、无账户 hold 态；KYC 与激活解耦。
- DEMO token 旁路：`user_from_token` 对 demo token 返回硬编码 active 用户（需保留）。

## 2. 核心张力：主键 `phone` vs 邀请制邮箱注册

邀请制下客户用**邮箱**注册，不一定有手机号；但 `phone` 是 NOT NULL 主键，且 5 张表都按 phone 关联。继续用 phone 当主键会逼出"给邮箱用户合成假手机号"的脏数据。

### 迁移路径（**需你选**）

| | 路径 A：迁到 `user_id`（推荐） | 路径 B：保留 phone PK 并存 |
|---|---|---|
| 做法 | 重建 `users` 主键为 `id`(uuid)，`email`/`phone` 均为可空唯一属性；5 张关联表外键 phone→user_id | 保留 phone PK，邮箱用户合成占位 phone，后续再迁 |
| 优点 | 一次到位，邀请/邮箱/员工/多角色都顺；干净 | 首次改动小 |
| 缺点 | 一次性重建表迁移（SQLite 建新表→拷数据→改名） | 占位 phone 是脏数据；几乎必然要再迁一次；并存期逻辑更乱 |
| 风险控制 | 部署 workflow 已自动备份 SQLite；迁移加行数校验 + 可回滚；DEMO 旁路保留 | — |

> **推荐路径 A**。之前你定"分阶段并存"是基于"迁移风险高"，但深入看 phone PK 与邮箱注册本质冲突，并存反而更脏。重建迁移用"备份 + 拷贝校验 + 幂等 init_db"可控。**请确认走 A 还是 B。**

以下设计按**路径 A** 给出。

## 3. 目标数据模型（路径 A）

### 3.1 `users`（重建）

```sql
CREATE TABLE users (
  id              TEXT PRIMARY KEY,        -- uuid，所有关联表外键锚点
  user_type       TEXT NOT NULL,           -- 'patron' | 'staff'
  email           TEXT UNIQUE,             -- 客户/员工主登录标识
  phone           TEXT UNIQUE,             -- 可空：客户找回/step-up；员工可空
  area_code       TEXT, number TEXT,       -- 保留兼容短信通道
  name            TEXT NOT NULL,
  pw_hash         TEXT NOT NULL, pw_salt TEXT NOT NULL,
  totp_secret     TEXT,                    -- 可空（2FA 可选）
  totp_enabled    INTEGER NOT NULL DEFAULT 0,
  last_counter    INTEGER,
  totp_expires_at INTEGER,
  status          TEXT NOT NULL,           -- 见 3.4 状态机
  kyc_status      TEXT,                    -- 缓存：not_started/pending/approved/rejected/expired
  kyc_valid_until INTEGER,                 -- approved 时 = 通过时间 + 180d
  invited_by      TEXT,                    -- RM 的 user_id（客户）
  created_at      INTEGER NOT NULL
);
```

### 3.2 `user_roles`（多对多，员工细分角色）

```sql
CREATE TABLE user_roles (
  user_id   TEXT NOT NULL,
  role      TEXT NOT NULL,   -- rm | marketing | compliance | ops | custodian | admin
  PRIMARY KEY (user_id, role)
);
```
- 客户 `user_type='patron'`，不进 user_roles（或统一给隐含 `patron`）。
- 一人可多角色（如 marketing+ops）→ 满足决策 5。

### 3.3 `invitations`（邀请制准入）

```sql
CREATE TABLE invitations (
  id            TEXT PRIMARY KEY,          -- uuid
  patron_email  TEXT NOT NULL,
  patron_name   TEXT,
  details_json  TEXT,                      -- RM 提交的客户资料
  token         TEXT UNIQUE,               -- 签发后才有；single-use
  status        TEXT NOT NULL,             -- submitted/approved/rejected/issued/consumed/expired/revoked
  expires_at    INTEGER,                   -- 签发时 = now + 72h（决策 4）
  created_by     TEXT NOT NULL,            -- RM user_id
  reviewed_by    TEXT,                     -- marketing user_id
  consumed_by    TEXT,                     -- 注册成功后的客户 user_id
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
```
> 准入审核（决策 3）：Marketing 在**外部系统**做尽调，本系统只走 submitted→approved→issued（签发链接）。

### 3.4 账户状态机（`users.status`）

```
（邀请 invitations: submitted→approved→issued→consumed）
                                          │ 客户用 token+email+EmailOTP+密码注册
                                          ▼
                                     onboarding ──KYC approved──▶ active（可入金）
                                          │                         │
                                    KYC pending/未过              KYC 过期(>180d)
                                          ▼                         ▼
                                       on_hold ◀──────────────── on_hold（需重做 KYC，决策 10）
                                          │
                                    管理员停用 ▶ suspended
```
- 入金/退款前置 `status='active'` 且 KYC 未过期。
- 2FA 不再是激活前提（决策 9）。

### 3.5 OTP 通道泛化（Email OTP）

现 `otps` 表 PK=phone。改为通用标识：

```sql
CREATE TABLE otps (
  identifier  TEXT PRIMARY KEY,   -- 'email:foo@bar' 或 'phone:85291234567'
  code TEXT, expires_at INTEGER, sent_at INTEGER,
  tries INTEGER DEFAULT 0, day_count INTEGER DEFAULT 1, day_start INTEGER
);
```
- 新增邮件发送适配器（仿 `send_sms`）；短信通道保留作 step-up / 找回（决策 2）。

### 3.6 其他关联表

`sessions`/`challenges`/`recovery_codes`/`sumsub_kyc_applications` 外键 `phone` → `user_id`。`sumsub_kyc_applications` 增 `approved_at`/`valid_until`（决策 10）。

## 4. 端点清单

**新增**
- `POST /api/invitations`（RM 提交）— role: rm
- `GET /api/invitations`（审核队列）— role: marketing/compliance
- `POST /api/invitations/{id}/approve|reject`（Marketing）
- `POST /api/invitations/{id}/issue`（签发 token+72h，触发发邮件）
- `POST /api/invitations/verify`（客户 token+email 校验，进注册）
- `POST /api/email/send-otp`（Email OTP）
- `POST /api/admin/staff`（管理员预置员工账号 + 分配角色）— role: admin
- `POST /api/2fa/step-up`（入金/退款前强制验一次，决策 9）

**改造**
- `POST /api/register`：改为 **邀请 token + email + Email OTP + 密码**；2FA 不强制（onboarding 即可，TOTP 可选绑定）
- `POST /api/login/start`：email 为主；区分 patron / staff
- `user_public` + `GET /api/me`：返回 `user_type`、`roles[]`、`kyc_status`、`kyc_valid_until`
- `user_from_token`：加载 roles；新增 `require_role(*roles)` 依赖
- KYC：approved 时写 `valid_until=+180d`；读取判过期→`on_hold`

## 5. RBAC

- 后端：`require_role(*roles)` FastAPI 依赖；后台端点（invitations / admin / casino-ops 数据 / 退款审批）服务端按角色校验——**这是真正防越权的根基**（前端守卫只是 UX）。
- 前端：`AuthUser` 加 `roles`；`requireRole` 路由守卫；`/casino-ops`、`/treasury-controls` 仅 staff，patron 重定向。

## 6. 迁移安全（路径 A）

1. 迁移前自动备份 SQLite（部署 workflow 已有）。
2. `init_db` 幂等：检测 `users` 是否旧结构（有 `phone PRIMARY KEY`）→ 建新表 `users_new` → `INSERT SELECT`（老用户生成 uuid、`user_type='patron'`、`totp_enabled=1`、`status` 映射 active/onboarding）→ 校验行数一致 → DROP 旧表 → RENAME。
3. 同步迁 5 张关联表（phone→user_id 映射）。
4. 老用户回填 `user_roles`（patron 隐含）；预置一个 `admin` 员工账号。
5. DEMO token 旁路：返回的 demo 用户补 `user_type/roles`，保持可用。

## 7. 风险与待确认

- **迁移是一次性重建**：必须备份 + 行数/抽样校验 + 可回滚；建议先在本地 DB 演练。
- **员工首个 admin 账号**怎么创建：用一次性 bootstrap 脚本 / 环境变量种子账号？（建议环境变量种子，首次登录改密）
- **Email 发送通道**：用哪家（SMTP / SendGrid / SES）？需要凭据（走 env，不入仓）。
- 短信通道**降级为 step-up/找回**后，现有短信注册前端要改邀请落地页。
- 退款/入金 step-up 的具体触发点（金额阈值？每次？）—— 决策 9 已定"入金/退款前"，是否每次都验待细化。
- 实现工作量大（XL），建议拆 PR：① schema 迁移 + RBAC 地基 + 越权修复；② 邀请制 + Email OTP；③ 2FA 可选 + step-up；④ KYC 有效期。
