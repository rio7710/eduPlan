from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
import re

IMAGE_REF_RE = re.compile(r"^\[이미지\s+\d+:.+\]\s*$")
PAGE_MARKER_RE = re.compile(r"^\s*-\s*\d+\s*-\s*$")
PAGE_BREAK = "---"
TABLE_HEADER_RE = re.compile(r"(?:^|\s)구분(?:\s|$)")
TABLE_COMPARE_RE = re.compile(r"국내기준|NFPA\s*101", re.IGNORECASE)
TABLE_ROW_HINT_RE = re.compile(r"(기준\s*높이|기준점|분류|지상층\s*기준|지하층\s*기준)")


def normalize(text: str) -> str:
    return "".join(char for char in text if not char.isspace())


@dataclass
class MarkdownPage:
    text_lines: list[str]
    image_lines: list[str]


def is_ignored_line(line: str) -> bool:
    stripped = line.strip()
    return not stripped or stripped == PAGE_BREAK or PAGE_MARKER_RE.match(stripped) is not None


def split_markdown_pages(markdown_text: str) -> list[MarkdownPage]:
    pages: list[MarkdownPage] = []
    text_lines: list[str] = []
    image_lines: list[str] = []
    for line in markdown_text.splitlines():
        stripped = line.strip()
        if stripped == PAGE_BREAK:
            pages.append(MarkdownPage(text_lines=text_lines, image_lines=image_lines))
            text_lines = []
            image_lines = []
            continue
        if IMAGE_REF_RE.match(stripped):
            image_lines.append(line)
            continue
        text_lines.append(line)
    pages.append(MarkdownPage(text_lines=text_lines, image_lines=image_lines))
    return pages


def is_table_risk_page(lines: list[str]) -> bool:
    meaningful = [line.strip() for line in lines if line.strip() and not is_ignored_line(line)]
    if not meaningful:
        return False
    joined = " ".join(meaningful)
    has_compare_header = bool(TABLE_HEADER_RE.search(joined) and TABLE_COMPARE_RE.search(joined))
    row_hint_count = sum(1 for line in meaningful if TABLE_ROW_HINT_RE.search(line))
    short_line_count = sum(1 for line in meaningful if len(line) <= 28)
    return has_compare_header and (row_hint_count >= 2 or short_line_count >= max(4, len(meaningful) // 3))


def build_reference_lines(reference_text: str) -> list[str]:
    return reference_text.splitlines()


def score_candidate(page_norm: str, candidate_norm: str, target_len: int) -> float:
    if not candidate_norm:
        return -1.0
    ratio = SequenceMatcher(None, page_norm[:5000], candidate_norm[:5000]).ratio()
    length_penalty = abs(len(candidate_norm) - target_len) / max(target_len, 1)
    return ratio - (length_penalty * 0.08)


def find_best_end(page_norm: str, ref_lines: list[str], start: int, is_last: bool) -> int:
    if is_last or start >= len(ref_lines):
        return len(ref_lines)
    target_len = max(len(page_norm), 80)
    max_end = min(len(ref_lines), start + 80)
    best_end = start + 1
    best_score = -1.0
    running_lines: list[str] = []
    for end in range(start + 1, max_end + 1):
        running_lines.append(ref_lines[end - 1])
        candidate_norm = normalize("\n".join(running_lines))
        score = score_candidate(page_norm, candidate_norm, target_len)
        if score > best_score:
            best_score = score
            best_end = end
        if len(candidate_norm) > target_len * 1.7 and end > start + 5:
            break
    return best_end


def attach_images(page_lines: list[str], image_lines: list[str]) -> list[str]:
    if not image_lines:
        return page_lines
    if not page_lines:
        return [*image_lines]
    return [*page_lines, "", *image_lines]


def align_reference_to_pages(markdown_text: str, reference_text: str) -> tuple[str, dict]:
    pages = split_markdown_pages(markdown_text)
    ref_lines = build_reference_lines(reference_text)
    cursor = 0
    rendered_pages: list[str] = []
    aligned_pages = 0

    for index, page in enumerate(pages):
        page_text = "\n".join(line for line in page.text_lines if not is_ignored_line(line)).strip()
        if not page_text:
            rendered_pages.append("\n".join(attach_images([], page.image_lines)).strip())
            continue
        page_norm = normalize(page_text)
        if len(page_norm) < 20:
            rendered_pages.append("\n".join(attach_images(page.text_lines, page.image_lines)).strip())
            continue
        end = find_best_end(page_norm, ref_lines, cursor, index == len(pages) - 1)
        page_slice = ref_lines[cursor:end]
        cursor = end
        if is_table_risk_page(page.text_lines):
            # Keep original markdown for table-like pages to avoid irreversible row/column collapse.
            replaced_lines = attach_images(page.text_lines, page.image_lines)
        else:
            replaced_lines = attach_images(page_slice, page.image_lines)
        rendered_pages.append("\n".join(replaced_lines).strip())
        aligned_pages += 1

    aligned_text = f"\n\n{PAGE_BREAK}\n\n".join(page for page in rendered_pages if page)
    return f"{aligned_text}\n", {
        "alignedPages": aligned_pages,
        "totalPages": len(pages),
        "referenceLines": len(ref_lines),
    }
