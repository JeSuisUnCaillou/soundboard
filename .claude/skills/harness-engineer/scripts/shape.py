#!/usr/bin/env python3
"""Measures the shape of the harness files, and checks a split kept every paragraph.

    shape.py [--since YYYY-MM-DD]        one row per skill, thresholds marked with !
    shape.py --duplicates                paragraphs found in two files
    shape.py --register <old> [--tree <dir>]
                                         paragraphs of <old> (a path, or rev:path) missing from the tree

Run it from the repository root. It reads nothing but the files under .claude/skills
and CLAUDE.md; git is asked only for the commit count and for a rev:path.
Standard library only, like the rest of the repository.
"""
import argparse
import glob
import os
import re
import subprocess
import sys
import unicodedata

THRESHOLDS = {"lines": 150, "description": 400, "guardrails": 5}
DATE = re.compile(r"\b20\d\d-[01]\d-[0-3]\d\b")


def files():
    return sorted(glob.glob(".claude/skills/*/SKILL.md"))


def siblings(f):
    d = os.path.dirname(f)
    return sorted(p for p in glob.glob(f"{d}/**/*.md", recursive=True) if p != f)


def read(source):
    if ":" in source and not os.path.exists(source):
        rev, path = source.split(":", 1)
        return subprocess.run(["git", "show", f"{rev}:{path}"], capture_output=True, text=True, check=True).stdout
    with open(source, encoding="utf-8") as h:
        return h.read()


def frontmatter_and_body(text):
    if not text.startswith("---\n"):
        return "", text
    end = text.index("\n---", 4)
    return text[4:end], text[end + 4 :]


def description(fm):
    m = re.search(r"^description:\s*(.*?)(?=^\w[\w-]*:|\Z)", fm, re.S | re.M)
    if not m:
        return ""
    return re.sub(r"\s+", " ", m.group(1)).strip().strip('"')


def invocation_only(fm):
    """`disable-model-invocation: true` takes the skill off the session's list: its description is not loaded."""
    return re.search(r"^disable-model-invocation:\s*true\s*$", fm, re.M) is not None


def paragraphs(text):
    """Prose paragraphs of at least 60 characters; code blocks and tables are left out."""
    out, block, code = [], [], False
    for line in text.splitlines():
        if line.startswith("```"):
            code = not code
            continue
        if code or line.startswith("|"):
            continue
        if line.strip():
            block.append(line.strip())
        elif block:
            out.append(" ".join(block))
            block = []
    if block:
        out.append(" ".join(block))
    return [p for p in out if len(p) >= 60 and not p.startswith("#")]


def key(p):
    p = unicodedata.normalize("NFKD", p).encode("ascii", "ignore").decode()
    p = re.sub(r"^[-*>\d.\s]+", "", p)
    p = re.sub(r"[^a-z0-9]+", " ", p.lower()).strip()
    return p[:40]


def commits(f, since):
    r = subprocess.run(["git", "log", "--oneline", f"--since={since}", "--", f], capture_output=True, text=True)
    return len(r.stdout.splitlines())


def guardrails(body):
    m = re.search(r"^## Guardrails\s*$(.*?)(?=^## |\Z)", body, re.S | re.M)
    return len(re.findall(r"^\s*[-*] ", m.group(1), re.M)) if m else 0


def table(since):
    print(f"{'file':48} {'lines':>6} {'descr.':>6} {'guard.':>6} {'dates':>5} {'commits':>7}  siblings (lines, no contents! past 100)")
    for f in files():
        text = read(f)
        fm, body = frontmatter_and_body(text)
        mark = lambda v, s: f"{v}!" if v > s else f"{v} "
        sib = []
        for p in siblings(f):
            t = read(p)
            n = t.count("\n")
            contents = n <= 100 or bool(re.search(r"^## Contents", t, re.M))
            sib.append(f"{os.path.relpath(p, os.path.dirname(f))} ({n}{'' if contents else ', no contents!'})")
        print(
            f"{f:48} {mark(text.count(chr(10)), THRESHOLDS['lines']):>6} "
            f"{mark(len(description(fm)), THRESHOLDS['description']):>6} "
            f"{mark(guardrails(body), THRESHOLDS['guardrails']):>6} "
            f"{len(DATE.findall(body)):>5} {commits(f, since):>7}  {', '.join(sib)}"
        )
    loaded = [f for f in files() if not invocation_only(frontmatter_and_body(read(f))[0])]
    total = sum(len(description(frontmatter_and_body(read(f))[0])) for f in loaded)
    print(f"\ndescriptions loaded on every turn: {total} characters ({len(files()) - len(loaded)} on invocation only, not counted)")
    print(f"CLAUDE.md: {read('CLAUDE.md').count(chr(10))} lines, read in full on every turn")


def duplicates():
    seen = {}
    every = files() + [p for f in files() for p in siblings(f)] + ["CLAUDE.md"]
    for f in every:
        for p in paragraphs(frontmatter_and_body(read(f))[1]):
            seen.setdefault(key(p), []).append((f, p))
    n = 0
    for occ in seen.values():
        if len({f for f, _ in occ}) > 1:
            n += 1
            print(f"\"{occ[0][1][:90]}…\"")
            for f, _ in occ:
                print(f"    {f}")
    print(f"\n{n} paragraphs found in two files", file=sys.stderr)
    return n


def register(old, tree):
    keys = set()
    for f in glob.glob(f"{tree}/.claude/**/*.md", recursive=True) + [f"{tree}/CLAUDE.md"]:
        if os.path.exists(f):
            keys.update(key(p) for p in paragraphs(frontmatter_and_body(read(f))[1]))
    missing = 0
    for p in paragraphs(frontmatter_and_body(read(old))[1]):
        if key(p) not in keys:
            missing += 1
            print(f"- {p[:120]}")
    print(f"\n{missing} paragraphs of {old} with no match in {tree}: each one is justified in the commit", file=sys.stderr)
    return missing


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--since", default="30 days ago")
    a.add_argument("--duplicates", action="store_true")
    a.add_argument("--register")
    a.add_argument("--tree", default=".")
    args = a.parse_args()
    if args.duplicates:
        sys.exit(1 if duplicates() else 0)
    elif args.register:
        sys.exit(1 if register(args.register, args.tree) else 0)
    else:
        table(args.since)
