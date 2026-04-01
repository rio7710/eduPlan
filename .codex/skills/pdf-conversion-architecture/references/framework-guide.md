# PDF Conversion Framework Guide

## Purpose

This guide fixes the current architectural direction for eduFixer's PDF conversion work.

It exists to keep planning, implementation, and later ML work aligned across Electron, Python, and future web or mobile reuse.

## Current Direction

- The conversion core stays local-first and deterministic.
- Python remains the current implementation home for the conversion pipeline.
- Electron only requests work and receives results or progress.
- AI is a post-conversion helper layer, not the first extractor.

## Mandatory Requirements

- Accept local PDF input.
- Support both native digital PDFs and image-based scanned PDFs.
- Preserve reading order.
- Preserve layout enough that the converted document is still teachable and reviewable.
- Distinguish ordinary paragraphs from tables or table-like text.
- Produce an output document that eduFixer can open directly.
- Return clear failure states when text extraction is weak or OCR is needed.
- Keep the pipeline modular enough to reuse the same stages later in web and mobile contexts.

## Main Framework Decision

Use `Docling` as the primary framework.

Reasons:
- better fit for layout-aware extraction
- table-aware structure handling
- OCR support path
- exports that are easier to normalize into app-level artifacts

Keep `PyMuPDF` or `PyMuPDF4LLM` as fallback or lightweight alternatives, not as the long-term primary architecture.

Use `OCRmyPDF` when scanned documents need a more reliable OCR preprocessing step than the main pipeline alone provides.

## Architectural Layers

### 1. Input Layer

Responsibilities:
- resolve PDF paths
- normalize job requests
- create output working directories

Suggested tool:
- `input_resolver`

### 2. OCR Layer

Responsibilities:
- detect when OCR is likely needed
- run OCR only when necessary or requested
- expose OCR confidence or at least OCR-used metadata

Suggested tools:
- `ocr_tool`
- `ocr_need_detector`

### 3. Layout Extraction Layer

Responsibilities:
- extract page blocks
- retain geometry and reading order metadata
- classify text, image, and table regions when possible

Suggested tool:
- `layout_tool`

### 4. Korean Text Recovery Layer

Responsibilities:
- recover true paragraph flow from PDF line breaks
- avoid flattening lists or headings
- mark ambiguous cases for later review or ML scoring

Suggested tools:
- `line_merge_tool`
- `paragraph_builder_tool`

### 5. Table Recovery Layer

Responsibilities:
- detect clear tables
- detect table-like aligned text
- build explicit table structures instead of plain paragraphs where confidence is sufficient

Suggested tools:
- `table_candidate_tool`
- `table_builder_tool`

### 6. Asset Layer

Responsibilities:
- extract images
- generate stable asset names
- preserve references from structured output to assets

Suggested tool:
- `asset_tool`

### 7. Quality Layer

Responsibilities:
- score extraction quality
- flag likely OCR or layout failures
- surface ambiguous regions

Suggested tool:
- `quality_tool`

### 8. Export Layer

Responsibilities:
- generate Markdown or other canonical output
- preserve provenance and metadata needed for review
- keep output predictable for the app

Suggested tool:
- `export_tool`

### 9. Orchestration Layer

Responsibilities:
- run the pipeline stages in order
- collect intermediate metadata
- return progress and results to Electron

Suggested tool:
- `document_conversion_runner`

## Korean Line-Break Module

This is a required module, not optional polish.

Why:
- PDF line wraps are often visual only.
- Korean educational documents frequently mix headings, body text, numbered items, and table-like aligned text.
- naive newline removal damages structure quickly.

Minimum output labels:
- `merge`
- `keep_break`
- `table_candidate`

Useful inputs:
- current line text
- next line text
- line x/y coordinates
- indentation delta
- line width ratio
- font size or style when available
- punctuation and sentence endings
- list markers
- repeated aligned token patterns

## ML Strategy

Do not start with end-to-end document ML generation.

Start with deterministic tools and add ML at decision points:
- OCR-needed detection
- line merge prediction
- table candidate prediction
- quality scoring

Use user review and correction data to train these modules later.

## AI Finalization Strategy

AI runs after the deterministic pipeline has already produced a structured document.

Allowed roles:
- fix suspicious OCR wording
- suggest heading hierarchy cleanup
- suggest paragraph merge or split fixes
- suggest table restoration candidates
- normalize style when the user accepts it

Preferred provider order:
1. local AI
2. external AI providers

External providers should be swappable through provider modules, not hardcoded into the main pipeline.

## Non-Goals For Early Phases

- do not make external AI mandatory for baseline conversion
- do not merge all stages into a single Python script
- do not depend on renderer-only logic for core conversion
- do not treat Markdown prettification as equivalent to layout recovery
