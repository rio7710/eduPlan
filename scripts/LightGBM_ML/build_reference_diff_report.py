from __future__ import annotations

import argparse
import json
from difflib import SequenceMatcher
from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from reference_page_alignment import align_reference_to_pages, split_markdown_pages


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a page-level diff report from raw markdown and a trusted text reference.")
    parser.add_argument("--raw-markdown", required=True, type=Path)
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--pdf-stem", required=True)
    return parser.parse_args()


def normalize_lines(lines: list[str]) -> list[str]:
    return [line.strip() for line in lines if line.strip()]


def build_page_entry(page_number: int, raw_page, ref_page, pdf_stem: str) -> dict:
    raw_lines = normalize_lines(raw_page.text_lines)
    ref_lines = normalize_lines(ref_page.text_lines)
    raw_text = "\n".join(raw_lines)
    ref_text = "\n".join(ref_lines)
    similarity = SequenceMatcher(None, raw_text[:5000], ref_text[:5000]).ratio() if raw_text or ref_text else 1.0
    changed = raw_text != ref_text
    image_paths = []
    for line in raw_page.image_lines:
        if "image/" in line:
            image_paths.append(line.split("image/", 1)[1].rstrip("]"))
    return {
        "page": page_number,
        "changed": changed,
        "similarity": round(similarity, 4),
        "rawLineCount": len(raw_lines),
        "referenceLineCount": len(ref_lines),
        "rawPreview": raw_lines[:3],
        "referencePreview": ref_lines[:3],
        "imagePaths": image_paths,
        "pageImagePrefix": f"s01_{pdf_stem}_{page_number:03d}_",
    }


def main() -> None:
    args = parse_args()
    raw_markdown = args.raw_markdown.resolve()
    reference_path = args.reference.resolve()
    output_path = args.output.resolve()

    if not raw_markdown.is_file():
      raise FileNotFoundError(f"Raw markdown not found: {raw_markdown}")
    if not reference_path.is_file():
      raise FileNotFoundError(f"Reference text not found: {reference_path}")

    raw_text = raw_markdown.read_text(encoding="utf-8", errors="ignore")
    reference_text = reference_path.read_text(encoding="utf-8", errors="ignore")
    aligned_text, _ = align_reference_to_pages(raw_text, reference_text)

    raw_pages = split_markdown_pages(raw_text)
    ref_pages = split_markdown_pages(aligned_text)
    page_count = min(len(raw_pages), len(ref_pages))
    pages = [
        build_page_entry(index + 1, raw_pages[index], ref_pages[index], args.pdf_stem)
        for index in range(page_count)
    ]
    changed_pages = [page for page in pages if page["changed"]]
    summary = {
        "ok": True,
        "pageCount": page_count,
        "changedPages": len(changed_pages),
        "unchangedPages": page_count - len(changed_pages),
        "avgSimilarity": round(sum(page["similarity"] for page in pages) / page_count, 4) if page_count else 1.0,
        "pages": pages,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "outputPath": str(output_path), **summary}, ensure_ascii=True))


if __name__ == "__main__":
    main()
