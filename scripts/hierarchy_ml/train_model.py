from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import lightgbm as lgb
import numpy as np

from common import TARGET_LABELS, extract_features, infer_reject_label, normalize_record, seed_records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train hierarchy LightGBM model.")
    parser.add_argument("--labels-json", required=True, help="Path to exported hierarchy labels json")
    parser.add_argument("--artifacts-dir", required=True, help="Output directory for model artifacts")
    return parser.parse_args()


def load_manual_records(labels_path: Path) -> list[dict]:
    if not labels_path.is_file():
        return []
    rows = json.loads(labels_path.read_text(encoding="utf-8"))
    records: list[dict] = []
    for row in rows if isinstance(rows, list) else []:
        final_action = str(row.get("final_action", "")).strip().lower()
        label = str(row.get("final_label", "")).strip()
        if final_action == "reject":
            label = infer_reject_label(row)
        elif final_action != "approve":
            continue
        if label not in TARGET_LABELS:
            continue
        record = normalize_record({
            "patternKind": row.get("pattern_kind", ""),
            "candidateText": row.get("candidate_text", ""),
            "recommendationLabel": row.get("recommendation_label", ""),
            "candidateCount": len(row.get("sample_texts", []) or []),
            "sampleTexts": row.get("sample_texts", []),
        })
        record["finalLabel"] = label
        records.append(record)
    return records


def split_rows(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    if len(rows) < 5:
        return rows, rows
    shuffled = rows[:]
    random.Random(42).shuffle(shuffled)
    split_at = max(1, int(len(rows) * 0.8))
    return shuffled[:split_at], shuffled[split_at:]


def main() -> None:
    args = parse_args()
    labels_path = Path(args.labels_json)
    artifacts_dir = Path(args.artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    rows = [*seed_records(), *load_manual_records(labels_path)]
    train_rows, valid_rows = split_rows(rows)
    x_train = np.asarray([extract_features(row) for row in train_rows], dtype=float)
    y_train = np.asarray([TARGET_LABELS.index(row["finalLabel"]) for row in train_rows], dtype=int)
    x_valid = np.asarray([extract_features(row) for row in valid_rows], dtype=float)
    y_valid = np.asarray([TARGET_LABELS.index(row["finalLabel"]) for row in valid_rows], dtype=int)

    model = lgb.train(
        {
            "objective": "multiclass",
            "num_class": len(TARGET_LABELS),
            "learning_rate": 0.08,
            "num_leaves": 23,
            "min_data_in_leaf": 2,
            "seed": 42,
            "verbosity": -1,
        },
        lgb.Dataset(x_train, label=y_train),
        num_boost_round=72,
    )

    predictions = np.argmax(model.predict(x_valid), axis=1) if len(x_valid) else np.asarray([], dtype=int)
    valid_accuracy = float((predictions == y_valid).sum() / len(y_valid)) if len(y_valid) else 0.0
    label_counts = {label: 0 for label in TARGET_LABELS}
    for row in rows:
        label_counts[row["finalLabel"]] += 1

    model.save_model(str(artifacts_dir / "hierarchy_model.txt"))
    (artifacts_dir / "hierarchy_labels.json").write_text(json.dumps(TARGET_LABELS, ensure_ascii=False, indent=2), encoding="utf-8")
    metrics = {
        "seedRows": len(seed_records()),
        "manualRows": len(rows) - len(seed_records()),
        "totalRows": len(rows),
        "trainRows": len(train_rows),
        "validRows": len(valid_rows),
        "validAccuracy": round(valid_accuracy, 4),
        "labelCounts": label_counts,
    }
    (artifacts_dir / "hierarchy_metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metrics, ensure_ascii=False))


if __name__ == "__main__":
    main()
