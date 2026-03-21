from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path


def tokenize_words(value: str) -> list[str]:
    return [word for word in str(value or "").strip().split() if word]


def has_substantive_text(value: str) -> bool:
    normalized = str(value or "").strip()
    if not normalized:
        return False
    normalized = normalized.replace("#", "").replace("-", "").replace("*", "").strip()
    return bool(normalized)


def map_change_type_to_action(change_type: str) -> str:
    if change_type == "merge":
        return "merge"
    if change_type == "split":
        return "split"
    return "modify"


def infer_content_kind(original_text: str, edited_text: str) -> str:
    merged = f"{original_text}\n{edited_text}".strip()
    line_count = len([line for line in merged.splitlines() if line.strip()])
    if line_count >= 3 or len(original_text.strip()) >= 120 or len(edited_text.strip()) >= 120:
        return "paragraph"
    return "sentence"


def score_patch_quality(diff_summary: str, change_type: str) -> float:
    diff_length = len((diff_summary or "").strip())
    score = 1.0
    if diff_length < 10:
        score -= 0.5
    if diff_length > 5000:
        score -= 0.3

    action_weight = {
        "merge": 1.0,
        "split": 1.0,
        "modify": 0.8,
        "delete": 0.6,
        "create": 0.7,
    }.get(map_change_type_to_action(change_type), 0.5)
    score *= action_weight
    return max(0.0, min(1.0, round(score, 3)))


def extract_focused_word_window(old_text: str, new_text: str, context_word_count: int = 4) -> dict[str, str]:
    old_words = tokenize_words(old_text)
    new_words = tokenize_words(new_text)

    prefix_length = 0
    while (
        prefix_length < len(old_words)
        and prefix_length < len(new_words)
        and old_words[prefix_length] == new_words[prefix_length]
    ):
        prefix_length += 1

    old_suffix = len(old_words) - 1
    new_suffix = len(new_words) - 1
    while (
        old_suffix >= prefix_length
        and new_suffix >= prefix_length
        and old_words[old_suffix] == new_words[new_suffix]
    ):
        old_suffix -= 1
        new_suffix -= 1

    left_context = " ".join(old_words[max(0, prefix_length - context_word_count):prefix_length])
    right_context = " ".join(
        old_words[max(prefix_length, old_suffix + 1): min(len(old_words), old_suffix + 1 + context_word_count)]
    )
    original_focus = " ".join(old_words[prefix_length:max(prefix_length, old_suffix + 1)]) or old_text.strip()
    edited_focus = " ".join(new_words[prefix_length:max(prefix_length, new_suffix + 1)]) or new_text.strip()

    return {
        "left_context": left_context,
        "right_context": right_context,
        "before_focus": original_focus,
        "after_focus": edited_focus,
    }


def extract_changed_segments(old_text: str, new_text: str, context_word_count: int = 4) -> list[dict[str, str]]:
    old_words = tokenize_words(old_text)
    new_words = tokenize_words(new_text)
    matcher = difflib.SequenceMatcher(a=old_words, b=new_words)
    segments: list[dict[str, str]] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue

        before_focus = " ".join(old_words[i1:i2]).strip()
        after_focus = " ".join(new_words[j1:j2]).strip()
        left_context = " ".join(old_words[max(0, i1 - context_word_count):i1]).strip()
        right_context = " ".join(old_words[i2:min(len(old_words), i2 + context_word_count)]).strip()

        if not before_focus and not after_focus:
            continue

        segments.append({
            "left_context": left_context,
            "right_context": right_context,
            "before_focus": before_focus,
            "after_focus": after_focus,
        })

    if segments:
        return segments

    return [extract_focused_word_window(old_text, new_text, context_word_count)]


def load_payload(payload_path: str) -> dict:
    return json.loads(Path(payload_path).read_text(encoding="utf-8"))


def build_item(
    file_path: str,
    file_name: str,
    created_at: str,
    base_id: str,
    line_start: int,
    line_end: int,
    change_type: str,
    original_window: str,
    edited_window: str,
) -> list[dict]:
    quality_score = score_patch_quality(f"- {original_window}\n+ {edited_window}", change_type)
    content_kind = infer_content_kind(original_window, edited_window)
    action = map_change_type_to_action(change_type)
    segments = extract_changed_segments(original_window, edited_window, 4)
    items: list[dict] = []

    for index, segment in enumerate(segments, start=1):
        focused_original_text = segment["before_focus"] or original_window.strip()
        focused_edited_text = segment["after_focus"] or edited_window.strip()
        items.append({
            "id": f"{base_id}:{index}",
            "type": "sentence_edit",
            "sourcePdfName": file_name,
            "sourcePdfPath": file_path,
            "markdownPath": file_path,
            "reviewDir": str(Path(file_path).parent),
            "previewImagePath": "",
            "candidateCount": 1,
            "memberPaths": [],
            "createdAt": created_at,
            "status": "pending" if quality_score >= 0.7 else "archived",
            "editType": change_type,
            "contentKind": content_kind,
            "action": action,
            "qualityScore": quality_score,
            "lineStart": line_start,
            "lineEnd": line_end,
            "leftContext": segment["left_context"],
            "beforeFocus": segment["before_focus"],
            "afterFocus": segment["after_focus"],
            "rightContext": segment["right_context"],
            "originalText": focused_original_text,
            "editedText": focused_edited_text,
            "originalWindow": original_window,
            "editedWindow": edited_window,
            "diffSummary": f"- {focused_original_text}\n+ {focused_edited_text}",
            "finalAction": "",
        })

    return items


def infer_change_type(original_window: str, edited_window: str) -> str:
    old_compact = "".join(original_window.split())
    new_compact = "".join(edited_window.split())
    if old_compact == new_compact and original_window != edited_window:
        return "spacing"
    old_line_count = len([line for line in original_window.splitlines() if line.strip()])
    new_line_count = len([line for line in edited_window.splitlines() if line.strip()])
    if old_line_count > 1 and new_line_count == 1:
        return "merge"
    if old_line_count == 1 and new_line_count > 1:
        return "split"
    return "typo"


def analyze_document(file_path: str, file_name: str, before_content: str, after_content: str, created_at: str) -> list[dict]:
    before_lines = before_content.splitlines()
    after_lines = after_content.splitlines()
    matcher = difflib.SequenceMatcher(a=before_lines, b=after_lines)
    items: list[dict] = []
    patch_index = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        original_window = "\n".join(before_lines[i1:i2]).strip()
        edited_window = "\n".join(after_lines[j1:j2]).strip()
        if not original_window and not edited_window:
            continue
        patch_index += 1
        items.extend(build_item(
            file_path=file_path,
            file_name=file_name,
            created_at=created_at,
            base_id=f"docdiff:{patch_index}",
            line_start=i1 + 1,
            line_end=max(i2, i1 + 1),
            change_type=infer_change_type(original_window, edited_window),
            original_window=original_window,
            edited_window=edited_window,
        ))
    return items


def should_keep_item(item: dict) -> bool:
    original_text = str(item.get("originalText", "")).strip()
    edited_text = str(item.get("editedText", "")).strip()
    if not original_text and not edited_text:
        return False
    if original_text == edited_text:
        return False
    if not has_substantive_text(original_text) and not has_substantive_text(edited_text):
        return False
    return True


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Analyze sentence edits for ML review")
    parser.add_argument("--input", required=True, help="Path to JSON payload")
    args = parser.parse_args()

    payload = load_payload(args.input)
    file_path = str(payload.get("file_path", ""))
    file_name = str(payload.get("file_name", Path(file_path).name if file_path else ""))
    created_at = str(payload.get("created_at", ""))
    before_content = str(payload.get("before_content", ""))
    after_content = str(payload.get("after_content", ""))
    items = analyze_document(file_path, file_name, before_content, after_content, created_at)
    items = [item for item in items if should_keep_item(item)]
    response = {
        "task_type": "sentence_edit",
        "items": items,
        "logs": [f"analyzed {len(items)} sentence edit candidates"],
        "errors": [],
    }
    sys.stdout.write(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    main()
