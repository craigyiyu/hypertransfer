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
import urllib.parse
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

    # -- 便捷只读端点 --
    def list_vaults(self) -> Any:
        return self.request("GET", "/vaults")

    def get_vault(self, vault_id: str) -> Any:
        return self.request("GET", f"/vaults/{vault_id}")

    def list_enterprises(self) -> Any:
        """列出当前 API key 可见的 enterprise。

        返回 {"enterpriseList": [{id, displayName, legalName, baseCurrency, ...}]}。
        withdrawal 必填的 enterpriseId 取自此处（sandbox = "DEMO - WML Logistics"）。
        """
        return self.request("GET", "/enterprises")

    def supported_chains(self) -> Any:
        return self.request("GET", "/supported_chains")

    def supported_assets(self) -> Any:
        return self.request("GET", "/supported_assets")

    def travel_rule_vasps(self) -> Any:
        return self.request("GET", "/travel_rule/vasp")

    # -- 交易 / 到账查询（读，均对 sandbox 实测通过）--
    def list_transactions(
        self,
        vault_id: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        sort: Optional[str] = None,
    ) -> Any:
        """列出交易（含入金到账）。返回 {"transactionList": [...], "paging": {...}}。

        可选过滤/分页（均对 sandbox 实测被采纳）：
          vault_id → ?vaultId（把范围收敛到某个 WTA vault）
          limit / offset / sort（服务端默认 limit=200, offset=0, sort=DESC）
        空 vault 返回空列表（非错误）。轮询到账即查此接口、按 status/txHash 匹配。
        """
        params: dict[str, Any] = {}
        if vault_id:
            params["vaultId"] = vault_id
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        if sort:
            params["sort"] = sort
        path = "/transactions"
        if params:
            path += "?" + urllib.parse.urlencode(params)
        return self.request("GET", path)

    def get_transaction(self, trace_id: str) -> Any:
        """按 traceId 查单笔交易详情。

        注意：traceId 不存在时 Hex Safe 返回 400（code -32602 "traceId ... not found"），
        不是 404 —— 调用方需把这种 400 当作"查无此笔"处理，而非签名/请求错误。
        """
        return self.request("GET", f"/transactions/{trace_id}")

    def get_deposit_by_tx_hash(self, tx_hash: str) -> Any:
        """按链上 txHash 查入金。未匹配到时返回 null（2xx + body=null，非 404）。"""
        return self.request("GET", f"/deposit/{tx_hash}")

    def min_confirmations(self, chain_id: str) -> Optional[int]:
        """某链的最小确认数（到账判定阈值），取自 GET /supported_chains 的 minBlockConfirmation。

        到账监听用法：sandbox 不提供自助 webhook 注册端点（/webhooks 等 /v1 路径均 404），
        故监听走轮询——轮询 list_transactions / get_deposit_by_tx_hash，确认数 >= 本值即视为
        confirmed。实测：Sepolia(11155111)=5、Tron Nile(tron:nile)=19。
        找不到该 chain 返回 None。注：会拉全量 supported_chains，高频轮询时调用方应缓存。
        """
        chains = self.supported_chains()
        clist = chains.get("supportedChainList", []) if isinstance(chains, dict) else []
        for ch in clist:
            if ch.get("chainID") == chain_id:
                v = ch.get("minBlockConfirmation")
                return int(v) if v is not None else None
        return None

    # -- 写端点（均对 sandbox 实测通过）--
    def create_deposit_address(
        self,
        vault_id: str,
        chain_id: str,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        """为指定 vault + 链生成入金地址。

        已对 sandbox 实测（200）：
          - 请求体仅需 chainId（取自 GET /supported_chains 的 chainID）；asset/network/label
            等字段不需要、也不被采用（传了被忽略）。
          - 返回 {"chainId": ..., "address": ...}。
          - 地址按「vault×链」固定：同一 (vault_id, chain_id) 重复调用返回同一地址，
            与 Hex Trust「稳定币地址固定不变、非 single-use」口径一致。
          - 地址是链级而非资产级：一个 EVM 地址即可收该链上全部 ERC-20（USDT/USDC/…），
            具体到账资产由发送方所用 token 合约决定。
        chain_id 示例（sandbox testnet）：Sepolia=`11155111`、Tron Nile=`tron:nile`。
        """
        return self.request(
            "POST",
            f"/vaults/{vault_id}/address",
            body={"chainId": chain_id},
            idempotency_key=idempotency_key,
        )

    def create_withdrawal(
        self,
        enterprise_id: str,
        ticker: str,
        chain_id: str,
        amount_decimal: str,
        from_address: str,
        to_address: str,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        """发起提现 / 退款（payout）。

        ⚠️ 真实资金动作（托管转账）：本方法只构造并提交请求；是否放行由 Hex Safe 侧
        审批 / quorum（maker-checker）决定，上层必须接好审批与幂等（x-request-id）。

        请求体 6 个必填（已对 sandbox 用 400 校验逐一验证）：
          enterprise_id  → enterpriseId  企业 ID（GET /enterprises 取）
          ticker         → ticker        资产代码，如 "USDT" / "USDC" / "ETH"
          chain_id       → chainId       链 ID（同 supported_chains 的 chainID，如 "11155111"）
          amount_decimal → amountDecimal 金额（十进制字符串，按资产 decimal）
          from_address   → from          源（本 vault 在该链的地址）
          to_address     → to            目的地址（退款场景＝客户此前已验证过的原钱包之一）
        sandbox 实测：6 字段齐全后即脱离 40002 字段校验，因测试 vault 余额为 0 止于业务层
        -32600「Failed to process」——证明请求构造正确；真正放行需 funded vault + 审批，
        故未在 __main__ 自测中执行（自测保持只读 + 幂等地址，不触发资金动作）。
        """
        return self.request(
            "POST",
            "/transactions/withdrawal",
            body={
                "enterpriseId": enterprise_id,
                "ticker": ticker,
                "chainId": chain_id,
                "amountDecimal": amount_decimal,
                "from": from_address,
                "to": to_address,
            },
            idempotency_key=idempotency_key,
        )


if __name__ == "__main__":
    # 自测：列 vault（读路径）+ 在首个 vault 上为 Sepolia 生成入金地址（写路径）。
    # 运行前 export HEXSAFE_API_KEY / HEXSAFE_PRIVATE_KEY_PATH。
    client = HexSafeClient()
    print(f"[hexsafe] base={client.base_url}{client.api_prefix} ttl={client.jwt_ttl}s")
    vaults = client.list_vaults()
    vlist = vaults.get("vaultList", []) if isinstance(vaults, dict) else []
    print(f"[hexsafe] GET /vaults OK — {len(vlist)} vault(s):")
    for v in vlist:
        print(f"  - {v.get('id')}  {v.get('name')}  {v.get('type')}  {v.get('status')}")

    ents = client.list_enterprises()
    elist = ents.get("enterpriseList", []) if isinstance(ents, dict) else []
    print(f"[hexsafe] GET /enterprises OK — {len(elist)} enterprise(s):")
    for e in elist:
        print(f"  - {e.get('id')}  {e.get('displayName')}  ({e.get('baseCurrency')})")

    if vlist:
        vid = vlist[0].get("id")
        # Sepolia testnet（EVM ERC-20 稳定币 rail）；地址固定，重复调用应返回同址。
        a1 = client.create_deposit_address(vid, "11155111")
        a2 = client.create_deposit_address(vid, "11155111")
        same = a1.get("address") == a2.get("address")
        print(f"[hexsafe] POST /vaults/{{id}}/address OK — Sepolia 入金地址: {a1.get('address')}")
        print(f"[hexsafe] 幂等性（同链两次同址）: {'PASS' if same else 'FAIL'}")

        # 到账查询（读路径）：列该 vault 的交易；空 vault 返回空列表属正常。
        txs = client.list_transactions(vault_id=vid)
        tlist = txs.get("transactionList", []) if isinstance(txs, dict) else []
        print(f"[hexsafe] GET /transactions?vaultId OK — {len(tlist)} 笔交易 (paging={txs.get('paging')})")
