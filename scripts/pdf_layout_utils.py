from __future__ import annotations

import json
from pathlib import Path

import fitz

MAX_DRAWINGS_FOR_LINE_BOX_SCAN = 1200
MAX_LINE_COORDINATES = 160


def write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def extract_text_from_block(block: dict) -> str:
    lines: list[str] = []
    for line in block.get("lines", []):
        spans = [span.get("text", "") for span in line.get("spans", [])]
        text = "".join(spans).strip()
        if text:
            lines.append(text)
    return "\n".join(lines).strip()


def _contains_bbox(outer: list[float], inner: list[float], padding: float = 2.0) -> bool:
    return (
        outer[0] - padding <= inner[0]
        and outer[1] - padding <= inner[1]
        and outer[2] + padding >= inner[2]
        and outer[3] + padding >= inner[3]
    )


def _build_bbox_metrics(bbox: list[float], page_width: float) -> dict:
    width = round(bbox[2] - bbox[0], 2)
    height = round(bbox[3] - bbox[1], 2)
    center_x = round((bbox[0] + bbox[2]) / 2, 2)
    center_y = round((bbox[1] + bbox[3]) / 2, 2)
    alignment = "center" if abs(center_x - (page_width / 2)) <= page_width * 0.08 else "left"
    return {
        "width": width,
        "height": height,
        "centerX": center_x,
        "centerY": center_y,
        "alignmentHint": alignment,
    }


def _normalize_bbox(bbox: list[float]) -> tuple[float, float, float, float]:
    return tuple(round(value, 1) for value in bbox)


def _similar_bbox(left: list[float], right: list[float], tolerance: float = 2.5) -> bool:
    return all(abs(a - b) <= tolerance for a, b in zip(left, right))


def _build_line_box_shapes(drawings: list[dict], page_index: int, page_width: float) -> list[dict]:
    if len(drawings) > MAX_DRAWINGS_FOR_LINE_BOX_SCAN:
        return []

    grouped: dict[tuple[float, float, float, float], dict] = {}
    for drawing in drawings:
        rect = drawing.get("rect")
        if rect is None:
            continue
        bbox = [round(rect.x0, 2), round(rect.y0, 2), round(rect.x1, 2), round(rect.y1, 2)]
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        is_line = width <= 2 or height <= 2
        if not is_line:
            continue
        items = drawing.get("items", [])
        if not items or not all(item and item[0] == "l" for item in items):
            continue
        for item in items:
            _tag, p1, p2 = item
            line_bbox = [round(min(p1.x, p2.x), 2), round(min(p1.y, p2.y), 2), round(max(p1.x, p2.x), 2), round(max(p1.y, p2.y), 2)]
            key = _normalize_bbox(line_bbox)
            grouped[key] = {"bbox": line_bbox}

    if len(grouped) < 4:
        return []

    vertical_lines = [entry["bbox"] for entry in grouped.values() if entry["bbox"][2] - entry["bbox"][0] <= 2]
    horizontal_lines = [entry["bbox"] for entry in grouped.values() if entry["bbox"][3] - entry["bbox"][1] <= 2]
    xs = sorted({line[0] for line in vertical_lines} | {line[2] for line in vertical_lines})
    ys = sorted({line[1] for line in horizontal_lines} | {line[3] for line in horizontal_lines})

    if len(xs) > MAX_LINE_COORDINATES or len(ys) > MAX_LINE_COORDINATES:
        return []

    shapes: list[dict] = []
    shape_index = 1
    for left in xs:
        for right in xs:
            if right - left < 40:
                continue
            for top in ys:
                for bottom in ys:
                    if bottom - top < 20:
                        continue
                    has_left = any(abs(line[0] - left) <= 2 and abs(line[1] - top) <= 3 and abs(line[3] - bottom) <= 3 for line in vertical_lines)
                    has_right = any(abs(line[0] - right) <= 2 and abs(line[1] - top) <= 3 and abs(line[3] - bottom) <= 3 for line in vertical_lines)
                    has_top = any(abs(line[1] - top) <= 2 and abs(line[0] - left) <= 3 and abs(line[2] - right) <= 3 for line in horizontal_lines)
                    has_bottom = any(abs(line[1] - bottom) <= 2 and abs(line[0] - left) <= 3 and abs(line[2] - right) <= 3 for line in horizontal_lines)
                    if not (has_left and has_right and has_top and has_bottom):
                        continue
                    bbox = [round(left, 2), round(top, 2), round(right, 2), round(bottom, 2)]
                    if any(_similar_bbox(existing["bbox"], bbox) for existing in shapes):
                        continue
                    shapes.append({
                        "blockId": f"p{page_index}_s{shape_index}",
                        "type": "shape",
                        "shapeType": "box",
                        "bbox": bbox,
                        "preview": "",
                        "containerIds": [],
                        "containedBlockIds": [],
                        **_build_bbox_metrics(bbox, page_width),
                    })
                    shape_index += 1
    return shapes


def _collect_shape_blocks(page: fitz.Page, page_index: int) -> list[dict]:
    drawings = page.get_drawings()
    page_width = float(page.rect.width)
    shapes = _build_line_box_shapes(drawings, page_index, page_width)
    if shapes:
        return shapes

    shapes = []
    for shape_index, drawing in enumerate(drawings, start=1):
        rect = drawing.get("rect")
        if rect is None:
            continue
        bbox = [round(rect.x0, 2), round(rect.y0, 2), round(rect.x1, 2), round(rect.y1, 2)]
        if bbox[2] - bbox[0] < 8 or bbox[3] - bbox[1] < 8:
            continue
        shapes.append({
            "blockId": f"p{page_index}_s{shape_index}",
            "type": "shape",
            "shapeType": "box",
            "bbox": bbox,
            "preview": "",
            "containerIds": [],
            "containedBlockIds": [],
            **_build_bbox_metrics(bbox, page_width),
        })
    return shapes


def collect_layout_payload(doc: fitz.Document) -> dict:
    pages: list[dict] = []
    total_blocks = 0
    total_shapes = 0
    total_boxed_blocks = 0
    for page_index, page in enumerate(doc, start=1):
        blocks: list[dict] = []
        page_width = float(page.rect.width)
        page_height = float(page.rect.height)
        shape_blocks = _collect_shape_blocks(page, page_index)
        for block_index, block in enumerate(page.get_text("dict").get("blocks", []), start=1):
            block_type = "text" if block.get("type") == 0 else "image" if block.get("type") == 1 else "other"
            bbox = [round(value, 2) for value in block.get("bbox", (0, 0, 0, 0))]
            preview = extract_text_from_block(block)[:180] if block_type == "text" else ""
            container_ids = [shape["blockId"] for shape in shape_blocks if _contains_bbox(shape["bbox"], bbox)]
            if container_ids:
                total_boxed_blocks += 1
            blocks.append({
                "blockId": f"p{page_index}_b{block_index}",
                "type": block_type,
                "bbox": bbox,
                "preview": preview,
                "containerIds": container_ids,
                "sourceOrder": block_index,
                "readingOrder": block_index,
                "textLength": len(preview),
                **_build_bbox_metrics(bbox, page_width),
            })
        for shape in shape_blocks:
            shape["containedBlockIds"] = [block["blockId"] for block in blocks if shape["blockId"] in block["containerIds"]]
        page_blocks = [*shape_blocks, *blocks]
        total_shapes += len(shape_blocks)
        total_blocks += len(page_blocks)
        pages.append({
            "page": page_index,
            "pageWidth": round(page_width, 2),
            "pageHeight": round(page_height, 2),
            "blockCount": len(page_blocks),
            "shapeCount": len(shape_blocks),
            "boxedBlockCount": sum(1 for block in blocks if block["containerIds"]),
            "blocks": page_blocks,
        })
    return {
        "summary": f"Collected {total_blocks} layout blocks",
        "totalBlocks": total_blocks,
        "totalShapes": total_shapes,
        "totalBoxedBlocks": total_boxed_blocks,
        "pages": pages,
    }
