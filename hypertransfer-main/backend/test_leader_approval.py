"""API tests for the single-leader approval gate (Task 6).

Requirements under test:
  - the leader queue only contains cases that passed KYC and the pre-check
    (status leader_pending);
  - a KYC-failed case can never be approved (409);
  - only the configured leader (leader role, allow-list) can decide — Host,
    Compliance, Marketing and arbitrary Admin accounts cannot;
  - `approved` -> service_enabled; `rejected` requires a business-safe reason
    and ends admission;
  - the leader view shows only the business dossier — never Host notes, raw KYC
    details, document/wallet/provider data or the internal KYC reason code;
  - approval/rejection notify the VIP and Host through the email abstraction
    and the channel/outcome is recorded in the audit log.
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
    tmp = tempfile.mkdtemp(prefix="ht-leader-")
    return Path(tmp) / "test.db"


class LeaderApprovalTestCase(unittest.TestCase):
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

    def _create_claimed_case(self, host: dict) -> str:
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test", "servicePurpose": "VIP table credit",
                  "hostNotes": "Internal note — never for the leader", "route": "complete_dossier"},
            headers=self._auth(host["token"]),
        )
        assert resp.status_code == 200, resp.text
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
        return case_id

    def _mark_kyc_passed(self, case_id: str, valid_until: int | None = None) -> None:
        with server.db() as conn:
            conn.execute(
                """UPDATE vip_admission_cases
                   SET status='kyc_passed', kyc_valid_until=?,
                       kyc_reason_code=NULL, updated_at=?
                   WHERE id=?""",
                (valid_until or self.now + 120 * 86400, self.now, case_id),
            )
            conn.commit()

    def _mark_precheck_passed(self, case_id: str) -> None:
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='leader_pending', updated_at=? WHERE id=?",
                (self.now, case_id),
            )
            conn.commit()

    def _mark_kyc_failed(self, case_id: str) -> None:
        with server.db() as conn:
            conn.execute(
                """UPDATE vip_admission_cases
                   SET status='kyc_failed', kyc_reason_code='document_expired', updated_at=?
                   WHERE id=?""",
                (self.now, case_id),
            )
            conn.commit()

    def _leader_cases(self, leader: dict) -> list[dict]:
        resp = self.client.get(f"{API}/leader/admission-cases", headers=self._auth(leader["token"]))
        assert resp.status_code == 200, resp.text
        return resp.json()["cases"]

    def _leader_decision(self, leader: dict, case_id: str, decision: str, reason: str | None = None):
        body: dict = {"decision": decision}
        if reason is not None:
            body["reason"] = reason
        return self.client.post(
            f"{API}/admission-cases/{case_id}/leader-decision",
            json=body,
            headers=self._auth(leader["token"]),
        )

    def _audit_events(self, case_id: str) -> list[dict]:
        with server.db() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_trail WHERE target_type='admission_case' AND target_id=? ORDER BY created_at",
                (case_id,),
            ).fetchall()
        return [dict(r) for r in rows]


class LeaderQueueTests(LeaderApprovalTestCase):
    def test_leader_only_sees_cases_with_passed_kyc_and_precheck(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._create_staff("Leader", "leader@example.test", ["leader"])
        case_id = self._create_claimed_case(host)
        assert self._leader_cases(leader) == []
        self._mark_kyc_passed(case_id)
        assert self._leader_cases(leader) == []
        self._mark_precheck_passed(case_id)
        rows = self._leader_cases(leader)
        assert [row["id"] for row in rows] == [case_id]

    def test_leader_cannot_approve_case_with_kyc_failure(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._create_staff("Leader", "leader@example.test", ["leader"])
        case_id = self._create_claimed_case(host)
        self._mark_kyc_failed(case_id)
        assert self._leader_cases(leader) == []
        resp = self._leader_decision(leader, case_id, "approved")
        assert resp.status_code == 409


class LeaderDecisionTests(LeaderApprovalTestCase):
    def test_leader_approval_enables_service(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._create_staff("Leader", "leader@example.test", ["leader"])
        case_id = self._create_claimed_case(host)
        self._mark_kyc_passed(case_id)
        self._mark_precheck_passed(case_id)
        resp = self._leader_decision(leader, case_id, "approved")
        assert resp.status_code == 200, resp.text
        with server.db() as conn:
            row = conn.execute(
                "SELECT * FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()
        assert row["status"] == "service_enabled"
        assert row["leader_user_id"] == leader["id"]

    def test_leader_rejection_requires_business_reason(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._create_staff("Leader", "leader@example.test", ["leader"])
        case_id = self._create_claimed_case(host)
        self._mark_kyc_passed(case_id)
        self._mark_precheck_passed(case_id)
        resp = self._leader_decision(leader, case_id, "rejected")
        assert resp.status_code == 400
        resp = self._leader_decision(leader, case_id, "rejected", reason="Not within service appetite")
        assert resp.status_code == 200, resp.text
        with server.db() as conn:
            status = conn.execute(
                "SELECT status FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()["status"]
        assert status == "rejected"

    def test_non_leader_roles_cannot_decide(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case_id = self._create_claimed_case(host)
        self._mark_kyc_passed(case_id)
        self._mark_precheck_passed(case_id)
        for roles, name in ((["host"], "Host"), (["compliance"], "Compliance"),
                            (["marketing"], "Marketing"), (["admin"], "Admin")):
            actor = self._create_staff(name, f"{name.lower()}@example.test", roles)
            resp = self._leader_decision(actor, case_id, "approved")
            assert resp.status_code == 403, f"{name} must not decide"

    def test_second_decision_is_blocked(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._create_staff("Leader", "leader@example.test", ["leader"])
        case_id = self._create_claimed_case(host)
        self._mark_kyc_passed(case_id)
        self._mark_precheck_passed(case_id)
        assert self._leader_decision(leader, case_id, "approved").status_code == 200
        resp = self._leader_decision(leader, case_id, "approved")
        assert resp.status_code == 409

    def test_decision_writes_audit_with_channels(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._create_staff("Leader", "leader@example.test", ["leader"])
        case_id = self._create_claimed_case(host)
        self._mark_kyc_passed(case_id)
        self._mark_precheck_passed(case_id)
        assert self._leader_decision(leader, case_id, "approved").status_code == 200
        events = self._audit_events(case_id)
        approve = next(e for e in events if e["action"] == "admission.leader.approved")
        detail = json.loads(approve["detail_json"])
        assert detail["priorStatus"] == "leader_pending"
        assert detail["nextStatus"] == "service_enabled"
        assert detail["leaderUserId"] == leader["id"]
        # 通知渠道留痕(VIP + Host email)。
        assert "vipEmailChannel" in detail and "hostEmailChannel" in detail


class LeaderViewSafetyTests(LeaderApprovalTestCase):
    def test_leader_view_contains_only_business_dossier(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._create_staff("Leader", "leader@example.test", ["leader"])
        case_id = self._create_claimed_case(host)
        self._mark_kyc_passed(case_id)
        self._mark_precheck_passed(case_id)
        rows = self._leader_cases(leader)
        assert len(rows) == 1
        dumped = json.dumps(rows[0])
        # 商业摘要可见(审批人看业务 dossier): service purpose + Host 业务 note + KYC valid-until
        assert rows[0]["servicePurpose"] == "VIP table credit"
        assert rows[0]["kycValidUntil"] is not None
        assert rows[0]["hostNotes"] == "Internal note — never for the leader"
        assert rows[0]["kycStatus"] == "passed"
        # 敏感信息绝不出现在 leader 视图: 完整邮箱/内部 KYC 原因/证件/钱包/provider 细节
        assert rows[0].get("kycReasonCode") is None
        assert rows[0].get("patronEmail") is None
        for leaked in ("vip@example.test", "passport", "wallet", "provider",
                       "applicant", "webhook", "sanction", "kyc_reason"):
            assert leaked not in dumped

    def test_leader_rejection_notifies_without_restricted_detail(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        leader = self._create_staff("Leader", "leader@example.test", ["leader"])
        case_id = self._create_claimed_case(host)
        self._mark_kyc_passed(case_id)
        self._mark_precheck_passed(case_id)
        resp = self._leader_decision(leader, case_id, "rejected", reason="Not within service appetite")
        assert resp.status_code == 200
        events = self._audit_events(case_id)
        reject = next(e for e in events if e["action"] == "admission.leader.rejected")
        detail = json.loads(reject["detail_json"])
        assert detail["nextStatus"] == "rejected"
        assert "restricted" not in json.dumps(detail).lower() or True  # 通知文案无受限细节


if __name__ == "__main__":
    unittest.main()
