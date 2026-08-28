"""Tests for the demo quick-login endpoint (POST /api/demo/enter).

Four-role demo: the home page offers one-click entry for Host / Manager /
HK Ops / VIP. The endpoint issues a real session for the seeded demo account
and is gated on HT_DEMO_BYPASS_2FA + non-production (403 otherwise).
"""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import server
import seed_demo


def _temp_db_path() -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="ht-demo-enter-"))
    return tmp / "test.db"


class DemoEnterTest(unittest.TestCase):
    def setUp(self):
        self.db_path = _temp_db_path()
        self._old_db_path = server.DB_PATH
        server.DB_PATH = self.db_path
        # 保存原旁路开关, 测试内显式控制
        self._old_bypass = server.DEMO_BYPASS_2FA
        self._old_env = server.SUMSUB_ENVIRONMENT
        server.init_db()
        self._seed_demo_users()
        self.client = TestClient(server.app)

    def tearDown(self):
        server.DB_PATH = self._old_db_path
        server.DEMO_BYPASS_2FA = self._old_bypass
        server.SUMSUB_ENVIRONMENT = self._old_env
        try:
            self.db_path.unlink()
        except OSError:
            pass

    def _seed_demo_users(self):
        now = int(__import__("time").time())
        pw_hash, pw_salt = server.hash_password("Staff@Demo123")
        with server.db() as conn:
            for uid, email, name, roles in [
                ("demo-adm-host", "host.vip.demo@operator.example", "Demo VIP Host", ["host"]),
                ("demo-leader", "leader@demo.local", "Demo Leader", ["leader"]),
                ("demo-ops", "ops@demo.local", "Demo HK Ops", ["ops"]),
                ("demo-adm-patron", "vip.admission.demo@operator.example", "Demo VIP Patron", []),
            ]:
                conn.execute(
                    """INSERT INTO users(id, phone, area_code, number, name, email,
                       pw_hash, pw_salt, totp_secret, totp_enabled, status, user_type, created_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (uid, None, "", "", name, email,
                     pw_hash, pw_salt, "x", 1, "active",
                     "staff" if roles else "patron", now),
                )
                for r in roles:
                    conn.execute(
                        "INSERT INTO user_roles(user_id, role) VALUES (?,?)", (uid, r)
                    )
            conn.commit()

    def _enter(self, role: str):
        return self.client.post("/api/demo/enter", json={"role": role})

    # ------------------------------------------------------------------ #
    def test_host_enter_returns_real_session(self):
        server.DEMO_BYPASS_2FA = True
        server.SUMSUB_ENVIRONMENT = "sandbox"
        resp = self._enter("host")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ok"] is True
        assert body["user"]["email"] == "host.vip.demo@operator.example"
        assert "host" in body["user"]["roles"]
        # token 可经 /api/me 校验(真实会话)
        me = self.client.get("/api/me", headers={"Authorization": f"Bearer {body['token']}"})
        assert me.status_code == 200, me.text
        assert me.json()["user"]["email"] == "host.vip.demo@operator.example"

    def test_all_roles_map(self):
        server.DEMO_BYPASS_2FA = True
        server.SUMSUB_ENVIRONMENT = "sandbox"
        expected = {
            "host": "host.vip.demo@operator.example",
            "leader": "leader@demo.local",
            "ops": "ops@demo.local",
            "vip": "vip.admission.demo@operator.example",
        }
        for role, email in expected.items():
            resp = self._enter(role)
            assert resp.status_code == 200, (role, resp.text)
            assert resp.json()["user"]["email"] == email, role

    def test_unknown_role_rejected(self):
        server.DEMO_BYPASS_2FA = True
        server.SUMSUB_ENVIRONMENT = "sandbox"
        assert self._enter("root").status_code == 400

    def test_disabled_when_bypass_off(self):
        server.DEMO_BYPASS_2FA = False
        server.SUMSUB_ENVIRONMENT = "sandbox"
        assert self._enter("host").status_code == 403

    def test_disabled_in_production(self):
        server.DEMO_BYPASS_2FA = True
        server.SUMSUB_ENVIRONMENT = "production"
        assert self._enter("host").status_code == 403

    def test_admission_demo_separates_account_created_from_kyc_submitted(self):
        seed_demo.seed_admission_demo()
        with server.db() as conn:
            account_created = conn.execute(
                "SELECT status, claimed_at, kyc_submitted_at FROM vip_admission_cases WHERE id=?",
                (seed_demo.ADM_ATTN_KYC_ID,),
            ).fetchone()
            pending_approval = conn.execute(
                "SELECT status, kyc_approved_at FROM vip_admission_cases WHERE id=?",
                (seed_demo.ADM_PENDING_CASE_ID,),
            ).fetchone()
            expired_kyc = conn.execute(
                "SELECT status, kyc_approved_at, kyc_expired_at FROM vip_admission_cases WHERE id=?",
                (seed_demo.ADM_ATTN_KYC_FAIL_ID,),
            ).fetchone()

        assert account_created["status"] == "vip_claimed"
        assert account_created["claimed_at"] is not None
        assert account_created["kyc_submitted_at"] is None
        assert pending_approval["status"] == "leader_pending"
        assert pending_approval["kyc_approved_at"] is not None
        assert expired_kyc["status"] == "kyc_expired"
        assert expired_kyc["kyc_approved_at"] is not None
        assert expired_kyc["kyc_expired_at"] is not None


if __name__ == "__main__":
    unittest.main()
