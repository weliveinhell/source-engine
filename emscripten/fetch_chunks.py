#!/usr/bin/env python3
"""Download the packed Portal map chunks next to a built web bundle.

The CI artifact contains the engine only -- no game data. The engine asks for
./chunks/<map>.data at runtime, and without those files the page stops at
"Could not load game data".

The map list is read straight out of emscripten/pre.js so the two cannot drift.

    python3 emscripten/fetch_chunks.py --dir build/install

You need to own Portal. --base-url points at wherever your chunks are; the
default is the location this project's README documents. To build the chunks
from your own Portal install instead, see emscripten/repackage.js.
"""

import argparse
import os
import re
import sys
import urllib.error
import urllib.request

DEFAULT_BASE_URL = "https://yikes.pw/portal/chunks"
PRE_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pre.js")


def map_names(pre_js=PRE_JS):
    """Pull mapsOrdered out of pre.js so this list stays in sync with the engine."""
    with open(pre_js, encoding="utf-8") as fh:
        source = fh.read()
    block = re.search(r"mapsOrdered\s*=\s*\[(.*?)\]", source, re.S)
    if not block:
        sys.exit(f"could not find mapsOrdered in {pre_js}")
    return re.findall(r"'([^']+)'", block.group(1))


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f}{unit}" if unit == "B" else f"{n:.1f}{unit}"
        n /= 1024


def download(url, dest):
    tmp = dest + ".part"
    with urllib.request.urlopen(url) as response:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        with open(tmp, "wb") as out:
            while True:
                block = response.read(1 << 20)
                if not block:
                    break
                out.write(block)
                done += len(block)
                if total:
                    pct = 100 * done / total
                    print(f"\r    {pct:5.1f}%  {human(done)} / {human(total)}", end="")
                else:
                    print(f"\r    {human(done)}", end="")
    print()
    os.replace(tmp, dest)
    return done


def main(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default="build/install",
                        help="the built bundle; chunks land in <dir>/chunks (default: %(default)s)")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help="where to fetch <map>.data from (default: %(default)s)")
    parser.add_argument("--force", action="store_true",
                        help="re-download chunks that are already present")
    args = parser.parse_args(argv)

    out_dir = os.path.join(os.path.abspath(args.dir), "chunks")
    os.makedirs(out_dir, exist_ok=True)

    maps = map_names()
    print(f"{len(maps)} chunks -> {out_dir}")

    total = 0
    failed = []
    for i, name in enumerate(maps, 1):
        dest = os.path.join(out_dir, f"{name}.data")
        if os.path.exists(dest) and not args.force:
            size = os.path.getsize(dest)
            print(f"[{i}/{len(maps)}] {name}: already have it ({human(size)})")
            total += size
            continue

        url = f"{args.base_url.rstrip('/')}/{name}.data"
        print(f"[{i}/{len(maps)}] {name}")
        try:
            total += download(url, dest)
        except (urllib.error.URLError, OSError) as err:
            print(f"    FAILED: {err}")
            failed.append(name)

    print(f"\n{human(total)} in {out_dir}")
    if failed:
        print(f"could not fetch: {', '.join(failed)}")
        print("The game will still start, but those maps will not load.")
        return 1

    print("Serve it with:  python3 serve.py --dir " + args.dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
