"""The export must not carry original memos, names, credentials, or preview tokens."""
import importlib.util
import json
from pathlib import Path
import re
import unittest

SPEC = importlib.util.spec_from_file_location("replay_extract", Path(__file__).with_name("replay-extract.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReplayExtractTest(unittest.TestCase):
    def test_original_artifact_exports_all_apis_without_identity_or_token_literals(self) -> None:
        root = Path(__file__).resolve().parents[4]
        trace = root / "_attic/runtime/comparison-checks/ci-eddd0811-playwright-general/data/207aed72759b6c3ebe7d4fe8ba0d10db84f28469.zip"
        if not trace.exists():
            self.skipTest("original artifact unavailable; pure template tests remain portable")
        manifest = MODULE.extract(trace)
        rows = {row["id"]: row for row in manifest["requests"]}
        self.assertEqual(len(rows), 36)
        self.assertEqual(len(manifest["excluded"]), 1)
        self.assertEqual([rows[key]["offset_ms"] for key in ("b212", "b213", "a16")], [4330.348, 4459.348, 4576.348])
        self.assertEqual(rows["b212"]["data"]["bundles"], {"$ref": "responses.b210.bundles"})
        self.assertNotIn("responses.b212", json.dumps(rows["b213"]))
        self.assertEqual(rows["a16"]["path"][1], {"$ref": "responses.b212.stock_requests.0.stock_request_id"})
        self.assertIsNone(re.search(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}", json.dumps(manifest)))

    def test_submit_maps_whole_verified_preview_not_random_uuids(self) -> None:
        bundles = [{"bundle_id": "old-id", "lines": [{"bom_auto_token": "old-signed-token"}]}]
        output = MODULE.submit_template({"bundles": bundles, "notes": "RAW-PRIVATE-MEMO", "client_request_id": "old-client"},
                                        {"bundles": bundles}, "b210", {})
        self.assertEqual(output["bundles"], {"$ref": "responses.b210.bundles"})
        self.assertNotIn("RAW-PRIVATE-MEMO", str(output))
        self.assertNotIn("old-signed-token", str(output))
        self.assertEqual(output["client_request_id"], {"$ref": "fresh.client_request_id"})

    def test_changed_submit_bundle_fails_closed(self) -> None:
        with self.assertRaisesRegex(ValueError, "submit_preview_mismatch"):
            MODULE.submit_template({"bundles": [{"bundle_id": "different"}]}, {"bundles": []}, "b210", {})

    def test_unknown_string_cannot_be_silently_exported(self) -> None:
        with self.assertRaisesRegex(ValueError, "unapproved_string_field"):
            MODULE.sanitize({"unexpected": "RAW-SECRET"}, {})

    def test_explicit_identity_bindings_and_synthetic_memo(self) -> None:
        output = MODULE.sanitize({"item_id": "old-item", "notes": "RAW-PRIVATE-MEMO", "quantity": 2, "to_department": "연구"},
                                 {"old-item": "fixture.parent.item_id"})
        self.assertEqual(output["item_id"], {"$ref": "fixture.parent.item_id"})
        self.assertEqual(output["quantity"], 2)
        self.assertNotIn("RAW-PRIVATE-MEMO", str(output))


if __name__ == "__main__":
    unittest.main()
