"""
HyperTransfer 注册 / 登录 + 双因子 MFA 演示后端 (Python / FastAPI)

身份模型 (贴近真实 crypto 入金产品):
  第一因子: 手机号 + 短信 OTP (真实短信, 走 Hypervelocity simpleSend 网关)
  第二因子: TOTP 验证器 App (标准 RFC 6238, SHA1/6位/30秒, 全主流 App 兼容)
  另含: 登录密码 (something you know)

注册链路: 手机号 -> 收真实短信码 -> 校验 + 设密码 -> 绑定 TOTP -> 完成
登录链路: 手机号 + 密码 + TOTP 6 位码

仅用于演示与真机体验, 不是生产实现 (见文件底部 "生产化清单")。
"""

import base64
import hashlib
import hmac
import io
import json
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
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "auth_demo.db"
STATIC_DIR = BASE_DIR / "static"

ISSUER = "HyperTransfer"          # 显示在验证器 App 里的发行方名称
SESSION_TTL = 60 * 60 * 12        # 会话 12 小时
PBKDF2_ITERS = 200_000
TOTP_VALID_WINDOW = 1             # 允许前后各 1 个 30s 窗口, 容忍时钟漂移

# 短信 OTP (第一因子)
SMS_API_URL = "https://hv-test.hypervelocity.cn/api/sms/simpleSend"  # QA 环境
SMS_SIGN_CN = "【武汉极数信息技术】"   # 大陆号码签名
SMS_SIGN_INTL = "[Hypervelocity]"     # 国际号码签名
OTP_TTL = 5 * 60                  # 短信验证码 5 分钟有效
OTP_RESEND_COOLDOWN = 60          # 同号 60 秒只能发一次
OTP_MAX_PER_DAY = 10              # 同号每日发送上限
OTP_MAX_VERIFY = 5                # 同一码最多试错次数

app = FastAPI(title="HyperTransfer Auth Demo")


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
                phone         TEXT PRIMARY KEY,
                area_code     TEXT NOT NULL,
                number        TEXT NOT NULL,
                pw_hash       TEXT NOT NULL,
                pw_salt       TEXT NOT NULL,
                totp_secret   TEXT NOT NULL,
                status        TEXT NOT NULL,
                last_counter  INTEGER,
                created_at    INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                phone      TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS otps (
                phone       TEXT PRIMARY KEY,
                code        TEXT NOT NULL,
                purpose     TEXT NOT NULL,
                expires_at  INTEGER NOT NULL,
                sent_at     INTEGER NOT NULL,
                tries       INTEGER NOT NULL DEFAULT 0,
                day_count   INTEGER NOT NULL DEFAULT 1,
                day_start   INTEGER NOT NULL
            );
            """
        )


# --------------------------------------------------------------------------- #
# 密码哈希 (PBKDF2, 标准库)
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
# 短信网关 (第一因子) — Hypervelocity simpleSend
# --------------------------------------------------------------------------- #
def send_sms(area_code: str, number: str, text: str) -> str:
    """调用 simpleSend, 成功返回 msgid, 失败抛 HTTPException。"""
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
    # 文档写 code=200, 实测返回 code=0 + message=SUCCESS -> 两者都接受
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
            day_start = row["day_start"]
            day_count = row["day_count"]
            if now - day_start >= 86400:
                day_start, day_count = now, 0
            if day_count >= OTP_MAX_PER_DAY:
                raise HTTPException(status_code=429, detail="今日验证码发送次数已达上限")
            day_count += 1
        else:
            day_start, day_count = now, 1

    # 先发短信, 发成功再落库 (避免库里记了码但用户没收到)
    send_sms(area_code, number,
             f"您的 HyperTransfer 验证码是 {code}，{OTP_TTL // 60} 分钟内有效，请勿向他人泄露。")

    with db() as conn:
        conn.execute(
            """
            INSERT INTO otps(phone, code, purpose, expires_at, sent_at, tries, day_count, day_start)
            VALUES (?,?,?,?,?,0,?,?)
            ON CONFLICT(phone) DO UPDATE SET
                code=excluded.code, purpose=excluded.purpose, expires_at=excluded.expires_at,
                sent_at=excluded.sent_at, tries=0,
                day_count=excluded.day_count, day_start=excluded.day_start
            """,
            (phone, code, "register", now + OTP_TTL, now, day_count, day_start),
        )


def verify_otp(phone: str, code: str) -> bool:
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
            raise HTTPException(status_code=400, detail="验证码错误")
        conn.execute("DELETE FROM otps WHERE phone=?", (phone,))  # 通过即作废, 防重用
    return True


# --------------------------------------------------------------------------- #
# TOTP 校验 (含防重放: 同一个 30s 窗口的码只接受一次)
# --------------------------------------------------------------------------- #
def verify_totp(secret: str, code: str, last_counter: Optional[int]) -> Optional[int]:
    code = (code or "").strip().replace(" ", "")
    if not (code.isdigit() and len(code) == 6):
        return None
    totp = pyotp.TOTP(secret)  # 默认 SHA1 / 6 位 / 30s -> 全主流 App 兼容
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
# 会话
# --------------------------------------------------------------------------- #
def create_session(phone: str) -> str:
    token = secrets.token_urlsafe(32)
    with db() as conn:
        conn.execute(
            "INSERT INTO sessions(token, phone, expires_at) VALUES (?,?,?)",
            (token, phone, int(time.time()) + SESSION_TTL),
        )
    return token


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
    password: str = Field(min_length=8, max_length=128)


class ConfirmIn(BaseModel):
    areaCode: str = Field(default="86")
    phoneNumber: str
    code: str


class LoginIn(BaseModel):
    areaCode: str = Field(default="86")
    phoneNumber: str
    password: str
    code: str


# --------------------------------------------------------------------------- #
# API — 第一因子: 手机号 + 短信 OTP
# --------------------------------------------------------------------------- #
@app.post("/api/send-otp")
def send_otp(body: SendOtpIn):
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    with db() as conn:
        u = conn.execute("SELECT status FROM users WHERE phone=?", (phone,)).fetchone()
    if u and u["status"] == "active":
        raise HTTPException(status_code=409, detail="该手机号已注册, 请直接登录")
    issue_otp(phone, area, num)
    return {"ok": True, "phone": phone, "cooldown": OTP_RESEND_COOLDOWN,
            "next": "请输入收到的短信验证码并设置登录密码"}


@app.post("/api/register")
def register(body: RegisterIn):
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="密码至少 8 位")
    verify_otp(phone, body.otp)  # 第一因子通过 (手机号已验真)

    secret = pyotp.random_base32()
    pw_hash, pw_salt = hash_password(body.password)
    with db() as conn:
        existing = conn.execute("SELECT status FROM users WHERE phone=?", (phone,)).fetchone()
        if existing and existing["status"] == "active":
            raise HTTPException(status_code=409, detail="该手机号已注册")
        conn.execute(
            """
            INSERT INTO users(phone, area_code, number, pw_hash, pw_salt, totp_secret,
                              status, last_counter, created_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(phone) DO UPDATE SET
                area_code=excluded.area_code, number=excluded.number,
                pw_hash=excluded.pw_hash, pw_salt=excluded.pw_salt,
                totp_secret=excluded.totp_secret, status='pending_totp', last_counter=NULL
            """,
            (phone, area, num, pw_hash, pw_salt, secret, "pending_totp", None, int(time.time())),
        )

    label = f"+{area} {num}"
    otpauth = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name=ISSUER)
    return {
        "phone": phone,
        "otpauth_uri": otpauth,
        "secret": secret,
        "qr_png_base64": qr_data_uri(otpauth),
        "next": "在验证器 App 添加后, 输入当前 6 位码完成绑定",
    }


@app.post("/api/confirm-totp")
def confirm_totp(body: ConfirmIn):
    _, _, phone = normalize_phone(body.areaCode, body.phoneNumber)
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="请先注册")
        counter = verify_totp(user["totp_secret"], body.code, user["last_counter"])
        if counter is None:
            raise HTTPException(status_code=400, detail="验证码错误或已过期")
        conn.execute(
            "UPDATE users SET status='active', last_counter=? WHERE phone=?", (counter, phone)
        )
    token = create_session(phone)
    return {"ok": True, "token": token, "phone": phone}


@app.post("/api/login")
def login(body: LoginIn):
    _, _, phone = normalize_phone(body.areaCode, body.phoneNumber)
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
    generic = HTTPException(status_code=401, detail="手机号 / 密码 / 验证码有误")  # 不泄露具体哪步
    if not user or user["status"] != "active":
        raise generic
    if not verify_password(body.password, user["pw_hash"], user["pw_salt"]):
        raise generic
    counter = verify_totp(user["totp_secret"], body.code, user["last_counter"])
    if counter is None:
        raise generic
    with db() as conn:
        conn.execute("UPDATE users SET last_counter=? WHERE phone=?", (counter, phone))
    token = create_session(phone)
    return {"ok": True, "token": token, "phone": phone}


@app.get("/api/me")
def me(authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    return {"phone": f"+{user['area_code']} {user['number']}", "status": user["status"]}


@app.post("/api/logout")
def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization[len("Bearer "):]
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    return {"ok": True}


# --------------------------------------------------------------------------- #
# 二维码生成
# --------------------------------------------------------------------------- #
def qr_data_uri(text: str) -> str:
    img = qrcode.make(text)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# --------------------------------------------------------------------------- #
# 前端页面
# --------------------------------------------------------------------------- #
@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.exception_handler(HTTPException)
def http_exc_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


init_db()


# 生产化清单 (本演示故意省略):
#  - TOTP 密钥 + OTP 落库前应加密 (KMS / envelope encryption), 当前明文存 SQLite
#  - send-otp 之前挂图形验证码 + 更强风控, 防短信轰炸; 短信网关启用生产白名单
#  - 引入持久化数据库 + 迁移; 会话用 HttpOnly Cookie 或短期 JWT + 刷新
#  - 提供 TOTP 恢复码 (备用码) 与换机/挂失流程
#  - 全站 HTTPS、CSRF、按账号+IP 双维度限流、审计日志
#  - 关键动作 (入金/改收款/提现) 做 step-up 二次验证 (再发一次短信 或 重验 TOTP)
