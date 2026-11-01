import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import requests

from scripts import build_h2h


class SkipUnchangedSourcesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "matches.parquet"
        self.path.write_bytes(b"games")
        self.files = build_h2h.describe_source_files({"primary_matches": self.path})

    def tearDown(self):
        self.tmp.cleanup()

    def _published(self, payload=None, error=None):
        response = mock.Mock()
        if error:
            response.raise_for_status.side_effect = error
        response.json.return_value = payload
        return mock.patch.object(build_h2h.requests, "get", return_value=response)

    def test_matching_published_sources_skip(self):
        with self._published({"source_files": self.files}):
            self.assertTrue(build_h2h.sources_unchanged(self.files, "https://x/meta.json"))

    def test_any_difference_or_doubt_builds(self):
        changed = {"primary_matches": {**self.files["primary_matches"], "bytes": 1}}
        with self._published({"source_files": changed}):
            self.assertFalse(build_h2h.sources_unchanged(self.files, "https://x/meta.json"))
        with self._published(error=requests.HTTPError("404")):
            self.assertFalse(build_h2h.sources_unchanged(self.files, "https://x/meta.json"))
        with self._published(["not", "a", "dict"]):
            self.assertFalse(build_h2h.sources_unchanged(self.files, "https://x/meta.json"))
        self.assertFalse(build_h2h.sources_unchanged(self.files, ""))

    def test_writes_github_output(self):
        output = Path(self.tmp.name) / "out"
        with mock.patch.dict(os.environ, {"GITHUB_OUTPUT": str(output)}):
            build_h2h.write_github_output("changed", "false")
        self.assertEqual(output.read_text(), "changed=false\n")


if __name__ == "__main__":
    unittest.main()
