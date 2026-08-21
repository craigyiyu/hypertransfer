"""Migration tests for the admission-case schema additions.

The requirement: the new admission tables are purely additive. Starting from the
current SQLite schema (branch tip — which already has legacy `invitations`,
`deposit_requests`, `refund_requests`, etc.), running the initializer again must
  - preserve every legacy row unchanged (invitations, and any legacy
    payment_applications table that may exist in deployed databases), and
  - add the new admission tables idempotently.

No DROP TABLE, ALTER TABLE ... RENAME, or copy of historical PII into the new
tables is permitted.
"""

import sqlite3
import time
import unittest
from pathlib import Path

import server


def open_current_schema(path: Path) -> sqlite3.Connection:
    """Build a DB matching the current (pre-admission) SQLite schema.

    This is exactly `server.NEW_SCHEMA_SQL` as it exists on the branch tip —
    the schema the new tables must be additive on top of. It intentionally does
    NOT include the new admission tables.
    """
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(server.NEW_SCHEMA_SQL)
    conn.commit()
    return conn


def insert_legacy_invitation(conn: sqlite3.Connection) -> None:
    now = int(time.time())
    conn.execute(
        """INSERT INTO invitations(
               id, patron_email, patron_name, details_json, token, status,
               expires_at, created_by, reviewed_by, consumed_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            "legacy-inv-1",
            "legacy@example.test",
            "Legacy Patron",
            '{"memberId":"M-LEGACY-1"}',
            "legacy-token-1",
            "submitted",
            now + 3600,
            "rm-legacy",
            None,
            None,
            now,
            now,
        ),
    )
    conn.commit()


def insert_legacy_payment_application(conn: sqlite3.Connection) -> None:
    """Insert into a legacy payment_applications table if the deployed database
    has one (the branch schema itself does not define it — this guards the
    'never mutate legacy payment_applications' constraint for older DBs)."""
    has_table = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='payment_applications'"
    ).fetchone()
    if not has_table:
        conn.execute(
            """CREATE TABLE payment_applications (
                   id TEXT PRIMARY KEY, patron_email TEXT NOT NULL,
                   travel_rule_json TEXT, status TEXT NOT NULL,
                   created_at INTEGER NOT NULL)"""
        )
    conn.execute(
        """INSERT INTO payment_applications(id, patron_email, travel_rule_json, status, created_at)
           VALUES (?,?,?,?,?)""",
        (
            "legacy-pa-1",
            "legacy@example.test",
            '{"historical":true}',
            "submitted",
            int(time.time()),
        ),
    )
    conn.commit()


def initialise_database(path: Path) -> None:
    """Run server.init_db against a specific DB file (swap the module-level path)."""
    old_path = server.DB_PATH
    server.DB_PATH = Path(path)
    try:
        server.init_db()
    finally:
        server.DB_PATH = old_path


def select_legacy_invitation_count(conn: sqlite3.Connection) -> int:
    return conn.execute("SELECT COUNT(*) c FROM invitations").fetchone()["c"]


def select_legacy_payment_application_count(conn: sqlite3.Connection) -> int:
    return conn.execute("SELECT COUNT(*) c FROM payment_applications").fetchone()["c"]


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


class AdmissionSchemaMigrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(__file__).resolve().parent / ".test-tmp"
        self.tmp.mkdir(exist_ok=True)
        self.db_path = self.tmp / "legacy.db"
        if self.db_path.exists():
            self.db_path.unlink()

    def tearDown(self):
        if self.db_path.exists():
            self.db_path.unlink()

    def test_schema_migration_preserves_legacy_invitation_rows(self):
        conn = open_current_schema(self.db_path)
        insert_legacy_invitation(conn)
        initialise_database(self.db_path)
        assert select_legacy_invitation_count(conn) == 1
        assert table_exists(conn, "vip_admission_cases")

    def test_schema_migration_preserves_legacy_payment_applications(self):
        conn = open_current_schema(self.db_path)
        insert_legacy_payment_application(conn)
        initialise_database(self.db_path)
        assert select_legacy_payment_application_count(conn) == 1
        assert table_exists(conn, "vip_admission_cases")

    def test_schema_migration_is_idempotent(self):
        conn = open_current_schema(self.db_path)
        insert_legacy_invitation(conn)
        initialise_database(self.db_path)
        initialise_database(self.db_path)  # second run must not fail or duplicate
        assert select_legacy_invitation_count(conn) == 1
        assert table_exists(conn, "vip_admission_cases")
        assert table_exists(conn, "admission_invitation_sessions")
        assert table_exists(conn, "payment_intents")
        assert table_exists(conn, "transaction_compliance_packs")
        assert table_exists(conn, "host_profiles")

    def test_legacy_invitation_row_content_is_unchanged(self):
        conn = open_current_schema(self.db_path)
        insert_legacy_invitation(conn)
        initialise_database(self.db_path)
        row = conn.execute(
            "SELECT * FROM invitations WHERE id='legacy-inv-1'"
        ).fetchone()
        assert row["patron_email"] == "legacy@example.test"
        assert row["status"] == "submitted"
        assert row["token"] == "legacy-token-1"

    def test_new_tables_have_required_indexes(self):
        conn = open_current_schema(self.db_path)
        initialise_database(self.db_path)
        index_sql = {
            row["name"]: row["sql"]
            for row in conn.execute(
                "SELECT name, sql FROM sqlite_master WHERE type='index'"
            ).fetchall()
            if row["sql"]
        }
        for index_name in (
            "idx_admission_case_host",
            "idx_admission_case_patron_email",
            "idx_admission_case_status",
            "idx_invitation_session_case",
            "idx_compliance_pack_intent_leg",
        ):
            assert index_name in index_sql, f"missing index {index_name}"

    def test_no_destructive_ddl_ran(self):
        # Migration must never DROP or RENAME the legacy tables.
        conn = open_current_schema(self.db_path)
        insert_legacy_invitation(conn)
        initialise_database(self.db_path)
        for table in ("users", "invitations", "deposit_requests",
                      "refund_requests", "audit_trail", "email_otps"):
            assert table_exists(conn, table), f"legacy table {table} must survive"


if __name__ == "__main__":
    unittest.main()
