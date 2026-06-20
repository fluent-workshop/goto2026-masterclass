# RFD Template (Request for Discussion)

Inspired by Oxide Computer's RFD process (rfd.shared.oxide.computer/rfd/0001).
Notion template: https://www.notion.so/<YOUR_RFD_TEMPLATE_ID>
Notion database: https://www.notion.so/<YOUR_RFD_DATABASE_ID>

## Metadata Block (required)

```
rfd: RFD-NNN
authors: [Full Name(s)]
state: prediscussion
discussion:
labels: [comma, separated, area-tags]
date: YYYY-MM-DD
```

States: prediscussion → ideation → discussion → published → committed → abandoned

## Sections

### Problem Statement (required)
What problem? Why now? Why does it matter?
- Cite specific pain with evidence
- Explain cost of NOT solving it
- Do NOT describe the solution here

### Background (optional)
Prerequisite context: prior RFDs/PRDs/ADRs, terminology, current system state.
Keep tight — link and summarize, don't repeat.

### Options / Approaches (required if solution is non-obvious)
At least 2 viable options, each with real pros/cons.
Use data. Don't bury the lead — state preference upfront if you have one.

### Determination (written after discussion reaches consensus)
Which option won, why, what was given up.
Leave as "TBD — under discussion" until RFD moves to Published/Committed.

### Open Questions (optional)
Each question: owner + due date/milestone. Strike through when resolved, add answer inline.

## Key Differences from PRD

| RFD | PRD |
|-----|-----|
| Strategic / exploratory | Tactical / concrete |
| Timely > polished | Complete before implementation |
| May spawn many PRDs | One feature/workstream |
| Options + Determination | Requirements + Gherkin |
| Notion RFDs DB | docs/prd/ in repo |

## Notion Database Schema

- Name (title), RFD (text), Status (select), Owner (text), Date (date)
- Summary (text), Area (multi-select), GitHub Issue (url)
- Related PRDs (relation → PRD DB), Related ADRs (relation → ADR DB)
