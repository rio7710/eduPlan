from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path


FIXED_SECTION_LABELS = {
    "학습내용": "heading_2",
    "학습목표": "heading_2",
    "사전학습": "heading_2",
    "학습활동": "heading_2",
    "정리하기": "heading_2",
    "참고 자료": "heading_2",
    "참고자료": "heading_2",
}

NUMERIC_MAIN = re.compile(r"^\d+\.\s+.+$")
NUMERIC_SUB = re.compile(r"^\d+\.\d+\s+.+$")
NUMERIC_PAREN_MAIN = re.compile(r"^\d+\)\s*.+$")
NUMERIC_PAREN_SUB = re.compile(r"^\(\d+\)\s*.+$")
SYMBOL_TITLE = re.compile(r"^■\s*(.+)$")
SYMBOL_BULLET = re.compile(r"^▪\s*(.+)$")
BRACKET_SECTION = re.compile(r"^\[[^\[\]]{2,30}\]$")
LECTURE_HEADING = re.compile(r"^제\s*\d+\s*강(?:\s*[.:])?\s*.+$")
TABLE_CAPTION = re.compile(r"^<[^>]{2,80}>$")
CIRCLED_ITEM = re.compile(r"^[①-⑳]\s*.+$")
PAGE_NUMBER = re.compile(r"^\d+$")
PAGE_FRACTION = re.compile(r"^-\s*\d+\s*-$")
IMAGE_LINE = re.compile(r"^\[이미지\s+\d+:")
URL_LINE = re.compile(r"^https?://", re.IGNORECASE)
MARKDOWN_HEADING = re.compile(r"^(#{1,6})\s+(.+)$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze hierarchy candidates from markdown.")
    parser.add_argument("--markdown", required=True, help="Markdown file path")
    parser.add_argument("--line-start", type=int, default=1, help="Optional start line for scoped analysis")
    parser.add_argument("--line-end", type=int, default=0, help="Optional end line for scoped analysis")
    parser.add_argument("--focus-line", type=int, default=0, help="Optional active line to prioritize exact matches")
    return parser.parse_args()


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    args = parse_args()
    markdown_path = Path(args.markdown).resolve()
    lines = markdown_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    line_start = max(1, int(args.line_start or 1))
    line_end = int(args.line_end or 0)
    focus_line = int(args.focus_line or 0)
    scoped_end = line_end if line_end >= line_start else len(lines)
    content_lines: list[tuple[int, str]] = []

    for index, raw in enumerate(lines, start=1):
        if index < line_start or index > scoped_end:
            continue
        text = raw.strip()
        if not text or text == "---":
            continue
        if PAGE_NUMBER.match(text) or PAGE_FRACTION.match(text):
            continue
        if text.startswith("# Page") or text.startswith("> source:"):
            continue
        if text.startswith("## Report") or text.startswith("- source_pdf:") or text.startswith("- removed_") or text == "- page_metadata:":
            continue
        if text.startswith("  - Page "):
            continue
        if IMAGE_LINE.match(text) or URL_LINE.match(text):
            continue
        content_lines.append((index, text))

    items: list[dict] = []
    created_order = 1

    def infer_selected_recommendation(selected_lines: list[str]) -> tuple[str, str, str]:
        joined = " ".join(selected_lines).strip()
        first = selected_lines[0].strip() if selected_lines else ""
        heading_match = MARKDOWN_HEADING.match(first)
        if heading_match:
            return "fixed_section", f"heading_{len(heading_match.group(1))}", "선택 영역 직접 분석"
        if PAGE_NUMBER.match(first) or PAGE_FRACTION.match(first):
            return "fixed_section", "page_number_noise", "선택 영역 직접 분석"
        if LECTURE_HEADING.match(first):
            return "fixed_section", "heading_1", "선택 영역 직접 분석"
        if BRACKET_SECTION.match(first):
            return "fixed_section", "heading_2", "선택 영역 직접 분석"
        if NUMERIC_SUB.match(first):
            return "numeric_heading", "heading_3", "선택 영역 직접 분석"
        if NUMERIC_MAIN.match(first):
            return "numeric_heading", "heading_2", "선택 영역 직접 분석"
        if NUMERIC_PAREN_SUB.match(first):
            return "numeric_heading", "heading_4", "선택 영역 직접 분석"
        if NUMERIC_PAREN_MAIN.match(first):
            return "numeric_heading", "heading_3", "선택 영역 직접 분석"
        if SYMBOL_TITLE.match(first) or TABLE_CAPTION.match(first):
            return "symbol_heading", "heading_4", "선택 영역 직접 분석"
        if SYMBOL_BULLET.match(first) or CIRCLED_ITEM.match(first):
            return "symbol_heading", "bullet_1", "선택 영역 직접 분석"
        if len(joined) >= 40:
            return "fixed_section", "meta_noise", "선택 영역 직접 분석"
        return "fixed_section", "heading_2", "선택 영역 직접 분석"

    def focus_matches(matches: list[tuple[int, str]]) -> list[tuple[int, str]]:
        if focus_line <= 0:
            return matches
        exact = [(line_no, text) for line_no, text in matches if line_no == focus_line]
        if exact:
            return exact
        nearby = [(line_no, text) for line_no, text in matches if abs(line_no - focus_line) <= 2]
        return nearby or matches

    def add_item(pattern_kind: str, candidate_text: str, recommendation_label: str, matches: list[tuple[int, str]]) -> None:
        nonlocal created_order
        prioritized_matches = focus_matches(matches)
        if not prioritized_matches:
            return
        candidate_preview = prioritized_matches[0][1] if focus_line > 0 else candidate_text
        items.append({
            "id": f"{markdown_path.name}:{pattern_kind}:{created_order}",
            "type": "hierarchy_pattern",
            "sourcePdfName": markdown_path.name,
            "sourcePdfPath": str(markdown_path),
            "markdownPath": str(markdown_path),
            "reviewDir": str(markdown_path.parent),
            "previewImagePath": "",
            "candidateCount": len(matches),
            "memberPaths": [],
            "createdAt": "",
            "status": "pending",
            "patternKind": pattern_kind,
            "candidateText": candidate_preview,
            "patternSummary": candidate_text,
            "recommendationLabel": recommendation_label,
            "sampleTexts": [text for _, text in prioritized_matches],
            "sampleLines": [line_no for line_no, _ in prioritized_matches],
        })
        created_order += 1

    if line_start > 1 or scoped_end < len(lines):
        selected_matches = [(line_no, text) for line_no, text in content_lines]
        if selected_matches:
            selected_texts = [text for _, text in selected_matches]
            pattern_kind, recommendation_label, summary = infer_selected_recommendation(selected_texts)
            items.append({
                "id": f"{markdown_path.name}:selected_range:1",
                "type": "hierarchy_pattern",
                "sourcePdfName": markdown_path.name,
                "sourcePdfPath": str(markdown_path),
                "markdownPath": str(markdown_path),
                "reviewDir": str(markdown_path.parent),
                "previewImagePath": "",
                "candidateCount": len(selected_matches),
                "memberPaths": [],
                "createdAt": "",
                "status": "pending",
                "patternKind": pattern_kind,
                "candidateText": selected_texts[0],
                "patternSummary": summary,
                "recommendationLabel": recommendation_label,
                "sampleTexts": selected_texts,
                "sampleLines": [line_no for line_no, _ in selected_matches],
            })
            sys.stdout.write(json.dumps(items, ensure_ascii=False))
            return

    for label, recommendation in FIXED_SECTION_LABELS.items():
        matches = [(line_no, text) for line_no, text in content_lines if text == label]
        if matches:
            add_item("fixed_section", label, recommendation, matches)

    bracket_matches = [
        (line_no, text)
        for line_no, text in content_lines
        if BRACKET_SECTION.match(text) and len(text) <= 20
    ]
    if bracket_matches:
        add_item("fixed_section", "대괄호 섹션 패턴", "heading_2", bracket_matches)

    lecture_matches = [(line_no, text) for line_no, text in content_lines if LECTURE_HEADING.match(text)]
    if lecture_matches:
        add_item("fixed_section", "강 제목 패턴", "heading_1", lecture_matches)

    main_matches = [(line_no, text) for line_no, text in content_lines if NUMERIC_MAIN.match(text) and not NUMERIC_SUB.match(text)]
    if main_matches:
        add_item("numeric_heading", "숫자 대주제 패턴", "heading_2", main_matches)

    sub_matches = [(line_no, text) for line_no, text in content_lines if NUMERIC_SUB.match(text)]
    if sub_matches:
        add_item("numeric_heading", "숫자 하위주제 패턴", "heading_3", sub_matches)

    paren_main_matches = [(line_no, text) for line_no, text in content_lines if NUMERIC_PAREN_MAIN.match(text)]
    if paren_main_matches:
        add_item("numeric_heading", "숫자 괄호 대주제 패턴", "heading_3", paren_main_matches)

    paren_sub_matches = [(line_no, text) for line_no, text in content_lines if NUMERIC_PAREN_SUB.match(text)]
    if paren_sub_matches:
        add_item("numeric_heading", "괄호 중주제 패턴", "heading_4", paren_sub_matches)

    symbol_title_matches = [(line_no, text) for line_no, text in content_lines if SYMBOL_TITLE.match(text)]
    if symbol_title_matches:
        add_item("symbol_heading", "■ 기호 제목 패턴", "heading_4", symbol_title_matches)

    symbol_bullet_matches = [(line_no, text) for line_no, text in content_lines if SYMBOL_BULLET.match(text)]
    if symbol_bullet_matches:
        add_item("symbol_heading", "▪ 기호 블릿 패턴", "bullet_1", symbol_bullet_matches)

    circled_item_matches = [(line_no, text) for line_no, text in content_lines if CIRCLED_ITEM.match(text)]
    if circled_item_matches:
        add_item("symbol_heading", "① 원문항 패턴", "bullet_1", circled_item_matches)

    table_caption_matches = [(line_no, text) for line_no, text in content_lines if TABLE_CAPTION.match(text)]
    if table_caption_matches:
        add_item("symbol_heading", "표 캡션 패턴", "heading_4", table_caption_matches)

    repeated_counter = Counter(
        text for _, text in content_lines
        if len(text) >= 8 and not PAGE_NUMBER.match(text)
    )
    repeated_candidates = [text for text, count in repeated_counter.items() if count >= 3]
    if repeated_candidates:
        repeated = sorted(repeated_candidates, key=lambda text: (-repeated_counter[text], text))[0]
        matches = [(line_no, text) for line_no, text in content_lines if text == repeated]
        add_item("repeated_header", repeated, "heading_1", matches)

    sys.stdout.write(json.dumps(items, ensure_ascii=False))


if __name__ == "__main__":
    main()
