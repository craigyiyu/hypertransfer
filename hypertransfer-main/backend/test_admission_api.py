"""API tests for Host provisioning and VIP admission-case endpoints (Task 3).

Requirements under test:
  - only an `active` Host may create (or revoke) a VIP admission case;
  - a Host can only ever read/revoke its own cases (cross-Host reads are 404,
    never disclosed);
  - `host` and `leader` are staff roles alongside the existing legacy roles;
  - every create / update / revoke / transition writes an audit event with case
    id, actor, prior status, next status and a safe detail payload;
  - Host notes are returned only to the case-owner Host, Compliance and Admin —
    never to other roles (and never to the VIP / leader later).
"""

import json
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
    tmp = tempfile.mkdtemp(prefix="ht-admission-api-")
    return Path(tmp) / "test.db"


class AdmissionApiTestCase(unittest.TestCase):
    """Shared harness: fresh DB + seeded staff/host users per test."""

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
    # fixtures
    # ------------------------------------------------------------------ #
    def _create_staff(
        self,
        name: str,
        email: str,
        roles: list[str],
        host_status: str | None = None,
    ) -> dict:
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
                conn.execute(
                    "INSERT INTO user_roles(user_id, role) VALUES (?,?)", (uid, role)
                )
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

    def _create_case(self, host: dict, **overrides) -> dict:
        payload = {
            "patronEmail": "vip@example.test",
            "memberReference": "M-VIP-001",
            "servicePurpose": "VIP table credit",
            "hostNotes": "Internal relationship note — not for the VIP.",
            "preferredLanguage": "zh-Hant",
            "route": "complete_dossier",
            **overrides,
        }
        resp = self.client.post(
            f"{API}/admission-cases", json=payload, headers=self._auth(host["token"])
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["case"]

    def _case_row(self, case_id: str) -> sqlite3.Row:
        with server.db() as conn:
            return conn.execute(
                "SELECT * FROM vip_admission_cases WHERE id=?", (case_id,)
            ).fetchone()

    def _audit_events(self, case_id: str) -> list[sqlite3.Row]:
        with server.db() as conn:
            return conn.execute(
                "SELECT * FROM audit_trail WHERE target_type='admission_case' AND target_id=? ORDER BY created_at",
                (case_id,),
            ).fetchall()


class HostProfileTests(AdmissionApiTestCase):
    def test_host_activate_and_get_profile(self):
        host = self._create_staff("Host One", "host1@example.test", ["host"])
        resp = self.client.get(f"{API}/host/profile", headers=self._auth(host["token"]))
        assert resp.status_code == 404  # no profile yet

        body = {
            "employeeId": "EMP-H1",
            "department": "VIP Services",
            "operatingTeam": "Macau Table Games",
            "location": "Macau Peninsula",
            "phone": "+853 1111 2222",
            "acknowledged": True,
        }
        resp = self.client.post(
            f"{API}/host/profile/activate", json=body, headers=self._auth(host["token"])
        )
        assert resp.status_code == 200, resp.text
        profile = resp.json()["profile"]
        assert profile["status"] == "active"
        assert profile["employeeId"] == "EMP-H1"

        resp = self.client.get(f"{API}/host/profile", headers=self._auth(host["token"]))
        assert resp.status_code == 200
        assert resp.json()["profile"]["status"] == "active"

    def test_activate_without_acknowledgement_stays_pending(self):
        host = self._create_staff("Host Two", "host2@example.test", ["host"])
        body = {
            "operatingTeam": "Macau Table Games",
            "location": "Macau Peninsula",
            "acknowledged": False,
        }
        resp = self.client.post(
            f"{API}/host/profile/activate", json=body, headers=self._auth(host["token"])
        )
        assert resp.status_code == 200
        assert resp.json()["profile"]["status"] == "pending"

    def test_non_host_cannot_activate_profile(self):
        marketing = self._create_staff("Mkt", "mkt@example.test", ["marketing"])
        resp = self.client.post(
            f"{API}/host/profile/activate",
            json={"acknowledged": True},
            headers=self._auth(marketing["token"]),
        )
        assert resp.status_code == 403

    def test_host_profile_requires_staff_session(self):
        resp = self.client.get(f"{API}/host/profile")
        assert resp.status_code == 401


class AdmissionCaseCreateTests(AdmissionApiTestCase):
    def test_only_active_host_can_create_case(self):
        active = self._create_staff("Active Host", "active@example.test", ["host"], host_status="active")
        inactive = self._create_staff("Inactive Host", "inactive@example.test", ["host"], host_status="pending")
        payload = {
            "patronEmail": "vip@example.test",
            "firstName": "Chen",
            "lastName": "Wei",
            "servicePurpose": "VIP table credit",
            "route": "complete_dossier",
        }
        resp = self.client.post(f"{API}/admission-cases", json=payload, headers=self._auth(active["token"]))
        assert resp.status_code == 200, resp.text
        case = resp.json()["case"]
        assert case["firstName"] == "Chen"
        assert case["lastName"] == "Wei"
        assert case["patronName"] == "Chen Wei"
        row = self._case_row(case["id"])
        assert row["first_name"] == "Chen"
        assert row["last_name"] == "Wei"
        resp = self.client.post(f"{API}/admission-cases", json=payload, headers=self._auth(inactive["token"]))
        assert resp.status_code == 403

    def test_disabled_host_cannot_create_case(self):
        disabled = self._create_staff("Disabled Host", "disabled@example.test", ["host"], host_status="disabled")
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test"},
            headers=self._auth(disabled["token"]),
        )
        assert resp.status_code == 403

    def test_non_host_staff_cannot_create_case(self):
        marketing = self._create_staff("Mkt", "mkt@example.test", ["marketing"])
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test"},
            headers=self._auth(marketing["token"]),
        )
        assert resp.status_code == 403

    def test_admin_cannot_impersonate_host(self):
        admin = self._create_staff("Admin", "admin@example.test", ["admin"])
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test"},
            headers=self._auth(admin["token"]),
        )
        assert resp.status_code == 403

    def test_leader_cannot_create_case(self):
        leader = self._create_staff("Leader", "leader@example.test", ["leader"])
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test"},
            headers=self._auth(leader["token"]),
        )
        assert resp.status_code == 403

    def test_invalid_route_rejected(self):
        active = self._create_staff("Active Host", "active@example.test", ["host"], host_status="active")
        resp = self.client.post(
            f"{API}/admission-cases",
            json={"patronEmail": "vip@example.test", "route": "not-a-route"},
            headers=self._auth(active["token"]),
        )
        assert resp.status_code == 400

    def test_missing_patron_email_rejected(self):
        active = self._create_staff("Active Host", "active@example.test", ["host"], host_status="active")
        resp = self.client.post(
            f"{API}/admission-cases", json={}, headers=self._auth(active["token"])
        )
        assert resp.status_code == 422

    def test_remind_sends_email_and_audits_without_status_change(self):
        host = self._create_staff("Active Host", "active@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        prior_status = case["status"]
        resp = self.client.post(
            f"{API}/admission-cases/{case['id']}/remind", headers=self._auth(host["token"])
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["ok"] is True
        # status unchanged (remind never mutates state)
        row = self._case_row(case["id"])
        assert row["status"] == prior_status
        events = self._audit_events(case["id"])
        assert any(ev["action"] == "admission.remind.email" for ev in events)


class AdmissionKycExpiryTests(AdmissionApiTestCase):
    """A KYC validity boundary must be enforced when a case is read or used."""

    def _post_kyc_case(self, host: dict, *, valid_until: int) -> dict:
        case = self._create_case(host)
        with server.db() as conn:
            conn.execute(
                """UPDATE vip_admission_cases
                   SET status='leader_pending', kyc_valid_until=?,
                       kyc_approved_at=?, updated_at=? WHERE id=?""",
                (valid_until, self.now - 60, self.now, case["id"]),
            )
            conn.commit()
        return case

    def test_expired_kyc_is_persisted_as_resubmission_required_on_host_read(self):
        host = self._create_staff("Active Host", "active@example.test", ["host"], host_status="active")
        case = self._post_kyc_case(host, valid_until=self.now - 1)

        response = self.client.get(f"{API}/admission-cases/mine", headers=self._auth(host["token"]))

        assert response.status_code == 200, response.text
        got = next(item for item in response.json()["cases"] if item["id"] == case["id"])
        assert got["status"] == "kyc_expired"
        assert got["kycExpiredAt"] is not None
        assert got["kycApprovedAt"] == self.now - 60

    def test_kyc_expiry_reminder_requests_valid_document_resubmission(self):
        host = self._create_staff("Active Host", "active@example.test", ["host"], host_status="active")
        case = self._post_kyc_case(host, valid_until=self.now - 1)
        self.client.get(f"{API}/admission-cases/mine", headers=self._auth(host["token"]))
        sent: list[str] = []
        original_send_email = server.send_email
        server.send_email = lambda _to, _subject, text, _html=None: sent.append(text) or "console"
        try:
            response = self.client.post(
                f"{API}/admission-cases/{case['id']}/remind", headers=self._auth(host["token"])
            )
        finally:
            server.send_email = original_send_email

        assert response.status_code == 200, response.text
        assert "valid documentation" in sent[0].lower()

    def test_unexpired_kyc_keeps_its_current_admission_state(self):
        host = self._create_staff("Active Host", "active@example.test", ["host"], host_status="active")
        case = self._post_kyc_case(host, valid_until=self.now + 3600)

        response = self.client.get(f"{API}/admission-cases/mine", headers=self._auth(host["token"]))

        assert response.status_code == 200, response.text
        got = next(item for item in response.json()["cases"] if item["id"] == case["id"])
        assert got["status"] == "leader_pending"

    def test_remind_rejected_for_terminal_case(self):
        host = self._create_staff("Active Host", "active@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        # force a terminal status directly in DB
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='revoked' WHERE id=?", (case["id"],)
            )
            conn.commit()
        resp = self.client.post(
            f"{API}/admission-cases/{case['id']}/remind", headers=self._auth(host["token"])
        )
        assert resp.status_code == 409

    def test_create_case_writes_audit_event(self):
        host = self._create_staff("Active Host", "active@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        events = self._audit_events(case["id"])
        assert len(events) == 1
        ev = events[0]
        assert ev["action"] == "admission.case.create"
        assert ev["actor_user_id"] == host["id"]
        detail = json.loads(ev["detail_json"])
        assert detail["caseId"] == case["id"]
        assert detail["priorStatus"] is None
        assert detail["nextStatus"] == "draft"


class AdmissionCaseReadTests(AdmissionApiTestCase):
    def test_owner_host_reads_own_case_with_notes(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host, hostNotes="Secret relationship note")
        resp = self.client.get(f"{API}/admission-cases/{case['id']}", headers=self._auth(host["token"]))
        assert resp.status_code == 200
        data = resp.json()["case"]
        assert data["hostNotes"] == "Secret relationship note"
        assert data["patronEmail"] == "vip@example.test"
        assert data["status"] == "draft"
        assert data["hostName"] == "Host A"

    def test_host_cannot_read_another_hosts_case(self):
        host_a = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        host_b = self._create_staff("Host B", "host-b@example.test", ["host"], host_status="active")
        case_b = self._create_case(host_b, patronEmail="other@example.test")
        resp = self.client.get(f"{API}/admission-cases/{case_b['id']}", headers=self._auth(host_a["token"]))
        assert resp.status_code == 404
        # And the response never leaks the existence of the other Host's case.
        assert "other@example.test" not in resp.text

    def test_compliance_can_view_for_audit(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        compliance = self._create_staff("Compliance", "comp@example.test", ["compliance"])
        case = self._create_case(host, hostNotes="Internal note")
        resp = self.client.get(f"{API}/admission-cases/{case['id']}", headers=self._auth(compliance["token"]))
        assert resp.status_code == 200
        assert resp.json()["case"]["hostNotes"] == "Internal note"

    def test_admin_can_view_for_support(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        admin = self._create_staff("Admin", "admin@example.test", ["admin"])
        case = self._create_case(host)
        resp = self.client.get(f"{API}/admission-cases/{case['id']}", headers=self._auth(admin["token"]))
        assert resp.status_code == 200

    def test_unrelated_staff_cannot_view_case(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        ops = self._create_staff("Ops", "ops@example.test", ["ops"])
        case = self._create_case(host)
        resp = self.client.get(f"{API}/admission-cases/{case['id']}", headers=self._auth(ops["token"]))
        assert resp.status_code == 404

    def test_mine_lists_only_own_cases(self):
        host_a = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        host_b = self._create_staff("Host B", "host-b@example.test", ["host"], host_status="active")
        case_a1 = self._create_case(host_a, patronEmail="a1@example.test")
        case_a2 = self._create_case(host_a, patronEmail="a2@example.test")
        self._create_case(host_b, patronEmail="b1@example.test")
        resp = self.client.get(f"{API}/admission-cases/mine", headers=self._auth(host_a["token"]))
        assert resp.status_code == 200
        ids = [row["id"] for row in resp.json()["cases"]]
        assert set(ids) == {case_a1["id"], case_a2["id"]}

    def test_case_not_found(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        resp = self.client.get(f"{API}/admission-cases/nope", headers=self._auth(host["token"]))
        assert resp.status_code == 404


class AdmissionCaseRevokeTests(AdmissionApiTestCase):
    def test_owner_host_revokes_open_case(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        resp = self.client.post(
            f"{API}/admission-cases/{case['id']}/revoke", headers=self._auth(host["token"])
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["case"]["status"] == "revoked"
        events = self._audit_events(case["id"])
        assert any(ev["action"] == "admission.case.revoke" for ev in events)
        revoke = next(ev for ev in events if ev["action"] == "admission.case.revoke")
        detail = json.loads(revoke["detail_json"])
        assert detail["priorStatus"] == "draft"
        assert detail["nextStatus"] == "revoked"

    def test_non_owner_host_cannot_revoke(self):
        host_a = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        host_b = self._create_staff("Host B", "host-b@example.test", ["host"], host_status="active")
        case = self._create_case(host_b)
        resp = self.client.post(
            f"{API}/admission-cases/{case['id']}/revoke", headers=self._auth(host_a["token"])
        )
        assert resp.status_code == 404

    def test_owner_can_revoke_service_enabled_case(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='service_enabled', updated_at=? WHERE id=?",
                (self.now, case["id"]),
            )
            conn.commit()
        resp = self.client.post(
            f"{API}/admission-cases/{case['id']}/revoke", headers=self._auth(host["token"])
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["case"]["status"] == "revoked"

    def test_owner_can_revoke_and_reenable_a_pending_approval_case(self):
        host = self._create_staff("Host A", "host-a@example.test", ["host"], host_status="active")
        case = self._create_case(host)
        with server.db() as conn:
            conn.execute(
                "UPDATE vip_admission_cases SET status='leader_pending', updated_at=? WHERE id=?",
                (self.now, case["id"]),
            )
            conn.commit()

        revoked = self.client.post(
            f"{API}/admission-cases/{case['id']}/revoke", headers=self._auth(host["token"])
        )
        assert revoked.status_code == 200, revoked.text
        assert revoked.json()["case"]["status"] == "revoked"

        restored = self.client.post(
            f"{API}/admission-cases/{case['id']}/reenable", headers=self._auth(host["token"])
        )
        assert restored.status_code == 200, restored.text
        assert restored.json()["case"]["status"] == "leader_pending"
        events = self._audit_events(case["id"])
        assert any(ev["action"] == "admission.case.reenable" for ev in events)


if __name__ == "__main__":
    unittest.main()
