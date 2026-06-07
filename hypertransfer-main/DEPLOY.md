# HyperTransfer 部署说明（运维）

前端（React/Vite 静态页）+ 后端（Python/FastAPI 认证服务）+ SQLite，全部用 Docker Compose 一键拉起。
**运维无需安装 Node / Python / pnpm**，只需要 Docker。

---

## 1. 前置要求

- 一台 Linux 服务器（x86_64 或 arm64 均可）
- 已安装 **Docker Engine 20.10+** 与 **Docker Compose v2**（`docker compose version` 能输出版本即可）
- 放通对外端口（默认 `8080`，可改）
- **构建阶段需要能联网**（下载 npm / pip 依赖）。内网隔离环境请看文末「离线 / 内网部署」

## 2. 一键启动

把整个 `hypertransfer-main/` 目录拷到服务器，进入该目录：

```bash
# (可选) 自定义对外端口
cp .env.example .env      # 然后改 WEB_PORT，不改则用 8080

docker compose up -d --build
```

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

## 5. ⚠️ 上线前必须改的两处（当前是演示态配置）

> 不改也能跑通流程，但**不要直接对真实用户上线**。

1. **CORS 放开了全部来源** — `backend/server.py` 中 `allow_origins=["*"]`。
   正式环境应改成你们的前端域名（如 `https://h5.hypercypto.com`）。
2. **短信走的是 QA 测试网关** — `backend/server.py` 中
   `SMS_API_URL = "https://hv-test.hypervelocity.cn/..."`。
   正式环境要换成正式短信网关地址与签名。

> 这两处属于业务/安全决策，需研发确认后再改。改完 `docker compose up -d --build` 即生效。

## 6. HTTPS（强烈建议，部分功能依赖）

当前 compose 暴露的是 **HTTP**。以下能力在非 HTTPS（且非 `localhost`）下浏览器会禁用：

- 短信验证码「从短信一键填入」在部分浏览器不弹
- Passkey / 剪贴板 / PWA 等需要 secure context 的能力

**生产请在最前面再加一层 HTTPS**，二选一：

- 公司已有统一网关 / 负载均衡 → 直接把 `:8080` 挂到它后面，由它做 TLS 终止；
- 没有 → 在宿主机加一层 Caddy / Traefik / nginx 做 TLS（Let's Encrypt 自动证书），反代到 `:8080`。

## 7. 离线 / 内网部署

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
