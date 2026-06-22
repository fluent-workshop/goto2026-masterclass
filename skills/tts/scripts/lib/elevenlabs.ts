/// ElevenLabs TTS API client with rate limiting and retry.

import { getSecret } from "./secrets.ts";
import Bottleneck from "bottleneck";

const BASE_URL = "https://api.elevenlabs.io/v1";
const TTS_URL = `${BASE_URL}/text-to-speech`;
const MAX_RETRIES = 5;

let _apiKey: string | null = null;

async function getApiKey(): Promise<string> {
  if (_apiKey) return _apiKey;
  _apiKey = await getSecret({ env: "ELEVENLABS_API_KEY" });
  return _apiKey;
}

/** Pronunciation dictionaries are not used in the classroom build.
 *  This stub always returns null so callers (e.g. batch.ts) stay unchanged. */
export function loadDictState(): null {
  return null;
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
 *  (slower playback means real-time positions = original / factor). */
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
  return {
    text,
    model_id: params.model ?? "eleven_turbo_v2_5",
    voice_settings: {
      stability: params.stability ?? 0.80,
      similarity_boost: params.similarity ?? 0.61,
      style: params.style ?? 0.70,
      use_speaker_boost: params.speakerBoost ?? true,
    },
    ...(params.speed && params.speed !== 1.0 ? { speed: params.speed } : {}),
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
 *  Pass stretchFactor if you'll apply time-stretch post-processing so word
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
