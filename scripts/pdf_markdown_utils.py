from __future__ import annotations

from pathlib import Path

import fitz

from pdf_layout_utils import extract_text_from_block, write_json

MD_STAGE_PREFIX = "s01"
LAYOUT_STAGE_PREFIX = "s02"
CHUNK_DIR_NAME = "_chunks"


def _should_keep_image(page_number: int, image_index: int, width: int, height: int) -> bool:
    if page_number == 1 and image_index == 1:
        return True
    if width <= 0 or height <= 0:
        return False
    area = width * height
    aspect = width / max(1, height)
    if width < 48 or height < 48:
        return False
    if area < 5_000:
        return False
    if aspect > 24.0 or aspect < 0.04:
        return False
    return True


def _sorted_page_blocks(page: fitz.Page) -> list[dict]:
    return sorted(
        page.get_text("dict").get("blocks", []),
        key=lambda block: (
            round(float(block.get("bbox", (0, 0, 0, 0))[1]), 1),
            round(float(block.get("bbox", (0, 0, 0, 0))[0]), 1),
        ),
    )


def _is_image_label_part(value: str) -> bool:
    stripped = value.strip()
    return stripped.startswith("[이미지 ") and stripped.endswith("]")


def _is_source_part(value: str) -> bool:
    return value.strip().startswith("출처 :")


def _normalize_part_order(parts: list[str]) -> list[str]:
    normalized = list(parts)
    for index in range(1, len(normalized)):
        if _is_source_part(normalized[index]) and _is_image_label_part(normalized[index - 1]):
            normalized[index - 1], normalized[index] = normalized[index], normalized[index - 1]
    return normalized


def save_page_images(doc: fitz.Document, page: fitz.Page, image_dir: Path, pdf_stem: str) -> list[str | None]:
    del doc
    image_dir.mkdir(parents=True, exist_ok=True)
    saved_files: list[str | None] = []
    image_index = 0
    for block in _sorted_page_blocks(page):
        if block.get("type") != 1:
            continue
        image_index += 1
        width = int(block.get("width", 0) or 0)
        height = int(block.get("height", 0) or 0)
        if not _should_keep_image(page.number + 1, image_index, width, height):
            saved_files.append(None)
            continue
        ext = str(block.get("ext", "png") or "png")
        image_bytes = block.get("image")
        if not isinstance(image_bytes, (bytes, bytearray)) or len(image_bytes) == 0:
            saved_files.append(None)
            continue
        filename = f"{MD_STAGE_PREFIX}_{pdf_stem}_{page.number + 1:03d}_{image_index:02d}.{ext}"
        (image_dir / filename).write_bytes(bytes(image_bytes))
        saved_files.append(filename)
    return saved_files


def extract_page_content(page: fitz.Page, image_labels: list[str | None] | None = None) -> str:
    parts: list[str] = []
    image_index = 0
    for block in _sorted_page_blocks(page):
        block_type = block.get("type")
        if block_type == 0:
            text = extract_text_from_block(block)
            if text:
                parts.append(text)
        elif block_type == 1:
            image_index += 1
            if image_labels and image_index <= len(image_labels):
                image_name = image_labels[image_index - 1]
                if image_name:
                    parts.append(f"[이미지 {image_index}: image/{image_name}]")
    content = "\n\n".join(_normalize_part_order(parts)).strip()
    return content or "[텍스트를 추출하지 못했습니다. 스캔 PDF라면 OCR이 필요합니다.]"


def extract_page_markdown(page: fitz.Page, image_labels: list[str | None] | None = None) -> str:
    content = extract_page_content(page, image_labels)
    return "\n".join([content, ""])


def build_merged_markdown(page_docs: list[str]) -> str:
    merged_parts: list[str] = []
    for index, page_doc in enumerate(page_docs):
        if index > 0:
            merged_parts.extend(["", "---", ""])
        merged_parts.append(page_doc)
    return "\n".join([*merged_parts, ""])


def write_chunk_markdown(output_dir: Path, pdf_stem: str, chunk_index: int, start_page: int, end_page: int, page_docs: list[str]) -> Path:
    chunk_dir = output_dir / "md" / CHUNK_DIR_NAME
    chunk_dir.mkdir(parents=True, exist_ok=True)
    chunk_path = chunk_dir / f"{MD_STAGE_PREFIX}_{pdf_stem}_chunk_{chunk_index:03d}_{start_page:03d}_{end_page:03d}.md"
    chunk_path.write_text(build_merged_markdown(page_docs), encoding="utf-8")
    print(f"written: {chunk_path}")
    return chunk_path


def write_merged_markdown(output_dir: Path, pdf_stem: str, chunk_paths: list[Path]) -> None:
    markdown_dir = output_dir / "md"
    markdown_dir.mkdir(parents=True, exist_ok=True)
    merged_path = markdown_dir / f"{MD_STAGE_PREFIX}_{pdf_stem}.md"
    merged_text = "\n\n---\n\n".join(path.read_text(encoding="utf-8").strip() for path in chunk_paths if path.is_file())
    merged_path.write_text(f"{merged_text}\n", encoding="utf-8")
    print(f"written: {merged_path}")


def write_layout_json(output_dir: Path, pdf_stem: str, payload: dict) -> None:
    layout_dir = output_dir / "layout"
    layout_dir.mkdir(parents=True, exist_ok=True)
    layout_path = layout_dir / f"{LAYOUT_STAGE_PREFIX}_{pdf_stem}_layout.json"
    write_json(layout_path, payload)
    print(f"written: {layout_path}")
