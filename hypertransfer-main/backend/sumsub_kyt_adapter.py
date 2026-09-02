"""
sumsub_kyt_adapter.py — v1.1 Q2
Sumsub KYT / Crypto Monitoring adapter for source wallet screening.

HyperTransfer 当前 (v1.1) 把 Wallet KYT 决定从 Hex Safe API mock 切到 Sumsub Crypto
Monitoring API(同 KYC + Travel Rule 路径)。本模块提供与现有 screen_source_wallet() 兼容的
接口,允许在不修改编排代码的前提下切换实现。

真实 Sumsub KYT 端点(待生产凭据配置后激活):
  POST /resources/applicants/{id}/kyt/txns/-/data   (single tx submission)
  GET  /resources/kyt/txns/query/-                   (tx history)
  GET  /resources/kyt/wallets/-/address/{addr}      (wallet risk, 若 Sumsub 文档化)

注意 — 本期实现遵循以下约束:
  1. 接口形状与 screen_source_wallet() 完全一致(decision: pass/edd/fail, provider,
     riskScore, reference, note), 保证编排代码无感切换。
  2. 默认仍走 mock(向后兼容, 不破坏现有 demo); 仅当配置 Sumsub KYT 凭据且
     HT_KYT_PROVIDER=sumsub 时启用真实路径。
  3. 生产凭据未配时, 走 mock 占位; production 模式下未配直接 fail closed(503)。
  4. Sumsub KYT 模块(Transaction Monitoring / Crypto Monitoring)的实际能力、
     限频、计费模型需在生产前与 Sumsub sales 复核。

新增 env vars:
  HT_KYT_PROVIDER        "mock" | "sumsub"      default: "mock"
  SUMSUB_KYT_APP_TOKEN   (optional)             required if provider=sumsub
  SUMSUB_KYT_SECRET_KEY  (optional)             required if provider=sumsub
"""

from __future__ import annotations

import os
import uuid
from typing import Any


def _resolve_chain_id(network: str) -> str:
    n = (network or "").strip().lower()
    if n in ("ethereum", "eth", "erc-20", "erc20"):
        return "ethereum"
    if n in ("tron", "trc-20", "trc20"):
        return "tron"
    return n


def _screen_mock(address: str, chain_id: str) -> dict[str, Any]:
    a = (address or "").lower()
    ref = "KYT-DEP-" + uuid.uuid4().hex[:8].upper()
    if any(k in a for k in ("bad", "sanction", "blocked", "ofac")):
        return {"decision": "fail", "provider": "sumsub-mock", "riskScore": 92, "reference": ref,
                "chainId": _resolve_chain_id(chain_id),
                "note": "Source wallet matched a high-risk/sanctioned sample rule (mock)"}
    if any(k in a for k in ("edd", "review", "mixer", "tornado")):
        return {"decision": "edd", "provider": "sumsub-mock", "riskScore": 61, "reference": ref,
                "chainId": _resolve_chain_id(chain_id),
                "note": "Source wallet triggered an EDD sample rule (mock)"}
    return {"decision": "pass", "provider": "sumsub-mock", "riskScore": 9, "reference": ref,
            "chainId": _resolve_chain_id(chain_id),
            "note": "Source wallet did not match any risk rule (mock)"}


def _screen_sumsub(address: str, chain_id: str) -> dict[str, Any]:
    import urllib.request
    import urllib.error
    import json

    token = os.environ.get("SUMSUB_KYT_APP_TOKEN", "").strip()
    secret = os.environ.get("SUMSUB_KYT_SECRET_KEY", "").strip()
    base = os.environ.get("SUMSUB_BASE_URL", "https://api.sumsub.com").rstrip("/")
    env = os.environ.get("SUMSUB_ENVIRONMENT", "sandbox").strip().lower()
    if not (token and secret):
        if env == "production":
            raise RuntimeError("Sumsub KYT credentials not configured in production")
        return _screen_mock(address, chain_id)

    url = f"{base}/resources/kyt/wallets/{_resolve_chain_id(chain_id)}/address/{address}/risk"
    req = urllib.request.Request(url, method="GET", headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "X-App-Token": token,
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        raise RuntimeError(f"Sumsub KYT request failed: {e}") from e

    risk = float(payload.get("riskScore", 0))
    decision = "fail" if risk >= 80 else "edd" if risk >= 50 else "pass"
    return {
        "decision": decision,
        "provider": "sumsub",
        "riskScore": int(risk),
        "reference": payload.get("reference") or ("KYT-SUM-" + uuid.uuid4().hex[:8].upper()),
        "chainId": _resolve_chain_id(chain_id),
        "sanctionedHit": bool(payload.get("sanctions")),
        "exposurePercent": float(payload.get("exposurePercent", 0)),
        "hopCount": int(payload.get("hopCount", 0)),
        "note": f"Sumsub KYT {env} result: decision={decision} risk={risk:.0f}",
    }


def screen_source_wallet_v2(address: str, chain_id: str) -> dict[str, Any]:
    provider = (os.environ.get("HT_KYT_PROVIDER") or "mock").strip().lower()
    if provider == "sumsub":
        return _screen_sumsub(address, chain_id)
    return _screen_mock(address, chain_id)
