from __future__ import annotations

import argparse
import hashlib
import shutil
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


@dataclass
class ImageInfo:
    path: Path
    sha256: str
    width: int
    height: int

    @property
    def area(self) -> int:
        return self.width * self.height


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def collect_images(image_dir: Path) -> list[ImageInfo]:
    infos: list[ImageInfo] = []
    for path in sorted(p for p in image_dir.iterdir() if p.suffix.lower() in IMAGE_EXTS):
        with Image.open(path) as img:
            width, height = img.size
        infos.append(ImageInfo(path=path, sha256=sha256_file(path), width=width, height=height))
    return infos


def is_logo_candidate(group: list[ImageInfo], min_repeat: int, max_width: int, max_height: int, max_area: int) -> bool:
    if len(group) < min_repeat:
        return False
    sample = group[0]
    return sample.width <= max_width and sample.height <= max_height and sample.area <= max_area


def write_report(
    report_path: Path,
    image_dir: Path,
    kept: list[ImageInfo],
    removed_groups: list[list[ImageInfo]],
    min_repeat: int,
    max_width: int,
    max_height: int,
    max_area: int,
) -> None:
    lines = [
        "# Logo Removal Test Report",
        "",
        f"- source_image_dir: {image_dir}",
        f"- total_images: {len(kept) + sum(len(g) for g in removed_groups)}",
        f"- kept_images: {len(kept)}",
        f"- removed_images: {sum(len(g) for g in removed_groups)}",
        "",
        "## Rule",
        "",
        f"- exact duplicate repeat >= {min_repeat}",
        f"- width <= {max_width}",
        f"- height <= {max_height}",
        f"- area <= {max_area}",
        "",
        "## Removed Groups",
        "",
    ]

    if not removed_groups:
        lines.append("- none")
    else:
        for idx, group in enumerate(removed_groups, start=1):
            sample = group[0]
            lines.append(f"### Group {idx}")
            lines.append(f"- repeat_count: {len(group)}")
            lines.append(f"- size: {sample.width}x{sample.height}")
            lines.append(f"- sha256: {sample.sha256}")
            lines.append("- files:")
            for item in group:
                lines.append(f"  - {item.path.name}")
            lines.append("")

    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Filter repeated logo-like images into a logo_del folder.")
    parser.add_argument("image_dir", type=Path, help="Input image directory")
    parser.add_argument("-o", "--output-dir", type=Path, required=True, help="Output base directory")
    parser.add_argument("--min-repeat", type=int, default=3, help="Minimum exact repeat count")
    parser.add_argument("--max-width", type=int, default=500, help="Maximum width for logo candidate")
    parser.add_argument("--max-height", type=int, default=150, help="Maximum height for logo candidate")
    parser.add_argument("--max-area", type=int, default=100000, help="Maximum pixel area for logo candidate")
    args = parser.parse_args()

    image_dir = args.image_dir.resolve()
    output_dir = args.output_dir.resolve()
    kept_dir = output_dir / "kept"
    removed_dir = output_dir / "removed_logo_candidates"
    kept_dir.mkdir(parents=True, exist_ok=True)
    removed_dir.mkdir(parents=True, exist_ok=True)

    infos = collect_images(image_dir)
    grouped: dict[str, list[ImageInfo]] = defaultdict(list)
    for info in infos:
        grouped[info.sha256].append(info)

    removed_groups: list[list[ImageInfo]] = []
    kept: list[ImageInfo] = []

    for group in grouped.values():
        if is_logo_candidate(
            group,
            min_repeat=args.min_repeat,
            max_width=args.max_width,
            max_height=args.max_height,
            max_area=args.max_area,
        ):
            removed_groups.append(group)
            for info in group:
                shutil.copy2(info.path, removed_dir / info.path.name)
        else:
            kept.extend(group)
            for info in group:
                shutil.copy2(info.path, kept_dir / info.path.name)

    removed_groups.sort(key=len, reverse=True)
    kept.sort(key=lambda x: x.path.name)
    write_report(
        output_dir / "report.md",
        image_dir=image_dir,
        kept=kept,
        removed_groups=removed_groups,
        min_repeat=args.min_repeat,
        max_width=args.max_width,
        max_height=args.max_height,
        max_area=args.max_area,
    )

    print(f"written: {output_dir}")
    print(f"kept_images={len(kept)}")
    print(f"removed_images={sum(len(g) for g in removed_groups)}")


if __name__ == "__main__":
    main()
