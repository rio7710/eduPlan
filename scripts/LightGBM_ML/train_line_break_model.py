from __future__ import annotations

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np

from line_break_features import extract_features
from line_break_synth import LABELS, LABEL_TO_ID, generate_dataset


def _load_user_rows(artifact_dir: Path) -> list[dict]:
    target_path = artifact_dir / "user_line_break_pairs.jsonl"
    if not target_path.is_file():
        return []
    rows: list[dict] = []
    for raw_line in target_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not raw_line.strip():
            continue
        try:
            row = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        if row.get("label") not in LABEL_TO_ID:
            continue
        rows.append(row)
    return rows


def _split_rows(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    split_at = int(len(rows) * 0.8)
    return rows[:split_at], rows[split_at:]


def _to_arrays(rows: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    features = np.asarray([extract_features(row["left"], row["right"]) for row in rows], dtype=float)
    labels = np.asarray([LABEL_TO_ID[row["label"]] for row in rows], dtype=int)
    return features, labels


def _accuracy(predictions: np.ndarray, labels: np.ndarray) -> float:
    if len(labels) == 0:
        return 0.0
    return float((predictions == labels).sum() / len(labels))


def main() -> None:
    root_dir = Path(__file__).resolve().parent
    artifact_dir = root_dir / "artifacts"
    artifact_dir.mkdir(parents=True, exist_ok=True)

    user_rows = _load_user_rows(artifact_dir)
    synth_rows = generate_dataset()
    rows = [*user_rows, *synth_rows]
    train_rows, valid_rows = _split_rows(rows)
    x_train, y_train = _to_arrays(train_rows)
    x_valid, y_valid = _to_arrays(valid_rows)

    train_set = lgb.Dataset(x_train, label=y_train)
    model = lgb.train(
        {
            "objective": "multiclass",
            "num_class": len(LABELS),
            "learning_rate": 0.08,
            "num_leaves": 31,
            "min_data_in_leaf": 8,
            "seed": 42,
            "verbosity": -1,
        },
        train_set,
        num_boost_round=120,
    )

    valid_pred = np.argmax(model.predict(x_valid), axis=1)
    metrics = {
        "userRows": int(len(user_rows)),
        "synthRows": int(len(synth_rows)),
        "totalRows": int(len(rows)),
        "trainRows": int(len(train_rows)),
        "validRows": int(len(valid_rows)),
        "labelOrder": LABELS,
        "validAccuracy": round(_accuracy(valid_pred, y_valid), 4),
    }

    train_path = artifact_dir / "line_break_train.jsonl"
    train_path.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows),
        encoding="utf-8",
    )
    (artifact_dir / "line_break_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    model.save_model(str(artifact_dir / "line_break_model.txt"))
    print(json.dumps(metrics, ensure_ascii=False))


if __name__ == "__main__":
    main()
