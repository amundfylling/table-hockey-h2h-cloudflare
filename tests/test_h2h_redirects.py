import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT_DIR / "public"
H2H_HTML_DIR = PUBLIC_DIR / "h2h"
OG_IMAGE_PATH = PUBLIC_DIR / "og-default.png"
FUNCTIONS_H2H_DIR = ROOT_DIR / "functions" / "h2h"
FUNCTIONS_H2H_FILE = FUNCTIONS_H2H_DIR / "[[path]].js"


class TestH2HRedirects(unittest.TestCase):
    def test_og_default_image_exists(self):
        self.assertTrue(
            OG_IMAGE_PATH.exists(),
            f"Default Open Graph image missing at {OG_IMAGE_PATH}",
        )

    def test_static_h2h_dir_not_exists(self):
        # The public/h2h directory should NOT contain generated files,
        # as redirects are now handled dynamically by a Pages Function.
        if H2H_HTML_DIR.exists():
            files = list(H2H_HTML_DIR.glob("**/*"))
            actual_files = [f for f in files if f.is_file() and f.name != ".DS_Store"]
            self.assertEqual(
                len(actual_files),
                0,
                f"Static redirect files should not be generated, but found: {actual_files}",
            )

    def test_h2h_pages_function_exists(self):
        self.assertTrue(
            FUNCTIONS_H2H_FILE.exists(),
            f"Cloudflare Pages Function missing at {FUNCTIONS_H2H_FILE}",
        )

        content = FUNCTIONS_H2H_FILE.read_text(encoding="utf-8")

        # Verify key aspects of the Pages Function logic
        self.assertIn(
            "env.ASSETS.fetch",
            content,
            "Pages Function should fetch player data from local static assets via env.ASSETS.fetch"
        )
        self.assertIn(
            "url.pathname.match",
            content,
            "Pages Function should match/extract player IDs from url.pathname"
        )
        self.assertIn(
            'property="og:title"',
            content,
            "Pages Function should generate og:title meta tag"
        )
        self.assertIn(
            'property="og:description"',
            content,
            "Pages Function should generate og:description meta tag"
        )
        self.assertIn(
            '<meta property="og:image" content="/og-default.png">',
            content,
            "Pages Function should reference og-default.png"
        )
        self.assertIn(
            'http-equiv="refresh"',
            content,
            "Pages Function should redirect the browser via a meta refresh tag"
        )
