#!/usr/bin/env python3
"""Generate PWA icon PNGs (stdlib only). Run from repo root."""
import struct
import zlib
from pathlib import Path

ICONS_DIR = Path(__file__).resolve().parent.parent / "static" / "icons"
BG = (244, 241, 236)
CENTER = (91, 124, 138)
EDGE = (74, 101, 114)


def _chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def write_icon(path: Path, size: int) -> None:
    raw = bytearray()
    cx = cy = (size - 1) / 2
    radius = size * 0.38
    for y in range(size):
        raw.append(0)
        for x in range(size):
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if dist <= radius:
                raw.extend(CENTER)
            elif dist <= radius + 2:
                raw.extend(EDGE)
            else:
                raw.extend(BG)

    compressed = zlib.compress(bytes(raw), 9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += _chunk(b"IHDR", ihdr)
    png += _chunk(b"IDAT", compressed)
    png += _chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def main() -> None:
    for size in (192, 512):
        write_icon(ICONS_DIR / f"icon-{size}.png", size)
    print(f"Wrote icons to {ICONS_DIR}")


if __name__ == "__main__":
    main()
