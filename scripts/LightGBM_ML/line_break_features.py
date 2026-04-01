from __future__ import annotations

import re

HANGUL_RE = re.compile(r"[가-힣]")
PUNCT_RE = re.compile(r"[.!?:;,\])}]$")
BULLET_RE = re.compile(r"^(?:[-*•]|[0-9]+[.)]|[①-⑳])")


def _is_hangul(text: str) -> int:
    return 1 if text and HANGUL_RE.search(text) else 0


def _last_char(text: str) -> str:
    return text[-1] if text else ""


def _first_char(text: str) -> str:
    return text[0] if text else ""


def extract_features(left: str, right: str) -> list[float]:
    left_text = left.strip()
    right_text = right.strip()
    left_last = _last_char(left_text)
    right_first = _first_char(right_text)
    left_words = [token for token in left_text.split(" ") if token]
    right_words = [token for token in right_text.split(" ") if token]
    return [
        float(len(left_text)),
        float(len(right_text)),
        float(len(left_words)),
        float(len(right_words)),
        float(left_text.count(" ")),
        float(right_text.count(" ")),
        float(_is_hangul(left_last)),
        float(_is_hangul(right_first)),
        1.0 if PUNCT_RE.search(left_text) else 0.0,
        1.0 if BULLET_RE.search(right_text) else 0.0,
        1.0 if left_last.isdigit() else 0.0,
        1.0 if right_first.isdigit() else 0.0,
        1.0 if 1 <= len(left_last) <= 1 and _is_hangul(left_last) else 0.0,
        1.0 if left_words and len(left_words[-1]) <= 2 else 0.0,
        1.0 if right_words and len(right_words[0]) <= 2 else 0.0,
        1.0 if left_text.endswith(("의", "를", "은", "는", "이", "가", "에", "와")) else 0.0,
        1.0 if right_text.startswith(("및", "또한", "그리고", "하지만")) else 0.0,
    ]
