"""Tests for approval visibility and Host-side settlement status (feedback round).

Requirements under test:
  - the leader's decision and business rejection reason are persisted on the
    case and surfaced to the owning Host (approve / reject + reason);
  - the leader dossier includes the Host's business note (host notes are
    internal staff data, not VIP data) and the KYC pass/valid-until status;
  - the Host's case view aggregates per-leg settlement status: verification /
    main transfer confirmation, custody address, TxID, Cage confirmation ID
    and reconciliation;
  - data-visibility boundaries still hold: the VIP never sees Host notes or
    internal leader reasons; the leader never sees raw KYC/provider detail.
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
    tmp = tempfile.mkdtemp(prefix="ht-visibility-")
    return Path(tmp) / "test.db"


class VisibilityTestCase(unittest.TestCase):
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

    def _create_service_enabled_case(self, host: dict) -> tuple[str, str]:
        """Create + claim + KYC pass + service_enabled; returns (case_id, patron_id)."""
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test", "servicePurpose": "VIP table credit",
                  "hostNotes": "Business note from the Host — for the approver", "route": "complete_dossier"},
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
                   SET status='service_enabled', kyc_valid_until=?, updated_at=? WHERE id=?""",
                (self.now + 120 * 86400, self.now, case_id),
            )
            conn.commit()
        return case_id, patron_id

    def _build_main_pack(self, patron_id: str) -> str:
        token = server.create_session(patron_id)
        resp = self.client.post(
            f"{API}/payment-intents",
            json={"asset": "USDT", "network": "tron", "intendedAmount": "10000"},
            headers=self._auth(token),
        )
        intent_id = resp.json()["intent"]["id"]
        self.client.post(
            f"{API}/payment-intents/{intent_id}/source-classification",
            json={"sourceType": "wallet", "sourceIdentifier": "T-visibility-1", "jurisdiction": "HK"},
            headers=self._auth(token),
        )
        self.client.post(
            f"{API}/payment-intents/{intent_id}/actual-confirmation",
            json={"asset": "USDT", "network": "tron", "actualAmount": "10000",
                  "sourceType": "wallet", "sourceIdentifier": "T-visibility-1"},
            headers=self._auth(token),
        )
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/compliance-packs",
            json={"transferLeg": "main", "actualAmount": "10000", "actualHkdAmount": "80000"},
            headers=self._auth(token),
        )
        pack_id = resp.json()["pack"]["id"]
        self.client.post(f"{API}/transaction-compliance-packs/{pack_id}/screen", headers=self._auth(token))
        self.client.post(f"{API}/transaction-compliance-packs/{pack_id}/issue-address", headers=self._auth(token))
        self.client.post(
            f"{API}/transaction-compliance-packs/{pack_id}/record-transfer",
            json={"txHash": "0x" + "ef" * 32, "status": "confirmed"}, headers=self._auth(token),
        )
        return pack_id

    def _case_as_host(self, case_id: str, host: dict) -> dict:
        resp = self.client.get(f"{API}/admission-cases/{case_id}", headers=self._auth(host["token"]))
        assert resp.status_code == 200, resp.text
        return resp.json()["case"]


class LeaderDecisionVisibilityTests(VisibilityTestCase):
    def test_leader_rejection_reason_is_persisted_and_visible_to_host(self):
        host = self._staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._staff("Leader", "leader@example.test", ["leader"])
        case_id, _ = self._create_service_enabled_case(host)
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='leader_pending', kyc_valid_until=? WHERE id=?",
                (self.now + 120 * 86400, case_id),
            )
            conn.commit()
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/leader-decision",
            json={"decision": "rejected", "reason": "Not within service appetite"},
            headers=self._auth(leader["token"]),
        )
        assert resp.status_code == 200, resp.text
        case = self._case_as_host(case_id, host)
        assert case["status"] == "rejected"
        assert case["leaderDecision"] == "rejected"
        assert case["leaderReason"] == "Not within service appetite"
        assert case["leaderDecidedAt"] is not None

    def test_leader_approval_is_visible_to_host(self):
        host = self._staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._staff("Leader", "leader@example.test", ["leader"])
        case_id, _ = self._create_service_enabled_case(host)
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='leader_pending', kyc_valid_until=? WHERE id=?",
                (self.now + 120 * 86400, case_id),
            )
            conn.commit()
        resp = self.client.post(
            f"{API}/admission-cases/{case_id}/leader-decision",
            json={"decision": "approved"}, headers=self._auth(leader["token"]),
        )
        assert resp.status_code == 200
        case = self._case_as_host(case_id, host)
        assert case["status"] == "service_enabled"
        assert case["leaderDecision"] == "approved"
        assert case["leaderReason"] is None

    def test_leader_dossier_includes_host_note_and_kyc_status(self):
        host = self._staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._staff("Leader", "leader@example.test", ["leader"])
        case_id, _ = self._create_service_enabled_case(host)
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='leader_pending', kyc_valid_until=? WHERE id=?",
                (self.now + 120 * 86400, case_id),
            )
            conn.commit()
        resp = self.client.get(f"{API}/leader/admission-cases", headers=self._auth(leader["token"]))
        assert resp.status_code == 200
        rows = resp.json()["cases"]
        assert len(rows) == 1
        row = rows[0]
        assert row["hostNotes"] == "Business note from the Host — for the approver"
        assert row["kycValidUntil"] is not None
        assert row["kycStatus"] == "passed"
        dumped = json.dumps(row)
        for leaked in ("vip@example.test", "passport", "provider", "applicant", "kycReasonCode"):
            assert leaked not in dumped


class HostSettlementVisibilityTests(VisibilityTestCase):
    def test_host_case_view_aggregates_settlement_status(self):
        host = self._staff("Host A", "host-a@example.test", ["host"], host_status="active")
        ops = self._staff("Ops", "ops@example.test", ["ops"])
        case_id, patron_id = self._create_service_enabled_case(host)
        pack_id = self._build_main_pack(patron_id)
        # Ops: cage + reconcile
        assert self.client.post(
            f"{API}/transaction-compliance-packs/{pack_id}/cage-confirmation",
            json={"cageConfirmationId": "CAGE-V1"}, headers=self._auth(ops["token"]),
        ).status_code == 200
        assert self.client.post(
            f"{API}/transaction-compliance-packs/{pack_id}/reconcile",
            json={"reconciliationRef": "FIN-V1"}, headers=self._auth(ops["token"]),
        ).status_code == 200
        case = self._case_as_host(case_id, host)
        payments = case.get("payments") or []
        assert len(payments) == 1
        p = payments[0]
        assert p["transferLeg"] == "main"
        assert p["travelRuleDepth"] == "enhanced"
        assert p["kytStatus"] == "pass"
        assert p["travelRuleStatus"] == "accepted"
        assert p["txHash"] == "0x" + "ef" * 32
        assert p["cageConfirmationId"] == "CAGE-V1"
        assert p["reconciliationRef"] == "FIN-V1"
        assert p["reconciledAt"] is not None
        assert p["custodyAddress"]

    def test_vip_view_still_excludes_host_notes_and_leader_reason(self):
        host = self._staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._staff("Leader", "leader@example.test", ["leader"])
        case_id, patron_id = self._create_service_enabled_case(host)
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='leader_pending', kyc_valid_until=? WHERE id=?",
                (self.now + 120 * 86400, case_id),
            )
            conn.commit()
        self.client.post(
            f"{API}/admission-cases/{case_id}/leader-decision",
            json={"decision": "rejected", "reason": "Internal business reason"},
            headers=self._auth(leader["token"]),
        )
        token = server.create_session(patron_id)
        resp = self.client.get(f"{API}/admission-cases/{case_id}", headers=self._auth(token))
        assert resp.status_code == 200
        case = resp.json()["case"]
        dumped = json.dumps(case)
        assert case["hostNotes"] is None
        assert case["leaderReason"] is None
        for leaked in ("Business note from the Host", "Internal business reason"):
            assert leaked not in dumped


if __name__ == "__main__":
    unittest.main()
