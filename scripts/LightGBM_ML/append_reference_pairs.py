from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

MIN_LEN = 12
LABELS = ("keep_break", "merge_space", "merge_no_space")
PARAGRAPH_SPLIT_RE = re.compile(r"\n\s*\n+")
WORD_RE = re.compile(r"\S+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Append line-break training pairs from a trusted text reference.")
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--source-id", required=True)
    return parser.parse_args()


def split_paragraphs(text: str) -> list[str]:
    paragraphs = [part.strip() for part in PARAGRAPH_SPLIT_RE.split(text) if part.strip()]
    return [paragraph for paragraph in paragraphs if len(paragraph) >= MIN_LEN]


def split_between_words(text: str) -> tuple[str, str] | None:
    matches = list(WORD_RE.finditer(text))
    if len(matches) < 2:
        return None
    split_index = len(matches) // 2
    left = text[:matches[split_index].start()].rstrip()
    right = text[matches[split_index].start():].lstrip()
    if len(left) < MIN_LEN or len(right) < MIN_LEN:
        return None
    return left, right


def split_inside_word(text: str) -> tuple[str, str] | None:
    for match in WORD_RE.finditer(text):
        word = match.group(0)
        if len(word) < 4:
            continue
        split_at = len(word) // 2
        left = f"{text[:match.start()]}{word[:split_at]}".rstrip()
        right = f"{word[split_at:]}{text[match.end():]}".lstrip()
        if len(left) < MIN_LEN or len(right) < MIN_LEN:
            continue
        return left, right
    return None


def build_rows(paragraphs: list[str], source_id: str) -> list[dict]:
    rows: list[dict] = []
    for index, paragraph in enumerate(paragraphs):
        between = split_between_words(paragraph)
        inside = split_inside_word(paragraph)
        if between:
            rows.append({"left": between[0], "right": between[1], "label": "merge_space", "source_id": source_id})
        if inside:
            rows.append({"left": inside[0], "right": inside[1], "label": "merge_no_space", "source_id": source_id})
        if index + 1 < len(paragraphs):
            next_paragraph = paragraphs[index + 1]
            if len(paragraph) >= MIN_LEN and len(next_paragraph) >= MIN_LEN:
                rows.append({"left": paragraph, "right": next_paragraph, "label": "keep_break", "source_id": source_id})
    return rows


def load_existing_rows(target_path: Path) -> tuple[list[dict], set[tuple[str, str, str, str]]]:
    if not target_path.is_file():
      return [], set()
    rows: list[dict] = []
    keys: set[tuple[str, str, str, str]] = set()
    for raw_line in target_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not raw_line.strip():
            continue
        try:
            row = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        key = (
            str(row.get("source_id", "")),
            str(row.get("label", "")),
            str(row.get("left", "")),
            str(row.get("right", "")),
        )
        rows.append(row)
        keys.add(key)
    return rows, keys


def main() -> None:
    args = parse_args()
    reference_path = args.reference.resolve()
    if not reference_path.is_file():
        raise FileNotFoundError(f"Reference text not found: {reference_path}")

    root_dir = Path(__file__).resolve().parent
    artifact_dir = root_dir / "artifacts"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    target_path = artifact_dir / "user_line_break_pairs.jsonl"

    reference_text = reference_path.read_text(encoding="utf-8", errors="ignore")
    paragraphs = split_paragraphs(reference_text)
    new_rows = build_rows(paragraphs, args.source_id)
    existing_rows, existing_keys = load_existing_rows(target_path)
    appended_rows: list[dict] = []

    for row in new_rows:
        key = (row["source_id"], row["label"], row["left"], row["right"])
        if key in existing_keys or row["label"] not in LABELS:
            continue
        existing_keys.add(key)
        existing_rows.append(row)
        appended_rows.append(row)

    target_path.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in existing_rows),
        encoding="utf-8",
    )
    print(json.dumps({
        "ok": True,
        "referencePath": str(reference_path),
        "targetPath": str(target_path),
        "paragraphCount": len(paragraphs),
        "appendedCount": len(appended_rows),
        "totalCount": len(existing_rows),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
