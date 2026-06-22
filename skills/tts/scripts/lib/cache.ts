/// Content-addressable TTS generation cache.

import { createHash } from "crypto";
import {
  mkdirSync,
  existsSync,
  copyFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { join } from "path";

// Cache lives under the skill directory, relative to this file:
// scripts/lib/cache.ts → skills/tts/.cache/tts
const CACHE_DIR = join(import.meta.dir, "../../.cache/tts");

export interface CacheKey {
  text: string;
  voiceId: string;
  model: string;
  stability: number;
  similarity: number;
  style: number;
  speed: number;
  stretch: number;
  speakerBoost: boolean;
  dictVersionId?: string;
  outputFormat?: string;
  bitrate?: string;
}

function computeHash(key: CacheKey): string {
  const input = [
    key.text,
    key.voiceId,
    key.model,
    key.stability.toString(),
    key.similarity.toString(),
    key.style.toString(),
    key.speed.toString(),
    key.stretch.toString(),
    key.speakerBoost.toString(),
    key.dictVersionId ?? "none",
    key.outputFormat ?? "mp3_44100_128",
    key.bitrate ?? "default",
  ].join("|");
  return createHash("sha256").update(input).digest("hex");
}

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function cachePath(key: CacheKey): string {
  return join(CACHE_DIR, `${computeHash(key)}.mp3`);
}

export function cacheHit(key: CacheKey): string | null {
  const path = cachePath(key);
  return existsSync(path) ? path : null;
}

export function cacheStore(key: CacheKey, sourcePath: string): string {
  ensureCacheDir();
  const dest = cachePath(key);
  copyFileSync(sourcePath, dest);
  return dest;
}

export async function cacheStoreBuffer(key: CacheKey, data: Buffer): Promise<string> {
  ensureCacheDir();
  const dest = cachePath(key);
  await Bun.write(dest, data);
  return dest;
}

export function copyFromCache(cachedPath: string, outputPath: string): void {
  copyFileSync(cachedPath, outputPath);
}

export interface CacheEntry {
  file: string;
  hash: string;
  size: number;
  mtime: Date;
}

export function cacheList(): CacheEntry[] {
  ensureCacheDir();
  const entries: CacheEntry[] = [];
  for (const file of readdirSync(CACHE_DIR)) {
    if (!file.endsWith(".mp3")) continue;
    const fullPath = join(CACHE_DIR, file);
    const stat = statSync(fullPath);
    entries.push({
      file: fullPath,
      hash: file.replace(".mp3", ""),
      size: stat.size,
      mtime: stat.mtime,
    });
  }
  return entries.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

export function cacheReap(maxAgeMs = 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  let reaped = 0;
  for (const entry of cacheList()) {
    if (entry.mtime.getTime() < cutoff) {
      unlinkSync(entry.file);
      reaped++;
    }
  }
  return reaped;
}

export function cacheClear(): number {
  let cleared = 0;
  for (const entry of cacheList()) {
    unlinkSync(entry.file);
    cleared++;
  }
  return cleared;
}
