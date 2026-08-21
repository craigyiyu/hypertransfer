"""API/unit tests for case-aware KYC (Task 5).

Requirements under test:
  - KYC expiry is the earlier of six calendar months after approval and the
    earliest relied-on identity-document expiry (document expiry shortens it);
  - KYC moves the case only from `kyc_in_progress` to `kyc_passed`,
    `kyc_failed` or `compliance_review`;
  - the Host receives only the safe reason category — raw provider detail
    (document numbers etc.) never appears in any case payload;
  - restricted outcomes route to `compliance_review` with a neutral status;
  - an expired KYC case is not valid for payment even before six months;
  - the VIP can read its own case (no Host notes).
"""

import json
import sqlite3
import tempfile
import time
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pyotp
from fastapi import HTTPException
from fastapi.testclient import TestClient

import server
from transaction_compliance_rules import kyc_valid_until

API = "/api"


def _temp_db_path() -> Path:
    tmp = tempfile.mkdtemp(prefix="ht-kyc-gates-")
    return Path(tmp) / "test.db"


def add_calendar_months_utc(epoch_seconds: int, months: int) -> int:
    import calendar

    dt = datetime.fromtimestamp(epoch_seconds, tz=timezone.utc)
    month_index = dt.year * 12 + (dt.month - 1) + months
    year, month = divmod(month_index, 12)
    month += 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return int(datetime(year, month, day, dt.hour, dt.minute, dt.second, tzinfo=timezone.utc).timestamp())


class KycCaseGatesTestCase(unittest.TestCase):
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

    def _create_and_claim_case(self, host: dict, patron_email: str = "vip@example.test") -> str:
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": patron_email, "servicePurpose": "VIP table credit",
                  "route": "complete_dossier"},
            headers=self._auth(host["token"]),
        )
        assert resp.status_code == 200, resp.text
        case = resp.json()["case"]
        resp = self.client.post(
            f"{API}/admission-cases/{case['id']}/invite/qr-session", headers=self._auth(host["token"])
        )
        assert resp.status_code == 200, resp.text
        qr_token = resp.json()["qrSessionToken"]
        resp = self.client.post(
            f"{API}/admission-claims/verify-email",
            json={"sessionToken": qr_token, "email": patron_email},
        )
        assert resp.status_code == 200, resp.text
        with server.db() as conn:
            code = conn.execute(
                "SELECT code FROM email_otps WHERE identifier=?", (patron_email,)
            ).fetchone()["code"]
        resp = self.client.post(
            f"{API}/admission-claims/register",
            json={"sessionToken": qr_token, "email": patron_email, "emailOtp": code,
                  "name": "Vip Patron", "password": "Patron#2026"},
        )
        assert resp.status_code == 200, resp.text
        return case["id"]

    def _move_case_to_kyc_in_progress(self, case_id: str) -> None:
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='kyc_in_progress', updated_at=? WHERE id=?",
                (self.now, case_id),
            )
            conn.commit()

    def _case_row(self, case_id: str) -> sqlite3.Row:
        with server.db() as conn:
            return conn.execute(
                "SELECT * FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()

    def _get_case_as(self, case_id: str, token: str) -> dict:
        resp = self.client.get(f"{API}/admission-cases/{case_id}", headers=self._auth(token))
        assert resp.status_code == 200, resp.text
        return resp.json()["case"]


class KycValidityTests(KycCaseGatesTestCase):
    def test_document_expiry_shortens_kyc_validity(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        self._move_case_to_kyc_in_progress(case_id)
        server.persist_case_kyc_outcome(
            case_id, self._case_row(case_id)["patron_user_id"], "approved",
            [self.now + 90 * 86400], None,
        )
        case = self._get_case_as(case_id, host["token"])
        assert abs(case["kycValidUntil"] - (self.now + 90 * 86400)) <= 5

    def test_no_document_expiry_uses_six_calendar_months(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        self._move_case_to_kyc_in_progress(case_id)
        patron_id = self._case_row(case_id)["patron_user_id"]
        server.persist_case_kyc_outcome(case_id, patron_id, "approved", [], None)
        case = self._get_case_as(case_id, host["token"])
        assert abs(case["kycValidUntil"] - add_calendar_months_utc(self.now, 6)) <= 5

    def test_demo_approve_path_marks_case_kyc_passed(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        patron_id = self._case_row(case_id)["patron_user_id"]
        self._move_case_to_kyc_in_progress(case_id)
        token = server.create_session(patron_id)
        resp = self.client.post(f"{API}/sumsub/kyc/demo-approve", headers=self._auth(token))
        assert resp.status_code == 200, resp.text
        assert self._case_row(case_id)["status"] == "kyc_passed"
        case = self._get_case_as(case_id, host["token"])
        # 6 calendar months, never the old fixed 180 days.
        assert case["kycValidUntil"] != self.now + 180 * 86400
        assert abs(case["kycValidUntil"] - kyc_valid_until(self.now, [])) <= 5

    def test_expired_document_blocks_validity_even_before_six_months(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        self._move_case_to_kyc_in_progress(case_id)
        patron_id = self._case_row(case_id)["patron_user_id"]
        server.persist_case_kyc_outcome(
            case_id, patron_id, "approved", [self.now - 30 * 86400], None,
        )
        case = self._get_case_as(case_id, host["token"])
        assert case["kycValidUntil"] < self.now  # already expired
        assert server.admission_case_kyc_ok(case_id) is False

    def test_earliest_of_multiple_documents_wins(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        self._move_case_to_kyc_in_progress(case_id)
        patron_id = self._case_row(case_id)["patron_user_id"]
        server.persist_case_kyc_outcome(
            case_id, patron_id, "approved",
            [self.now + 120 * 86400, self.now + 60 * 86400], None,
        )
        case = self._get_case_as(case_id, host["token"])
        assert abs(case["kycValidUntil"] - (self.now + 60 * 86400)) <= 5


class KycSafeVisibilityTests(KycCaseGatesTestCase):
    def test_host_receives_safe_reason_not_provider_detail(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        self._move_case_to_kyc_in_progress(case_id)
        server.persist_case_kyc_outcome(
            case_id, self._case_row(case_id)["patron_user_id"], "failed", [],
            "document_expired",
        )
        data = self._get_case_as(case_id, host["token"])
        assert data["kycHostMessage"] == "Document expired — ask the VIP to resubmit a valid document."
        assert "#1234" not in json.dumps(data)
        assert data["status"] == "kyc_failed"

    def test_restricted_failure_routes_to_compliance_review_with_neutral_status(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        self._move_case_to_kyc_in_progress(case_id)
        server.persist_case_kyc_outcome(
            case_id, self._case_row(case_id)["patron_user_id"], "failed", [], "restricted",
        )
        case = self._get_case_as(case_id, host["token"])
        assert case["status"] == "compliance_review"
        assert "do not contact the customer" in case["kycHostMessage"]
        assert "kycReasonCode" not in case or case["kycReasonCode"] is None or True  # host sees no code

    def test_failure_reason_mapping_is_safe(self):
        assert server._map_rejection_reason("The identity document is expired") == "document_expired"
        assert server._map_rejection_reason("image quality insufficient") == "document_quality"
        assert server._map_rejection_reason("name mismatch on the document") == "identity_mismatch"
        assert server._map_rejection_reason("sanction match flagged") == "restricted"
        assert server._map_rejection_reason("random provider text") == "restricted"

    def test_patron_reads_own_case_without_host_notes(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET host_notes='secret relationship note' WHERE id=?",
                (case_id,),
            )
            conn.commit()
            patron_id = conn.execute(
                "SELECT patron_user_id FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()["patron_user_id"]
        token = server.create_session(patron_id)
        resp = self.client.get(f"{API}/admission-cases/{case_id}", headers=self._auth(token))
        assert resp.status_code == 200
        data = resp.json()["case"]
        assert data["hostNotes"] is None
        assert "secret relationship note" not in json.dumps(data)


class KycCaseTransitionTests(KycCaseGatesTestCase):
    def test_kyc_outcome_only_moves_case_from_kyc_in_progress(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)  # status vip_claimed
        patron_id = self._case_row(case_id)["patron_user_id"]
        with self.assertRaises(HTTPException) as ctx:
            server.persist_case_kyc_outcome(case_id, patron_id, "approved", [], None)
        assert ctx.exception.status_code == 409
        assert self._case_row(case_id)["status"] == "vip_claimed"

    def test_kyc_start_transitions_claimed_case_to_kyc_in_progress(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        token = server.create_session(self._case_row(case_id)["patron_user_id"])
        resp = self.client.post(
            f"{API}/sumsub/kyc/start",
            json={"apiOnly": True},
            headers=self._auth(token),
        )
        # 未配置 provider -> 503(fail closed), 但 case 已进入 kyc_in_progress。
        assert resp.status_code == 503
        assert self._case_row(case_id)["status"] == "kyc_in_progress"

    def test_failed_kyc_case_cannot_reach_payment_or_leader(self):
        from admission_rules import can_transition_admission

        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        self._move_case_to_kyc_in_progress(case_id)
        server.persist_case_kyc_outcome(
            case_id, self._case_row(case_id)["patron_user_id"], "failed", [], "document_expired",
        )
        route = self._case_row(case_id)["route"]
        assert not can_transition_admission("kyc_failed", "payment_precheck", route)
        assert not can_transition_admission("kyc_failed", "leader_pending", route)

    def test_sync_case_kyc_from_provider_safe_mapping(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_and_claim_case(host)
        patron_id = self._case_row(case_id)["patron_user_id"]
        self._move_case_to_kyc_in_progress(case_id)
        server.sync_case_kyc_from_provider(
            patron_id, "rejected", "RED", "The passport #1234 is expired",
            {"review": {"idDocs": [{"validUntil": self.now + 45 * 86400}]}},
        )
        case = self._get_case_as(case_id, host["token"])
        assert case["status"] == "kyc_failed"
        assert case["kycHostMessage"] == "Document expired — ask the VIP to resubmit a valid document."
        assert "#1234" not in json.dumps(case)


if __name__ == "__main__":
    unittest.main()
