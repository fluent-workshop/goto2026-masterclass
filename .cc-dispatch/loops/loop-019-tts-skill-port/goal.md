# Goal — loop-019-tts-skill-port

## Objective

Port the workspace TTS skill to a clean, classroom-ready version in the masterclass repo. Strip everything personal/env-specific. Wire to student config. Keep the core functionality.

## Output location

All output goes under:
```
~/src/fluent-workshop/goto2026-masterclass/skills/tts/
  SKILL.md
  package.json
  references/
    humanizer-tts.md        (port src-TTS.md — keep all content)
    tts-advice.md           (port src-tts-advice.md — trim platform size limits)
    elevenlabs-voices.json  (already exists — do NOT overwrite)
  scripts/
    tts.ts
    lib/
      args.ts
      voices.ts
      elevenlabs.ts
      cache.ts
      stretch.ts
      batch.ts
      secrets.ts            (NEW — inline env-only shim)
```

## What to REMOVE / CHANGE

### `lib/secrets.ts` (NEW — create this)
Replace the `@evie/lib/secrets` workspace package with a local inline shim:
```typescript
export async function getSecret({ env, file }: { op?: string; env: string; file?: string }): Promise<string> {
  const val = process.env[env];
  if (val) return val;
  if (file) {
    const { existsSync, readFileSync } = await import("fs");
    if (existsSync(file)) return readFileSync(file, "utf-8").trim();
  }
  throw new Error(`Missing required env var: ${env}. Set it in your openclaw.json or shell environment.`);
}
```

### `lib/voices.ts`
- Remove the `cedric` alias entirely (PVC, 1Password lookup)
- Rename `evie` alias → `default`, voice ID comes from `process.env.ELEVENLABS_VOICE_ID` (required)
- Keep the same DEFAULTS (model, stability, similarity, style, speakerBoost, speed)
- Default voice should be `eleven_turbo_v2_5` model (updated from v2)
- If `ELEVENLABS_VOICE_ID` is not set, throw a clear error: "ELEVENLABS_VOICE_ID is not configured. Ask your instructor for your instance's voice ID."
- Students can also pass any raw voice ID directly with `--voice <id>`

### `lib/elevenlabs.ts`
- Replace `getSecret({ op: "op://Openclaw/...", env: "ELEVENLABS_API_KEY" })` with `getSecret({ env: "ELEVENLABS_API_KEY" })`
- Remove the `syncDictionary` function and all dictionary-related code (PLS upload, DICT_URL, DICT_STATE_PATH, etc.)
- Remove the `loadDictState` function (or keep returning null always — batch.ts calls it)
- Keep the `synthesize` function and rate limiter unchanged
- Keep `SynthesisParams` interface unchanged

### `lib/cache.ts`
- Remove the hardcoded `WORKSPACE_ROOT` default. Replace with a path relative to the script:
  ```typescript
  import { join } from "path";
  const CACHE_DIR = join(import.meta.dir, "../../.cache/tts");
  ```

### `tts.ts` (main CLI)
- Remove the `dict` command and `cmdDict` function entirely
- Remove `syncDictionary` and `loadDictState` imports
- Remove `dictVersionId` from cacheKey (dict feature is gone)
- Remove Bungee references — the stretch flag still exists but uses ffmpeg atempo only (already the case in src-stretch.ts, just remove any Bungee mentions in comments/usage)
- Default voice in `cmdGenerate` changes from `"evie"` to `"default"`
- Keep `generate`, `batch`, `cache` commands

### `package.json`
- Remove `"@evie/lib": "workspace:*"` dependency
- Keep `"bottleneck": "^2.19.5"`
- Keep `bun-types` devDependency
- Add `"name": "goto2026-masterclass-skill-tts"` (update name)

### `SKILL.md`
Write fresh for classroom context. Key points:
- **name:** `tts`
- **description:** `"Generate speech audio via ElevenLabs TTS. Use when asked to speak, say, read aloud, or generate audio from text."` (under 160 bytes)
- **metadata:** `{"openclaw": {"requires": {"env": ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"]}, "primaryEnv": "ELEVENLABS_API_KEY"}}`
- Body should cover:
  - Quick reference (generate, batch, cache commands)
  - Voice: the student's instance has a pre-configured voice via ELEVENLABS_VOICE_ID. They can override with `--voice <id>` and browse available voices in `references/elevenlabs-voices.json`
  - Humanizer: always apply TTS transforms from `references/humanizer-tts.md` before generating speech
  - Cache: content-addressable, lives in `.cache/tts/` under the skill dir
  - Stretch: optional `--stretch <n>` for time-stretching via ffmpeg atempo
  - Batch: manifest format for multi-voice/multi-item production
  - References pointer

## What to KEEP AS-IS (copy from src-*)
- `lib/stretch.ts` — copy verbatim, it's clean
- `lib/batch.ts` — copy verbatim, it's clean
- `lib/args.ts` — copy verbatim, it's clean

## What NOT to touch
- `references/elevenlabs-voices.json` — already exists, do NOT overwrite

## Safety rules
- Do not commit anything; this is a file-write loop only
- Do not modify any files outside `skills/tts/`
- Do not copy `dialog-briefing.md`, `notion.md`, `pronunciation.md`, or `dictionary.pls` — these are personal and stay in the workspace skill only
