# Loop 004 — PRD reconciliation & divergence map (ANALYSIS ONLY)

## Context

The GOTO 2026 masterclass infra repo (`spantree/goto-2026-masterclass`) was built
across loops 001–003 as a **lean headless agent box**: Terraform + bash
`dotfiles/bootstrap.sh` + cloud-init, SSH-only, mise/Node/openclaw, stripped zsh,
14 Pokémon-named clones. The in-repo PRD (`docs/prd/PRD-001-student-exercise-infra.md`)
describes that lean version.

But the **canonical spec lives in Notion** (PRD-001 v1.1 "Masterclass Lab
Infrastructure") and describes a much larger system: a full graphical lab with
browser desktop, Docker services, a 9-key credential bag, Tailscale Funnel,
agent personas, QR delivery, and **Ansible** as the provisioning tool. The repo
has drifted hard from it. If we baked the current image we'd snapshot the wrong box.

**This loop produces the reconciliation artifact Cedric needs to make decisions.**
It is **analysis only** — NO code changes, NO Terraform, NO spend, NO new tooling.
The deliverable is a written divergence map + a rescope proposal.

## READ FIRST (all of it — you start cold)

- `references/INDEX.md` — then every file it lists:
  - `references/prd-lab-infrastructure.md` — **the canonical PRD** (source of truth)
  - `references/prd-discord-architecture.md` — Discord/persona PRD
  - `references/current-repo-state.md` — what the repo actually contains now
  - `docs/prd/PRD-001-student-exercise-infra.md` — the drifted in-repo PRD

## What to produce

A single markdown file: `report.md` (in this loop dir) containing:

### Part A — Divergence map (the core deliverable)
A table, one row per canonical-PRD requirement (walk FR-1 through FR-9, plus the
NFRs and D1–D7 decisions). For each:
- **Requirement** (FR# / decision, one-line summary)
- **Repo status**: `Present` / `Partial` / `Absent` / `Contradicts`
- **Evidence**: the specific file/line in the repo (from `current-repo-state.md`) that
  supports the status — or "nothing in repo"
- **Gap**: what's missing or conflicting, concretely

Be precise and honest. "Partial" must say what part exists and what's missing.

### Part B — Named contradictions (decisions, not just gaps)
List every place the repo's approach and the canonical PRD **actively conflict** (not
just "not built yet" — genuinely opposed choices). For each, state both positions
neutrally and what's at stake. Known ones to verify and expand (don't assume — check
the PRDs):
- **Provisioning tool**: repo uses Terraform + bash bootstrap; PRD D3 chose **Ansible**.
- **Desktop**: repo is headless/SSH-only; PRD FR-4 requires a browser desktop with auth.
- **Agent user**: repo bakes `ubuntu`; check what the PRD assumes.
- **SKU label**: PRD says "CCX43" next to 8 vCPU/32GB specs, but 8 vCPU/32GB/240GB is
  actually `ccx33` (ccx43 = 16 vCPU/64GB). Flag this as a doc bug to fix in BOTH PRDs.
- **Scope of the box**: lean agent host vs full lab (Docker/SonarQube/Postgres/personas/
  credential bag/QR delivery). Quantify how much of the PRD the repo doesn't touch.
- Any others you find — read both PRDs fully.

### Part C — Rescope proposal (options, not a unilateral pick)
The work clearly grew. Lay out 2–3 concrete paths forward for Cedric to choose from,
e.g.:
- **Path 1 — Honor the canonical PRD fully**: adopt Ansible, build all 9 FRs. What it
  costs in time against the Sat Jun 21 dress-rehearsal / Jun 22 class deadline; what's
  at risk.
- **Path 2 — Hybrid**: keep Terraform for Hetzner resource creation, add a config layer
  (Ansible OR keep extending bash) for desktop/Docker/credentials/personas on top.
  What's salvageable from loops 001–003.
- **Path 3 — Minimum-viable-for-class**: the smallest subset of the PRD that makes the
  2-hour exercise actually work on deadline, explicitly deferring the rest (handoff,
  rotation, QR polish) to post-provision. Name what's cut.
For each path: what survives from the current repo, rough effort, deadline risk,
and the first 2–3 concrete next steps. Recommend one, but make the trade-offs legible
so Cedric decides.

### Part D — Open questions the PRD itself still has
The canonical PRD has 8 open questions (Q1–Q8: desktop solution, provider, conference
end date, Anthropic keys, Discord server, OpenAI/Codex, Funnel+gateway auth, ElevenLabs).
List which are now **blocking** the rescope and which can be deferred. Don't answer
them — surface them for Cedric.

## Hard rules

- **ANALYSIS ONLY.** Do NOT modify `dotfiles/`, `infra/`, `docs/`, or any source file.
  Do NOT run Terraform, hcloud, SSH, or anything that spends money or touches a server.
  The ONLY file you write is `report.md` in this loop directory.
- Do NOT "fix" the divergence by writing code or Ansible — that's a later loop, gated on
  Cedric's path choice.
- Ground every claim in a specific PRD section or repo file from `references/`. No
  hand-waving; if you're unsure whether something exists in the repo, say so.
- Conventional commit when done: `docs(infra): loop-004 PRD reconciliation report`
  (committing ONLY `report.md` and the references/ folder).

## Completion condition (gradeable)

`report.md` exists in this loop dir with all four parts (A divergence table covering
FR-1..FR-9 + NFRs + D1..D7, B named contradictions, C 2–3 rescope paths with a
recommendation, D blocking-vs-deferred open questions), every status backed by a
cited PRD section or repo file — and NO source files outside `report.md` were
modified (git status shows only report.md + references/ added). Or stop after 25
turns and report what's blocking.
