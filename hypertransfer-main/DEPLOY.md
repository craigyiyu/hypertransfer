# HyperTransfer 部署说明（运维）

前端（React/Vite 静态页）+ 后端（Python/FastAPI 认证服务）+ SQLite，全部用 Docker Compose 一键拉起。
**运维无需安装 Node / Python / pnpm**，只需要 Docker。

---

## 1. 前置要求

- 一台 Linux 服务器（x86_64 或 arm64 均可）
- 已安装 **Docker Engine 20.10+** 与 **Docker Compose v2**（`docker compose version` 能输出版本即可）
- 放通对外端口（默认 `8080`，可改）
- 如果使用 GitHub Actions 自动发布：服务器需安装 `rsync`，并允许部署用户通过 SSH 登录
- **构建阶段需要能联网**（下载 npm / pip 依赖）。内网隔离环境请看文末「离线 / 内网部署」

## 2. 一键启动

把整个 `hypertransfer-main/` 目录拷到服务器，进入该目录：

```bash
# (可选) 自定义对外端口 / CORS / 短信网关
cp .env.example .env
# 然后按环境修改 WEB_PORT / HT_ALLOWED_ORIGINS / SMS_API_URL 等

docker compose up -d --build
```

后端本地直接运行时也会自动读取 `hypertransfer-main/.env`；Docker Compose 则通过 compose environment 注入同一批变量。

首次构建约 1–3 分钟。完成后访问：

```
http://<服务器IP>:8080
```

健康检查（后端）：

```bash
curl http://<服务器IP>:8080/api/health
# 预期返回 {"ok":true} 之类的 200
```

## 3. 架构（一张图看懂）

```
浏览器 ──►  web 容器 (nginx, 宿主 :8080)
                 ├── 静态页面 (React 构建产物)
                 └── /api/*  ──反代──►  backend 容器 (uvicorn :8000)
                                              └── SQLite 落在持久卷 ht-db (/data)
```

- 前端代码请求走同源 `/api`，由 nginx 转发到后端，**前端无需配置后端地址**。
- 后端容器**不对外暴露端口**，只能通过内部网络被 nginx 访问，更安全。
- 数据库是命名卷 `ht-db`，**容器重建 / 升级数据不丢**。

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
# 备份(把卷里的 db 拷出来)
docker compose cp backend:/data/hypertransfer_auth.db ./backup-$(date +%F).db

# 恢复
docker compose cp ./backup-xxxx.db backend:/data/hypertransfer_auth.db
docker compose restart backend
```

## 5. GitHub Actions 自动发布到香港服务器

推荐发布策略：

- PR / `feature/*`：只跑 `HyperTransfer Check`，包含 TypeScript typecheck + production build。
- 合并到 `main`：自动部署到 GitHub Environment `staging` 对应的香港服务器。
- 生产发布：在 GitHub Actions 手动运行 `HyperTransfer Deploy HK`，选择 `production`；生产环境建议在 GitHub Environment 上开启人工 approval。

### GitHub Environments

建议创建两个 GitHub Environments：

| Environment | 用途 | 建议域名 |
|---|---|---|
| `staging` | 自动演示 / 内部测试 | `staging.h5.hypercypto.com` 或服务器 IP |
| `production` | 正式客户访问 | `h5.hypercypto.com` |

两个 environment 可以使用同名 secrets，但值不同。

### 必需 Secrets

在 GitHub repository 或 environment secrets 中配置：

| Secret | 说明 |
|---|---|
| `HK_HOST` | 香港服务器公网 IP 或域名 |
| `HK_SSH_PORT` | SSH 端口，通常 `22`；未配置时 workflow 默认用 `22` |
| `HK_SSH_USER` | 部署用户，例如 `deploy` |
| `HK_SSH_KEY` | 部署用户的私钥内容，对应公钥需放在服务器 `~/.ssh/authorized_keys` |
| `HK_DEPLOY_PATH` | 服务器部署目录，例如 `/opt/hypertransfer/app`；未配置时默认该路径 |
| `HK_ENV_FILE` | 可选但生产强烈建议：完整 `.env` 文件内容，workflow 会写入服务器 `hypertransfer-main/.env` |
| `HK_SSH_KNOWN_HOSTS` | 可选：SSH known_hosts 内容；不填时 workflow 用 `ssh-keyscan` 获取 |

`HK_ENV_FILE` 示例：

```env
WEB_PORT=8080
HT_ALLOWED_ORIGINS=https://h5.hypercypto.com
SMS_API_URL=https://<production-sms-gateway>/api/sms/simpleSend
SMS_SIGN_CN=【正式短信签名】
SMS_SIGN_INTL=[HyperTransfer]
SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_ENVIRONMENT=sandbox
SUMSUB_APP_TOKEN=<sumsub-app-token>
SUMSUB_SECRET_KEY=<sumsub-secret-key>
SUMSUB_WEBHOOK_SECRET_KEY=<sumsub-webhook-secret>
SUMSUB_KYC_LEVEL_NAME=<sumsub-kyc-level-name>
SUMSUB_TR_LEVEL_NAME=<sumsub-travel-rule-level-name>
SUMSUB_WEBSDK_TTL=600
```

### 服务器首次准备

```bash
# 1) 创建部署用户
sudo adduser deploy
sudo usermod -aG docker deploy

# 2) 创建部署目录
sudo mkdir -p /opt/hypertransfer/app
sudo chown -R deploy:deploy /opt/hypertransfer

# 3) 安装 Docker / Docker Compose v2 / rsync
docker compose version
rsync --version

# 4) 把 GitHub Actions 使用的 SSH 公钥放进 deploy 用户
sudo -u deploy mkdir -p /home/deploy/.ssh
sudo -u deploy chmod 700 /home/deploy/.ssh
sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys
sudo -u deploy chmod 600 /home/deploy/.ssh/authorized_keys
```

### 自动发布流程

`.github/workflows/hypertransfer-deploy-hk.yml` 会：

1. Checkout GitHub 代码。
2. 通过 SSH/rsync 同步仓库到香港服务器 `HK_DEPLOY_PATH`。
3. 保留服务器 `.env`、`backups/`、SQLite DB、日志、node_modules、dist 等运行时文件。
4. 如配置了 `HK_ENV_FILE`，自动写入服务器 `.env`。
5. 部署前备份 SQLite 到 `hypertransfer-main/backups/`。
6. 执行 `docker compose up -d --build --remove-orphans`。
7. 调用 `http://127.0.0.1:${WEB_PORT}/api/health` 做健康检查。

生产环境保护：

- 如果 `DEPLOY_ENVIRONMENT=production` 且 `HT_ALLOWED_ORIGINS=*`，workflow 会拒绝部署。
- 如果 `DEPLOY_ENVIRONMENT=production` 且 `SMS_API_URL` 仍指向 QA 网关，workflow 会拒绝部署。

## 6. ⚠️ 上线前必须改的两处（当前是演示态配置）

> 不改也能跑通流程，但**不要直接对真实用户上线**。

1. **CORS 默认可放开全部来源** — `.env` 中 `HT_ALLOWED_ORIGINS=*`。
   正式环境必须改成你们的前端域名（如 `https://h5.hypercypto.com`）。
2. **短信默认走 QA 测试网关** — `.env` 中 `SMS_API_URL=https://hv-test.hypervelocity.cn/...`。
   正式环境要换成正式短信网关地址与签名。

可选但真实 Sumsub 流程必需：

3. **Sumsub provider 凭证** — `.env` 中 `SUMSUB_APP_TOKEN` / `SUMSUB_SECRET_KEY` / `SUMSUB_KYC_LEVEL_NAME` / `SUMSUB_WEBHOOK_SECRET_KEY`。
   未配置时产品会显示 Sumsub adapter 已安装但未连通；配置后 KYC 页会创建或复用 Sumsub applicant、请求 WebSDK access token，后台可执行 Sumsub connection test。token/secret 只放服务器 `.env` 或 GitHub Secrets，不要写入仓库。
4. **Sumsub webhook URL** — 在 Sumsub Cockpit 中配置公网回调地址：
   `https://<你的域名>/api/webhooks/sumsub`。
   如果开启 webhook secret，请确保 Cockpit 中的 secret 与服务器 `SUMSUB_WEBHOOK_SECRET_KEY` 完全一致；修改后执行 `docker compose up -d --build` 或至少重启 backend。

> 这些属于业务/安全决策，需研发确认后再改。改完 `docker compose up -d --build` 即生效。

## 7. HTTPS（强烈建议，部分功能依赖）

当前 compose 暴露的是 **HTTP**。以下能力在非 HTTPS（且非 `localhost`）下浏览器会禁用：

- 短信验证码「从短信一键填入」在部分浏览器不弹
- Passkey / 剪贴板 / PWA 等需要 secure context 的能力

**生产请在最前面再加一层 HTTPS**，二选一：

- 公司已有统一网关 / 负载均衡 → 直接把 `:8080` 挂到它后面，由它做 TLS 终止；
- 没有 → 在宿主机加一层 Caddy / Traefik / nginx 做 TLS（Let's Encrypt 自动证书），反代到 `:8080`。

## 8. 离线 / 内网部署

如果服务器**不能联网**，请在一台能联网的机器上构建镜像再导入：

```bash
# 联网机
docker compose build
docker save -o hypertransfer-images.tar hypertransfer-main-web hypertransfer-main-backend
# (镜像名以 docker images 实际输出为准)

# 拷到内网服务器后
docker load -i hypertransfer-images.tar
docker compose up -d        # 不带 --build,直接用已导入镜像
```

---

## 附：技术信息（研发参考，运维可忽略）

| 项 | 值 |
|---|---|
| 前端 | React 19 + Vite + Tailwind 4，构建产物纯静态 |
| 后端 | FastAPI + uvicorn（单进程） |
| 存储 | SQLite（命名卷 `ht-db`，路径 `/data/hypertransfer_auth.db`，由 `HT_DB_PATH` 指定） |
| 前端→后端 | 同源 `/api`，nginx 反代到 `backend:8000` |
| 端口 | 对外 `WEB_PORT`(默认 8080) → nginx :80；后端 :8000 仅内网 |

> 注：SQLite 不支持多进程并发写，后端固定单进程。若未来并发上来，需迁移到 PostgreSQL 并改为多 worker。
