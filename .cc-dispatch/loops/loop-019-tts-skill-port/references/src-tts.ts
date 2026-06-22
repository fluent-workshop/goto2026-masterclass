#!/usr/bin/env bun
/// <reference types="bun-types" />

import { readFileSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import {
  parseArgs,
  requireArg,
  optionalArg,
  optionalNumber,
  optionalBool,
  out,
  fatal,
  type Args,
} from "./lib/args.ts";
import { resolveVoice, listAliases } from "./lib/voices.ts";
import { synthesize, type SynthesisParams } from "./lib/elevenlabs.ts";
import {
  type CacheKey,
  cacheHit,
  cacheStoreBuffer,
  copyFromCache,
  cachePath,
  cacheList,
  cacheReap,
  cacheClear,
} from "./lib/cache.ts";
import { stretch } from "./lib/stretch.ts";
import { processBatch, type BatchManifest } from "./lib/batch.ts";
import { syncDictionary, loadDictState, type DictState } from "./lib/elevenlabs.ts";

function usage(): never {
  console.error(`Usage: tts <command> [options]

Commands:
  generate  Generate speech from text or file
  batch     Process a JSON manifest of items
  cache     Manage the generation cache
  dict      Manage pronunciation dictionary

generate options:
  --text <string>       Text to synthesize (or --file)
  --file <path>         Read text from file
  --voice <alias|id>    Voice alias or ElevenLabs ID (default: evie)
  --output <path>       Output file path (required, or - for stdout)
  --model <id>          ElevenLabs model ID
  --speed <n>           Native speed param (default: 1.2)
  --stretch <n>         atempo time-stretch multiplier (default: 1.0)
  --stability <n>       Voice stability (default: 0.80)
  --similarity <n>      Voice similarity (default: 0.61)
  --style <n>           Voice style (default: 0.70)
  --speaker-boost       Enable speaker boost (default: true)
  --format <mp3|wav>    Output format (default: mp3)
  --bitrate <rate>      MP3 bitrate (default: 192k)

batch options:
  --manifest <path>     Path to JSON manifest file (required)
  --output-dir <path>   Output directory (required)

cache subcommands:
  cache list            Show cached generations
  cache reap            Delete entries older than 24h
  cache clear           Delete all cached entries

dict subcommands:
  dict sync             Upload PLS file to ElevenLabs
  dict status           Show current dictionary state

Voices: ${listAliases().join(", ")}

Environment:
  ELEVENLABS_API_KEY    API key (overrides 1Password)
  STRETCH_ALGO          (unused — ffmpeg atempo is always available)`);
  process.exit(1);
}

async function cmdGenerate(args: Args): Promise<void> {
  const textArg = optionalArg(args, "text");
  const fileArg = optionalArg(args, "file");
  if (!textArg && !fileArg) fatal("Provide --text or --file");
  const text = textArg ?? readFileSync(fileArg!, "utf-8").trim();
  if (!text) fatal("Empty text input");

  const voiceName = optionalArg(args, "voice", "evie")!;
  const outputPath = requireArg(args, "output");
  const format = optionalArg(args, "format", "mp3")!;
  const bitrate = optionalArg(args, "bitrate", "192k")!;

  const { voiceId, profile } = await resolveVoice(voiceName);

  const model = optionalArg(args, "model") ?? profile.model;
  const speed = optionalNumber(args, "speed") ?? profile.speed;
  const stretchFactor = optionalNumber(args, "stretch") ?? 1.0;
  const stability = optionalNumber(args, "stability") ?? profile.stability;
  const similarity = optionalNumber(args, "similarity") ?? profile.similarity;
  const style = optionalNumber(args, "style") ?? profile.style;
  const speakerBoost = args["speaker-boost"] !== "false"
    ? (profile.speakerBoost)
    : false;

  const dictState = loadDictState();
  const cacheKey: CacheKey = {
    text,
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
  };

  // Check cache
  const cached = cacheHit(cacheKey);
  if (cached) {
    console.error(`Cache hit: ${cached}`);
    if (outputPath === "-") {
      process.stdout.write(readFileSync(cached));
    } else {
      copyFromCache(cached, outputPath);
    }
    out({ status: "cache_hit", output: outputPath, hash: cachePath(cacheKey).split("/").pop() });
    return;
  }

  // Synthesize
  console.error(`Synthesizing: ${text.slice(0, 80)}...`);
  const params: SynthesisParams = {
    model,
    speed,
    stability,
    similarity,
    style,
    speakerBoost,
  };
  const { audio } = await synthesize(text, voiceId, params);
  console.error(`  Got ${audio.length} bytes from ElevenLabs`);

  let finalPath: string;

  if (stretchFactor !== 1.0) {
    console.error(`  Applying atempo stretch: ${stretchFactor}x`);
    const rawMp3 = join(tmpdir(), `tts-${randomUUID()}.mp3`);
    const stretchedMp3 = join(tmpdir(), `tts-${randomUUID()}.mp3`);
    await Bun.write(rawMp3, audio);
    await stretch(rawMp3, stretchFactor, stretchedMp3, bitrate);

    // Cache the stretched result
    const stretchedData = Buffer.from(await Bun.file(stretchedMp3).arrayBuffer());
    await cacheStoreBuffer(cacheKey, stretchedData);
    finalPath = stretchedMp3;

    // Cleanup raw
    try { Bun.spawn(["rm", rawMp3]); } catch {}
  } else {
    // Cache raw audio
    await cacheStoreBuffer(cacheKey, audio);
    finalPath = cachePath(cacheKey);
  }

  // Copy to output
  if (outputPath === "-") {
    process.stdout.write(readFileSync(finalPath));
  } else {
    copyFromCache(finalPath, outputPath);
  }

  out({
    status: "generated",
    output: outputPath,
    voice: voiceName,
    voiceId,
    model,
    speed,
    stretch: stretchFactor,
    bytes: readFileSync(outputPath).length,
  });
}

async function cmdBatch(args: Args): Promise<void> {
  const manifestPath = requireArg(args, "manifest");
  const outputDir = requireArg(args, "output-dir");

  const raw = readFileSync(manifestPath, "utf-8");
  let manifest: BatchManifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    fatal(`Invalid JSON in manifest: ${manifestPath}`);
  }

  if (!manifest.items || !Array.isArray(manifest.items)) {
    fatal("Manifest must have an 'items' array");
  }

  const ttsCount = manifest.items.filter((i) => i.type === "tts").length;
  const totalCount = manifest.items.length;
  console.error(
    `Processing batch: ${totalCount} items (${ttsCount} TTS) → ${outputDir}`,
  );

  const result = await processBatch(manifest, outputDir);

  out({
    status: "ok",
    outputDir,
    files: result.files.length,
    chapters: result.chapters.length,
    concatFile: join(outputDir, "concat.txt"),
    chaptersFile: join(outputDir, "chapters.json"),
  });
}

async function cmdCache(args: Args, positional: string[]): Promise<void> {
  const sub = positional[0];
  if (!sub) fatal("Usage: tts cache <list|reap|clear>");

  switch (sub) {
    case "list": {
      const entries = cacheList();
      out({
        count: entries.length,
        totalBytes: entries.reduce((s, e) => s + e.size, 0),
        entries: entries.map((e) => ({
          hash: e.hash,
          size: e.size,
          mtime: e.mtime.toISOString(),
        })),
      });
      break;
    }
    case "reap": {
      const reaped = cacheReap();
      out({ status: "ok", reaped });
      break;
    }
    case "clear": {
      const cleared = cacheClear();
      out({ status: "ok", cleared });
      break;
    }
    default:
      fatal(`Unknown cache subcommand: ${sub}. Use list, reap, or clear.`);
  }
}

const { command, args, positional } = parseArgs(process.argv.slice(2), usage);

async function cmdDict(_args: Args, positional: string[]): Promise<void> {
  const sub = positional[0];
  if (!sub) fatal("Usage: tts dict <sync|status>");

  switch (sub) {
    case "sync": {
      console.error("Uploading pronunciation dictionary to ElevenLabs...");
      const state = await syncDictionary();
      console.error(`  Uploaded ${state.rulesCount} rules`);
      out({
        status: "synced",
        dictionaryId: state.dictionaryId,
        versionId: state.versionId,
        rulesCount: state.rulesCount,
        uploadedAt: state.uploadedAt,
      });
      break;
    }
    case "status": {
      const state = loadDictState();
      if (!state) {
        out({ status: "not_synced", message: "No dictionary uploaded. Run: tts dict sync" });
      } else {
        out({ status: "synced", ...state });
      }
      break;
    }
    default:
      fatal(`Unknown dict subcommand: ${sub}. Use sync or status.`);
  }
}

const commands: Record<string, (a: Args, p: string[]) => Promise<void>> = {
  generate: (a) => cmdGenerate(a),
  batch: (a) => cmdBatch(a),
  cache: (a, p) => cmdCache(a, p),
  dict: (a, p) => cmdDict(a, p),
};

const handler = commands[command];
if (!handler) {
  console.error(`Unknown command: ${command}`);
  usage();
}

try {
  await handler(args, positional);
} catch (err) {
  fatal(err instanceof Error ? err.message : String(err));
}
