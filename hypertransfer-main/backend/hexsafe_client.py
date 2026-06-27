"""
hexsafe_client.py — Hex Safe (Hex Trust) REST API v2 客户端。

认证方案（已对 sandbox 实测通过：GET /v1/vaults 等返回 200）：
  - Authorization: Bearer <ES256 JWT>
    JWT header  : {"alg":"ES256","typ":"JWT"}
    JWT claims  : {"exp": 毫秒时间戳, "api-key": <key>, "uri": <请求路径含/v1>, "nonce": int,
                   "digest": <SHA-512(body) → base64url>  # 仅 POST/PUT}
  - x-api-key: <key>
  - x-request-id: <uuid>            # POST/PUT 幂等（可选但推荐）
  - User-Agent: 浏览器 UA           # ★坑：默认 python UA 会被 Cloudflare 1010 直接封

配置全走环境变量，私钥/Key 不入库：
  HEXSAFE_API_KEY            必填  hsk_...
  HEXSAFE_PRIVATE_KEY        EC 私钥 PEM 内容（优先）
  HEXSAFE_PRIVATE_KEY_PATH   或 EC 私钥 PEM 文件路径（与上者二选一）
  HEXSAFE_BASE_URL           默认 https://api.sandbox.hexsafe.hextrust.com
  HEXSAFE_API_PREFIX         默认 /v1
  HEXSAFE_JWT_TTL            JWT exp 距现在的秒数，默认 60（每请求新签，短即可）
  HEXSAFE_USER_AGENT         默认浏览器 UA
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Optional

import jwt  # PyJWT[crypto]

DEFAULT_BASE_URL = "https://api.sandbox.hexsafe.hextrust.com"
DEFAULT_API_PREFIX = "/v1"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
DEFAULT_JWT_TTL = 60  # 秒


class HexSafeError(Exception):
    """非 2xx 响应或本地配置/网络错误。"""

    def __init__(self, message: str, status: Optional[int] = None, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


def _load_private_key() -> str:
    """优先取 HEXSAFE_PRIVATE_KEY 内容，否则读 HEXSAFE_PRIVATE_KEY_PATH 文件。"""
    pem = os.environ.get("HEXSAFE_PRIVATE_KEY", "").strip()
    if pem:
        return pem
    path = os.environ.get("HEXSAFE_PRIVATE_KEY_PATH", "").strip()
    if path:
        with open(os.path.expanduser(path), "r") as fh:
            return fh.read()
    raise HexSafeError("缺少私钥：请设置 HEXSAFE_PRIVATE_KEY 或 HEXSAFE_PRIVATE_KEY_PATH")


def _gen_digest(body: str) -> str:
    """POST/PUT body 的 SHA-512 摘要 → base64url（无填充）。"""
    h = hashlib.sha512(body.encode()).digest()
    return base64.urlsafe_b64encode(h).decode().rstrip("=")


class HexSafeClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        private_key: Optional[str] = None,
        base_url: Optional[str] = None,
        api_prefix: Optional[str] = None,
        jwt_ttl: Optional[int] = None,
        user_agent: Optional[str] = None,
        timeout: int = 20,
    ):
        self.api_key = (api_key or os.environ.get("HEXSAFE_API_KEY", "")).strip()
        if not self.api_key:
            raise HexSafeError("缺少 HEXSAFE_API_KEY")
        self.private_key = private_key or _load_private_key()
        self.base_url = (base_url or os.environ.get("HEXSAFE_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self.api_prefix = api_prefix or os.environ.get("HEXSAFE_API_PREFIX", DEFAULT_API_PREFIX)
        self.jwt_ttl = int(jwt_ttl or os.environ.get("HEXSAFE_JWT_TTL", DEFAULT_JWT_TTL))
        self.user_agent = user_agent or os.environ.get("HEXSAFE_USER_AGENT", DEFAULT_USER_AGENT)
        self.timeout = timeout

    # -- 内部：签名 + 发请求 --
    def _full_path(self, path: str) -> str:
        if path.startswith(self.api_prefix + "/") or path == self.api_prefix:
            return path
        return self.api_prefix + "/" + path.lstrip("/")

    def _build_jwt(self, uri: str, body: str, is_write: bool) -> str:
        claims: dict[str, Any] = {
            "exp": int((time.time() + self.jwt_ttl) * 1000),  # 毫秒（文档示例 .toMillis()）
            "api-key": self.api_key,
            "uri": uri,
            "nonce": secrets.randbits(63),
        }
        if is_write:
            claims["digest"] = _gen_digest(body)
        return jwt.encode(claims, self.private_key, algorithm="ES256")

    def request(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        """发起请求；2xx 返回解析后的 JSON，非 2xx 抛 HexSafeError。"""
        method = method.upper()
        is_write = method in ("POST", "PUT", "PATCH")
        uri = self._full_path(path)
        raw_body = json.dumps(body, separators=(",", ":")) if body is not None else ""
        token = self._build_jwt(uri, raw_body, is_write)

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "User-Agent": self.user_agent,  # 防 Cloudflare 1010
            "x-api-key": self.api_key,
            "Authorization": "Bearer " + token,
        }
        if is_write:
            headers["x-request-id"] = idempotency_key or str(uuid.uuid4())

        data = raw_body.encode() if is_write else None
        req = urllib.request.Request(self.base_url + uri, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                text = resp.read().decode()
                return json.loads(text) if text else {}
        except urllib.error.HTTPError as e:
            text = e.read().decode()
            try:
                parsed = json.loads(text)
            except Exception:
                parsed = text
            raise HexSafeError(f"Hex Safe HTTP {e.code} {uri}", status=e.code, body=parsed)
        except urllib.error.URLError as e:
            raise HexSafeError(f"Hex Safe 网络错误: {e.reason}")

    # -- 便捷只读端点（step 2 再扩展写端点）--
    def list_vaults(self) -> Any:
        return self.request("GET", "/vaults")

    def supported_chains(self) -> Any:
        return self.request("GET", "/supported_chains")

    def supported_assets(self) -> Any:
        return self.request("GET", "/supported_assets")

    def travel_rule_vasps(self) -> Any:
        return self.request("GET", "/travel_rule/vasp")


if __name__ == "__main__":
    # 自测：列 vault，证明签名+认证打通。
    # 运行前 export HEXSAFE_API_KEY / HEXSAFE_PRIVATE_KEY_PATH。
    client = HexSafeClient()
    print(f"[hexsafe] base={client.base_url}{client.api_prefix} ttl={client.jwt_ttl}s")
    vaults = client.list_vaults()
    vlist = vaults.get("vaultList", []) if isinstance(vaults, dict) else []
    print(f"[hexsafe] GET /vaults OK — {len(vlist)} vault(s):")
    for v in vlist:
        print(f"  - {v.get('id')}  {v.get('name')}  {v.get('type')}  {v.get('status')}")
