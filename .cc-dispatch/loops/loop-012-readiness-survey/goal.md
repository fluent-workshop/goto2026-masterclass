# Loop 012 — Masterclass Readiness Survey

**Context:** GOTO Chicago 2026 masterclass "From Code Assistants to Autonomous Agents" is tomorrow
(Mon Jun 22, 9am–5pm at Slalom's Aon Center office). It's currently Sunday 11:45am CDT — about
13 hours to showtime. This survey covers all four repos + infra + Linear board to produce a
readiness report Cedric can act on TODAY.

## Phase A — Linear Board (GOT team)

Use `bun run ~/.openclaw/workspace/skills/linear/scripts/linear.ts` to list all issues for the
GOT team. Report:
- Open vs done counts per state
- Any issues explicitly tagged or named for today's prep (companion app dry-run, infra clone, slides)
- Which items have no assignee or are blocked

## Phase B — Infra State

1. Read ALL loop reports in `.cc-dispatch/loops/` (001-011). Note completed vs outstanding items.
2. SSH into `root@87.99.153.105` (test box `goto-test`) and produce:
   - Which services are running (systemctl list-units --state=running | grep openclaw)
   - Whether cloudflared is active
   - Whether companion app is deployed and running
   - Desktop credentials state (htpasswd exists?)
   - Whether OpenClaw is configured
3. Check if 14 student instances exist via hcloud: `hcloud server list` (if hcloud CLI available)
4. Read `infra/clone.sh` and note what's needed to provision 14 boxes from the test box

## Phase C — Companion App (`~/src/spantree/goto-accelerate-companion`)

1. Does `bun install && bun run dev` work? Check package.json scripts.
2. Is there a `createdb goto_companion && bun run migrate && bun run seed` that would work?
3. Check if there's any .env.example and what env vars are needed
4. Is there a deploy script or Dockerfile?
5. Can the companion app run on the Hetzner box? (needs Postgres, which IS running on box)

## Phase D — Masterclass Site / Slides (`~/src/spantree/goto-2026-masterclass-site`)

1. Read `slides/slides.md` fully — how many real slides exist vs template placeholders?
2. Read `docs/docs/` directory — what documentation pages exist and what do they cover?
3. Does `bun run build` pass? Any known issues?
4. Is the site deployed to Cloudflare Pages? Check wrangler.jsonc.

## Phase E — Content Repo (`~/src/spantree/goto-2026-masterclass-from-code-assistants-to-autonomous-agents`)

1. What's in `context/memory/`? List files.
2. What's in `scripts/`? Are there any scripts Cedric would use during the class?
3. Read SETUP.md — what do students need to do to set up their environment?

## Output: report.md

Write `report.md` with:
1. **Traffic light status** (🟢/🟡/🔴) for: Infra, Companion App, Slides, Content Repo, Linear Board
2. **Blocking items** — things that MUST be done today for tomorrow to work
3. **Nice-to-have items** — things that would improve the class but aren't blockers
4. **Recommended background loops for today's breaks** — infra clone, companion deploy, etc.
5. **Time estimates** for each blocking item

## Green gate

`report.md` exists with all 5 traffic light statuses filled in and at least 3 blocking items
identified with time estimates. Stop after 30 turns.
