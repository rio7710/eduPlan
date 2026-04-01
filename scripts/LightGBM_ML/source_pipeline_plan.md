# Source Pipeline Plan

원문 기반 학습 데이터 생성 파이프라인 설계입니다.

## Stage A

- `raw_sources/`
  - 수집한 HTML 또는 텍스트 원문 저장
- `source_index.jsonl`
  - `source_id`, `url`, `title`, `license`, `collected_at`

## Stage B

- `normalize_sources.py`
  - HTML 태그 제거
  - 본문 후보 블록만 추출
  - 문단 리스트 생성
- 출력
  - `normalized/<source_id>.json`

## Stage C

- `build_pair_dataset.py`
  - 문단에서 `merge_space`, `merge_no_space`, `keep_break` 생성
  - hard negative 추가
  - 문서 기준 split 부여
- 출력
  - `artifacts/line_break_pairs.jsonl`

## Stage D

- `train_line_break_model.py`
  - `line_break_pairs.jsonl` 사용
  - metrics 저장
  - model 저장

## Proposed Files

- `collect_policy_corpus.py`
  - 허용된 원문만 수집
- `normalize_sources.py`
  - 공통 정제
- `build_pair_dataset.py`
  - 쌍데이터 생성

## Policy Briefing Check

- 수집 후보로는 편하지만 기본값으로 확정하면 안 됨
- 이유
  - 기사별 공공누리 유형이 다름
  - `기고/칼럼`은 원작자 권리 문구가 별도로 붙는 경우가 있음
  - 제4유형은 비상업, 변경금지라 학습용 재가공에 부적합

## Safe Source Rule

- `license`가 명시된 원문만 사용
- `변경금지` 또는 `원작자 별도 허락` 문구가 있으면 제외
- 출처 저장을 강제하고 샘플에도 `source_id` 유지

## Immediate Next Step

- 정책브리핑은 `제1유형` 텍스트만 후보로 제한
- 기본 원문 소스는 별도 허용 데이터셋도 함께 탐색
- 먼저 파이프라인은 소스 독립적으로 구현
