---
name: tts
description: "Generate speech audio via ElevenLabs TTS. Use when asked to speak, say, read aloud, or generate audio from text."
metadata: {"openclaw": {"requires": {"bins": ["bun"], "env": ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"]}, "primaryEnv": "ELEVENLABS_API_KEY"}}
---

# TTS Skill

Generate speech audio from text using the ElevenLabs API, with a
content-addressable cache and optional time-stretch post-processing.

Your instance comes pre-configured with an API key (`ELEVENLABS_API_KEY`) and a
voice (`ELEVENLABS_VOICE_ID`). If either is missing, ask your instructor.

## Quick Reference

```bash
# Single generation (uses your instance's default voice)
bun run skills/tts/scripts/tts.ts generate \
  --text "Hello world" --output hello.mp3

# From a file, with a faster delivery
bun run skills/tts/scripts/tts.ts generate \
  --file script.txt --output speech.mp3 --stretch 1.15

# Override the voice with any raw ElevenLabs voice ID
bun run skills/tts/scripts/tts.ts generate \
  --text "Different voice" --voice 21m00Tcm4TlvDq8ikWAM --output alt.mp3

# Batch from a JSON manifest
bun run skills/tts/scripts/tts.ts batch \
  --manifest podcast.json --output-dir ./renders/

# Cache management
bun run skills/tts/scripts/tts.ts cache list
bun run skills/tts/scripts/tts.ts cache reap
bun run skills/tts/scripts/tts.ts cache clear
```

## Humanizer (do this first)

**Always** apply the TTS humanizer transforms before generating speech. Raw
written text — code, URLs, numbers, dense sentences — sounds robotic when
spoken. See `references/humanizer-tts.md` and rewrite the text so it reads
naturally for the ear, then synthesize.

## Voice

Your instance has a pre-configured voice exposed through the `default` alias,
which reads its ID from `ELEVENLABS_VOICE_ID`. You don't need to pass `--voice`
for normal use.

To use a different voice, pass any raw ElevenLabs voice ID with `--voice <id>`.
Browse the available voices and their IDs in
`references/elevenlabs-voices.json`.

Defaults: model `eleven_turbo_v2_5`, stability 0.80, similarity 0.61,
style 0.70, speaker boost on, speed 1.2. Override any of these per-call with the
matching `--stability`, `--similarity`, `--style`, `--speed`, and `--model`
flags.

## Stretch

`--stretch <n>` time-stretches the output via ffmpeg's `atempo` filter (a clean
phase-vocoder stretch with no pitch shift). For example `--stretch 1.15` on top
of the default `speed 1.2` lands around a 1.38x effective rate. Requires
`ffmpeg` on the PATH.

## Cache

Generations are content-addressable. The cache key is the SHA-256 of text +
voice ID + model + stability + similarity + style + speed + stretch +
speaker boost. A cache hit copies the existing MP3 to your output — no API call.

The cache lives in `.cache/tts/` under this skill directory. Use
`cache reap` to drop entries older than 24h, `cache clear` to wipe it.

## Batch

Render many items in one pass from a JSON manifest. TTS items run concurrently
(5 at a time); the output is one MP3 per item plus a `concat.txt` and a
`chapters.json` for assembly.

```json
{
  "defaults": {
    "model": "eleven_turbo_v2_5",
    "speed": 1.2,
    "stretch": 1.15,
    "stability": 0.8,
    "similarity": 0.61,
    "style": 0.7,
    "speaker_boost": true,
    "bitrate": "192k"
  },
  "items": [
    { "type": "tts", "id": "000", "voice": "default", "text": "Welcome..." },
    { "type": "audio", "id": "001", "path": "./sting.mp3" },
    { "type": "chapter", "title": "Introduction" },
    { "type": "silence", "id": "002", "duration": 1.5 },
    { "type": "tts", "id": "003", "voice": "default", "text": "Thanks..." }
  ]
}
```

## References

- `references/humanizer-tts.md` — speech-prep transforms: symbols, numbers,
  acronyms, and sentence structure for natural TTS. Apply before every generation.
- `references/tts-advice.md` — accumulated production lessons (text prep, model
  selection).
- `references/elevenlabs-voices.json` — available voices and their IDs for `--voice`.
