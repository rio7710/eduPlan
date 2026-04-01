from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz
from pdf_coverage_utils import build_coverage_report
from pdf_layout_utils import collect_layout_payload
from pdf_markdown_utils import CHUNK_DIR_NAME, LAYOUT_STAGE_PREFIX, MD_STAGE_PREFIX, extract_page_markdown, save_page_images, write_chunk_markdown, write_layout_json, write_merged_markdown
from pdf_report_utils import write_report_files

CHUNK_PAGE_SIZE = 10


def emit_progress(stage: str, current: int, total: int, message: str) -> None:
    print(json.dumps({
        "type": "progress",
        "stage": stage,
        "current": current,
        "total": total,
        "message": message,
    }, ensure_ascii=True), flush=True)


def resolve_pdf_inputs(inputs: list[Path]) -> list[Path]:
    pdf_files: list[Path] = []

    for input_path in inputs:
        resolved = input_path.resolve()
        if resolved.is_dir():
            pdf_files.extend(sorted(resolved.glob("*.pdf")))
        elif resolved.exists() and resolved.suffix.lower() == ".pdf":
            pdf_files.append(resolved)

    unique_files: list[Path] = []
    seen: set[Path] = set()
    for pdf_file in pdf_files:
        if pdf_file not in seen:
            seen.add(pdf_file)
            unique_files.append(pdf_file)

    return unique_files


def convert_pdf_to_markdown_pages(
    pdf_path: Path, output_dir: Path, extract_images: bool, write_page_files: bool
) -> tuple[int, int]:
    output_dir.mkdir(parents=True, exist_ok=True)
    markdown_dir = output_dir / "md"
    markdown_dir.mkdir(parents=True, exist_ok=True)
    image_dir = output_dir / "img"
    report_dir = output_dir / "report"
    page_docs: list[str] = []
    chunk_docs: list[str] = []
    chunk_paths: list[Path] = []
    page_summaries: list[dict] = []
    total_images = 0

    with fitz.open(pdf_path) as doc:
        total_pages = len(doc)
        emit_progress("prepare", 0, total_pages, f"open {pdf_path.name}")
        emit_progress("layout", 0, total_pages, "collect layout")
        layout_payload = collect_layout_payload(doc)
        emit_progress("layout", 0, total_pages, "layout ready")
        for index, page in enumerate(doc, start=1):
            image_labels = save_page_images(doc, page, image_dir, pdf_path.stem) if extract_images else []
            total_images += sum(1 for name in image_labels if name)
            markdown = extract_page_markdown(page, image_labels)
            page_docs.append(markdown)
            chunk_docs.append(markdown)
            page_text = page.get_text("text").strip()
            page_summaries.append({"page": index, "isEmpty": len(page_text) == 0, "charCount": len(page_text)})
            if write_page_files:
                output_path = markdown_dir / f"{MD_STAGE_PREFIX}_{pdf_path.stem}_{index:03d}.md"
                output_path.write_text(markdown, encoding="utf-8")
                print(f"written: {output_path}")
            if len(chunk_docs) == CHUNK_PAGE_SIZE or index == total_pages:
                start_page = index - len(chunk_docs) + 1
                chunk_index = len(chunk_paths) + 1
                chunk_paths.append(write_chunk_markdown(output_dir, pdf_path.stem, chunk_index, start_page, index, chunk_docs))
                emit_progress("page", index, total_pages, f"pages {start_page}-{index} done")
                chunk_docs = []

    emit_progress("merge", total_pages, total_pages, "merge chunks")
    write_merged_markdown(output_dir, pdf_path.stem, chunk_paths)
    write_layout_json(output_dir, pdf_path.stem, layout_payload)
    coverage = build_coverage_report(layout_payload, page_docs)
    warnings = ["empty text page detected"] if any(page["isEmpty"] for page in page_summaries) else []
    if coverage["missingTextBlocks"] > 0:
        warnings.append("layout text block missing from markdown")
    report_prefix = f"s03_{pdf_path.stem}"
    report_files = write_report_files(report_dir, report_prefix, {
        "title": "PDF Conversion Report",
        "source": pdf_path.name,
        "status": "warning" if warnings else "ok",
        "pageCount": total_pages,
        "summary": "Basic extraction completed for markdown, images, and layout.",
        "warnings": warnings,
        "metrics": {
            "textPages": len(page_summaries),
            "emptyTextPages": sum(1 for page in page_summaries if page["isEmpty"]),
            "totalImages": total_images,
            "totalBlocks": int(layout_payload.get("totalBlocks", 0)),
            "totalShapes": int(layout_payload.get("totalShapes", 0)),
            "totalBoxedBlocks": int(layout_payload.get("totalBoxedBlocks", 0)),
        },
        "coverage": coverage,
        "artifacts": [
            f"md/{MD_STAGE_PREFIX}_{pdf_path.stem}.md",
            f"md/{CHUNK_DIR_NAME}",
            "img",
            f"layout/{LAYOUT_STAGE_PREFIX}_{pdf_path.stem}_layout.json",
            f"report/{report_prefix}_report.json",
            f"report/{report_prefix}_report.md",
        ],
    })
    for report_file in report_files:
        print(f"written: {report_dir / report_file}")
    emit_progress("done", total_pages, total_pages, "conversion complete")
    return total_pages, len(page_docs)


def print_summary(results: list[tuple[str, int, int]]) -> None:
    print("\nsummary:")
    for pdf_name, total_pages, merged_pages in results:
        status = "OK" if total_pages == merged_pages else "MISMATCH"
        print(f"{status} | {pdf_name} | total={total_pages} merged={merged_pages}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert each PDF page into a separate Markdown file."
    )
    parser.add_argument("pdf", nargs="+", type=Path, help="Input PDF path or folder")
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        help="Output directory. Defaults to ./mldoc/<pdf-name>/ or ./mldoc for batch mode.",
    )
    parser.add_argument(
        "--extract-images",
        action="store_true",
        help="Extract images into an image/ folder and link them in Markdown labels.",
    )
    parser.add_argument(
        "--merged-only",
        action="store_true",
        help="Only create the merged Markdown file, not per-page Markdown files.",
    )
    args = parser.parse_args()

    pdf_files = resolve_pdf_inputs(args.pdf)
    if not pdf_files:
        raise FileNotFoundError("No PDF files found in the given input.")

    base_output_dir = args.output_dir.resolve() if args.output_dir else Path.cwd() / "mldoc"
    results: list[tuple[str, int, int]] = []

    for pdf_path in pdf_files:
        output_dir = base_output_dir / pdf_path.stem if len(pdf_files) > 1 else (
            base_output_dir if args.output_dir else base_output_dir / pdf_path.stem
        )
        total_pages, merged_pages = convert_pdf_to_markdown_pages(
            pdf_path,
            output_dir.resolve(),
            args.extract_images,
            write_page_files=not args.merged_only,
        )
        results.append((pdf_path.name, total_pages, merged_pages))

    print_summary(results)


if __name__ == "__main__":
    main()
