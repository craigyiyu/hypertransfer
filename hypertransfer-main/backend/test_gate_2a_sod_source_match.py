"""Gate 2A (24h wallet re-screen), Gate 3 source-match, refund SoD, retention & QR.

Covers the morning gap-closure batch mapped to the QA/UAT plan:
  - TC-WS-05 / Gate 2A: wallet screening must be fresh (24h look-back) before address issuance.
  - TC-AD-07 / Gate 3: the 1-USDT verification transfer must originate from the declared wallet.
  - TC-WD-04: segregation of duties — a user cannot screen/approve/reject a withdrawal they created.
  - TC-GV-01: retention years = 7 (was 5).
  - TC-AD-05 / TC-WI-05: QR endpoint returns a data URI for address delivery.
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
CLEAN_WALLET = "0x742d35Cc6634C0532925a3b844Bc9e7595f8bEb0"
OTHER_WALLET = "0x1111111111111111111111111111111111111111"


def _temp_db_path() -> Path:
    tmp = tempfile.mkdtemp(prefix="ht-gate2a-")
    return Path(tmp) / "test.db"


class Gate2aSoDSourceMatchTestCase(unittest.TestCase):
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
    def _create_user(self, name: str, email: str, user_type: str = "patron",
                     roles: list[str] | None = None) -> dict:
        uid = str(uuid.uuid4())
        pw_hash, pw_salt = server.hash_password("Patron#2026")
        with server.db() as conn:
            conn.execute(
                """INSERT INTO users(
                       id, phone, area_code, number, name, email, pw_hash, pw_salt,
                       totp_secret, totp_enabled, status, user_type, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (uid, None, None, None, name, email, pw_hash, pw_salt,
                 pyotp.random_base32(), 1, "active", user_type, self.now),
            )
            for role in roles or []:
                conn.execute("INSERT INTO user_roles(user_id, role) VALUES (?,?)", (uid, role))
            conn.commit()
        token = server.create_session(uid)
        return {"id": uid, "email": email, "token": token}

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def _kyc_approve(self, token: str) -> None:
        resp = self.client.post(f"{API}/sumsub/kyc/demo-approve", headers=self._auth(token))
        assert resp.status_code == 200, resp.text

    def _create_deposit(self, token: str, amount: str = "500", network: str = "ethereum") -> str:
        resp = self.client.post(
            f"{API}/deposits",
            json={"asset": "USDT", "network": network, "amountDecimal": amount},
            headers=self._auth(token),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["requestId"]

    def _screen(self, token: str, did: str, wallet: str = CLEAN_WALLET) -> None:
        resp = self.client.post(
            f"{API}/deposits/{did}/screen",
            json={"sourceWallet": wallet},
            headers=self._auth(token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["screeningStatus"] == "pass", resp.text

    def _issue(self, token: str, did: str):
        return self.client.post(f"{API}/deposits/{did}/issue-address", headers=self._auth(token))

    # ------------------------------------------------------------------ #
    # TC-GV-01 — retention 7 years
    # ------------------------------------------------------------------ #
    def test_retention_years_is_seven(self):
        self.assertEqual(server.RETENTION_YEARS, 7)

    # ------------------------------------------------------------------ #
    # TC-WS-05 / Gate 2A — 24h screening freshness before address issuance
    # ------------------------------------------------------------------ #
    def test_issue_address_requires_fresh_screening(self):
        patron = self._create_user("Patron A", "patron-a@example.test")
        self._kyc_approve(patron["token"])
        did = self._create_deposit(patron["token"])
        self._screen(patron["token"], did)

        # Fresh screening → address issued.
        resp = self._issue(patron["token"], did)
        assert resp.status_code == 200, resp.text

    def test_stale_screening_blocks_issue_until_rescreen(self):
        patron = self._create_user("Patron B", "patron-b@example.test")
        self._kyc_approve(patron["token"])
        did = self._create_deposit(patron["token"])
        self._screen(patron["token"], did)

        # Age the screening beyond the 24h look-back window.
        with server.db() as conn:
            conn.execute(
                "UPDATE deposit_requests SET screening_at=? WHERE id=?",
                (self.now - 25 * 3600, did),
            )
            conn.commit()

        resp = self._issue(patron["token"], did)
        assert resp.status_code == 409, resp.text
        assert "24 hours" in resp.json()["detail"], resp.text

        # Re-screen restores the Gate 2A clearance and issuance succeeds.
        self._screen(patron["token"], did)
        resp = self._issue(patron["token"], did)
        assert resp.status_code == 200, resp.text

    def test_screening_timestamp_is_recorded(self):
        patron = self._create_user("Patron C", "patron-c@example.test")
        self._kyc_approve(patron["token"])
        did = self._create_deposit(patron["token"])
        self._screen(patron["token"], did)
        resp = self.client.get(f"{API}/deposits/{did}", headers=self._auth(patron["token"]))
        assert resp.status_code == 200, resp.text
        screening_at = resp.json()["deposit"]["screeningAt"]
        assert screening_at is not None
        assert abs(int(screening_at) - self.now) < 120

    # ------------------------------------------------------------------ #
    # TC-AD-07 / Gate 3 — verification transfer must come from the declared wallet
    # ------------------------------------------------------------------ #
    def _issue_ok(self, patron: dict) -> str:
        did = self._create_deposit(patron["token"])
        self._screen(patron["token"], did)
        resp = self._issue(patron["token"], did)
        assert resp.status_code == 200, resp.text
        return did

    def test_confirm_test_accepts_declared_sender(self):
        patron = self._create_user("Patron D", "patron-d@example.test")
        self._kyc_approve(patron["token"])
        did = self._issue_ok(patron)
        resp = self.client.post(
            f"{API}/deposits/{did}/confirm-test",
            json={"txHash": "0x" + "ab" * 32, "fromAddress": CLEAN_WALLET},
            headers=self._auth(patron["token"]),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "verified"

    def test_confirm_test_rejects_undeclared_sender(self):
        patron = self._create_user("Patron E", "patron-e@example.test")
        self._kyc_approve(patron["token"])
        did = self._issue_ok(patron)
        resp = self.client.post(
            f"{API}/deposits/{did}/confirm-test",
            json={"txHash": "0x" + "cd" * 32, "fromAddress": OTHER_WALLET},
            headers=self._auth(patron["token"]),
        )
        assert resp.status_code == 409, resp.text
        assert "did not originate" in resp.json()["detail"], resp.text
        # The wallet must NOT have been verified.
        with server.db() as conn:
            row = conn.execute(
                "SELECT verify_status FROM deposit_requests WHERE id=?", (did,)
            ).fetchone()
        assert row["verify_status"] != "confirmed"

    # ------------------------------------------------------------------ #
    # TC-WD-04 — segregation of duties on the refund workflow
    # ------------------------------------------------------------------ #
    def _insert_refund(self, user_id: str) -> str:
        rid = "RF-TEST-" + uuid.uuid4().hex[:8].upper()
        with server.db() as conn:
            conn.execute(
                """INSERT INTO refund_requests(
                       id,user_id,wallet_id,to_address,chain_id,asset,amount_decimal,
                       reason,status,kyc_ok,kyt_status,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (rid, user_id, "w-test", CLEAN_WALLET, "11155111", "USDT", "100",
                 None, "requested", 1, "pass", self.now, self.now),
            )
            conn.commit()
        return rid

    def test_refund_screen_approve_reject_block_creator(self):
        self_user = self._create_user("Ops Self", "ops-self@example.test",
                                      user_type="staff", roles=["compliance"])
        other = self._create_user("Ops Other", "ops-other@example.test",
                                  user_type="staff", roles=["compliance"])
        rid = self._insert_refund(self_user["id"])

        # The creator cannot screen / approve / reject their own request.
        for path in ("screen", "approve", "reject"):
            resp = self.client.post(
                f"{API}/refunds/{rid}/{path}",
                json={"decision": "pass"} if path == "screen" else None,
                headers=self._auth(self_user["token"]),
            )
            assert resp.status_code == 403, (path, resp.status_code, resp.text)
            assert "Segregation of duties" in resp.json()["detail"], resp.text

        # A different compliance user can complete the workflow.
        resp = self.client.post(
            f"{API}/refunds/{rid}/screen",
            json={"decision": "pass"},
            headers=self._auth(other["token"]),
        )
        assert resp.status_code == 200, resp.text
        resp = self.client.post(
            f"{API}/refunds/{rid}/approve", headers=self._auth(other["token"])
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "approved"

    # ------------------------------------------------------------------ #
    # TC-AD-05 / TC-WI-05 — QR endpoint for address delivery
    # ------------------------------------------------------------------ #
    def test_qr_endpoint_returns_data_uri(self):
        resp = self.client.get(f"{API}/qr", params={"text": CLEAN_WALLET})
        assert resp.status_code == 200, resp.text
        qr = resp.json()["qr"]
        assert qr.startswith("data:image/png;base64,"), qr[:40]

    def test_qr_endpoint_rejects_missing_text(self):
        resp = self.client.get(f"{API}/qr")
        assert resp.status_code == 400, resp.text


if __name__ == "__main__":
    unittest.main()
