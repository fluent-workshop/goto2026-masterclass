---
name: product-manager
description: "Product discovery, prioritization, and roadmapping guidance. Use when scoping a product decision, writing a roadmap, or prioritizing a backlog."
metadata: {"openclaw": {"emoji": "🎯"}}
---

# Product Management Rules

## Workflow

A repeatable discovery → prioritization → roadmap pass. Run the phases in order;
each produces an artifact the next consumes.

1. **Discovery** — gather the problem space before proposing anything.
   - `Read`/`Grep` the repo, existing specs, and analytics notes for prior context.
   - Capture user signals and open questions in a scratch doc (`memory://scratch/` or `.scratch/notes/`).
   - Output: a one-page problem statement (who, the job-to-be-done, the evidence).

2. **Prioritization** — turn candidates into a ranked, defensible list.
   - Score each candidate on impact vs. effort; stack-rank — no ties at P1.
   - For deeper, contested calls, hand off to `/grill-me` or `/adhd` to pressure-test scope.
   - Output: a stack-ranked backlog with a one-line rationale per item.

3. **Roadmap** — commit horizons, not promises.
   - Lay out now (committed) / next (planned) / later (possible); surface dependencies.
   - Draft the spec for the top item with the `specdocs` skill (PRD/ADR templates).
   - Output: a now/next/later roadmap plus a linked PRD for the lead item.

The rules below are the judgment layer applied throughout these phases.

## Discovery
- Talk to users weekly — not just at project kickoff
- Watch behavior, don't just collect opinions — users say one thing, do another
- Problem validation before solution validation — are we solving the right thing?
- Jobs to be done: what's the user trying to accomplish?
- Competitors show what's possible, not what to copy

## Prioritization
- Impact vs effort is a starting point, not the answer
- Say no more than yes — focus is a feature
- Urgent vs important: stakeholder pressure isn't priority
- Stack rank ruthlessly — "everything is P1" means nothing is
- Revisit priorities when context changes — quarterly at minimum

## Roadmapping
- Outcomes over outputs — what will change, not what we'll build
- Time horizons: now (committed), next (planned), later (possible)
- Communicate uncertainty honestly — roadmaps aren't promises
- Dependencies surfaced early — blocked work wastes everyone's time
- Update when reality changes — stale roadmaps destroy trust

## Requirements
- User stories: who, what, why — not how
- Acceptance criteria define done — ambiguity creates rework
- Edge cases addressed upfront — not discovered in QA
- Scope creep is the enemy — good enough now beats perfect later
- Technical constraints are real — work with engineering, not around them

## Working with Engineering
- Context over directives — explain why, not just what
- Tradeoffs are collaborative decisions
- Spec before sprint, not during — no designing on the fly
- Protect focus time — meetings kill flow
- Trust their estimates, push back on scope not time

## Common Mistakes
- Feature factory: shipping without learning
- Overspeccing: killing engineering autonomy
- Consensus seeking: decisions by committee
- Ignoring qualitative: data alone misses why
- Roadmap as backlog: detail everything, commit nothing
