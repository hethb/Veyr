# Veyr ML workspace (dev-side only)

Offline experimentation on the task-complexity training data the Veyr Mac app
collects at `~/.veyr/ml/training-data.jsonl`. **Nothing here ships with the
app** — the DMG has no Python dependency. Training happens here; the shipping
runtimes (Swift app, Node proxy) only consume the resulting thresholds via
`~/.veyr/config.json`.

## Setup

```bash
cd packages/ml
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Train

```bash
python train.py              # trains, reports, writes upgraded thresholds
python train.py --dry-run    # report only, never writes
```

`train.py` needs ≥50 labeled samples (rate sessions in Veyr → Agent tab).
It reports cross-validated accuracy of a decision tree and logistic regression
against your labels, compares with the currently shipped heuristics and the
Haiku classifier's agreement, and — when the upgraded length thresholds beat
the current ones — writes `complexityHeuristics` into `~/.veyr/config.json`
in the exact format `packages/proxy/src/optimization/heuristicTuner.ts`
reads. The proxy picks it up within 30 seconds.

## Explore

```bash
jupyter notebook explore.ipynb
```

Class balance, length distributions per label, heuristic confusion matrix,
and feature importances.
