---
name: tts
description: |
  Text-to-speech via ElevenLabs with optional Bungee time-stretch and
  content-addressable caching. Activate when:
  - Generating speech audio from text
  - Rendering podcast scripts or voice notes
  - Managing TTS cache
---

# TTS Skill

Reusable TTS wrapping ElevenLabs API with optional Bungee time-stretch
post-processing and a content-addressable generation cache.

## Quick Reference

```bash
# Single generation
bun run skills/tts/scripts/tts.ts generate \
  --text "Hello world" --voice evie --output hello.mp3

# From file
bun run skills/tts/scripts/tts.ts generate \
  --file script.txt --voice cedric --output speech.mp3 --stretch 1.3

# Batch from JSON manifest
bun run skills/tts/scripts/tts.ts batch \
  --manifest podcast.json --output-dir ./renders/

# Cache management
bun run skills/tts/scripts/tts.ts cache list
bun run skills/tts/scripts/tts.ts cache reap
bun run skills/tts/scripts/tts.ts cache clear
```

## Voice Aliases

| Alias    | Model                    | Notes                    |
| -------- | ------------------------ | ------------------------ |
| `cedric` | `eleven_multilingual_v2` | PVC, voice ID from 1Pass |
| `evie`   | `eleven_multilingual_v2` | Builtin voice            |

Defaults: stability 0.80, similarity 0.61, style 0.70, speaker boost on, speed 1.2.

## Batch Manifest Format

```json
{
  "defaults": {
    "model": "eleven_multilingual_v2",
    "speed": 1.2,
    "stretch": 1.3,
    "stability": 0.8,
    "similarity": 0.61,
    "style": 0.7,
    "speaker_boost": true,
    "bitrate": "192k"
  },
  "items": [
    { "type": "tts", "id": "000", "voice": "cedric", "text": "Welcome..." },
    { "type": "audio", "id": "001", "path": "./sting.mp3" },
    { "type": "chapter", "title": "Introduction" },
    { "type": "silence", "id": "002", "duration": 1.5 },
    { "type": "tts", "id": "003", "voice": "evie", "text": "Thanks..." }
  ]
}
```

Batch output: individual MP3 files + `concat.txt` + `chapters.json`.

## Cache

Location: `.cache/tts/{sha256}.mp3`

Hash inputs: text + voice_id + model + stability + similarity + style +
speed + stretch + speaker_boost. Cache hit = copy to output, no API call.

## Dependencies

- ElevenLabs API key (1Password or `ELEVENLABS_API_KEY` env)
- `ffmpeg` for encoding
- Bungee binary for stretch (optional, at `~/src/bungee-audio-stretch/bungee/build/bungee`)

## References

- `references/dialog-briefing.md` — Full workflow, writing rules, and render defaults for two-voice Socratic audio summaries of technical documents
- `references/notion.md` — How to read EVP Notion document structures (RFDs, PRDs, ADRs) to extract audio content
- `TTS.md` — Speech-prep transforms: symbols, numbers, acronyms, sentence structure for ElevenLabs
- `references/pronunciation.md` — ElevenLabs pronunciation edge cases and dictionary guidance
- `references/tts-advice.md` — Accumulated production lessons from The Traversal Podcast
