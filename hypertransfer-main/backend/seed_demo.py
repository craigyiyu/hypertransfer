"""seed_demo.py — 给本地演示灌入"零等待"数据(幂等, 可反复跑)。

用法(在 backend/ 下, 用 venv 的 python):
  ./.venv/bin/python seed_demo.py          # 灌/重置演示数据
  ./.venv/bin/python seed_demo.py code      # 打印当前 staff 登录用的 6 位 TOTP 验证码

灌入:
  - 5 个员工账号(同一固定 TOTP secret, 方便演示): admin / rm / marketing / compliance / custodian
    登录: 邮箱+密码 → 需 6 位 TOTP(staff 强制 2FA); 用 `seed_demo.py code` 取码。
  - 1 个客户账号(2FA 关, 邮箱+密码直接登录, KYC 已通过且未过期)
  - 客户的"已验证原钱包" + 一笔待结算入金(Deposit Queue) + 一笔待审退款(Refund Queue)
  - 一条待审邀请(Invitations)
所有数据均为 demo(邮箱 *.demo.local / 固定测试 TOTP secret), 非真实凭据。
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server  # noqa: E402  (load_project_env + DB_PATH 在 import 时确定)
import pyotp  # noqa: E402

# 固定测试 TOTP secret(标准示例值, 仅用于本地 demo staff 账号)。
DEMO_TOTP_SECRET = "JBSWY3DPEHPK3PXP"
STAFF_PASSWORD = "Staff@Demo123"
PATRON_PASSWORD = "Patron@Demo123"

STAFF = [
    ("demo-admin", "admin@demo.local", "Demo Admin", "admin"),
    ("demo-rm", "rm@demo.local", "Demo RM", "rm"),
    ("demo-marketing", "marketing@demo.local", "Demo Marketing", "marketing"),
    ("demo-compliance", "compliance@demo.local", "Demo Compliance", "compliance"),
    ("demo-custodian", "custodian@demo.local", "Demo Custodian", "custodian"),
]
PATRON_ID = "demo-patron"
PATRON_EMAIL = "patron.demo@hypercrypto.com"
VW_ID = "demo-vw-1"
VW_ADDR = "TX9GxY8p8q6fZJ4dL9b2vQq7jK6mN5pA1B"
VW_CHAIN = "tron:nile"
DEP_ID = "DR-DEMO-0001"
RF_ID = "RF-DEMO-0001"
INV_ID = "demo-inv-1"


def staff_code() -> str:
    return pyotp.TOTP(DEMO_TOTP_SECRET).now()


def seed() -> None:
    server.init_db()
    now = int(time.time())
    pw_staff = server.hash_password(STAFF_PASSWORD)
    pw_patron = server.hash_password(PATRON_PASSWORD)

    with server.db() as c:
        # 清掉旧 demo 行(幂等)
        ids = [s[0] for s in STAFF] + [PATRON_ID]
        qs = ",".join("?" * len(ids))
        c.execute(f"DELETE FROM users WHERE id IN ({qs})", ids)
        c.execute(f"DELETE FROM user_roles WHERE user_id IN ({qs})", ids)
        c.execute(f"DELETE FROM sumsub_kyc_applications WHERE user_id IN ({qs})", ids)
        c.execute("DELETE FROM verified_wallets WHERE user_id=?", (PATRON_ID,))
        c.execute("DELETE FROM deposit_requests WHERE id=?", (DEP_ID,))
        c.execute("DELETE FROM refund_requests WHERE id=?", (RF_ID,))
        c.execute("DELETE FROM invitations WHERE id=?", (INV_ID,))

        # 员工: active + 固定 TOTP secret(staff 登录强制 2FA)
        for uid, email, name, role in STAFF:
            c.execute(
                """INSERT INTO users(id,phone,area_code,number,name,email,pw_hash,pw_salt,
                      totp_secret,totp_enabled,status,user_type,created_at)
                   VALUES(?,?,?,?,?,?,?,?,?,1,'active','staff',?)""",
                (uid, None, "", "", name, email, pw_staff[0], pw_staff[1], DEMO_TOTP_SECRET, now),
            )
            c.execute("INSERT OR IGNORE INTO user_roles(user_id,role) VALUES(?,?)", (uid, role))

        # 客户: 2FA 关(邮箱+密码直接登录) + KYC 已通过未过期
        c.execute(
            """INSERT INTO users(id,phone,area_code,number,name,email,pw_hash,pw_salt,
                  totp_secret,totp_enabled,status,user_type,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,0,'active','patron',?)""",
            (PATRON_ID, "85291234567", "852", "91234567", "Demo Patron", PATRON_EMAIL,
             pw_patron[0], pw_patron[1], DEMO_TOTP_SECRET, now),
        )
        c.execute(
            """INSERT INTO sumsub_kyc_applications(user_id,external_user_id,applicant_id,level_name,
                  status,review_status,review_answer,approved_at,valid_until,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (PATRON_ID, "ext-demo-patron", "app-demo-patron", "basic-kyc-level", "approved",
             "completed", "GREEN", now, now + server.KYC_VALIDITY_SECS, now, now),
        )

        # 已验证原钱包(退款 picker 数据源)
        c.execute(
            "INSERT INTO verified_wallets(id,user_id,address,chain_id,asset,method,verified_at) VALUES(?,?,?,?,?,?,?)",
            (VW_ID, PATRON_ID, VW_ADDR, VW_CHAIN, "USDT", "1usdt_verification", now),
        )

        # 待结算入金(Deposit Queue): 已 1 USDT 验证, 主入金已填, 等 Marker + settle
        c.execute(
            """INSERT INTO deposit_requests(id,user_id,asset,network,chain_id,amount_decimal,source_wallet,
                  screening_status,screening_ref,travel_rule_required,travel_rule_status,deposit_address,
                  vault_id,verify_tx_hash,verify_status,verified_wallet_id,status,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (DEP_ID, PATRON_ID, "USDT", "tron", VW_CHAIN, "5000", VW_ADDR,
             "pass", "KYT-DEMO-0001", 1, "travel_rule_accepted", "TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC",
             "demo-wta-vault", "0xdemoTxVerify001", "confirmed", VW_ID, "main_submitted", now, now),
        )

        # 待审退款(Refund Queue): requested, KYC ok, 等 compliance KYT screen
        c.execute(
            """INSERT INTO refund_requests(id,user_id,wallet_id,to_address,chain_id,asset,amount_decimal,
                  reason,status,kyc_ok,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (RF_ID, PATRON_ID, VW_ID, VW_ADDR, VW_CHAIN, "USDT", "1200",
             "customer_cancelled", "requested", 1, now, now),
        )

        # 邀请队列留空: 演示时由 RM 表单现场提交, 不预置测试记录(避免面板残留脏数据)
        c.commit()


def print_summary() -> None:
    code = staff_code()
    print("\n================  HyperTransfer 本地演示数据已就绪  ================")
    print(f"DB: {server.DB_PATH}")
    print("\n[ 客户账号 ]  邮箱+密码直接登录(2FA 关), KYC 已通过")
    print(f"  Email : {PATRON_EMAIL}")
    print(f"  Pass  : {PATRON_PASSWORD}")
    print("\n[ 员工账号 ]  邮箱+密码 + 6 位 TOTP(staff 强制 2FA), 同一 TOTP secret")
    for _, email, _, role in STAFF:
        print(f"  {role:11} {email:24} / {STAFF_PASSWORD}")
    print(f"\n  当前 TOTP 验证码: {code}   (30 秒一变; 重新取码: ./.venv/bin/python seed_demo.py code)")
    print(f"  (固定 secret: {DEMO_TOTP_SECRET} — 可一次性加进 Authenticator 扫码免输)")
    print("\n[ 后台已有待办 ]  打开 /casino-ops 即见:")
    print("  - Deposit Queue : 1 笔待 Marker/结算 (DR-DEMO-0001, 5000 USDT)")
    print("  - Refund Queue  : 1 笔待审退款 (RF-DEMO-0001, 1200 USDT → 原钱包)")
    print("  - Invitations   : (空, 演示时由 RM 表单现场提交)")
    print("===================================================================\n")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "code":
        print(staff_code())
    else:
        seed()
        print_summary()
