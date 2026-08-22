"""API tests for dual-channel admission claiming (Task 4).

Requirements under test:
  - an email-link session (6h) and a dynamic QR session (15 min) both refer to
    the same still-open admission case;
  - a case can only be claimed with the Email OTP at the case invitation email
    (a QR scan alone never claims a case);
  - once bound, every unused invitation presentation of the case is invalidated
    (410 Gone);
  - a wrong email is rejected with a neutral 400 that never discloses whether
    another email exists ("invitation" must not appear in the detail);
  - the legacy invitation endpoints remain functional/read-only for existing
    records — new Host cases never route through them.
"""

import sqlite3
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
    tmp = tempfile.mkdtemp(prefix="ht-admission-claims-")
    return Path(tmp) / "test.db"


class AdmissionClaimsTestCase(unittest.TestCase):
    def setUp(self):
        self.db_path = _temp_db_path()
        self._old_db_path = server.DB_PATH
        server.DB_PATH = self.db_path
        server.init_db()
        self.client = TestClient(server.app)
        self.now = int(time.time())
        # 测试确定性: 关闭 demo 旁路, Email OTP 必须真实校验(错误码被拒)
        server.DEMO_BYPASS_2FA = False

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

    def _create_case(self, host: dict, patron_email: str = "vip@example.test") -> dict:
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": patron_email, "servicePurpose": "VIP table credit",
                  "route": "complete_dossier"},
            headers=self._auth(host["token"]),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["case"]

    def _issue_email(self, host: dict, case_id: str) -> str:
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/invite/email", headers=self._auth(host["token"])
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["emailSessionToken"]

    def _issue_qr(self, host: dict, case_id: str) -> str:
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/invite/qr-session", headers=self._auth(host["token"])
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["qrSessionToken"]

    def _verify(self, session_token: str, email: str):
        return self.client.post(
            f"{API}/admission-claims/verify-email",
            json={"sessionToken": session_token, "email": email},
        )

    def _fetch_email_otp(self, email: str) -> str:
        with server.db() as conn:
            row = conn.execute(
                "SELECT code FROM email_otps WHERE identifier=?", (email.lower(),)
            ).fetchone()
        assert row is not None, "no email OTP issued"
        return row["code"]

    def _claim(self, session_token: str, email: str = "vip@example.test") -> dict:
        resp = self._verify(session_token, email)
        assert resp.status_code == 200, resp.text
        code = self._fetch_email_otp(email)
        resp = self.client.post(
            f"{API}/admission-claims/register",
            json={
                "sessionToken": session_token,
                "email": email,
                "emailOtp": code,
                "name": "Vip Patron",
                "password": "Patron#2026",
            },
        )
        assert resp.status_code == 200, resp.text
        return resp.json()

    def _case_row(self, case_id: str) -> sqlite3.Row:
        with server.db() as conn:
            return conn.execute(
                "SELECT * FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()

    def _session_rows(self, case_id: str) -> list[sqlite3.Row]:
        with server.db() as conn:
            return conn.execute(
                "SELECT * FROM admission_invitation_sessions WHERE admission_case_id=?",
                (case_id,),
            ).fetchall()


class DualChannelClaimTests(AdmissionClaimsTestCase):
    def test_email_and_qr_sessions_bind_the_same_case_after_email_otp(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        email_token = self._issue_email(host, case["id"])
        qr_token = self._issue_qr(host, case["id"])

        # Claim via the QR session + the invitation email + Email OTP.
        patron = self._claim(qr_token, "vip@example.test")
        assert self._case_row(case["id"])["patron_user_id"] == patron["userId"]
        assert self._case_row(case["id"])["status"] == "vip_claimed"

        # The email-link session is now invalidated (same case, already bound).
        resp = self._verify(email_token, "vip@example.test")
        assert resp.status_code == 410

    def test_qr_session_rejects_wrong_email_without_email_enumeration(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        qr_token = self._issue_qr(host, case["id"])
        response = self._verify(qr_token, "wrong@example.test")
        assert response.status_code == 400
        assert "invitation" not in response.json()["detail"].lower()
        assert "vip@example.test" not in response.text

    def test_qr_scan_alone_never_claims_a_case(self):
        # verify-email is mandatory: without Email OTP the case stays unbound.
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        qr_token = self._issue_qr(host, case["id"])
        resp = self._verify(qr_token, "vip@example.test")
        assert resp.status_code == 200
        assert self._case_row(case["id"])["patron_user_id"] is None
        assert self._case_row(case["id"])["status"] in ("draft", "invitation_open")

    def test_register_with_wrong_email_otp_is_rejected(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        qr_token = self._issue_qr(host, case["id"])
        resp = self.client.post(
            f"{API}/admission-claims/register",
            json={
                "sessionToken": qr_token,
                "email": "vip@example.test",
                "emailOtp": "000000",
                "name": "Vip Patron",
                "password": "Patron#2026",
            },
        )
        assert resp.status_code == 400

    def test_register_with_wrong_email_is_rejected_neutrally(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        qr_token = self._issue_qr(host, case["id"])
        resp = self.client.post(
            f"{API}/admission-claims/register",
            json={
                "sessionToken": qr_token,
                "email": "not-the-invitee@example.test",
                "emailOtp": "123456",
                "name": "Vip Patron",
                "password": "Patron#2026",
            },
        )
        assert resp.status_code == 400
        assert "invitation" not in resp.json()["detail"].lower()

    def test_unknown_session_token_fails_neutrally(self):
        resp = self._verify("totally-bogus-token", "vip@example.test")
        assert resp.status_code == 400
        assert "invitation" not in resp.json()["detail"].lower()

    def test_expired_session_returns_gone(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        token = self._issue_qr(host, case["id"])
        with server.db() as conn:
            conn.execute(
                "UPDATE admission_invitation_sessions SET expires_at=? WHERE admission_case_id=?",
                (self.now - 10, case["id"]),
            )
            conn.commit()
        resp = self._verify(token, "vip@example.test")
        assert resp.status_code == 410

    def test_email_session_ttl_is_six_hours_and_qr_ttl_is_fifteen_minutes(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        self._issue_email(host, case["id"])
        self._issue_qr(host, case["id"])
        sessions = self._session_rows(case["id"])
        by_channel = {s["channel"]: s for s in sessions}
        assert abs((by_channel["email"]["expires_at"] - self.now) - 6 * 3600) <= 5
        assert abs((by_channel["qr"]["expires_at"] - self.now) - 15 * 60) <= 5

    def test_only_raw_hash_is_stored_never_the_token(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        token = self._issue_qr(host, case["id"])
        sessions = self._session_rows(case["id"])
        for s in sessions:
            assert token not in s["token_hash"]
            assert "$" in s["token_hash"]  # salt$digest

    def test_claim_marks_case_vip_claimed_and_writes_audit(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        qr_token = self._issue_qr(host, case["id"])
        patron = self._claim(qr_token)
        with server.db() as conn:
            events = conn.execute(
                "SELECT * FROM audit_trail WHERE target_type='admission_case' AND target_id=? ORDER BY created_at",
                (case["id"],),
            ).fetchall()
        actions = [e["action"] for e in events]
        assert "admission.claim.register" in actions
        claim = next(e for e in events if e["action"] == "admission.claim.register")
        import json as _json
        detail = _json.loads(claim["detail_json"])
        assert detail["userId"] == patron["userId"]
        assert detail["priorStatus"] in ("draft", "invitation_open")
        assert detail["nextStatus"] == "vip_claimed"


class SessionIssueGuardTests(AdmissionClaimsTestCase):
    def test_only_owner_active_host_can_issue_sessions(self):
        host_a = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        host_b = self._create_staff("Host B", "host-b@example.test", ["host"], host_status="active")
        case = self._create_case(host_a)
        resp = self.client.post(
            f"{API}/admission-cases/{case['id']}/invite/email", headers=self._auth(host_b["token"])
        )
        assert resp.status_code == 404
        inactive = self._create_staff("Inactive", "inactive@example.test", ["host"], host_status="pending")
        resp = self.client.post(
            f"{API}/admission-cases/{case['id']}/invite/email", headers=self._auth(inactive["token"])
        )
        assert resp.status_code == 403

    def test_issue_sessions_transitions_draft_to_invitation_open(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        assert self._case_row(case["id"])["status"] == "draft"
        self._issue_email(host, case["id"])
        assert self._case_row(case["id"])["status"] == "invitation_open"


class LegacyInvitationReadOnlyTests(AdmissionClaimsTestCase):
    def test_legacy_invitation_endpoints_still_work(self):
        # Legacy staff-first flow stays functional (read-only boundary for audit):
        # RM submits -> marketing approves. New Host cases never use these rows.
        rm = self._create_staff("RM", "rm@example.test", ["rm"])
        marketing = self._create_staff("Marketing", "mkt@example.test", ["marketing"])
        resp = self.client.post(
            f"{API}/invitations",
            json={"patronEmail": "legacy@example.test", "patronName": "Legacy Patron"},
            headers=self._auth(rm["token"]),
        )
        assert resp.status_code == 200, resp.text
        inv_id = resp.json()["invitation"]["id"]
        resp = self.client.post(
            f"{API}/invitations/{inv_id}/approve", json={"note": "ok"},
            headers=self._auth(marketing["token"]),
        )
        assert resp.status_code == 200, resp.text
        with server.db() as conn:
            row = conn.execute("SELECT status FROM invitations WHERE id=?", (inv_id,)).fetchone()
        # 底层状态 issued(UI 显示 approved); 关键断言是 legacy 流程仍可用、数据未被新流程触碰。
        assert row["status"] in ("approved", "issued")


if __name__ == "__main__":
    unittest.main()
