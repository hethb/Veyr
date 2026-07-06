#!/usr/bin/env python3
# Veyr — original code
# https://github.com/hethb/Veyr
# SPDX-License-Identifier: MIT
# Copyright (c) 2025 Heth Bhatt
"""Train a task-complexity classifier from Veyr's labeled session samples.

Dev-side tool only — never shipped with the app. Reads the training data the
Veyr Mac app collects at ~/.veyr/ml/training-data.jsonl (labeled via the Agent
tab's session ratings), trains small classifiers, reports accuracy against the
current shipped heuristics, and writes upgraded thresholds into
~/.veyr/config.json under `complexityHeuristics` — the exact format the
proxy's heuristicTuner.ts reads, so the runtime picks it up with zero changes.

Usage:
    python train.py                  # train + write config if data suffices
    python train.py --dry-run        # train + report, never write
    python train.py --data path.jsonl --config out.json --min-samples 30
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

LABELS = ["simple", "moderate", "complex"]

# Defaults mirrored from packages/proxy/src/optimization/heuristicTuner.ts.
DEFAULT_SIMPLE_MAX_CHARS = 300
DEFAULT_COMPLEX_MIN_CHARS = 3000

# Mirrored from quickComplexityEstimate's simple-command prefix list.
SIMPLE_COMMAND_VERBS = {
    "read", "open", "show", "list", "find", "grep", "cat", "ls", "pwd", "cd", "git",
}


@dataclass
class Sample:
    user_message_length: int
    system_prompt_length: int
    file_count: int
    extension_count: int
    has_code_block: bool
    question_mark: bool
    verb_prefix: str | None
    label: str  # userFeedbackComplexity (ground truth)
    llm_classification: str


def load_labeled_samples(path: Path) -> list[Sample]:
    samples: list[Sample] = []
    if not path.exists():
        return samples
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        label = row.get("userFeedbackComplexity")
        if label not in LABELS:
            continue
        samples.append(
            Sample(
                user_message_length=int(row.get("userMessageLength", 0)),
                system_prompt_length=int(row.get("systemPromptLength", 0)),
                file_count=int(row.get("fileCount", 0)),
                extension_count=len(row.get("fileExtensions", []) or []),
                has_code_block=bool(row.get("hasCodeBlock", False)),
                question_mark=bool(row.get("questionMark", False)),
                verb_prefix=row.get("verbPrefix"),
                label=label,
                llm_classification=str(row.get("llmClassification", "")),
            )
        )
    return samples


def feature_matrix(samples: list[Sample]) -> np.ndarray:
    return np.array(
        [
            [
                s.user_message_length,
                s.system_prompt_length,
                s.file_count,
                s.extension_count,
                1.0 if s.has_code_block else 0.0,
                1.0 if s.question_mark else 0.0,
                1.0 if (s.verb_prefix or "") in SIMPLE_COMMAND_VERBS else 0.0,
            ]
            for s in samples
        ],
        dtype=float,
    )


FEATURE_NAMES = [
    "user_message_length",
    "system_prompt_length",
    "file_count",
    "extension_count",
    "has_code_block",
    "question_mark",
    "simple_command_verb",
]


def heuristic_predict(s: Sample, simple_max: int, complex_min: int) -> str:
    """Faithful port of quickComplexityEstimate over the stored features."""
    total_chars = s.user_message_length + s.system_prompt_length
    is_question = s.question_mark and total_chars < 500
    is_simple_command = (s.verb_prefix or "") in SIMPLE_COMMAND_VERBS
    if is_simple_command or (is_question and total_chars < simple_max):
        return "simple"
    if s.file_count > 2 or total_chars > complex_min:
        return "complex"
    if s.has_code_block or total_chars > 1000:
        return "moderate"
    return "simple"


def accuracy(predictions: list[str], truths: list[str]) -> float:
    hits = sum(1 for p, t in zip(predictions, truths) if p == t)
    return hits / len(truths) if truths else 0.0


def load_current_heuristics(config_path: Path) -> tuple[int, int]:
    try:
        config = json.loads(config_path.read_text())
        h = config.get("complexityHeuristics", {})
        return (
            int(h.get("simpleMaxChars", DEFAULT_SIMPLE_MAX_CHARS)),
            int(h.get("complexMinChars", DEFAULT_COMPLEX_MIN_CHARS)),
        )
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return DEFAULT_SIMPLE_MAX_CHARS, DEFAULT_COMPLEX_MIN_CHARS


def derive_thresholds(samples: list[Sample]) -> tuple[int, int]:
    """Extract length cut points from a depth-2 tree on message length alone,
    clamped to the same sane ranges heuristicTuner.ts uses."""
    lengths = np.array([[s.user_message_length] for s in samples], dtype=float)
    labels = [s.label for s in samples]
    tree = DecisionTreeClassifier(max_depth=2, random_state=0)
    tree.fit(lengths, labels)
    cuts = sorted(
        t for t, f in zip(tree.tree_.threshold, tree.tree_.feature) if f == 0
    )
    simple_max = int(cuts[0]) if cuts else DEFAULT_SIMPLE_MAX_CHARS
    complex_min = int(cuts[-1]) if len(cuts) > 1 else DEFAULT_COMPLEX_MIN_CHARS
    simple_max = max(100, min(1000, simple_max))
    complex_min = max(max(simple_max * 2, 1000), min(10000, complex_min))
    return simple_max, complex_min


def write_config(config_path: Path, simple_max: int, complex_min: int, n: int) -> None:
    """Same shape heuristicTuner.ts persists; other config keys preserved."""
    existing: dict = {}
    try:
        parsed = json.loads(config_path.read_text())
        if isinstance(parsed, dict):
            existing = parsed
    except (OSError, json.JSONDecodeError):
        pass
    existing["complexityHeuristics"] = {
        "simpleMaxChars": simple_max,
        "complexMinChars": complex_min,
        "tunedFromSamples": n,
    }
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(existing, indent=2) + "\n")


def main() -> int:
    home = Path.home()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data", type=Path, default=home / ".veyr" / "ml" / "training-data.jsonl"
    )
    parser.add_argument(
        "--config", type=Path, default=home / ".veyr" / "config.json"
    )
    parser.add_argument("--min-samples", type=int, default=50)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    samples = load_labeled_samples(args.data)
    print(f"labeled samples: {len(samples)}  ({args.data})")
    if len(samples) < args.min_samples:
        print(
            f"not enough labeled data (need {args.min_samples}). "
            "Rate more sessions in Veyr's Agent tab."
        )
        return 2

    truths = [s.label for s in samples]
    class_counts = {label: truths.count(label) for label in LABELS}
    print(f"class balance: {class_counts}")

    # --- Baselines -----------------------------------------------------------
    simple_max, complex_min = load_current_heuristics(args.config)
    heuristic_preds = [heuristic_predict(s, simple_max, complex_min) for s in samples]
    heuristic_acc = accuracy(heuristic_preds, truths)
    llm_agreement = accuracy([s.llm_classification for s in samples], truths)
    print(f"\ncurrent heuristics ({simple_max}/{complex_min} chars): "
          f"{heuristic_acc:.1%} accuracy vs your labels")
    print(f"Haiku classifier agreement with your labels: {llm_agreement:.1%}")

    # --- Models (cross-validated) --------------------------------------------
    X = feature_matrix(samples)
    y = np.array(truths)
    n_splits = max(2, min(5, min(class_counts[l] for l in LABELS if class_counts[l]) or 2))
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=0)

    tree = DecisionTreeClassifier(max_depth=3, random_state=0)
    tree_acc = cross_val_score(tree, X, y, cv=cv).mean()

    logistic = make_pipeline(
        StandardScaler(), LogisticRegression(max_iter=2000, random_state=0)
    )
    logistic_acc = cross_val_score(logistic, X, y, cv=cv).mean()

    print(f"\ndecision tree (depth 3, {n_splits}-fold CV): {tree_acc:.1%}")
    print(f"logistic regression ({n_splits}-fold CV):     {logistic_acc:.1%}")

    tree.fit(X, y)
    importances = sorted(
        zip(FEATURE_NAMES, tree.feature_importances_), key=lambda p: -p[1]
    )
    print("\ntop features (tree importance):")
    for name, importance in importances[:4]:
        if importance > 0:
            print(f"  {name:24s} {importance:.2f}")

    # --- Threshold upgrade ----------------------------------------------------
    new_simple, new_complex = derive_thresholds(samples)
    upgraded_preds = [heuristic_predict(s, new_simple, new_complex) for s in samples]
    upgraded_acc = accuracy(upgraded_preds, truths)
    print(f"\nupgraded thresholds ({new_simple}/{new_complex} chars): "
          f"{upgraded_acc:.1%} accuracy vs your labels")

    best_model_acc = max(tree_acc, logistic_acc)
    if best_model_acc > upgraded_acc + 0.05:
        print(
            "note: the full-feature model beats length thresholds by "
            f"{best_model_acc - upgraded_acc:.1%} — worth wiring model inference "
            "into the runtimes when this gap holds on more data."
        )

    if args.dry_run:
        print("\n--dry-run: config not written")
        return 0
    if upgraded_acc < heuristic_acc:
        print("\nupgraded thresholds do not beat the current ones — config not written")
        return 0

    write_config(args.config, new_simple, new_complex, len(samples))
    print(f"\nwrote complexityHeuristics to {args.config} "
          f"(simpleMaxChars={new_simple}, complexMinChars={new_complex}, "
          f"tunedFromSamples={len(samples)})")
    print("the proxy picks this up within 30s (shared-config TTL); "
          "restart it to apply immediately.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
