import json
import tempfile
import unittest
from pathlib import Path

from scripts import build_h2h


class AliasFileTests(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.path = Path(self._dir.name) / "aliases.json"

    def _write(self, content):
        if not isinstance(content, str):
            content = json.dumps(content)
        self.path.write_text(content, encoding="utf-8")
        return self.path

    def test_the_committed_aliases_file_is_valid(self):
        self.assertTrue(build_h2h.load_alias_groups())

    def test_a_missing_file_means_no_aliases(self):
        self.assertEqual(build_h2h.load_alias_groups(self.path), [])
        self.assertEqual(build_h2h.load_alias_group_records(self.path), [])

    def test_invalid_json_stops_the_build(self):
        with self.assertRaises(ValueError):
            build_h2h.load_alias_groups(self._write('{"groups": ['))

    def test_groups_must_be_a_list(self):
        with self.assertRaises(ValueError):
            build_h2h.load_alias_groups(self._write({"groups": {}}))

    def test_an_id_in_two_groups_is_rejected(self):
        content = {"groups": [{"name": "A", "ids": [1, 2]}, {"name": "B", "ids": [2, 3]}]}
        with self.assertRaises(ValueError):
            build_h2h.load_alias_groups(self._write(content))

    def test_ids_must_be_positive_integers(self):
        for ids in (["12", 3], [0, 3], [True, 3]):
            with self.subTest(ids=ids):
                path = self._write({"groups": [{"name": "A", "ids": ids}]})
                with self.assertRaises(ValueError):
                    build_h2h.load_alias_groups(path)

    def test_a_group_needs_two_ids(self):
        with self.assertRaises(ValueError):
            build_h2h.load_alias_groups(self._write({"groups": [{"name": "A", "ids": [5]}]}))

    def test_records_keep_their_names(self):
        groups = [{"name": "A", "ids": [1, 2]}, {"name": "B", "ids": [3, 4, 5]}]
        path = self._write({"groups": groups})
        self.assertEqual(build_h2h.load_alias_group_records(path), groups)
        self.assertEqual(build_h2h.load_alias_groups(path), [[1, 2], [3, 4, 5]])


if __name__ == "__main__":
    unittest.main()
