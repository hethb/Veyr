#!/usr/bin/env python3
"""Strip SwiftUI #Preview blocks from SPM dependency checkouts.

The #Preview macro requires the PreviewsMacros compiler plugin, which ships
with full Xcode but not with Command Line Tools. Previews are dev-time-only
sugar, so removing them changes nothing at runtime. Safe to run repeatedly;
re-run after `swift package resolve/update` refreshes the checkouts.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECKOUTS = ROOT / ".build" / "checkouts"


def strip_previews(text: str) -> tuple[str, int]:
    lines = text.split("\n")
    out: list[str] = []
    removed = 0
    i = 0
    while i < len(lines):
        if lines[i].lstrip().startswith("#Preview"):
            depth = 0
            started = False
            while i < len(lines):
                for ch in lines[i]:
                    if ch == "{":
                        depth += 1
                        started = True
                    elif ch == "}":
                        depth -= 1
                i += 1
                if started and depth <= 0:
                    break
            removed += 1
            continue
        out.append(lines[i])
        i += 1
    return "\n".join(out), removed


def main() -> int:
    if not CHECKOUTS.is_dir():
        print(f"no checkouts at {CHECKOUTS}; nothing to do")
        return 0
    total = 0
    for swift_file in CHECKOUTS.rglob("*.swift"):
        text = swift_file.read_text()
        if "#Preview" not in text:
            continue
        stripped, removed = strip_previews(text)
        if removed:
            swift_file.chmod(0o644)
            swift_file.write_text(stripped)
            total += removed
            print(f"stripped {removed} #Preview block(s): {swift_file.relative_to(ROOT)}")
    print(f"done — {total} block(s) removed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
