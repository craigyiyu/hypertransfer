"""API tests for payment intents and transaction compliance packs (Task 7).

Requirements under test:
  - every transfer leg (verification / main) creates its own immutable pack;
  - HKD 8,000 switches basic vs enhanced field depth on the pack; a low-value
    transfer is still a "basic" pack — never not_required;
  - a changed actual amount (crossing the threshold or any fingerprint change)
    invalidates the pre-check and forces re-validation;
  - a failed or manual-review source cannot create a pack that can issue an
    address;
  - KYT + Travel Rule must both pass before custody-address issuance;
  - production fails closed (503) before address issuance when Notabene / Hex
    Safe configuration is absent;
  - legacy payment_applications data remains historical evidence and is never
    used to authorize a new transfer.
"""

import json
import tempfile
import time
import unittest
import uuid
from pathlib import Path

import pyotp
from fastapi.testclient import TestClient

import server

API = "/api"


def _temp_db_path() -> Path:
    tmp = tempfile.mkdtemp(prefix="ht-tr-compliance-")
    return Path(tmp) / "test.db"


class TransactionComplianceTestCase(unittest.TestCase):
    def setUp(self):
        self.db_path = _temp_db_path()
        self._old_db_path = server.DB_PATH
        server.DB_PATH = self.db_path
        server.init_db()
        self.client = TestClient(server.app)
        self.now = int(time.time())

    def tearDown(self):
        server.DB_PATH = self._old_db_path
        try:
            self.db_path.unlink()
        except OSError:
            pass

    # ------------------------------------------------------------------ #
    # fixtures / helpers
    # ------------------------------------------------------------------ #
    def _create_staff(self, name: str, email: str, roles: list[str], host_status: str | None = None) -> dict:
        uid = str(uuid.uuid4())
        pw_hash, pw_salt = server.hash_password("Staff@Test123")
        with server.db() as conn:
            conn.execute(
                """INSERT INTO users(
                       id, phone, area_code, number, name, email, pw_hash, pw_salt,
                       totp_secret, totp_enabled, status, user_type, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (uid, None, None, None, name, email, pw_hash, pw_salt,
                 pyotp.random_base32(), 1, "active", "staff", self.now),
            )
            for role in roles:
                conn.execute("INSERT INTO user_roles(user_id, role) VALUES (?,?)", (uid, role))
            if host_status is not None:
                conn.execute(
                    """INSERT INTO host_profiles(
                           user_id, employee_id, department, operating_team, location,
                           phone, status, acknowledged_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?)""",
                    (uid, f"EMP-{uid[:6].upper()}", "VIP Services", "Macau",
                     "Macau Peninsula", "+853 0000 0000", host_status, self.now, self.now),
                )
            conn.commit()
        token = server.create_session(uid)
        return {"id": uid, "email": email, "token": token}

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def _create_eligible_case(self) -> dict:
        """service_enabled case with passed, unexpired KYC; returns patron + case."""
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test", "servicePurpose": "VIP table credit",
                  "route": "complete_dossier"},
            headers=self._auth(host["token"]),
        )
        case_id = resp.json()["case"]["id"]
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/invite/qr-session", headers=self._auth(host["token"])
        )
        qr_token = resp.json()["qrSessionToken"]
        self.client.post(
            f"{API}/admission-claims/verify-email",
            json={"sessionToken": qr_token, "email": "vip@example.test"},
        )
        with server.db() as conn:
            code = conn.execute(
                "SELECT code FROM email_otps WHERE identifier='vip@example.test'"
            ).fetchone()["code"]
        resp = self.client.post(
            f"{API}/admission-claims/register",
            json={"sessionToken": qr_token, "email": "vip@example.test", "emailOtp": code,
                  "name": "Vip Patron", "password": "Patron#2026"},
        )
        assert resp.status_code == 200, resp.text
        with server.db() as conn:
            patron_id = conn.execute(
                "SELECT patron_user_id FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()["patron_user_id"]
        token = server.create_session(patron_id)
        with server.db() as conn:
            conn.execute(
                """UPDATE vip_admission_cases
                   SET status='kyc_passed', kyc_valid_until=?, updated_at=? WHERE id=?""",
                (self.now + 120 * 86400, self.now, case_id),
            )
            conn.commit()
        return {"host": host, "patronToken": token, "caseId": case_id, "patronId": patron_id}

    def _set_service_enabled(self, case_id: str) -> None:
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='service_enabled', updated_at=? WHERE id=?",
                (self.now, case_id),
            )
            conn.commit()

    def _create_intent(self, patron: dict, amount: str = "10000", asset: str = "USDT",
                       network: str = "tron") -> dict:
        resp = self.client.post(
            f"{API}/payment-intents",
            json={"asset": asset, "network": network, "intendedAmount": amount},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["intent"]

    def _classify_source(self, patron: dict, intent_id: str, source_type: str = "wallet",
                         source_identifier: str = "T-source-wallet-1") -> dict:
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/source-classification",
            json={"sourceType": source_type, "sourceIdentifier": source_identifier,
                  "jurisdiction": "HK"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()

    def _confirm_actual(self, patron: dict, intent_id: str, amount: str) -> dict:
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/actual-confirmation",
            json={"asset": "USDT", "network": "tron", "actualAmount": amount,
                  "sourceType": "wallet", "sourceIdentifier": "T-source-wallet-1"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()

    def _create_pack(self, patron: dict, intent_id: str, leg: str, actual_hkd: str,
                     actual_amount: str = "10000") -> dict:
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/compliance-packs",
            json={"transferLeg": leg, "actualAmount": actual_amount, "actualHkdAmount": actual_hkd},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["pack"]

    def _screen_pack(self, patron: dict, pack_id: str) -> dict:
        resp = self.client.post(
            f"{API}/transaction-compliance-packs/{pack_id}/screen", headers=self._auth(patron["patronToken"])
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["pack"]


class DistinctPacksTests(TransactionComplianceTestCase):
    def test_one_intent_has_distinct_verification_and_main_packs(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron)
        self._classify_source(patron, intent["id"])
        self._confirm_actual(patron, intent["id"], "10000")
        verification = self._create_pack(patron, intent["id"], leg="verification", actual_hkd="8", actual_amount="1")
        main = self._create_pack(patron, intent["id"], leg="main", actual_hkd="80000", actual_amount="10000")
        assert verification["id"] != main["id"]
        assert verification["travelRuleDepth"] == "basic"
        assert main["travelRuleDepth"] == "enhanced"
        assert verification["transferLeg"] == "verification"
        assert main["transferLeg"] == "main"

    def test_low_value_pack_is_basic_not_not_required(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron, amount="1")
        self._classify_source(patron, intent["id"])
        self._confirm_actual(patron, intent["id"], "1")
        pack = self._create_pack(patron, intent["id"], leg="verification", actual_hkd="8", actual_amount="1")
        assert pack["travelRuleDepth"] == "basic"
        assert pack.get("notRequired") is not True

    def test_each_pack_is_immutable(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron)
        self._classify_source(patron, intent["id"])
        self._confirm_actual(patron, intent["id"], "10000")
        pack = self._create_pack(patron, intent["id"], leg="verification", actual_hkd="8", actual_amount="1")
        snapshot = json.loads(pack["immutableSnapshotJson"])
        assert snapshot["transferLeg"] == "verification"
        assert snapshot["actualAmount"] == "1"
        assert snapshot["actualHkdAmount"] == "8"
        assert snapshot["travelRuleDepth"] == "basic"


class RevalidationTests(TransactionComplianceTestCase):
    def test_crossing_threshold_requires_enhanced_revalidation(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron, amount="7999")
        self._classify_source(patron, intent["id"])
        result = self._confirm_actual(patron, intent["id"], amount="8001")
        assert result["requiresRevalidation"] is True
        assert result["revalidationReason"] == "amount_crossed_threshold"

    def test_identical_confirmation_does_not_require_revalidation(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron, amount="10000")
        self._classify_source(patron, intent["id"])
        result = self._confirm_actual(patron, intent["id"], amount="10000")
        assert result["requiresRevalidation"] is False

    def test_changed_source_requires_revalidation(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron, amount="10000")
        self._classify_source(patron, intent["id"], source_identifier="T-wallet-A")
        result = self._confirm_actual(patron, intent["id"], amount="10000")
        assert result["requiresRevalidation"] is False
        # 第二次 actual-confirmation 换了来源钱包 -> 必须重验。
        resp = self.client.post(
            f"{API}/payment-intents/{intent['id']}/actual-confirmation",
            json={"asset": "USDT", "network": "tron", "actualAmount": "10000",
                  "sourceType": "wallet", "sourceIdentifier": "T-wallet-B"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200
        assert resp.json()["requiresRevalidation"] is True

    def test_revalidation_blocks_address_issuance_until_pack_recreated(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron, amount="7999")
        self._classify_source(patron, intent["id"])
        self._confirm_actual(patron, intent["id"], amount="7999")
        pack = self._create_pack(patron, intent["id"], leg="verification", actual_hkd="7", actual_amount="1")
        self._screen_pack(patron, pack["id"])
        # 金额跨阈值 -> 先前的 pack 失效, 不得发址。
        result = self._confirm_actual(patron, intent["id"], amount="8001")
        assert result["requiresRevalidation"] is True
        resp = self.client.post(
            f"{API}/transaction-compliance-packs/{pack['id']}/issue-address",
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 409


class SourceBranchTests(TransactionComplianceTestCase):
    def test_failed_source_cannot_create_address_issuable_pack(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron)
        # 自托管钱包: "bad" 关键字触发 demo KYT fail。
        resp = self.client.post(
            f"{API}/payment-intents/{intent['id']}/source-classification",
            json={"sourceType": "wallet", "sourceIdentifier": "T-bad-address-1",
                  "jurisdiction": "HK"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200
        assert resp.json()["sourceStatus"] == "fail"
        resp = self.client.post(
            f"{API}/payment-intents/{intent['id']}/compliance-packs",
            json={"transferLeg": "verification", "actualAmount": "1", "actualHkdAmount": "8"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 409  # 来源失败/待人工复核 -> 不能建可发址 pack

    def test_vasp_source_with_manual_review_cannot_issue_address(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron)
        resp = self.client.post(
            f"{API}/payment-intents/{intent['id']}/source-classification",
            json={"sourceType": "vasp", "sourceIdentifier": "review-vasp.example.test",
                  "jurisdiction": "HK"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200
        assert resp.json()["sourceStatus"] == "manual_review"
        resp = self.client.post(
            f"{API}/payment-intents/{intent['id']}/compliance-packs",
            json={"transferLeg": "verification", "actualAmount": "1", "actualHkdAmount": "8"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 409


class PackGateTests(TransactionComplianceTestCase):
    def test_kyt_and_travel_rule_must_both_pass_before_address(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron)
        self._classify_source(patron, intent["id"])
        self._confirm_actual(patron, intent["id"], "10000")
        pack = self._create_pack(patron, intent["id"], leg="verification", actual_hkd="8", actual_amount="1")
        # 未 screen -> 不可发址。
        resp = self.client.post(
            f"{API}/transaction-compliance-packs/{pack['id']}/issue-address",
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 409
        screened = self._screen_pack(patron, pack["id"])
        assert screened["kytStatus"] == "pass"
        assert screened["travelRuleStatus"] == "accepted"
        assert screened["notabeneReference"].startswith("NB-DEMO-")
        resp = self.client.post(
            f"{API}/transaction-compliance-packs/{pack['id']}/issue-address",
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["pack"]["custodyAddress"]

    def test_pack_records_transfer_and_finalizes(self):
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron)
        self._classify_source(patron, intent["id"])
        self._confirm_actual(patron, intent["id"], "10000")
        pack = self._create_pack(patron, intent["id"], leg="main", actual_hkd="80000", actual_amount="10000")
        self._screen_pack(patron, pack["id"])
        resp = self.client.post(
            f"{API}/transaction-compliance-packs/{pack['id']}/issue-address",
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        resp = self.client.post(
            f"{API}/transaction-compliance-packs/{pack['id']}/record-transfer",
            json={"txHash": "0xabc123", "status": "confirmed"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["pack"]
        assert data["txHash"] == "0xabc123"
        assert data["finalizedAt"] is not None
        # retention >= 5 年。
        with server.db() as conn:
            row = conn.execute(
                "SELECT retention_until FROM transaction_compliance_packs WHERE id=?", (pack["id"],)
            ).fetchone()
        assert row["retention_until"] >= self.now + 5 * 365 * 86400

    def test_payment_requires_service_enabled_case(self):
        patron = self._create_eligible_case()  # kyc_passed but NOT service_enabled
        # complete_dossier 预检: kyc_passed 允许建 intent(启动 pre-check)...
        resp = self.client.post(
            f"{API}/payment-intents",
            json={"asset": "USDT", "network": "tron", "intendedAmount": "10000"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        intent_id = resp.json()["intent"]["id"]
        # ...但真正的 per-transfer pack(资金流)须 service_enabled 后才可创建。
        self.client.post(
            f"{API}/payment-intents/{intent_id}/source-classification",
            json={"sourceType": "wallet", "sourceIdentifier": "T-gate-1", "jurisdiction": "HK"},
            headers=self._auth(patron["patronToken"]),
        )
        self.client.post(
            f"{API}/payment-intents/{intent_id}/actual-confirmation",
            json={"asset": "USDT", "network": "tron", "actualAmount": "10000",
                  "sourceType": "wallet", "sourceIdentifier": "T-gate-1"},
            headers=self._auth(patron["patronToken"]),
        )
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/compliance-packs",
            json={"transferLeg": "verification", "actualAmount": "1", "actualHkdAmount": "8"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 403


class FailClosedTests(TransactionComplianceTestCase):
    def test_production_without_notabene_fails_closed_before_address(self):
        # 直接调 provider 解析: production 无配置 -> ProviderUnavailable(API 层映射 503)。
        from notabene_adapter import ProviderUnavailable, resolve_notabene_provider

        with self.assertRaises(ProviderUnavailable):
            resolve_notabene_provider({}, environment="production")

    def test_legacy_payment_application_remains_historical(self):
        # 若旧库有 payment_applications 行, 新流程绝不读它授权新转账。
        with server.db() as conn:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS payment_applications (
                       id TEXT PRIMARY KEY, patron_email TEXT NOT NULL,
                       travel_rule_json TEXT, status TEXT NOT NULL,
                       created_at INTEGER NOT NULL)"""
            )
            conn.execute(
                """INSERT INTO payment_applications(id, patron_email, travel_rule_json, status, created_at)
                   VALUES ('legacy-pa', 'legacy@example.test', '{"old":true}', 'submitted', ?)""",
                (self.now,),
            )
            conn.commit()
        patron = self._create_eligible_case()
        self._set_service_enabled(patron["caseId"])
        intent = self._create_intent(patron)
        self._classify_source(patron, intent["id"])
        self._confirm_actual(patron, intent["id"], "10000")
        pack = self._create_pack(patron, intent["id"], leg="verification", actual_hkd="8", actual_amount="1")
        assert pack["travelRuleDepth"] == "basic"
        # legacy 行未被改动/删除。
        with server.db() as conn:
            row = conn.execute("SELECT * FROM payment_applications WHERE id='legacy-pa'").fetchone()
        assert row["status"] == "submitted"


if __name__ == "__main__":
    unittest.main()
