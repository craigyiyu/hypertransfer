#!/usr/bin/env bash
# 一键起 HyperTransfer 本地全量演示：后端(8000) + 前端(3000)，并灌好"零等待"演示数据。
# 用法： cd hypertransfer-main && ./dev.sh        （Ctrl-C 退出，连带停后端）
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

echo "▶ 准备后端依赖 (.venv)…"
cd backend
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/pip install -q -r requirements.txt

echo "▶ 灌入演示数据 (幂等，每次启动重置为干净初始态)…"
./.venv/bin/python seed_demo.py

echo "▶ 启动后端 (uvicorn :8000)…"
./.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8000 &
BACK=$!
cd "$ROOT"
cleanup() { kill "$BACK" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

cat <<EOF

────────────────────────────────────────────────────────────
  ▶ 前端     http://localhost:3000
  ▶ 后台     http://localhost:3000/casino-ops
  ▶ 后端     http://localhost:8000/api/health
  ▶ 员工登录 6 位 TOTP 取码：
       ./backend/.venv/bin/python backend/seed_demo.py code
────────────────────────────────────────────────────────────
EOF

echo "▶ 启动前端 (vite :3000)… (Ctrl-C 退出)"
corepack pnpm install --silent 2>/dev/null || corepack pnpm install
corepack pnpm dev
