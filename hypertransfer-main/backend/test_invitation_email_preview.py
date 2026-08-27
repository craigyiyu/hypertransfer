"""Invitation email-preview endpoint tests (demo: RM 交付卡"查看 VIP 邮件").

Verifies:
  - preview returns the exact email the VIP receives (subject + body incl. single-use link)
    after marketing approval (which auto-issues the link);
  - preview is blocked before the invite is issued;
  - the RM who submitted can preview their own invite.
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
    tmp = tempfile.mkdtemp(prefix="ht-inv-preview-")
    return Path(tmp) / "test.db"


class InvitationEmailPreviewTestCase(unittest.TestCase):
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

    def _create_user(self, name: str, email: str, roles: list[str]) -> dict:
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
            conn.commit()
        token = server.create_session(uid)
        return {"id": uid, "email": email, "token": token}

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def _create_invite(self, rm: dict, email: str = "vip@example.test") -> str:
        resp = self.client.post(
            f"{API}/invitations",
            json={"patronEmail": email, "patronName": "Vip Patron"},
            headers=self._auth(rm["token"]),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["invitation"]["id"]

    def test_preview_blocked_before_issue(self):
        rm = self._create_user("RM A", "rm-a@example.test", ["rm"])
        inv_id = self._create_invite(rm)
        resp = self.client.get(f"{API}/invitations/{inv_id}/email-preview", headers=self._auth(rm["token"]))
        assert resp.status_code == 409, resp.text

    def test_preview_returns_actual_email_after_approval(self):
        rm = self._create_user("RM B", "rm-b@example.test", ["rm"])
        marketing = self._create_user("Mkt C", "mkt-c@example.test", ["marketing"])
        inv_id = self._create_invite(rm, email="vip@example.test")

        resp = self.client.post(
            f"{API}/invitations/{inv_id}/approve", json={"note": ""},
            headers=self._auth(marketing["token"]),
        )
        assert resp.status_code == 200, resp.text
        issued_link = resp.json()["inviteLink"]

        resp = self.client.get(f"{API}/invitations/{inv_id}/email-preview", headers=self._auth(rm["token"]))
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["to"] == "vip@example.test"
        assert "invited to HyperTransfer" in data["subject"]
        assert issued_link in data["text"], "preview body must contain the same single-use link"
        assert "vip@example.test" in data["text"]
        assert data["link"] == issued_link

    def test_other_rm_cannot_preview(self):
        rm = self._create_user("RM D", "rm-d@example.test", ["rm"])
        other = self._create_user("RM E", "rm-e@example.test", ["rm"])
        marketing = self._create_user("Mkt F", "mkt-f@example.test", ["marketing"])
        inv_id = self._create_invite(rm)
        resp = self.client.post(
            f"{API}/invitations/{inv_id}/approve", json={"note": ""},
            headers=self._auth(marketing["token"]),
        )
        assert resp.status_code == 200, resp.text
        resp = self.client.get(f"{API}/invitations/{inv_id}/email-preview", headers=self._auth(other["token"]))
        assert resp.status_code == 403, resp.text


if __name__ == "__main__":
    unittest.main()
