from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from reference_page_alignment import align_reference_to_pages

IMAGE_REF_RE = re.compile(r"^\[이미지\s+\d+:.+\]\s*$")
BULLET_RE = re.compile(r"^\s*(?:[○●ㆍ]|[-*+]\s|\d+[.)]\s)")
PAGE_MARKER_RE = re.compile(r"^\s*-\s*\d+\s*-\s*$")
RULE_LEADER_RE = re.compile(r"^\s*(?:[○●ㆍ※★]|[-*+]\s|\d+(?:-\d+)*[.)]?)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Refine merged markdown with a sibling text reference.")
    parser.add_argument("--markdown", required=True, type=Path)
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--replace-json", type=Path, default=None)
    return parser.parse_args()


def normalize(text: str) -> str:
    return "".join(char for char in text if not char.isspace())


def build_reference_index(text: str) -> tuple[str, list[int]]:
    normalized_chars: list[str] = []
    positions: list[int] = []
    for index, char in enumerate(text):
        if char.isspace():
            continue
        normalized_chars.append(char)
        positions.append(index)
    return "".join(normalized_chars), positions


def build_reference_line_map(text: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or is_structural_line(line):
            continue
        mapping[normalize(line)] = line.rstrip()
    return mapping


def is_structural_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if PAGE_MARKER_RE.match(stripped):
        return True
    if stripped == "---":
        return True
    if IMAGE_REF_RE.match(stripped):
        return True
    return False


def is_bridgeable_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if PAGE_MARKER_RE.match(stripped):
        return True
    if stripped == "---":
        return True
    return False


def has_rule_leader(line: str) -> bool:
    return RULE_LEADER_RE.match(line.strip()) is not None


def is_continuation_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if is_structural_line(line):
        return False
    if has_rule_leader(line):
        return False
    return True


def merge_split_lines_two_line(
    lines: list[str], reference_lines: dict[str, str]
) -> tuple[list[str], int, int, int, list[dict]]:
    output: list[str] = []
    replacements: list[dict] = []
    candidate_count = 0
    merged_count = 0
    chained_count = 0
    index = 0

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped or is_structural_line(line):
            output.append(line)
            index += 1
            continue

        next_index = index + 1
        skipped: list[str] = []
        while next_index < len(lines) and is_bridgeable_line(lines[next_index]):
            skipped.append(lines[next_index])
            next_index += 1
        if next_index >= len(lines) or is_structural_line(lines[next_index]):
            output.append(line)
            output.extend(skipped)
            index = next_index
            continue

        next_line = lines[next_index]
        if BULLET_RE.match(stripped) and BULLET_RE.match(next_line.strip()):
            output.append(line)
            output.extend(skipped)
            index = next_index
            continue

        candidate_count += 1
        first_before = "\n".join([line, next_line]).strip()
        first_after = reference_lines.get(normalize(first_before))
        if first_after is None:
            third_skipped: list[str] = []
            third_index = next_index + 1
            while third_index < len(lines) and is_bridgeable_line(lines[third_index]):
                third_skipped.append(lines[third_index])
                third_index += 1
            if third_index >= len(lines) or is_structural_line(lines[third_index]):
                output.append(line)
                output.extend(skipped)
                index = next_index
                continue

            third_line = lines[third_index]
            if has_rule_leader(line) and not is_continuation_line(third_line):
                output.append(line)
                output.extend(skipped)
                index = next_index
                continue

            candidate_count += 1
            merged_three_before = "\n".join([line, next_line, third_line]).strip()
            merged_three_after = reference_lines.get(normalize(merged_three_before))
            if merged_three_after is None:
                output.append(line)
                output.extend(skipped)
                index = next_index
                continue

            synthetic_after = f"{line}{next_line}".strip()
            if first_before and synthetic_after and first_before != synthetic_after:
                replacements.append({
                    "kind": "merge_two_line",
                    "before": first_before,
                    "after": synthetic_after,
                })
                merged_count += 1

            chained_before = f"{synthetic_after}\n{third_line}".strip()
            chained_after = merged_three_after.strip()
            if chained_before and chained_after and chained_before != chained_after:
                replacements.append({
                    "kind": "merge_two_line_chain",
                    "before": chained_before,
                    "after": chained_after,
                })
                merged_count += 1
                chained_count += 1

            output.append(merged_three_after)
            index = third_index + 1
            continue

        output_line = first_after
        merged_count += 1
        if first_before and first_after.strip() and first_before != first_after.strip():
            replacements.append({
                "kind": "merge_two_line",
                "before": first_before,
                "after": first_after.strip(),
            })
        index = next_index + 1

        chained_skipped: list[str] = []
        probe_index = index
        while probe_index < len(lines) and is_bridgeable_line(lines[probe_index]):
            chained_skipped.append(lines[probe_index])
            probe_index += 1

        chain_applied = False
        if probe_index < len(lines) and not is_structural_line(lines[probe_index]):
            candidate_count += 1
            chained_line = lines[probe_index]
            if not (has_rule_leader(line) and not is_continuation_line(chained_line)):
                chained_before = "\n".join([output_line, chained_line]).strip()
                chained_after = reference_lines.get(normalize(chained_before))
                if chained_after is not None:
                    output_line = chained_after
                    merged_count += 1
                    chained_count += 1
                    chain_applied = True
                    if chained_before and chained_after.strip() and chained_before != chained_after.strip():
                        replacements.append({
                            "kind": "merge_two_line_chain",
                            "before": chained_before,
                            "after": chained_after.strip(),
                        })
                    index = probe_index + 1

        output.append(output_line)
        if not chain_applied:
            output.extend(chained_skipped)

    return output, candidate_count, merged_count, chained_count, replacements


def refine_markdown(markdown_text: str, reference_text: str) -> tuple[str, dict, list[dict]]:
    _page_aligned_text, page_summary = align_reference_to_pages(markdown_text, reference_text)
    reference_lines = build_reference_line_map(reference_text)
    merged_output, candidate_count, merged_count, chained_count, replacements = merge_split_lines_two_line(
        markdown_text.splitlines(), reference_lines
    )
    return "\n".join(merged_output) + ("\n" if markdown_text.endswith("\n") else ""), {
        **page_summary,
        "matchedSegments": merged_count,
        "candidate2LineCount": candidate_count,
        "applied2LineCount": merged_count,
        "chained2LineCount": chained_count,
        "mergedLineBreaks": merged_count,
        "referenceChars": len(reference_text),
    }, replacements


def main() -> None:
    args = parse_args()
    markdown_path = args.markdown.resolve()
    reference_path = args.reference.resolve()
    if not markdown_path.is_file():
        raise FileNotFoundError(f"Markdown file not found: {markdown_path}")
    if not reference_path.is_file():
        raise FileNotFoundError(f"Reference text not found: {reference_path}")

    markdown_text = markdown_path.read_text(encoding="utf-8", errors="ignore")
    reference_text = reference_path.read_text(encoding="utf-8", errors="ignore")
    refined_text, summary, replacements = refine_markdown(markdown_text, reference_text)
    markdown_path.write_text(refined_text, encoding="utf-8")
    if args.replace_json:
        replace_json_path = args.replace_json.resolve()
        replace_json_path.parent.mkdir(parents=True, exist_ok=True)
        replace_json_path.write_text(json.dumps({
            "ok": True,
            "markdownPath": str(markdown_path),
            "referencePath": str(reference_path),
            "count": len(replacements),
            "items": replacements,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "markdownPath": str(markdown_path),
        "referencePath": str(reference_path),
        "replaceCount": len(replacements),
        **summary,
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()
