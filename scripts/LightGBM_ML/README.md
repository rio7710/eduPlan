# LightGBM_ML

줄끊김 복원용 합성 데이터와 LightGBM 학습 스크립트 모음입니다.

구성:
- `line_break_synth.py`: 합성 쌍데이터 생성
- `line_break_features.py`: 줄쌍 feature 추출
- `train_line_break_model.py`: 데이터 생성 + 학습 + artifact 저장
- `pair_data_rules.md`: 원문 기반 쌍데이터 생성 규칙
- `source_pipeline_plan.md`: 원문 수집/정제/학습 파이프라인 설계
- `keris_pipeline.md`: KERIS PDF 처리 흐름
- `normalize_keris_sources.py`: KERIS PDF 문단 정제
- `build_pair_dataset.py`: 정제 문단에서 pair jsonl 생성
- `artifacts/`: 학습 결과 저장 폴더

라벨:
- `keep_break`
- `merge_space`
- `merge_no_space`

학습 명령:

```powershell
.\.venv\Scripts\python.exe .\scripts\LightGBM_ML\train_line_break_model.py
```

생성 산출물:
- `artifacts/line_break_train.jsonl`
- `artifacts/line_break_pairs.jsonl`
- `artifacts/line_break_metrics.json`
- `artifacts/line_break_model.txt`

현재 목적:
- Stage 2 이전 줄쪼개짐 복원 baseline 확보
- 실제 사용자 승인 데이터가 쌓이기 전 synthetic pretrain 용도
- 이후 원문 기반 pair dataset 으로 전환 예정

KERIS 원문 준비:

```powershell
.\.venv\Scripts\python.exe .\scripts\LightGBM_ML\normalize_keris_sources.py
.\.venv\Scripts\python.exe .\scripts\LightGBM_ML\build_pair_dataset.py
```

주의:
- 이 모델은 줄바꿈 복원용입니다.
- 띄어쓰기 전반 보정 모델이 아닙니다.
- 실제 승인 데이터가 쌓이면 synthetic 비중을 줄이고 재학습해야 합니다.
