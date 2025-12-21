#!/usr/bin/env python3
import argparse
import hashlib
import os
import sys
import time
from pathlib import Path
from typing import Optional

import requests

DEFAULT_MATCHES_URL = (
    "https://raw.githubusercontent.com/amundfylling/Scorpion-Scraper-2.0/main/data/"
    "scraped_matches.parquet"
)
DEFAULT_PLAYERS_URL = (
    "https://raw.githubusercontent.com/amundfylling/Scorpion-Scraper-2.0/main/data/"
    "players_data.csv"
)
DEFAULT_TOURNAMENTS_URL = (
    "https://raw.githubusercontent.com/amundfylling/Scorpion-Scraper-2.0/main/data/"
    "tournament_data.csv"
)

USER_AGENT = "h2h-downloader/1.0"


def _sha256_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def download(
    url: str,
    dest: Path,
    sha256: Optional[str] = None,
    etag_path: Optional[Path] = None,
    last_modified_path: Optional[Path] = None,
    retries: int = 3,
    backoff: float = 1.0,
    timeout: int = 60,
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and sha256:
        if _sha256_file(dest) == sha256.lower():
            return

    last_err = None
    for attempt in range(retries + 1):
        tmp_path = dest.with_suffix(dest.suffix + ".part")
        try:
            headers = {"User-Agent": USER_AGENT}
            if etag_path and etag_path.exists():
                etag_value = etag_path.read_text(encoding="utf-8").strip()
                if etag_value:
                    headers["If-None-Match"] = etag_value
            if last_modified_path and last_modified_path.exists():
                lm_value = last_modified_path.read_text(encoding="utf-8").strip()
                if lm_value:
                    headers["If-Modified-Since"] = lm_value

            with requests.get(
                url,
                stream=True,
                headers=headers,
                timeout=timeout,
            ) as resp:
                if resp.status_code == 304:
                    if dest.exists():
                        return
                    raise RuntimeError(f"Got 304 but missing cached file for {url}")
                resp.raise_for_status()
                hasher = hashlib.sha256() if sha256 else None
                with tmp_path.open("wb") as f:
                    for chunk in resp.iter_content(chunk_size=1024 * 1024):
                        if not chunk:
                            continue
                        f.write(chunk)
                        if hasher:
                            hasher.update(chunk)
            if sha256:
                digest = hasher.hexdigest()
                if digest != sha256.lower():
                    tmp_path.unlink(missing_ok=True)
                    raise ValueError(
                        f"Checksum mismatch for {url}. Expected {sha256}, got {digest}."
                    )
            os.replace(tmp_path, dest)
            if etag_path:
                etag_value = resp.headers.get("ETag")
                if etag_value:
                    etag_path.write_text(etag_value, encoding="utf-8")
            if last_modified_path:
                lm_value = resp.headers.get("Last-Modified")
                if lm_value:
                    last_modified_path.write_text(lm_value, encoding="utf-8")
            return
        except Exception as err:
            last_err = err
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass
            if attempt < retries:
                sleep_for = backoff * (2 ** attempt)
                time.sleep(sleep_for)
                continue
            break

    raise RuntimeError(f"Failed to download {url}: {last_err}")


def _resolve_default_url(kind: str) -> str:
    if kind == "matches":
        return os.environ.get("MATCHES_PARQUET_URL", DEFAULT_MATCHES_URL)
    if kind == "players":
        return os.environ.get("PLAYERS_CSV_URL", DEFAULT_PLAYERS_URL)
    if kind == "tournaments":
        return os.environ.get("TOURNAMENTS_CSV_URL", DEFAULT_TOURNAMENTS_URL)
    raise ValueError(f"Unknown kind: {kind}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download a file with retries.")
    parser.add_argument("--url", help="Source URL")
    parser.add_argument("--dest", required=True, help="Destination path")
    parser.add_argument("--sha256", help="Optional SHA256 checksum")
    parser.add_argument("--etag-path", help="Optional path to store ETag")
    parser.add_argument("--last-modified-path", help="Optional path to store Last-Modified")
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--backoff", type=float, default=1.0)
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument(
        "--kind",
        choices=["matches", "players", "tournaments"],
        help="Use default URL for the specified data source",
    )

    args = parser.parse_args()
    if not args.url:
        if not args.kind:
            parser.error("--url or --kind is required")
        url = _resolve_default_url(args.kind)
    else:
        url = args.url

    dest = Path(args.dest)
    download(
        url=url,
        dest=dest,
        sha256=args.sha256,
        etag_path=Path(args.etag_path) if args.etag_path else None,
        last_modified_path=Path(args.last_modified_path) if args.last_modified_path else None,
        retries=args.retries,
        backoff=args.backoff,
        timeout=args.timeout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
