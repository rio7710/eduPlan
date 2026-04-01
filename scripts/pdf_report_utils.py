from __future__ import annotations

import json
from pathlib import Path


def write_report_files(report_dir: Path, report_name: str, payload: dict) -> list[str]:
    report_dir.mkdir(parents=True, exist_ok=True)
    json_name = f"{report_name}_report.json"
    md_name = f"{report_name}_report.md"
    json_path = report_dir / json_name
    md_path = report_dir / md_name
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    md_path.write_text(build_report_markdown(payload), encoding="utf-8")
    return [json_name, md_name]


def build_report_markdown(payload: dict) -> str:
    lines = [
        f"# {payload.get('title', 'PDF Conversion Report')}",
        "",
        f"- source: `{payload.get('source', '')}`",
        f"- status: `{payload.get('status', 'unknown')}`",
        f"- pageCount: `{payload.get('pageCount', 0)}`",
    ]
    metrics = payload.get("metrics", {})
    for key in ("textPages", "emptyTextPages", "totalImages", "totalBlocks"):
        if key in metrics:
            lines.append(f"- {key}: `{metrics[key]}`")
    warnings = payload.get("warnings", [])
    lines.extend(["", "## Summary", "", str(payload.get("summary", "")), ""])
    if warnings:
        lines.append("## Warnings")
        lines.append("")
        for warning in warnings:
            lines.append(f"- {warning}")
        lines.append("")
    coverage = payload.get("coverage", {})
    if coverage:
        lines.append("## Coverage")
        lines.append("")
        for key in ("missingPageCount", "missingTextBlocks", "missingBoxedTextBlocks"):
            if key in coverage:
                lines.append(f"- {key}: `{coverage[key]}`")
        if coverage.get("missingPages"):
            lines.append(f"- missingPages: `{coverage['missingPages']}`")
        lines.append("")
    artifacts = payload.get("artifacts", [])
    if artifacts:
        lines.append("## Artifacts")
        lines.append("")
        for artifact in artifacts:
            lines.append(f"- `{artifact}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
