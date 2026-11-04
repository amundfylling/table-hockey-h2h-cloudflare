import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import download as dl  # noqa: E402


class _Response:
    def __init__(self, status_code):
        self.status_code = status_code
        self.headers = {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} error", response=self)


class DownloadNotFoundTest(unittest.TestCase):
    def test_404_fails_at_once_and_is_recognisable(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(
            dl.requests, "get", return_value=_Response(404)
        ) as get, mock.patch.object(dl.time, "sleep") as sleep:
            with self.assertRaises(RuntimeError) as caught:
                dl.download("https://example.com/missing.parquet", Path(tmp) / "f", retries=5)
        self.assertEqual(get.call_count, 1)
        sleep.assert_not_called()
        self.assertTrue(dl.is_not_found(caught.exception))

    def test_server_errors_are_retried_and_not_a_404(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(
            dl.requests, "get", return_value=_Response(503)
        ) as get, mock.patch.object(dl.time, "sleep"):
            with self.assertRaises(RuntimeError) as caught:
                dl.download("https://example.com/flaky.parquet", Path(tmp) / "f", retries=2)
        self.assertEqual(get.call_count, 3)
        self.assertFalse(dl.is_not_found(caught.exception))


if __name__ == "__main__":
    unittest.main()
