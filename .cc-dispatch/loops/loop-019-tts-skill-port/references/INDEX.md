# References Index — loop-019-tts-skill-port

| File | What it is | Why you need it |
|---|---|---|
| `src-tts.ts` | Original main CLI entry point | Port this — strip dict/1Pass/bungee, simplify |
| `src-voices.ts` | Original voice alias resolution | Port this — replace with env-based default |
| `src-elevenlabs.ts` | Original ElevenLabs API client | Port this — strip 1Password secret resolution |
| `src-cache.ts` | Original content-addressable cache | Port this — fix hardcoded WORKSPACE_ROOT path |
| `src-stretch.ts` | Original ffmpeg atempo stretch | Copy as-is — it's clean, no personal stuff |
| `src-batch.ts` | Original batch manifest processor | Copy as-is — it's clean |
| `src-args.ts` | Original CLI arg parsing helpers | Copy as-is — it's clean |
| `src-SKILL.md` | Original TTS SKILL.md from workspace | Use as structural reference only — rewrite for classroom |
| `src-TTS.md` | Humanizer-TTS transforms reference | Port to `references/humanizer-tts.md` — keep all content, it's clean |
| `src-tts-advice.md` | General TTS production lessons | Port to `references/tts-advice.md` — keep, trim Telegram/Gmail size limits |
| `src-package.json` | Original package.json | Reference — replace `@evie/lib` with local shim |
