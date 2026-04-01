from __future__ import annotations

import json
from pathlib import Path

import fitz

from pdf_layout_utils import write_json
from pdf_report_utils import write_report_files


def stage_dir(base_dir: Path, stage_name: str) -> Path:
    target = base_dir / stage_name
    target.mkdir(parents=True, exist_ok=True)
    return target


def build_output_dirs(output_dir: Path) -> dict[str, Path]:
    output_paths = {name: output_dir / name for name in ("md", "img", "layout", "report")}
    for target in output_paths.values():
        target.mkdir(parents=True, exist_ok=True)
    return {"root": output_dir, **output_paths}


def run_inspect(pdf_path: Path, output_dir: Path) -> dict:
    with fitz.open(pdf_path) as doc:
        pages = len(doc)
    result = {"stage": "inspect", "summary": f"{pages} pages detected", "pageCount": pages, "fileSizeBytes": pdf_path.stat().st_size, "artifacts": ["stage_00_inspect/inspect.json"]}
    write_json(stage_dir(output_dir, "stage_00_inspect") / "inspect.json", result)
    return result


def run_extract_text(pdf_path: Path, output_dir: Path) -> dict:
    output_paths = build_output_dirs(output_dir)
    page_summaries = []
    markdown_pages = []
    with fitz.open(pdf_path) as doc:
        for index, page in enumerate(doc, start=1):
            text = page.get_text("text").strip()
            page_summaries.append({"page": index, "charCount": len(text), "isEmpty": len(text) == 0, "preview": text[:240]})
            markdown_pages.append(f"# Page {index:03d}\n\n{text or '[텍스트 없음]'}\n")
    markdown_path = output_paths["md"] / f"{pdf_path.stem}_raw.md"
    markdown_path.write_text("\n---\n\n".join(markdown_pages), encoding="utf-8")
    result = {"stage": "extract_text", "summary": f"Extracted text from {len(page_summaries)} pages", "pages": page_summaries, "emptyPageCount": sum(1 for page in page_summaries if page["isEmpty"]), "artifacts": ["stage_01_text/text.json", f"md/{pdf_path.stem}_raw.md"]}
    write_json(stage_dir(output_dir, "stage_01_text") / "text.json", result)
    return result


def run_extract_images(pdf_path: Path, output_dir: Path) -> dict:
    output_paths = build_output_dirs(output_dir)
    page_summaries = []
    total = 0
    with fitz.open(pdf_path) as doc:
        for page_index, page in enumerate(doc, start=1):
            saved = []
            for image_index, img in enumerate(page.get_images(full=True), start=1):
                extracted = doc.extract_image(img[0])
                ext = extracted.get("ext", "png")
                file_name = f"{pdf_path.stem}_{page_index:03d}_{image_index:02d}.{ext}"
                (output_paths["img"] / file_name).write_bytes(extracted["image"])
                saved.append(file_name)
            total += len(saved)
            page_summaries.append({"page": page_index, "imageCount": len(saved), "images": saved})
    result = {"stage": "extract_images", "summary": f"Extracted {total} images", "pages": page_summaries, "totalImages": total, "artifacts": ["stage_02_images/images.json", "img"]}
    write_json(stage_dir(output_dir, "stage_02_images") / "images.json", result)
    return result


def run_validate(pdf_path: Path, output_dir: Path) -> dict:
    output_paths = build_output_dirs(output_dir)
    inspect = _read_json(output_dir / "stage_00_inspect" / "inspect.json")
    text = _read_json(output_dir / "stage_01_text" / "text.json")
    images = _read_json(output_dir / "stage_02_images" / "images.json")
    layout = _read_json(output_dir / "stage_03_layout" / "layout.json")
    warnings = _build_validation_warnings(inspect, text, layout)
    report_prefix = f"s04_{pdf_path.stem}"
    write_report_files(output_paths["report"], report_prefix, {
        "title": "PDF Validation Report",
        "source": pdf_path.name,
        "status": "warning" if warnings else "ok",
        "pageCount": int(inspect.get("pageCount", 0)),
        "summary": "Developer-stage validation completed for inspect, text, images, and layout.",
        "warnings": warnings,
        "metrics": {
            "textPages": len(text.get("pages", [])),
            "emptyTextPages": sum(1 for page in text.get("pages", []) if page.get("isEmpty")),
            "totalImages": int(images.get("totalImages", 0)),
            "totalBlocks": int(layout.get("totalBlocks", 0)),
            "totalShapes": int(layout.get("totalShapes", 0)),
            "totalBoxedBlocks": int(layout.get("totalBoxedBlocks", 0)),
        },
        "artifacts": ["stage_00_inspect/inspect.json", "stage_01_text/text.json", "stage_02_images/images.json", "stage_03_layout/layout.json", "md", "img", "layout", f"report/{report_prefix}_report.json", f"report/{report_prefix}_report.md"],
    })
    result = {"stage": "validate", "summary": "Validation completed" if not warnings else "Validation completed with warnings", "pageCount": int(inspect.get("pageCount", 0)), "warningCount": len(warnings), "warnings": warnings, "artifacts": ["stage_04_validate/validate.json", f"report/{report_prefix}_report.json", f"report/{report_prefix}_report.md"]}
    write_json(stage_dir(output_dir, "stage_04_validate") / "validate.json", result)
    return result


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _build_validation_warnings(inspect: dict, text: dict, layout: dict) -> list[str]:
    warnings: list[str] = []
    expected_pages = int(inspect.get("pageCount", 0))
    if expected_pages and len(text.get("pages", [])) != expected_pages:
        warnings.append("text page count mismatch")
    if expected_pages and len(layout.get("pages", [])) != expected_pages:
        warnings.append("layout page count mismatch")
    if any(page.get("isEmpty") for page in text.get("pages", [])):
        warnings.append("empty text page detected")
    return warnings
