from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import lightgbm as lgb
import numpy as np

from line_break_features import extract_features
from line_break_synth import LABELS

MODEL_PATH = Path(__file__).resolve().parent / "artifacts" / "line_break_model.txt"
LIST_RE = re.compile(r"^(?:[-*+]|[0-9]+[.)]|[①-⑳])\s")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply the line break LightGBM model to merged markdown.")
    parser.add_argument("--markdown", required=True, type=Path)
    parser.add_argument("--sensitivity", choices=["low", "default", "high"], default="default")
    return parser.parse_args()


def threshold_for(sensitivity: str) -> float:
    return {"low": 0.9, "default": 0.75, "high": 0.6}[sensitivity]


def is_structural_line(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True
    if stripped in {"---", "***", "___"}:
        return True
    if stripped.startswith(("#", ">", "|", "```")):
        return True
    if stripped.startswith("[") and stripped.endswith("]"):
        return True
    if LIST_RE.match(stripped):
        return True
    return False


def can_merge(left: str, right: str) -> bool:
    if is_structural_line(left) or is_structural_line(right):
        return False
    if left.rstrip().endswith((".", "!", "?", ":", ";")):
        return False
    return True


def predict_label(model: lgb.Booster, left: str, right: str) -> tuple[str, float]:
    features = np.asarray([extract_features(left, right)], dtype=float)
    scores = model.predict(features)[0]
    label_index = int(np.argmax(scores))
    return LABELS[label_index], float(np.max(scores))


def merge_lines(lines: list[str], model: lgb.Booster, sensitivity: str) -> tuple[list[str], dict]:
    threshold = threshold_for(sensitivity)
    merged: list[str] = []
    merged_count = 0
    decision_count = 0
    index = 0

    while index < len(lines):
        current = lines[index]
        if is_structural_line(current):
            merged.append(current)
            index += 1
            continue

        while index + 1 < len(lines):
            next_line = lines[index + 1]
            if not can_merge(current, next_line):
                break
            label, confidence = predict_label(model, current, next_line)
            decision_count += 1
            if label == "keep_break" or confidence < threshold:
                break
            separator = "" if label == "merge_no_space" else " "
            current = f"{current.rstrip()}{separator}{next_line.lstrip()}"
            merged_count += 1
            index += 1

        merged.append(current)
        index += 1

    return merged, {
        "sensitivity": sensitivity,
        "threshold": threshold,
        "decisionCount": decision_count,
        "mergedLineCount": merged_count,
    }


def main() -> None:
    args = parse_args()
    markdown_path = args.markdown.resolve()
    if not markdown_path.is_file():
        raise FileNotFoundError(f"Markdown file not found: {markdown_path}")
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"LightGBM model not found: {MODEL_PATH}")

    original = markdown_path.read_text(encoding="utf-8")
    lines = original.splitlines()
    model = lgb.Booster(model_file=str(MODEL_PATH))
    merged_lines, summary = merge_lines(lines, model, args.sensitivity)
    normalized = "\n".join(merged_lines)
    if original.endswith("\n"):
        normalized += "\n"
    markdown_path.write_text(normalized, encoding="utf-8")
    print(json.dumps({"ok": True, "markdownPath": str(markdown_path), **summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()
