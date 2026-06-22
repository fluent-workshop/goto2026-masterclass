/// ElevenLabs TTS API client with rate limiting and retry.

import { getSecret } from "@evie/lib/secrets";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import Bottleneck from "bottleneck";

const BASE_URL = "https://api.elevenlabs.io/v1";
const TTS_URL = `${BASE_URL}/text-to-speech`;
const DICT_URL = `${BASE_URL}/pronunciation-dictionaries`;
const MAX_RETRIES = 5;

// Dictionary state file — stores uploaded dict ID + version
const SKILL_DIR = join(import.meta.dir, "../..");
const DICT_PLS_PATH = join(SKILL_DIR, "references/dictionary.pls");
const DICT_STATE_PATH = join(SKILL_DIR, ".cache/dict-state.json");

let _apiKey: string | null = null;

async function getApiKey(): Promise<string> {
  if (_apiKey) return _apiKey;
  _apiKey = await getSecret({
    op: "op://Openclaw/EVIE - Elevenlabs API Key/password",
    env: "ELEVENLABS_API_KEY",
  });
  return _apiKey;
}

export interface DictState {
  dictionaryId: string;
  versionId: string;
  rulesCount: number;
  uploadedAt: string;
}

/** Load current dictionary state from disk, or null if not synced yet. */
export function loadDictState(): DictState | null {
  if (!existsSync(DICT_STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(DICT_STATE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

/** Upload the PLS dictionary file and save state. */
export async function syncDictionary(): Promise<DictState> {
  if (!existsSync(DICT_PLS_PATH)) {
    throw new Error(`Dictionary PLS file not found: ${DICT_PLS_PATH}`);
  }

  const apiKey = await getApiKey();

  // Bun's FormData multipart encoding breaks ElevenLabs PLS parsing — use curl
  const proc = Bun.spawn([
    "curl", "-s", "-X", "POST",
    `${DICT_URL}/add-from-file`,
    "-H", `xi-api-key: ${apiKey}`,
    "-F", "name=evie-tts-dictionary",
    "-F", "description=Auto-synced pronunciation dictionary from TTS skill",
    `-F`, `file=@${DICT_PLS_PATH}`,
  ], { stdout: "pipe", stderr: "pipe" });

  const code = await proc.exited;
  const stdout = await new Response(proc.stdout).text();

  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`curl failed (exit ${code}): ${stderr.trim()}`);
  }

  let data: { id: string; version_id: string; version_rules_num: number };
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error(`Dictionary upload failed: ${stdout.slice(0, 200)}`);
  }

  if (!data.id) {
    throw new Error(`Dictionary upload failed: ${stdout.slice(0, 200)}`);
  }

  const state: DictState = {
    dictionaryId: data.id,
    versionId: data.version_id,
    rulesCount: data.version_rules_num,
    uploadedAt: new Date().toISOString(),
  };

  // Ensure cache dir exists
  const cacheDir = join(SKILL_DIR, ".cache");
  const { mkdirSync, writeFileSync } = await import("fs");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(DICT_STATE_PATH, JSON.stringify(state, null, 2) + "\n");

  return state;
}

// Conservative: ~5 concurrent, 200ms min between requests
const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200,
});

export interface SynthesisParams {
  model?: string;
  stability?: number;
  similarity?: number;
  style?: number;
  speakerBoost?: boolean;
  speed?: number;
}

/** Character-level alignment returned by the /with-timestamps endpoint. */
export interface CharAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Word-level timing derived from character alignment. */
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

/** Convert character-level alignment to word-level timing.
 *  If stretchFactor is provided, timestamps are divided by it
 *  (Bungee slows playback, so real-time positions = original / factor). */
export function charsToWords(alignment: CharAlignment, stretchFactor?: number): WordTiming[] {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  const words: WordTiming[] = [];
  let wordChars: string[] = [];
  let wordStart = -1;
  let wordEnd = -1;
  const divisor = stretchFactor && stretchFactor !== 1.0 ? stretchFactor : 1;

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (ch === ' ' || ch === '\n') {
      if (wordChars.length > 0) {
        words.push({
          word: wordChars.join(''),
          start: Math.round((wordStart / divisor) * 1000) / 1000,
          end: Math.round((wordEnd / divisor) * 1000) / 1000,
        });
        wordChars = [];
        wordStart = -1;
      }
    } else {
      wordChars.push(ch);
      if (wordStart < 0) wordStart = starts[i];
      wordEnd = ends[i];
    }
  }
  if (wordChars.length > 0) {
    words.push({
      word: wordChars.join(''),
      start: Math.round((wordStart / divisor) * 1000) / 1000,
      end: Math.round((wordEnd / divisor) * 1000) / 1000,
    });
  }
  return words;
}

/** Build the request body shared across synthesis calls. */
function buildRequestBody(text: string, params: SynthesisParams): Record<string, any> {
  const dictState = loadDictState();
  const dictLocators = dictState
    ? [{
        pronunciation_dictionary_id: dictState.dictionaryId,
        version_id: dictState.versionId,
      }]
    : undefined;

  return {
    text,
    model_id: params.model ?? "eleven_turbo_v2",
    voice_settings: {
      stability: params.stability ?? 0.80,
      similarity_boost: params.similarity ?? 0.61,
      style: params.style ?? 0.70,
      use_speaker_boost: params.speakerBoost ?? true,
    },
    ...(params.speed && params.speed !== 1.0 ? { speed: params.speed } : {}),
    ...(dictLocators ? { pronunciation_dictionary_locators: dictLocators } : {}),
  };
}

/** Fetch with retry logic (shared by both endpoints). */
async function fetchWithRetry(
  url: string,
  apiKey: string,
  body: Record<string, any>,
  accept: string,
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await limiter.schedule(() =>
        fetch(url, {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: accept,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        }),
      );
    } catch (err: any) {
      if (
        (err?.name === "TimeoutError" || err?.name === "AbortError") &&
        attempt < MAX_RETRIES - 1
      ) {
        const delay = 2000 * (attempt + 1);
        console.error(`  retry ${attempt + 1}: timeout (waiting ${delay}ms)`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }

    if (res.ok) return res;

    const errText = await res.text().catch(() => "(no body)");
    if (
      (res.status === 429 || res.status >= 500) &&
      attempt < MAX_RETRIES - 1
    ) {
      const retryAfter = res.headers.get("retry-after");
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : 2000 * (attempt + 1);
      console.error(
        `  retry ${attempt + 1}: ${res.status} (waiting ${delay}ms)`,
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    throw new Error(
      `ElevenLabs API ${res.status}: ${errText.slice(0, 200)}`,
    );
  }

  throw new Error("ElevenLabs API: exhausted retries");
}

/** Result from synthesize — always includes timestamps. */
export interface SynthesisResult {
  audio: Buffer;
  alignment: CharAlignment;
  normalizedAlignment: CharAlignment;
  words: WordTiming[];
}

/** Synthesize text to speech. Always returns character-level timestamps
 *  alongside the audio (uses /with-timestamps endpoint internally).
 *  Pass stretchFactor if you'll apply Bungee post-processing so word
 *  timestamps are pre-adjusted to match the stretched audio.
 *  Callers that don't need timestamps can just use result.audio. */
export async function synthesize(
  text: string,
  voiceId: string,
  params: SynthesisParams = {},
  stretchFactor?: number,
): Promise<SynthesisResult> {
  const apiKey = await getApiKey();
  const url = `${TTS_URL}/${voiceId}/with-timestamps?output_format=mp3_44100_192`;
  const body = buildRequestBody(text, params);
  const res = await fetchWithRetry(url, apiKey, body, "application/json");

  const data = await res.json() as any;
  const audio = Buffer.from(data.audio_base64, 'base64');
  const alignment: CharAlignment = data.alignment;
  const normalizedAlignment: CharAlignment = data.normalized_alignment;
  const words = charsToWords(alignment, stretchFactor);

  return { audio, alignment, normalizedAlignment, words };
}

