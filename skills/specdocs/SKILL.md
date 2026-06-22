---
name: specdocs
description: "Draft PRDs (15-section) and ADRs (MADR 4.0) from templates. Use when writing, drafting, or reviewing a PRD/ADR, scoping a feature, or documenting a decision."
---

# specdocs Skill

A canonical spec documentation process. All PRDs and ADRs **must** follow
these templates — no freeform documents.

## Template Files

- `templates/prd-template.md` — 15-section PRD (YAML frontmatter + sections 1–14 + optional §15 Verification)
- `templates/adr-template.md` — MADR 4.0 ADR with PRD linkage
- `references/prd-example-excerpt.md` — production calibration examples, one per section

**Before drafting anything, read the relevant template file in full.** Do not rely on
memory of the structure — always re-read.

## Naming Conventions

| Artifact | Filename | Storage path |
|----------|----------|-------------|
| PRD | `PRD-NNN-descriptive-slug.md` | `docs/prd/` in the repo |
| ADR | `ADR-NNNN-descriptive-slug.md` | `docs/adr/` in the repo |

Numbering: list existing files, find highest number, increment. Start at `PRD-001` /
`ADR-0001` if none exist.

## PRD Workflow

1. **Read** `templates/prd-template.md` and `references/prd-example-excerpt.md`
2. **Gather inputs** — feature title, problem statement, source issue (GitHub or Linear)
3. **Explore codebase** — understand affected files, current behavior, blast radius
4. **Draft** all 15 sections following the template exactly:
   - YAML frontmatter required
   - Gherkin `Given/When/Then` for every FR (concrete values, not abstractions)
   - File Breakdown: every FR → files, every file → FR (bidirectional)
   - Open Questions: resolutions go in **Status column** (`**Resolved:** [answer]`),
     never in the Question column
5. **Save** to `docs/prd/PRD-NNN-slug.md` in the project repo
6. **Publish** — post as comment on source issue, or create new issue if original work
7. **Optional Notion sync** — if you use Notion, sync to your PRD database (requires a `notion` integration not included in this workspace)

## ADR Workflow

1. **Read** `templates/adr-template.md`
2. **Apply the 4-point test** — create ADR if ≥2 are true:
   - Multiple viable approaches exist
   - Lasting consequences beyond current sprint
   - Reasonable engineer might prefer a different option
   - Decision limits or shapes future work
3. **Research options** — web search, codebase patterns, prior art
4. **Draft** MADR 4.0 structure with real pros/cons (not strawmen)
5. **Save** to `docs/adr/ADR-NNNN-slug.md` in the project repo
6. **Cross-reference** — update related PRD's Design Decisions or Related sections

## Tracker Configuration

Check for `.claude/tracker.md` in the repo root:
- `tracker: github` → use `gh` CLI for issue ops
- `tracker: linear` → use `mcporter call linear.*` or Linear API

Default to GitHub if no config exists.

## Notion Sync

> **Prerequisites:** requires a `notion` integration, which is **not** included in this
> workspace. Skip this section unless you have wired one up yourself.

When syncing to Notion after draft is complete, set your own database IDs:
- **PRD database:** `<YOUR_PRD_DATABASE_ID>`
- **ADR database:** `<YOUR_RFD_DATABASE_ID>`
- Use your `notion` integration for all Notion operations

## Quality Bar

Every PRD must have:
- Specific, measurable success metrics (not "improve performance")
- Gherkin with concrete values in Given/When/Then
- Bidirectional FR ↔ file traceability
- Actionable risk mitigations (not "handle gracefully")
- Design decisions showing rejected alternatives and why

Every ADR must have:
- At least 2 real options with substantive pros/cons
- Decision linked back to specific decision drivers
- Honest negative consequences with mitigations

## Source

Adapted from the `cc-skills/plugins/specdocs` plugin.
Upstream: `github.com/Spantree/cc-skills/plugins/specdocs/`
