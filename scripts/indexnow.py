"""Tell IndexNow (Bing, Yandex, Seznam, Naver) which pages changed in the latest build.

Bing's index feeds ChatGPT search and Copilot, and it learns about changed pages much sooner
from IndexNow than from re-reading the sitemap. This reads the sitemap files the build wrote
and submits every page whose lastmod falls in the last `--days` days, in batches of 10,000
(the protocol's limit). The key is public by design: the protocol checks it against the
public/<key>.txt file served from the site.

Usage: python3 scripts/indexnow.py [--days 2] [--dry-run]
"""
import argparse
import sys
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

import requests

PUBLIC_DIR = Path(__file__).resolve().parent.parent / "public"
ENDPOINT = "https://api.indexnow.org/indexnow"
BATCH_SIZE = 10_000
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def find_key(public_dir: Path = PUBLIC_DIR) -> str:
    for path in public_dir.glob("*.txt"):
        text = path.read_text(encoding="utf-8").strip()
        if path.stem == text and len(text) == 32 and all(c in "0123456789abcdef" for c in text):
            return text
    raise SystemExit("No IndexNow key file (public/<32 hex characters>.txt) found.")


def changed_urls(public_dir: Path, since: str) -> list:
    urls = []
    for path in sorted((public_dir / "sitemaps").glob("*.xml")):
        for entry in ET.parse(path).getroot().iter(f"{NS}url"):
            loc = entry.findtext(f"{NS}loc")
            lastmod = entry.findtext(f"{NS}lastmod") or ""
            if loc and lastmod >= since:
                urls.append(loc)
    return urls


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--days", type=int, default=2)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    key = find_key()
    since = (date.today() - timedelta(days=args.days)).isoformat()
    urls = changed_urls(PUBLIC_DIR, since)
    print(f"{len(urls)} pages changed since {since}.")
    if not urls or args.dry_run:
        return 0
    host = urlparse(urls[0]).hostname
    for start in range(0, len(urls), BATCH_SIZE):
        batch = urls[start:start + BATCH_SIZE]
        response = requests.post(
            ENDPOINT,
            json={
                "host": host,
                "key": key,
                "keyLocation": f"https://{host}/{key}.txt",
                "urlList": batch,
            },
            timeout=60,
        )
        print(f"Submitted {len(batch)} URLs: HTTP {response.status_code}")
        if response.status_code >= 400:
            print(response.text[:500], file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
