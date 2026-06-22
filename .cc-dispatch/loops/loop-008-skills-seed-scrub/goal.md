# loop-008-skills-seed-scrub

Strip personal data, fix Ubuntu portability, and fix silent failure modes in the GOTO 2026 masterclass skills seed set so it can ship to student boxes cleanly.

## Success criteria

1. `grep -r "Cedric\|/Users/openclaw\|divideby0\|EVIE -\|trifork-elevate\|op://Openclaw" skills/` returns 0 results
2. `secret-scan/` directory is deleted entirely
3. `cc-dispatch/hooks/` dead shell files deleted
4. `product-manager/_meta.json` removed or `source` field nulled
5. cc-dispatch WORKSPACE derived from `import.meta.dir`, not hardcoded
6. No `DEFAULT_REPO` constant — `--repo` required
7. "Cedric" replaced with "the operator" / `OPENCLAW_OPERATOR_NAME` in notify.ts and docs
8. Personal Notion DB IDs replaced with `<YOUR_*_DATABASE_ID>` placeholders in specdocs
9. adhd.ts `--dangerously-skip-permissions` gated behind `ADHD_ALLOW_DANGEROUS=1` env
10. All cross-refs to missing integrations either pruned or clearly marked optional
11. All commits use `chore(skills):` scope
