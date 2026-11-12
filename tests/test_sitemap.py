import unittest
import xml.etree.ElementTree as ET

from scripts.build_h2h import build_sitemaps

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


def build_sitemap(*args, **kwargs):
    """Every page URL the sitemap files list, as one urlset, in index order."""
    files = build_sitemaps(*args, **kwargs)
    base = "https://h2h.example/"
    entries = []
    for loc in _locs(files["sitemap.xml"]):
        text = files[loc[len(base):]]
        entries.extend(ET.tostring(el, encoding="unicode") for el in ET.fromstring(text))
    return (f'<urlset xmlns="{NS[1:-1]}">' + "".join(entries) + "</urlset>").replace(
        "ns0:", "").replace(":ns0", "")


class SitemapTest(unittest.TestCase):
    def test_lists_home_players_and_busiest_matchups_once(self):
        payloads = _payloads({(1, 2): 9, (1, 3): 40, (2, 3): 2})
        text = build_sitemap(payloads, "2026-11-01", "https://h2h.example/", min_pair_games=5)
        self.assertEqual(
            _locs(text),
            [
                "https://h2h.example/",
                "https://h2h.example/ratings",
                "https://h2h.example/changelog",
                "https://h2h.example/leaderboard",
                "https://h2h.example/tournaments",
                "https://h2h.example/guide",
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
        self.assertEqual(locs[8:10], ["https://h2h.example/tournament?id=4",
                                     "https://h2h.example/tournament?id=30"])

    def test_lastmod_follows_the_latest_game_not_the_build(self):
        payloads = _payloads({(1, 2): 9, (1, 3): 9})
        payloads[1]["opponents"]["2"]["summary"]["last_meeting_date"] = "2024-05-01"
        payloads[2]["opponents"]["1"]["summary"]["last_meeting_date"] = "2024-05-01"
        payloads[1]["opponents"]["3"]["summary"]["last_meeting_date"] = "2025-02-03"
        payloads[3]["opponents"]["1"]["summary"]["last_meeting_date"] = "2025-02-03"
        # A later rated game against an unlisted opponent still changes player 2's page.
        payloads[2]["rating"] = {"history": [["2023-01-01", 1500, 350, "A"],
                                             ["2025-06-07", 1510, 300, "B"]]}
        text = build_sitemap(payloads, "2026-11-01", "https://h2h.example", min_pair_games=5,
                             tournament_ids=[4, 5], tournament_dates={4: "2019-03-02"})
        lastmod = {
            url.find(f"{NS}loc").text: url.find(f"{NS}lastmod").text
            for url in ET.fromstring(text).iter(f"{NS}url")
        }
        base = "https://h2h.example"
        self.assertEqual(lastmod[f"{base}/"], "2026-11-01")
        self.assertEqual(lastmod[f"{base}/?p1=1"], "2025-02-03")
        self.assertEqual(lastmod[f"{base}/?p1=2"], "2025-06-07")
        self.assertEqual(lastmod[f"{base}/?p1=3"], "2025-02-03")
        # A pair page also shows a forecast from both players' current ratings.
        self.assertEqual(lastmod[f"{base}/?p1=1&p2=2"], "2025-06-07")
        self.assertEqual(lastmod[f"{base}/tournament?id=4"], "2019-03-02")
        self.assertEqual(lastmod[f"{base}/tournament?id=5"], "2026-11-01")

    def test_lists_every_pair_by_default(self):
        payloads = _payloads({(1, 2): 1, (1, 3): 40, (2, 3): 2})
        locs = _locs(build_sitemap(payloads, "2026-11-01", "https://h2h.example"))
        self.assertEqual(locs[-3:], ["https://h2h.example/?p1=1&p2=3",
                                     "https://h2h.example/?p1=2&p2=3",
                                     "https://h2h.example/?p1=1&p2=2"])

    def test_splits_each_kind_into_files_under_the_cap(self):
        payloads = _payloads({(1, 2): 9, (1, 3): 40, (2, 3): 20, (3, 4): 5})
        files = build_sitemaps(payloads, "2026-11-01", "https://h2h.example", max_urls=3,
                               tournament_ids=[7])
        self.assertEqual(
            _locs(files["sitemap.xml"]),
            [
                "https://h2h.example/sitemaps/pages-1.xml",
                "https://h2h.example/sitemaps/pages-2.xml",
                "https://h2h.example/sitemaps/players-1.xml",
                "https://h2h.example/sitemaps/players-2.xml",
                "https://h2h.example/sitemaps/tournaments-1.xml",
                "https://h2h.example/sitemaps/matchups-1.xml",
                "https://h2h.example/sitemaps/matchups-2.xml",
            ],
        )
        self.assertTrue(files["sitemap.xml"].lstrip().startswith("<?xml"))
        self.assertIn("<sitemapindex", files["sitemap.xml"])
        for path, text in files.items():
            if path != "sitemap.xml":
                self.assertLessEqual(len(_locs(text)), 3, path)
        self.assertEqual(_locs(files["sitemaps/matchups-2.xml"]), ["https://h2h.example/?p1=3&p2=4"])

if __name__ == "__main__":
    unittest.main()
