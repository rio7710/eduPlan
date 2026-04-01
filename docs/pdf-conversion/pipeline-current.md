# Pipeline Current

## Stage 1

Goal:
- collect omission-safe source data

Includes:
- PDF check
- text extraction
- image extraction
- layout extraction
- box and containment capture
- first coverage validation
- report generation

Outputs:
- `md`
- `img`
- `layout`
- `report`

Current validation:
- page count
- missing text block count
- missing boxed text block count

## Stage 2

Goal:
- interpret extracted layout for structure decisions

Includes:
- separate-block detection
- box grouping
- table and aside candidates
- reading-order improvement

## Later Stages

- `Stage 3`: noise cleanup
- `Stage 4`: sentence segmentation
- `Stage 5`: structure labeling
- `Stage 6`: AI refinement
- `Stage 7`: user revision capture
- `Stage 8`: final export and feedback loop
