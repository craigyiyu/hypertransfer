# HyperTransfer 部署说明（运维 · monorepo 版）

前端（Next.js 静态导出）+ 后端（Python/FastAPI 认证服务）+ SQLite，全部用 Docker Compose 一键拉起。
**运维无需安装 Node / Python / pnpm**，只需要 Docker。

> 2026-08 起前端已从 hypertransfer-main（React/Vite）迁移为仓库根 monorepo 的 `apps/web`（Next.js App Router + 共享 `packages/ui`），
> 部署文件随之上移到仓库根。旧 `hypertransfer-main/` 前端为历史版本，仅后端 `hypertransfer-main/backend` 继续使用。

---

## 1. 前置要求

- 一台 Linux 服务器（x86_64 或 arm64 均可）
- 已安装 **Docker Engine 20.10+** 与 **Docker Compose v2**（`docker compose version` 能输出版本即可）
- 放通对外端口（默认 `8080`，可改）
- 如果使用 GitHub Actions 自动发布：服务器需安装 `rsync`，并允许部署用户通过 SSH 登录
- **构建阶段需要能联网**（下载 npm / pip 依赖）

## 2. 一键启动

把整个仓库（或至少根目录的 `apps/` `packages/` `deploy/`、`Dockerfile.frontend`、`docker-compose.yml`、`package.json`、`package-lock.json` 与 `hypertransfer-main/backend/`）拷到服务器，在**仓库根目录**执行：

```bash
# (可选) 自定义对外端口 / CORS / 短信网关
cp .env.example .env
# 然后按环境修改 WEB_PORT / HT_ALLOWED_ORIGINS / SMS_API_URL 等

docker compose up -d --build
```

首次构建约 2–4 分钟。完成后访问：

```
http://<服务器IP>:8080
```

健康检查（后端）：

```bash
curl http://<服务器IP>:8080/api/health
# 预期返回 200
```

## 3. 架构（一张图看懂）

```
浏览器 ──►  web 容器 (nginx, 宿主 :8080)
                 ├── 静态页面 (apps/web Next 静态导出 out/)
                 └── /api/*  ──反代──►  backend 容器 (uvicorn :8000, 来自 hypertransfer-main/backend)
                                              └── SQLite 落在持久卷 ht-db (/data)
```

- 前端代码请求走同源 `/api`，由 nginx 转发到后端，**前端无需配置后端地址**。
- 后端容器**不对外暴露端口**，只能通过内部网络被 nginx 访问。
- 数据库是命名卷 `ht-db`，**容器重建 / 升级数据不丢**。
- 前端为静态导出，**无 Node 运行时**，`next dev` 的 `/api` rewrite 仅用于本地开发。

## 4. 常用运维命令

```bash
docker compose ps                 # 查看状态
docker compose logs -f backend    # 看后端日志(认证/短信)
docker compose logs -f web        # 看 nginx 访问日志
docker compose restart            # 重启
docker compose down               # 停止并删除容器(数据卷保留)
docker compose up -d --build      # 改了代码后重新构建并滚动更新
```

### 数据库备份 / 恢复

```bash
docker compose cp backend:/data/hypertransfer_auth.db ./backup-$(date +%F).db   # 备份
docker compose cp ./backup-xxxx.db backend:/data/hypertransfer_auth.db           # 恢复
docker compose restart backend
```

## 5. GitHub Actions 自动发布到香港服务器

- PR / `feature/*`：只跑 `HyperTransfer Check`（根目录 `npm ci` + typecheck + turbo build + web vitest）。
- 合并到 `main`：自动部署到 GitHub Environment `staging`。
- 生产发布：在 GitHub Actions 手动运行 `HyperTransfer Deploy HK`，选择 `production`；建议在 GitHub Environment 上开启人工 approval。

### 必需 Secrets

| Secret | 说明 |
|---|---|
| `HK_HOST` | 香港服务器公网 IP 或域名 |
| `HK_SSH_PORT` | SSH 端口，通常 `22`；未配置时默认 `22` |
| `HK_SSH_USER` | 部署用户，例如 `deploy` |
| `HK_SSH_KEY` | 部署用户私钥内容，公钥需在服务器 `~/.ssh/authorized_keys` |
| `HK_DEPLOY_PATH` | 服务器部署目录，例如 `/opt/hypertransfer/app` |
| `HK_ENV_FILE` | 可选但生产强烈建议：完整 `.env` 内容，workflow 写入服务器根 `.env` |
| `HK_SSH_KNOWN_HOSTS` | 可选：SSH known_hosts；不填时用 `ssh-keyscan` 获取 |

`HK_ENV_FILE` 示例：

```env
WEB_PORT=8080
HT_ALLOWED_ORIGINS=https://h5.hypercypto.com
SMS_API_URL=https://<production-sms-gateway>/api/sms/simpleSend
SMS_SIGN_CN=【正式短信签名】
SMS_SIGN_INTL=[HyperTransfer]
SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_ENVIRONMENT=sandbox
HT_ADMIN_EMAIL=admin@example.com
HT_ADMIN_PASSWORD=<strong-password>
```

### 生产部署保护

`HyperTransfer Deploy HK` 在 `production` 环境会**拒绝部署**当：

- `HT_ALLOWED_ORIGINS=*`（CORS 未收窄）
- `SMS_API_URL` 仍指向 QA 网关（`hv-test.hypervelocity.cn`）

### 版本号注入

首页 footer 显示 `v<version>+<git sha>`：

- Docker 构建参数：`NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_GIT_COMMIT`
- GitHub Actions 自动注入 `NEXT_PUBLIC_GIT_COMMIT=<GITHUB_SHA::7>`；`NEXT_PUBLIC_APP_VERSION` 默认取 `apps/web/package.json` 的 version（可在 `.env` 覆盖）

## 6. 本地开发

```bash
npm install            # 根目录安装全部 workspace 依赖
npm run dev            # turbo dev (web :3000 + operator :3001 并发)
npm run typecheck      # 全部 workspace tsc
npm run build          # turbo build (web 静态导出 + operator)
npm test --workspace=web   # web 客户端 vitest
```

本地连后端：先起 `hypertransfer-main/backend/server.py`（或 `hypertransfer-main/dev.sh`），
`apps/web` 开发模式会经 next rewrite 把 `/api/*` 转发到 `http://localhost:8000`。

## 7. 离线 / 内网部署

内网隔离环境请在能联网的机器上预先执行 `npm ci`，并把 `node_modules` 一并拷贝到服务器；
后端依赖同理（`hypertransfer-main/backend/requirements.txt` → `pip download`）。镜像构建时 `npm ci` 会复用已有的 `node_modules` 缓存（Docker layer 命中时跳过下载）。
