# Report — loop-019-tts-skill-port

## Status: ✅ Complete

Ported the workspace TTS skill to a clean, classroom-ready version under
`skills/tts/`. No files outside `skills/tts/` were modified.
`references/elevenlabs-voices.json` was left untouched.

## Files created

| File | Source | Notes |
|---|---|---|
| `SKILL.md` | rewritten | Fresh classroom version; `name: tts`, short description (<160 bytes), `openclaw.requires.env` metadata. Covers quick ref, humanizer-first, voice via `ELEVENLABS_VOICE_ID`/`--voice`, cache, stretch, batch. |
| `package.json` | src-package.json | `@evie/lib` removed; renamed to `goto2026-masterclass-skill-tts`; kept `bottleneck` + `bun-types`. |
| `scripts/tts.ts` | src-tts.ts | Removed `dict` command + `cmdDict`, removed `syncDictionary`/`loadDictState` imports, removed `dictVersionId` from cacheKey, removed Bungee mentions, default voice `evie`→`default`. Kept generate/batch/cache. |
| `scripts/lib/secrets.ts` | NEW | Env-only `getSecret` shim replacing `@evie/lib/secrets` (env var + optional file fallback). |
| `scripts/lib/voices.ts` | src-voices.ts | Removed `cedric` (PVC/1Pass); `evie`→`default` reading `process.env.ELEVENLABS_VOICE_ID` with clear error if unset; model bumped to `eleven_turbo_v2_5`; raw IDs still pass through. |
| `scripts/lib/elevenlabs.ts` | src-elevenlabs.ts | Replaced 1Password `getSecret` with env-only `getSecret({env:"ELEVENLABS_API_KEY"})`; removed all dictionary code (`syncDictionary`, DICT_URL/PLS/STATE, locators in request body); `loadDictState()` kept as a `null`-returning stub for batch.ts; default model `eleven_turbo_v2_5`; `synthesize` + rate limiter + `SynthesisParams` unchanged. |
| `scripts/lib/cache.ts` | src-cache.ts | Removed hardcoded `WORKSPACE_ROOT`; cache now `join(import.meta.dir, "../../.cache/tts")`. |
| `scripts/lib/stretch.ts` | src-stretch.ts | Verbatim copy. |
| `scripts/lib/batch.ts` | src-batch.ts | Verbatim copy (relies on the `loadDictState` null stub). |
| `scripts/lib/args.ts` | src-args.ts | Verbatim copy. |
| `references/humanizer-tts.md` | src-TTS.md | Ported verbatim, all content kept. |
| `references/tts-advice.md` | src-tts-advice.md | Ported; trimmed the "Output Limits" section (Telegram 16MB / Gmail 25MB). |
| `references/elevenlabs-voices.json` | (pre-existing) | NOT modified. |

## Verification

- `grep @evie skills/tts/` → only a descriptive comment in `secrets.ts`; the
  package.json dependency is gone.
- No `syncDictionary` / `cmdDict` / `bungee` / `op://` / `1password` in scripts.
- `bun install` resolved `bottleneck` + `bun-types`; `bun run skills/tts/scripts/tts.ts --help`
  loaded all modules with no import/type errors and printed usage (exits 1 on the
  unknown `--help` command — this is the original `usage()` behavior; a real command
  with `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID` set would proceed).
- Install artifacts (`node_modules`, `bun.lock`) were removed after testing.

## Not copied (per safety rules)

`dialog-briefing.md`, `notion.md`, `pronunciation.md`, `dictionary.pls` — personal,
stay in the workspace skill only.

## Notes

- Nothing was committed (file-write loop only).
- Stopping here; not starting the next loop.
