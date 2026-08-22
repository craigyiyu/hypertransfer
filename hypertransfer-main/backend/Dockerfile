# HyperTransfer 认证后端 (FastAPI + uvicorn)
FROM python:3.12-slim

WORKDIR /app

# 仅装运行依赖,利用缓存:先 copy requirements 再 copy 代码
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py hexsafe_client.py seed_demo.py \
     admission_rules.py transaction_compliance_rules.py \
     admission_provider_adapters.py notabene_adapter.py ./

# SQLite 落在挂载卷 /data(由 docker-compose 提供持久化)
ENV HT_DB_PATH=/data/hypertransfer_auth.db
RUN mkdir -p /data

EXPOSE 8000

# 单进程即可:SQLite 不支持多进程并发写,演示/中小流量足够
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
