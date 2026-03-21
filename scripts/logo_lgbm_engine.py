from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np


PAGE_PATTERN = re.compile(r"_(\d{3})_")
FEATURE_COLUMNS = ["repeat_count", "size_bytes", "page_index", "ext_png", "ext_jpeg"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and score logo candidates with LightGBM.")
    parser.add_argument("--features", required=True, help="Path to central train_features.csv")
    parser.add_argument("--candidates", required=True, help="Path to candidates json file")
    return parser.parse_args()


def to_float(value: str | int | float | None) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def parse_page_index(file_name: str) -> float:
    match = PAGE_PATTERN.search(file_name or "")
    return float(match.group(1)) if match else 0.0


def build_feature_vector(payload: dict) -> list[float]:
    ext = str(payload.get("ext", "")).lower()
    return [
        to_float(payload.get("repeat_count")),
        to_float(payload.get("size_bytes")),
        to_float(payload.get("page_index")) or parse_page_index(str(payload.get("file_name", ""))),
        1.0 if ext == ".png" else 0.0,
        1.0 if ext in {".jpg", ".jpeg"} else 0.0,
    ]


def load_training_rows(features_path: Path) -> tuple[np.ndarray, np.ndarray]:
    if not features_path.is_file():
        return np.empty((0, len(FEATURE_COLUMNS))), np.empty((0,))

    feature_rows: list[list[float]] = []
    labels: list[int] = []
    with features_path.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            label = str(row.get("label", "")).strip().lower()
            if label not in {"delete", "keep"}:
                continue
            feature_rows.append([
                to_float(row.get("repeat_count")),
                to_float(row.get("size_bytes")),
                to_float(row.get("page_index")),
                to_float(row.get("ext_png")),
                to_float(row.get("ext_jpeg")),
            ])
            labels.append(1 if label == "delete" else 0)

    if not feature_rows:
        return np.empty((0, len(FEATURE_COLUMNS))), np.empty((0,))
    return np.asarray(feature_rows, dtype=float), np.asarray(labels, dtype=int)


def train_model(features_path: Path) -> lgb.LGBMClassifier | None:
    x_train, y_train = load_training_rows(features_path)
    if len(x_train) < 10:
        return None
    if len(set(y_train.tolist())) < 2:
        return None

    model = lgb.LGBMClassifier(
        objective="binary",
        n_estimators=48,
        learning_rate=0.08,
        num_leaves=15,
        min_child_samples=3,
        random_state=42,
        verbosity=-1,
    )
    model.fit(x_train, y_train)
    return model


def score_candidates(model: lgb.LGBMClassifier | None, candidate_path: Path) -> list[dict]:
    payload = json.loads(candidate_path.read_text(encoding="utf-8"))
    candidates = payload if isinstance(payload, list) else []
    if not model:
        return [{"id": item.get("id"), "mlScore": None, "mlLabel": None} for item in candidates]

    vectors = np.asarray([build_feature_vector(item) for item in candidates], dtype=float)
    probabilities = model.predict_proba(vectors)[:, 1].tolist()
    results = []
    for item, probability in zip(candidates, probabilities):
        results.append({
            "id": item.get("id"),
            "mlScore": round(float(probability), 4),
            "mlLabel": "delete" if probability >= 0.5 else "keep",
        })
    return results


def main() -> None:
    args = parse_args()
    model = train_model(Path(args.features))
    results = score_candidates(model, Path(args.candidates))
    json.dump(results, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
