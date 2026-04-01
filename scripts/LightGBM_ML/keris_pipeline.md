# KERIS Pipeline

기관 허가를 전제로 한 KERIS 원문 처리 흐름입니다.

## Folders

- `keris_raw/`
  - 원본 PDF 저장
- `normalized/`
  - 문단 추출 결과 저장
- `artifacts/`
  - pair dataset, metrics, model 저장

## Flow

1. 허가받은 KERIS PDF를 `keris_raw/`에 둡니다.
2. `normalize_keris_sources.py`로 문단 JSON을 만듭니다.
3. `build_pair_dataset.py`로 pair jsonl을 생성합니다.
4. 기존 학습 스크립트가 pair dataset을 읽게 확장합니다.

## Normalization Rules

- 페이지 번호, 머리말, 꼬리말 제거
- 너무 짧은 줄 제거
- 제목, 표, 목록 후보 제외
- 연속 본문 줄은 한 문단으로 병합

## Pair Rules

- 문단 내부 단어 경계 분할은 `merge_space`
- 문단 내부 단어 내부 분할은 `merge_no_space`
- 문단 경계와 제목-본문 경계는 `keep_break`

## Note

- 수집 자동화는 포함하지 않음
- 허가받은 PDF를 직접 넣는 방식이 기본
