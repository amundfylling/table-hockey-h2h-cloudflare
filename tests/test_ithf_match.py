import datetime as dt
import unittest
from unittest import mock

from scripts import ithf_match

TODAY = dt.date(2026, 11, 19)


def _page(tid, date, players, champion=1, name="Bergensliga Autumn 2026 #9", **extra):
    return {"id": tid, "name": name, "date": date, "end_date": date, "country": "Norway",
            "players": {str(i): n for i, n in enumerate(players, start=1)},
            "champion": champion, **extra}


PLAYERS = ["Daniel Nygård", "Trond Ove Gangsøy", "Linnea Gangsøy", "Arne Johannes Holmin",
           "Oline Holmin Brunvoll", "Hans Christian Lønne"]
CALENDAR = [{"id": 900, "date": "2026-11-17", "name": "Bergensliga Autumn 2026 #9",
             "place": "Bergen (NOR)", "cc": "NOR", "series": [], "players": 6},
            {"id": 901, "date": "2026-11-17", "name": "Jarliga 2026/27 #14",
             "place": "Kvernaland (NOR)", "cc": "NOR", "series": [], "players": 9}]
TABLES = {900: {"id": 900, "rows": [[str(i), 1000 + i, n.replace("ø", "o").replace("å", "a")]
                                    for i, n in enumerate(PLAYERS, start=1)]},
          901: {"id": 901, "rows": [["1", 2001, "Magnus Klippen"], ["2", 2002, "Jonas Bolstad"]]}}


class LinkNewTest(unittest.TestCase):
    def _run(self, pages, known):
        with mock.patch.object(ithf_match, "fetch_calendar_since", return_value=CALENDAR) as cal, \
                mock.patch.object(ithf_match, "fetch_final_tables",
                                  side_effect=lambda ids, **_: {i: TABLES[i] for i in ids}):
            return ithf_match.link_new(pages, known, today=TODAY), cal

    def test_new_tournament_is_linked_by_its_players(self):
        pages = {1: _page(1, "2026-11-17", PLAYERS)}
        links, calendar = self._run(pages, {})
        self.assertEqual(links["1"]["ithf"], 900)
        self.assertTrue(links["1"]["main"])
        self.assertEqual(links["1"]["places"][0], [1, 1001, "Daniel Nygard", 1])
        # Only the calendar since the oldest new page (less the matching slack) is read.
        calendar.assert_called_once_with(dt.date(2026, 11, 12))

    def test_known_old_and_fragment_pages_are_skipped(self):
        pages = {1: _page(1, "2026-11-17", PLAYERS),
                 2: _page(2, "2026-01-10", PLAYERS),
                 3: _page(3, "2026-11-17", PLAYERS, part_of={"id": 1})}
        links, calendar = self._run(pages, {"1": {"ithf": 900}})
        self.assertEqual(links, {})
        calendar.assert_not_called()

    def test_an_already_linked_ithf_tournament_is_not_offered_again(self):
        pages = {5: _page(5, "2026-11-17", PLAYERS)}
        links, _ = self._run(pages, {"1": {"ithf": 900}})
        self.assertEqual(links, {})

    def test_a_given_calendar_is_used_as_is(self):
        pages = {1: _page(1, "2026-11-17", PLAYERS)}
        with mock.patch.object(ithf_match, "fetch_calendar_since") as cal, \
                mock.patch.object(ithf_match, "fetch_final_tables",
                                  side_effect=lambda ids, **_: {i: TABLES[i] for i in ids}):
            links = ithf_match.link_new(pages, {}, today=TODAY, calendar=CALENDAR)
        cal.assert_not_called()
        self.assertEqual(links["1"]["ithf"], 900)


class PendingIdsTest(unittest.TestCase):
    LIST = {"fields": ["id", "name", "date", "end_date"],
            "tournaments": [[1, "Bergensliga Autumn 2026 #9", "2026-11-17", "2026-11-17"],
                            [2, "Old", "2026-01-10", "2026-01-10"]]}

    def test_unlinked_calendar_entries_near_unlinked_recent_pages(self):
        self.assertEqual(ithf_match.pending_ids(self.LIST, {}, CALENDAR, today=TODAY), [900, 901])
        # Page 1 linked to 900: nothing recent is left to match.
        self.assertEqual(
            ithf_match.pending_ids(self.LIST, {1: {"ithf": 900}}, CALENDAR, today=TODAY), [])
        # Another page linked to 900: only 901 could still be page 1's.
        self.assertEqual(
            ithf_match.pending_ids(self.LIST, {"5": {"ithf": 900}}, CALENDAR, today=TODAY), [901])


if __name__ == "__main__":
    unittest.main()
