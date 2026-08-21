"""Unit tests for the Notabene provider boundary and session-token hashing.

Real Notabene integration is outside this prototype. Requirements under test:
  - the deterministic demo adapter makes stable decisions from pack data only;
  - production fails closed (ProviderUnavailable -> HTTP 503 in the API layer)
    whenever real configuration is absent — and this prototype never pretends
    to submit to a real Notabene;
  - raw session/QR tokens are never persisted: only salted hashes are stored.
"""

import unittest
from decimal import Decimal

from admission_provider_adapters import (
    hash_session_token,
    verify_session_token,
)
from notabene_adapter import (
    DemoNotabeneProvider,
    ProviderDecision,
    ProviderUnavailable,
    TransactionCompliancePack,
    notabene_configured,
    resolve_notabene_provider,
)


class _FakePack:
    def __init__(self, pack_id: str, actual_hkd_amount: str):
        self.id = pack_id
        self.actual_hkd_amount = actual_hkd_amount


class DemoNotabeneProviderTests(unittest.TestCase):
    def setUp(self):
        self.provider = DemoNotabeneProvider()

    def test_positive_amount_is_accepted_with_demo_reference(self):
        pack = _FakePack("pack-1", "8000")
        decision = self.provider.validate_and_send(pack)
        assert isinstance(decision, ProviderDecision)
        assert decision.status == "accepted"
        assert decision.reference == "NB-DEMO-pack-1"
        assert decision.reason_code == ""

    def test_zero_amount_is_rejected_as_invalid(self):
        pack = _FakePack("pack-2", "0")
        decision = self.provider.validate_and_send(pack)
        assert decision.status == "rejected"
        assert decision.reason_code == "invalid_amount"

    def test_negative_amount_is_rejected_as_invalid(self):
        pack = _FakePack("pack-3", "-5")
        decision = self.provider.validate_and_send(pack)
        assert decision.status == "rejected"
        assert decision.reason_code == "invalid_amount"

    def test_non_numeric_amount_fails_closed(self):
        pack = _FakePack("pack-4", "not-a-number")
        decision = self.provider.validate_and_send(pack)
        assert decision.status == "rejected"
        assert decision.reason_code == "invalid_amount"

    def test_decimal_amount_is_supported(self):
        pack = _FakePack("pack-5", Decimal("123.45"))
        decision = self.provider.validate_and_send(pack)
        assert decision.status == "accepted"

    def test_pack_protocol_shape(self):
        # The provider only relies on id + actual_hkd_amount.
        pack = _FakePack("pack-6", "1")
        assert isinstance(pack, TransactionCompliancePack)


class NotabeneConfigurationTests(unittest.TestCase):
    def test_configuration_detection(self):
        assert not notabene_configured({})
        assert not notabene_configured({"NOTABENE_APP_ID": "x"})
        assert notabene_configured({
            "NOTABENE_APP_ID": "x",
            "NOTABENE_API_KEY": "y",
            "NOTABENE_BASE_URL": "https://example.test",
        })

    def test_non_production_returns_demo_provider(self):
        provider = resolve_notabene_provider({}, environment="sandbox")
        assert isinstance(provider, DemoNotabeneProvider)
        provider = resolve_notabene_provider(
            {"NOTABENE_APP_ID": "x", "NOTABENE_API_KEY": "y",
             "NOTABENE_BASE_URL": "https://example.test"},
            environment="staging",
        )
        assert isinstance(provider, DemoNotabeneProvider)

    def test_production_without_config_fails_closed(self):
        with self.assertRaises(ProviderUnavailable):
            resolve_notabene_provider({}, environment="production")

    def test_production_with_config_still_fails_closed_in_prototype(self):
        # Real Notabene integration is not implemented; having env values must
        # not make the prototype pretend to submit.
        with self.assertRaises(ProviderUnavailable):
            resolve_notabene_provider(
                {"NOTABENE_APP_ID": "x", "NOTABENE_API_KEY": "y",
                 "NOTABENE_BASE_URL": "https://example.test"},
                environment="production",
            )


class SessionTokenHashingTests(unittest.TestCase):
    def test_stored_value_never_contains_raw_token(self):
        token = "raw-secret-session-token-123"
        stored = hash_session_token(token)
        assert token not in stored
        assert "$" in stored  # salt$hexdigest form

    def test_round_trip_verification(self):
        token = "another-raw-token"
        stored = hash_session_token(token)
        assert verify_session_token(stored, token) is True

    def test_wrong_token_fails(self):
        stored = hash_session_token("right-token")
        assert verify_session_token(stored, "wrong-token") is False

    def test_salts_are_random_per_hash(self):
        stored_a = hash_session_token("same-token")
        stored_b = hash_session_token("same-token")
        assert stored_a != stored_b

    def test_malformed_stored_value_fails_closed(self):
        assert verify_session_token("no-salt-separator", "anything") is False
        assert verify_session_token("", "anything") is False


if __name__ == "__main__":
    unittest.main()
