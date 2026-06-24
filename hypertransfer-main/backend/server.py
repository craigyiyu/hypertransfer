"""
HyperTransfer 认证后端 (Python / FastAPI) — 服务于 hypertransfer-main React 前端

核心模块:
  注册   : 手机号 + 真实短信 OTP(第一因子) + 姓名/邮箱/密码 -> 绑定 TOTP(第二因子)
  登录   : 两步式 —— ①手机号或邮箱 + 密码 -> 临时 challenge;②TOTP 6 位码 -> 会话
  会话   : 不透明 bearer token(12h),前端存 localStorage

TOTP 绑定会话:注册后 pending_totp 有 10 分钟时限(TOTP_ENROLL_TTL)。超时 confirm 报 410;
  /regenerate-totp 对 pending 用户免短信重签 secret。注意:TOTP 二维码本身静态不刷新
  (secret 长期不变),刷新的只是"绑定会话"——符合主流最佳实践。

短信   : Hypervelocity simpleSend 网关(QA 环境),实测成功为 code=0 / message=SUCCESS
TOTP   : 标准 RFC 6238(SHA1 / 6 位 / 30 秒),兼容所有主流验证器 App

演示/真机体验用途,非完整生产实现(生产化清单见文件底部)。
"""

import base64
import hashlib
import hmac
import io
import json
import os
import secrets
import sqlite3
import shutil
import time
import urllib.parse
import urllib.request
import urllib.error
import uuid
from pathlib import Path
from typing import Any, Optional

import pyotp
import qrcode
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
# DB 路径可由 HT_DB_PATH 覆盖(Docker 部署时指向挂载卷,本地不设则沿用原行为)
DB_PATH = Path(os.environ.get("HT_DB_PATH") or (BASE_DIR / "hypertransfer_auth.db"))


def load_project_env() -> None:
    env_path = BASE_DIR.parent / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_project_env()


def env_list(name: str, default: str) -> "list[str]":
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]

ISSUER = "HyperTransfer"
SESSION_TTL = 60 * 60 * 12        # 会话 12 小时
CHALLENGE_TTL = 5 * 60            # 登录第一步后的 challenge 5 分钟内要完成 TOTP
TOTP_ENROLL_TTL = 10 * 60         # 注册后绑定 TOTP 的会话时限:10 分钟内须完成,否则 secret 作废
PBKDF2_ITERS = 200_000
TOTP_VALID_WINDOW = 1

# 短信 OTP
SMS_API_URL = os.environ.get("SMS_API_URL", "https://hv-test.hypervelocity.cn/api/sms/simpleSend")
SMS_SIGN_CN = os.environ.get("SMS_SIGN_CN", "【武汉极数信息技术】")
SMS_SIGN_INTL = os.environ.get("SMS_SIGN_INTL", "[Hypervelocity]")
OTP_TTL = 5 * 60
OTP_RESEND_COOLDOWN = 60
OTP_MAX_PER_DAY = 10
OTP_MAX_VERIFY = 5

RECOVERY_CODE_COUNT = 10          # 每次生成的一次性恢复码数量
RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去掉易混字符 0/O/1/I

# Sumsub provider integration. Secrets must come from env / GitHub Secrets only.
SUMSUB_BASE_URL = os.environ.get("SUMSUB_BASE_URL", "https://api.sumsub.com").rstrip("/")
SUMSUB_APP_TOKEN = os.environ.get("SUMSUB_APP_TOKEN", "").strip()
SUMSUB_SECRET_KEY = os.environ.get("SUMSUB_SECRET_KEY", "").strip()
SUMSUB_KYC_LEVEL_NAME = os.environ.get("SUMSUB_KYC_LEVEL_NAME", "basic-kyc-level").strip()
SUMSUB_TR_LEVEL_NAME = os.environ.get("SUMSUB_TR_LEVEL_NAME", "travel-rule-basic").strip()
SUMSUB_ENVIRONMENT = os.environ.get("SUMSUB_ENVIRONMENT", "sandbox").strip()
SUMSUB_WEBSDK_TTL = int(os.environ.get("SUMSUB_WEBSDK_TTL", "600"))
SUMSUB_WEBHOOK_SECRET_KEY = os.environ.get("SUMSUB_WEBHOOK_SECRET_KEY", "").strip()
SUMSUB_WEBSDK_SCRIPT_URL = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js"
DEMO_LOCAL_SESSION_TOKEN = "demo-local-session"

# RBAC（PR①：先在现有 phone 体系上加角色，user_id 主键重建留 PR② 与邀请制一起做）
STAFF_ROLES = {"rm", "marketing", "compliance", "ops", "custodian", "admin"}
HT_ADMIN_EMAIL = os.environ.get("HT_ADMIN_EMAIL", "").strip().lower()
HT_ADMIN_PASSWORD = os.environ.get("HT_ADMIN_PASSWORD", "")

app = FastAPI(title="HyperTransfer Auth API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=env_list("HT_ALLOWED_ORIGINS", "*"),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# 数据层 (SQLite, 仅演示)
# --------------------------------------------------------------------------- #
def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# PR②-1: users 主键由 phone 重建为 id(uuid)。email/phone 均为可空唯一属性,
# 所有关联表外键 phone→user_id。新库直接建 user_id 形态;旧库(phone PK)在
# init_db 里一次性迁移(备份→建新表→拷数据生成 uuid→换映射迁关联表→校验行数→改名)。
NEW_SCHEMA_SQL = """
    CREATE TABLE IF NOT EXISTS users (
        id              TEXT PRIMARY KEY,        -- uuid: 所有关联表外键锚点
        phone           TEXT UNIQUE,             -- 可空唯一: 客户找回/step-up; 员工可空
        area_code       TEXT,
        number          TEXT,
        name            TEXT NOT NULL,
        email           TEXT UNIQUE,             -- 可空唯一
        pw_hash         TEXT NOT NULL,
        pw_salt         TEXT NOT NULL,
        totp_secret     TEXT NOT NULL,           -- PR②-1 仍强制 2FA(可选化留 PR③)
        status          TEXT NOT NULL,
        user_type       TEXT NOT NULL DEFAULT 'patron',
        last_counter    INTEGER,
        totp_expires_at INTEGER,
        created_at      INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS challenges (
        challenge   TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        tries       INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS otps (
        phone       TEXT PRIMARY KEY,
        code        TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        sent_at     INTEGER NOT NULL,
        tries       INTEGER NOT NULL DEFAULT 0,
        day_count   INTEGER NOT NULL DEFAULT 1,
        day_start   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recovery_codes (
        user_id   TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        used      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, code_hash)
    );
    CREATE TABLE IF NOT EXISTS user_roles (
        user_id TEXT NOT NULL,
        role    TEXT NOT NULL,
        PRIMARY KEY (user_id, role)
    );
    CREATE TABLE IF NOT EXISTS sumsub_kyc_applications (
        user_id           TEXT PRIMARY KEY,
        external_user_id  TEXT NOT NULL UNIQUE,
        applicant_id      TEXT,
        level_name        TEXT NOT NULL,
        status            TEXT NOT NULL,
        review_status     TEXT,
        review_answer     TEXT,
        rejection_reason  TEXT,
        fixed_info_json   TEXT,
        applicant_json    TEXT,
        last_webhook_json TEXT,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sumsub_kyc_applicant_id
        ON sumsub_kyc_applications(applicant_id);
    CREATE TABLE IF NOT EXISTS sumsub_webhook_events (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        applicant_id     TEXT,
        external_user_id TEXT,
        event_type       TEXT,
        review_status    TEXT,
        review_answer    TEXT,
        payload_json     TEXT NOT NULL,
        signature_valid  INTEGER,
        received_at      INTEGER NOT NULL
    );
"""

# otps 表的 PK 始终是 phone(短信仍按手机号发码/限频),不随主键重建而变;
# 注:仅当 OTP_IDENTIFIER 泛化(Email OTP)时才动它,那是 PR②-2 的事。


def _users_is_legacy_schema(conn: sqlite3.Connection) -> bool:
    """旧结构判定: users 表存在、有 phone 列、且没有 id 列(phone 当主键)。"""
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if not cols:
        return False  # 表不存在 → 新库,直接按新 schema 建
    return "id" not in cols and "phone" in cols


def migrate_users_to_user_id(conn: sqlite3.Connection) -> None:
    """把旧的 phone-主键 users 及关联表一次性重建为 user_id 形态。

    在单事务内: 建新表 users(id PK) → 为每个旧用户生成 uuid → 拷数据 →
    用 phone→id 映射迁 sessions/challenges/recovery_codes/user_roles/
    sumsub_kyc_applications → 校验行数一致 → DROP 旧表 → RENAME。
    调用方负责在调用前备份 DB 文件。"""
    old_users = conn.execute("SELECT * FROM users").fetchall()
    old_user_cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()}

    def col(row: sqlite3.Row, name: str, default: Any = None) -> Any:
        return row[name] if name in old_user_cols else default

    phone_to_id: dict[str, str] = {}
    legacy_count = len(old_users)

    # 全程手动管理事务:Python sqlite3 默认模式下 executescript() 会隐式 COMMIT,
    # 破坏手动 BEGIN..COMMIT;故切到 autocommit(isolation_level=None)并逐条 execute,
    # 用显式 BEGIN/COMMIT/ROLLBACK 把整段重建包成单事务(SQLite DDL 支持事务回滚)。
    prev_isolation = conn.isolation_level
    conn.isolation_level = None
    create_new_tables = [
        """CREATE TABLE users_new (
               id TEXT PRIMARY KEY, phone TEXT UNIQUE, area_code TEXT, number TEXT,
               name TEXT NOT NULL, email TEXT UNIQUE, pw_hash TEXT NOT NULL,
               pw_salt TEXT NOT NULL, totp_secret TEXT NOT NULL, status TEXT NOT NULL,
               user_type TEXT NOT NULL DEFAULT 'patron', last_counter INTEGER,
               totp_expires_at INTEGER, created_at INTEGER NOT NULL)""",
        """CREATE TABLE sessions_new (
               token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)""",
        """CREATE TABLE challenges_new (
               challenge TEXT PRIMARY KEY, user_id TEXT NOT NULL,
               expires_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0)""",
        """CREATE TABLE recovery_codes_new (
               user_id TEXT NOT NULL, code_hash TEXT NOT NULL,
               used INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, code_hash))""",
        """CREATE TABLE user_roles_new (
               user_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (user_id, role))""",
        """CREATE TABLE sumsub_kyc_applications_new (
               user_id TEXT PRIMARY KEY, external_user_id TEXT NOT NULL UNIQUE,
               applicant_id TEXT, level_name TEXT NOT NULL, status TEXT NOT NULL,
               review_status TEXT, review_answer TEXT, rejection_reason TEXT,
               fixed_info_json TEXT, applicant_json TEXT, last_webhook_json TEXT,
               created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)""",
    ]
    finalize_stmts = [
        "DROP TABLE users",
        "DROP TABLE sessions",
        "DROP TABLE challenges",
        "DROP TABLE recovery_codes",
        "DROP TABLE IF EXISTS user_roles",
        "DROP TABLE IF EXISTS sumsub_kyc_applications",
        "ALTER TABLE users_new RENAME TO users",
        "ALTER TABLE sessions_new RENAME TO sessions",
        "ALTER TABLE challenges_new RENAME TO challenges",
        "ALTER TABLE recovery_codes_new RENAME TO recovery_codes",
        "ALTER TABLE user_roles_new RENAME TO user_roles",
        "ALTER TABLE sumsub_kyc_applications_new RENAME TO sumsub_kyc_applications",
        "CREATE INDEX IF NOT EXISTS idx_sumsub_kyc_applicant_id "
        "ON sumsub_kyc_applications(applicant_id)",
    ]
    conn.execute("BEGIN")
    try:
        # 1) 建新形态的表(临时名 *_new),逐张拷贝。
        for stmt in create_new_tables:
            conn.execute(stmt)

        # 2) users: 每行生成 uuid,保留 email/phone/area_code/number/name/pw_*/totp_*/status/user_type/created_at。
        for u in old_users:
            phone = u["phone"]
            uid = str(uuid.uuid4())
            phone_to_id[phone] = uid
            email = col(u, "email")
            email = email if email else None  # 空串归一为 NULL,贴合 UNIQUE 约束
            conn.execute(
                """INSERT INTO users_new(
                       id, phone, area_code, number, name, email, pw_hash, pw_salt,
                       totp_secret, status, user_type, last_counter, totp_expires_at, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    uid,
                    phone,
                    col(u, "area_code", ""),
                    col(u, "number", ""),
                    col(u, "name", ""),
                    email,
                    col(u, "pw_hash"),
                    col(u, "pw_salt"),
                    col(u, "totp_secret"),
                    col(u, "status"),
                    col(u, "user_type", "patron"),
                    col(u, "last_counter"),
                    col(u, "totp_expires_at"),
                    col(u, "created_at", int(time.time())),
                ),
            )

        # 3) 关联表: 用 phone→id 映射换算。映射缺失(孤儿行)的直接丢弃,避免脏外键。
        for s in conn.execute("SELECT token, phone, expires_at FROM sessions").fetchall():
            uid = phone_to_id.get(s["phone"])
            if uid:
                conn.execute("INSERT INTO sessions_new(token, user_id, expires_at) VALUES (?,?,?)",
                             (s["token"], uid, s["expires_at"]))
        for c in conn.execute("SELECT challenge, phone, expires_at, tries FROM challenges").fetchall():
            uid = phone_to_id.get(c["phone"])
            if uid:
                conn.execute(
                    "INSERT INTO challenges_new(challenge, user_id, expires_at, tries) VALUES (?,?,?,?)",
                    (c["challenge"], uid, c["expires_at"], c["tries"]))
        for r in conn.execute("SELECT phone, code_hash, used FROM recovery_codes").fetchall():
            uid = phone_to_id.get(r["phone"])
            if uid:
                conn.execute(
                    "INSERT INTO recovery_codes_new(user_id, code_hash, used) VALUES (?,?,?)",
                    (uid, r["code_hash"], r["used"]))
        # user_roles 旧表可能不存在(更早的库)
        if conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_roles'").fetchone():
            for r in conn.execute("SELECT phone, role FROM user_roles").fetchall():
                uid = phone_to_id.get(r["phone"])
                if uid:
                    conn.execute("INSERT OR IGNORE INTO user_roles_new(user_id, role) VALUES (?,?)",
                                 (uid, r["role"]))
        if conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sumsub_kyc_applications'"
        ).fetchone():
            for k in conn.execute("SELECT * FROM sumsub_kyc_applications").fetchall():
                uid = phone_to_id.get(k["phone"])
                if uid:
                    conn.execute(
                        """INSERT INTO sumsub_kyc_applications_new(
                               user_id, external_user_id, applicant_id, level_name, status,
                               review_status, review_answer, rejection_reason, fixed_info_json,
                               applicant_json, last_webhook_json, created_at, updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (uid, k["external_user_id"], k["applicant_id"], k["level_name"], k["status"],
                         k["review_status"], k["review_answer"], k["rejection_reason"], k["fixed_info_json"],
                         k["applicant_json"], k["last_webhook_json"], k["created_at"], k["updated_at"]))

        # 4) 校验: 新 users 行数必须与旧表一致(uuid 不丢用户)。
        new_count = conn.execute("SELECT COUNT(*) c FROM users_new").fetchone()["c"]
        if new_count != legacy_count:
            raise RuntimeError(
                f"users migration row count mismatch: legacy={legacy_count} new={new_count}")

        # 5) DROP 旧表 → RENAME 新表。sumsub_webhook_events 无 phone 外键,不动。
        for stmt in finalize_stmts:
            conn.execute(stmt)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.isolation_level = prev_isolation
    print(f"[migrate] users phone→user_id rebuild done: {legacy_count} users migrated")


def init_db() -> None:
    needs_migration = DB_PATH.exists()
    with db() as conn:
        if needs_migration and _users_is_legacy_schema(conn):
            # 迁移前先把 DB 文件复制一份 .bak(可回滚)。
            bak = DB_PATH.with_suffix(DB_PATH.suffix + ".bak")
            shutil.copy2(DB_PATH, bak)
            print(f"[migrate] legacy users schema detected; backup written to {bak}")
            migrate_users_to_user_id(conn)
        # 新库 / 已迁移库: 幂等建表(IF NOT EXISTS)。
        conn.executescript(NEW_SCHEMA_SQL)


# --------------------------------------------------------------------------- #
# 密码哈希 (PBKDF2)
# --------------------------------------------------------------------------- #
def hash_password(password: str, salt: Optional[bytes] = None) -> "tuple[str, str]":
    if salt is None:
        salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERS)
    return base64.b64encode(dk).decode(), base64.b64encode(salt).decode()


def verify_password(password: str, pw_hash_b64: str, salt_b64: str) -> bool:
    salt = base64.b64decode(salt_b64)
    expected = base64.b64decode(pw_hash_b64)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERS)
    return hmac.compare_digest(dk, expected)


# --------------------------------------------------------------------------- #
# 手机号规范化
# --------------------------------------------------------------------------- #
def normalize_phone(area_code: str, number: str) -> "tuple[str, str, str]":
    area = (area_code or "").strip().lstrip("+")
    area = area.lstrip("0") or area
    num = "".join(ch for ch in (number or "") if ch.isdigit())
    if not area or not num:
        raise HTTPException(status_code=400, detail="手机号或区号无效")
    return area, num, area + num


# --------------------------------------------------------------------------- #
# 短信网关 — Hypervelocity simpleSend
# --------------------------------------------------------------------------- #
def send_sms(area_code: str, number: str, text: str) -> str:
    sign = SMS_SIGN_CN if area_code == "86" else SMS_SIGN_INTL
    payload = json.dumps(
        {"areaCode": area_code, "phoneNumber": number, "textMessage": text, "sign": sign}
    ).encode()
    req = urllib.request.Request(
        SMS_API_URL, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"短信网关 HTTP {e.code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"短信网关不可达: {e}")
    code = str(body.get("code", "")).strip()
    msg = str(body.get("message", "")).strip()
    if code in ("0", "200") or msg.lower() == "success":
        return str(body.get("data", ""))
    raise HTTPException(status_code=502, detail=f"短信发送失败: {msg or body}")


# --------------------------------------------------------------------------- #
# Sumsub provider adapter
# --------------------------------------------------------------------------- #
def sumsub_configured() -> bool:
    return bool(SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY)


def json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def sumsub_public_config() -> dict[str, Any]:
    return {
        "configured": sumsub_configured(),
        "environment": SUMSUB_ENVIRONMENT,
        "baseUrl": SUMSUB_BASE_URL,
        "kycLevelName": SUMSUB_KYC_LEVEL_NAME,
        "travelRuleLevelName": SUMSUB_TR_LEVEL_NAME,
        "webSdkTtlInSecs": SUMSUB_WEBSDK_TTL,
        "webSdkScriptUrl": SUMSUB_WEBSDK_SCRIPT_URL,
        "webhookVerificationConfigured": bool(SUMSUB_WEBHOOK_SECRET_KEY),
        "capabilities": [
            "KYC WebSDK 2.0",
            "Liveness / face match",
            "AML screening",
            "Questionnaires",
            "Device Intelligence",
            "Transaction Monitoring",
            "Travel Rule",
            "Crypto Monitoring",
            "Case Management",
            "KYB",
        ],
    }


def sumsub_headers(method: str, path_with_query: str, body: bytes = b"") -> dict[str, str]:
    ts = str(int(time.time()))
    signed = ts.encode() + method.upper().encode() + path_with_query.encode() + body
    signature = hmac.new(SUMSUB_SECRET_KEY.encode(), signed, hashlib.sha256).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-App-Token": SUMSUB_APP_TOKEN,
        "X-App-Access-Ts": ts,
        "X-App-Access-Sig": signature,
    }


def sumsub_request(
    method: str,
    path_with_query: str,
    payload: Optional[dict[str, Any]] = None,
    allow_statuses: Optional[set[int]] = None,
) -> Any:
    if not sumsub_configured():
        raise HTTPException(
            status_code=503,
            detail="Sumsub is not configured. Set SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY on the backend.",
        )
    body = (
        json_dumps(payload).encode()
        if payload is not None
        else b""
    )
    req = urllib.request.Request(
        SUMSUB_BASE_URL + path_with_query,
        data=body if payload is not None else None,
        headers=sumsub_headers(method, path_with_query, body),
        method=method.upper(),
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        if allow_statuses and e.code in allow_statuses:
            try:
                body_json = json.loads(raw) if raw else {}
            except Exception:
                body_json = {"raw": raw}
            body_json["_http_status"] = e.code
            return body_json
        try:
            body_json = json.loads(raw)
            detail = body_json.get("description") or body_json.get("message") or raw
        except Exception:
            detail = raw or f"HTTP {e.code}"
        raise HTTPException(status_code=502, detail=f"Sumsub API rejected request ({e.code}): {detail}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sumsub API is unreachable: {e}")


def sumsub_user_id(user: sqlite3.Row, suffix: str = "") -> str:
    # phone 在迁移后仍保留,沿用 phone 派生以维持已有 Sumsub applicant 关联稳定;
    # 无 phone 的账户(员工/纯邮箱)回退用 user_id(本身就是稳定唯一标识)。
    anchor = user["phone"] if user["phone"] else user["id"]
    digest = hashlib.sha256(anchor.encode()).hexdigest()[:16]
    return f"ht-{digest}{suffix}"


COUNTRY_ALPHA3 = {
    "hk": "HKG",
    "cn": "CHN",
    "sg": "SGP",
    "jp": "JPN",
    "kr": "KOR",
    "us": "USA",
    "gb": "GBR",
    "au": "AUS",
}


ID_DOC_TYPE_MAP = {
    "passport": "PASSPORT",
    "national_id": "ID_CARD",
    "drivers": "DRIVERS",
}


def sumsub_fixed_info_from_kyc(user: sqlite3.Row, body: "SumsubKycStartIn") -> dict[str, Any]:
    fixed_info: dict[str, Any] = {
        "phone": f"+{user['area_code']}{user['number']}",
    }
    if user["email"]:
        fixed_info["email"] = user["email"]
    if body.dob:
        fixed_info["dob"] = body.dob
    country = COUNTRY_ALPHA3.get(body.nationality)
    if country:
        fixed_info["nationality"] = country
        fixed_info["country"] = country
    if body.address or body.city or country:
        fixed_info["addresses"] = [
            {
                "street": body.address.strip() if body.address else "",
                "town": body.city.strip() if body.city else "",
                "country": country or "",
            }
        ]
    return {k: v for k, v in fixed_info.items() if v not in ("", None, [])}


def sumsub_local_status_from_review(review_status: str, review_answer: str, event_type: str = "") -> str:
    event = event_type.lower()
    status = (review_status or "").lower()
    answer = (review_answer or "").upper()
    if answer == "GREEN":
        return "approved"
    if answer == "RED":
        return "rejected"
    if "onhold" in event or status == "onhold":
        return "pending"
    if "pending" in event or status in {"pending", "queued", "init", "prechecked"}:
        return "pending"
    if "reviewed" in event and not answer:
        return "pending"
    return "not_started" if not status and not event_type else "pending"


def sumsub_review_from_payload(payload: dict[str, Any]) -> dict[str, str]:
    review = payload.get("review") if isinstance(payload.get("review"), dict) else {}
    review_result = payload.get("reviewResult") if isinstance(payload.get("reviewResult"), dict) else {}
    if not review_result and isinstance(review.get("reviewResult"), dict):
        review_result = review["reviewResult"]
    review_status = str(payload.get("reviewStatus") or review.get("reviewStatus") or "")
    review_answer = str(review_result.get("reviewAnswer") or payload.get("reviewAnswer") or "")
    rejection_reason = str(
        review_result.get("moderationComment")
        or review_result.get("clientComment")
        or payload.get("rejectionReason")
        or ""
    )
    return {
        "reviewStatus": review_status,
        "reviewAnswer": review_answer,
        "rejectionReason": rejection_reason,
        "status": sumsub_local_status_from_review(review_status, review_answer, str(payload.get("type") or "")),
    }


def sumsub_upsert_kyc(
    user_id: str,
    external_user_id: str,
    level_name: str,
    applicant_id: Optional[str] = None,
    status: str = "pending",
    review_status: str = "",
    review_answer: str = "",
    rejection_reason: str = "",
    fixed_info: Optional[dict[str, Any]] = None,
    applicant: Optional[dict[str, Any]] = None,
    webhook_payload: Optional[dict[str, Any]] = None,
) -> None:
    now = int(time.time())
    with db() as conn:
        conn.execute(
            """
            INSERT INTO sumsub_kyc_applications(
                user_id, external_user_id, applicant_id, level_name, status,
                review_status, review_answer, rejection_reason, fixed_info_json,
                applicant_json, last_webhook_json, created_at, updated_at
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET
                external_user_id=excluded.external_user_id,
                applicant_id=COALESCE(excluded.applicant_id, sumsub_kyc_applications.applicant_id),
                level_name=excluded.level_name,
                status=excluded.status,
                review_status=excluded.review_status,
                review_answer=excluded.review_answer,
                rejection_reason=excluded.rejection_reason,
                fixed_info_json=COALESCE(excluded.fixed_info_json, sumsub_kyc_applications.fixed_info_json),
                applicant_json=COALESCE(excluded.applicant_json, sumsub_kyc_applications.applicant_json),
                last_webhook_json=COALESCE(excluded.last_webhook_json, sumsub_kyc_applications.last_webhook_json),
                updated_at=excluded.updated_at
            """,
            (
                user_id,
                external_user_id,
                applicant_id,
                level_name,
                status,
                review_status,
                review_answer,
                rejection_reason,
                json_dumps(fixed_info) if fixed_info is not None else None,
                json_dumps(applicant) if applicant is not None else None,
                json_dumps(webhook_payload) if webhook_payload is not None else None,
                now,
                now,
            ),
        )


def sumsub_get_local_kyc(user_id: str) -> Optional[sqlite3.Row]:
    with db() as conn:
        return conn.execute(
            "SELECT * FROM sumsub_kyc_applications WHERE user_id=?", (user_id,)
        ).fetchone()


def sumsub_fetch_applicant_by_external_user_id(external_user_id: str) -> Optional[dict[str, Any]]:
    quoted = urllib.parse.quote(external_user_id, safe="")
    result = sumsub_request("GET", f"/resources/applicants/-;externalUserId={quoted}/one", allow_statuses={404})
    if isinstance(result, dict) and result.get("_http_status") == 404:
        return None
    return result


def sumsub_create_applicant(
    user: sqlite3.Row,
    external_user_id: str,
    level_name: str,
    fixed_info: dict[str, Any],
) -> dict[str, Any]:
    path = f"/resources/applicants?levelName={urllib.parse.quote(level_name, safe='')}"
    payload = {
        "externalUserId": external_user_id,
        "type": "individual",
        "fixedInfo": fixed_info,
        "metadata": [
            {"key": "product", "value": "HyperTransfer"},
            {"key": "environment", "value": SUMSUB_ENVIRONMENT},
        ],
    }
    if user["email"]:
        payload["email"] = user["email"]
    return sumsub_request("POST", path, payload)


def sumsub_patch_fixed_info(applicant_id: str, fixed_info: dict[str, Any]) -> dict[str, Any]:
    return sumsub_request("PATCH", f"/resources/applicants/{applicant_id}/fixedInfo", fixed_info)


def sumsub_get_review_status(applicant_id: str) -> dict[str, Any]:
    return sumsub_request("GET", f"/resources/applicants/{applicant_id}/status")


def sumsub_ensure_applicant(user: sqlite3.Row, level_name: str, fixed_info: dict[str, Any]) -> dict[str, Any]:
    external_user_id = sumsub_user_id(user)
    local = sumsub_get_local_kyc(user["id"])
    applicant: Optional[dict[str, Any]] = None
    applicant_id = local["applicant_id"] if local and local["applicant_id"] else None

    if not applicant_id:
        applicant = sumsub_fetch_applicant_by_external_user_id(external_user_id)
        applicant_id = applicant.get("id") if applicant else None

    if not applicant_id:
        applicant = sumsub_create_applicant(user, external_user_id, level_name, fixed_info)
        applicant_id = applicant.get("id")

    if not applicant_id:
        raise HTTPException(status_code=502, detail="Sumsub did not return an applicant id.")

    patched_fixed_info = sumsub_patch_fixed_info(applicant_id, fixed_info) if fixed_info else None
    if applicant is None:
        applicant = sumsub_request("GET", f"/resources/applicants/{applicant_id}/one")
    review = sumsub_review_from_payload(applicant)
    sumsub_upsert_kyc(
        user_id=user["id"],
        external_user_id=external_user_id,
        applicant_id=applicant_id,
        level_name=level_name,
        status=review["status"] if review["status"] != "not_started" else "pending",
        review_status=review["reviewStatus"] or "init",
        review_answer=review["reviewAnswer"],
        rejection_reason=review["rejectionReason"],
        fixed_info=patched_fixed_info or fixed_info,
        applicant=applicant,
    )
    return {
        "externalUserId": external_user_id,
        "applicantId": applicant_id,
        "review": review,
        "applicant": applicant,
        "fixedInfo": patched_fixed_info or fixed_info,
    }


def sumsub_access_token_payload(
    user: sqlite3.Row,
    level_name: Optional[str],
    ttl_in_secs: Optional[int],
    user_id_suffix: str = "",
) -> dict[str, Any]:
    phone = f"+{user['area_code']}{user['number']}"
    identifiers: dict[str, str] = {"phone": phone}
    if user["email"]:
        identifiers["email"] = user["email"]
    return {
        "applicantIdentifiers": identifiers,
        "ttlInSecs": ttl_in_secs or SUMSUB_WEBSDK_TTL,
        "userId": sumsub_user_id(user, user_id_suffix),
        "levelName": level_name or SUMSUB_KYC_LEVEL_NAME,
    }


# --------------------------------------------------------------------------- #
# OTP 生成 / 限频 / 校验
# --------------------------------------------------------------------------- #
def issue_otp(phone: str, area_code: str, number: str) -> None:
    now = int(time.time())
    code = f"{secrets.randbelow(1_000_000):06d}"
    with db() as conn:
        row = conn.execute("SELECT * FROM otps WHERE phone=?", (phone,)).fetchone()
        if row:
            if now - row["sent_at"] < OTP_RESEND_COOLDOWN:
                wait = OTP_RESEND_COOLDOWN - (now - row["sent_at"])
                raise HTTPException(status_code=429, detail=f"请 {wait} 秒后再获取验证码")
            day_start, day_count = row["day_start"], row["day_count"]
            if now - day_start >= 86400:
                day_start, day_count = now, 0
            if day_count >= OTP_MAX_PER_DAY:
                raise HTTPException(status_code=429, detail="今日验证码发送次数已达上限")
            day_count += 1
        else:
            day_start, day_count = now, 1

    send_sms(area_code, number,
             f"您的 HyperTransfer 验证码是 {code}，{OTP_TTL // 60} 分钟内有效，请勿向他人泄露。")

    with db() as conn:
        conn.execute(
            """
            INSERT INTO otps(phone, code, expires_at, sent_at, tries, day_count, day_start)
            VALUES (?,?,?,?,0,?,?)
            ON CONFLICT(phone) DO UPDATE SET
                code=excluded.code, expires_at=excluded.expires_at, sent_at=excluded.sent_at,
                tries=0, day_count=excluded.day_count, day_start=excluded.day_start
            """,
            (phone, code, now + OTP_TTL, now, day_count, day_start),
        )


def verify_otp(phone: str, code: str) -> None:
    code = (code or "").strip()
    now = int(time.time())
    with db() as conn:
        row = conn.execute("SELECT * FROM otps WHERE phone=?", (phone,)).fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="请先获取短信验证码")
        if now > row["expires_at"]:
            raise HTTPException(status_code=400, detail="验证码已过期, 请重新获取")
        if row["tries"] >= OTP_MAX_VERIFY:
            raise HTTPException(status_code=429, detail="验证码错误次数过多, 请重新获取")
        if not hmac.compare_digest(row["code"], code):
            conn.execute("UPDATE otps SET tries=tries+1 WHERE phone=?", (phone,))
            raise HTTPException(status_code=400, detail="短信验证码错误")
        conn.execute("DELETE FROM otps WHERE phone=?", (phone,))


# --------------------------------------------------------------------------- #
# 恢复码 (备用码) — 一次性,sha256 存储
# --------------------------------------------------------------------------- #
def _recovery_hash(code: str) -> str:
    norm = code.upper().replace("-", "").replace(" ", "")
    return hashlib.sha256(norm.encode()).hexdigest()


def generate_recovery_codes(user_id: str) -> "list[str]":
    """为用户重置并生成一组一次性恢复码;返回明文(仅此一次可见),库里只存哈希。"""
    codes, seen = [], set()
    while len(codes) < RECOVERY_CODE_COUNT:
        raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(10))
        pretty = f"{raw[:5]}-{raw[5:]}"   # 展示为 ABCDE-FGHJK
        if pretty in seen:
            continue
        seen.add(pretty)
        codes.append(pretty)
    with db() as conn:
        conn.execute("DELETE FROM recovery_codes WHERE user_id=?", (user_id,))
        conn.executemany(
            "INSERT INTO recovery_codes(user_id, code_hash, used) VALUES (?,?,0)",
            [(user_id, _recovery_hash(c)) for c in codes],
        )
    return codes


def consume_recovery_code(user_id: str, code: str) -> bool:
    """校验并消费一个未使用的恢复码;成功返回 True。"""
    h = _recovery_hash(code)
    with db() as conn:
        row = conn.execute(
            "SELECT used FROM recovery_codes WHERE user_id=? AND code_hash=?", (user_id, h)
        ).fetchone()
        if not row or row["used"]:
            return False
        conn.execute(
            "UPDATE recovery_codes SET used=1 WHERE user_id=? AND code_hash=?", (user_id, h)
        )
    return True


# --------------------------------------------------------------------------- #
# TOTP 校验 (防重放)
# --------------------------------------------------------------------------- #
def verify_totp(secret: str, code: str, last_counter: Optional[int]) -> Optional[int]:
    code = (code or "").strip().replace(" ", "")
    if not (code.isdigit() and len(code) == 6):
        return None
    totp = pyotp.TOTP(secret)
    now = int(time.time())
    base = now // 30
    for offset in range(-TOTP_VALID_WINDOW, TOTP_VALID_WINDOW + 1):
        counter = base + offset
        if last_counter is not None and counter <= last_counter:
            continue
        if hmac.compare_digest(totp.at(now + offset * 30), code):
            return counter
    return None


# --------------------------------------------------------------------------- #
# 会话 / challenge
# --------------------------------------------------------------------------- #
def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    with db() as conn:
        conn.execute("INSERT INTO sessions(token, user_id, expires_at) VALUES (?,?,?)",
                     (token, user_id, int(time.time()) + SESSION_TTL))
    return token


def create_challenge(user_id: str) -> str:
    ch = secrets.token_urlsafe(24)
    with db() as conn:
        conn.execute("INSERT INTO challenges(challenge, user_id, expires_at, tries) VALUES (?,?,?,0)",
                     (ch, user_id, int(time.time()) + CHALLENGE_TTL))
    return ch


def user_public(user) -> dict:
    keys = user.keys()
    user_type = user["user_type"] if "user_type" in keys else "patron"
    area = user["area_code"] if "area_code" in keys else ""
    number = user["number"] if "number" in keys else ""
    phone_label = f"+{area} {number}".strip() if (area or number) else ""
    return {
        "phone": phone_label if phone_label != "+" else "",
        "name": user["name"],
        "email": user["email"] or "",
        "status": user["status"],
        "userType": user_type,
        "roles": get_user_roles(user["id"]),
    }


def user_from_token(authorization: Optional[str]) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    token = authorization[len("Bearer "):]
    if token == DEMO_LOCAL_SESSION_TOKEN and SUMSUB_ENVIRONMENT != "production":
        return {
            "id": "demo-user-id",
            "phone": "85298765432",
            "area_code": "852",
            "number": "98765432",
            "name": "Demo User",
            "email": "demo.user@hypercrypto.com",
            "status": "active",
            "user_type": "patron",
        }
    with db() as conn:
        sess = conn.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if not sess or sess["expires_at"] < int(time.time()):
            raise HTTPException(status_code=401, detail="会话已过期, 请重新登录")
        user = conn.execute("SELECT * FROM users WHERE id=?", (sess["user_id"],)).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


# --------------------------------------------------------------------------- #
# RBAC (PR①: 角色 + 端点级守卫)
# --------------------------------------------------------------------------- #
def get_user_roles(user_id: str) -> "list[str]":
    with db() as conn:
        rows = conn.execute("SELECT role FROM user_roles WHERE user_id=?", (user_id,)).fetchall()
    return [r["role"] for r in rows]


def require_role(*allowed: str):
    """FastAPI 依赖工厂: 要求当前用户至少具备 allowed 中的一个角色 (admin 全通)。
    前端守卫只是 UX; 真正防越权靠这里的服务端校验。"""
    def dep(authorization: Optional[str] = Header(default=None)) -> Any:
        user = user_from_token(authorization)
        roles = set(get_user_roles(user["id"]))
        if "admin" in roles or (set(allowed) & roles):
            return user
        raise HTTPException(status_code=403, detail="无权访问该资源")
    return dep


def seed_staff_admin() -> None:
    """用 env 种子一个 staff admin 账号 (决策 6)。首登改密 + 强制 2FA 留 PR③。
    PR②-1: 用 uuid 主键,phone 留空(员工可空唯一)。"""
    if not (HT_ADMIN_EMAIL and HT_ADMIN_PASSWORD):
        return
    now = int(time.time())
    with db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email=?", (HT_ADMIN_EMAIL,)).fetchone()
        if existing:
            conn.execute("INSERT OR IGNORE INTO user_roles(user_id, role) VALUES (?, 'admin')",
                         (existing["id"],))
            return
        pw_hash, pw_salt = hash_password(HT_ADMIN_PASSWORD)
        uid = str(uuid.uuid4())
        secret = pyotp.random_base32()
        conn.execute(
            """INSERT INTO users(id, phone, area_code, number, name, email, pw_hash, pw_salt,
                                 totp_secret, status, last_counter, totp_expires_at, created_at, user_type)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'staff')""",
            (uid, None, "", "", "Administrator", HT_ADMIN_EMAIL, pw_hash, pw_salt,
             secret, "active", None, None, now),
        )
        conn.execute("INSERT INTO user_roles(user_id, role) VALUES (?, 'admin')", (uid,))
        print(f"[seed] staff admin created: {HT_ADMIN_EMAIL} (dev TOTP secret: {secret})")


# --------------------------------------------------------------------------- #
# 请求模型
# --------------------------------------------------------------------------- #
class SendOtpIn(BaseModel):
    areaCode: str = Field(default="86")
    phoneNumber: str = Field(min_length=4, max_length=20)


class RegisterIn(BaseModel):
    areaCode: str = Field(default="86")
    phoneNumber: str
    otp: str
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(default="", max_length=120)
    password: str = Field(min_length=8, max_length=128)


class ConfirmIn(BaseModel):
    areaCode: str = Field(default="86")
    phoneNumber: str
    code: str


class RegenerateIn(BaseModel):
    areaCode: str = Field(default="86")
    phoneNumber: str


class PwdResetStartIn(BaseModel):
    areaCode: str = Field(default="86")
    phoneNumber: str = Field(min_length=4, max_length=20)


class PwdResetIn(BaseModel):
    areaCode: str = Field(default="86")
    phoneNumber: str
    otp: str
    newPassword: str = Field(min_length=8, max_length=128)


class LoginStartIn(BaseModel):
    method: str = Field(default="mobile")   # mobile | email
    areaCode: str = Field(default="86")
    phoneNumber: str = Field(default="")
    email: str = Field(default="")
    password: str


class LoginVerifyIn(BaseModel):
    challenge: str
    code: str


class LoginRecoveryIn(BaseModel):
    challenge: str
    recoveryCode: str


class SumsubAccessTokenIn(BaseModel):
    levelName: str = Field(default="")
    ttlInSecs: Optional[int] = Field(default=None, ge=60, le=3600)


class SumsubKycStartIn(BaseModel):
    nationality: str = Field(default="", max_length=8)
    dob: str = Field(default="", max_length=10)
    idType: str = Field(default="", max_length=32)
    idNumber: str = Field(default="", max_length=80)
    address: str = Field(default="", max_length=240)
    city: str = Field(default="", max_length=80)
    levelName: str = Field(default="")
    ttlInSecs: Optional[int] = Field(default=None, ge=60, le=3600)
    apiOnly: bool = Field(default=False)


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
@app.post("/api/send-otp")
def send_otp(body: SendOtpIn):
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    with db() as conn:
        u = conn.execute("SELECT status FROM users WHERE phone=?", (phone,)).fetchone()
    if u and u["status"] == "active":
        raise HTTPException(status_code=409, detail="该手机号已注册, 请直接登录")
    issue_otp(phone, area, num)
    return {"ok": True, "phone": phone, "cooldown": OTP_RESEND_COOLDOWN}


@app.post("/api/register")
def register(body: RegisterIn):
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    email = body.email.strip().lower()

    # 重复注册检查 —— 放在校验短信码之前:已注册账户直接拦死,不消费验证码。
    with db() as conn:
        existing = conn.execute("SELECT status FROM users WHERE phone=?", (phone,)).fetchone()
        if existing and existing["status"] == "active":
            raise HTTPException(status_code=409, detail="该手机号已注册, 请直接登录")
        if email:
            # 邮箱被【其他手机号】占用即拒绝(含 active 与 pending_totp),避免一邮箱多账户
            dup = conn.execute(
                "SELECT status FROM users WHERE email=? AND phone<>?", (email, phone)
            ).fetchone()
            if dup:
                raise HTTPException(status_code=409, detail="该邮箱已被注册, 请更换或直接登录")

    verify_otp(phone, body.otp)  # 第一因子: 手机号已验真(校验通过即消费验证码)

    secret = pyotp.random_base32()
    pw_hash, pw_salt = hash_password(body.password)
    now = int(time.time())
    expires_at = now + TOTP_ENROLL_TTL
    with db() as conn:
        # 二次确认(并发安全):走到这里若已变 active 仍拦
        existing = conn.execute("SELECT status FROM users WHERE phone=?", (phone,)).fetchone()
        if existing and existing["status"] == "active":
            raise HTTPException(status_code=409, detail="该手机号已注册, 请直接登录")
        # phone 现为唯一属性而非主键:ON CONFLICT(phone) 复用旧行(保留其 id),
        # 新行才生成 uuid。email 空串归一为 NULL,贴合 UNIQUE 约束。
        new_id = str(uuid.uuid4())
        email_value = email or None
        conn.execute(
            """
            INSERT INTO users(id, phone, area_code, number, name, email, pw_hash, pw_salt,
                              totp_secret, status, last_counter, totp_expires_at, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(phone) DO UPDATE SET
                area_code=excluded.area_code, number=excluded.number, name=excluded.name,
                email=excluded.email, pw_hash=excluded.pw_hash, pw_salt=excluded.pw_salt,
                totp_secret=excluded.totp_secret, status='pending_totp', last_counter=NULL,
                totp_expires_at=excluded.totp_expires_at
            """,
            (new_id, phone, area, num, body.name.strip(), email_value, pw_hash, pw_salt,
             secret, "pending_totp", None, expires_at, now),
        )

    label = email or f"+{area} {num}"
    otpauth = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name=ISSUER)
    return {
        "phone": phone,
        "otpauth_uri": otpauth,
        "secret": secret,
        "qr_png_base64": qr_data_uri(otpauth),
        "expires_at": expires_at,
        "expires_in": TOTP_ENROLL_TTL,
    }


@app.post("/api/confirm-totp")
def confirm_totp(body: ConfirmIn):
    _, _, phone = normalize_phone(body.areaCode, body.phoneNumber)
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="请先注册")
        if user["status"] == "pending_totp":
            exp = user["totp_expires_at"]
            if exp is not None and int(time.time()) > exp:
                raise HTTPException(status_code=410, detail="绑定已超时，请返回重新获取二维码")
        counter = verify_totp(user["totp_secret"], body.code, user["last_counter"])
        if counter is None:
            raise HTTPException(status_code=400, detail="验证码错误或已过期")
        conn.execute(
            "UPDATE users SET status='active', last_counter=?, totp_expires_at=NULL WHERE phone=?",
            (counter, phone),
        )
        user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
    recovery_codes = generate_recovery_codes(user["id"])  # 激活即签发,仅此一次明文返回
    token = create_session(user["id"])
    return {"ok": True, "token": token, "user": user_public(user),
            "recovery_codes": recovery_codes}


@app.post("/api/regenerate-totp")
def regenerate_totp(body: RegenerateIn):
    """绑定会话超时后,为 pending_totp 用户免短信重新签发 TOTP secret。
    手机号在注册时已验真(pending 记录即凭据),故无需再次短信。"""
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    now = int(time.time())
    expires_at = now + TOTP_ENROLL_TTL
    secret = pyotp.random_base32()
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="请先注册")
        if user["status"] == "active":
            raise HTTPException(status_code=409, detail="该账户已激活, 请直接登录")
        conn.execute(
            "UPDATE users SET totp_secret=?, totp_expires_at=?, last_counter=NULL WHERE phone=?",
            (secret, expires_at, phone),
        )
        label = (user["email"] or f"+{area} {num}")
    otpauth = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name=ISSUER)
    return {
        "phone": phone,
        "otpauth_uri": otpauth,
        "secret": secret,
        "qr_png_base64": qr_data_uri(otpauth),
        "expires_at": expires_at,
        "expires_in": TOTP_ENROLL_TTL,
    }


@app.post("/api/password/send-otp")
def password_send_otp(body: PwdResetStartIn):
    """忘记密码:向已注册手机号发送重置验证码。
    为防账号枚举,无论手机号是否存在都返回 ok;仅对 active 用户真正发短信。"""
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    with db() as conn:
        u = conn.execute("SELECT status FROM users WHERE phone=?", (phone,)).fetchone()
    if u and u["status"] == "active":
        issue_otp(phone, area, num)
    return {"ok": True, "cooldown": OTP_RESEND_COOLDOWN}


@app.post("/api/password/reset")
def password_reset(body: PwdResetIn):
    """校验短信码后重置密码,并失效该用户的所有现存会话(强制重新登录)。
    TOTP 第二因子不变 —— 重置密码不等于绕过 2FA。"""
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        if not user or user["status"] != "active":
            raise HTTPException(status_code=404, detail="该手机号未注册")
    user_id = user["id"]
    verify_otp(phone, body.otp)  # 短信验证码校验(失败/过期会抛错)
    pw_hash, pw_salt = hash_password(body.newPassword)
    with db() as conn:
        conn.execute("UPDATE users SET pw_hash=?, pw_salt=? WHERE id=?",
                     (pw_hash, pw_salt, user_id))
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))  # 安全:踢掉所有旧会话
    return {"ok": True}


@app.post("/api/login/start")
def login_start(body: LoginStartIn):
    with db() as conn:
        if body.method == "email" or (body.email and not body.phoneNumber):
            email = body.email.strip().lower()
            user = conn.execute(
                "SELECT * FROM users WHERE email=? AND status='active'", (email,)
            ).fetchone()
        else:
            _, _, phone = normalize_phone(body.areaCode, body.phoneNumber)
            user = conn.execute(
                "SELECT * FROM users WHERE phone=? AND status='active'", (phone,)
            ).fetchone()
    generic = HTTPException(status_code=401, detail="账号或密码有误")
    if not user or not verify_password(body.password, user["pw_hash"], user["pw_salt"]):
        raise generic
    challenge = create_challenge(user["id"])
    return {"ok": True, "challenge": challenge, "next": "totp"}


@app.post("/api/login/verify")
def login_verify(body: LoginVerifyIn):
    now = int(time.time())
    with db() as conn:
        ch = conn.execute("SELECT * FROM challenges WHERE challenge=?", (body.challenge,)).fetchone()
        if not ch or ch["expires_at"] < now:
            raise HTTPException(status_code=401, detail="登录会话已过期, 请重新登录")
        if ch["tries"] >= OTP_MAX_VERIFY:
            conn.execute("DELETE FROM challenges WHERE challenge=?", (body.challenge,))
            raise HTTPException(status_code=429, detail="验证码错误次数过多, 请重新登录")
        user = conn.execute("SELECT * FROM users WHERE id=?", (ch["user_id"],)).fetchone()
        counter = verify_totp(user["totp_secret"], body.code, user["last_counter"]) if user else None
        if counter is None:
            conn.execute("UPDATE challenges SET tries=tries+1 WHERE challenge=?", (body.challenge,))
            raise HTTPException(status_code=400, detail="验证码错误或已过期")
        conn.execute("UPDATE users SET last_counter=? WHERE id=?", (counter, ch["user_id"]))
        conn.execute("DELETE FROM challenges WHERE challenge=?", (body.challenge,))
        user = conn.execute("SELECT * FROM users WHERE id=?", (ch["user_id"],)).fetchone()
    token = create_session(user["id"])
    return {"ok": True, "token": token, "user": user_public(user)}


@app.post("/api/login/recovery")
def login_recovery(body: LoginRecoveryIn):
    """用一次性恢复码替代 TOTP 完成登录第二步(手机丢失场景)。"""
    now = int(time.time())
    with db() as conn:
        ch = conn.execute("SELECT * FROM challenges WHERE challenge=?", (body.challenge,)).fetchone()
        if not ch or ch["expires_at"] < now:
            raise HTTPException(status_code=401, detail="登录会话已过期, 请重新登录")
        if ch["tries"] >= OTP_MAX_VERIFY:
            conn.execute("DELETE FROM challenges WHERE challenge=?", (body.challenge,))
            raise HTTPException(status_code=429, detail="尝试次数过多, 请重新登录")
        user_id = ch["user_id"]
    if not consume_recovery_code(user_id, body.recoveryCode):
        with db() as conn:
            conn.execute("UPDATE challenges SET tries=tries+1 WHERE challenge=?", (body.challenge,))
        raise HTTPException(status_code=400, detail="恢复码无效或已被使用")
    with db() as conn:
        conn.execute("DELETE FROM challenges WHERE challenge=?", (body.challenge,))
        user = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        remaining = conn.execute(
            "SELECT COUNT(*) c FROM recovery_codes WHERE user_id=? AND used=0", (user_id,)
        ).fetchone()["c"]
    token = create_session(user_id)
    return {"ok": True, "token": token, "user": user_public(user),
            "recovery_remaining": remaining}


@app.get("/api/me")
def me(authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    return {"user": user_public(user)}


@app.get("/api/staff/whoami")
def staff_whoami(user: Any = Depends(require_role(*STAFF_ROLES))):
    """Staff-only 探针：patron 调用返回 403，用于前端后台守卫与未来后台端点的样板。"""
    return {"user": user_public(user)}


@app.post("/api/logout")
def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization[len("Bearer "):]
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    return {"ok": True}


@app.get("/api/sumsub/config")
def sumsub_config():
    return sumsub_public_config()


@app.get("/api/sumsub/health")
def sumsub_health():
    config = sumsub_public_config()
    return {
        "ok": True,
        "provider": "sumsub",
        "configured": config["configured"],
        "environment": config["environment"],
        "baseUrl": config["baseUrl"],
        "kycLevelName": config["kycLevelName"],
        "status": "ready_to_call_sumsub" if config["configured"] else "missing_credentials",
    }


@app.post("/api/sumsub/access-token")
def sumsub_access_token(body: SumsubAccessTokenIn, authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    payload = sumsub_access_token_payload(user, body.levelName or None, body.ttlInSecs)
    result = sumsub_request("POST", "/resources/accessTokens/sdk", payload)
    return {
        "ok": True,
        "provider": "sumsub",
        "environment": SUMSUB_ENVIRONMENT,
        "levelName": payload["levelName"],
        "userId": result.get("userId") or payload["userId"],
        "token": result.get("token"),
        "expiresIn": payload["ttlInSecs"],
    }


def sumsub_kyc_response_from_row(row: Optional[sqlite3.Row]) -> dict[str, Any]:
    if not row:
        return {
            "ok": True,
            "provider": "sumsub",
            "configured": sumsub_configured(),
            "status": "not_started",
            "reviewStatus": "",
            "reviewAnswer": "",
            "rejectionReason": "",
            "externalUserId": "",
            "applicantId": "",
            "levelName": SUMSUB_KYC_LEVEL_NAME,
            "updatedAt": None,
        }
    return {
        "ok": True,
        "provider": "sumsub",
        "configured": sumsub_configured(),
        "status": row["status"],
        "reviewStatus": row["review_status"] or "",
        "reviewAnswer": row["review_answer"] or "",
        "rejectionReason": row["rejection_reason"] or "",
        "externalUserId": row["external_user_id"],
        "applicantId": row["applicant_id"] or "",
        "levelName": row["level_name"],
        "updatedAt": row["updated_at"],
    }


@app.post("/api/sumsub/kyc/start")
def sumsub_kyc_start(body: SumsubKycStartIn, authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    level_name = body.levelName.strip() or SUMSUB_KYC_LEVEL_NAME
    fixed_info = sumsub_fixed_info_from_kyc(user, body)
    applicant_context = sumsub_ensure_applicant(user, level_name, fixed_info)
    token_payload = None
    token_result = {}
    if not body.apiOnly:
        token_payload = sumsub_access_token_payload(user, level_name, body.ttlInSecs)
        token_result = sumsub_request("POST", "/resources/accessTokens/sdk", token_payload)
    return {
        "ok": True,
        "provider": "sumsub",
        "configured": True,
        "environment": SUMSUB_ENVIRONMENT,
        "levelName": level_name,
        "externalUserId": applicant_context["externalUserId"],
        "applicantId": applicant_context["applicantId"],
        "status": applicant_context["review"]["status"] if applicant_context["review"]["status"] != "not_started" else "pending",
        "reviewStatus": applicant_context["review"]["reviewStatus"] or "init",
        "reviewAnswer": applicant_context["review"]["reviewAnswer"],
        "rejectionReason": applicant_context["review"]["rejectionReason"],
        "token": token_result.get("token", ""),
        "expiresIn": token_payload["ttlInSecs"] if token_payload else 0,
        "mode": "api_only" if body.apiOnly else "websdk",
    }


@app.get("/api/sumsub/kyc/status")
def sumsub_kyc_status(authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    row = sumsub_get_local_kyc(user["id"])
    if not row:
        return sumsub_kyc_response_from_row(None)
    applicant_id = row["applicant_id"]
    if sumsub_configured() and applicant_id:
        review_payload = sumsub_get_review_status(applicant_id)
        review = sumsub_review_from_payload(review_payload)
        sumsub_upsert_kyc(
            user_id=user["id"],
            external_user_id=row["external_user_id"],
            applicant_id=applicant_id,
            level_name=row["level_name"],
            status=review["status"],
            review_status=review["reviewStatus"],
            review_answer=review["reviewAnswer"],
            rejection_reason=review["rejectionReason"],
            applicant=review_payload,
        )
        row = sumsub_get_local_kyc(user["id"])
    return sumsub_kyc_response_from_row(row)


@app.post("/api/sumsub/connection-test")
def sumsub_connection_test(body: SumsubAccessTokenIn, authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    payload = sumsub_access_token_payload(
        user,
        body.levelName or SUMSUB_KYC_LEVEL_NAME,
        body.ttlInSecs or 600,
        user_id_suffix="-connection-test",
    )
    result = sumsub_request("POST", "/resources/accessTokens/sdk", payload)
    return {
        "ok": True,
        "provider": "sumsub",
        "connected": bool(result.get("token")),
        "environment": SUMSUB_ENVIRONMENT,
        "levelName": payload["levelName"],
        "userId": result.get("userId") or payload["userId"],
    }


@app.post("/api/webhooks/sumsub")
async def sumsub_webhook(request: Request):
    raw_body = await request.body()
    payload_digest = request.headers.get("x-payload-digest", "")
    payload_digest_alg = request.headers.get("x-payload-digest-alg", "HMAC_SHA256_HEX")
    signature_valid: Optional[bool] = None
    if SUMSUB_WEBHOOK_SECRET_KEY:
        digest_mod = hashlib.sha256
        if payload_digest_alg == "HMAC_SHA512_HEX":
            digest_mod = hashlib.sha512
        elif payload_digest_alg == "HMAC_SHA1_HEX":
            digest_mod = hashlib.sha1
        calculated = hmac.new(SUMSUB_WEBHOOK_SECRET_KEY.encode(), raw_body, digest_mod).hexdigest()
        signature_valid = hmac.compare_digest(calculated, payload_digest)
        if not signature_valid:
            raise HTTPException(status_code=401, detail="Invalid Sumsub webhook signature.")
    try:
        payload = json.loads(raw_body.decode() or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Sumsub webhook payload.")
    event_type = str(payload.get("type") or payload.get("applicantType") or "")
    applicant_id = str(payload.get("applicantId") or payload.get("applicant_id") or "")
    external_user_id = str(payload.get("externalUserId") or payload.get("external_user_id") or "")
    review = sumsub_review_from_payload(payload)
    with db() as conn:
        conn.execute(
            """
            INSERT INTO sumsub_webhook_events(
                applicant_id, external_user_id, event_type, review_status,
                review_answer, payload_json, signature_valid, received_at
            )
            VALUES (?,?,?,?,?,?,?,?)
            """,
            (
                applicant_id,
                external_user_id,
                event_type,
                review["reviewStatus"],
                review["reviewAnswer"],
                json_dumps(payload),
                None if signature_valid is None else int(signature_valid),
                int(time.time()),
            ),
        )
        row = None
        if applicant_id:
            row = conn.execute(
                "SELECT * FROM sumsub_kyc_applications WHERE applicant_id=?",
                (applicant_id,),
            ).fetchone()
        if not row and external_user_id:
            row = conn.execute(
                "SELECT * FROM sumsub_kyc_applications WHERE external_user_id=?",
                (external_user_id,),
            ).fetchone()
        if row:
            conn.execute(
                """
                UPDATE sumsub_kyc_applications
                SET status=?, review_status=?, review_answer=?, rejection_reason=?,
                    last_webhook_json=?, updated_at=?
                WHERE user_id=?
                """,
                (
                    review["status"],
                    review["reviewStatus"],
                    review["reviewAnswer"],
                    review["rejectionReason"],
                    json_dumps(payload),
                    int(time.time()),
                    row["user_id"],
                ),
            )
    return {
        "ok": True,
        "provider": "sumsub",
        "received": True,
        "eventType": event_type,
        "applicantId": applicant_id,
        "externalUserId": external_user_id,
        "reviewStatus": review["reviewStatus"],
        "reviewAnswer": review["reviewAnswer"],
        "status": review["status"],
        "signatureValid": signature_valid,
    }


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "hypertransfer-auth",
        "sumsubConfigured": sumsub_configured(),
    }


# --------------------------------------------------------------------------- #
# 二维码
# --------------------------------------------------------------------------- #
def qr_data_uri(text: str) -> str:
    img = qrcode.make(text)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@app.exception_handler(HTTPException)
def http_exc_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


init_db()
seed_staff_admin()


# 生产化清单 (本演示故意省略):
#  - TOTP 密钥 + OTP 落库前应加密 (KMS / envelope encryption), 当前明文存 SQLite
#  - send-otp 前挂图形/滑块验证码 + 设备指纹 + 风控, 防短信轰炸; 短信网关启用生产白名单
#  - 持久化数据库(PostgreSQL) + 迁移; 会话改 HttpOnly+Secure Cookie 或短期 JWT + refresh
#  - TOTP 恢复码(备用码)与换机/挂失流程; 登录失败锁定与告警
#  - 全站 HTTPS、CSRF、按账号+IP 双维度限流、完整审计日志
#  - 关键动作(入金/改收款/提现)做 step-up 二次验证(重发短信 或 重验 TOTP)
