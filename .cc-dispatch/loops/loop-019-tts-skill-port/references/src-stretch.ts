/// Time-stretch wrapper using ffmpeg atempo filter.
/// atempo is a phase vocoder —
/// clean speech stretch with no pitch shift or formant drift.
/// Pipeline: input MP3 → ffmpeg atempo filter → output MP3 (single pass, no WAV intermediate)
///
/// atempo supports 0.5–2.0x per filter stage. Chain two stages for >2x if needed.
/// Preferred settings for speech: 1.15x on top of ElevenLabs speed:1.2 → ~1.38x effective rate.

import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { join } from "path";

function tmpPath(ext: string): string {
  return join(tmpdir(), `tts-${randomUUID()}.${ext}`);
}

async function run(cmd: string[]): Promise<void> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`${cmd[0]} failed (exit ${code}): ${stderr.trim()}`);
  }
}

/**
 * Apply ffmpeg atempo time-stretch to an MP3 file.
 *
 * @param inputMp3 - Path to input MP3 file
 * @param speed - Speed multiplier (>1 = faster). Values 0.5–2.0 supported in one pass.
 * @param outputMp3 - Path to output MP3 file
 * @param bitrate - MP3 encoding bitrate (default "192k")
 */
export async function stretch(
  inputMp3: string,
  speed: number,
  outputMp3: string,
  bitrate = "192k",
): Promise<void> {
  // Build atempo filter chain — chain two stages if speed > 2.0 or < 0.5
  let filter: string;
  if (speed > 2.0) {
    // e.g. 2.5x = atempo=2.0,atempo=1.25
    const stage1 = 2.0;
    const stage2 = speed / 2.0;
    filter = `atempo=${stage1},atempo=${stage2}`;
  } else if (speed < 0.5) {
    const stage1 = 0.5;
    const stage2 = speed / 0.5;
    filter = `atempo=${stage1},atempo=${stage2}`;
  } else {
    filter = `atempo=${speed}`;
  }

  await run([
    "ffmpeg", "-y", "-i", inputMp3,
    "-filter_complex", filter,
    "-codec:a", "libmp3lame", "-b:a", bitrate,
    outputMp3,
  ]);
}

/**
 * Generate silence of a given duration as MP3.
 */
export async function generateSilence(
  durationSec: number,
  outputMp3: string,
  bitrate = "192k",
): Promise<void> {
  await run([
    "ffmpeg", "-y",
    "-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`,
    "-t", durationSec.toString(),
    "-codec:a", "libmp3lame", "-b:a", bitrate,
    outputMp3,
  ]);
}
