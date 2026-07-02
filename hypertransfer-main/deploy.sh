#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# HyperTransfer 部署脚本
# 用法: ./deploy.sh
# 功能: git pull → 备份数据库 → docker compose 重建 → 健康检查
# =============================================================================

# ---------- 颜色定义 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*"; }

# ---------- Step 0: 确定目录 ----------
# 脚本位于 hypertransfer-main/ 下，仓库根目录是其上级
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HT_DIR="$SCRIPT_DIR"

# ---------- Step 1: 拉取最新代码 ----------
info "切换到仓库根目录: $REPO_ROOT"
cd "$REPO_ROOT"

info "拉取最新代码..."
git pull origin main
info "代码已更新"

# ---------- Step 2: 进入 hypertransfer-main 目录 ----------
cd "$HT_DIR"
info "工作目录: $(pwd)"

# ---------- Step 2.5: 前端构建版本 ----------
# Docker build context 是 hypertransfer-main/，不包含仓库根 .git；
# 这里显式注入当前 commit，避免页面版本号退回 vX.Y.Z+local。
export VITE_GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
info "前端构建版本 commit: ${VITE_GIT_COMMIT}"

# ---------- Step 3: 检查 .env 文件 ----------
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    warn ".env 不存在，已从 .env.example 复制。请编辑 .env 填写正式环境变量后重新运行！"
  else
    warn ".env 和 .env.example 均不存在，将使用 docker-compose.yml 中的默认值"
  fi
fi

# ---------- Step 4: 备份 SQLite 数据库 ----------
BACKUP_DIR="$HT_DIR/backups"
CONTAINER_NAME="$(docker compose ps -q backend 2>/dev/null || true)"

if [ -n "$CONTAINER_NAME" ]; then
  mkdir -p "$BACKUP_DIR"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="$BACKUP_DIR/hypertransfer_auth_${TIMESTAMP}.db"

  info "备份数据库到 $BACKUP_FILE ..."
  docker cp "$CONTAINER_NAME":/data/hypertransfer_auth.db "$BACKUP_FILE" 2>/dev/null && \
    info "数据库备份完成: $BACKUP_FILE" || \
    warn "数据库备份跳过（容器内无数据库文件或容器未运行）"
else
  warn "后端容器不存在，跳过数据库备份（首次部署？）"
fi

# ---------- Step 5: 构建并启动服务 ----------
info "构建并启动 Docker Compose 服务..."
docker compose up -d --build --remove-orphans
info "容器已启动"

# ---------- Step 6: 健康检查 ----------
WEB_PORT="${WEB_PORT:-8090}"
HEALTH_URL="http://localhost:${WEB_PORT}/api/health"
MAX_WAIT=90
INTERVAL=3
ELAPSED=0

info "等待服务就绪 (最多 ${MAX_WAIT}s)..."
info "健康检查端点: $HEALTH_URL"

while [ $ELAPSED -lt $MAX_WAIT ]; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo ""
    info "=========================================="
    info "  部署成功！服务已就绪"
    info "  访问地址: http://<服务器IP>:${WEB_PORT}"
    info "=========================================="
    exit 0
  fi
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
  printf "\r  等待中... %ds / %ds (HTTP: %s)" "$ELAPSED" "$MAX_WAIT" "$HTTP_CODE"
done

# ---------- Step 7: 部署失败，输出日志帮助排查 ----------
echo ""
error "=========================================="
error "  部署失败！健康检查超时 (${MAX_WAIT}s)"
error "=========================================="
echo ""
error "最近容器日志 (backend):"
echo "---"
docker compose logs --tail=50 backend 2>/dev/null || true
echo "---"
error "最近容器日志 (web):"
echo "---"
docker compose logs --tail=30 web 2>/dev/null || true
echo "---"
error "请检查以上日志排查问题"
exit 1
