# Report — loop-021-skill-frontmatter-fixes

All six green-gate checks pass. Every RS fix is committed separately with its RS
number in the message. Only `skills/*/SKILL.md` files were modified;
`skill-creator/`, `scripts/`, and `references/` inside skills were left untouched.

## Per-RS Status

| RS  | Scope                                                                                                       | Status  | Commit                                |
| --- | ----------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------- |
| RS1 | tts — multi-line YAML gate → single-line JSON, add `bins:["bun"]`, quote desc                               | ✅ done | `0caf7e0`                             |
| RS2 | product-manager — `clawdbot`→`openclaw` namespace, `name: product-manager`, quoted desc + trigger           | ✅ done | `461d99f`                             |
| RS3 | adhd/specdocs/humanizer/scripting/web-scraping — collapse 5 over-cap descriptions ≤160B, drop block scalars | ✅ done | `7ca0a0e`                             |
| RS4 | All 10 skills — every description quoted                                                                    | ✅ done | folded into RS1/RS2/RS3 (G3 confirms) |
| RS5 | adhd/cc-dispatch/tts/scripting/code-review — `{baseDir}/scripts/...` paths                                  | ✅ done | `21e60b5`, `8990b54`                  |
| RS6 | product-manager — add repeatable discovery→prioritization→roadmap workflow                                  | ✅ done | `a4cc32b`                             |

### Notes

- **RS4** required no standalone commit: the unquoted descriptions (adhd, product-manager,
  scripting, tts, web-scraping) were all quoted as part of their RS1/RS2/RS3 rewrites. G3
  confirms zero unquoted descriptions across all 10 skills.
- **RS2** dropped the no-op `os: [linux,darwin,win32]` array (gate value nil with no real
  deps) but kept the `🎯` emoji under the corrected `openclaw` namespace.
- **RS5/scripting** is a cross-skill case: `{baseDir}` resolves to the owning skill, so the
  skill teaches the convention via a new "Referencing Scripts with `{baseDir}`" section and
  models it in its sonarqube examples. The "Bad" counter-example uses a `<skill-name>`
  placeholder so it stays out of the G6 grep (follow-up commit `8990b54`).
- **RS5/code-review** is best-effort per spec: its cc-dispatch/sonarqube invocations are
  cross-skill, reframed as `{baseDir}` "run from the X skill". code-review is not in the G6
  grep set.

## Green-Gate Output

```
===== G1 — over-cap descriptions =====
All descriptions <=160 bytes
===== G2 — block scalars =====
No block scalars
===== G3 — unquoted descriptions =====
All descriptions quoted
===== G4 — clawdbot namespace =====
No clawdbot
===== G5 — tts metadata single-line JSON =====
tts metadata: valid single-line JSON
===== G6 — hardcoded skill script paths =====
No hardcoded paths in targeted skills
```

### Per-skill description bytes (all ≤160B)

```
  adhd: 150B
  cc-dispatch: 130B
  code-review: 126B
  grill-me: 139B
  humanizer: 133B
  product-manager: 143B
  scripting: 144B
  specdocs: 157B
  tts: 112B
  web-scraping: 131B
```

## Commits

```
8990b54 fix(scripting): RS5 keep G6 bad-path example out of the gate grep
21e60b5 fix(skills): RS5 use {baseDir} for skill script paths
7ca0a0e fix(skills): RS3 collapse five over-cap descriptions
a4cc32b feat(product-manager): RS6 add repeatable PM workflow
461d99f fix(product-manager): RS2 fix namespace, name, description
0caf7e0 fix(tts): RS1 repair gating to single-line JSON
```
