"""API tests for operations, retention and reconciliation (Task 8).

Requirements under test:
  - Cage confirmation can only be recorded after the main transfer is confirmed;
  - a transaction cannot become settled until the main leg is confirmed, a Cage
    confirmation ID is saved, and Finance reconciliation is recorded;
  - reconciliation export rows carry the pack id, Cage confirmation ID,
    transaction references and retention until (>= 5 years);
  - legacy deposits keep the marker label/flow unchanged (marker still works);
  - a deterministic demo monitor flags linked transfers by patron/source/
    beneficiary/asset/time and routes them to Compliance (never silently
    changes a result).
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
    tmp = tempfile.mkdtemp(prefix="ht-payment-ops-")
    return Path(tmp) / "test.db"


class PaymentOperationsTestCase(unittest.TestCase):
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

    def _create_eligible_case(self, source: str = "T-source-1") -> dict:
        host_email = f"host-{uuid.uuid4().hex[:8]}@example.test"
        host = self._create_staff("Host A", host_email, ["host"], host_status="active")
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
                   SET status='service_enabled', kyc_valid_until=?, updated_at=? WHERE id=?""",
                (self.now + 120 * 86400, self.now, case_id),
            )
            conn.commit()
        return {"patronToken": token, "caseId": case_id, "patronId": patron_id}

    def _build_confirmed_main_pack(self, patron: dict, amount: str = "10000", source: str = "T-source-1") -> dict:
        resp = self.client.post(
            f"{API}/payment-intents",
            json={"asset": "USDT", "network": "tron", "intendedAmount": amount},
            headers=self._auth(patron["patronToken"]),
        )
        intent_id = resp.json()["intent"]["id"]
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/source-classification",
            json={"sourceType": "wallet", "sourceIdentifier": source, "jurisdiction": "HK"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/actual-confirmation",
            json={"asset": "USDT", "network": "tron", "actualAmount": amount,
                  "sourceType": "wallet", "sourceIdentifier": source},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/compliance-packs",
            json={"transferLeg": "main", "actualAmount": amount, "actualHkdAmount": "80000"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        pack_id = resp.json()["pack"]["id"]
        resp = self.client.post(
            f"{API}/transaction-compliance-packs/{pack_id}/screen",
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        resp = self.client.post(
            f"{API}/transaction-compliance-packs/{pack_id}/issue-address",
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        resp = self.client.post(
            f"{API}/transaction-compliance-packs/{pack_id}/record-transfer",
            json={"txHash": "0x" + "ab" * 32, "status": "confirmed"},
            headers=self._auth(patron["patronToken"]),
        )
        assert resp.status_code == 200, resp.text
        return pack_id

    def _cage(self, ops: dict, pack_id: str, cage_id: str = "CAGE-001"):
        return self.client.post(
            f"{API}/transaction-compliance-packs/{pack_id}/cage-confirmation",
            json={"cageConfirmationId": cage_id},
            headers=self._auth(ops["token"]),
        )

    def _reconcile(self, ops: dict, pack_id: str, ref: str = "FIN-REC-001"):
        return self.client.post(
            f"{API}/transaction-compliance-packs/{pack_id}/reconcile",
            json={"reconciliationRef": ref},
            headers=self._auth(ops["token"]),
        )

    def _export(self, ops: dict) -> list[dict]:
        resp = self.client.get(f"{API}/operations/reconciliation-export", headers=self._auth(ops["token"]))
        assert resp.status_code == 200, resp.text
        return resp.json()["rows"]


class CageConfirmationTests(PaymentOperationsTestCase):
    def test_ops_cannot_record_cage_confirmation_before_main_transfer_is_confirmed(self):
        ops = self._create_staff("Ops", "ops@example.test", ["ops"])
        patron = self._create_eligible_case()
        resp = self.client.post(
            f"{API}/payment-intents",
            json={"asset": "USDT", "network": "tron", "intendedAmount": "10000"},
            headers=self._auth(patron["patronToken"]),
        )
        intent_id = resp.json()["intent"]["id"]
        self.client.post(
            f"{API}/payment-intents/{intent_id}/source-classification",
            json={"sourceType": "wallet", "sourceIdentifier": "T-source-1", "jurisdiction": "HK"},
            headers=self._auth(patron["patronToken"]),
        )
        self.client.post(
            f"{API}/payment-intents/{intent_id}/actual-confirmation",
            json={"asset": "USDT", "network": "tron", "actualAmount": "10000",
                  "sourceType": "wallet", "sourceIdentifier": "T-source-1"},
            headers=self._auth(patron["patronToken"]),
        )
        resp = self.client.post(
            f"{API}/payment-intents/{intent_id}/compliance-packs",
            json={"transferLeg": "main", "actualAmount": "10000", "actualHkdAmount": "80000"},
            headers=self._auth(patron["patronToken"]),
        )
        pack_id = resp.json()["pack"]["id"]
        # 未确认主款 -> cage 409。
        assert self._cage(ops, pack_id, "CAGE-001").status_code == 409

    def test_cage_confirmation_requires_ops_role(self):
        patron = self._create_eligible_case()
        pack_id = self._build_confirmed_main_pack(patron)
        rm = self._create_staff("RM", "rm@example.test", ["rm"])
        resp = self._cage(rm, pack_id, "CAGE-001")
        assert resp.status_code == 403

    def test_cage_confirmation_after_main_confirmed(self):
        ops = self._create_staff("Ops", "ops@example.test", ["ops"])
        patron = self._create_eligible_case()
        pack_id = self._build_confirmed_main_pack(patron)
        resp = self._cage(ops, pack_id, "CAGE-001")
        assert resp.status_code == 200, resp.text
        assert resp.json()["pack"]["cageConfirmationId"] == "CAGE-001"


class ReconciliationTests(PaymentOperationsTestCase):
    def test_reconciliation_row_contains_transaction_and_cage_references(self):
        ops = self._create_staff("Ops", "ops@example.test", ["ops"])
        patron = self._create_eligible_case()
        pack_id = self._build_confirmed_main_pack(patron)
        assert self._cage(ops, pack_id, "CAGE-001").status_code == 200
        assert self._reconcile(ops, pack_id, "FIN-REC-001").status_code == 200
        rows = self._export(ops)
        assert len(rows) == 1
        row = rows[0]
        assert row["transactionCompliancePackId"] == pack_id
        assert row["cageConfirmationId"] == "CAGE-001"
        assert row["reconciliationRef"] == "FIN-REC-001"
        assert row["reconciledAt"] is not None
        assert row["retentionUntil"] >= self.now + 5 * 365 * 86400

    def test_reconciliation_requires_cage_confirmation_first(self):
        ops = self._create_staff("Ops", "ops@example.test", ["ops"])
        patron = self._create_eligible_case()
        pack_id = self._build_confirmed_main_pack(patron)
        resp = self._reconcile(ops, pack_id, "FIN-REC-001")
        assert resp.status_code == 409

    def test_payment_cases_view_lists_operations_safe_data(self):
        ops = self._create_staff("Ops", "ops@example.test", ["ops"])
        patron = self._create_eligible_case()
        self._build_confirmed_main_pack(patron)
        resp = self.client.get(f"{API}/operations/payment-cases", headers=self._auth(ops["token"]))
        assert resp.status_code == 200, resp.text
        cases = resp.json()["cases"]
        assert len(cases) == 1
        dumped = json.dumps(cases)
        assert "vip@example.test" not in dumped  # 不泄露完整邮箱
        assert cases[0]["transferLeg"] == "main"


class MonitoringTests(PaymentOperationsTestCase):
    def test_linked_transfers_are_flagged_for_compliance(self):
        compliance = self._create_staff("Compliance", "comp@example.test", ["compliance"])
        patron = self._create_eligible_case(source="T-shared-source")
        self._build_confirmed_main_pack(patron, amount="10000", source="T-shared-source")
        # 第二笔同一来源 + 同一资产 -> linked cluster。
        patron2 = self._create_eligible_case(source="T-shared-source")
        self._build_confirmed_main_pack(patron2, amount="5000", source="T-shared-source")
        resp = self.client.post(f"{API}/operations/run-monitoring", headers=self._auth(compliance["token"]))
        assert resp.status_code == 200, resp.text
        assert resp.json()["flagged"] >= 1
        resp = self.client.get(f"{API}/operations/monitoring-flags", headers=self._auth(compliance["token"]))
        assert resp.status_code == 200
        flags = resp.json()["flags"]
        assert any(f["flagType"] == "linked_transfer_cluster" for f in flags)


class LegacyMarkerTests(PaymentOperationsTestCase):
    def test_legacy_deposit_marker_flow_is_preserved(self):
        # 旧 deposit_requests 的 marker 流程不受影响(marker 标签只用于 legacy 记录)。
        ops = self._create_staff("Ops", "ops@example.test", ["ops"])
        with server.db() as conn:
            conn.execute(
                """INSERT INTO deposit_requests(
                       id, user_id, asset, network, chain_id, amount_decimal,
                       source_wallet, screening_status, travel_rule_status,
                       verify_status, status, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("DR-LEGACY-1", "u-legacy", "USDT", "tron", "tron:nile", "5000",
                 "T-legacy", "pass", "travel_rule_accepted", "confirmed", "verified",
                 self.now, self.now),
            )
            conn.commit()
        resp = self.client.post(
            f"{API}/deposits/DR-LEGACY-1/marker",
            json={"markerRef": "MK-LEGACY-001"},
            headers=self._auth(ops["token"]),
        )
        assert resp.status_code == 200, resp.text
        with server.db() as conn:
            row = conn.execute(
                "SELECT marker_ref, status FROM deposit_requests WHERE id='DR-LEGACY-1'"
            ).fetchone()
        assert row["marker_ref"] == "MK-LEGACY-001"


if __name__ == "__main__":
    unittest.main()
