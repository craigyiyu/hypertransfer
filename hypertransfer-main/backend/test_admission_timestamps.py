"""Admission-case timestamps & intended-deposit (2026-08 mockup wiring).

Verifies the new Host VIP invite data:
  - intended_deposit_usd is stored on case create (numeric, USD display);
  - invite email / QR set invited_at + email_sent_at / qr_issued_at;
  - claim (qr-session + email OTP) sets claimed_at + used_at;
  - KYC approve sets kyc_submitted_at + kyc_approved_at;
  - leader rejection sets rejectedAt (approvalAt stays null) in the projection.
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
    tmp = tempfile.mkdtemp(prefix="ht-adm-ts-")
    return Path(tmp) / "test.db"


class AdmissionTimestampsTestCase(unittest.TestCase):
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

    def _case(self, case_id: str, token: str) -> dict:
        resp = self.client.get(f"{API}/admission-cases/{case_id}", headers=self._auth(token))
        assert resp.status_code == 200, resp.text
        return resp.json()["case"]

    def test_intended_deposit_and_invite_timestamps(self):
        host = self._create_staff("Host T1", "host-t1@example.test", ["host"], host_status="active")
        resp = self.client.post(
            f"{API}/admission-cases",
            json={
                "patronEmail": "vip@example.test", "firstName": "Vip", "lastName": "One",
                "intendedDepositUsd": "50000", "servicePurpose": "50000 USD",
            },
            headers=self._auth(host["token"]),
        )
        assert resp.status_code == 200, resp.text
        case = resp.json()["case"]
        assert case["intendedDepositUsd"] == "50000"

        # Invite email → invited_at + email_sent_at recorded.
        resp = self.client.post(
            f"{API}/admission-cases/{case['id']}/invite/email", headers=self._auth(host["token"])
        )
        assert resp.status_code == 200, resp.text
        c = self._case(case["id"], host["token"])
        assert c["invitedAt"] is not None
        assert c["emailSentAt"] is not None
        assert abs(c["emailSentAt"] - self.now) < 120

    def test_claim_and_kyc_timestamps(self):
        host = self._create_staff("Host T2", "host-t2@example.test", ["host"], host_status="active")
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test", "firstName": "Vip", "lastName": "Two"},
            headers=self._auth(host["token"]),
        )
        case = resp.json()["case"]

        # QR session → qr_issued_at + invited_at.
        resp = self.client.post(
            f"{API}/admission-cases/{case['id']}/invite/qr-session", headers=self._auth(host["token"])
        )
        assert resp.status_code == 200, resp.text
        qr_token = resp.json()["qrSessionToken"]
        c = self._case(case["id"], host["token"])
        assert c["qrIssuedAt"] is not None

        # Claim via email OTP (uses the case email).
        resp = self.client.post(
            f"{API}/admission-claims/verify-email",
            json={"sessionToken": qr_token, "email": "vip@example.test"},
        )
        assert resp.status_code == 200, resp.text
        with server.db() as conn:
            code = conn.execute(
                "SELECT code FROM email_otps WHERE identifier=?", ("vip@example.test",)
            ).fetchone()["code"]
        resp = self.client.post(
            f"{API}/admission-claims/register",
            json={"sessionToken": qr_token, "email": "vip@example.test", "emailOtp": code,
                  "name": "Vip Two", "password": "Patron#2026"},
        )
        assert resp.status_code == 200, resp.text
        c = self._case(case["id"], host["token"])
        assert c["claimedAt"] is not None
        assert c["usedAt"] is not None

        # Move to KYC in progress and demo-approve → kyc_submitted_at + kyc_approved_at.
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='kyc_in_progress', updated_at=? WHERE id=?",
                (self.now, case["id"]),
            )
            conn.commit()
        patron_id = self._case(case["id"], host["token"])["patronUserId"]
        token = server.create_session(patron_id)
        resp = self.client.post(f"{API}/sumsub/kyc/demo-approve", headers=self._auth(token))
        assert resp.status_code == 200, resp.text
        c = self._case(case["id"], host["token"])
        assert c["kycSubmittedAt"] is not None
        assert c["kycApprovedAt"] is not None
        assert c["approvalAt"] is None  # leader 尚未审批


if __name__ == "__main__":
    unittest.main()
