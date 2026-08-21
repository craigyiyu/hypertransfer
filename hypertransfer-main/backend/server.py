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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import pyotp
import qrcode
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from hexsafe_client import HexSafeClient, HexSafeError  # 本地模块: Hex Safe 托管客户端

# Host-led VIP admission (2026-08-21): 纯状态机 + Host 可见 KYC 原因策略 + provider 边界。
from admission_provider_adapters import (
    HostProvisioningUnavailable,
    hash_session_token,
    require_host_provisioning,
    verify_session_token,
)
from admission_rules import can_transition_admission, host_kyc_reason
from transaction_compliance_rules import kyc_valid_until

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
KYC_VALIDITY_SECS = 180 * 24 * 60 * 60   # PR③: KYC(Sumsub) 有效期 6 个月(最终流程 v1);到期硬阻断须重跑
STEPUP_TTL = 5 * 60               # PR③: 资金动作 step-up 二次验证有效期(前端据此判定是否需重验)
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

# Email OTP（邀请注册第一因子）。决策为 mock/console 占位:默认仅 console 打印,
# 不连真实 SMTP/SES/SendGrid。SMTP_* 预留但未实现真实发送,留待生产接入。
EMAIL_FROM = os.environ.get("EMAIL_FROM", "no-reply@hypercypto.com")
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")

# 邀请制（PR②-2）
INVITE_TTL = 6 * 60 * 60          # 邀请链接 single-use + 6 小时有效（2026-07 口径；过期由 RM 重发）
INVITE_RESEND_COOLDOWN = 30       # 邀请邮件重发最小间隔(秒)——防邮件轰炸/SMTP 滥用
INVITE_BASE_URL = (os.environ.get("HT_INVITE_BASE_URL") or os.environ.get("INVITE_BASE_URL", "")).strip()  # 邀请落地 URL 前缀(两种 env 名都认)

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
DEMO_STAFF_SESSION_TOKEN = "demo-local-staff-session"   # 后台 demo 会话: 合成 admin(全权限), 仅非 production

# 演示旁路: HT_DEMO_BYPASS_2FA=true 时, /login/verify 接受任意 6 位码(免去演示现场取 TOTP)。
# ⚠️ 仅非生产生效——production 下即便置 true 也被忽略, 强制真实校验, 杜绝沦为认证旁路。
DEMO_BYPASS_2FA = (
    os.environ.get("HT_DEMO_BYPASS_2FA", "").strip().lower() in ("1", "true", "yes")
    and SUMSUB_ENVIRONMENT != "production"
)

# RBAC（PR①：先在现有 phone 体系上加角色，user_id 主键重建留 PR② 与邀请制一起做）
# host/leader 为 Host-led VIP admission (2026-08-21) 新增 staff 角色, 与 legacy 角色并存。
STAFF_ROLES = {"rm", "marketing", "compliance", "ops", "custodian", "admin", "host", "leader"}
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
        totp_secret     TEXT NOT NULL,           -- secret 始终生成(备用); 是否启用看 totp_enabled
        totp_enabled    INTEGER NOT NULL DEFAULT 1, -- PR③: 2FA 可选。1=已启用(默认/兼容旧 active 账户),0=已跳过
        status          TEXT NOT NULL,
        user_type       TEXT NOT NULL DEFAULT 'patron',
        last_counter    INTEGER,
        totp_expires_at INTEGER,
        invited_by      TEXT,                    -- PR②-2: 邀请该客户的 RM user_id(自助注册为空)
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
        approved_at       INTEGER,                 -- PR③: KYC 首次通过(GREEN)的时间
        valid_until       INTEGER,                 -- PR③: approved_at + 6 个月; 到期硬阻断
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
    -- PR②-2: 邀请制准入。RM 提交 → Marketing 审核 → 签发单次/6h link → 客户消费。
    CREATE TABLE IF NOT EXISTS invitations (
        id            TEXT PRIMARY KEY,           -- uuid
        patron_email  TEXT NOT NULL,
        patron_name   TEXT,
        details_json  TEXT,                       -- RM 提交的客户资料(自由 JSON)
        token         TEXT UNIQUE,                -- 签发后才有: secrets.token_urlsafe, single-use
        status        TEXT NOT NULL,              -- submitted/approved/rejected/issued/consumed/expired/revoked
        expires_at    INTEGER,                    -- 签发时 = now + 6h
        created_by    TEXT NOT NULL,              -- RM user_id
        reviewed_by   TEXT,                       -- marketing user_id
        consumed_by   TEXT,                       -- 注册成功后的客户 user_id
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);
    CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(patron_email);
    -- PR②-2: 关键动作审计留痕(谁在何时对什么做了什么)。
    CREATE TABLE IF NOT EXISTS audit_trail (
        id            TEXT PRIMARY KEY,           -- uuid
        actor_user_id TEXT,                       -- 操作者 user_id(系统动作可空)
        action        TEXT NOT NULL,              -- e.g. invitation.create / invitation.issue / staff.create
        target_type   TEXT,                       -- e.g. invitation / user
        target_id     TEXT,
        detail_json   TEXT,
        created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_trail(actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_trail(target_type, target_id);
    -- PR②-2: Email OTP 独立表(结构仿 otps; 不改动现有 phone 短信 OTP 表)。
    CREATE TABLE IF NOT EXISTS email_otps (
        identifier  TEXT PRIMARY KEY,             -- 规范化后的 email
        code        TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        sent_at     INTEGER NOT NULL,
        tries       INTEGER NOT NULL DEFAULT 0,
        day_count   INTEGER NOT NULL DEFAULT 1,
        day_start   INTEGER NOT NULL
    );
    -- Hex Safe 写操作幂等: 客户端带相同 idem_key 重发 → 返回缓存的成功响应, 不再调托管方。
    -- 仅缓存成功(2xx)结果; 业务/网络错误不缓存, 允许重试。x-request-id 也用此 key。
    CREATE TABLE IF NOT EXISTS hexsafe_idempotency (
        idem_key      TEXT PRIMARY KEY,
        action        TEXT NOT NULL,              -- e.g. withdrawal
        response_json TEXT NOT NULL,
        created_at    INTEGER NOT NULL
    );
    -- 已验证原钱包: 客户在入金流(wallet screening + 1 USDT 验证)证明过控制权的钱包。
    -- 退款只能退回这里的某一个(process v1: 强制原钱包, 禁止自由输入新地址)。由入金流写入。
    CREATE TABLE IF NOT EXISTS verified_wallets (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        address     TEXT NOT NULL,
        chain_id    TEXT NOT NULL,              -- Hex Safe chainId, 如 11155111 / tron:nile
        asset       TEXT NOT NULL DEFAULT 'USDT',
        method      TEXT,                       -- wallet_screening / 1usdt_verification
        verified_at INTEGER NOT NULL,
        UNIQUE(user_id, address, chain_id)
    );
    CREATE INDEX IF NOT EXISTS idx_vw_user ON verified_wallets(user_id);
    -- 退款单: 目标钱包只能引用 verified_wallets(原钱包), 经 re-KYC + re-KYT + 管理层审批 +
    -- vault 余额校验后由 custodian 经 Hex Safe withdrawal 退回; transfer_id ↔ id(request_id) 留痕。
    CREATE TABLE IF NOT EXISTS refund_requests (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        wallet_id       TEXT NOT NULL,          -- verified_wallets.id(强制原钱包)
        to_address      TEXT NOT NULL,          -- 冗余原钱包地址(来自 verified_wallets, 非自由输入)
        chain_id        TEXT NOT NULL,
        asset           TEXT NOT NULL,
        amount_decimal  TEXT NOT NULL,
        reason          TEXT,
        status          TEXT NOT NULL,          -- requested/kyc_failed/kyt_failed/approval_pending/approved/rejected/insufficient_funds/completed/failed
        kyc_ok          INTEGER,
        kyt_status      TEXT,                   -- pass/manual_review/reject
        approved_by     TEXT,
        transfer_id     TEXT,                   -- Hex Safe withdrawal 返回
        idempotency_key TEXT,
        detail_json     TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_refund_user ON refund_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_refund_status ON refund_requests(status);
    -- 入金编排单(process v1 §B DEPOSIT + SETTLEMENT)。承载 patron 入金的状态机:
    --   created → screening_passed/screening_failed → address_issued → verified
    --           → main_submitted → settled (custodian 确认入 vault / Forex 兑法币)。
    --   'cancelled' 为预留终态(defensive 守卫引用, 暂无端点写入)。
    -- KYC 硬阻断(②)在 create/screen/issue-address 强制(require_kyc); 1 USDT 验证通过即把
    -- source_wallet 写入 verified_wallets(退款①只能退这些原钱包)。地址按 Hex Safe vault×链固定。
    CREATE TABLE IF NOT EXISTS deposit_requests (
        id                 TEXT PRIMARY KEY,        -- DR-YYYYMM-XXXXXXXX
        user_id            TEXT NOT NULL,           -- patron
        asset              TEXT NOT NULL DEFAULT 'USDT',  -- process v1: 仅 USDT
        network            TEXT NOT NULL,           -- 展示用: ethereum / tron
        chain_id           TEXT NOT NULL,           -- Hex Safe chainId: 11155111 / tron:nile
        amount_decimal     TEXT,                    -- 主入金金额(patron 在 main 步骤填)
        source_wallet      TEXT,                    -- patron 来源钱包(screen 步骤填)
        screening_status   TEXT,                    -- pending/pass/edd/fail
        screening_ref      TEXT,
        screening_detail   TEXT,
        travel_rule_required INTEGER NOT NULL DEFAULT 0,
        travel_rule_status TEXT NOT NULL DEFAULT 'not_required',
        deposit_address    TEXT,                    -- Hex Safe vault 在该链的固定地址
        vault_id           TEXT,
        verify_tx_hash     TEXT,                    -- 1 USDT 验证的 txHash
        verify_status      TEXT NOT NULL DEFAULT 'pending',  -- pending/confirmed
        verified_wallet_id TEXT,                    -- 写入 verified_wallets 后的 id
        marker_ref         TEXT,                    -- ⑤ Int'l Marketing 录回的 Marker 外部编号(demo)
        fiat_currency      TEXT,                    -- ④ Forex 结算法币(demo)
        fiat_amount        TEXT,                    -- ④ Forex 结算金额(demo)
        receipt_ref        TEXT,                    -- ⑤ 回执编号(demo)
        status             TEXT NOT NULL,
        detail_json        TEXT,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deposit_user ON deposit_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_deposit_status ON deposit_requests(status);
"""

# Host-led VIP admission + per-transfer compliance aggregates (2026-08-21 design).
# Purely additive: this script is executed on every init_db run with
# CREATE TABLE IF NOT EXISTS, so it never drops, renames, or mutates legacy
# tables (invitations, payment_applications, deposit_requests, ...). The
# original NEW_SCHEMA_SQL above is left untouched so migration tests can build
# the exact branch-tip schema and prove the new tables are additive.
ADMISSION_SCHEMA_SQL = """
    -- Host enterprise profile (provisioned through the staff session boundary;
    -- production Okta OIDC remains a provider boundary, not a browser mock).
    CREATE TABLE IF NOT EXISTS host_profiles (
        user_id         TEXT PRIMARY KEY,
        employee_id     TEXT,
        department      TEXT,
        operating_team  TEXT,
        location        TEXT,
        phone           TEXT,
        status          TEXT NOT NULL CHECK(status IN ('pending','active','disabled')),
        acknowledged_at INTEGER,
        updated_at      INTEGER NOT NULL
    );
    -- One VIP admission case per invitation. Host notes are never exposed to
    -- the VIP or the leader.
    CREATE TABLE IF NOT EXISTS vip_admission_cases (
        id              TEXT PRIMARY KEY,
        host_user_id    TEXT NOT NULL,
        patron_email    TEXT NOT NULL,
        member_reference TEXT,
        service_purpose TEXT,
        host_notes      TEXT,
        preferred_language TEXT,
        route           TEXT NOT NULL,
        patron_user_id  TEXT,
        status          TEXT NOT NULL,
        leader_user_id  TEXT,
        kyc_reason_code TEXT,
        kyc_valid_until INTEGER,
        kyc_document_expiries_json TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admission_case_host
        ON vip_admission_cases(host_user_id);
    CREATE INDEX IF NOT EXISTS idx_admission_case_patron_email
        ON vip_admission_cases(patron_email);
    CREATE INDEX IF NOT EXISTS idx_admission_case_status
        ON vip_admission_cases(status);
    -- Email-link and dynamic-QR presentations of the same open admission case.
    -- Only the salted hash of a session token is stored (never the raw token).
    CREATE TABLE IF NOT EXISTS admission_invitation_sessions (
        id              TEXT PRIMARY KEY,
        admission_case_id TEXT NOT NULL,
        channel         TEXT NOT NULL CHECK(channel IN ('email','qr')),
        token_hash      TEXT NOT NULL UNIQUE,
        expires_at      INTEGER NOT NULL,
        consumed_at     INTEGER,
        revoked_at      INTEGER,
        created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invitation_session_case
        ON admission_invitation_sessions(admission_case_id);
    -- Payment intent: what the VIP intends, later confirmed by an immutable
    -- fingerprint of the actual payment.
    CREATE TABLE IF NOT EXISTS payment_intents (
        id              TEXT PRIMARY KEY,
        admission_case_id TEXT NOT NULL,
        asset           TEXT NOT NULL,
        network         TEXT NOT NULL,
        intended_amount TEXT,
        source_type     TEXT,
        source_identifier TEXT,
        counterparty_name TEXT,
        status          TEXT NOT NULL,
        fingerprint_json TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payment_intent_case
        ON payment_intents(admission_case_id);
    -- Every test (verification) and main transfer gets its own immutable
    -- Transaction Travel Rule Pack. HKD 8,000 switches basic/enhanced field
    -- depth; it never removes the pack. retention_until >= 5 years after
    -- completion (Task 8).
    CREATE TABLE IF NOT EXISTS transaction_compliance_packs (
        id                 TEXT PRIMARY KEY,
        payment_intent_id  TEXT NOT NULL,
        transfer_leg       TEXT NOT NULL CHECK(transfer_leg IN ('verification','main')),
        actual_amount      TEXT NOT NULL,
        actual_hkd_amount  TEXT NOT NULL,
        travel_rule_depth  TEXT NOT NULL CHECK(travel_rule_depth IN ('basic','enhanced')),
        kyt_status         TEXT NOT NULL,
        travel_rule_status TEXT NOT NULL,
        notabene_reference TEXT,
        immutable_snapshot_json TEXT NOT NULL,
        retention_until    INTEGER,
        created_at         INTEGER NOT NULL,
        finalized_at       INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_compliance_pack_intent_leg
        ON transaction_compliance_packs(payment_intent_id, transfer_leg);
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
               totp_expires_at INTEGER, invited_by TEXT, created_at INTEGER NOT NULL)""",
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
        # Host-led VIP admission + per-transfer compliance aggregates (additive).
        conn.executescript(ADMISSION_SCHEMA_SQL)
        # 幂等补列: 旧的已迁移库(PR②-1 形态)缺 invited_by,在此补齐。
        user_cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "invited_by" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN invited_by TEXT")
        if "totp_enabled" not in user_cols:
            # 旧库 active 账户均已强制 2FA → 默认 1(保持其登录仍需 TOTP)
            conn.execute("ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 1")
        kyc_cols = {r["name"] for r in conn.execute(
            "PRAGMA table_info(sumsub_kyc_applications)").fetchall()}
        if "approved_at" not in kyc_cols:
            conn.execute("ALTER TABLE sumsub_kyc_applications ADD COLUMN approved_at INTEGER")
        if "valid_until" not in kyc_cols:
            conn.execute("ALTER TABLE sumsub_kyc_applications ADD COLUMN valid_until INTEGER")
        # Host-led VIP admission: KYC document expiries (earliest relied-on expiry)。
        admission_cols = {r["name"] for r in conn.execute(
            "PRAGMA table_info(vip_admission_cases)").fetchall()}
        if "kyc_document_expiries_json" not in admission_cols:
            conn.execute(
                "ALTER TABLE vip_admission_cases ADD COLUMN kyc_document_expiries_json TEXT")


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
        raise HTTPException(status_code=400, detail="Invalid phone number or area code")
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
        raise HTTPException(status_code=502, detail=f"SMS gateway HTTP {e.code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"SMS gateway unreachable: {e}")
    code = str(body.get("code", "")).strip()
    msg = str(body.get("message", "")).strip()
    if code in ("0", "200") or msg.lower() == "success":
        return str(body.get("data", ""))
    raise HTTPException(status_code=502, detail=f"Failed to send SMS: {msg or body}")


# --------------------------------------------------------------------------- #
# 邮件适配器 — Email OTP / 邀请链接发送（MOCK: 默认 console 打印）
# --------------------------------------------------------------------------- #
def send_email(to: str, subject: str, text: str, html: Optional[str] = None) -> str:
    """邮件发送:配了 SMTP_HOST 走真实 SMTP(支持 text + 可选 html), 否则 console 占位。
    端口 465 → SMTP_SSL; 其余(如 587) → STARTTLS。失败降级 console, 不阻断流程。
    返回投递渠道: "smtp"(真发成功) / "smtp_failed"(尝试真发但异常, 已降级 console) /
    "console"(未配 SMTP)。调用方可据此如实反馈"是否真投递"。tests 可 monkeypatch 本函数抓码。"""
    if SMTP_HOST:
        try:
            import smtplib
            from email.message import EmailMessage

            msg = EmailMessage()
            msg["From"] = EMAIL_FROM
            msg["To"] = to
            msg["Subject"] = subject
            msg.set_content(text)
            if html:
                msg.add_alternative(html, subtype="html")
            if SMTP_PORT == 465:
                smtp_ctx = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20)
            else:
                smtp_ctx = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
            with smtp_ctx as smtp:
                if SMTP_PORT != 465:
                    smtp.starttls()
                if SMTP_USER:
                    smtp.login(SMTP_USER, SMTP_PASSWORD)
                smtp.send_message(msg)
            return "smtp"
        except Exception as e:  # 真实发送失败也不阻断流程——降级到 console
            print(f"[email] SMTP send failed ({e}); falling back to console")
            print(f"[email] to={to} subject={subject!r}\n{text}")
            return "smtp_failed"
    print(f"[email] to={to} subject={subject!r}\n{text}")
    return "console"


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
            detail="Verification provider is not configured. Set provider credentials on the backend.",
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
        raise HTTPException(status_code=502, detail=f"Verification provider API rejected request ({e.code}): {detail}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Verification provider API is unreachable: {e}")


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
    "residence_permit": "RESIDENCE_PERMIT",
}


def sumsub_fixed_info_from_kyc(user: sqlite3.Row, body: "SumsubKycStartIn") -> dict[str, Any]:
    fixed_info: dict[str, Any] = {
        "phone": body.phone.strip() or f"+{user['area_code']}{user['number']}",
    }
    if user["email"]:
        fixed_info["email"] = user["email"]
    if body.firstName:
        fixed_info["firstName"] = body.firstName.strip()
    if body.lastName:
        fixed_info["lastName"] = body.lastName.strip()
    if body.middleName:
        fixed_info["middleName"] = body.middleName.strip()
    if body.dob:
        fixed_info["dob"] = body.dob
    country = COUNTRY_ALPHA3.get(body.nationality)
    if country:
        fixed_info["nationality"] = country
        fixed_info["country"] = country
    address_country = COUNTRY_ALPHA3.get(body.addressCountry) or country
    if body.address or body.city or body.postalCode or address_country:
        fixed_info["addresses"] = [
            {
                "street": body.address.strip() if body.address else "",
                "town": body.city.strip() if body.city else "",
                "postCode": body.postalCode.strip() if body.postalCode else "",
                "country": address_country or "",
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
        raise HTTPException(status_code=502, detail="Verification provider did not return an applicant id.")

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
                raise HTTPException(status_code=429, detail=f"Please wait {wait}s before requesting another code")
            day_start, day_count = row["day_start"], row["day_count"]
            if now - day_start >= 86400:
                day_start, day_count = now, 0
            if day_count >= OTP_MAX_PER_DAY:
                raise HTTPException(status_code=429, detail="Daily verification code limit reached")
            day_count += 1
        else:
            day_start, day_count = now, 1

    send_sms(area_code, number,
             f"Your HyperTransfer verification code is {code}. It is valid for {OTP_TTL // 60} minutes. Do not share it with anyone.")

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
    # 演示旁路(非生产): 任意 6 位码通过, 免依赖短信投递(与 verify_email_otp 一致)。
    if DEMO_BYPASS_2FA and len(code) == 6 and code.isdigit():
        print(f"[demo-bypass] SMS OTP accepted without verification for {phone}")
        with db() as conn:
            conn.execute("DELETE FROM otps WHERE phone=?", (phone,))
        return
    with db() as conn:
        row = conn.execute("SELECT * FROM otps WHERE phone=?", (phone,)).fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Please request an SMS verification code first")
        if now > row["expires_at"]:
            raise HTTPException(status_code=400, detail="Verification code expired, please request a new one")
        if row["tries"] >= OTP_MAX_VERIFY:
            raise HTTPException(status_code=429, detail="Too many incorrect code attempts, please request a new code")
        if not hmac.compare_digest(row["code"], code):
            conn.execute("UPDATE otps SET tries=tries+1 WHERE phone=?", (phone,))
            raise HTTPException(status_code=400, detail="Incorrect SMS verification code")
        conn.execute("DELETE FROM otps WHERE phone=?", (phone,))


# --------------------------------------------------------------------------- #
# Email OTP（独立 email_otps 表；结构/限频仿短信 OTP，发送走 send_email）
# --------------------------------------------------------------------------- #
def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def issue_email_otp(email: str) -> None:
    """对 email 发一次性验证码（限频 + 用后即焚），通过 send_email 投递。"""
    email = normalize_email(email)
    now = int(time.time())
    code = f"{secrets.randbelow(1_000_000):06d}"
    with db() as conn:
        row = conn.execute("SELECT * FROM email_otps WHERE identifier=?", (email,)).fetchone()
        if row:
            if now - row["sent_at"] < OTP_RESEND_COOLDOWN:
                wait = OTP_RESEND_COOLDOWN - (now - row["sent_at"])
                raise HTTPException(status_code=429, detail=f"Please wait {wait}s before requesting another code")
            day_start, day_count = row["day_start"], row["day_count"]
            if now - day_start >= 86400:
                day_start, day_count = now, 0
            if day_count >= OTP_MAX_PER_DAY:
                raise HTTPException(status_code=429, detail="Daily verification code limit reached")
            day_count += 1
        else:
            day_start, day_count = now, 1

    send_email(
        email,
        "Your HyperTransfer verification code",
        f"Your HyperTransfer verification code is {code}. "
        f"It is valid for {OTP_TTL // 60} minutes. Do not share it with anyone.",
    )

    with db() as conn:
        conn.execute(
            """
            INSERT INTO email_otps(identifier, code, expires_at, sent_at, tries, day_count, day_start)
            VALUES (?,?,?,?,0,?,?)
            ON CONFLICT(identifier) DO UPDATE SET
                code=excluded.code, expires_at=excluded.expires_at, sent_at=excluded.sent_at,
                tries=0, day_count=excluded.day_count, day_start=excluded.day_start
            """,
            (email, code, now + OTP_TTL, now, day_count, day_start),
        )


def verify_email_otp(email: str, code: str) -> None:
    email = normalize_email(email)
    code = (code or "").strip()
    now = int(time.time())
    # 演示旁路(非生产): 任意 6 位码通过, 免依赖邮件投递(与 HT_DEMO_BYPASS_2FA 一致)。
    if DEMO_BYPASS_2FA and len(code) == 6 and code.isdigit():
        # 留痕: 万一生产误开(SUMSUB_ENVIRONMENT 配错)可从日志发现
        print(f"[demo-bypass] email OTP accepted without verification for {email}")
        with db() as conn:
            conn.execute("DELETE FROM email_otps WHERE identifier=?", (email,))
        return
    with db() as conn:
        row = conn.execute("SELECT * FROM email_otps WHERE identifier=?", (email,)).fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Please request an email verification code first")
        if now > row["expires_at"]:
            raise HTTPException(status_code=400, detail="Verification code expired, please request a new one")
        if row["tries"] >= OTP_MAX_VERIFY:
            raise HTTPException(status_code=429, detail="Too many incorrect code attempts, please request a new code")
        if not hmac.compare_digest(row["code"], code):
            conn.execute("UPDATE email_otps SET tries=tries+1 WHERE identifier=?", (email,))
            raise HTTPException(status_code=400, detail="Incorrect email verification code")
        conn.execute("DELETE FROM email_otps WHERE identifier=?", (email,))


# --------------------------------------------------------------------------- #
# 审计留痕
# --------------------------------------------------------------------------- #
def write_audit(
    actor_user_id: Optional[str],
    action: str,
    target_type: str = "",
    target_id: str = "",
    detail: Optional[dict[str, Any]] = None,
) -> None:
    with db() as conn:
        conn.execute(
            """INSERT INTO audit_trail(id, actor_user_id, action, target_type, target_id,
                                       detail_json, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (
                str(uuid.uuid4()),
                actor_user_id,
                action,
                target_type or None,
                target_id or None,
                json_dumps(detail) if detail is not None else None,
                int(time.time()),
            ),
        )


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
    totp_enabled = bool(user["totp_enabled"]) if "totp_enabled" in keys else True
    return {
        "phone": phone_label if phone_label != "+" else "",
        "name": user["name"],
        "email": user["email"] or "",
        "status": user["status"],
        "userType": user_type,
        "roles": get_user_roles(user["id"]),
        "totpEnabled": totp_enabled,   # PR③: 2FA 可选 → 前端据此决定登录/step-up 是否验 TOTP
    }


def user_from_token(authorization: Optional[str]) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not signed in")
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
            "totp_enabled": 1,
        }
    # 后台 demo 会话: 合成 staff/admin 用户(get_user_roles 给 admin → require_role 全通)。仅非 production。
    if token == DEMO_STAFF_SESSION_TOKEN and SUMSUB_ENVIRONMENT != "production":
        return {
            "id": "demo-staff-id",
            "phone": "",
            "area_code": "",
            "number": "",
            "name": "Demo Ops Staff",
            "email": "ops.staff@hypercrypto.com",
            "status": "active",
            "user_type": "staff",
            "totp_enabled": 1,
        }
    with db() as conn:
        sess = conn.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if not sess or sess["expires_at"] < int(time.time()):
            raise HTTPException(status_code=401, detail="Session expired, please sign in again")
        user = conn.execute("SELECT * FROM users WHERE id=?", (sess["user_id"],)).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# --------------------------------------------------------------------------- #
# RBAC (PR①: 角色 + 端点级守卫)
# --------------------------------------------------------------------------- #
def get_user_roles(user_id: str) -> "list[str]":
    if user_id == "demo-staff-id" and SUMSUB_ENVIRONMENT != "production":
        return ["admin"]        # 后台 demo 会话: 全权限
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
        raise HTTPException(status_code=403, detail="You don't have permission to access this resource")
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
# 邀请制（PR②-2）
# --------------------------------------------------------------------------- #
def invitation_link_for_token(token: str) -> str:
    base = INVITE_BASE_URL.rstrip("/") if INVITE_BASE_URL else ""
    return (
        f"{base}/invite?token={token}"
        if base
        else f"/invite?token={urllib.parse.quote(token, safe='')}"
    )


def send_invitation_email(row: sqlite3.Row, invite_link: str, qr: str) -> str:
    name = row["patron_name"] or "there"
    return send_email(
        row["patron_email"],
        "You're invited to HyperTransfer",
        f"Hi {name},\n\n"
        f"You have been approved to open a HyperTransfer account.\n"
        f"Use this single-use link within 6 hours to register (tied to {row['patron_email']}):\n\n"
        f"{invite_link}\n\n"
        f"Or scan the attached QR code.\n\nHyperTransfer",
        html=(f"<p>Hi {name},</p>"
              f"<p>You have been approved to open a HyperTransfer account. "
              f"Use this single-use link within 6 hours to register "
              f"(tied to <b>{row['patron_email']}</b>):</p>"
              f"<p><a href=\"{invite_link}\">{invite_link}</a></p>"
              f"<p>Or scan this QR code:</p>"
              f"<p><img src=\"{qr}\" alt=\"invite QR\" width=\"180\" height=\"180\"/></p>"
              f"<p>HyperTransfer</p>"),
    )


def invitation_public(row: sqlite3.Row, include_token: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": row["id"],
        "patronEmail": row["patron_email"],
        "patronName": row["patron_name"] or "",
        "status": row["status"],
        "expiresAt": row["expires_at"],
        "createdBy": row["created_by"],
        "reviewedBy": row["reviewed_by"] or "",
        "consumedBy": row["consumed_by"] or "",
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
    if row["details_json"]:
        try:
            data["details"] = json.loads(row["details_json"])
        except Exception:
            data["details"] = None
    if include_token:
        data["token"] = row["token"] or ""
    # issued 邀请: 附上可交付给客户的单次链接 + 二维码(供 RM 页展示/复制/扫码交给客户)。
    if row["status"] == "issued" and row["token"]:
        link = invitation_link_for_token(row["token"])
        data["inviteLink"] = link
        data["qrPngBase64"] = qr_data_uri(link)
    return data


def get_invitation(invitation_id: str) -> Optional[sqlite3.Row]:
    with db() as conn:
        return conn.execute("SELECT * FROM invitations WHERE id=?", (invitation_id,)).fetchone()


def get_invitation_by_token(token: str) -> Optional[sqlite3.Row]:
    with db() as conn:
        return conn.execute("SELECT * FROM invitations WHERE token=?", (token,)).fetchone()


def invitation_is_redeemable(row: sqlite3.Row, email: str) -> None:
    """校验邀请可用于注册:status=issued、未过期、未消费、email 匹配。失败抛 4xx。"""
    # demo(DEMO_BYPASS_2FA): 只校验 email 匹配, 放宽 consumed/expired/status —— 演示可反复跑同一链接。
    if DEMO_BYPASS_2FA:
        if normalize_email(row["patron_email"]) != normalize_email(email):
            raise HTTPException(status_code=400, detail="Email does not match the invitation")
        return
    if row["status"] == "consumed":
        raise HTTPException(status_code=409, detail="This invitation link has already been used")
    if row["status"] != "issued":
        raise HTTPException(status_code=400, detail="Invitation link is invalid or not yet issued")
    if row["expires_at"] is not None and int(time.time()) > row["expires_at"]:
        raise HTTPException(status_code=410, detail="This invitation link has expired")
    if normalize_email(row["patron_email"]) != normalize_email(email):
        raise HTTPException(status_code=400, detail="Email does not match the invitation")


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
    # 手机注册走 areaCode+phoneNumber;邀请注册无手机号,改用 email 定位 pending 用户。
    areaCode: str = Field(default="86")
    phoneNumber: str = Field(default="")
    email: str = Field(default="")
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
    firstName: str = Field(default="", max_length=80)
    lastName: str = Field(default="", max_length=80)
    middleName: str = Field(default="", max_length=80)
    nationality: str = Field(default="", max_length=8)
    dob: str = Field(default="", max_length=10)
    taxResidence: str = Field(default="", max_length=8)
    phone: str = Field(default="", max_length=32)
    idType: str = Field(default="", max_length=32)
    idNumber: str = Field(default="", max_length=80)
    documentCountry: str = Field(default="", max_length=8)
    documentExpiry: str = Field(default="", max_length=10)
    address: str = Field(default="", max_length=240)
    city: str = Field(default="", max_length=80)
    postalCode: str = Field(default="", max_length=32)
    addressCountry: str = Field(default="", max_length=8)
    occupation: str = Field(default="", max_length=120)
    sourceOfFunds: str = Field(default="", max_length=240)
    consentAccepted: bool = Field(default=False)
    levelName: str = Field(default="")
    ttlInSecs: Optional[int] = Field(default=None, ge=60, le=3600)
    apiOnly: bool = Field(default=False)


class SumsubTravelRuleIn(BaseModel):
    # 本人(originator)钱包 = 客户来源钱包; counterparty = 受益方(WTA/对手 VASP 侧)
    direction: str = Field(default="out")            # out=出金/付款方为本人, in=入金
    amount: float = Field(gt=0)
    currencyCode: str = Field(default="USDT", max_length=16)
    cryptoChain: str = Field(default="ETH", max_length=24)  # Sumsub cryptoParams.cryptoChain
    originatorWallet: str = Field(default="", max_length=120)
    counterpartyName: str = Field(default="", max_length=160)
    counterpartyWallet: str = Field(default="", max_length=120)
    counterpartyVasp: str = Field(default="", max_length=160)


# --- 邀请制 / 员工管理 / Email OTP（PR②-2）---
class CreateStaffIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    roles: "list[str]" = Field(default_factory=list)


class CreateInvitationIn(BaseModel):
    patronEmail: str = Field(min_length=3, max_length=120)
    patronName: str = Field(default="", max_length=120)
    details: Optional[dict[str, Any]] = Field(default=None)


class InvitationReviewIn(BaseModel):
    note: str = Field(default="", max_length=500)


class InvitationVerifyIn(BaseModel):
    token: str = Field(min_length=8, max_length=120)
    email: str = Field(min_length=3, max_length=120)


class EmailOtpIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)


class RegisterInviteIn(BaseModel):
    token: str = Field(min_length=8, max_length=120)
    email: str = Field(min_length=3, max_length=120)
    emailOtp: str = Field(min_length=4, max_length=10)
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)


class RegisterEmailIn(BaseModel):
    # 开放注册(第一因子=Email OTP, 无手机号)。process v1: 邮箱 OTP 登录/注册。
    email: str = Field(min_length=3, max_length=120)
    emailOtp: str = Field(min_length=4, max_length=10)
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)


# --- 2FA 可选 / step-up（PR③）---
class RegisterActivateSkipIn(BaseModel):
    # 跳过 2FA 直接激活: 手机注册用 areaCode+phoneNumber, 邀请注册用 email 定位 pending 用户
    areaCode: str = Field(default="86")
    phoneNumber: str = Field(default="")
    email: str = Field(default="")


class Confirm2faIn(BaseModel):
    code: str = Field(min_length=4, max_length=10)


class Disable2faIn(BaseModel):
    code: str = Field(min_length=4, max_length=10)


class StepupVerifyIn(BaseModel):
    code: str = Field(min_length=4, max_length=10)


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
@app.post("/api/send-otp")
def send_otp(body: SendOtpIn):
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    with db() as conn:
        u = conn.execute("SELECT status FROM users WHERE phone=?", (phone,)).fetchone()
    if u and u["status"] == "active":
        raise HTTPException(status_code=409, detail="This phone number is already registered, please sign in")
    issue_otp(phone, area, num)
    return {"ok": True, "phone": phone, "cooldown": OTP_RESEND_COOLDOWN}


@app.post("/api/register")
def register(body: RegisterIn):
    # ⚠️ 账号为邀请制: production 关闭手机号开放注册(仅 /invite 邀请落地可注册)。
    if SUMSUB_ENVIRONMENT == "production":
        raise HTTPException(status_code=403, detail="Accounts are invitation-only; open registration is disabled. Please use your invitation link")
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    email = body.email.strip().lower()

    # 重复注册检查 —— 放在校验短信码之前:已注册账户直接拦死,不消费验证码。
    with db() as conn:
        existing = conn.execute("SELECT status FROM users WHERE phone=?", (phone,)).fetchone()
        if existing and existing["status"] == "active":
            raise HTTPException(status_code=409, detail="This phone number is already registered, please sign in")
        if email:
            # 邮箱被【其他手机号】占用即拒绝(含 active 与 pending_totp),避免一邮箱多账户
            dup = conn.execute(
                "SELECT status FROM users WHERE email=? AND phone<>?", (email, phone)
            ).fetchone()
            if dup:
                raise HTTPException(status_code=409, detail="This email is already registered; use another or sign in")

    verify_otp(phone, body.otp)  # 第一因子: 手机号已验真(校验通过即消费验证码)

    secret = pyotp.random_base32()
    pw_hash, pw_salt = hash_password(body.password)
    now = int(time.time())
    expires_at = now + TOTP_ENROLL_TTL
    with db() as conn:
        # 二次确认(并发安全):走到这里若已变 active 仍拦
        existing = conn.execute("SELECT status FROM users WHERE phone=?", (phone,)).fetchone()
        if existing and existing["status"] == "active":
            raise HTTPException(status_code=409, detail="This phone number is already registered, please sign in")
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
    # 邀请注册无手机号 → 用 email 定位;手机注册仍用 phone。激活后均按 user_id 写库。
    email = normalize_email(body.email)
    with db() as conn:
        if body.phoneNumber:
            _, _, phone = normalize_phone(body.areaCode, body.phoneNumber)
            user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        elif email:
            user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        else:
            raise HTTPException(status_code=400, detail="Phone number or email is required")
        if not user:
            raise HTTPException(status_code=404, detail="Please register first")
        if user["status"] == "pending_totp":
            exp = user["totp_expires_at"]
            if exp is not None and int(time.time()) > exp:
                raise HTTPException(status_code=410, detail="Enrollment timed out, please go back and get a new QR code")
        # 演示旁路(非生产): 任意 6 位码即激活, 免去演示现场取 TOTP(与 login/verify 一致)。
        if DEMO_BYPASS_2FA and len(body.code) == 6 and body.code.isdigit():
            print(f"[demo-bypass] confirm-totp accepted without TOTP verify for user {user['id']}")
            counter = user["last_counter"] or 0
        else:
            counter = verify_totp(user["totp_secret"], body.code, user["last_counter"])
            if counter is None:
                raise HTTPException(status_code=400, detail="Verification code is incorrect or expired")
        conn.execute(
            "UPDATE users SET status='active', totp_enabled=1, last_counter=?, totp_expires_at=NULL WHERE id=?",
            (counter, user["id"]),
        )
        user = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
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
            raise HTTPException(status_code=404, detail="Please register first")
        if user["status"] == "active":
            raise HTTPException(status_code=409, detail="This account is already active, please sign in")
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


@app.post("/api/register/activate-skip")
def register_activate_skip(body: RegisterActivateSkipIn):
    """PR③: 2FA 可选 —— 跳过 TOTP 直接激活 pending_totp 用户(不验码、不签恢复码)。
    手机注册用 phone 定位; 邀请注册用 email 定位。激活后 totp_enabled=0。
    员工账户(staff)禁止跳过 2FA。"""
    email = normalize_email(body.email)
    with db() as conn:
        if body.phoneNumber:
            _, _, phone = normalize_phone(body.areaCode, body.phoneNumber)
            user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        elif email:
            user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        else:
            raise HTTPException(status_code=400, detail="Phone number or email is required")
        if not user:
            raise HTTPException(status_code=404, detail="Please register first")
        if user["status"] == "active":
            raise HTTPException(status_code=409, detail="This account is already active, please sign in")
        if user["user_type"] == "staff":
            raise HTTPException(status_code=403, detail="Staff accounts must enable two-factor authentication (2FA)")
        exp = user["totp_expires_at"]
        if exp is not None and int(time.time()) > exp:
            raise HTTPException(status_code=410, detail="Enrollment timed out, please go back and get a new QR code")
        conn.execute(
            "UPDATE users SET status='active', totp_enabled=0, last_counter=NULL, "
            "totp_expires_at=NULL WHERE id=?",
            (user["id"],),
        )
        user = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    token = create_session(user["id"])
    return {"ok": True, "token": token, "user": user_public(user)}


@app.post("/api/password/send-otp")
def password_send_otp(body: PwdResetStartIn):
    """忘记密码:向已注册手机号发送重置验证码。
    为防账号枚举,无论手机号是否存在都返回 ok;仅对 active 用户真正发短信。"""
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    with db() as conn:
        u = conn.execute("SELECT status FROM users WHERE phone=?", (phone,)).fetchone()
    if u and u["status"] == "active":
        issue_otp(phone, area, num)
    # demo(DEMO_BYPASS_2FA): 告知前端可自动填重置码(verify_otp 在 demo 下接受任意 6 位)。
    return {"ok": True, "cooldown": OTP_RESEND_COOLDOWN, "demo": bool(DEMO_BYPASS_2FA)}


@app.post("/api/password/reset")
def password_reset(body: PwdResetIn):
    """校验短信码后重置密码,并失效该用户的所有现存会话(强制重新登录)。
    TOTP 第二因子不变 —— 重置密码不等于绕过 2FA。"""
    area, num, phone = normalize_phone(body.areaCode, body.phoneNumber)
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        if not user or user["status"] != "active":
            raise HTTPException(status_code=404, detail="This phone number is not registered")
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
    generic = HTTPException(status_code=401, detail="Incorrect account or password")
    if not user or not verify_password(body.password, user["pw_hash"], user["pw_salt"]):
        raise generic
    # PR③: 2FA 可选。totp_enabled=0 的 patron 直接发会话; staff 永远强制 2FA。
    needs_totp = bool(user["totp_enabled"]) or user["user_type"] == "staff"
    if not needs_totp:
        token = create_session(user["id"])
        return {"ok": True, "next": "done", "token": token, "user": user_public(user)}
    challenge = create_challenge(user["id"])
    # demo(DEMO_BYPASS_2FA): 告知前端可自动填 2FA 码(login/verify 接受任意 6 位)。
    return {"ok": True, "challenge": challenge, "next": "totp", "demo": bool(DEMO_BYPASS_2FA)}


@app.post("/api/login/verify")
def login_verify(body: LoginVerifyIn):
    now = int(time.time())
    with db() as conn:
        ch = conn.execute("SELECT * FROM challenges WHERE challenge=?", (body.challenge,)).fetchone()
        if not ch or ch["expires_at"] < now:
            raise HTTPException(status_code=401, detail="Your login session has expired, please sign in again")
        if ch["tries"] >= OTP_MAX_VERIFY:
            conn.execute("DELETE FROM challenges WHERE challenge=?", (body.challenge,))
            raise HTTPException(status_code=429, detail="Too many incorrect code attempts, please sign in again")
        user = conn.execute("SELECT * FROM users WHERE id=?", (ch["user_id"],)).fetchone()
        if not user:
            conn.execute("UPDATE challenges SET tries=tries+1 WHERE challenge=?", (body.challenge,))
            raise HTTPException(status_code=400, detail="Verification code is incorrect or expired")
        if DEMO_BYPASS_2FA:
            counter = user["last_counter"]   # 演示旁路: 接受任意码, last_counter 不变
        else:
            counter = verify_totp(user["totp_secret"], body.code, user["last_counter"])
            if counter is None:
                conn.execute("UPDATE challenges SET tries=tries+1 WHERE challenge=?", (body.challenge,))
                raise HTTPException(status_code=400, detail="Verification code is incorrect or expired")
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
            raise HTTPException(status_code=401, detail="Your login session has expired, please sign in again")
        if ch["tries"] >= OTP_MAX_VERIFY:
            conn.execute("DELETE FROM challenges WHERE challenge=?", (body.challenge,))
            raise HTTPException(status_code=429, detail="Too many attempts, please sign in again")
        user_id = ch["user_id"]
    if not consume_recovery_code(user_id, body.recoveryCode):
        with db() as conn:
            conn.execute("UPDATE challenges SET tries=tries+1 WHERE challenge=?", (body.challenge,))
        raise HTTPException(status_code=400, detail="Recovery code is invalid or already used")
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


# --------------------------------------------------------------------------- #
# 2FA 可选 / step-up（PR③）
# --------------------------------------------------------------------------- #
def _user_label(user: Any) -> str:
    keys = user.keys()
    email = user["email"] if "email" in keys else ""
    area = user["area_code"] if "area_code" in keys else ""
    number = user["number"] if "number" in keys else ""
    return email or (f"+{area or ''} {number or ''}".strip()) or "HyperTransfer"


@app.post("/api/2fa/enable")
def enable_2fa(authorization: Optional[str] = Header(default=None)):
    """PR③: 已登录用户(此前跳过 2FA)补启用 —— 重签 TOTP secret 返回二维码;
    需再调 /2fa/confirm 验码后 totp_enabled=1。"""
    user = user_from_token(authorization)
    secret = pyotp.random_base32()
    with db() as conn:
        conn.execute("UPDATE users SET totp_secret=?, last_counter=NULL WHERE id=?",
                     (secret, user["id"]))
    otpauth = pyotp.TOTP(secret).provisioning_uri(name=_user_label(user), issuer_name=ISSUER)
    return {"ok": True, "otpauth_uri": otpauth, "secret": secret,
            "qr_png_base64": qr_data_uri(otpauth)}


@app.post("/api/2fa/confirm")
def confirm_2fa(body: Confirm2faIn, authorization: Optional[str] = Header(default=None)):
    """PR③: 已登录用户验码激活 2FA(totp_enabled=1);首次启用签发一组恢复码。"""
    user = user_from_token(authorization)
    counter = verify_totp(user["totp_secret"], body.code, user["last_counter"])
    if counter is None:
        raise HTTPException(status_code=400, detail="Verification code is incorrect or expired")
    with db() as conn:
        conn.execute("UPDATE users SET totp_enabled=1, last_counter=? WHERE id=?",
                     (counter, user["id"]))
        has_codes = conn.execute(
            "SELECT COUNT(*) c FROM recovery_codes WHERE user_id=?", (user["id"],)
        ).fetchone()["c"]
        user = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    recovery_codes = [] if has_codes else generate_recovery_codes(user["id"])
    return {"ok": True, "user": user_public(user), "recovery_codes": recovery_codes}


@app.post("/api/2fa/disable")
def disable_2fa(body: Disable2faIn, authorization: Optional[str] = Header(default=None)):
    """PR③: 关闭 2FA(需验当前 TOTP);员工账户不允许关闭。"""
    user = user_from_token(authorization)
    if user["user_type"] == "staff":
        raise HTTPException(status_code=403, detail="Staff accounts must enable two-factor authentication (2FA)")
    counter = verify_totp(user["totp_secret"], body.code, user["last_counter"])
    if counter is None:
        raise HTTPException(status_code=400, detail="Verification code is incorrect or expired")
    with db() as conn:
        conn.execute("UPDATE users SET totp_enabled=0, last_counter=? WHERE id=?",
                     (counter, user["id"]))
        user = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    return {"ok": True, "user": user_public(user)}


@app.post("/api/stepup/verify")
def stepup_verify(body: StepupVerifyIn, authorization: Optional[str] = Header(default=None)):
    """PR③: 资金动作(入金/退款)前 step-up 二次验证。要求已启用 2FA;
    未启用返回 409 —— 前端应先引导用户启用 2FA。"""
    user = user_from_token(authorization)
    enabled = bool(user["totp_enabled"]) if "totp_enabled" in user.keys() else True
    if not enabled:
        raise HTTPException(status_code=409, detail="Please enable two-factor authentication (2FA) first")
    counter = verify_totp(user["totp_secret"], body.code, user["last_counter"])
    if counter is None:
        raise HTTPException(status_code=400, detail="Verification code is incorrect or expired")
    with db() as conn:
        conn.execute("UPDATE users SET last_counter=? WHERE id=?", (counter, user["id"]))
    return {"ok": True, "verifiedAt": int(time.time()), "ttl": STEPUP_TTL}


# --------------------------------------------------------------------------- #
# 角色管理（admin 预置员工账号）
# --------------------------------------------------------------------------- #
@app.post("/api/admin/staff")
def admin_create_staff(body: CreateStaffIn, admin: Any = Depends(require_role("admin"))):
    """admin 预置员工账号:user_type=staff + 指定角色,邮箱+密码+强制绑定 TOTP。
    返回 TOTP 设置(otpauth/secret/qr);员工需用 confirm-totp(email) 激活后方可登录。"""
    email = normalize_email(body.email)
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email format")
    roles = sorted({r.strip().lower() for r in body.roles if r and r.strip()})
    invalid = [r for r in roles if r not in STAFF_ROLES]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid role(s): {', '.join(invalid)}")
    if not roles:
        raise HTTPException(status_code=400, detail="Specify at least one role")

    now = int(time.time())
    secret = pyotp.random_base32()
    pw_hash, pw_salt = hash_password(body.password)
    uid = str(uuid.uuid4())
    with db() as conn:
        if conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(status_code=409, detail="This email is already registered")
        conn.execute(
            """INSERT INTO users(id, phone, area_code, number, name, email, pw_hash, pw_salt,
                                 totp_secret, status, user_type, last_counter, totp_expires_at, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?, 'staff', ?,?,?)""",
            (uid, None, "", "", body.name.strip(), email, pw_hash, pw_salt,
             secret, "pending_totp", None, now + TOTP_ENROLL_TTL, now),
        )
        conn.executemany("INSERT OR IGNORE INTO user_roles(user_id, role) VALUES (?,?)",
                         [(uid, r) for r in roles])
    write_audit(admin["id"], "staff.create", "user", uid,
                {"email": email, "roles": roles})
    otpauth = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)
    return {
        "ok": True,
        "userId": uid,
        "email": email,
        "roles": roles,
        "otpauth_uri": otpauth,
        "secret": secret,
        "qr_png_base64": qr_data_uri(otpauth),
        "expires_at": now + TOTP_ENROLL_TTL,
        "expires_in": TOTP_ENROLL_TTL,
    }


# --------------------------------------------------------------------------- #
# 邀请制端点
# --------------------------------------------------------------------------- #
@app.post("/api/invitations")
def create_invitation(body: CreateInvitationIn, rm: Any = Depends(require_role("rm"))):
    """RM 提交邀请申请 → status=submitted。准入尽调在外部系统做(决策 3)。"""
    email = normalize_email(body.patronEmail)
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email format")
    now = int(time.time())
    inv_id = str(uuid.uuid4())
    with db() as conn:
        conn.execute(
            """INSERT INTO invitations(id, patron_email, patron_name, details_json, token,
                                       status, expires_at, created_by, reviewed_by, consumed_by,
                                       created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (inv_id, email, body.patronName.strip() or None,
             json_dumps(body.details) if body.details is not None else None,
             None, "submitted", None, rm["id"], None, None, now, now),
        )
        row = conn.execute("SELECT * FROM invitations WHERE id=?", (inv_id,)).fetchone()
    write_audit(rm["id"], "invitation.create", "invitation", inv_id, {"patronEmail": email})
    return {"ok": True, "invitation": invitation_public(row)}


@app.get("/api/invitations/mine")
def list_my_invitations(authorization: Optional[str] = Header(default=None)):
    """RM 查【自己提交】的准入申请, 看审批进度。任何登录 staff 仅能看本人 created_by 的, 看不到他人。"""
    user = user_from_token(authorization)
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM invitations WHERE created_by=? ORDER BY created_at DESC", (user["id"],)
        ).fetchall()
    return {"ok": True, "invitations": [invitation_public(r) for r in rows]}


@app.get("/api/invitations")
def list_invitations(
    status: Optional[str] = None,
    user: Any = Depends(require_role("marketing", "compliance")),
):
    """审核队列。marketing/compliance/admin 可见;可按 status 过滤。"""
    with db() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM invitations WHERE status=? ORDER BY created_at DESC", (status,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM invitations ORDER BY created_at DESC"
            ).fetchall()
    return {"ok": True, "invitations": [invitation_public(r) for r in rows]}


@app.post("/api/invitations/{invitation_id}/approve")
def approve_invitation(invitation_id: str, body: InvitationReviewIn,
                       user: Any = Depends(require_role("marketing"))):
    row = get_invitation(invitation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if row["status"] != "submitted":
        raise HTTPException(status_code=409, detail="Only submitted requests can be approved")
    now = int(time.time())
    with db() as conn:
        conn.execute(
            "UPDATE invitations SET status='approved', reviewed_by=?, updated_at=? WHERE id=?",
            (user["id"], now, invitation_id),
        )
    write_audit(user["id"], "invitation.approve", "invitation", invitation_id,
                {"note": body.note} if body.note else None)
    # 决策(用户口径): 审批通过即**自动签发** single-use QR+link 并发邮件给客户, 去掉单独 issue
    # 步骤/状态(对外审批状态只剩 submitted/approved/rejected)。底层仍置 status='issued' 以保证
    # 邀请链接可用(注册流程 gate 在 issued); 前端把 issued/consumed 显示为 "Approved"。
    return _issue_invite_link_and_email(invitation_id, user, "invitation.issue", "approved")


def _load_details(row: sqlite3.Row) -> dict[str, Any]:
    if row["details_json"]:
        try:
            return json.loads(row["details_json"]) or {}
        except Exception:
            return {}
    return {}


@app.post("/api/invitations/{invitation_id}/reject")
def reject_invitation(invitation_id: str, body: InvitationReviewIn,
                      user: Any = Depends(require_role("marketing"))):
    # 拒绝**必填原因**(用户口径): 无原因 → 400。原因并入 details_json.rejectReason, 供 RM 查看。
    reason = (body.note or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="A reject reason is required")
    row = get_invitation(invitation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if row["status"] not in ("submitted", "approved"):
        raise HTTPException(status_code=409, detail="This invitation cannot be rejected")
    now = int(time.time())
    details = _load_details(row)
    details["rejectReason"] = reason
    with db() as conn:
        conn.execute(
            "UPDATE invitations SET status='rejected', reviewed_by=?, details_json=?, updated_at=? WHERE id=?",
            (user["id"], json.dumps(details), now, invitation_id),
        )
        row = conn.execute("SELECT * FROM invitations WHERE id=?", (invitation_id,)).fetchone()
    write_audit(user["id"], "invitation.reject", "invitation", invitation_id, {"reason": reason})
    return {"ok": True, "invitation": invitation_public(row)}


@app.post("/api/invitations/{invitation_id}/resubmit")
def resubmit_invitation(invitation_id: str, user: Any = Depends(require_role("rm"))):
    """RM 把被拒申请**直接重新提交**(rejected → submitted, 清除拒绝原因), 再次进审批队列。
    仅提交者本人可 resubmit(admin 例外)。"""
    row = get_invitation(invitation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if "admin" not in set(get_user_roles(user["id"])) and row["created_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the submitting RM can resubmit this request")
    if row["status"] != "rejected":
        raise HTTPException(status_code=409, detail="Only rejected requests can be resubmitted")
    now = int(time.time())
    details = _load_details(row)
    details.pop("rejectReason", None)
    with db() as conn:
        conn.execute(
            "UPDATE invitations SET status='submitted', reviewed_by=NULL, details_json=?, updated_at=? WHERE id=?",
            (json.dumps(details), now, invitation_id),
        )
        row = conn.execute("SELECT * FROM invitations WHERE id=?", (invitation_id,)).fetchone()
    write_audit(user["id"], "invitation.resubmit", "invitation", invitation_id, None)
    return {"ok": True, "invitation": invitation_public(row)}


def _issue_invite_link_and_email(invitation_id: str, user: Any, audit_action: str,
                                 expected_status: str) -> dict[str, Any]:
    """生成全新 single-use token + 6h 过期 → status=issued, 构造邀请链接 + 二维码,
    通过邮件适配器发送(真发或 console 降级), 写审计。issue 与 resend 共用本逻辑;
    resend 等同重新签发(旧 token 失效, 永远给一条可用的新链接, 避免重发过期/丢失链接)。
    UPDATE 带 `AND status=expected_status` 条件 + rowcount 校验, 关闭 check→act 之间被
    并发改状态的窗口(如把 consumed 改回 issued)。"""
    now = int(time.time())
    token = secrets.token_urlsafe(32)
    expires_at = now + INVITE_TTL
    with db() as conn:
        cur = conn.execute(
            "UPDATE invitations SET status='issued', token=?, expires_at=?, updated_at=? WHERE id=? AND status=?",
            (token, expires_at, now, invitation_id, expected_status),
        )
        if cur.rowcount == 0:        # 期间状态被并发改动 → 拒绝(连接 __exit__ 自动 rollback)
            raise HTTPException(status_code=409, detail="Invitation status changed, please refresh and try again")
        row = conn.execute("SELECT * FROM invitations WHERE id=?", (invitation_id,)).fetchone()

    invite_link = invitation_link_for_token(token)
    qr = qr_data_uri(invite_link)              # 二维码(data URI), 随响应返回 + 内联进邮件
    channel = send_invitation_email(row, invite_link, qr)
    write_audit(user["id"], audit_action, "invitation", invitation_id,
                {"expiresAt": expires_at, "emailChannel": channel})
    return {
        "ok": True,
        "invitation": invitation_public(row, include_token=True),
        "inviteLink": invite_link,
        "qrPngBase64": qr,
        "emailChannel": channel,           # "smtp"/"smtp_failed"/"console" — 供前端如实反馈
        "emailTo": row["patron_email"],
    }


@app.post("/api/invitations/{invitation_id}/issue")
def issue_invitation(invitation_id: str, user: Any = Depends(require_role("marketing"))):
    """仅 approved 可签发:生成 single-use token + 6h 过期 → status=issued, 发送邀请邮件。"""
    row = get_invitation(invitation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if row["status"] != "approved":
        raise HTTPException(status_code=409, detail="Only approved invitations can issue a link")
    return _issue_invite_link_and_email(invitation_id, user, "invitation.issue", "approved")


@app.post("/api/invitations/{invitation_id}/resend")
def resend_invitation(invitation_id: str, user: Any = Depends(require_role("marketing", "rm"))):
    """对已 issued 的邀请重发邮件:重新签发 single-use token + 6h(旧链接失效),
    再次投递。用于首封邮件丢失/进垃圾箱/**链接过期**的补发。**RM(提交者)** 也可重发
    (issued 邀请转到 RM 页交付, 过期由 RM 重发); consumed/未签发的不可重发。
    带 INVITE_RESEND_COOLDOWN 节流(防邮件轰炸/SMTP 滥用; 也避免网络重试导致重复发信)。"""
    row = get_invitation(invitation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    # RM(非 marketing/admin)只能重发自己提交的邀请
    if not (set(get_user_roles(user["id"])) & {"marketing", "admin"}) and row["created_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the submitting RM can resend this invite")
    if row["status"] != "issued":
        raise HTTPException(status_code=409, detail="Only issued invitations can have the email resent (issue it first if not issued; consumed ones cannot be resent)")
    wait = INVITE_RESEND_COOLDOWN - (int(time.time()) - (row["updated_at"] or 0))
    if wait > 0:
        raise HTTPException(status_code=429, detail=f"Resending too frequently, please try again in {wait}s")
    return _issue_invite_link_and_email(invitation_id, user, "invitation.resend", "issued")


@app.post("/api/invitations/{invitation_id}/email")
def email_invitation(invitation_id: str, user: Any = Depends(require_role("marketing", "rm"))):
    """把当前有效 issued 链接再次发送给客户邮箱, 不旋转 token。
    过期链接不发送: RM 应点击 resend 重新签发新的 6h 链接。"""
    row = get_invitation(invitation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    roles = set(get_user_roles(user["id"]))
    if not (roles & {"marketing", "admin"}) and row["created_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the submitting RM can email this invite")
    if row["status"] != "issued" or not row["token"]:
        raise HTTPException(status_code=409, detail="Only issued invitations can be emailed")
    if row["expires_at"] and row["expires_at"] <= int(time.time()):
        raise HTTPException(status_code=409, detail="Invite link expired; resend a new 6h link")

    invite_link = invitation_link_for_token(row["token"])
    qr = qr_data_uri(invite_link)
    channel = send_invitation_email(row, invite_link, qr)
    write_audit(user["id"], "invitation.email", "invitation", invitation_id,
                {"expiresAt": row["expires_at"], "emailChannel": channel})
    return {
        "ok": True,
        "invitation": invitation_public(row, include_token=True),
        "inviteLink": invite_link,
        "qrPngBase64": qr,
        "emailChannel": channel,
        "emailTo": row["patron_email"],
    }


@app.post("/api/invitations/verify")
def verify_invitation(body: InvitationVerifyIn):
    """公开:客户用 token+email 校验邀请是否可注册。返回 patron 信息供预填。"""
    row = get_invitation_by_token(body.token)
    if not row:
        raise HTTPException(status_code=404, detail="Invalid invitation link")
    invitation_is_redeemable(row, body.email)
    return {
        "ok": True,
        "patronEmail": row["patron_email"],
        "patronName": row["patron_name"] or "",
        "expiresAt": row["expires_at"],
    }


@app.post("/api/email/send-otp")
def email_send_otp(body: EmailOtpIn):
    """邀请注册第一因子:仅对【存在 issued 且未消费邀请】的 email 发码。
    防滥用 + 防枚举:未命中也返回 ok 但不发码。"""
    email = normalize_email(body.email)
    now = int(time.time())
    with db() as conn:
        inv = conn.execute(
            "SELECT * FROM invitations WHERE patron_email=? AND status='issued'", (email,)
        ).fetchone()
    eligible = bool(
        inv and (inv["expires_at"] is None or now <= inv["expires_at"])
    )
    if eligible:
        issue_email_otp(email)
    # demo(DEMO_BYPASS_2FA): 告知前端可自动填码(verify_email_otp 接受任意 6 位)。
    return {"ok": True, "cooldown": OTP_RESEND_COOLDOWN, "demo": bool(DEMO_BYPASS_2FA)}


@app.post("/api/register/invite")
def register_invite(body: RegisterInviteIn):
    """邀请注册:校验邀请(issued/未过期/email匹配) + Email OTP → 建 patron(pending_totp)
    + 生成 TOTP secret + 标记 invitation consumed + 审计。激活复用 confirm-totp(email)。"""
    email = normalize_email(body.email)
    inv = get_invitation_by_token(body.token)
    if not inv:
        raise HTTPException(status_code=404, detail="Invalid invitation link")
    # demo(DEMO_BYPASS_2FA): 放宽 —— 允许重复注册 / 已消费或过期邀请, 演示可反复跑并始终"创建成功"。
    demo = bool(DEMO_BYPASS_2FA)
    if demo:
        if normalize_email(inv["patron_email"]) != email:
            raise HTTPException(status_code=400, detail="Email does not match the invitation")
    else:
        invitation_is_redeemable(inv, email)

    # 邮箱不可被其他账户占用(并发/重复注册防护);demo 下允许覆盖重注册。
    with db() as conn:
        dup = conn.execute("SELECT status FROM users WHERE email=?", (email,)).fetchone()
        if dup and dup["status"] == "active" and not demo:
            raise HTTPException(status_code=409, detail="This email is already registered, please sign in")

    verify_email_otp(email, body.emailOtp)  # 第一因子:邮箱已验真(校验通过即消费)

    secret = pyotp.random_base32()
    pw_hash, pw_salt = hash_password(body.password)
    now = int(time.time())
    expires_at = now + TOTP_ENROLL_TTL
    uid = str(uuid.uuid4())
    with db() as conn:
        # 二次确认邀请仍 issued(并发安全)
        inv2 = conn.execute("SELECT * FROM invitations WHERE id=?", (inv["id"],)).fetchone()
        if not inv2 or (inv2["status"] != "issued" and not demo):
            raise HTTPException(status_code=409, detail="This invitation link is no longer valid")
        # email 可能已有 pending_totp 占位行 → 复用其 id;否则新建。
        existing = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if existing:
            # 复用既有 pending 占位行的 id(避免 UNIQUE(email) 冲突),重置为本次注册态。
            uid = existing["id"]
            conn.execute(
                """UPDATE users SET name=?, pw_hash=?, pw_salt=?, totp_secret=?,
                          status='pending_totp', user_type='patron', last_counter=NULL,
                          totp_expires_at=?, invited_by=? WHERE id=?""",
                (body.name.strip(), pw_hash, pw_salt, secret, expires_at,
                 inv["created_by"], uid),
            )
        else:
            conn.execute(
                """INSERT INTO users(id, phone, area_code, number, name, email, pw_hash, pw_salt,
                                     totp_secret, status, user_type, last_counter, totp_expires_at,
                                     invited_by, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?, 'patron', ?,?,?,?)""",
                (uid, None, "", "", body.name.strip(), email, pw_hash, pw_salt,
                 secret, "pending_totp", None, expires_at, inv["created_by"], now),
            )
        conn.execute(
            "UPDATE invitations SET status='consumed', consumed_by=?, updated_at=? WHERE id=?",
            (uid, now, inv["id"]),
        )
    write_audit(inv["created_by"], "invitation.consume", "invitation", inv["id"],
                {"userId": uid, "email": email})
    write_audit(uid, "user.register_invite", "user", uid, {"email": email})

    otpauth = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)
    return {
        "email": email,
        "otpauth_uri": otpauth,
        "secret": secret,
        "qr_png_base64": qr_data_uri(otpauth),
        "expires_at": expires_at,
        "expires_in": TOTP_ENROLL_TTL,
        "demo": demo,   # demo: 前端 Setup2FA 据此自动填 6 位码(confirm-totp 接受任意 6 位)
    }


@app.post("/api/register/email/send-otp")
def register_email_send_otp(body: EmailOtpIn):
    """开放注册第一因子: 给 email 发 Email OTP(process v1: 邮箱 OTP, 替代手机短信)。
    已 active 的邮箱 → 409 引导登录; 其余正常发码(限频在 issue_email_otp 内)。
    ⚠️ 账号为邀请制: production 关闭开放注册(仅 /invite 邀请落地可注册)。"""
    if SUMSUB_ENVIRONMENT == "production":
        raise HTTPException(status_code=403, detail="Accounts are invitation-only; open registration is disabled. Please use your invitation link")
    email = normalize_email(body.email)
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email format")
    with db() as conn:
        dup = conn.execute("SELECT status FROM users WHERE email=?", (email,)).fetchone()
    if dup and dup["status"] == "active":
        raise HTTPException(status_code=409, detail="This email is already registered, please sign in")
    issue_email_otp(email)
    return {"ok": True, "cooldown": OTP_RESEND_COOLDOWN}


@app.post("/api/register/email")
def register_email(body: RegisterEmailIn):
    """开放注册: Email OTP(第一因子) → 建 patron(pending_totp) + TOTP secret。
    无手机号; 激活复用 confirm-totp(email)。结构同 register_invite 但不需邀请 token。
    ⚠️ 账号为邀请制: production 关闭开放注册(仅 /invite 邀请落地可注册)。"""
    if SUMSUB_ENVIRONMENT == "production":
        raise HTTPException(status_code=403, detail="Accounts are invitation-only; open registration is disabled. Please use your invitation link")
    email = normalize_email(body.email)
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email format")
    with db() as conn:
        dup = conn.execute("SELECT status FROM users WHERE email=?", (email,)).fetchone()
        if dup and dup["status"] == "active":
            raise HTTPException(status_code=409, detail="This email is already registered, please sign in")
    verify_email_otp(email, body.emailOtp)        # 第一因子: 邮箱已验真(校验通过即消费)
    secret = pyotp.random_base32()
    pw_hash, pw_salt = hash_password(body.password)
    now = int(time.time())
    expires_at = now + TOTP_ENROLL_TTL
    uid = str(uuid.uuid4())
    with db() as conn:
        existing = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if existing:                               # 复用 pending 占位行, 避免 UNIQUE(email) 冲突
            uid = existing["id"]
            conn.execute(
                """UPDATE users SET name=?, pw_hash=?, pw_salt=?, totp_secret=?, status='pending_totp',
                          user_type='patron', last_counter=NULL, totp_expires_at=? WHERE id=?""",
                (body.name.strip(), pw_hash, pw_salt, secret, expires_at, uid),
            )
        else:
            conn.execute(
                """INSERT INTO users(id, phone, area_code, number, name, email, pw_hash, pw_salt,
                                     totp_secret, status, user_type, last_counter, totp_expires_at, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?, 'patron', ?,?,?)""",
                (uid, None, "", "", body.name.strip(), email, pw_hash, pw_salt,
                 secret, "pending_totp", None, expires_at, now),
            )
    write_audit(uid, "user.register_email", "user", uid, {"email": email})
    otpauth = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)
    return {
        "email": email,
        "otpauth_uri": otpauth,
        "secret": secret,
        "qr_png_base64": qr_data_uri(otpauth),
        "expires_at": expires_at,
        "expires_in": TOTP_ENROLL_TTL,
    }


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


def _row_get(row: Any, key: str, default: Any = None) -> Any:
    try:
        return row[key]
    except (IndexError, KeyError):
        return default


def sumsub_persist_validity(user_id: str) -> Optional[sqlite3.Row]:
    """PR③: KYC 首次通过(GREEN→status=approved)时落 approved_at + valid_until。

    valid_until = min(approved_at + 6 日历月, 最早证件到期日)——日历月算术,
    绝不再用固定 `180 * 86400`。此处无证件到期信息时退化为 6 日历月;
    绑定了 admission case 的 KYC 由 persist_case_kyc_outcome 以证件到期日为准写入。
    幂等:已落过不覆盖。"""
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM sumsub_kyc_applications WHERE user_id=?", (user_id,)
        ).fetchone()
        if not row:
            return None
        if row["status"] == "approved" and not _row_get(row, "approved_at"):
            approved_at = row["updated_at"] or int(time.time())
            valid_until = kyc_valid_until(approved_at, [])
            conn.execute(
                "UPDATE sumsub_kyc_applications SET approved_at=?, valid_until=? WHERE user_id=?",
                (approved_at, valid_until, user_id),
            )
            row = conn.execute(
                "SELECT * FROM sumsub_kyc_applications WHERE user_id=?", (user_id,)
            ).fetchone()
    return row


def sumsub_kyc_response_from_row(row: Optional[sqlite3.Row]) -> dict[str, Any]:
    # validityDays 仅作前端展示提示: 有有效截止时按实际天数, 否则按 6 日历月参考值。
    valid_until = _row_get(row, "valid_until") if row else None
    approved_at = _row_get(row, "approved_at") if row else None
    if valid_until and approved_at:
        validity_days = max(1, (valid_until - approved_at) // 86400)
    else:
        validity_days = 183
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
            "approvedAt": None,
            "validUntil": None,
            "expired": False,
            "validityDays": validity_days,
        }
    valid_until = _row_get(row, "valid_until")
    expired = bool(valid_until and int(time.time()) > valid_until)
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
        "approvedAt": _row_get(row, "approved_at"),
        "validUntil": valid_until,
        "expired": expired,
        "validityDays": validity_days,
    }


# --------------------------------------------------------------------------- #
# Sumsub Travel Rule（口径: KYC + Travel Rule 都走 Sumsub）
#   TR 建在 Sumsub Transaction Monitoring 之上: POST /resources/applicants/{id}/kyt/txns/-/data
#   (type=travelRule, Content-Type=application/json — 实测 ndjson 返 415)。复用 KYC 阶段
#   创建的 applicant —— **任何 KYC applicant 都可提交 TR, 不需要专门 TR level**(官方文档)。
#   请求端点/类型/Content-Type 已对真实 Sumsub 账户实测正确。
#   ⚠️ 当前账户**未激活 Travel Rule 产品**: 提交返回 403 "This type of check is not allowed"
#   (语义拒绝, 非媒体/签名错), 故成功路径未验证。激活方式(账户级, 非 per-level):
#   Sumsub Cockpit → Rules Library 安装 Travel Rule 规则包并激活 + Settings → Travel Rule 配置;
#   TR 是独立(可能需 sales 在账户开通的)产品。激活后本代码即可用, 届时再核成功响应结构。
# --------------------------------------------------------------------------- #
def sumsub_build_travel_rule_txn(body: "SumsubTravelRuleIn") -> dict[str, Any]:
    txn: dict[str, Any] = {
        "txnId": "tr-" + uuid.uuid4().hex,
        "type": "travelRule",
        "info": {
            "direction": body.direction,
            "amount": body.amount,
            "currencyCode": body.currencyCode,
            "cryptoParams": {"cryptoChain": body.cryptoChain},
        },
    }
    if body.originatorWallet:
        txn["applicant"] = {"paymentMethod": {"type": "crypto", "accountId": body.originatorWallet}}
    counterparty: dict[str, Any] = {"type": "individual"}
    if body.counterpartyName:
        parts = body.counterpartyName.split(" ", 1)
        counterparty["firstName"] = parts[0]
        counterparty["lastName"] = parts[1] if len(parts) > 1 else parts[0]
    if body.counterpartyWallet:
        counterparty["paymentMethod"] = {"type": "crypto", "accountId": body.counterpartyWallet}
    if body.counterpartyVasp:
        counterparty["institutionInfo"] = {"name": body.counterpartyVasp}
    txn["counterparty"] = counterparty
    return txn


def sumsub_normalize_tr(result: Any) -> dict[str, Any]:
    """归一化 Sumsub TR 结果为前端状态。模块未启用时 Sumsub 返回 403。"""
    if isinstance(result, dict) and result.get("_http_status") == 403:
        return {"status": "provider_not_enabled", "providerStatus": "", "reviewAnswer": "", "txnId": "",
                "detail": result.get("description") or "Travel Rule module not enabled on provider account"}
    data = result if isinstance(result, dict) else {}
    review = data.get("review", {}) if isinstance(data.get("review"), dict) else {}
    review_result = review.get("reviewResult", {}) if isinstance(review.get("reviewResult"), dict) else {}
    answer = review_result.get("reviewAnswer", "")   # GREEN / RED
    review_status = review.get("reviewStatus", "")    # init / pending / completed
    if answer == "GREEN":
        status = "travel_rule_accepted"
    elif answer == "RED":
        status = "travel_rule_rejected"
    elif not answer:
        status = "travel_rule_submitted"
    else:
        status = "manual_review"
    return {"status": status, "providerStatus": review_status or "", "reviewAnswer": answer,
            "txnId": data.get("txnId") or data.get("id") or "", "detail": ""}


@app.post("/api/sumsub/travel-rule/submit")
def sumsub_travel_rule_submit(body: SumsubTravelRuleIn, authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    row = sumsub_get_local_kyc(user["id"])
    if not row or not row["applicant_id"]:
        raise HTTPException(status_code=409, detail="Complete KYC before submitting Travel Rule")
    applicant_id = row["applicant_id"]
    txn = sumsub_build_travel_rule_txn(body)
    # 403(模块未启用)作为数据返回而非抛错, 让前端拿到明确状态而非崩流程。
    result = sumsub_request("POST", f"/resources/applicants/{applicant_id}/kyt/txns/-/data", txn,
                            allow_statuses={403})
    norm = sumsub_normalize_tr(result)
    write_audit(user["id"], "sumsub.travel_rule.submit", "applicant", applicant_id,
                {"txnId": txn["txnId"], "status": norm["status"], "amount": body.amount,
                 "currencyCode": body.currencyCode, "chain": body.cryptoChain})
    return {"ok": norm["status"] != "provider_not_enabled", "provider": "sumsub",
            "submittedTxnId": txn["txnId"], **norm}


@app.get("/api/sumsub/travel-rule/transactions")
def sumsub_travel_rule_txns(limit: int = 20, authorization: Optional[str] = Header(default=None)):
    """查 Travel Rule / KYT 交易(staff 排障用)。TR/KYT 模块未启用时上游可能 403/404。"""
    user = user_from_token(authorization)
    n = max(1, min(limit, 100))
    result = sumsub_request("GET", f"/resources/kyt/txns/query/-?limit={n}&order=-createdAt",
                            allow_statuses={403, 404})
    return {"ok": True, "provider": "sumsub", "result": result}


@app.post("/api/sumsub/kyc/start")
def sumsub_kyc_start(body: SumsubKycStartIn, authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    # Case-aware: 开始 KYC 即把已认领的 admission case 移到 kyc_in_progress。
    _mark_case_kyc_started(user["id"])
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
    # 演示旁路标记的行不再回查真实 Sumsub(沙箱 applicant 实际仍 pending, 否则会把
    # demo-approve 翻回 pending)。真实流程的 review_status 不会是 "demo-approved"。
    if row["review_status"] == "demo-approved":
        row = sumsub_persist_validity(user["id"]) or row
        return sumsub_kyc_response_from_row(row)
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
    row = sumsub_persist_validity(user["id"]) or row
    return sumsub_kyc_response_from_row(row)


@app.post("/api/sumsub/kyc/demo-approve")
def sumsub_kyc_demo_approve(authorization: Optional[str] = Header(default=None)):
    """演示快捷键: 把当前用户 KYC 直接标 approved + 落 6 个月有效期, 解锁入金。
    真实 Sumsub 自动核验本就只需 ~20-30 秒(非 24 小时), 此按钮只是免去现场等待沙箱回调。
    仅非 production 可用(与 HT_DEMO_BYPASS_2FA 等旁路一致); production 返回 403。"""
    if SUMSUB_ENVIRONMENT == "production":
        raise HTTPException(status_code=403, detail="Demo KYC approval is disabled in production")
    user = user_from_token(authorization)
    row = sumsub_get_local_kyc(user["id"])
    external_user_id = row["external_user_id"] if row else sumsub_user_id(user)
    level_name = (row["level_name"] if row else None) or SUMSUB_KYC_LEVEL_NAME
    applicant_id = (row["applicant_id"] if row else None) or ("demo-" + uuid.uuid4().hex[:16])
    sumsub_upsert_kyc(
        user_id=user["id"],
        external_user_id=external_user_id,
        applicant_id=applicant_id,
        level_name=level_name,
        status="approved",
        review_status="demo-approved",  # 标记: sumsub_kyc_status 不再回查覆盖
        review_answer="GREEN",
    )
    row = sumsub_persist_validity(user["id"]) or sumsub_get_local_kyc(user["id"])
    # Case-aware: 通过的 KYC 把已认领 case 移到 kyc_passed(6 日历月有效期)。
    sync_case_kyc_from_provider(user["id"], "approved", "GREEN", "", None)
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
            raise HTTPException(status_code=401, detail="Invalid verification provider webhook signature.")
    try:
        payload = json.loads(raw_body.decode() or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid verification provider webhook payload.")
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
    if row:
        sumsub_persist_validity(row["user_id"])  # PR③: GREEN 落 valid_until
        # Case-aware: provider 回调同步到已绑定的 admission case(安全原因分类)。
        sync_case_kyc_from_provider(
            row["user_id"], review["status"], review["reviewAnswer"],
            review["rejectionReason"], payload,
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


# --------------------------------------------------------------------------- #
# Hex Safe (Hex Trust) 托管集成 —— 发址 / 到账查询 / 提现
#   客户端 hexsafe_client.HexSafeClient 已对 sandbox 实测(发址按 vault×链固定 / 到账查询 /
#   提现 schema)。边界: Hex Safe 只做托管/发址/到账/提现/webhook; KYC + Travel Rule 走
#   Sumsub(见 memory tr-provider-sumsub)——两条边界不混。配置全走 env, 未配置时端点返回
#   503, 不影响认证 API 启动。资金/托管动作用 custodian 角色守卫 + write_audit 留痕。
# --------------------------------------------------------------------------- #
HEXSAFE_VAULT_ID = os.environ.get("HEXSAFE_VAULT_ID", "").strip()            # 默认 WTA vault(发址时也可显式传)
HEXSAFE_ENTERPRISE_ID = os.environ.get("HEXSAFE_ENTERPRISE_ID", "").strip()  # 提现必填 enterpriseId 的默认值

_hexsafe_client: Optional[HexSafeClient] = None


def hexsafe_configured() -> bool:
    has_key = bool(os.environ.get("HEXSAFE_API_KEY", "").strip())
    has_pk = bool(os.environ.get("HEXSAFE_PRIVATE_KEY", "").strip()
                  or os.environ.get("HEXSAFE_PRIVATE_KEY_PATH", "").strip())
    return has_key and has_pk


def get_hexsafe_client() -> HexSafeClient:
    """惰性单例。未配置 key/私钥 → 503(认证 API 仍可独立启动)。"""
    global _hexsafe_client
    if not hexsafe_configured():
        raise HTTPException(status_code=503, detail="Hex Safe is not configured (missing HEXSAFE_API_KEY / private key)")
    if _hexsafe_client is None:
        try:
            _hexsafe_client = HexSafeClient()
        except HexSafeError as e:
            raise HTTPException(status_code=503, detail=f"Hex Safe initialization failed: {e}")
    return _hexsafe_client


def _hexsafe_call(fn: Any, *args: Any, **kwargs: Any) -> Any:
    """统一把 HexSafeError 映射成 HTTPException(上游 4xx 透传, 5xx/网络归 502)。"""
    try:
        return fn(*args, **kwargs)
    except HexSafeError as e:
        status = e.status if (e.status and 400 <= e.status < 600) else 502
        raise HTTPException(status_code=status,
                            detail={"provider": "hexsafe", "error": str(e), "body": e.body})


def _hexsafe_idem_get(idem_key: str) -> Optional[dict]:
    """命中则返回缓存的成功响应; 否则 None。"""
    with db() as conn:
        row = conn.execute(
            "SELECT response_json FROM hexsafe_idempotency WHERE idem_key=?", (idem_key,)
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["response_json"])
    except Exception:
        return None


def _hexsafe_idem_put(idem_key: str, action: str, response: dict) -> None:
    """仅缓存成功响应; INSERT OR IGNORE 防并发重复写。"""
    with db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO hexsafe_idempotency(idem_key, action, response_json, created_at) VALUES (?,?,?,?)",
            (idem_key, action, json_dumps(response), int(time.time())),
        )
        conn.commit()


class HexSafeAddressIn(BaseModel):
    chainId: str
    vaultId: Optional[str] = None


class HexSafeWithdrawalIn(BaseModel):
    ticker: str
    chainId: str
    amountDecimal: str
    fromAddress: str
    toAddress: str
    enterpriseId: Optional[str] = None
    idempotencyKey: Optional[str] = None


@app.get("/api/hexsafe/health")
def hexsafe_health(user: Any = Depends(require_role(*STAFF_ROLES))):
    configured = hexsafe_configured()
    info: dict[str, Any] = {
        "ok": True,
        "provider": "hexsafe",
        "configured": configured,
        "baseUrl": os.environ.get("HEXSAFE_BASE_URL", "https://api.sandbox.hexsafe.hextrust.com"),
        "defaultVaultId": HEXSAFE_VAULT_ID or None,
        "status": "missing_credentials" if not configured else "configured",
    }
    if configured:
        try:
            vaults = get_hexsafe_client().list_vaults()
            vlist = vaults.get("vaultList", []) if isinstance(vaults, dict) else []
            info["status"] = "live"
            info["vaultCount"] = len(vlist)
        except (HexSafeError, HTTPException) as e:
            info["status"] = "configured_but_unreachable"
            info["error"] = str(getattr(e, "detail", e))
    return info


@app.get("/api/hexsafe/networks")
def hexsafe_networks(authorization: Optional[str] = Header(default=None)):
    """入金可选网络 —— 真实取自 Hex Safe `GET /supported_chains`(链 ID + minBlockConfirmation),
    按 Phase 1(USDT 稳定币 rail = EVM + Tron)筛选, 确认数用 Hex Safe 实际值(非硬编码)。
    未配置 Hex Safe → 空列表(不回退硬编码; 口径: 不确定就不显示)。任意登录用户可读(patron 选网络用)。"""
    user_from_token(authorization)
    if not hexsafe_configured():
        return {"configured": False, "source": "unavailable", "networks": []}
    raw = _hexsafe_call(get_hexsafe_client().supported_chains)
    clist = raw.get("supportedChainList", []) if isinstance(raw, dict) else []
    networks: list[dict[str, Any]] = []
    for ch in clist:
        if not isinstance(ch, dict):       # 外部响应可能含非 dict 项 → 跳过, 不崩
            continue
        cid = ch.get("chainID") or ch.get("chainId")
        if not cid:
            continue
        cid = str(cid)
        low = cid.lower()
        if low.startswith("tron"):
            rail = "tron"
        elif cid.isdigit() or low.startswith("0x"):
            rail = "ethereum"
        else:
            continue  # Phase 1 仅 USDT EVM/Tron 稳定币 rail, 其余链不展示
        try:                                # minBlockConfirmation 可能是 "5.0"/空/非数字
            conf = int(ch.get("minBlockConfirmation"))
        except (TypeError, ValueError):
            conf = None
        networks.append({
            "rail": rail,                 # 下游展示: ERC-20 / TRC-20
            "chainId": cid,               # Hex Safe 真实 chainId
            "name": ch.get("name") or ch.get("displayName") or ch.get("chainName") or cid,
            "minConfirmations": conf,
        })
    return {"configured": True, "source": "hexsafe", "networks": networks}


@app.get("/api/hexsafe/vaults")
def hexsafe_vaults(user: Any = Depends(require_role(*STAFF_ROLES))):
    return _hexsafe_call(get_hexsafe_client().list_vaults)


@app.post("/api/hexsafe/deposit-address")
def hexsafe_deposit_address(body: HexSafeAddressIn,
                            user: Any = Depends(require_role("custodian", "ops"))):
    """生成入金地址(Hex Safe 地址按 vault×链固定, 链级非资产级)。

    ⚠️ 业务上发址前须过 KYC(Sumsub) + source wallet KYT + Travel Rule(Sumsub) gate +
       TK Team 审批(process v1 §五④); 本端点只做托管侧发址, 门禁/审批由上层流程保证,
       此处仅 custodian/ops 角色守卫 + 审计留痕。
    """
    vault_id = (body.vaultId or HEXSAFE_VAULT_ID).strip()
    if not vault_id:
        raise HTTPException(status_code=400, detail="Missing vaultId (and HEXSAFE_VAULT_ID is not configured)")
    result = _hexsafe_call(get_hexsafe_client().create_deposit_address, vault_id, body.chainId)
    write_audit(user["id"], "hexsafe.deposit_address.create", "vault", vault_id,
                {"chainId": body.chainId, "address": (result or {}).get("address")})
    return {"ok": True, "provider": "hexsafe", **(result or {})}


@app.get("/api/hexsafe/transactions")
def hexsafe_transactions(vaultId: Optional[str] = None, limit: Optional[int] = None,
                         offset: Optional[int] = None, sort: Optional[str] = None,
                         user: Any = Depends(require_role(*STAFF_ROLES))):
    return _hexsafe_call(get_hexsafe_client().list_transactions,
                         vault_id=(vaultId or HEXSAFE_VAULT_ID or None),
                         limit=limit, offset=offset, sort=sort)


@app.get("/api/hexsafe/transactions/{trace_id}")
def hexsafe_transaction(trace_id: str, user: Any = Depends(require_role(*STAFF_ROLES))):
    return _hexsafe_call(get_hexsafe_client().get_transaction, trace_id)


@app.get("/api/hexsafe/deposit/{tx_hash}")
def hexsafe_deposit_by_tx(tx_hash: str, user: Any = Depends(require_role(*STAFF_ROLES))):
    result = _hexsafe_call(get_hexsafe_client().get_deposit_by_tx_hash, tx_hash)
    return {"ok": True, "provider": "hexsafe", "found": result is not None, "deposit": result}


@app.post("/api/hexsafe/withdrawal")
def hexsafe_withdrawal(body: HexSafeWithdrawalIn,
                       user: Any = Depends(require_role("custodian"))):
    """发起提现 / 退款(payout)。⚠️ 真实资金动作。

    放行由 Hex Safe 侧审批 / quorum 决定; 本端点只构造并提交请求 + 幂等 key + 审计。
    退款口径(process v1 §五⑤): to 只能是客户此前已验证过的原钱包之一——该校验须由上层
    退款审批流保证, 此处不放开任意地址。
    """
    enterprise_id = (body.enterpriseId or HEXSAFE_ENTERPRISE_ID).strip()
    if not enterprise_id:
        raise HTTPException(status_code=400, detail="Missing enterpriseId (and HEXSAFE_ENTERPRISE_ID is not configured)")
    # 幂等: 客户端带相同 idempotencyKey 重发 → 直接返回缓存的成功响应, 不重复发起转账。
    if body.idempotencyKey:
        cached = _hexsafe_idem_get(body.idempotencyKey)
        if cached is not None:
            write_audit(user["id"], "hexsafe.withdrawal.replay", "withdrawal", body.idempotencyKey, None)
            return {**cached, "replayed": True}
    idem = body.idempotencyKey or str(uuid.uuid4())
    # 提交前先审计, 即使上游超时也有留痕。
    write_audit(user["id"], "hexsafe.withdrawal.submit", "withdrawal", idem,
                {"ticker": body.ticker, "chainId": body.chainId, "amountDecimal": body.amountDecimal,
                 "from": body.fromAddress, "to": body.toAddress, "enterpriseId": enterprise_id})
    # 失败(余额/审批/网络)抛 HTTPException → 不缓存, 允许重试; 仅成功结果落缓存。
    result = _hexsafe_call(get_hexsafe_client().create_withdrawal,
                           enterprise_id, body.ticker, body.chainId, body.amountDecimal,
                           body.fromAddress, body.toAddress, idempotency_key=idem)
    payload = result if isinstance(result, dict) else {"result": result}
    response = {"ok": True, "provider": "hexsafe", "idempotencyKey": idem, **payload}
    _hexsafe_idem_put(idem, "withdrawal", response)
    return response


# --------------------------------------------------------------------------- #
# KYC 闸门(②) + 已验证原钱包 + 退款流(①, process v1 RETURN)
#   KYC 闸门: 关键动作前要求 KYC approved 且未过期(6 个月)。
#   退款强制原路: 目标只能是 verified_wallets 里本人的原钱包, 不接受自由输入新地址。
#   re-KYC + re-KYT(compliance 决策, 真实 KYT 接入见 ③) + 管理层审批 + vault 余额校验 +
#   真实 Hex Safe withdrawal 退回原钱包, transfer_id ↔ request_id 留痕。
# --------------------------------------------------------------------------- #
def user_kyc_ok(user_id: str) -> "tuple[bool, str]":
    """KYC 是否有效(approved 且未过期)。返回 (ok, reason)。供 KYC 闸门(②)与退款 re-KYC 复用。"""
    row = sumsub_persist_validity(user_id) or sumsub_get_local_kyc(user_id)
    if not row:
        return False, "KYC not started"
    if row["status"] != "approved":
        return False, f"KYC not approved (status={row['status']})"
    valid_until = _row_get(row, "valid_until")
    if valid_until and int(time.time()) > valid_until:
        return False, "KYC has expired (older than 6 months); re-verification required"
    return True, ""


def require_kyc(user_id: str) -> None:
    """KYC 硬阻断闸门(②): 不通过抛 403。用于发址/入金/退款等关键动作前。"""
    ok, reason = user_kyc_ok(user_id)
    if not ok:
        raise HTTPException(status_code=403, detail=f"KYC gate not passed: {reason}")


def record_verified_wallet(user_id: str, address: str, chain_id: str,
                           asset: str = "USDT", method: str = "wallet_screening") -> str:
    """记录客户已验证控制权的原钱包(入金流 ③ 调用)。退款只能退到这些钱包。
    幂等: 同 (user_id,address,chain_id) 已存在则返回既有 id(而非新 uuid)。"""
    with db() as conn:
        existing = conn.execute(
            "SELECT id FROM verified_wallets WHERE user_id=? AND address=? AND chain_id=?",
            (user_id, address, chain_id),
        ).fetchone()
        if existing:
            return existing["id"]
        wid = str(uuid.uuid4())
        # OR IGNORE + 回查: 并发下若他事务抢先插了同 (user,address,chain), UNIQUE 冲突被忽略, 回查取胜者 id。
        conn.execute(
            "INSERT OR IGNORE INTO verified_wallets(id,user_id,address,chain_id,asset,method,verified_at) VALUES(?,?,?,?,?,?,?)",
            (wid, user_id, address, chain_id, asset, method, int(time.time())),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id FROM verified_wallets WHERE user_id=? AND address=? AND chain_id=?",
            (user_id, address, chain_id),
        ).fetchone()
    return row["id"] if row else wid


def _vw_public(r: sqlite3.Row) -> dict[str, Any]:
    return {"id": r["id"], "address": r["address"], "chainId": r["chain_id"],
            "asset": r["asset"], "method": r["method"], "verifiedAt": r["verified_at"]}


def _refund_public(r: sqlite3.Row) -> dict[str, Any]:
    return {"id": r["id"], "userId": r["user_id"], "walletId": r["wallet_id"],
            "toAddress": r["to_address"], "chainId": r["chain_id"], "asset": r["asset"],
            "amountDecimal": r["amount_decimal"], "reason": r["reason"], "status": r["status"],
            "kycOk": bool(r["kyc_ok"]), "kytStatus": r["kyt_status"], "approvedBy": r["approved_by"],
            "transferId": r["transfer_id"], "createdAt": r["created_at"], "updatedAt": r["updated_at"]}


def _refund_get_or_404(rid: str) -> sqlite3.Row:
    with db() as conn:
        r = conn.execute("SELECT * FROM refund_requests WHERE id=?", (rid,)).fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Withdrawal request not found")
    return r


def _hexsafe_vault_has_balance(vault_id: str, ticker: str, amount_decimal: str) -> "tuple[bool, str]":
    """best-effort vault 余额校验: 取 vault assetList 对应 ticker 余额。sandbox 空 vault → 不足。"""
    try:
        v = get_hexsafe_client().get_vault(vault_id)
    except HexSafeError as e:
        return False, f"Unable to query vault: {e}"
    assets = (v.get("assetList") or []) if isinstance(v, dict) else []
    for a in assets:
        if isinstance(a, dict) and (a.get("ticker") or "").upper() == ticker.upper():
            try:
                bal = float(a.get("balance") or a.get("available") or 0)
                need = float(amount_decimal)
            except Exception:
                return False, "Failed to parse balance/amount"
            return (bal >= need), f"balance={bal} need={need}"
    return False, f"vault has no {ticker} balance"


class RefundCreateIn(BaseModel):
    walletId: str = Field(min_length=1)          # 必须是本人 verified_wallets 的 id(强制原钱包)
    amountDecimal: str = Field(min_length=1)
    reason: str = Field(default="", max_length=64)


class RefundScreenIn(BaseModel):
    decision: str = Field(default="pass")        # compliance 录入: pass / manual_review / reject


@app.get("/api/refunds/wallets")
def refund_wallets(authorization: Optional[str] = Header(default=None)):
    """客户已验证原钱包 = 退款唯一可选目标(不接受自由输入新地址)。"""
    user = user_from_token(authorization)
    with db() as conn:
        rows = conn.execute("SELECT * FROM verified_wallets WHERE user_id=? ORDER BY verified_at DESC",
                            (user["id"],)).fetchall()
    return {"ok": True, "wallets": [_vw_public(r) for r in rows]}


@app.post("/api/refunds")
def refund_create(body: RefundCreateIn, authorization: Optional[str] = Header(default=None)):
    """客户提交退款。强制原钱包: walletId 必须属于本人 verified_wallets(否则 400)。"""
    user = user_from_token(authorization)
    with db() as conn:
        w = conn.execute("SELECT * FROM verified_wallets WHERE id=? AND user_id=?",
                         (body.walletId, user["id"])).fetchone()
    if not w:
        raise HTTPException(status_code=400, detail="The withdrawal destination must be one of your previously verified wallets (new addresses are not accepted)")
    kyc_ok, kyc_reason = user_kyc_ok(user["id"])
    rid = "RF-" + time.strftime("%Y%m", time.gmtime()) + "-" + uuid.uuid4().hex[:8].upper()
    now = int(time.time())
    status = "requested" if kyc_ok else "kyc_failed"
    with db() as conn:
        conn.execute(
            """INSERT INTO refund_requests(id,user_id,wallet_id,to_address,chain_id,asset,amount_decimal,
                  reason,status,kyc_ok,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (rid, user["id"], w["id"], w["address"], w["chain_id"], w["asset"], body.amountDecimal,
             body.reason or None, status, 1 if kyc_ok else 0, now, now),
        )
        conn.commit()
    write_audit(user["id"], "withdrawal.create", "withdrawal", rid,
                {"walletId": w["id"], "amount": body.amountDecimal, "kycOk": kyc_ok})
    resp: dict[str, Any] = {"ok": kyc_ok, "requestId": rid, "status": status}
    if not kyc_ok:
        resp["detail"] = f"KYC 闸门未通过: {kyc_reason}"
    return resp


@app.get("/api/refunds/mine")
def refund_mine(authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    with db() as conn:
        rows = conn.execute("SELECT * FROM refund_requests WHERE user_id=? ORDER BY created_at DESC",
                            (user["id"],)).fetchall()
    return {"ok": True, "refunds": [_refund_public(r) for r in rows]}


@app.get("/api/refunds")
def refund_queue(status: Optional[str] = None,
                 user: Any = Depends(require_role("compliance", "ops", "custodian"))):
    with db() as conn:
        if status:
            rows = conn.execute("SELECT * FROM refund_requests WHERE status=? ORDER BY created_at DESC",
                                (status,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM refund_requests ORDER BY created_at DESC").fetchall()
    return {"ok": True, "refunds": [_refund_public(r) for r in rows]}


@app.post("/api/refunds/{rid}/screen")
def refund_screen(rid: str, body: RefundScreenIn, user: Any = Depends(require_role("compliance"))):
    """重新 KYT 原钱包(process v1: Wallet clear?)。
    ⚠️ KYT 暂由 compliance 录入决策(pass/manual_review/reject); 真实 KYT(Hex Safe/外部)接入见 ③。"""
    _refund_get_or_404(rid)
    decision = body.decision if body.decision in ("pass", "manual_review", "reject") else "manual_review"
    new_status = "kyt_failed" if decision == "reject" else "requested"
    with db() as conn:
        conn.execute("UPDATE refund_requests SET kyt_status=?, status=?, updated_at=? WHERE id=?",
                     (decision, new_status, int(time.time()), rid))
        conn.commit()
    write_audit(user["id"], "withdrawal.screen", "withdrawal", rid, {"decision": decision})
    return {"ok": True, "requestId": rid, "kytStatus": decision, "status": new_status}


@app.post("/api/refunds/{rid}/approve")
def refund_approve(rid: str, user: Any = Depends(require_role("compliance", "admin"))):
    """管理层/合规审批(process v1: Approved? by Management)。要求 KYC ok + 原钱包 KYT pass。"""
    r = _refund_get_or_404(rid)
    if not r["kyc_ok"]:
        raise HTTPException(status_code=409, detail="KYC not approved; cannot approve")
    if r["kyt_status"] != "pass":
        raise HTTPException(status_code=409, detail="Verified wallet KYT did not pass; cannot approve")
    with db() as conn:
        conn.execute("UPDATE refund_requests SET status='approved', approved_by=?, updated_at=? WHERE id=?",
                     (user["id"], int(time.time()), rid))
        conn.commit()
    write_audit(user["id"], "withdrawal.approve", "withdrawal", rid, None)
    return {"ok": True, "requestId": rid, "status": "approved"}


@app.post("/api/refunds/{rid}/reject")
def refund_reject(rid: str, user: Any = Depends(require_role("compliance", "admin"))):
    _refund_get_or_404(rid)
    with db() as conn:
        conn.execute("UPDATE refund_requests SET status='rejected', approved_by=?, updated_at=? WHERE id=?",
                     (user["id"], int(time.time()), rid))
        conn.commit()
    write_audit(user["id"], "withdrawal.reject", "withdrawal", rid, None)
    return {"ok": True, "requestId": rid, "status": "rejected"}


@app.post("/api/refunds/{rid}/execute")
def refund_execute(rid: str, user: Any = Depends(require_role("custodian"))):
    """custodian 执行退款: vault 余额校验 → 真实 Hex Safe withdrawal 退回原钱包 → transfer_id 留痕。"""
    r = _refund_get_or_404(rid)
    if r["status"] != "approved":
        raise HTTPException(status_code=409, detail="Withdrawal request is not approved; cannot execute")
    enterprise_id = HEXSAFE_ENTERPRISE_ID
    vault_id = HEXSAFE_VAULT_ID
    if not enterprise_id or not vault_id:
        raise HTTPException(status_code=400, detail="HEXSAFE_ENTERPRISE_ID / HEXSAFE_VAULT_ID are not configured")
    # vault 余额校验(process v1: Sufficient Fund in Vault?)
    bal_ok, bal_note = _hexsafe_vault_has_balance(vault_id, r["asset"], r["amount_decimal"])
    if not bal_ok:
        with db() as conn:
            conn.execute("UPDATE refund_requests SET status='insufficient_funds', updated_at=? WHERE id=?",
                         (int(time.time()), rid))
            conn.commit()
        write_audit(user["id"], "withdrawal.insufficient_funds", "withdrawal", rid, {"note": bal_note})
        raise HTTPException(status_code=409, detail=f"Insufficient vault balance: {bal_note}")
    idem = r["idempotency_key"] or str(uuid.uuid4())
    client = get_hexsafe_client()
    from_addr = (client.create_deposit_address(vault_id, r["chain_id"]) or {}).get("address", "")
    write_audit(user["id"], "withdrawal.execute.submit", "withdrawal", rid,
                {"to": r["to_address"], "amount": r["amount_decimal"], "idem": idem})
    result = _hexsafe_call(client.create_withdrawal, enterprise_id, r["asset"], r["chain_id"],
                           r["amount_decimal"], from_addr, r["to_address"], idempotency_key=idem)
    transfer_id = (result.get("traceId") or result.get("transferId") or idem) if isinstance(result, dict) else idem
    with db() as conn:
        conn.execute("UPDATE refund_requests SET status='completed', transfer_id=?, idempotency_key=?, updated_at=? WHERE id=?",
                     (transfer_id, idem, int(time.time()), rid))
        conn.commit()
    write_audit(user["id"], "withdrawal.completed", "withdrawal", rid, {"transferId": transfer_id})
    return {"ok": True, "requestId": rid, "status": "completed", "transferId": transfer_id}


# --------------------------------------------------------------------------- #
# 入金编排(②KYC 硬阻断 + ③真实发址 / 1 USDT 验证 / verified_wallets)
#   process v1 §B: Select network+wallet → Wallet Screening → 1 USDT verification →
#                  Main deposit → (≥USD1k 收 Travel Rule) → Custodian 确认入 vault / Forex 兑法币 →
#                  Marker 录回 → Receipt → Settlement。
#   KYC 硬阻断(②): create / screen / issue-address 前 require_kyc(approved 且未过期 6 个月),
#                  这就是 "hold→active" 的实现 —— 无独立 hold 列, KYC 有效性即闸门(见 user_kyc_ok)。
#   发址(③): Hex Safe 地址按 vault×链固定, 由平台(后端持 key)在 gate 通过后签发; 1 USDT 到账
#            即把 source_wallet 写入 verified_wallets, 供退款①强制原路退回。
#   真实 vs demo: 配置了 Hex Safe → 走真实(发址/查到账); 未配置且非 production → demo 占位
#                (与 DEMO_LOCAL_SESSION_TOKEN 同语义), 让本地/演示全链路可跑。
# --------------------------------------------------------------------------- #
DEPOSIT_TR_THRESHOLD_USD = 1000.0          # process v1: ≥ USD 1,000 触发 Travel Rule(USDT≈USD)
DEPOSIT_FIAT_CURRENCY = os.environ.get("DEPOSIT_FIAT_CURRENCY", "HKD").strip() or "HKD"
DEPOSIT_FIAT_RATE = float(os.environ.get("DEPOSIT_FIAT_RATE", "7.8"))  # ④ demo: USDT→法币参考汇率


def resolve_chain_id(network: str) -> str:
    """把前端 network(ethereum/tron) 解析成 Hex Safe chainId。sandbox testnet 默认
    ethereum→11155111(Sepolia)、tron→tron:nile, 可经 env 覆盖到 mainnet。已是 chainId 形态原样用。"""
    n = (network or "").strip().lower()
    overrides = {
        "ethereum": os.environ.get("HEXSAFE_CHAIN_ETHEREUM", "11155111").strip(),
        "tron": os.environ.get("HEXSAFE_CHAIN_TRON", "tron:nile").strip(),
    }
    if n in overrides and overrides[n]:
        return overrides[n]
    if n.isdigit() or ":" in n:
        return network.strip()
    raise HTTPException(status_code=400, detail=f"Unsupported network: {network} (Phase 1 supports ethereum / tron only)")


def screen_source_wallet(address: str, chain_id: str) -> dict[str, Any]:
    """来源钱包 KYT 筛查(③ Wallet Screening)。

    ⚠️ 真实 KYT 口径见 CLAUDE.md §4.4: Chainalysis / TRM / Elliptic 或 Hex Trust KYT(合同级)。
    Hex Safe sandbox 未提供文档化的 screening/KYT 端点(本仓库 hexsafe_client 无该方法), 且本机
    无 Hex Safe 凭据无法探测 —— 故先用确定性 mock(与前端 WalletScreening 同口径), 结构化封装,
    接通真实 KYT 时仅换本函数实现、不动编排。# MOCK
    """
    a = (address or "").lower()
    ref = "KYT-DEP-" + uuid.uuid4().hex[:8].upper()
    if any(k in a for k in ("bad", "sanction", "blocked", "ofac")):
        return {"decision": "fail", "provider": "mock", "riskScore": 92, "reference": ref,
                "note": "Source wallet matched a high-risk/sanctioned sample rule"}
    if any(k in a for k in ("edd", "review", "mixer", "tornado")):
        return {"decision": "edd", "provider": "mock", "riskScore": 61, "reference": ref,
                "note": "Source wallet triggered an enhanced due diligence (EDD) sample rule"}
    return {"decision": "pass", "provider": "mock", "riskScore": 9, "reference": ref,
            "note": "Source wallet did not match any risk rule"}


def _deposit_vault_id() -> str:
    return HEXSAFE_VAULT_ID or "demo-wta-vault"


def _demo_deposit_address(vault_id: str, chain_id: str) -> str:
    """非生产 demo 占位地址(无 Hex Safe 凭据时)。按 vault×链确定性派生, 与真实"地址固定"语义一致。"""
    seed = hashlib.sha256(f"{vault_id}|{chain_id}".encode()).hexdigest()
    if chain_id.startswith("tron"):
        return "T" + seed[:33].upper()
    return "0x" + seed[:40]


def _deposit_public(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"], "userId": r["user_id"], "asset": r["asset"], "network": r["network"],
        "chainId": r["chain_id"], "amountDecimal": r["amount_decimal"], "sourceWallet": r["source_wallet"],
        "screeningStatus": r["screening_status"], "screeningRef": r["screening_ref"],
        "screeningDetail": r["screening_detail"],
        "travelRuleRequired": bool(r["travel_rule_required"]), "travelRuleStatus": r["travel_rule_status"],
        "depositAddress": r["deposit_address"], "vaultId": r["vault_id"],
        "verifyTxHash": r["verify_tx_hash"], "verifyStatus": r["verify_status"],
        "verifiedWalletId": r["verified_wallet_id"], "markerRef": r["marker_ref"],
        "fiatCurrency": r["fiat_currency"], "fiatAmount": r["fiat_amount"], "receiptRef": r["receipt_ref"],
        "status": r["status"], "createdAt": r["created_at"], "updatedAt": r["updated_at"],
    }


def _deposit_get_or_404(did: str) -> sqlite3.Row:
    with db() as conn:
        r = conn.execute("SELECT * FROM deposit_requests WHERE id=?", (did,)).fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Deposit request not found")
    return r


def _deposit_owned_or_404(did: str, user_id: str) -> sqlite3.Row:
    r = _deposit_get_or_404(did)
    if r["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Deposit request not found")  # 不泄露他人单据存在性
    return r


def _deposit_update(did: str, **fields: Any) -> None:
    if not fields:
        return
    fields["updated_at"] = int(time.time())
    cols = ", ".join(f"{k}=?" for k in fields)
    with db() as conn:
        conn.execute(f"UPDATE deposit_requests SET {cols} WHERE id=?", (*fields.values(), did))
        conn.commit()


def _tr_required(amount_decimal: Optional[str]) -> bool:
    try:
        return float(amount_decimal or 0) >= DEPOSIT_TR_THRESHOLD_USD
    except (TypeError, ValueError):
        return False


class DepositCreateIn(BaseModel):
    asset: str = Field(default="USDT")
    network: str = Field(min_length=1)            # ethereum / tron
    amountDecimal: str = Field(default="")        # 可空: 主金额通常在 main 步骤填


class DepositScreenIn(BaseModel):
    sourceWallet: str = Field(min_length=4, max_length=128)


class DepositIssueAddressIn(BaseModel):
    # 前端在 TR 步骤(Sumsub 驱动; 账户未激活时 mock 接受)拿到的 Travel Rule gate 结果, 回填对齐入金单。
    travelRuleStatus: str = Field(default="", max_length=48)


class DepositConfirmTestIn(BaseModel):
    txHash: str = Field(default="", max_length=128)


class DepositMainIn(BaseModel):
    amountDecimal: str = Field(min_length=1)
    travelRuleStatus: str = Field(default="")     # 前端 TR gate 结果回填


class DepositMarkerIn(BaseModel):
    markerRef: str = Field(min_length=1, max_length=64)


class DepositSettleIn(BaseModel):
    fiatCurrency: str = Field(default="")


@app.get("/api/deposits/eligibility")
def deposit_eligibility(authorization: Optional[str] = Header(default=None)):
    """入金资格(②): KYC approved 且未过期才 active, 否则 hold。前端据此显示/灰化入金入口。"""
    user = user_from_token(authorization)
    ok, reason = user_kyc_ok(user["id"])
    return {"ok": True, "kycOk": ok, "accountState": "active" if ok else "hold",
            "reason": reason, "asset": "USDT", "travelRuleThresholdUsd": DEPOSIT_TR_THRESHOLD_USD}


@app.post("/api/deposits")
def deposit_create(body: DepositCreateIn, authorization: Optional[str] = Header(default=None)):
    """patron 发起入金单。②KYC 硬阻断: 未过 KYC 闸门直接 403(不建单)。"""
    user = user_from_token(authorization)
    require_kyc(user["id"])                                   # ② 硬阻断
    asset = (body.asset or "USDT").strip().upper()
    if asset != "USDT":
        raise HTTPException(status_code=400, detail="Phase 1 supports USDT only")
    chain_id = resolve_chain_id(body.network)
    tr_required = _tr_required(body.amountDecimal)
    did = "DR-" + time.strftime("%Y%m", time.gmtime()) + "-" + uuid.uuid4().hex[:8].upper()
    now = int(time.time())
    with db() as conn:
        conn.execute(
            """INSERT INTO deposit_requests(id,user_id,asset,network,chain_id,amount_decimal,
                  travel_rule_required,travel_rule_status,verify_status,status,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (did, user["id"], asset, body.network.strip().lower(), chain_id,
             body.amountDecimal or None, 1 if tr_required else 0,
             "travel_rule_required" if tr_required else "not_required", "pending", "created", now, now),
        )
        conn.commit()
    write_audit(user["id"], "deposit.create", "deposit", did,
                {"asset": asset, "network": body.network, "chainId": chain_id, "trRequired": tr_required})
    return {"ok": True, "requestId": did, "status": "created", "chainId": chain_id,
            "travelRuleRequired": tr_required}


@app.get("/api/deposits/mine")
def deposit_mine(authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    with db() as conn:
        rows = conn.execute("SELECT * FROM deposit_requests WHERE user_id=? ORDER BY created_at DESC",
                            (user["id"],)).fetchall()
    return {"ok": True, "deposits": [_deposit_public(r) for r in rows]}


@app.get("/api/deposits")
def deposit_queue(status: Optional[str] = None,
                  user: Any = Depends(require_role("compliance", "ops", "custodian"))):
    """staff 入金队列(运营/合规/托管)。"""
    with db() as conn:
        if status:
            rows = conn.execute("SELECT * FROM deposit_requests WHERE status=? ORDER BY created_at DESC",
                                (status,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM deposit_requests ORDER BY created_at DESC").fetchall()
    return {"ok": True, "deposits": [_deposit_public(r) for r in rows]}


@app.get("/api/deposits/{did}")
def deposit_get(did: str, authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    r = _deposit_get_or_404(did)
    if r["user_id"] != user["id"] and not (set(get_user_roles(user["id"])) & ({"admin"} | STAFF_ROLES)):
        raise HTTPException(status_code=404, detail="Deposit request not found")
    return {"ok": True, "deposit": _deposit_public(r)}


@app.post("/api/deposits/{did}/screen")
def deposit_screen(did: str, body: DepositScreenIn, authorization: Optional[str] = Header(default=None)):
    """提交来源钱包做 KYT(③ Wallet Screening)。②KYC 硬阻断同样在此校验。"""
    user = user_from_token(authorization)
    require_kyc(user["id"])                                   # ② 硬阻断
    r = _deposit_owned_or_404(did, user["id"])
    # 来源钱包在发址后不可变(地址已固定、可能已进入 1 USDT 验证)→ 只允许发址前筛查/改钱包。
    if r["status"] not in ("created", "screening_passed", "screening_failed"):
        raise HTTPException(status_code=409, detail="Deposit address already issued; the source wallet cannot be changed or re-screened")
    result = screen_source_wallet(body.sourceWallet, r["chain_id"])
    decision = result["decision"]
    new_status = "screening_passed" if decision == "pass" else "screening_failed"
    _deposit_update(did, source_wallet=body.sourceWallet.strip(), screening_status=decision,
                    screening_ref=result["reference"], screening_detail=result["note"], status=new_status)
    write_audit(user["id"], "deposit.screen", "deposit", did,
                {"decision": decision, "provider": result["provider"], "riskScore": result["riskScore"]})
    return {"ok": decision == "pass", "requestId": did, "screeningStatus": decision,
            "status": new_status, "provider": result["provider"], "reference": result["reference"],
            "riskScore": result["riskScore"], "note": result["note"]}


@app.post("/api/deposits/{did}/issue-address")
def deposit_issue_address(did: str, body: DepositIssueAddressIn = DepositIssueAddressIn(),
                          authorization: Optional[str] = Header(default=None)):
    """签发入金地址(③)。三闸门: ②KYC ok + source wallet KYT pass + Travel Rule gate(若需要)。
    地址按 Hex Safe vault×链固定; 平台(后端持 key)签发, 未配置且非 prod 走 demo 占位。"""
    user = user_from_token(authorization)
    require_kyc(user["id"])                                   # ② 硬阻断(再次校验, 防 KYC 中途过期)
    r = _deposit_owned_or_404(did, user["id"])
    if r["screening_status"] != "pass":
        raise HTTPException(status_code=409, detail="Source wallet KYT did not pass; cannot issue the deposit address")
    # Travel Rule gate: 需要 TR 时, 用前端回填的 TR 结果(TR 步骤先于发址完成)对齐到入金单后再判闸门。
    # 否则 ≥USD1k 的单 travel_rule_status 永远停在 'travel_rule_required' → 永久 409。
    tr_status = r["travel_rule_status"]
    if r["travel_rule_required"] and body.travelRuleStatus.strip():
        tr_status = body.travelRuleStatus.strip()
    if r["travel_rule_required"] and tr_status not in ("travel_rule_accepted", "not_required"):
        raise HTTPException(status_code=409, detail="Travel Rule not passed; cannot issue the deposit address")
    vault_id = _deposit_vault_id()
    if hexsafe_configured():
        result = _hexsafe_call(get_hexsafe_client().create_deposit_address, vault_id, r["chain_id"])
        address = (result or {}).get("address", "")
        provider = "hexsafe"
    elif SUMSUB_ENVIRONMENT != "production":
        address = _demo_deposit_address(vault_id, r["chain_id"])
        provider = "mock"
    else:
        raise HTTPException(status_code=503, detail="Hex Safe is not configured; cannot issue a deposit address")
    if not address:
        raise HTTPException(status_code=502, detail="Hex Safe did not return an address")
    _deposit_update(did, deposit_address=address, vault_id=vault_id,
                    travel_rule_status=tr_status, status="address_issued")
    write_audit(user["id"], "deposit.issue_address", "deposit", did,
                {"provider": provider, "chainId": r["chain_id"], "vaultId": vault_id, "address": address})
    return {"ok": True, "requestId": did, "status": "address_issued", "depositAddress": address,
            "chainId": r["chain_id"], "vaultId": vault_id, "provider": provider}


@app.post("/api/deposits/{did}/confirm-test")
def deposit_confirm_test(did: str, body: DepositConfirmTestIn,
                         authorization: Optional[str] = Header(default=None)):
    """1 USDT 验证(③): 确认 source_wallet→vault 地址的 1 USDT 到账 → 写入 verified_wallets。
    真实: 配置 Hex Safe → 必须凭真实 txHash 查到账; 仅**未配置**且非 prod 才 demo 确认。"""
    user = user_from_token(authorization)
    require_kyc(user["id"])                                   # ② 硬阻断: verified_wallets 是退款信任锚, 写入前 KYC 必须 ok
    r = _deposit_owned_or_404(did, user["id"])
    if r["status"] not in ("address_issued", "verified", "main_submitted"):
        raise HTTPException(status_code=409, detail="Deposit address not yet issued; cannot confirm the 1 USDT verification")
    if not r["source_wallet"]:
        raise HTTPException(status_code=409, detail="Source wallet missing; cannot record a verified wallet")
    tx_hash = body.txHash.strip()
    # 真实优先且不可绕过: 配置 Hex Safe 时, 必须有真实 txHash 且查得到到账(不接受空/伪造 hash, 任何
    # 环境都如此, 防 verified_wallets 被无证据污染); 仅在**未配置** Hex Safe 且非 prod 时才 demo 占位。
    if hexsafe_configured():
        provider = "hexsafe"
        if not tx_hash:
            raise HTTPException(status_code=400, detail="Missing txHash; cannot verify the 1 USDT deposit")
        dep = _hexsafe_call(get_hexsafe_client().get_deposit_by_tx_hash, tx_hash)
        if not dep:
            raise HTTPException(status_code=409, detail="No deposit found on Hex Safe for this txHash; please try again later")
    elif SUMSUB_ENVIRONMENT != "production":
        provider = "mock"                                    # demo 确认(无 Hex Safe 凭据)
        if not tx_hash:
            tx_hash = "0xdemo" + uuid.uuid4().hex
    else:
        raise HTTPException(status_code=503, detail="Hex Safe is not configured; cannot verify the 1 USDT deposit")
    wid = record_verified_wallet(user["id"], r["source_wallet"], r["chain_id"],
                                 asset=r["asset"], method="1usdt_verification")
    # 幂等再确认不回退状态: 已进入 main_submitted/settled 的单不降回 verified。
    new_status = "verified" if r["status"] == "address_issued" else r["status"]
    _deposit_update(did, verify_tx_hash=tx_hash, verify_status="confirmed",
                    verified_wallet_id=wid, status=new_status)
    write_audit(user["id"], "deposit.confirm_test", "deposit", did,
                {"provider": provider, "txHash": tx_hash, "verifiedWalletId": wid,
                 "sourceWallet": r["source_wallet"]})
    return {"ok": True, "requestId": did, "status": "verified", "verifiedWalletId": wid,
            "txHash": tx_hash, "provider": provider}


@app.post("/api/deposits/{did}/main")
def deposit_main(did: str, body: DepositMainIn, authorization: Optional[str] = Header(default=None)):
    """主入金金额(③/process v1 §B4-5): 填最终金额, ≥USD1k 标记 Travel Rule required。"""
    user = user_from_token(authorization)
    require_kyc(user["id"])                                   # ② 硬阻断
    r = _deposit_owned_or_404(did, user["id"])
    if r["status"] in ("settled", "cancelled"):
        raise HTTPException(status_code=409, detail="This deposit request is closed; the main deposit can no longer be submitted")
    if r["verify_status"] != "confirmed":
        raise HTTPException(status_code=409, detail="Please complete the 1 USDT verification first")
    tr_required = _tr_required(body.amountDecimal)
    tr_status = body.travelRuleStatus.strip() or r["travel_rule_status"]
    if tr_required and tr_status == "not_required":
        tr_status = "travel_rule_required"
    if not tr_required:
        tr_status = "not_required"
    _deposit_update(did, amount_decimal=body.amountDecimal, travel_rule_required=1 if tr_required else 0,
                    travel_rule_status=tr_status, status="main_submitted")
    write_audit(user["id"], "deposit.main", "deposit", did,
                {"amount": body.amountDecimal, "trRequired": tr_required, "trStatus": tr_status})
    return {"ok": True, "requestId": did, "status": "main_submitted",
            "travelRuleRequired": tr_required, "travelRuleStatus": tr_status}


@app.post("/api/deposits/{did}/marker")
def deposit_marker(did: str, body: DepositMarkerIn,
                   user: Any = Depends(require_role("marketing", "ops", "admin"))):
    """⑤(demo): Int'l Marketing 把外部签发的 Marker 编号录回系统。
    Marker reference 代表 casino marker/筹码已给到客户, 因此入金单进入 settled。
    """
    r = _deposit_get_or_404(did)
    if r["verify_status"] != "confirmed":
        raise HTTPException(status_code=409, detail="The 1 USDT verification is not complete; cannot record settlement marker")
    marker_ref = body.markerRef.strip()
    _deposit_update(did, marker_ref=marker_ref, status="settled")
    write_audit(user["id"], "deposit.marker", "deposit", did, {"markerRef": marker_ref})
    return {"ok": True, "requestId": did, "status": "settled", "markerRef": marker_ref}


@app.post("/api/deposits/{did}/settle")
def deposit_settle(did: str, body: DepositSettleIn,
                   user: Any = Depends(require_role("custodian", "ops"))):
    """④+⑤(demo): Custodian 确认入 vault → Forex 兑法币(demo 汇率) → 生成 Receipt → settled。
    ⚠️ Forex 为 demo: Hex Trust 口径 HT Markets OTC 无 quote/order API(见 CLAUDE.md §8.5),
       真实兑换为高触人工; 接通真实端点见 /api/hexsafe/forex/probe 的探测结论。"""
    r = _deposit_get_or_404(did)
    if r["verify_status"] != "confirmed":
        raise HTTPException(status_code=409, detail="The 1 USDT verification is not complete; cannot settle")
    fiat_ccy = (body.fiatCurrency or DEPOSIT_FIAT_CURRENCY).strip().upper()
    try:
        fiat_amount = f"{float(r['amount_decimal'] or 0) * DEPOSIT_FIAT_RATE:.2f}"
    except (TypeError, ValueError):
        fiat_amount = ""
    receipt_ref = "RC-" + time.strftime("%Y%m", time.gmtime()) + "-" + uuid.uuid4().hex[:8].upper()
    _deposit_update(did, fiat_currency=fiat_ccy, fiat_amount=fiat_amount,
                    receipt_ref=receipt_ref, status="settled")
    write_audit(user["id"], "deposit.settle", "deposit", did,
                {"fiatCurrency": fiat_ccy, "fiatAmount": fiat_amount, "receiptRef": receipt_ref,
                 "forex": "demo"})
    return {"ok": True, "requestId": did, "status": "settled", "fiatCurrency": fiat_ccy,
            "fiatAmount": fiat_amount, "receiptRef": receipt_ref, "forex": "demo"}


@app.get("/api/hexsafe/forex/probe")
def hexsafe_forex_probe(user: Any = Depends(require_role("custodian", "ops", "admin"))):
    """④ 探测 Hex Safe 是否提供 forex / conversion / OTC 端点。

    口径(CLAUDE.md §8.5 / Hex Trust 36 问澄清): HT Markets OTC 无 quote/order API, 真实兑换
    为高触人工。本探测仅用文档化只读端点(supported_assets / enterprises.baseCurrency)判断是否
    存在 fiat 结算线索, 不臆造路径乱打 404。无凭据时如实回报 unconfigured。
    """
    if not hexsafe_configured():
        return {"ok": True, "configured": False, "forexApiAvailable": False,
                "note": "No Hex Safe credentials, cannot probe; settlement Forex is currently demo (indicative rate).",
                "guidance": "接通真实凭据后再核; 据 Hex Trust 口径 HT Markets OTC 无 quote/order API。"}
    findings: dict[str, Any] = {"ok": True, "configured": True, "forexApiAvailable": False}
    try:
        assets = get_hexsafe_client().supported_assets()
        alist = assets.get("supportedAssetList", []) if isinstance(assets, dict) else []
        fiat = [a for a in alist if isinstance(a, dict) and str(a.get("type", "")).lower() in ("fiat", "currency")]
        findings["supportedAssetCount"] = len(alist)
        findings["fiatAssetsSeen"] = [a.get("ticker") or a.get("symbol") for a in fiat]
    except (HexSafeError, HTTPException) as e:
        findings["supportedAssetsError"] = str(getattr(e, "detail", e))
    try:
        ents = get_hexsafe_client().list_enterprises()
        elist = ents.get("enterpriseList", []) if isinstance(ents, dict) else []
        findings["enterpriseBaseCurrencies"] = [e.get("baseCurrency") for e in elist if isinstance(e, dict)]
    except (HexSafeError, HTTPException) as e:
        findings["enterprisesError"] = str(getattr(e, "detail", e))
    findings["note"] = ("Hex Safe 未暴露 quote/order 转换 API(据 Hex Trust 口径); 上方仅为 fiat 结算线索。"
                        " 结算 Forex 暂为 demo, 真实兑换走高触人工 / 合同约定渠道。")
    return findings


# --------------------------------------------------------------------------- #
# Host-led VIP admission — Host provisioning + admission-case APIs (2026-08-21)
# --------------------------------------------------------------------------- #
# Hosts and the sole business leader authenticate through the existing staff
# session boundary; production Okta OIDC remains a provider boundary (fails
# closed when unconfigured). `host` and `leader` are staff roles alongside the
# legacy roles. Hosts only ever touch their own admission cases.
# --------------------------------------------------------------------------- #
ADMISSION_ROUTES = ("complete_dossier", "kyc_first")


def mask_email(email: str) -> str:
    """Mask an email for non-owner viewers, e.g. vip@example.test -> v***@example.test."""
    email = normalize_email(email)
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    visible = local[:1] if local else ""
    return f"{visible}***@{domain}"


def _host_profile_get(user_id: str) -> Optional[sqlite3.Row]:
    with db() as conn:
        return conn.execute(
            "SELECT * FROM host_profiles WHERE user_id=?", (user_id,)
        ).fetchone()


def _host_profile_public(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "userId": row["user_id"],
        "employeeId": row["employee_id"],
        "department": row["department"],
        "operatingTeam": row["operating_team"],
        "location": row["location"],
        "phone": row["phone"],
        "status": row["status"],
        "acknowledgedAt": row["acknowledged_at"],
        "updatedAt": row["updated_at"],
    }


def _require_active_host(user: Any) -> sqlite3.Row:
    """Host gate: role `host` + host_profiles.status == 'active', else 403."""
    profile = _host_profile_get(user["id"])
    if not profile or profile["status"] != "active":
        raise HTTPException(
            status_code=403,
            detail="Host profile is not active; activate it before managing VIP admission cases",
        )
    return profile


def _user_name(user_id: str) -> str:
    with db() as conn:
        row = conn.execute("SELECT name FROM users WHERE id=?", (user_id,)).fetchone()
    return row["name"] if row else ""


def _admission_case_invitation_view(case_id: str) -> dict[str, Any]:
    """Latest live (unconsumed, unrevoked) email / QR session expiries (ISO)."""
    with db() as conn:
        email_row = conn.execute(
            """SELECT expires_at FROM admission_invitation_sessions
               WHERE admission_case_id=? AND channel='email'
                 AND consumed_at IS NULL AND revoked_at IS NULL
               ORDER BY created_at DESC LIMIT 1""",
            (case_id,),
        ).fetchone()
        qr_row = conn.execute(
            """SELECT expires_at FROM admission_invitation_sessions
               WHERE admission_case_id=? AND channel='qr'
                 AND consumed_at IS NULL AND revoked_at IS NULL
               ORDER BY created_at DESC LIMIT 1""",
            (case_id,),
        ).fetchone()
    return {
        "emailExpiresAt": (
            datetime.fromtimestamp(email_row["expires_at"], tz=timezone.utc).isoformat()
            if email_row
            else None
        ),
        "qrExpiresAt": (
            datetime.fromtimestamp(qr_row["expires_at"], tz=timezone.utc).isoformat()
            if qr_row
            else None
        ),
    }


def _admission_case_public(
    row: sqlite3.Row, viewer_user_id: str, viewer_roles: set[str]
) -> dict[str, Any]:
    """Safe case projection.

    Host notes, the full patron email and the internal KYC reason code are only
    returned to the case-owner Host, Compliance and Admin — never to the VIP or
    the leader. The Host additionally receives only the safe KYC category
    message (kycHostMessage), never raw provider detail.
    """
    is_owner_host = row["host_user_id"] == viewer_user_id and "host" in viewer_roles
    show_internal = is_owner_host or "compliance" in viewer_roles or "admin" in viewer_roles
    kyc_message = ""
    if row["kyc_reason_code"]:
        kyc_message, _ = host_kyc_reason(row["kyc_reason_code"])
    return {
        "id": row["id"],
        "hostUserId": row["host_user_id"],
        "hostName": _user_name(row["host_user_id"]),
        "patronEmail": row["patron_email"] if show_internal else "",
        "patronEmailMasked": mask_email(row["patron_email"]),
        "memberReference": row["member_reference"],
        "servicePurpose": row["service_purpose"],
        "hostNotes": row["host_notes"] if show_internal else None,
        "preferredLanguage": row["preferred_language"],
        "route": row["route"],
        "patronUserId": row["patron_user_id"],
        "status": row["status"],
        "leaderUserId": row["leader_user_id"],
        "kycReasonCode": row["kyc_reason_code"] if show_internal else None,
        "kycHostMessage": kyc_message or None,
        "kycValidUntil": row["kyc_valid_until"],
        "invitation": _admission_case_invitation_view(row["id"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _admission_case_get_or_404(case_id: str) -> sqlite3.Row:
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM vip_admission_cases WHERE id=?", (case_id,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Admission case not found")
    return row


def _admission_case_update(case_id: str, **fields: Any) -> None:
    fields["updated_at"] = int(time.time())
    assignments = ", ".join(f"{key}=?" for key in fields)
    with db() as conn:
        conn.execute(
            f"UPDATE vip_admission_cases SET {assignments} WHERE id=?",
            (*fields.values(), case_id),
        )
        conn.commit()


def _admission_viewer_may_read(row: sqlite3.Row, user: Any) -> bool:
    """Read access: owner Host, Compliance, Admin, or the bound VIP patron."""
    roles = set(get_user_roles(user["id"]))
    if "admin" in roles or "compliance" in roles:
        return True
    if "host" in roles and row["host_user_id"] == user["id"]:
        return True
    if row["patron_user_id"] and row["patron_user_id"] == user["id"]:
        return True
    return False


class HostProfileActivateIn(BaseModel):
    employeeId: Optional[str] = None
    department: Optional[str] = None
    operatingTeam: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    acknowledged: bool = False


class AdmissionCaseCreateIn(BaseModel):
    patronEmail: str
    memberReference: Optional[str] = None
    servicePurpose: Optional[str] = None
    hostNotes: Optional[str] = None
    preferredLanguage: Optional[str] = None
    route: str = "complete_dossier"


@app.post("/api/host/profile/activate")
def host_profile_activate(
    body: HostProfileActivateIn,
    user: Any = Depends(require_role("host")),
):
    """Create/refresh the Host profile from the staff (Okta) identity and mark it
    active once the operational fields are complete and the customer-data
    handling policy is acknowledged. Production fails closed without real Okta
    OIDC configuration."""
    try:
        require_host_provisioning(dict(os.environ), SUMSUB_ENVIRONMENT)
    except HostProvisioningUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    now = int(time.time())
    complete = bool(body.acknowledged and (body.operatingTeam or "").strip() and (body.location or "").strip())
    status = "active" if complete else "pending"
    existing = _host_profile_get(user["id"])
    with db() as conn:
        if existing:
            conn.execute(
                """UPDATE host_profiles
                   SET employee_id=?, department=?, operating_team=?, location=?,
                       phone=?, status=?, acknowledged_at=?, updated_at=?
                   WHERE user_id=?""",
                (
                    body.employeeId, body.department, body.operatingTeam, body.location,
                    body.phone, status,
                    now if body.acknowledged else existing["acknowledged_at"],
                    now, user["id"],
                ),
            )
        else:
            conn.execute(
                """INSERT INTO host_profiles(
                       user_id, employee_id, department, operating_team, location,
                       phone, status, acknowledged_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    user["id"], body.employeeId, body.department, body.operatingTeam,
                    body.location, body.phone, status,
                    now if body.acknowledged else None, now,
                ),
            )
        conn.commit()
    row = _host_profile_get(user["id"])
    write_audit(
        user["id"], "host.profile.activate", "host_profile", user["id"],
        {"hostUserId": user["id"], "status": status},
    )
    return {"ok": True, "profile": _host_profile_public(row)}


@app.get("/api/host/profile")
def host_profile_get(user: Any = Depends(require_role("host"))):
    row = _host_profile_get(user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Host profile not found")
    return {"profile": _host_profile_public(row)}


@app.post("/api/admission-cases")
def admission_case_create(
    body: AdmissionCaseCreateIn,
    user: Any = Depends(require_role("host")),
):
    """An active Host creates one VIP admission case. The case starts as `draft`;
    invitation delivery (email / dynamic QR) happens in the claim flow."""
    _require_active_host(user)
    patron_email = normalize_email(body.patronEmail)
    if "@" not in patron_email or "." not in patron_email:
        raise HTTPException(status_code=400, detail="Invalid patron email")
    if body.route not in ADMISSION_ROUTES:
        raise HTTPException(
            status_code=400,
            detail=f"route must be one of {', '.join(ADMISSION_ROUTES)}",
        )
    case_id = str(uuid.uuid4())
    now = int(time.time())
    with db() as conn:
        conn.execute(
            """INSERT INTO vip_admission_cases(
                   id, host_user_id, patron_email, member_reference, service_purpose,
                   host_notes, preferred_language, route, patron_user_id, status,
                   leader_user_id, kyc_reason_code, kyc_valid_until, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                case_id, user["id"], patron_email, body.memberReference,
                body.servicePurpose, body.hostNotes, body.preferredLanguage,
                body.route, None, "draft", None, None, None, now, now,
            ),
        )
        conn.commit()
    write_audit(
        user["id"], "admission.case.create", "admission_case", case_id,
        {
            "caseId": case_id,
            "hostUserId": user["id"],
            "patronEmailMasked": mask_email(patron_email),
            "route": body.route,
            "priorStatus": None,
            "nextStatus": "draft",
        },
    )
    row = _admission_case_get_or_404(case_id)
    return {"ok": True, "case": _admission_case_public(row, user["id"], set(get_user_roles(user["id"])))}


@app.get("/api/admission-cases/mine")
def admission_cases_mine(user: Any = Depends(require_role("host"))):
    rows = []
    with db() as conn:
        rows = conn.execute(
            """SELECT * FROM vip_admission_cases
               WHERE host_user_id=? ORDER BY created_at DESC""",
            (user["id"],),
        ).fetchall()
    roles = set(get_user_roles(user["id"]))
    return {"cases": [_admission_case_public(r, user["id"], roles) for r in rows]}


@app.get("/api/admission-cases/{case_id}")
def admission_case_get(case_id: str, authorization: Optional[str] = Header(default=None)):
    user = user_from_token(authorization)
    row = _admission_case_get_or_404(case_id)
    if not _admission_viewer_may_read(row, user):
        # 非所有者一律 404, 不披露 case 是否存在(防枚举)。
        raise HTTPException(status_code=404, detail="Admission case not found")
    roles = set(get_user_roles(user["id"]))
    return {"case": _admission_case_public(row, user["id"], roles)}


@app.post("/api/admission-cases/{case_id}/revoke")
def admission_case_revoke(
    case_id: str,
    user: Any = Depends(require_role("host")),
):
    """Only the owning active Host may revoke a still-open admission case."""
    _require_active_host(user)
    row = _admission_case_get_or_404(case_id)
    if row["host_user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Admission case not found")
    if not can_transition_admission(row["status"], "revoked", row["route"]):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot revoke a case in status {row['status']}",
        )
    _admission_case_update(case_id, status="revoked")
    write_audit(
        user["id"], "admission.case.revoke", "admission_case", case_id,
        {
            "caseId": case_id,
            "hostUserId": user["id"],
            "priorStatus": row["status"],
            "nextStatus": "revoked",
        },
    )
    updated = _admission_case_get_or_404(case_id)
    return {"ok": True, "case": _admission_case_public(updated, user["id"], set(get_user_roles(user["id"])))}


# --------------------------------------------------------------------------- #
# 双通道邀请认领: email link (6h) + 动态 QR session (15min), 均须 Email OTP 认领
# --------------------------------------------------------------------------- #
EMAIL_SESSION_TTL = INVITE_TTL          # 邮件链接 6 小时
QR_SESSION_TTL = 15 * 60                # 动态 QR enrollment session 15 分钟


def _admission_session_by_token(token: str) -> sqlite3.Row:
    """按 token 查邀请 session(token 以随机盐哈希存储, 故逐行常量时间校验)。

    未命中返回中性 400(不披露邀请是否存在)。表规模很小(每个 case 若干 session),
    原型阶段可接受; 生产换独立 salt 列 + 索引后再按哈希直接命中。"""
    with db() as conn:
        rows = conn.execute("SELECT * FROM admission_invitation_sessions").fetchall()
    for row in rows:
        if verify_session_token(row["token_hash"], token):
            return row
    raise HTTPException(
        status_code=400,
        detail="The submitted details do not match our records. Please check and try again.",
    )


def _admission_session_status(row: sqlite3.Row) -> str:
    now = int(time.time())
    if row["revoked_at"]:
        return "revoked"
    if row["consumed_at"]:
        return "consumed"
    if row["expires_at"] < now:
        return "expired"
    return "ok"


def _issue_admission_session(case_id: str, channel: str, ttl: int) -> "tuple[str, str]":
    """创建 email/qr 邀请 session; 只存 token 的 salted hash, 明文只返回给调用方(Host 渲染)。"""
    token = secrets.token_urlsafe(32)
    sid = str(uuid.uuid4())
    now = int(time.time())
    with db() as conn:
        conn.execute(
            """INSERT INTO admission_invitation_sessions(
                   id, admission_case_id, channel, token_hash, expires_at,
                   consumed_at, revoked_at, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (sid, case_id, channel, hash_session_token(token), now + ttl, None, None, now),
        )
        conn.commit()
    return sid, token


def _require_own_open_case(case_id: str, user: Any) -> sqlite3.Row:
    """Active-Host ownership + case still open for invitation (draft / invitation_open)."""
    _require_active_host(user)
    row = _admission_case_get_or_404(case_id)
    if row["host_user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Admission case not found")
    if row["status"] not in ("draft", "invitation_open"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot send invitations for a case in status {row['status']}",
        )
    return row


@app.post("/api/admission-cases/{case_id}/invite/email")
def admission_case_invite_email(
    case_id: str,
    user: Any = Depends(require_role("host")),
):
    """Email invitation (primary channel): 6h one-time link sent to the case email."""
    row = _require_own_open_case(case_id, user)
    prior = row["status"]
    if prior == "draft":
        _admission_case_update(case_id, status="invitation_open")
    _, token = _issue_admission_session(case_id, "email", EMAIL_SESSION_TTL)
    invite_link = f"{INVITE_BASE_URL}/invite?emailSession={token}"
    channel = send_email(
        row["patron_email"],
        "Your HyperTransfer VIP invitation",
        f"Open this link to claim your VIP invitation: {invite_link}\n"
        f"The link is valid for {EMAIL_SESSION_TTL // 3600} hours and can be used once.",
    )
    write_audit(
        user["id"], "admission.invite.email", "admission_case", case_id,
        {"caseId": case_id, "patronEmailMasked": mask_email(row["patron_email"]),
         "priorStatus": prior, "nextStatus": "invitation_open", "emailChannel": channel},
    )
    updated = _admission_case_get_or_404(case_id)
    view = _admission_case_invitation_view(case_id)
    return {
        "ok": True,
        "case": _admission_case_public(updated, user["id"], set(get_user_roles(user["id"]))),
        "emailSessionToken": token,
        "emailInviteLink": invite_link,
        "emailExpiresAt": view["emailExpiresAt"],
        "qrExpiresAt": view["qrExpiresAt"],
    }


@app.post("/api/admission-cases/{case_id}/invite/qr-session")
def admission_case_invite_qr_session(
    case_id: str,
    user: Any = Depends(require_role("host")),
):
    """Dynamic QR (in-person fallback): 15-minute rotating session for the same case."""
    row = _require_own_open_case(case_id, user)
    prior = row["status"]
    if prior == "draft":
        _admission_case_update(case_id, status="invitation_open")
    _, token = _issue_admission_session(case_id, "qr", QR_SESSION_TTL)
    claim_url = f"{INVITE_BASE_URL}/invite?qrSession={token}"
    write_audit(
        user["id"], "admission.invite.qr", "admission_case", case_id,
        {"caseId": case_id, "patronEmailMasked": mask_email(row["patron_email"]),
         "priorStatus": prior, "nextStatus": "invitation_open"},
    )
    updated = _admission_case_get_or_404(case_id)
    view = _admission_case_invitation_view(case_id)
    return {
        "ok": True,
        "case": _admission_case_public(updated, user["id"], set(get_user_roles(user["id"]))),
        "qrSessionToken": token,
        "claimUrl": claim_url,
        "qrPngBase64": qr_data_uri(claim_url),
        "qrExpiresAt": view["qrExpiresAt"],
    }


class AdmissionClaimVerifyIn(BaseModel):
    sessionToken: str
    email: str


class AdmissionClaimRegisterIn(BaseModel):
    sessionToken: str
    email: str
    emailOtp: str
    name: str
    password: str


@app.post("/api/admission-claims/verify-email")
def admission_claim_verify_email(body: AdmissionClaimVerifyIn):
    """Public claim step 1: bind the submitted email to the open case and send the
    Email OTP to that address. A QR scan alone does not claim the case.

    Wrong emails get a neutral 400 that never discloses whether another email
    exists; consumed/expired/revoked sessions return 410 Gone."""
    email = normalize_email(body.email)
    session = _admission_session_by_token(body.sessionToken)
    if _admission_session_status(session) != "ok":
        raise HTTPException(status_code=410, detail="This enrollment link is no longer valid")
    case = _admission_case_get_or_404(session["admission_case_id"])
    if email != case["patron_email"]:
        raise HTTPException(
            status_code=400,
            detail="The submitted details do not match our records. Please check and try again.",
        )
    issue_email_otp(email)  # 只在 email 匹配时才发码(防枚举)
    return {
        "ok": True,
        "patronEmailMasked": mask_email(email),
        "caseId": case["id"],
        "demo": bool(DEMO_BYPASS_2FA),
    }


@app.post("/api/admission-claims/register")
def admission_claim_register(body: AdmissionClaimRegisterIn):
    """Public claim step 2: Email OTP verified -> create the patron account, bind it
    to the case (vip_claimed) and invalidate every unused invitation presentation."""
    email = normalize_email(body.email)
    session = _admission_session_by_token(body.sessionToken)
    if _admission_session_status(session) != "ok":
        raise HTTPException(status_code=410, detail="This enrollment link is no longer valid")
    case = _admission_case_get_or_404(session["admission_case_id"])
    if email != case["patron_email"]:
        raise HTTPException(
            status_code=400,
            detail="The submitted details do not match our records. Please check and try again.",
        )
    if not can_transition_admission(case["status"], "vip_claimed", case["route"]):
        raise HTTPException(
            status_code=409,
            detail=f"Admission case cannot be claimed from status {case['status']}",
        )
    with db() as conn:
        dup = conn.execute("SELECT status FROM users WHERE email=?", (email,)).fetchone()
    if dup and dup["status"] == "active":
        raise HTTPException(status_code=409, detail="This email is already registered, please sign in")

    verify_email_otp(email, body.emailOtp)  # 第一因子: 邮箱已验真(校验通过即消费)

    secret = pyotp.random_base32()
    pw_hash, pw_salt = hash_password(body.password)
    now = int(time.time())
    expires_at = now + TOTP_ENROLL_TTL
    uid = str(uuid.uuid4())
    with db() as conn:
        existing = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if existing:
            uid = existing["id"]
            conn.execute(
                """UPDATE users SET name=?, pw_hash=?, pw_salt=?, totp_secret=?,
                          status='pending_totp', user_type='patron', last_counter=NULL,
                          totp_expires_at=?, invited_by=? WHERE id=?""",
                (body.name.strip(), pw_hash, pw_salt, secret, expires_at,
                 case["host_user_id"], uid),
            )
        else:
            conn.execute(
                """INSERT INTO users(id, phone, area_code, number, name, email, pw_hash, pw_salt,
                                     totp_secret, status, user_type, last_counter, totp_expires_at,
                                     invited_by, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?, 'patron', ?,?,?,?)""",
                (uid, None, "", "", body.name.strip(), email, pw_hash, pw_salt,
                 secret, "pending_totp", None, expires_at, case["host_user_id"], now),
            )
        # 绑定 case: vip_claimed + patron_user_id; 同一 case 的所有未用 session 全部作废。
        conn.execute(
            """UPDATE vip_admission_cases
               SET status='vip_claimed', patron_user_id=?, updated_at=?
               WHERE id=?""",
            (uid, now, case["id"]),
        )
        conn.execute(
            """UPDATE admission_invitation_sessions SET consumed_at=?
               WHERE admission_case_id=? AND consumed_at IS NULL""",
            (now, case["id"]),
        )
        conn.commit()
    write_audit(
        uid, "admission.claim.register", "admission_case", case["id"],
        {"caseId": case["id"], "userId": uid,
         "patronEmailMasked": mask_email(email),
         "priorStatus": case["status"], "nextStatus": "vip_claimed"},
    )
    write_audit(uid, "user.register_invite", "user", uid, {"email": email})

    otpauth = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)
    return {
        "userId": uid,
        "email": email,
        "otpauth_uri": otpauth,
        "secret": secret,
        "qr_png_base64": qr_data_uri(otpauth),
        "expires_at": expires_at,
        "expires_in": TOTP_ENROLL_TTL,
        "demo": bool(DEMO_BYPASS_2FA),
    }


# --------------------------------------------------------------------------- #
# Case-aware KYC (2026-08-21)
#   valid_until = min(approved_at + 6 日历月, 最早证件到期日)。
#   KYC 只把 case 从 kyc_in_progress 移到 kyc_passed / kyc_failed / compliance_review;
#   Host 只拿安全原因分类, 绝无证件号/地址/生物特征/provider 原始细节。
# --------------------------------------------------------------------------- #
RESTRICTED_KYC_CODES = frozenset({"restricted", "compliance_review"})


def _mark_case_kyc_started(user_id: str) -> None:
    """VIP 开始 KYC: 已认领的 case(vip_claimed) -> kyc_in_progress(幂等)。"""
    with db() as conn:
        case = conn.execute(
            "SELECT * FROM vip_admission_cases WHERE patron_user_id=? AND status='vip_claimed'",
            (user_id,),
        ).fetchone()
    if case and can_transition_admission("vip_claimed", "kyc_in_progress", case["route"]):
        _admission_case_update(case["id"], status="kyc_in_progress")
        write_audit(
            user_id, "admission.kyc.start", "admission_case", case["id"],
            {"caseId": case["id"], "priorStatus": "vip_claimed", "nextStatus": "kyc_in_progress"},
        )


def _map_rejection_reason(text: str) -> str:
    """把 provider 拒绝细节映射为 Host 可见的安全原因分类(未知一律 restricted)。"""
    t = (text or "").lower()
    if "expired" in t or "expir" in t:
        return "document_expired"
    if "quality" in t or "blur" in t or "illegible" in t or "unreadable" in t or "photo" in t:
        return "document_quality"
    if "mismatch" in t or "does not match" in t or "differ" in t:
        return "identity_mismatch"
    if "resubmit" in t or "resubmission" in t:
        return "resubmit"
    return "restricted"


def _extract_document_expiries(payload: Optional[dict[str, Any]]) -> list[int]:
    """从 provider payload 尽力提取证件到期日(best-effort; 拿不到就空列表)。"""
    if not isinstance(payload, dict):
        return []
    review = payload.get("review") if isinstance(payload.get("review"), dict) else payload
    id_docs = review.get("idDocs")
    if not isinstance(id_docs, list):
        return []
    expiries: list[int] = []
    for doc in id_docs:
        if isinstance(doc, dict):
            valid = doc.get("validUntil") or doc.get("expiredAt")
            if isinstance(valid, (int, float)) and valid > 0:
                expiries.append(int(valid))
    return expiries


def persist_case_kyc_outcome(
    case_id: str,
    user_id: str,
    provider_status: str,
    document_expiries: list[int],
    reason_code: Optional[str],
) -> None:
    """把一次 KYC 结果落到 admission case 上。

    - provider_status == "approved": case -> kyc_passed, 落 kyc_valid_until =
      min(now + 6 日历月, 最早证件到期日), 同步写回 sumsub_kyc_applications.valid_until。
    - 其他(failed/rejected): case -> kyc_failed 或 compliance_review(受限原因),
      只存安全 reason_code, 绝不存 provider 原始细节。

    只允许从 kyc_in_progress 转移; 其余状态返回 409(fail closed)。
    """
    case = _admission_case_get_or_404(case_id)
    if case["patron_user_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="KYC outcome does not belong to this admission case"
        )
    now = int(time.time())
    if provider_status == "approved":
        if not can_transition_admission(case["status"], "kyc_passed", case["route"]):
            raise HTTPException(
                status_code=409,
                detail=f"KYC cannot pass a case in status {case['status']}",
            )
        valid_until = kyc_valid_until(now, [int(e) for e in document_expiries or []])
        _admission_case_update(
            case_id,
            status="kyc_passed",
            kyc_valid_until=valid_until,
            kyc_reason_code=None,
            kyc_document_expiries_json=(
                json_dumps([int(e) for e in document_expiries]) if document_expiries else None
            ),
        )
        # 同步回 sumsub 表, 让既有 user_kyc_ok / 入金闸门口径一致。
        with db() as conn:
            conn.execute(
                """UPDATE sumsub_kyc_applications
                   SET approved_at=?, valid_until=?, updated_at=? WHERE user_id=?""",
                (now, valid_until, now, user_id),
            )
            conn.commit()
        write_audit(
            user_id, "admission.kyc.pass", "admission_case", case_id,
            {"caseId": case_id, "priorStatus": case["status"], "nextStatus": "kyc_passed",
             "validUntil": valid_until},
        )
        return
    # 失败路径
    code = reason_code or "restricted"
    target = "compliance_review" if code in RESTRICTED_KYC_CODES else "kyc_failed"
    if not can_transition_admission(case["status"], target, case["route"]):
        raise HTTPException(
            status_code=409,
            detail=f"KYC outcome cannot move a case in status {case['status']}",
        )
    _admission_case_update(
        case_id,
        status=target,
        kyc_reason_code=code,
        kyc_valid_until=None,
    )
    write_audit(
        user_id, "admission.kyc.fail", "admission_case", case_id,
        {"caseId": case_id, "priorStatus": case["status"], "nextStatus": target,
         "reasonCode": code},
    )


def sync_case_kyc_from_provider(
    user_id: str,
    provider_status: str,
    review_answer: str,
    rejection_reason: str,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    """Provider 回调/轮询结果同步到已绑定的 admission case(无 case 则 no-op)。"""
    with db() as conn:
        case = conn.execute(
            """SELECT * FROM vip_admission_cases
               WHERE patron_user_id=? AND status IN ('kyc_in_progress','vip_claimed')""",
            (user_id,),
        ).fetchone()
    if not case:
        return
    document_expiries = _extract_document_expiries(payload)
    if provider_status == "approved" and review_answer == "GREEN":
        persist_case_kyc_outcome(case["id"], user_id, "approved", document_expiries, None)
    elif provider_status in ("rejected", "failed"):
        reason_code = _map_rejection_reason(rejection_reason)
        persist_case_kyc_outcome(case["id"], user_id, "failed", document_expiries, reason_code)
    # pending / 其它: case 保持 kyc_in_progress


def admission_case_kyc_ok(case_id: str) -> bool:
    """Case 级 KYC 闸门: 须 kyc_passed 且 kyc_valid_until 未过期。"""
    case = _admission_case_get_or_404(case_id)
    if case["status"] != "kyc_passed":
        return False
    valid_until = case["kyc_valid_until"]
    if not valid_until:
        return False
    return int(time.time()) <= valid_until


@app.get("/api/admission-cases/patron/mine")
def admission_case_patron_mine(authorization: Optional[str] = Header(default=None)):
    """VIP 查看自己被绑定的 admission case(安全投影: 无 Host notes/内部原因)。"""
    user = user_from_token(authorization)
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM vip_admission_cases WHERE patron_user_id=?", (user["id"],)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No admission case bound to this account")
    roles = set(get_user_roles(user["id"]))
    return {"case": _admission_case_public(row, user["id"], roles)}


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "hypertransfer-auth",
        "sumsubConfigured": sumsub_configured(),
        "hexsafeConfigured": hexsafe_configured(),
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
