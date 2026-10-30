import unittest

import pandas as pd

from scripts.build_h2h import build_source_summary


def _matches(rows):
    """rows: (source, date)."""
    frame = pd.DataFrame(rows, columns=["source", "date"])
    frame["date_dt"] = pd.to_datetime(frame["date"])
    return frame


class SourceSummaryTest(unittest.TestCase):
    def test_counts_and_latest_date_per_source(self):
        matches = _matches(
            [
                ("", "2026-01-05"),
                (None, "2026-03-01"),
                ("bordshockey.net", "2025-12-31"),
                ("bordshockey.net", "2026-02-14"),
                ("bordshockey.net", None),
            ]
        )
        summary = build_source_summary(matches, include_bordshockey=True)
        self.assertEqual(
            [(s["name"], s["matches"], s["latest_date"]) for s in summary],
            [
                ("th.sportscorpion.com", 2, "2026-03-01"),
                ("resultat.bordshockey.se", 3, "2026-02-14"),
            ],
        )
        self.assertEqual(sum(s["matches"] for s in summary), len(matches))

    def test_skips_bordshockey_when_disabled(self):
        summary = build_source_summary(_matches([("", "2026-01-05")]), include_bordshockey=False)
        self.assertEqual([s["id"] for s in summary], ["sportscorpion"])


if __name__ == "__main__":
    unittest.main()
