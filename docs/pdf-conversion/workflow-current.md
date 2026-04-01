# Workflow Current

Development workflow should follow this order.

1. run `Stage 1`
2. inspect `md`, `img`, `layout`, `report`
3. confirm omission and boxed-content coverage
4. move to `Stage 2`
5. inspect separate-block candidates
6. inspect reading order and grouped boxes
7. only then continue to cleanup and segmentation

Developer monitoring priorities:
- current stage
- artifact paths
- warning count
- missing page count
- missing text block count
- missing boxed text block count

Current output naming:
- `s01_*.md`
- `s02_*_layout.json`
- `s03_*_report.(json|md)`
- `s04_*_report.(json|md)` for developer validation

Current data policy before `Stage 2` work:
- keep SQLite as source of truth for review and auto-approval history
- do not append ML pair json automatically during PDF conversion
- generate pair json only when the user requests training execution
- use Dataset panel `DB/ML 전체 초기화` when starting from a clean slate
