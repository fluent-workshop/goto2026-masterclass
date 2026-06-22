Survey the full readiness state of the GOTO 2026 masterclass assets and produce a status report.

READ FIRST:
- `.cc-dispatch/loops/loop-012-readiness-survey/goal.md` — full spec with phases A–E
- All previous loop reports in `.cc-dispatch/loops/*/report.md` for infrastructure context

Mode: autonomous (--dangerously-skip-permissions), work directly on main.
Do NOT modify any source code or infrastructure. READ ONLY — all phases are reconnaissance.

SSH key for test box: `~/.ssh/id_ed25519` | Host: `root@87.99.153.105`
Linear CLI: `bun run ~/.openclaw/workspace/skills/linear/scripts/linear.ts`
Repos to inspect (all read-only):
  - ~/src/spantree/goto-2026-masterclass (this repo — infra)
  - ~/src/spantree/goto-accelerate-companion (companion app)
  - ~/src/spantree/goto-2026-masterclass-site (slides + docs)
  - ~/src/spantree/goto-2026-masterclass-from-code-assistants-to-autonomous-agents (content)

Done when: report.md exists with 🟢/🟡/🔴 for all 5 components, blocking items with time
estimates, and recommended background loops — or stop after 30 turns and report what's blocking.

Stop when report.md is written. Do NOT start any follow-on work.
