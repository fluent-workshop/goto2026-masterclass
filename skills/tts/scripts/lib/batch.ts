/// Batch processing for TTS manifests.

import { mkdirSync, copyFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { fatal } from "./args.ts";
import { resolveVoice } from "./voices.ts";
import { synthesize, type SynthesisParams } from "./elevenlabs.ts";
import { type CacheKey, cacheHit, cacheStoreBuffer, copyFromCache, cachePath } from "./cache.ts";
import { stretch, generateSilence } from "./stretch.ts";
import { loadDictState } from "./elevenlabs.ts";

export interface BatchDefaults {
  model?: string;
  speed?: number;
  stretch?: number;
  stability?: number;
  similarity?: number;
  style?: number;
  speaker_boost?: boolean;
  bitrate?: string;
}

export interface TtsItem {
  type: "tts";
  id: string;
  voice: string;
  text: string;
  model?: string;
  speed?: number;
  stretch?: number;
  stability?: number;
  similarity?: number;
  style?: number;
  speaker_boost?: boolean;
}

export interface AudioItem {
  type: "audio";
  id: string;
  path: string;
}

export interface ChapterItem {
  type: "chapter";
  title: string;
}

export interface SilenceItem {
  type: "silence";
  id: string;
  duration: number;
}

export type BatchItem = TtsItem | AudioItem | ChapterItem | SilenceItem;

export interface BatchManifest {
  defaults?: BatchDefaults;
  items: BatchItem[];
}

interface ChapterMark {
  title: string;
  startTime: number;
}

function tmpPath(ext: string): string {
  return join(
    require("node:os").tmpdir(),
    `tts-${crypto.randomUUID()}.${ext}`,
  );
}

async function getAudioDuration(filePath: string): Promise<number> {
  const proc = Bun.spawn(
    ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
    { stdout: "pipe", stderr: "pipe" },
  );
  const code = await proc.exited;
  if (code !== 0) return 0;
  const out = await new Response(proc.stdout).text();
  return parseFloat(out.trim()) || 0;
}

async function processTtsItem(
  item: TtsItem,
  defaults: BatchDefaults,
  outputDir: string,
  bitrate: string,
): Promise<string> {
  const { voiceId, profile } = await resolveVoice(item.voice);

  const model = item.model ?? defaults.model ?? profile.model;
  const speed = item.speed ?? defaults.speed ?? profile.speed;
  const stretchFactor = item.stretch ?? defaults.stretch ?? 1.0;
  const stability = item.stability ?? defaults.stability ?? profile.stability;
  const similarity = item.similarity ?? defaults.similarity ?? profile.similarity;
  const style = item.style ?? defaults.style ?? profile.style;
  const speakerBoost = item.speaker_boost ?? defaults.speaker_boost ?? profile.speakerBoost;

  const dictState = loadDictState();
  const cacheKey: CacheKey = {
    text: item.text,
    voiceId,
    model,
    stability,
    similarity,
    style,
    speed,
    stretch: stretchFactor,
    speakerBoost,
    dictVersionId: dictState?.versionId,
    outputFormat: "mp3_44100_192",
    bitrate,
  };

  const outputFile = join(outputDir, `${item.id}-${item.voice.toLowerCase()}.mp3`);

  // Check cache
  const cached = cacheHit(cacheKey);
  if (cached) {
    console.error(`  [CACHE] ${item.id}-${item.voice}`);
    copyFromCache(cached, outputFile);
    return outputFile;
  }

  // Generate via ElevenLabs
  console.error(`  [TTS]   ${item.id}-${item.voice}: ${item.text.slice(0, 60)}...`);
  const params: SynthesisParams = {
    model,
    speed,
    stability,
    similarity,
    style,
    speakerBoost,
  };
  const { audio } = await synthesize(item.text, voiceId, params);

  if (stretchFactor !== 1.0) {
    // Write to temp, stretch, cache result
    const rawMp3 = tmpPath("mp3");
    const stretchedMp3 = tmpPath("mp3");
    await Bun.write(rawMp3, audio);
    await stretch(rawMp3, stretchFactor, stretchedMp3, bitrate);
    await cacheStoreBuffer(cacheKey, Buffer.from(await Bun.file(stretchedMp3).arrayBuffer()));
    copyFromCache(cachePath(cacheKey), outputFile);
    // Cleanup
    try { Bun.spawn(["rm", rawMp3, stretchedMp3]); } catch {}
  } else {
    // Cache the raw audio
    await cacheStoreBuffer(cacheKey, audio);
    copyFromCache(cachePath(cacheKey), outputFile);
  }

  return outputFile;
}

export async function processBatch(
  manifest: BatchManifest,
  outputDir: string,
): Promise<{ files: string[]; chapters: ChapterMark[] }> {
  mkdirSync(outputDir, { recursive: true });

  const defaults = manifest.defaults ?? {};
  const bitrate = defaults.bitrate ?? "192k";
  const concatLines: string[] = [];
  const chapters: ChapterMark[] = [];
  let currentTime = 0;

  // Separate TTS items for concurrent processing
  const ttsItems: { index: number; item: TtsItem }[] = [];
  const otherItems: { index: number; item: BatchItem }[] = [];

  for (let i = 0; i < manifest.items.length; i++) {
    const item = manifest.items[i];
    if (item.type === "tts") {
      ttsItems.push({ index: i, item });
    } else {
      otherItems.push({ index: i, item });
    }
  }

  // Process TTS items concurrently (batches of 5)
  const BATCH_SIZE = 5;
  const ttsResults = new Map<number, string>();

  for (let i = 0; i < ttsItems.length; i += BATCH_SIZE) {
    const batch = ttsItems.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(({ index, item }) =>
        processTtsItem(item, defaults, outputDir, bitrate).then((file) => ({
          index,
          file,
        })),
      ),
    );
    for (const { index, file } of results) {
      ttsResults.set(index, file);
    }
  }

  // Process other items sequentially
  const otherResults = new Map<number, string>();
  for (const { index, item } of otherItems) {
    if (item.type === "audio") {
      const dest = join(outputDir, `${item.id}-audio.mp3`);
      copyFileSync(item.path, dest);
      otherResults.set(index, dest);
    } else if (item.type === "silence") {
      const dest = join(outputDir, `${item.id}-silence.mp3`);
      await generateSilence(item.duration, dest, bitrate);
      otherResults.set(index, dest);
    }
    // chapter items don't produce files
  }

  // Build concat.txt and chapters.json in manifest order
  const allFiles: string[] = [];
  for (let i = 0; i < manifest.items.length; i++) {
    const item = manifest.items[i];
    if (item.type === "chapter") {
      chapters.push({ title: item.title, startTime: currentTime });
      continue;
    }

    const file = ttsResults.get(i) ?? otherResults.get(i);
    if (!file) continue;

    allFiles.push(file);
    const basename = file.split("/").pop()!;
    concatLines.push(`file '${basename}'`);

    const duration = await getAudioDuration(file);
    currentTime += duration;
  }

  // Write concat.txt
  writeFileSync(join(outputDir, "concat.txt"), concatLines.join("\n") + "\n");

  // Write chapters.json
  writeFileSync(
    join(outputDir, "chapters.json"),
    JSON.stringify(chapters, null, 2) + "\n",
  );

  return { files: allFiles, chapters };
}
