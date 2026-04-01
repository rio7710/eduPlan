from __future__ import annotations

import json
import re
from pathlib import Path

import fitz


MIN_TEXT_LEN = 12
TITLE_RE = re.compile(r"^(?:[0-9]+[.)]|제[0-9]+장|[가-힣A-Z0-9 ]{1,40})$")


def _clean_line(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _is_noise_line(text: str) -> bool:
    if len(text) < MIN_TEXT_LEN:
        return True
    if text.isdigit():
        return True
    if TITLE_RE.match(text):
        return True
    if text.startswith(("출처:", "자료:", "그림 ", "표 ")):
        return True
    return False


def _page_lines(page: fitz.Page) -> list[str]:
    blocks = page.get_text("blocks")
    rows = sorted(blocks, key=lambda row: (row[1], row[0]))
    lines: list[str] = []
    for _, _, _, _, text, *_ in rows:
        cleaned = _clean_line(text)
        if cleaned and not _is_noise_line(cleaned):
            lines.append(cleaned)
    return lines


def _merge_paragraphs(lines: list[str]) -> list[str]:
    paragraphs: list[str] = []
    current: list[str] = []
    for line in lines:
        if line.endswith((".", "?", "!", "다.", "함.")):
            current.append(line)
            paragraphs.append(" ".join(current))
            current = []
            continue
        current.append(line)
    if current:
        paragraphs.append(" ".join(current))
    return [text for text in paragraphs if len(text) >= 20]


def normalize_pdf(pdf_path: Path) -> dict:
    doc = fitz.open(pdf_path)
    lines: list[str] = []
    for page in doc:
        lines.extend(_page_lines(page))
    paragraphs = _merge_paragraphs(lines)
    return {"source_id": pdf_path.stem, "path": str(pdf_path), "paragraphs": paragraphs}


def main() -> None:
    root_dir = Path(__file__).resolve().parent
    raw_dir = root_dir / "keris_raw"
    out_dir = root_dir / "normalized"
    out_dir.mkdir(parents=True, exist_ok=True)

    for pdf_path in sorted(raw_dir.glob("*.pdf")):
        normalized = normalize_pdf(pdf_path)
        out_path = out_dir / f"{pdf_path.stem}.json"
        out_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
        print(out_path.name)


if __name__ == "__main__":
    main()
