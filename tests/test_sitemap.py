import unittest
import xml.etree.ElementTree as ET

from scripts.build_h2h import build_sitemap

NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def _payloads(pairs):
    payloads = {}
    for (a, b), games in pairs.items():
        for pid, oid in ((a, b), (b, a)):
            payloads.setdefault(pid, {"player": {"id": pid}, "opponents": {}})
            payloads[pid]["opponents"][str(oid)] = {"summary": {"total_matches": games}}
    return payloads


def _locs(text):
    return [el.text for el in ET.fromstring(text).iter(f"{NS}loc")]


class SitemapTest(unittest.TestCase):
    def test_lists_home_players_and_busiest_matchups_once(self):
        payloads = _payloads({(1, 2): 9, (1, 3): 40, (2, 3): 2})
        text = build_sitemap(payloads, "2026-11-01", "https://h2h.example/", min_pair_games=5)
        self.assertEqual(
            _locs(text),
            [
                "https://h2h.example/",
                "https://h2h.example/ratings",
                "https://h2h.example/?p1=1",
                "https://h2h.example/?p1=2",
                "https://h2h.example/?p1=3",
                "https://h2h.example/?p1=1&p2=3",
                "https://h2h.example/?p1=1&p2=2",
            ],
        )
        self.assertIn("&amp;p2=", text)
        self.assertIn("<lastmod>2026-11-01</lastmod>", text)

    def test_lists_tournaments_after_players(self):
        payloads = _payloads({(1, 2): 9})
        locs = _locs(build_sitemap(payloads, "2026-11-01", "https://h2h.example",
                                   tournament_ids=[30, 4]))
        self.assertEqual(locs[4:6], ["https://h2h.example/tournament?id=4",
                                     "https://h2h.example/tournament?id=30"])

    def test_respects_url_cap(self):
        payloads = _payloads({(1, 2): 9, (1, 3): 40, (2, 3): 20})
        locs = _locs(build_sitemap(payloads, "2026-11-01", "https://h2h.example", max_urls=6))
        self.assertEqual(len(locs), 6)
        self.assertEqual(locs[-1], "https://h2h.example/?p1=1&p2=3")


if __name__ == "__main__":
    unittest.main()
