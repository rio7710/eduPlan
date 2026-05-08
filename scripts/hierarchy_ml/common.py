from __future__ import annotations

import re
from statistics import mean


PATTERN_KINDS = ["fixed_section", "numeric_heading", "symbol_heading", "repeated_header"]
TARGET_LABELS = [
    "heading_1",
    "heading_2",
    "heading_3",
    "heading_4",
    "bullet_1",
    "bullet_2",
    "header_noise",
    "meta_noise",
    "page_number_noise",
]
NOISE_LABELS = {"header_noise", "meta_noise", "page_number_noise"}

NUMERIC_MAIN = re.compile(r"^\d+\.\s+.+$")
NUMERIC_SUB = re.compile(r"^\d+\.\d+\s+.+$")
NUMERIC_PAREN_MAIN = re.compile(r"^\d+\)\s*.+$")
NUMERIC_PAREN_SUB = re.compile(r"^\(\d+\)\s*.+$")
SYMBOL_TITLE = re.compile(r"^■\s*(.+)$")
SYMBOL_BULLET = re.compile(r"^[▪•\-*]\s*(.+)$")
CIRCLED_ITEM = re.compile(r"^[①-⑳]\s*.+$")
BRACKET_SECTION = re.compile(r"^\[[^\[\]]{2,30}\]$")
LECTURE_HEADING = re.compile(r"^제\s*\d+\s*강(?:\s*[.:])?\s*.+$")
TABLE_CAPTION = re.compile(r"^<[^>]{2,80}>$")
PAGE_NUMBER = re.compile(r"^\d+$")
PAGE_FRACTION = re.compile(r"^-\s*\d+\s*-$")
SENTENCE_END = re.compile(r"(니다|이다|했다|합니다|습니다|였다|한다|있다|없다|됩니다|임|음)[.!?]?$")


def seed_records() -> list[dict]:
    return [
        {"patternKind": "fixed_section", "candidateText": "강 제목 패턴", "recommendationLabel": "heading_1", "candidateCount": 6, "sampleTexts": ["제1강 AI 이해", "제2강 데이터 이해", "제3강 문서 작성"], "finalLabel": "heading_1"},
        {"patternKind": "repeated_header", "candidateText": "1시간차. AI 기반 문서 작성의 이해", "recommendationLabel": "heading_1", "candidateCount": 4, "sampleTexts": ["1시간차. AI 기반 문서 작성의 이해"] * 3, "finalLabel": "heading_1"},
        {"patternKind": "fixed_section", "candidateText": "대괄호 섹션 패턴", "recommendationLabel": "heading_2", "candidateCount": 5, "sampleTexts": ["[학습목표]", "[준비물]", "[정리 활동]"], "finalLabel": "heading_2"},
        {"patternKind": "fixed_section", "candidateText": "학습목표", "recommendationLabel": "heading_2", "candidateCount": 3, "sampleTexts": ["학습목표"] * 3, "finalLabel": "heading_2"},
        {"patternKind": "fixed_section", "candidateText": "참고자료", "recommendationLabel": "heading_2", "candidateCount": 2, "sampleTexts": ["참고자료", "참고 자료"], "finalLabel": "heading_2"},
        {"patternKind": "numeric_heading", "candidateText": "숫자 대주제 패턴", "recommendationLabel": "heading_2", "candidateCount": 7, "sampleTexts": ["1. 도입", "2. 본활동", "3. 정리"], "finalLabel": "heading_2"},
        {"patternKind": "numeric_heading", "candidateText": "숫자 대주제 패턴", "recommendationLabel": "heading_2", "candidateCount": 4, "sampleTexts": ["1. 문제 이해", "2. 해결 전략"], "finalLabel": "heading_2"},
        {"patternKind": "numeric_heading", "candidateText": "숫자 하위주제 패턴", "recommendationLabel": "heading_3", "candidateCount": 8, "sampleTexts": ["1.1 개념 이해", "1.2 사례 확인", "2.1 실습"], "finalLabel": "heading_3"},
        {"patternKind": "numeric_heading", "candidateText": "숫자 괄호 대주제 패턴", "recommendationLabel": "heading_3", "candidateCount": 5, "sampleTexts": ["1) 개요", "2) 전개", "3) 정리"], "finalLabel": "heading_3"},
        {"patternKind": "numeric_heading", "candidateText": "괄호 중주제 패턴", "recommendationLabel": "heading_4", "candidateCount": 6, "sampleTexts": ["(1) 정의", "(2) 특징", "(3) 예시"], "finalLabel": "heading_4"},
        {"patternKind": "symbol_heading", "candidateText": "■ 기호 제목 패턴", "recommendationLabel": "heading_4", "candidateCount": 4, "sampleTexts": ["■ 학습 안내", "■ 활동 방법"], "finalLabel": "heading_4"},
        {"patternKind": "symbol_heading", "candidateText": "▪ 기호 블릿 패턴", "recommendationLabel": "bullet_1", "candidateCount": 6, "sampleTexts": ["▪ 자료 조사", "▪ 결과 발표", "▪ 토의 참여"], "finalLabel": "bullet_1"},
        {"patternKind": "symbol_heading", "candidateText": "① 원문항 패턴", "recommendationLabel": "bullet_1", "candidateCount": 6, "sampleTexts": ["① 문제 확인", "② 해결 방법 찾기", "③ 결과 공유"], "finalLabel": "bullet_1"},
        {"patternKind": "symbol_heading", "candidateText": "표 캡션 패턴", "recommendationLabel": "heading_4", "candidateCount": 4, "sampleTexts": ["<표 1>", "<그림 2>", "<활동지 1>"], "finalLabel": "heading_4"},
        {"patternKind": "numeric_heading", "candidateText": "숫자 하위주제 패턴", "recommendationLabel": "heading_3", "candidateCount": 3, "sampleTexts": ["1.1 핵심 개념 설명입니다", "1.2 예시를 함께 살펴봅니다"], "finalLabel": "meta_noise"},
        {"patternKind": "repeated_header", "candidateText": "서울교육연구원", "recommendationLabel": "heading_1", "candidateCount": 5, "sampleTexts": ["서울교육연구원"] * 3, "finalLabel": "header_noise"},
        {"patternKind": "repeated_header", "candidateText": "2025학년도 1학기", "recommendationLabel": "heading_1", "candidateCount": 5, "sampleTexts": ["2025학년도 1학기"] * 3, "finalLabel": "header_noise"},
        {"patternKind": "fixed_section", "candidateText": "대괄호 섹션 패턴", "recommendationLabel": "heading_2", "candidateCount": 3, "sampleTexts": ["[붙임 1]", "[참조 2]", "[별첨 3]"], "finalLabel": "meta_noise"},
        {"patternKind": "numeric_heading", "candidateText": "숫자 대주제 패턴", "recommendationLabel": "heading_2", "candidateCount": 4, "sampleTexts": ["1", "2", "3"], "finalLabel": "page_number_noise"},
        {"patternKind": "numeric_heading", "candidateText": "숫자 괄호 대주제 패턴", "recommendationLabel": "heading_3", "candidateCount": 4, "sampleTexts": ["- 1 -", "- 2 -", "- 3 -"], "finalLabel": "page_number_noise"},
    ]


def infer_reject_label(item: dict) -> str:
    texts = [str(text).strip() for text in item.get("sampleTexts", []) if str(text).strip()]
    joined = " ".join(texts)
    if texts and all(PAGE_NUMBER.match(text) or PAGE_FRACTION.match(text) for text in texts):
        return "page_number_noise"
    if item.get("patternKind") == "repeated_header" or "학년도" in joined or "연구원" in joined:
        return "header_noise"
    return "meta_noise"


def normalize_record(item: dict) -> dict:
    sample_texts = [str(text).strip() for text in item.get("sampleTexts", []) if str(text).strip()]
    if not sample_texts and item.get("candidateText"):
        sample_texts = [str(item["candidateText"]).strip()]
    return {
        "patternKind": str(item.get("patternKind", "")),
        "candidateText": str(item.get("candidateText", "")).strip(),
        "recommendationLabel": str(item.get("recommendationLabel", "")).strip(),
        "candidateCount": max(1, int(item.get("candidateCount") or len(sample_texts) or 1)),
        "sampleTexts": sample_texts,
    }


def _ratio(values: list[bool]) -> float:
    return sum(1 for value in values if value) / len(values) if values else 0.0


def extract_features(item: dict) -> list[float]:
    record = normalize_record(item)
    texts = record["sampleTexts"]
    lengths = [len(text) for text in texts] or [0]
    joined = " ".join(texts)
    features = [
        float(record["candidateCount"]),
        float(len(texts)),
        float(mean(lengths)),
        float(max(lengths)),
        _ratio([len(text) <= 12 for text in texts]),
        _ratio([SENTENCE_END.search(text) is not None for text in texts]),
        _ratio([NUMERIC_MAIN.match(text) is not None and NUMERIC_SUB.match(text) is None for text in texts]),
        _ratio([NUMERIC_SUB.match(text) is not None for text in texts]),
        _ratio([NUMERIC_PAREN_MAIN.match(text) is not None for text in texts]),
        _ratio([NUMERIC_PAREN_SUB.match(text) is not None for text in texts]),
        _ratio([SYMBOL_TITLE.match(text) is not None for text in texts]),
        _ratio([SYMBOL_BULLET.match(text) is not None for text in texts]),
        _ratio([CIRCLED_ITEM.match(text) is not None for text in texts]),
        _ratio([BRACKET_SECTION.match(text) is not None for text in texts]),
        _ratio([LECTURE_HEADING.match(text) is not None for text in texts]),
        _ratio([TABLE_CAPTION.match(text) is not None for text in texts]),
        _ratio([PAGE_NUMBER.match(text) is not None or PAGE_FRACTION.match(text) is not None for text in texts]),
        1.0 if "학습" in joined else 0.0,
        1.0 if "참고" in joined else 0.0,
        1.0 if "정리" in joined else 0.0,
        1.0 if "붙임" in joined or "별첨" in joined else 0.0,
    ]
    features.extend(1.0 if record["patternKind"] == pattern_kind else 0.0 for pattern_kind in PATTERN_KINDS)
    features.extend(1.0 if record["recommendationLabel"] == label else 0.0 for label in TARGET_LABELS)
    return features
