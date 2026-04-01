from __future__ import annotations

import argparse
import json
from pathlib import Path

from pdf_extract_stage_ops import run_extract_images, run_extract_text, run_inspect, run_validate
from pdf_layout_utils import write_json


def run_extract_layout(pdf_path: Path, output_dir: Path) -> dict:
    from pdf_extract_stage_ops import build_output_dirs, stage_dir
    from pdf_layout_utils import collect_layout_payload

    output_paths = build_output_dirs(output_dir)
    with fitz.open(pdf_path) as doc:
        payload = collect_layout_payload(doc)
    result = {
        "stage": "extract_layout",
        "summary": payload["summary"],
        "pages": payload["pages"],
        "totalBlocks": payload["totalBlocks"],
        "artifacts": ["stage_03_layout/layout.json", f"layout/{pdf_path.stem}_layout.json"],
    }
    write_json(stage_dir(output_dir, "stage_03_layout") / "layout.json", result)
    write_json(output_paths["layout"] / f"{pdf_path.stem}_layout.json", result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Run staged PDF extraction for developer verification.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--stage", required=True, choices=["inspect", "extract_text", "extract_images", "extract_layout", "validate"])
    parser.add_argument("-o", "--output-dir", type=Path, required=True)
    args = parser.parse_args()

    pdf_path = args.pdf.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    runners = {
        "inspect": run_inspect,
        "extract_text": run_extract_text,
        "extract_images": run_extract_images,
        "extract_layout": run_extract_layout,
        "validate": run_validate,
    }
    result = runners[args.stage](pdf_path, output_dir)
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
