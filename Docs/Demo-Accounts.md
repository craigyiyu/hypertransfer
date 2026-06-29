# HyperTransfer 本地演示账号清单

> ⚠️ **全部为本地 demo 账号**（邮箱 `*.demo.local` / 固定测试 TOTP secret / demo 密码），**非真实凭据**，仅用于本地演示。来源：`hypertransfer-main/backend/seed_demo.py`（幂等，每次 `./dev.sh` 启动会重置为干净初始态）。
>
> 真实凭据（飞书 SMTP 等）见 `Docs/SMTP-Config.md`（已 .gitignore，不入库）。本文件可入库。

---

## 1. 本地访问入口

| 端 | URL | 用途 |
|---|---|---|
| **客户端**（patron） | `http://localhost:3000/` | 客户注册 / KYC / 入金 / 退款 |
| **工作人员端**（staff） | `http://localhost:3000/ops` | 员工登录 → 跳转 `/casino-ops` 后台 |
| 后台直达 | `http://localhost:3000/casino-ops` | 登录后的运营后台（按角色显隐板块） |

启动：`cd hypertransfer-main && ./dev.sh`（起后端 :8000 + 前端 :3000 并灌演示数据）。

---

## 2. ★ 两层准入审批角色（`/ops` 登录）

准入流程（process v1 §A）的两个角色账号，登录入口都是 **`http://localhost:3000/ops`**：

| 角色 | 邮箱 | 密码 | 能做什么 |
|---|---|---|---|
| **Relationship Manager（RM）** | `rm@demo.local` | `Staff@Demo123` | **只能**提交准入申请（Submit access request）+ 查看自己提交的审批进度。看不到后台其他功能/信息。 |
| **Marketing（Int'l Marketing）** | `marketing@demo.local` | `Staff@Demo123` | 看到 + 审批（Approve/Reject）全部准入申请；Approve 后 **Issue QR + link** 邮件发给客户；可 **Resend invite email** 补发。 |

> 闭环演示：用 **RM** 登录 → Access Requests 面板提交一个客户（填邮箱等）→ 退出 → 用 **Marketing** 登录 → 同面板看到该申请 → Approve → Issue（生成二维码 + 链接并发邮件）→ 如客户没收到，点 **Resend invite email** 补发（新 72h 链接，旧链接失效）。
>
> 注：Resend 有 **30 秒节流**（防邮件轰炸）——Issue 后立刻点会提示「请 X 秒后再试」，等几十秒即可。

---

## 3. 全部员工账号（5 角色）

所有员工 **邮箱 + 密码 + 6 位 TOTP**（staff 强制 2FA），共用同一固定 TOTP secret；密码统一 `Staff@Demo123`。

| 角色 | 邮箱 | 密码 | 后台可见板块 |
|---|---|---|---|
| admin | `admin@demo.local` | `Staff@Demo123` | 全部（含 Staff Admin 员工管理） |
| rm | `rm@demo.local` | `Staff@Demo123` | 仅 Access Requests（提交 + 看进度） |
| marketing | `marketing@demo.local` | `Staff@Demo123` | Access Requests（审批 + 签发 + 重发） |
| compliance | `compliance@demo.local` | `Staff@Demo123` | Deposits / Refunds / Custody / Ops 等合规板块 |
| custodian | `custodian@demo.local` | `Staff@Demo123` | Refund execute / Settle 等托管动作 |

### 2FA（6 位 TOTP）怎么过

- **演示快捷**：本地 `.env` 设了 `HT_DEMO_BYPASS_2FA=true` → 登录第二步**输任意 6 位数字**（如 `000000`）即可通过。
- **真实 TOTP**：
  - 取当前码：`cd hypertransfer-main/backend && ./.venv/bin/python seed_demo.py code`（30 秒一变）
  - 或把固定 secret `JBSWY3DPEHPK3PXP` 加进 Authenticator（Google/Microsoft Authenticator、Authy、1Password、苹果密码）扫码免输。

---

## 4. 客户演示账号（patron）

| 项 | 值 |
|---|---|
| 邮箱 | `patron.demo@hypercrypto.com` |
| 密码 | `Patron@Demo123` |
| 登录 | `http://localhost:3000/login`（2FA 关，邮箱+密码直接登录） |
| 状态 | KYC 已通过且未过期；有 1 个已验证原钱包，可直接走入金/退款 |

> 想演 KYC pending → 一键通过：用一个**新注册**的客户走到 KYC 页，pending 步骤点「Demo: approve & continue」。

---

## 5. 启动即有的后台待办（`/casino-ops`）

`./dev.sh` 灌入后，登录后台即见：

- **Deposit Queue**：1 笔待 Marker/结算（`DR-DEMO-0001`，5000 USDT）
- **Refund Queue**：1 笔待审退款（`RF-DEMO-0001`，1200 USDT → 原钱包）
- **Invitations**：1 条待审准入申请（`newvip@demo.local`，submitted）

---

## 6. 线上 demo（非本地）

| 项 | 值 |
|---|---|
| 站点 | `https://h5.hypercypto.com` |
| 登录 | `demo.user@hypercrypto.com` / `Demo@12345`（或 `/login` 点 `Use Demo Account`） |

---

*维护：账号定义在 `hypertransfer-main/backend/seed_demo.py`；改账号请改那里并同步本文件。*
