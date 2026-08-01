import tempfile
import unittest
from pathlib import Path

from scripts.build_h2h import prepare_data_staging, publish_staged_data


class TestAtomicPublish(unittest.TestCase):
    def test_complete_staging_tree_replaces_previous_dataset(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            data_dir = root / "data"
            staging_dir = root / "data-build"
            backup_dir = root / "data-previous"
            data_dir.mkdir()
            (data_dir / "old.json").write_text("old", encoding="utf-8")

            prepare_data_staging(data_dir, staging_dir, backup_dir)
            (staging_dir / "new.json").write_text("new", encoding="utf-8")
            publish_staged_data(data_dir, staging_dir, backup_dir)

            self.assertFalse((data_dir / "old.json").exists())
            self.assertEqual(
                (data_dir / "new.json").read_text(encoding="utf-8"),
                "new",
            )
            self.assertFalse(staging_dir.exists())
            self.assertFalse(backup_dir.exists())

    def test_prepare_restores_backup_left_by_an_interrupted_swap(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            data_dir = root / "data"
            staging_dir = root / "data-build"
            backup_dir = root / "data-previous"
            backup_dir.mkdir()
            (backup_dir / "complete.json").write_text("complete", encoding="utf-8")

            prepare_data_staging(data_dir, staging_dir, backup_dir)

            self.assertEqual(
                (data_dir / "complete.json").read_text(encoding="utf-8"),
                "complete",
            )
            self.assertTrue(staging_dir.is_dir())
            self.assertFalse(backup_dir.exists())


if __name__ == "__main__":
    unittest.main()
