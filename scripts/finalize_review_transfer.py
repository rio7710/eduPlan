from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path


IMAGE_REF_PATTERN = re.compile(r"^\[이미지\s+\d+:\s+(.+)\]\s*$")
PAGE_HEADER_PATTERN = re.compile(r"^#\s+Page\s+(\d+)\s*$", re.IGNORECASE)
SOURCE_LINE_PATTERN = re.compile(r"^>\s*source:\s*(.+)\s*$", re.IGNORECASE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Move review artifacts to central storage while keeping used images local.")
    parser.add_argument("--markdown", required=True, help="Merged markdown path")
    parser.add_argument("--image-dir", required=True, help="Local image directory")
    parser.add_argument("--review-dir", required=True, help="Local review directory")
    parser.add_argument("--central-dir", required=True, help="Central ml dataset root")
    parser.add_argument("--run-name", required=True, help="Stable run folder name")
    return parser.parse_args()


def unique_dir(base: Path) -> Path:
    if not base.exists():
        return base

    index = 1
    while True:
        candidate = base.parent / f"{base.name}_{index}"
        if not candidate.exists():
            return candidate
        index += 1


def parse_markdown_image_refs(markdown_path: Path) -> set[str]:
    text = markdown_path.read_text(encoding="utf-8", errors="ignore")
    refs: set[str] = set()
    for line in text.splitlines():
        match = IMAGE_REF_PATTERN.match(line.strip())
        if not match:
            continue
        relative = match.group(1).strip().replace("\\", "/")
        if relative.startswith("./"):
            relative = relative[2:]
        refs.add(relative)
    return refs


def get_approved_image_names(review_dir: Path) -> set[str]:
    approved_dir = review_dir / "approved_delete"
    if not approved_dir.is_dir():
        return set()
    return {path.name for path in approved_dir.iterdir() if path.is_file()}


def trim_blank_edges(lines: list[str]) -> list[str]:
    start = 0
    end = len(lines)
    while start < end and not lines[start].strip():
        start += 1
    while end > start and not lines[end - 1].strip():
        end -= 1
    return lines[start:end]


def compress_page_metadata(entries: list[tuple[str, str]]) -> list[str]:
    if not entries:
        return []

    compressed: list[str] = []
    range_start = entries[0][0]
    range_end = entries[0][0]
    current_source = entries[0][1]

    for page_number, source_value in entries[1:]:
        try:
            prev_num = int(range_end)
            next_num = int(page_number)
        except ValueError:
            prev_num = None
            next_num = None

        is_contiguous = prev_num is not None and next_num is not None and next_num == prev_num + 1
        if source_value == current_source and is_contiguous:
            range_end = page_number
            continue

        page_label = f"Page {range_start}" if range_start == range_end else f"Page {range_start}-{range_end}"
        compressed.append(f"- {page_label} | source: {current_source or 'unknown'}")
        range_start = page_number
        range_end = page_number
        current_source = source_value

    page_label = f"Page {range_start}" if range_start == range_end else f"Page {range_start}-{range_end}"
    compressed.append(f"- {page_label} | source: {current_source or 'unknown'}")
    return compressed


def rewrite_markdown(markdown_path: Path, review_dir: Path) -> dict[str, int]:
    approved_image_names = get_approved_image_names(review_dir)
    original_lines = markdown_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    body_lines: list[str] = []
    page_metadata_entries: list[tuple[str, str]] = []
    document_sources: list[str] = []
    removed_image_refs = 0
    removed_page_meta = 0

    line_index = 0
    while line_index < len(original_lines):
        raw_line = original_lines[line_index]
        stripped = raw_line.strip()

        page_match = PAGE_HEADER_PATTERN.match(stripped)
        if page_match:
            page_number = page_match.group(1)
            source_value = ""
            lookahead = line_index + 1
            while lookahead < len(original_lines) and not original_lines[lookahead].strip():
                lookahead += 1
            if lookahead < len(original_lines):
                source_match = SOURCE_LINE_PATTERN.match(original_lines[lookahead].strip())
                if source_match:
                    source_value = source_match.group(1).strip()
                    line_index = lookahead
            page_metadata_entries.append((page_number, source_value or 'unknown'))
            removed_page_meta += 1
            line_index += 1
            continue

        source_match = SOURCE_LINE_PATTERN.match(stripped)
        if source_match:
            document_sources.append(source_match.group(1).strip())
            removed_page_meta += 1
            line_index += 1
            continue

        image_match = IMAGE_REF_PATTERN.match(stripped)
        if image_match:
            relative_path = image_match.group(1).strip().replace("\\", "/")
            image_name = Path(relative_path).name
            if image_name in approved_image_names:
                removed_image_refs += 1
                line_index += 1
                continue

        body_lines.append(raw_line)
        line_index += 1

    cleaned_body_lines: list[str] = []
    previous_blank = False
    for line in trim_blank_edges(body_lines):
        is_blank = not line.strip()
        if is_blank and previous_blank:
            continue
        cleaned_body_lines.append(line)
        previous_blank = is_blank

    report_lines = ["---", "", "## Report"]
    if document_sources:
        unique_sources = list(dict.fromkeys(document_sources))
        report_lines.append(f"- source_pdf: {unique_sources[0]}")
    report_lines.append(f"- removed_logo_image_refs: {removed_image_refs}")
    report_lines.append(f"- removed_page_meta_lines: {removed_page_meta}")
    page_metadata = compress_page_metadata(page_metadata_entries)
    if page_metadata:
        report_lines.append("- page_metadata:")
        report_lines.extend([f"  {entry}" for entry in page_metadata])

    final_lines = trim_blank_edges(cleaned_body_lines)
    if final_lines:
        final_lines.extend([""])
    final_lines.extend(report_lines)
    markdown_path.write_text("\n".join(final_lines) + "\n", encoding="utf-8")
    return {
        "removed_image_refs": removed_image_refs,
        "removed_page_meta_lines": removed_page_meta,
        "page_metadata_count": len(page_metadata),
    }


def move_tree_contents(source_dir: Path, target_dir: Path) -> int:
    if not source_dir.is_dir():
        return 0

    target_dir.mkdir(parents=True, exist_ok=True)
    moved = 0
    for entry in source_dir.iterdir():
        if entry.is_dir():
            destination_dir = target_dir / entry.name
            if destination_dir.exists():
                destination_dir = unique_dir(destination_dir)
            destination_dir.mkdir(parents=True, exist_ok=True)
            moved += move_tree_contents(entry, destination_dir)
            continue

        destination = target_dir / entry.name
        if destination.exists():
            index = 1
            while destination.exists():
                destination = target_dir / f"{entry.stem}_{index}{entry.suffix}"
                index += 1
        shutil.move(str(entry), str(destination))
        moved += 1

    try:
        source_dir.rmdir()
    except OSError:
        pass
    return moved


def append_lines(target_path: Path, lines: list[str], with_header: str | None = None) -> int:
    if not lines and with_header is None:
        return 0

    target_path.parent.mkdir(parents=True, exist_ok=True)
    existing = target_path.exists()
    written = 0
    with target_path.open("a", encoding="utf-8", newline="\n") as target_file:
        if with_header is not None and not existing:
            target_file.write(f"{with_header}\n")
        for line in lines:
            if not line.strip():
                continue
            target_file.write(f"{line.rstrip()}\n")
            written += 1
    return written


def merge_local_ml_dataset(review_dir: Path, central_dir: Path) -> dict[str, int]:
    local_dataset_dir = review_dir / "ml_dataset"
    local_images_dir = local_dataset_dir / "images"
    local_labels_path = local_dataset_dir / "labels.jsonl"
    local_features_path = local_dataset_dir / "train_features.csv"

    central_images_dir = central_dir / "images"
    central_manifests_dir = central_dir / "manifests"
    central_labels_path = central_manifests_dir / "labels.jsonl"
    central_features_path = central_manifests_dir / "train_features.csv"

    copied_images = 0
    if local_images_dir.is_dir():
        central_images_dir.mkdir(parents=True, exist_ok=True)
        for image_path in local_images_dir.iterdir():
            if not image_path.is_file():
                continue
            destination = central_images_dir / image_path.name
            if destination.exists():
                continue
            shutil.copy2(image_path, destination)
            copied_images += 1

    label_lines: list[str] = []
    if local_labels_path.is_file():
        for raw_line in local_labels_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if not raw_line.strip():
                continue
            try:
                payload = json.loads(raw_line)
            except json.JSONDecodeError:
                continue
            image_name = Path(str(payload.get("image_path", ""))).name
            if image_name:
                payload["image_path"] = f"images/{image_name}"
            label_lines.append(json.dumps(payload, ensure_ascii=False))

    feature_header = "image_id,width,height,area,repeat_count,size_bytes,label,source_pdf_name,group_id"
    feature_lines: list[str] = []
    if local_features_path.is_file():
        raw_feature_lines = local_features_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        feature_lines = [line for index, line in enumerate(raw_feature_lines) if index > 0 and line.strip()]

    written_labels = append_lines(central_labels_path, label_lines)
    written_features = append_lines(central_features_path, feature_lines, with_header=feature_header)
    return {
        "copied_dataset_images": copied_images,
        "written_labels": written_labels,
        "written_features": written_features,
    }


def copy_used_images(image_dir: Path, target_dir: Path, used_relative_paths: set[str]) -> int:
    target_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    for relative in sorted(used_relative_paths):
        source = (image_dir.parent / relative).resolve()
        if not source.is_file():
            continue
        destination = target_dir / source.name
        if not destination.exists():
            shutil.copy2(source, destination)
            copied += 1
    return copied


def move_unused_images(image_dir: Path, target_dir: Path, used_relative_paths: set[str]) -> int:
    if not image_dir.is_dir():
        return 0

    target_dir.mkdir(parents=True, exist_ok=True)
    used_names = {Path(relative).name for relative in used_relative_paths}
    moved = 0
    for image_path in image_dir.iterdir():
        if not image_path.is_file():
            continue
        if image_path.name in used_names:
            continue

        destination = target_dir / image_path.name
        if destination.exists():
            index = 1
            while destination.exists():
                destination = target_dir / f"{image_path.stem}_{index}{image_path.suffix}"
                index += 1
        shutil.move(str(image_path), str(destination))
        moved += 1
    return moved


def main() -> None:
    args = parse_args()
    markdown_path = Path(args.markdown)
    image_dir = Path(args.image_dir)
    review_dir = Path(args.review_dir)
    central_dir = Path(args.central_dir)
    run_dir = unique_dir(central_dir / "runs" / args.run_name)
    run_dir.mkdir(parents=True, exist_ok=True)

    markdown_report = rewrite_markdown(markdown_path, review_dir)
    used_relative_paths = parse_markdown_image_refs(markdown_path)
    merged_dataset = merge_local_ml_dataset(review_dir, central_dir)
    copied_used = copy_used_images(image_dir, run_dir / "used_images", used_relative_paths)
    moved_unused = move_unused_images(image_dir, run_dir / "unused_images", used_relative_paths)
    moved_review_entries = move_tree_contents(review_dir, run_dir / "review")

    summary = {
        "markdown_path": str(markdown_path),
        "image_dir": str(image_dir),
        "review_dir": str(review_dir),
        "central_run_dir": str(run_dir),
        "used_image_count": len(used_relative_paths),
        "copied_used_images": copied_used,
        "moved_unused_images": moved_unused,
        "moved_review_entries": moved_review_entries,
        **markdown_report,
        **merged_dataset,
    }
    (run_dir / "transfer_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
