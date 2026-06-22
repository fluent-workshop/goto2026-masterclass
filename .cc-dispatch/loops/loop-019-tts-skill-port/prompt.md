Port the workspace TTS skill to a clean classroom-ready version for the masterclass repo.

READ FIRST:
- `.cc-dispatch/loops/loop-019-tts-skill-port/goal.md` — full spec with exact changes per file.
- `.cc-dispatch/loops/loop-019-tts-skill-port/references/` — INDEX.md, then all src-* files.

Mode: autonomous (`--dangerously-skip-permissions`), work directly in `~/src/fluent-workshop/goto2026-masterclass`.
Write all output to `skills/tts/`. Do NOT modify any other files. Do NOT overwrite `skills/tts/references/elevenlabs-voices.json`.

Done when: All files listed in goal.md exist under `skills/tts/`, `references/humanizer-tts.md` and `references/tts-advice.md` are ported, the `@evie/lib` dependency is gone from package.json, and `bun run skills/tts/scripts/tts.ts --help` exits cleanly (or would, if ELEVENLABS_API_KEY/VOICE_ID were set). Stop after 30 turns if blocked.

Stop after writing all files: write `report.md` summarising what was created/changed, go idle. Do not start the next loop.