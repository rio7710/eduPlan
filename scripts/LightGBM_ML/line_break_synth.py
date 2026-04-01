from __future__ import annotations

import random

LABELS = ["keep_break", "merge_space", "merge_no_space"]
LABEL_TO_ID = {label: index for index, label in enumerate(LABELS)}

SUBJECTS = ["사회복지 현장", "슈퍼바이저", "실천 현장", "지역사회복지관", "복지서비스 체계"]
OBJECTS = ["표준 지침", "문서화 과정", "조직적 역학", "현장 슈퍼비전", "학습 문화"]
VERBS = ["이해해야 한다", "검토할 필요가 있다", "강조되고 있다", "구축되어야 한다", "고려해야 한다"]
MODIFIERS = ["지속적으로", "현장 중심으로", "구체적으로", "단계적으로", "실천적으로"]


def build_sentence(rng: random.Random) -> str:
    subject = rng.choice(SUBJECTS)
    obj = rng.choice(OBJECTS)
    verb = rng.choice(VERBS)
    modifier = rng.choice(MODIFIERS)
    return f"{subject}의 특성에 맞는 {obj}을 {modifier} {verb}"


def split_inside_word(text: str, rng: random.Random) -> tuple[str, str]:
    words = [word for word in text.split(" ") if len(word) >= 3]
    target = rng.choice(words)
    split_at = rng.randint(1, len(target) - 1)
    left_part = target[:split_at]
    right_part = target[split_at:]
    left_text, right_text = text.split(target, 1)
    return f"{left_text}{left_part}".rstrip(), f"{right_part}{right_text}".lstrip()


def split_between_words(text: str, rng: random.Random) -> tuple[str, str]:
    words = text.split(" ")
    split_at = rng.randint(1, len(words) - 1)
    return " ".join(words[:split_at]), " ".join(words[split_at:])


def build_record(label: str, left: str, right: str) -> dict:
    return {"left": left, "right": right, "label": label}


def generate_dataset(seed: int = 42, per_label: int = 1800) -> list[dict]:
    rng = random.Random(seed)
    rows: list[dict] = []
    for _ in range(per_label):
        sentence = build_sentence(rng)
        left, right = split_inside_word(sentence, rng)
        rows.append(build_record("merge_no_space", left, right))

        sentence = build_sentence(rng)
        left, right = split_between_words(sentence, rng)
        rows.append(build_record("merge_space", left, right))

        sentence = build_sentence(rng)
        left, right = split_between_words(sentence, rng)
        rows.append(build_record("keep_break", f"{left}.", right))

    rng.shuffle(rows)
    return rows
