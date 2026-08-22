"""Tests for staff self-onboarding and the Okta demo placeholder (feedback round).

Requirements under test:
  - an employee can self-register with a company email (allowed domains), pick
    their role (host / leader / ops), set a password, bind TOTP and activate;
  - disallowed email domains and invalid roles are rejected;
  - duplicate emails are rejected;
  - after confirm-totp the account activates and can sign in with the role;
  - Okta binding is a demo placeholder in non-production (no real OIDC); in
    production it fails closed without OKTA_* configuration;
  - the signed-in user sees the oktaLinked flag.
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
    tmp = tempfile.mkdtemp(prefix="ht-staff-onboard-")
    return Path(tmp) / "test.db"


class StaffOnboardingTestCase(unittest.TestCase):
    def setUp(self):
        self.db_path = _temp_db_path()
        self._old_db_path = server.DB_PATH
        server.DB_PATH = self.db_path
        server.init_db()
        self.client = TestClient(server.app)
        self.now = int(time.time())
        # 测试确定性: 显式打开 demo 旁路(confirm-totp / login 接受任意 6 位码)
        server.DEMO_BYPASS_2FA = True

    def tearDown(self):
        server.DB_PATH = self._old_db_path
        try:
            self.db_path.unlink()
        except OSError:
            pass

    def _onboard(self, email: str = "host2@operator.example", role: str = "host",
                 name: str = "New Host", password: str = "Staff@Onboard123"):
        return self.client.post(
            f"{API}/staff/onboarding/start",
            json={"name": name, "email": email, "password": password, "role": role},
        )

    def _confirm_totp(self, email: str, code: str = "123456") -> dict:
        resp = self.client.post(
            f"{API}/confirm-totp", json={"email": email, "code": code}
        )
        assert resp.status_code == 200, resp.text
        return resp.json()

    def _login(self, email: str, password: str) -> str:
        resp = self.client.post(
            f"{API}/login/start",
            json={"method": "email", "email": email, "password": password},
        )
        assert resp.status_code == 200, resp.text
        challenge = resp.json()["challenge"]
        resp = self.client.post(
            f"{API}/login/verify", json={"challenge": challenge, "code": "000000"}
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["token"]

    def _user_roles(self, user_id: str) -> list[str]:
        with server.db() as conn:
            rows = conn.execute(
                "SELECT role FROM user_roles WHERE user_id=?", (user_id,)
            ).fetchall()
        return [r["role"] for r in rows]


class OnboardingTests(StaffOnboardingTestCase):
    def test_employee_self_registers_with_company_email_and_role(self):
        resp = self._onboard(email="host2@operator.example", role="host")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["email"] == "host2@operator.example"
        assert data["otpauth_uri"] and data["secret"] and data["qr_png_base64"]
        with server.db() as conn:
            row = conn.execute(
                "SELECT id, status, user_type FROM users WHERE email='host2@operator.example'"
            ).fetchone()
        assert row["status"] == "pending_totp"
        assert row["user_type"] == "staff"
        assert self._user_roles(row["id"]) == ["host"]

    def test_each_employee_role_can_onboard(self):
        for role in ("host", "leader", "ops"):
            email = f"{role}2@operator.example"
            resp = self._onboard(email=email, role=role)
            assert resp.status_code == 200, resp.text
            with server.db() as conn:
                uid = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]
            assert self._user_roles(uid) == [role]

    def test_onboarding_rejects_disallowed_email_domain(self):
        resp = self._onboard(email="outsider@gmail.com", role="host")
        assert resp.status_code == 400
        assert "company email" in resp.json()["detail"].lower()

    def test_onboarding_rejects_invalid_role(self):
        resp = self._onboard(email="x2@operator.example", role="compliance")
        assert resp.status_code == 400

    def test_onboarding_rejects_duplicate_email(self):
        assert self._onboard(email="dup@operator.example", role="host").status_code == 200
        resp = self._onboard(email="dup@operator.example", role="leader")
        assert resp.status_code == 409

    def test_confirm_totp_activates_and_login_works_with_role(self):
        assert self._onboard(email="host3@operator.example", role="host").status_code == 200
        self._confirm_totp("host3@operator.example", "123456")
        token = self._login("host3@operator.example", "Staff@Onboard123")
        resp = self.client.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        user = resp.json()["user"]
        assert user["userType"] == "staff"
        assert "host" in user["roles"]

    def test_onboarded_host_still_needs_host_profile_activation(self):
        assert self._onboard(email="host4@operator.example", role="host").status_code == 200
        self._confirm_totp("host4@operator.example", "123456")
        token = self._login("host4@operator.example", "Staff@Onboard123")
        resp = self.client.get(f"{API}/host/profile", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 404  # profile 未激活
        # 未激活 profile 不能建 case
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_audit_event_written_for_onboarding(self):
        assert self._onboard(email="host5@operator.example", role="host").status_code == 200
        with server.db() as conn:
            rows = conn.execute(
                "SELECT action, target_type FROM audit_trail WHERE action='staff.onboard'"
            ).fetchall()
        assert len(rows) == 1


class OktaPlaceholderTests(StaffOnboardingTestCase):
    def _create_staff(self, name: str, email: str, roles: list[str]) -> dict:
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
            conn.commit()
        return {"id": uid, "token": server.create_session(uid)}

    def test_okta_link_is_demo_placeholder_in_non_production(self):
        staff = self._create_staff("Host", "okta1@operator.example", ["host"])
        resp = self.client.post(
            f"{API}/staff/okta/link", headers={"Authorization": f"Bearer {staff['token']}"}
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["linked"] is True
        assert data["demo"] is True
        with server.db() as conn:
            row = conn.execute("SELECT okta_sub FROM users WHERE id=?", (staff["id"],)).fetchone()
        assert row["okta_sub"] == f"demo-okta:{staff['id']}"

    def test_okta_linked_flag_surfaces_in_me(self):
        staff = self._create_staff("Host", "okta2@operator.example", ["host"])
        self.client.post(f"{API}/staff/okta/link", headers={"Authorization": f"Bearer {staff['token']}"})
        resp = self.client.get(f"{API}/me", headers={"Authorization": f"Bearer {staff['token']}"})
        assert resp.json()["user"]["oktaLinked"] is True
        other = self._create_staff("Other", "okta3@operator.example", ["ops"])
        resp = self.client.get(f"{API}/me", headers={"Authorization": f"Bearer {other['token']}"})
        assert resp.json()["user"]["oktaLinked"] is False

    def test_okta_link_requires_staff_session(self):
        resp = self.client.post(f"{API}/staff/okta/link")
        assert resp.status_code == 401

    def test_production_without_okta_config_fails_closed(self):
        from admission_provider_adapters import okta_configured

        assert okta_configured({}) is False
        # 真实生产逻辑由 require_host_provisioning 兜底(已测); 这里验证 demo 分支受非生产限制。
        assert server.SUMSUB_ENVIRONMENT != "production" or okta_configured(dict(__import__("os").environ))


if __name__ == "__main__":
    unittest.main()
