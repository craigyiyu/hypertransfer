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
    ("demo-leader", "leader@demo.local", "Demo Leader", "leader"),   # 单一 Manager 审批人
    ("demo-ops", "ops@demo.local", "Demo HK Ops", "ops"),            # HK Operations
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


# --------------------------------------------------------------------------- #
# Task 8: 完整 admission demo —— 一个 active Host、一个已过 leader 审批的 VIP case、
# 一个 verification pack + 一个已确认 main pack + 一个已 Cage 确认/已对账的结算。
# 全部为保留/示例数据(reserved/example)。
# --------------------------------------------------------------------------- #
ADM_HOST_ID = "demo-adm-host"
ADM_HOST_EMAIL = "host.vip.demo@operator.example"
ADM_PATRON_ID = "demo-adm-patron"
ADM_PATRON_EMAIL = "vip.admission.demo@operator.example"
ADM_CASE_ID = "ADM-DEMO-0001"
ADM_INTENT_ID = "PI-DEMO-0001"
ADM_PACK_VERIFY = "PC-DEMO-VERIFY"
ADM_PACK_MAIN = "PC-DEMO-MAIN"
ADM_CAGE_ID = "CAGE-DEMO-0001"
ADM_RECON_REF = "FIN-REC-DEMO-0001"
# 第二条演示 case: 待单一 manager 审批(leader_pending), 让 Leader Approval 队列开箱即有内容。
ADM_PENDING_CASE_ID = "ADM-DEMO-0002"
ADM_PENDING_INTENT_ID = "PI-DEMO-0002"


def seed_admission_demo() -> None:
    """灌入一条 Host-led VIP admission 完整 demo(幂等)。

    组成: active Host + 已认领且 leader 已批准的 case(service_enabled, KYC 有效)
    + 一个 verification pack(basic, 已转账) + 一个 main pack(enhanced, 已确认转账、
    已录 Cage confirmation ID、已 Finance 对账)。"""
    now = int(time.time())
    pw = server.hash_password(STAFF_PASSWORD)
    pw_patron = server.hash_password(PATRON_PASSWORD)
    with server.db() as c:
        # 清旧 demo 行(幂等)
        for t, col, vid in (
            ("transaction_compliance_packs", "id", ADM_PACK_VERIFY),
            ("transaction_compliance_packs", "id", ADM_PACK_MAIN),
            ("payment_intents", "id", ADM_INTENT_ID),
            ("payment_intents", "id", ADM_PENDING_INTENT_ID),
            ("vip_admission_cases", "id", ADM_CASE_ID),
            ("vip_admission_cases", "id", ADM_PENDING_CASE_ID),
            ("host_profiles", "user_id", ADM_HOST_ID),
            ("users", "id", ADM_HOST_ID),
            ("users", "id", ADM_PATRON_ID),
        ):
            c.execute(f"DELETE FROM {t} WHERE {col}=?", (vid,))
        c.execute("DELETE FROM user_roles WHERE user_id IN (?,?)", (ADM_HOST_ID, ADM_PATRON_ID))
        c.execute("DELETE FROM sumsub_kyc_applications WHERE user_id=?", (ADM_PATRON_ID,))

        # active Host(staff + host 角色 + host_profiles active)
        c.execute(
            """INSERT INTO users(id,phone,area_code,number,name,email,pw_hash,pw_salt,
                  totp_secret,totp_enabled,status,user_type,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,1,'active','staff',?)""",
            (ADM_HOST_ID, None, "", "", "Demo VIP Host", ADM_HOST_EMAIL,
             pw[0], pw[1], DEMO_TOTP_SECRET, now),
        )
        c.execute("INSERT INTO user_roles(user_id, role) VALUES (?, 'host')", (ADM_HOST_ID,))
        c.execute(
            """INSERT INTO host_profiles(user_id, employee_id, department, operating_team,
                  location, phone, status, acknowledged_at, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (ADM_HOST_ID, "EMP-VIP-HOST", "VIP Services", "Macau Table Games",
             "Macau Peninsula", "+853 0000 0000", "active", now, now),
        )

        # VIP patron: 已认领 + KYC 有效 + leader 已批准(service_enabled)
        c.execute(
            """INSERT INTO users(id,phone,area_code,number,name,email,pw_hash,pw_salt,
                  totp_secret,totp_enabled,status,user_type,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,1,'active','patron',?)""",
            (ADM_PATRON_ID, "85291230001", "852", "91230001", "Demo VIP Patron", ADM_PATRON_EMAIL,
             pw_patron[0], pw_patron[1], DEMO_TOTP_SECRET, now),
        )
        c.execute(
            """INSERT INTO sumsub_kyc_applications(user_id,external_user_id,applicant_id,level_name,
                  status,review_status,review_answer,approved_at,valid_until,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (ADM_PATRON_ID, "ext-adm-patron", "app-adm-patron", "basic-kyc-level", "approved",
             "completed", "GREEN", now, server.kyc_valid_until(now, []), now, now),
        )
        c.execute(
            """INSERT INTO vip_admission_cases(
                  id, host_user_id, patron_email, member_reference, service_purpose,
                  host_notes, preferred_language, route, patron_user_id, status,
                  leader_user_id, kyc_reason_code, kyc_valid_until,
                  leader_decision, leader_reason, leader_decided_at, created_at, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (ADM_CASE_ID, ADM_HOST_ID, ADM_PATRON_EMAIL, "M-VIP-DEMO-001",
             "VIP table credit demo", "Demo relationship note (internal only)", "zh-Hant",
             "complete_dossier", ADM_PATRON_ID, "service_enabled", "demo-leader-id",
             None, server.kyc_valid_until(now, []),
             "approved", None, now, now, now),
        )

        # payment intent: 来源已分类(pass) + 实际已确认(10000 USDT / tron)
        c.execute(
            """INSERT INTO payment_intents(
                  id, admission_case_id, asset, network, intended_amount, source_type,
                  source_identifier, counterparty_name, source_status, status,
                  fingerprint_json, created_at, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (ADM_INTENT_ID, ADM_CASE_ID, "USDT", "tron", "10000", "wallet",
             "TX9GxY8p8q6fZJ4dL9b2vQq7jK6mN5pA1B", "", "pass", "actual_confirmed",
             '{"asset":"USDT","network":"tron","actualAmount":"10000","sourceType":"wallet",'
             '"sourceIdentifier":"TX9GxY8p8q6fZJ4dL9b2vQq7jK6mN5pA1B","counterpartyId":null}',
             now, now),
        )

        def insert_pack(pack_id: str, leg: str, amount: str, hkd: str, depth: str,
                        tx_hash: str, cage: str | None, recon_ref: str | None) -> None:
            snapshot = {
                "packId": pack_id, "paymentIntentId": ADM_INTENT_ID,
                "admissionCaseId": ADM_CASE_ID, "transferLeg": leg,
                "asset": "USDT", "network": "tron", "actualAmount": amount,
                "actualHkdAmount": hkd, "travelRuleDepth": depth,
                "sourceType": "wallet",
                "sourceIdentifier": "TX9GxY8p8q6fZJ4dL9b2vQq7jK6mN5pA1B",
                "counterpartyName": "", "createdAt": now,
            }
            c.execute(
                """INSERT INTO transaction_compliance_packs(
                      id, payment_intent_id, transfer_leg, actual_amount, actual_hkd_amount,
                      travel_rule_depth, kyt_status, travel_rule_status, notabene_reference,
                      custody_address, tx_hash, cage_confirmation_id, reconciliation_ref,
                      reconciled_at, immutable_snapshot_json, retention_until, created_at, finalized_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (pack_id, ADM_INTENT_ID, leg, amount, hkd, depth, "pass", "accepted",
                 f"NB-DEMO-{pack_id}", "TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC", tx_hash,
                 cage, recon_ref, now if recon_ref else None,
                 server.json_dumps(snapshot), now + server.RETENTION_YEARS * 365 * 86400,
                 now, now),
            )

        insert_pack(ADM_PACK_VERIFY, "verification", "1", "8", "basic",
                    "0xdemoVerifyTx00000000000000000000000000000000000000000000000000000001", None, None)
        insert_pack(ADM_PACK_MAIN, "main", "10000", "80000", "enhanced",
                    "0xdemoMainTx000000000000000000000000000000000000000000000000000000002",
                    ADM_CAGE_ID, ADM_RECON_REF)

        # 待审批演示 case(complete_dossier, 预检完成 -> leader_pending)
        c.execute(
            """INSERT INTO vip_admission_cases(
                  id, host_user_id, patron_email, member_reference, service_purpose,
                  host_notes, preferred_language, route, patron_user_id, status,
                  leader_user_id, kyc_reason_code, kyc_valid_until,
                  leader_decision, leader_reason, leader_decided_at, created_at, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (ADM_PENDING_CASE_ID, ADM_HOST_ID, "vip2.admission.demo@operator.example",
             "M-VIP-DEMO-002", "VIP table credit (pending approval)",
             "Second demo case awaiting the manager's approval", "en",
             "complete_dossier", ADM_PATRON_ID, "leader_pending", None,
             None, server.kyc_valid_until(now, []),
             None, None, None, now, now),
        )
        c.execute(
            """INSERT INTO payment_intents(
                  id, admission_case_id, asset, network, intended_amount, source_type,
                  source_identifier, counterparty_name, source_status, status,
                  fingerprint_json, created_at, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (ADM_PENDING_INTENT_ID, ADM_PENDING_CASE_ID, "USDC", "ethereum", "15000", "vasp",
             "demo-vasp.example.test", "Demo VASP", "pass", "actual_confirmed",
             '{"asset":"USDC","network":"ethereum","actualAmount":"15000","sourceType":"vasp",'
             '"sourceIdentifier":"demo-vasp.example.test","counterpartyId":null}',
             now, now),
        )
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
        seed_admission_demo()
        print_summary()
