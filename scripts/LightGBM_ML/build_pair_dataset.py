from __future__ import annotations

import json
import random
from pathlib import Path


LABELS = ["keep_break", "merge_space", "merge_no_space"]


def _split_between_words(text: str, rng: random.Random) -> tuple[str, str] | None:
    words = [word for word in text.split(" ") if word]
    if len(words) < 2:
        return None
    split_at = rng.randint(1, len(words) - 1)
    return " ".join(words[:split_at]), " ".join(words[split_at:])


def _split_inside_word(text: str, rng: random.Random) -> tuple[str, str] | None:
    words = [word for word in text.split(" ") if len(word) >= 4]
    if not words:
        return None
    target = rng.choice(words)
    split_at = rng.randint(1, len(target) - 1)
    left_part = target[:split_at]
    right_part = target[split_at:]
    left_text, right_text = text.split(target, 1)
    return f"{left_text}{left_part}".rstrip(), f"{right_part}{right_text}".lstrip()


def _build_rows(paragraphs: list[str], source_id: str, rng: random.Random) -> list[dict]:
    rows: list[dict] = []
    MIN_LEN = 20
    filtered_paragraphs = [p for p in paragraphs if len(p.strip()) >= MIN_LEN]
    for index, text in enumerate(filtered_paragraphs):
        between = _split_between_words(text, rng)
        inside = _split_inside_word(text, rng)
        if between:
            if len(between[0].strip()) >= MIN_LEN and len(between[1].strip()) >= MIN_LEN:
                rows.append({"left": between[0], "right": between[1], "label": "merge_space", "source_id": source_id})
        if inside:
            if len(inside[0].strip()) >= MIN_LEN and len(inside[1].strip()) >= MIN_LEN:
                rows.append({"left": inside[0], "right": inside[1], "label": "merge_no_space", "source_id": source_id})
        if index + 1 < len(filtered_paragraphs):
            if len(text.strip()) >= MIN_LEN and len(filtered_paragraphs[index + 1].strip()) >= MIN_LEN:
                rows.append(
                    {"left": text, "right": filtered_paragraphs[index + 1], "label": "keep_break", "source_id": source_id}
                )
    return rows


def main() -> None:
    root_dir = Path(__file__).resolve().parent
    normalized_dir = root_dir / "normalized"
    artifact_dir = root_dir / "artifacts"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(42)
    rows: list[dict] = []

    # 기존 normalized/*.json 처리
    for json_path in sorted(normalized_dir.glob("*.json")):
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        rows.extend(_build_rows(payload.get("paragraphs", []), payload["source_id"], rng))

    # 텍스트 파일 직접 처리 (예: 오리와 백조 (1).txt)
    for txt_path in sorted(root_dir.glob("*.txt")):
        with open(txt_path, encoding="utf-8") as f:
            content = f.read()
        # 문단 분리: 빈 줄 2개 이상 또는 \n\n 기준
        paragraphs = [p.strip() for p in content.split("\n\n") if len(p.strip()) > 0]
        rows.extend(_build_rows(paragraphs, txt_path.stem, rng))

    out_path = artifact_dir / "line_break_pairs.jsonl"
    out_path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows), encoding="utf-8")
    print(json.dumps({"rows": len(rows), "labels": LABELS}, ensure_ascii=False))


if __name__ == "__main__":
    main()
