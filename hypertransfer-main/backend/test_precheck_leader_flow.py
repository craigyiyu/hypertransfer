"""Tests for the leader-approval demo path and USDC asset support (feedback round).

Requirements under test:
  - on the complete-dossier route, creating a payment intent from kyc_passed
    moves the case to payment_precheck (pre-check started);
  - a confirmed actual payment (no re-validation) moves payment_precheck ->
    leader_pending, so the single manager's queue actually receives the case;
  - on the kyc-first route, a passed KYC automatically queues the case for the
    leader (kyc_passed -> leader_pending);
  - payment intents accept USDT and USDC; the legacy deposit create gate also
    accepts both Phase 1 assets;
  - payment intents are not creatable before KYC / on a kyc_first case before
    approval.
"""

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
    tmp = tempfile.mkdtemp(prefix="ht-precheck-leader-")
    return Path(tmp) / "test.db"


class PrecheckLeaderFlowTestCase(unittest.TestCase):
    def setUp(self):
        self.db_path = _temp_db_path()
        self._old_db_path = server.DB_PATH
        server.DB_PATH = self.db_path
        server.init_db()
        self.client = TestClient(server.app)
        self.now = int(time.time())
        server.DEMO_BYPASS_2FA = True

    def tearDown(self):
        server.DB_PATH = self._old_db_path
        try:
            self.db_path.unlink()
        except OSError:
            pass

    def _staff(self, name: str, email: str, roles: list[str], host_status: str | None = None) -> dict:
        uid = str(uuid.uuid4())
        pw_hash, pw_salt = server.hash_password("Staff@Test123")
        with server.db() as conn:
            conn.execute(
                """INSERT INTO users(
                       id, phone, area_code, number, name, email, pw_hash, pw_salt,
                       totp_secret, totp_enabled, status, user_type, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,1,'active','staff',?)""",
                (uid, None, "", "", name, email, pw_hash, pw_salt,
                 pyotp.random_base32(), self.now),
            )
            for role in roles:
                conn.execute("INSERT INTO user_roles(user_id, role) VALUES (?,?)", (uid, role))
            if host_status is not None:
                conn.execute(
                    """INSERT INTO host_profiles(
                           user_id, employee_id, department, operating_team, location,
                           phone, status, acknowledged_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?)""",
                    (uid, "EMP-1", "VIP Services", "Macau", "Macau", "+853 0",
                     host_status, self.now, self.now),
                )
            conn.commit()
        token = server.create_session(uid)
        return {"id": uid, "email": email, "token": token}

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def _create_kyc_passed_case(self, route: str = "complete_dossier") -> tuple[str, str, dict]:
        host = self._staff("Host A", "host-a@example.test", ["host"], host_status="active")
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test", "servicePurpose": "VIP table credit",
                  "hostNotes": "Demo note", "route": route},
            headers=self._auth(host["token"]),
        )
        case_id = resp.json()["case"]["id"]
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/invite/qr-session", headers=self._auth(host["token"])
        )
        qr = resp.json()["qrSessionToken"]
        self.client.post(f"{API}/admission-claims/verify-email",
                         json={"sessionToken": qr, "email": "vip@example.test"})
        with server.db() as conn:
            code = conn.execute(
                "SELECT code FROM email_otps WHERE identifier='vip@example.test'"
            ).fetchone()["code"]
        resp = self.client.post(
            f"{API}/admission-claims/register",
            json={"sessionToken": qr, "email": "vip@example.test", "emailOtp": code,
                  "name": "Vip Patron", "password": "Patron#2026"},
        )
        patron_id = resp.json()["userId"]
        with server.db() as conn:
            conn.execute(
                """UPDATE vip_admission_cases
                   SET status='kyc_in_progress', kyc_valid_until=NULL WHERE id=?""",
                (case_id,),
            )
            conn.commit()
        server.persist_case_kyc_outcome(case_id, patron_id, "approved", [], None)
        token = server.create_session(patron_id)
        return case_id, patron_id, {"host": host, "patronToken": token, "caseId": case_id}

    def _case_status(self, case_id: str) -> str:
        with server.db() as conn:
            return conn.execute(
                "SELECT status FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()["status"]

    def _create_intent(self, patron_token: str, asset: str = "USDT", network: str = "tron") -> dict:
        resp = self.client.post(
            f"{API}/payment-intents",
            json={"asset": asset, "network": network, "intendedAmount": "10000"},
            headers=self._auth(patron_token),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["intent"]

    def _confirm_actual(self, patron_token: str, intent_id: str, amount: str = "10000") -> dict:
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/actual-confirmation",
            json={"asset": "USDT", "network": "tron", "actualAmount": amount,
                  "sourceType": "wallet", "sourceIdentifier": "T-precheck-1"},
            headers=self._auth(patron_token),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()


class CompleteDossierPrecheckTests(PrecheckLeaderFlowTestCase):
    def test_intent_creation_from_kyc_passed_starts_precheck(self):
        case_id, _, ctx = self._create_kyc_passed_case("complete_dossier")
        assert self._case_status(case_id) == "kyc_passed"
        intent = self._create_intent(ctx["patronToken"])
        assert intent["id"]
        assert self._case_status(case_id) == "payment_precheck"

    def test_confirmed_actual_moves_case_to_leader_pending(self):
        case_id, _, ctx = self._create_kyc_passed_case("complete_dossier")
        intent = self._create_intent(ctx["patronToken"])
        assert self._case_status(case_id) == "payment_precheck"
        resp = self.client.post(
            f"{API}/payment-intents/{intent['id']}/source-classification",
            json={"sourceType": "wallet", "sourceIdentifier": "T-precheck-1", "jurisdiction": "HK"},
            headers=self._auth(ctx["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        result = self._confirm_actual(ctx["patronToken"], intent["id"], "10000")
        assert result["requiresRevalidation"] is False
        assert self._case_status(case_id) == "leader_pending"
        # 单一 manager 的队列现在能看到该 case
        leader = self._staff("Leader", "leader@example.test", ["leader"])
        resp = self.client.get(f"{API}/leader/admission-cases", headers=self._auth(leader["token"]))
        assert [c["id"] for c in resp.json()["cases"]] == [case_id]

    def test_manager_approves_and_service_enabled(self):
        case_id, _, ctx = self._create_kyc_passed_case("complete_dossier")
        intent = self._create_intent(ctx["patronToken"])
        self.client.post(
            f"{API}/payment-intents/{intent['id']}/source-classification",
            json={"sourceType": "wallet", "sourceIdentifier": "T-precheck-1", "jurisdiction": "HK"},
            headers=self._auth(ctx["patronToken"]),
        )
        self._confirm_actual(ctx["patronToken"], intent["id"], "10000")
        leader = self._staff("Leader", "leader@example.test", ["leader"])
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/leader-decision",
            json={"decision": "approved"}, headers=self._auth(leader["token"]),
        )
        assert resp.status_code == 200, resp.text
        assert self._case_status(case_id) == "service_enabled"

    def test_intent_not_creatable_before_kyc(self):
        # vip_claimed(未 KYC)不能建 intent
        host = self._staff("Host A", "host-a@example.test", ["host"], host_status="active")
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test", "route": "complete_dossier"},
            headers=self._auth(host["token"]),
        )
        case_id = resp.json()["case"]["id"]
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/invite/qr-session", headers=self._auth(host["token"])
        )
        qr = resp.json()["qrSessionToken"]
        self.client.post(f"{API}/admission-claims/verify-email",
                         json={"sessionToken": qr, "email": "vip@example.test"})
        with server.db() as conn:
            code = conn.execute(
                "SELECT code FROM email_otps WHERE identifier='vip@example.test'"
            ).fetchone()["code"]
        resp = self.client.post(
            f"{API}/admission-claims/register",
            json={"sessionToken": qr, "email": "vip@example.test", "emailOtp": code,
                  "name": "Vip Patron", "password": "Patron#2026"},
        )
        patron_id = resp.json()["userId"]
        token = server.create_session(patron_id)
        resp = self.client.post(
            f"{API}/payment-intents",
            json={"asset": "USDT", "network": "tron", "intendedAmount": "10000"},
            headers=self._auth(token),
        )
        assert resp.status_code == 403


class KycFirstAutoQueueTests(PrecheckLeaderFlowTestCase):
    def test_kyc_first_case_auto_queues_for_leader_after_kyc_pass(self):
        case_id, _, ctx = self._create_kyc_passed_case("kyc_first")
        assert self._case_status(case_id) == "leader_pending"
        leader = self._staff("Leader", "leader@example.test", ["leader"])
        resp = self.client.get(f"{API}/leader/admission-cases", headers=self._auth(leader["token"]))
        assert [c["id"] for c in resp.json()["cases"]] == [case_id]

    def test_kyc_first_payment_intent_blocked_before_approval(self):
        case_id, _, ctx = self._create_kyc_passed_case("kyc_first")
        assert self._case_status(case_id) == "leader_pending"
        resp = self.client.post(
            f"{API}/payment-intents",
            json={"asset": "USDT", "network": "tron", "intendedAmount": "10000"},
            headers=self._auth(ctx["patronToken"]),
        )
        assert resp.status_code == 403  # 先批准后付款


class AssetSupportTests(PrecheckLeaderFlowTestCase):
    def test_payment_intent_accepts_usdc_on_ethereum(self):
        case_id, _, ctx = self._create_kyc_passed_case("complete_dossier")
        intent = self._create_intent(ctx["patronToken"], asset="USDC", network="ethereum")
        assert intent["asset"] == "USDC"
        assert intent["network"] == "ethereum"
        assert self._case_status(case_id) == "payment_precheck"

    def test_legacy_deposit_create_accepts_usdc(self):
        # demo patron 补 KYC(approved + 6 个月有效)以满足 legacy KYC 闸门
        with server.db() as conn:
            conn.execute(
                """INSERT INTO sumsub_kyc_applications(
                       user_id, external_user_id, applicant_id, level_name, status,
                       review_status, review_answer, approved_at, valid_until, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                ("demo-user-id", "ext-demo", "app-demo", "basic-kyc-level",
                 "approved", "completed", "GREEN", self.now, self.now + 120 * 86400, self.now, self.now),
            )
            conn.commit()
        resp = self.client.post(
            f"{API}/deposits",
            json={"network": "ethereum", "asset": "USDC", "amountDecimal": "5000"},
            headers=self._auth(server.DEMO_LOCAL_SESSION_TOKEN),
        )
        assert resp.status_code == 200, resp.text
        # 响应不带 asset 字段; 验证库里记录的是 USDC 即可
        with server.db() as conn:
            row = conn.execute(
                "SELECT asset, network FROM deposit_requests WHERE id=?", (resp.json()["requestId"],)
            ).fetchone()
        assert row["asset"] == "USDC"
        assert row["network"] == "ethereum"



if __name__ == "__main__":
    unittest.main()
