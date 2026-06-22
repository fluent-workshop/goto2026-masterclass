---
name: adhd
description: "Parallel divergent ideation for hard open-ended decisions — fans out isolated grounded CC frames, then critiques. Use on /adhd or open-ended design."
license: MIT
---

# ADHD — Grounded Parallel Divergent Ideation

Stop picking the textbook answer. The first three answers the model gives are the
answers a senior engineer gives in thirty seconds — correct, forgettable. The
interesting answers live past number three, in the awkward middle. This skill makes
the model walk there, then commits to a real opinion.

**Our adaptation of the [ADHD paper](https://github.com/UditAkhourii/adhd) (MIT):**
each divergent branch is a *grounded* headless Claude Code process — it reads the
actual repo and pre-staged research under its cognitive lens, instead of ideating
in a vacuum. The generator/critic split is mechanical: frames are separate OS
processes (Phase 1); the orchestrator is the critic (Phase 2).

## Pre-flight (run before Phase 1)

This skill is expensive: ~5 parallel CC frames + an Evie critic pass, 1–4 min wall
clock, several × a single answer. Don't pay that when a direct answer is better.

**Step 1 — Explicit invocation.** If the user typed `/adhd`, "ADHD mode", "run ADHD
on this", or "use the adhd skill" → skip the gate, go to Phase 1.

**Step 2 — Self-judge (only if Step 1 didn't match).** Abort if ANY is no:
1. **Open-ended?** Multiple viable answers, or one canonical answer? Canonical → abort.
2. **High-stakes?** Architecture, public API surface, product naming, fuzzy bug with
   no known root cause, schema design, positioning = yes. 11pm side project = no.
3. **Open phrasing?** Did they avoid "quick", "standard", "canonical", "textbook",
   "just", "one-line"? If they used any → they want the direct answer. Abort.

If aborting, answer directly and optionally add: *"Want a wider exploration under
parallel grounded frames with trap detection? Run `/adhd <your problem>`."*

## The loop — two strict phases

Mixing them kills idea quality: the critic strangles the generator.

### Phase 1 — Diverge (no critic, grounded, parallel)

Run the orchestrator. It picks 5 frames (bias code/design, always ≥1 wild),
scaffolds a run dir, and launches one isolated `claude -p` headless process per
frame — each with `--mcp-config` (whatever MCP servers you have configured, if any)
and `--add-dir` for the repo + shared artifacts, so frames are grounded but their
cwd stays disposable.

```bash
# 1. Scaffold the run (grounded on a repo)
bun run {baseDir}/scripts/adhd.ts init \
  --problem "@/path/to/problem.md" \
  --slug goto-masterclass-prep \
  --repo ~/src/owner/my-repo \
  --n 5
# → prints runDir, e.g. .scratch/adhd/20260616-165312-goto-masterclass-prep

# 2. (Optional) stage shared research so every frame can read it
#    Drop files into <runDir>/artifacts/research/*.md
#    Produce these FIRST with whatever research tooling you have.

# 3. Diverge — launches all frames in parallel, barriers, aggregates
bun run {baseDir}/scripts/adhd.ts diverge --run <runDir>
# → writes <runDir>/results/diverge.json

# Frame catalog / status
bun run {baseDir}/scripts/adhd.ts frames
bun run {baseDir}/scripts/adhd.ts status --run <runDir>
```

**Pick frames manually** with `--frames speedrunner,regulator,inversion,biology,on-call-3am`.

**Critical isolation invariant.** Frames are separate processes with zero shared
context. Never pass one frame's output to another. Branches that see each other
anchor each other and the method collapses to a wider single thought.

### Phase 2 — Focus (the orchestrator is the critic, in-session)

After `diverge.json` exists, the orchestrator does this directly — do NOT spend CC frames on it:

1. **Score** each idea 0–10 on novelty (distance from obvious), viability (could it
   ship), fit (addresses the stated problem). Flag traps (hidden cost, false economy,
   won't scale, premature abstraction) with a one-line reason.
2. **Cluster** into 3–6 groups by underlying angle, not surface keywords. Label by
   angle ("remove-the-server plays", "cache-shaped plays", ...).
3. **Deepen the top 3** by weighted score (novelty 0.35 + viability 0.40 + fit 0.25),
   traps excluded. For each: a 4–8 sentence sketch of how it works, the load-bearing
   risk, the first concrete step a builder takes, and 3–5 child ideas.

## Output shape (Phase 2 render — structure is the point)

1. **Brief.** 1–2 lines confirming the problem + any reframe.
2. **Wide set.** Full pool grouped by cluster, each idea one short phrase, score chips
   like `[N7 V8 F9]`, grounding citation when a frame found one.
3. **Converge.** 2–4 idea shortlist with reasons. Mark the non-obvious-but-viable pick
   with ★. List traps separately, each with its one-line reason.
4. **Focus.** The 3 deepened branches: sketch, load-bearing risk, first step, child ideas.
5. **Provocation.** One wildcard that opens a new direction if nothing landed.

## Frames

15 in the catalog (`adhd.ts frames`): speedrunner, regulator, ten-year-old,
competitor, biology, logistics, game-design, markets, inversion, zero-budget,
infinite-budget, remove-assumption, ant-colony, on-call-3am, hardware-engineer.
Frames are vantage-point operators chosen for **structural distortion**, not
expertise — the 10-year-old isn't asked to be correct, just unencumbered.

For code-shaped problems: 4 frames tagged `code`/`design` + 1 `wild`. For
product/strategy: a mix across all tags. The picker varies selection across runs so
re-running the same problem yields a different candidate set.

## Grounding (our key addition)

Each frame can read the repo (`--repo` at init) and `<runDir>/artifacts/` via
`--add-dir`, and use any MCP tools you have configured. Frames are told to
cite the file path or source in an idea's `grounding` field when they used it. Stage
shared research into `artifacts/research/` BEFORE diverging — produce it with
whatever research tooling you have, not ad-hoc. A grounded speedrunner greps your actual
retry loop; a grounded regulator reads your real schema. That's the upgrade over
context-free ideation, and it's why CC frames (not cheap subagents) earn their weight.

## Cost & calibration

- ~5 parallel frames + 1 Evie critic pass. Flat-rate on the Max 20 subscription.
- Scale to stakes: "name this function" = 3 frames; "how do I position this product"
  = 5 frames, deeper. Default 5.
- Frames run truly parallel as child processes — no `maxConcurrentSessions` cap (they
  aren't OpenClaw sessions). Wall clock is bounded by the slowest frame, not the sum.

## Anti-patterns

- **Convergence disguised as divergence.** 10 variations of one idea is decoration,
  not breadth. If every candidate shares one assumption, you didn't diverge.
- **Weird-for-weird's-sake.** A pile of 30 absurdities is as useless as one safe
  answer. Always converge.
- **Walls of prose.** Cluster, label, pull out the best. Structure is half the value.
- **Refusing to commit.** "Here are 20 ideas, you decide" is a cop-out. Converge with
  a real opinion and a ★ pick.
- **Skipping isolation.** Simulating parallel branches sequentially in one context is
  not ADHD — it's a wider single thought. Use the separate processes.

## Run-dir layout

```
.scratch/adhd/<stamp>-<slug>/
  run.json                  # meta: problem, repo, frames
  PROBLEM.md
  artifacts/research/*.md   # shared; --add-dir'd into every frame
  frames/<name>/
    GROUNDING.md            # lens + repo/artifact pointers
    output.json             # parsed idea array (barrier waits on this)
    raw.json                # raw claude -p envelope (fallback parse)
  results/diverge.json      # aggregated pool → Evie critiques from this
```

Disposable: `rm -rf <runDir>` cleans the whole run.

## Attribution

Method and frame catalog adapted from **UditAkhourii/adhd** (MIT) — "ADHD: Parallel
Divergent Ideation for Coding Agents". Our changes: grounded headless CC frames with
repo/artifact read-access, run-dir isolation under `.scratch/adhd/`, and the
orchestrator as the in-session critic instead of a CC critic pass.
