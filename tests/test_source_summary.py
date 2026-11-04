import unittest

import pandas as pd

from scripts.build_h2h import build_source_summary, classify_sources


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
                ("table-hockey.eu", "2026-10-28"),
            ]
        )
        summary = build_source_summary(matches, ["bordshockey", "table-hockey-eu"])
        self.assertEqual(
            [(s["name"], s["matches"], s["latest_date"]) for s in summary],
            [
                ("th.sportscorpion.com", 2, "2026-03-01"),
                ("resultat.bordshockey.se", 3, "2026-02-14"),
                ("table-hockey.eu", 1, "2026-10-28"),
            ],
        )
        self.assertEqual(sum(s["matches"] for s in summary), len(matches))

    def test_skips_supplemental_sources_without_games(self):
        summary = build_source_summary(_matches([("", "2026-01-05")]), ["finland"])
        self.assertEqual([s["id"] for s in summary], ["sportscorpion"])

    def test_classifies_the_table_hockey_scrapers_sources(self):
        source = pd.Series(
            ["stiga.trefik.cz", "tulos.poytajaakiekko.fi", "escore.live", "galdahokejs.lv"]
        )
        self.assertEqual(
            classify_sources(source).tolist(), ["trefik", "finland", "escore", "galdahokejs"]
        )

    def test_skips_disabled_supplemental_sources(self):
        summary = build_source_summary(_matches([("", "2026-01-05")]), [])
        self.assertEqual([s["id"] for s in summary], ["sportscorpion"])


if __name__ == "__main__":
    unittest.main()
