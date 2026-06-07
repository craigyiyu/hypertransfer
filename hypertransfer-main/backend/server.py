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
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

import pyotp
import qrcode
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
# DB 路径可由 HT_DB_PATH 覆盖(Docker 部署时指向挂载卷,本地不设则沿用原行为)
DB_PATH = Path(os.environ.get("HT_DB_PATH") or (BASE_DIR / "hypertransfer_auth.db"))

ISSUER = "HyperTransfer"
SESSION_TTL = 60 * 60 * 12        # 会话 12 小时
CHALLENGE_TTL = 5 * 60            # 登录第一步后的 challenge 5 分钟内要完成 TOTP
TOTP_ENROLL_TTL = 10 * 60         # 注册后绑定 TOTP 的会话时限:10 分钟内须完成,否则 secret 作废
PBKDF2_ITERS = 200_000
TOTP_VALID_WINDOW = 1

# 短信 OTP
SMS_API_URL = "https://hv-test.hypervelocity.cn/api/sms/simpleSend"
SMS_SIGN_CN = "【武汉极数信息技术】"
SMS_SIGN_INTL = "[Hypervelocity]"
OTP_TTL = 5 * 60
OTP_RESEND_COOLDOWN = 60
OTP_MAX_PER_DAY = 10
OTP_MAX_VERIFY = 5

RECOVERY_CODE_COUNT = 10          # 每次生成的一次性恢复码数量
RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去掉易混字符 0/O/1/I

app = FastAPI(title="HyperTransfer Auth API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                phone           TEXT PRIMARY KEY,
                area_code       TEXT NOT NULL,
                number          TEXT NOT NULL,
                name            TEXT NOT NULL,
                email           TEXT,
                pw_hash         TEXT NOT NULL,
                pw_salt         TEXT NOT NULL,
                totp_secret     TEXT NOT NULL,
                status          TEXT NOT NULL,
                last_counter    INTEGER,
                totp_expires_at INTEGER,
                created_at      INTEGER NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
                ON users(email) WHERE email IS NOT NULL AND email <> '';
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                phone      TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS challenges (
                challenge   TEXT PRIMARY KEY,
                phone       TEXT NOT NULL,
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
                phone     TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                used      INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (phone, code_hash)
            );
            """
        )
        # 轻量迁移:旧库补列(CREATE IF NOT EXISTS 不会给已存在的表加列)
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "totp_expires_at" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN totp_expires_at INTEGER")


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


def generate_recovery_codes(phone: str) -> "list[str]":
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
        conn.execute("DELETE FROM recovery_codes WHERE phone=?", (phone,))
        conn.executemany(
            "INSERT INTO recovery_codes(phone, code_hash, used) VALUES (?,?,0)",
            [(phone, _recovery_hash(c)) for c in codes],
        )
    return codes


def consume_recovery_code(phone: str, code: str) -> bool:
    """校验并消费一个未使用的恢复码;成功返回 True。"""
    h = _recovery_hash(code)
    with db() as conn:
        row = conn.execute(
            "SELECT used FROM recovery_codes WHERE phone=? AND code_hash=?", (phone, h)
        ).fetchone()
        if not row or row["used"]:
            return False
        conn.execute(
            "UPDATE recovery_codes SET used=1 WHERE phone=? AND code_hash=?", (phone, h)
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
def create_session(phone: str) -> str:
    token = secrets.token_urlsafe(32)
    with db() as conn:
        conn.execute("INSERT INTO sessions(token, phone, expires_at) VALUES (?,?,?)",
                     (token, phone, int(time.time()) + SESSION_TTL))
    return token


def create_challenge(phone: str) -> str:
    ch = secrets.token_urlsafe(24)
    with db() as conn:
        conn.execute("INSERT INTO challenges(challenge, phone, expires_at, tries) VALUES (?,?,?,0)",
                     (ch, phone, int(time.time()) + CHALLENGE_TTL))
    return ch


def user_public(user: sqlite3.Row) -> dict:
    return {
        "phone": f"+{user['area_code']} {user['number']}",
        "name": user["name"],
        "email": user["email"] or "",
        "status": user["status"],
    }


def user_from_token(authorization: Optional[str]) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    token = authorization[len("Bearer "):]
    with db() as conn:
        sess = conn.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if not sess or sess["expires_at"] < int(time.time()):
            raise HTTPException(status_code=401, detail="会话已过期, 请重新登录")
        user = conn.execute("SELECT * FROM users WHERE phone=?", (sess["phone"],)).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


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
        conn.execute(
            """
            INSERT INTO users(phone, area_code, number, name, email, pw_hash, pw_salt,
                              totp_secret, status, last_counter, totp_expires_at, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(phone) DO UPDATE SET
                area_code=excluded.area_code, number=excluded.number, name=excluded.name,
                email=excluded.email, pw_hash=excluded.pw_hash, pw_salt=excluded.pw_salt,
                totp_secret=excluded.totp_secret, status='pending_totp', last_counter=NULL,
                totp_expires_at=excluded.totp_expires_at
            """,
            (phone, area, num, body.name.strip(), email, pw_hash, pw_salt,
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
    recovery_codes = generate_recovery_codes(phone)  # 激活即签发,仅此一次明文返回
    token = create_session(phone)
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
    verify_otp(phone, body.otp)  # 短信验证码校验(失败/过期会抛错)
    pw_hash, pw_salt = hash_password(body.newPassword)
    with db() as conn:
        conn.execute("UPDATE users SET pw_hash=?, pw_salt=? WHERE phone=?",
                     (pw_hash, pw_salt, phone))
        conn.execute("DELETE FROM sessions WHERE phone=?", (phone,))  # 安全:踢掉所有旧会话
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
    challenge = create_challenge(user["phone"])
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
        user = conn.execute("SELECT * FROM users WHERE phone=?", (ch["phone"],)).fetchone()
        counter = verify_totp(user["totp_secret"], body.code, user["last_counter"]) if user else None
        if counter is None:
            conn.execute("UPDATE challenges SET tries=tries+1 WHERE challenge=?", (body.challenge,))
            raise HTTPException(status_code=400, detail="验证码错误或已过期")
        conn.execute("UPDATE users SET last_counter=? WHERE phone=?", (counter, ch["phone"]))
        conn.execute("DELETE FROM challenges WHERE challenge=?", (body.challenge,))
        user = conn.execute("SELECT * FROM users WHERE phone=?", (ch["phone"],)).fetchone()
    token = create_session(user["phone"])
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
        phone = ch["phone"]
    if not consume_recovery_code(phone, body.recoveryCode):
        with db() as conn:
            conn.execute("UPDATE challenges SET tries=tries+1 WHERE challenge=?", (body.challenge,))
        raise HTTPException(status_code=400, detail="恢复码无效或已被使用")
    with db() as conn:
        conn.execute("DELETE FROM challenges WHERE challenge=?", (body.challenge,))
        user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        remaining = conn.execute(
            "SELECT COUNT(*) c FROM recovery_codes WHERE phone=? AND used=0", (phone,)
        ).fetchone()["c"]
    token = create_session(phone)
    return {"ok": True, "token": token, "user": user_public(user),
            "recovery_remaining": remaining}


@app.get("/api/me")
def me(authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    return {"user": user_public(user)}


@app.post("/api/logout")
def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization[len("Bearer "):]
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    return {"ok": True}


@app.get("/api/health")
def health():
    return {"ok": True, "service": "hypertransfer-auth"}


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


# 生产化清单 (本演示故意省略):
#  - TOTP 密钥 + OTP 落库前应加密 (KMS / envelope encryption), 当前明文存 SQLite
#  - send-otp 前挂图形/滑块验证码 + 设备指纹 + 风控, 防短信轰炸; 短信网关启用生产白名单
#  - 持久化数据库(PostgreSQL) + 迁移; 会话改 HttpOnly+Secure Cookie 或短期 JWT + refresh
#  - TOTP 恢复码(备用码)与换机/挂失流程; 登录失败锁定与告警
#  - 全站 HTTPS、CSRF、按账号+IP 双维度限流、完整审计日志
#  - 关键动作(入金/改收款/提现)做 step-up 二次验证(重发短信 或 重验 TOTP)
