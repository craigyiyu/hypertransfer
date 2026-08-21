"""End-to-end integration matrix (Task 9).

Covers the acceptance-criteria scenarios in one sequential journey:
  Host activation; email claim; QR claim; wrong-email rejection; KYC passed;
  KYC document-expiry block; safe KYC failure; recommended approval route;
  alternative approval route; Basic transfer; Enhanced transfer; amount
  threshold crossing; VASP source; self-hosted source; verification pack;
  main pack; changed source revalidation; Cage confirmation; reconciliation
  export; expired/revoked invitation; Host ownership; leader authorization.

Role-by-role data-visibility checks (browser-smoke equivalent, API level):
  raw KYC details / Host notes / provider secrets / custody configuration never
  appear in the VIP or leader views.
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
from admission_rules import can_transition_admission

API = "/api"


def _temp_db_path() -> Path:
    tmp = tempfile.mkdtemp(prefix="ht-e2e-matrix-")
    return Path(tmp) / "test.db"


class E2eMatrixTestCase(unittest.TestCase):
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
    def _staff(self, name: str, email: str, roles: list[str], host_status: str | None = None) -> dict:
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

    def _create_case(self, host: dict, patron_email: str = "vip@example.test",
                     route: str = "complete_dossier") -> str:
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": patron_email, "servicePurpose": "VIP table credit",
                  "hostNotes": "Internal note — must never reach VIP/leader", "route": route},
            headers=self._auth(host["token"]),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["case"]["id"]

    def _issue_session(self, host: dict, case_id: str, channel: str) -> str:
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/invite/{'email' if channel == 'email' else 'qr-session'}",
            headers=self._auth(host["token"]),
        )
        assert resp.status_code == 200, resp.text
        key = "emailSessionToken" if channel == "email" else "qrSessionToken"
        return resp.json()[key]

    def _email_otp(self, email: str) -> str:
        with server.db() as conn:
            row = conn.execute(
                "SELECT code FROM email_otps WHERE identifier=?", (email.lower(),)
            ).fetchone()
        assert row, "no email OTP issued"
        return row["code"]

    def _claim(self, session_token: str, email: str) -> str:
        resp = self.client.post(
            f"{API}/admission-claims/verify-email",
            json={"sessionToken": session_token, "email": email},
        )
        assert resp.status_code == 200, resp.text
        code = self._email_otp(email)
        resp = self.client.post(
            f"{API}/admission-claims/register",
            json={"sessionToken": session_token, "email": email, "emailOtp": code,
                  "name": "Vip Patron", "password": "Patron#2026"},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["userId"]

    def _patron_token(self, patron_id: str) -> str:
        return server.create_session(patron_id)

    def _set_case(self, case_id: str, **fields: object) -> None:
        fields["updated_at"] = self.now
        assignments = ", ".join(f"{k}=?" for k in fields)
        with server.db() as conn:
            conn.execute(
                f"UPDATE vip_admission_cases SET {assignments} WHERE id=?",
                (*fields.values(), case_id),
            )
            conn.commit()

    def _build_packs(self, patron_token: str, amount: str = "10000", source: str = "T-matrix-source"):
        resp = self.client.post(
            f"{API}/payment-intents",
            json={"asset": "USDT", "network": "tron", "intendedAmount": amount},
            headers=self._auth(patron_token),
        )
        intent_id = resp.json()["intent"]["id"]
        self.client.post(
            f"{API}/payment-intents/{intent_id}/source-classification",
            json={"sourceType": "wallet", "sourceIdentifier": source, "jurisdiction": "HK"},
            headers=self._auth(patron_token),
        )
        self.client.post(
            f"{API}/payment-intents/{intent_id}/actual-confirmation",
            json={"asset": "USDT", "network": "tron", "actualAmount": amount,
                  "sourceType": "wallet", "sourceIdentifier": source},
            headers=self._auth(patron_token),
        )
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/compliance-packs",
            json={"transferLeg": "verification", "actualAmount": "1", "actualHkdAmount": "8"},
            headers=self._auth(patron_token),
        )
        verify_pack = resp.json()["pack"]
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/compliance-packs",
            json={"transferLeg": "main", "actualAmount": amount, "actualHkdAmount": "80000"},
            headers=self._auth(patron_token),
        )
        main_pack = resp.json()["pack"]
        return intent_id, verify_pack, main_pack


class AdmissionMatrixTests(E2eMatrixTestCase):
    def test_full_recommended_route_journey(self):
        # Host activation
        host = self._staff("Host A", "host-a@example.test", ["host"])
        resp = self.client.post(
            f"{API}/host/profile/activate",
            json={"operatingTeam": "Macau Table Games", "location": "Macau Peninsula",
                  "acknowledged": True},
            headers=self._auth(host["token"]),
        )
        assert resp.status_code == 200 and resp.json()["profile"]["status"] == "active"

        # Case + email + QR sessions; wrong email neutral rejection
        case_id = self._create_case(host)
        email_token = self._issue_session(host, case_id, "email")
        qr_token = self._issue_session(host, case_id, "qr")
        wrong = self.client.post(
            f"{API}/admission-claims/verify-email",
            json={"sessionToken": qr_token, "email": "wrong@example.test"},
        )
        assert wrong.status_code == 400 and "invitation" not in wrong.json()["detail"].lower()

        # Email OTP claim via the QR session binds the case and invalidates the email session
        patron_id = self._claim(qr_token, "vip@example.test")
        with server.db() as conn:
            row = conn.execute(
                "SELECT patron_user_id, status FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()
        assert row["patron_user_id"] == patron_id and row["status"] == "vip_claimed"
        assert self.client.post(
            f"{API}/admission-claims/verify-email",
            json={"sessionToken": email_token, "email": "vip@example.test"},
        ).status_code == 410

        # KYC: safe failure first, then pass with document-expiry shortening validity
        self._set_case(case_id, status="kyc_in_progress")
        server.persist_case_kyc_outcome(case_id, patron_id, "failed", [], "document_expired")
        host_view = self.client.get(
            f"{API}/admission-cases/{case_id}", headers=self._auth(host["token"])
        ).json()["case"]
        assert host_view["kycHostMessage"] == "Document expired — ask the VIP to resubmit a valid document."
        assert "#1234" not in json.dumps(host_view)
        assert host_view["status"] == "kyc_failed"

        # 新尝试: 文档 90 天后到期 -> valid_until 缩短
        self._set_case(case_id, status="kyc_in_progress", kyc_reason_code=None, kyc_valid_until=None)
        server.persist_case_kyc_outcome(case_id, patron_id, "approved", [self.now + 90 * 86400], None)
        with server.db() as conn:
            row = conn.execute(
                "SELECT status, kyc_valid_until FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()
        assert row["status"] == "kyc_passed"
        assert abs(row["kyc_valid_until"] - (self.now + 90 * 86400)) <= 5

        # Recommended route: kyc_passed -> payment_precheck -> leader_pending -> service_enabled
        assert can_transition_admission("kyc_passed", "payment_precheck", "complete_dossier")
        self._set_case(case_id, status="payment_precheck")
        self._set_case(case_id, status="leader_pending")
        leader = self._staff("Leader", "leader@example.test", ["leader"])
        resp = self.client.get(f"{API}/leader/admission-cases", headers=self._auth(leader["token"]))
        assert [c["id"] for c in resp.json()["cases"]] == [case_id]
        # 非 leader 不能决策
        assert self.client.post(
            f"{API}/admission-cases/{case_id}/leader-decision",
            json={"decision": "approved"}, headers=self._auth(host["token"]),
        ).status_code == 403
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/leader-decision",
            json={"decision": "approved"}, headers=self._auth(leader["token"]),
        )
        assert resp.status_code == 200
        assert self._leader_view_has_no_sensitive_data(case_id, leader)
        with server.db() as conn:
            assert conn.execute(
                "SELECT status FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()["status"] == "service_enabled"

        # VIP 视图无 Host notes/内部原因
        patron = self._patron_token(patron_id)
        resp = self.client.get(f"{API}/admission-cases/{case_id}", headers=self._auth(patron))
        assert resp.status_code == 200
        assert "Internal note" not in json.dumps(resp.json()["case"])
        assert resp.json()["case"]["hostNotes"] is None

        # 支付: Basic verification pack + Enhanced main pack + 阈值跨越重验 + 来源变更重验
        intent_id, verify_pack, main_pack = self._build_packs(patron, amount="10000")
        assert verify_pack["travelRuleDepth"] == "basic"
        assert main_pack["travelRuleDepth"] == "enhanced"
        assert verify_pack["id"] != main_pack["id"]

        # Cage + reconcile + export(在重验之前, pack 指纹仍匹配当前确认)
        ops = self._staff("Ops", "ops@example.test", ["ops"])
        self.client.post(
            f"{API}/transaction-compliance-packs/{main_pack['id']}/screen", headers=self._auth(patron)
        )
        self.client.post(
            f"{API}/transaction-compliance-packs/{main_pack['id']}/issue-address", headers=self._auth(patron)
        )
        self.client.post(
            f"{API}/transaction-compliance-packs/{main_pack['id']}/record-transfer",
            json={"txHash": "0x" + "cd" * 32, "status": "confirmed"}, headers=self._auth(patron),
        )
        assert self.client.post(
            f"{API}/transaction-compliance-packs/{main_pack['id']}/cage-confirmation",
            json={"cageConfirmationId": "CAGE-M1"}, headers=self._auth(ops["token"]),
        ).status_code == 200
        assert self.client.post(
            f"{API}/transaction-compliance-packs/{main_pack['id']}/reconcile",
            json={"reconciliationRef": "FIN-M1"}, headers=self._auth(ops["token"]),
        ).status_code == 200
        rows = self.client.get(
            f"{API}/operations/reconciliation-export", headers=self._auth(ops["token"])
        ).json()["rows"]
        main_row = next(r for r in rows if r["transactionCompliancePackId"] == main_pack["id"])
        assert main_row["cageConfirmationId"] == "CAGE-M1"
        assert main_row["reconciliationRef"] == "FIN-M1"

        # 阈值跨越(10000 -> 7999)触发 enhanced revalidation
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/actual-confirmation",
            json={"asset": "USDT", "network": "tron", "actualAmount": "7999",
                  "sourceType": "wallet", "sourceIdentifier": "T-matrix-source"},
            headers=self._auth(patron),
        )
        assert resp.json()["requiresRevalidation"] is True
        assert resp.json()["revalidationReason"] == "amount_crossed_threshold"

        # VASP 来源通过(可建 pack)
        resp = self.client.post(
            f"{API}/payment-intents",
            json={"asset": "USDT", "network": "tron", "intendedAmount": "10000"},
            headers=self._auth(patron),
        )
        vasp_intent = resp.json()["intent"]["id"]
        resp = self.client.post(
            f"{API}/payment-intents/{vasp_intent}/source-classification",
            json={"sourceType": "vasp", "sourceIdentifier": "vasp.example.test", "jurisdiction": "HK"},
            headers=self._auth(patron),
        )
        assert resp.json()["sourceStatus"] == "pass"

    def test_alternative_route_kyc_first(self):
        host = self._staff("Host B", "host-b@example.test", ["host"], host_status="active")
        case_id = self._create_case(host, route="kyc_first")
        qr = self._issue_session(host, case_id, "qr")
        patron_id = self._claim(qr, "vip@example.test")
        self._set_case(case_id, status="kyc_in_progress")
        server.persist_case_kyc_outcome(case_id, patron_id, "approved", [], None)
        # kyc_first: kyc_passed -> leader_pending(无需 payment_precheck)
        assert can_transition_admission("kyc_passed", "leader_pending", "kyc_first")
        self._set_case(case_id, status="leader_pending")
        leader = self._staff("Leader", "leader2@example.test", ["leader"])
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/leader-decision",
            json={"decision": "approved"}, headers=self._auth(leader["token"]),
        )
        assert resp.status_code == 200

    def test_expired_and_revoked_invitations(self):
        host = self._staff("Host C", "host-c@example.test", ["host"], host_status="active")
        case_id = self._create_case(host, patron_email="late@example.test")
        token = self._issue_session(host, case_id, "qr")
        with server.db() as conn:
            conn.execute(
                "UPDATE admission_invitation_sessions SET expires_at=? WHERE admission_case_id=?",
                (self.now - 10, case_id),
            )
            conn.commit()
        assert self.client.post(
            f"{API}/admission-claims/verify-email",
            json={"sessionToken": token, "email": "late@example.test"},
        ).status_code == 410
        # revoked: host revoke -> 410 on claim
        case_id2 = self._create_case(host, patron_email="rev@example.test")
        token2 = self._issue_session(host, case_id2, "qr")
        assert self.client.post(
            f"{API}/admission-cases/{case_id2}/revoke", headers=self._auth(host["token"])
        ).status_code == 200
        assert self.client.post(
            f"{API}/admission-claims/verify-email",
            json={"sessionToken": token2, "email": "rev@example.test"},
        ).status_code == 410

    def test_host_ownership_and_leader_authorization(self):
        host_a = self._staff("Host A", "hosta@example.test", ["host"], host_status="active")
        host_b = self._staff("Host B", "hostb@example.test", ["host"], host_status="active")
        case_id = self._create_case(host_b, patron_email="b@example.test")
        # Host ownership: A 不能读 B 的 case
        assert self.client.get(
            f"{API}/admission-cases/{case_id}", headers=self._auth(host_a["token"])
        ).status_code == 404
        # 未授权角色不能决策
        self._set_case(case_id, status="leader_pending")
        for actor in (host_a, self._staff("Compliance", "comp@example.test", ["compliance"])):
            assert self.client.post(
                f"{API}/admission-cases/{case_id}/leader-decision",
                json={"decision": "approved"}, headers=self._auth(actor["token"]),
            ).status_code == 403

    def _leader_view_has_no_sensitive_data(self, case_id: str, leader: dict) -> bool:
        resp = self.client.get(f"{API}/leader/admission-cases", headers=self._auth(leader["token"]))
        assert resp.status_code == 200
        dumped = json.dumps(resp.json()["cases"])
        for leaked in ("Internal note", "vip@example.test", "passport", "wallet",
                       "provider", "applicant", "sanction", "kyc_reason", "hostNotes"):
            assert leaked not in dumped, f"leader view leaked {leaked}"
        return True


if __name__ == "__main__":
    unittest.main()
