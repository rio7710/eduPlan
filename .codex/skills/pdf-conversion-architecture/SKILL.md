---
name: pdf-conversion-architecture
description: Plan or update eduFixer's PDF conversion architecture, framework choices, tool boundaries, OCR strategy, Korean line-break recovery, table extraction, and AI finalization flow. Use when Codex needs to design or revise the PDF pipeline, write related internal docs, define TODOs, or keep implementation aligned with the repo's Electron and Python boundaries.
---

# PDF Conversion Architecture

Use this skill together with the repo `AGENTS.md` and `edufixer-guardrails`.

## Workflow

1. Keep `eduFixer` as the only project root.
2. Preserve the current boundary:
   - React UI in `src/`
   - IPC entry points in `electron/handlers/`
   - Python execution helpers in `electron/lib/`
   - PDF conversion pipeline in `scripts/`
3. Treat PDF conversion as a deterministic local pipeline first.
4. Place AI after conversion as a finalization or suggestion layer.
5. Prefer narrow changes and modular tools over broad refactors.

## Core Product Direction

- Support both native PC PDFs and image-based scanned PDFs.
- Preserve document reading order and visible layout as much as practical.
- Detect tables and convert table-like text into explicit table structures.
- Add a Korean-focused line-break recovery stage early in the pipeline.
- Keep the pipeline tool-shaped so web and mobile versions can reuse it later.
- Keep Python as the current execution home for the conversion pipeline.

## Framework Choice

- Use `Docling` as the primary PDF understanding framework.
- Use Docling OCR capabilities first when OCR is required.
- Consider `OCRmyPDF` as a preprocessing tool when scanned PDFs need a stable searchable text layer.
- Keep `PyMuPDF` or `PyMuPDF4LLM` as lightweight fallback paths instead of the primary architecture.

Read [framework-guide.md](references/framework-guide.md) before making design decisions or updating planning docs.

## Required Pipeline Shape

Model the pipeline as small tools with one orchestrator.

Recommended tool boundaries:
- `input_resolver`
- `ocr_tool`
- `layout_tool`
- `line_merge_tool`
- `paragraph_builder_tool`
- `table_candidate_tool`
- `table_builder_tool`
- `asset_tool`
- `quality_tool`
- `export_tool`
- `document_conversion_runner`

Do not collapse OCR, layout, line merge, table detection, export, and AI finalization into one large script.

## Korean Line-Break Recovery

Treat line-break recovery as a first-class module.

The `line_merge_tool` should decide at least:
- `merge`
- `keep_break`
- `table_candidate`

Use layout signals and text signals together:
- line text
- next line text
- bounding boxes
- indentation
- alignment
- punctuation
- numbering and bullet patterns
- Korean sentence endings

## AI Finalization Layer

AI is not the source of truth for initial conversion.

Use AI only after the local pipeline has produced a structured document. The AI layer may:
- propose paragraph merges or splits
- propose heading hierarchy fixes
- propose OCR correction candidates
- propose table recovery improvements
- rewrite for consistency only when the user chooses to apply it

Provider order:
1. local AI
2. external AI provider

Provider modules should stay swappable:
- `local_ai_provider`
- `openai_provider`
- `gemini_provider`
- `claude_provider`

## ML Decision Layer

Use ML for decision points, not for the whole conversion pipeline.

Priority candidates:
- OCR-needed detection
- line merge decision
- table candidate detection
- quality scoring

Prefer a deterministic baseline first, then add trainable decision modules using user-reviewed corrections.

## Documentation Tasks

When the user asks for planning or guide updates:
1. Update the framework guide first.
2. Keep requirement and architecture notes separate from implementation TODOs.
3. Call out assumptions and scope boundaries explicitly.
4. Note whether a statement is current implementation, required behavior, or future direction.
