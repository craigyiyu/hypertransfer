#!/usr/bin/env bash
# 一键启动 HyperTransfer Auth Demo, 并打印手机访问地址。
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

# 找局域网 IP (macOS / Linux)
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[ -z "$LAN_IP" ] && LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
[ -z "$LAN_IP" ] && LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$LAN_IP" ] && LAN_IP="<你的电脑局域网IP>"

echo ""
echo "=================================================================="
echo "  电脑本机访问 :  http://localhost:${PORT}"
echo "  手机访问(同一WiFi) :  http://${LAN_IP}:${PORT}"
echo "  → 手机和电脑必须连同一个 WiFi"
echo "=================================================================="
echo ""

exec uvicorn server:app --host 0.0.0.0 --port "${PORT}"
