from __future__ import annotations

import argparse
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np

from common import NOISE_LABELS, TARGET_LABELS, extract_features, normalize_record


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score hierarchy candidates with LightGBM.")
    parser.add_argument("--candidates-json", required=True, help="Path to candidates json")
    parser.add_argument("--artifacts-dir", required=True, help="Directory containing model artifacts")
    return parser.parse_args()


def derive_action(predicted_label: str, recommendation_label: str, confidence: float) -> str:
    if predicted_label in NOISE_LABELS and confidence >= 0.45:
        return "reject"
    if predicted_label == recommendation_label and confidence >= 0.45:
        return "approve"
    return "change"


def main() -> None:
    args = parse_args()
    candidates_path = Path(args.candidates_json)
    artifacts_dir = Path(args.artifacts_dir)
    model = lgb.Booster(model_file=str(artifacts_dir / "hierarchy_model.txt"))
    label_order = json.loads((artifacts_dir / "hierarchy_labels.json").read_text(encoding="utf-8"))
    raw_candidates = json.loads(candidates_path.read_text(encoding="utf-8"))
    candidates = raw_candidates if isinstance(raw_candidates, list) else []

    matrix = np.asarray([extract_features(normalize_record(item)) for item in candidates], dtype=float)
    probabilities = model.predict(matrix)
    results = []
    for item, row in zip(candidates, probabilities):
        best_index = int(np.argmax(row))
        confidence = float(row[best_index])
        predicted_label = str(label_order[best_index]) if best_index < len(label_order) else TARGET_LABELS[0]
        recommendation_label = str(item.get("recommendationLabel", ""))
        results.append({
            **item,
            "recommendationSource": "ML",
            "mlScore": round(confidence, 4),
            "mlRecommendedLabel": predicted_label,
            "mlAction": derive_action(predicted_label, recommendation_label, confidence),
        })

    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
