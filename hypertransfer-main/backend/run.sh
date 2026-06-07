#!/usr/bin/env bash
# 启动 HyperTransfer 认证后端 (FastAPI, 端口 8000)
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8000}"

if [ ! -d ".venv" ]; then
  echo "▶ 创建虚拟环境 .venv ..."
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
echo "▶ 安装依赖 ..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

echo "▶ 后端启动于 http://0.0.0.0:${PORT}  (健康检查 /api/health)"
exec uvicorn server:app --host 0.0.0.0 --port "${PORT}"
