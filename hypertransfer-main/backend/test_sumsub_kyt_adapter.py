"""test_sumsub_kyt_adapter.py — v1.1 Q2 tests"""

import os
import unittest
from sumsub_kyt_adapter import screen_source_wallet_v2


class SumsubKytAdapterTests(unittest.TestCase):
    def setUp(self):
        self._old_env = {k: os.environ.get(k) for k in
                         ("HT_KYT_PROVIDER", "SUMSUB_KYT_APP_TOKEN", "SUMSUB_KYT_SECRET_KEY",
                          "SUMSUB_BASE_URL", "SUMSUB_ENVIRONMENT")}
        for k in self._old_env:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self._old_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_mock_default_pass(self):
        os.environ["HT_KYT_PROVIDER"] = "mock"
        r = screen_source_wallet_v2("0xABCDEF1234567890abcdef1234567890abcdef12", "ethereum")
        self.assertEqual(r["decision"], "pass")
        self.assertEqual(r["provider"], "sumsub-mock")

    def test_mock_keyword_fail(self):
        os.environ["HT_KYT_PROVIDER"] = "mock"
        r = screen_source_wallet_v2("0xBADactor_sanctioned_wallet", "ethereum")
        self.assertEqual(r["decision"], "fail")
        self.assertGreaterEqual(r["riskScore"], 80)

    def test_mock_keyword_edd(self):
        os.environ["HT_KYT_PROVIDER"] = "mock"
        r = screen_source_wallet_v2("0xtornado_mixer_deposit", "ethereum")
        self.assertEqual(r["decision"], "edd")

    def test_provider_default_is_mock(self):
        self.assertNotIn("HT_KYT_PROVIDER", os.environ)
        r = screen_source_wallet_v2("0xSomeAddress", "tron")
        self.assertEqual(r["provider"], "sumsub-mock")

    def test_chain_id_normalization(self):
        os.environ["HT_KYT_PROVIDER"] = "mock"
        for token, expected in [("ERC-20", "ethereum"), ("tron", "tron"),
                                ("TRC-20", "tron"), ("ethereum", "ethereum")]:
            r = screen_source_wallet_v2("0xsafe_wallet_" + token, token)
            self.assertEqual(r["chainId"], expected)

    def test_sumsub_no_credentials_production_fails_closed(self):
        os.environ["HT_KYT_PROVIDER"] = "sumsub"
        os.environ["SUMSUB_ENVIRONMENT"] = "production"
        with self.assertRaises(RuntimeError):
            screen_source_wallet_v2("0xSomeAddress", "ethereum")

    def test_sumsub_no_credentials_non_production_falls_back_to_mock(self):
        os.environ["HT_KYT_PROVIDER"] = "sumsub"
        os.environ["SUMSUB_ENVIRONMENT"] = "sandbox"
        r = screen_source_wallet_v2("0xBADsanctioned_wallet", "ethereum")
        self.assertEqual(r["provider"], "sumsub-mock")
        self.assertEqual(r["decision"], "fail")


if __name__ == "__main__":
    unittest.main()
