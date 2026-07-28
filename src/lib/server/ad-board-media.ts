import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AdSlot } from "@/lib/ad-board";
import { ffmpegExecutable, isMissingFfmpegError } from "@/lib/server/ffmpeg-runtime";
import { saveMediaAsset } from "@/lib/server/supabase-admin";

const execute = promisify(execFile);

async function downloadChaplinAsset(url: string, destination: string) {
  const parsed = new URL(url);
  const storageHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : "";
  if (parsed.protocol !== "https:" || parsed.hostname !== storageHost) {
    throw new Error("Ad-board media must come from Chaplin's configured storage.");
  }
  const response = await fetch(parsed, { cache: "no-store" });
  if (!response.ok) throw new Error(`Download ad-board media: ${response.status}.`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

function durationFromFfmpeg(output: string) {
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
}

export async function measureStoredAudioMs(url: string) {
  const workDirectory = await mkdtemp(path.join(tmpdir(), "chaplin-board-vo-"));
  const sourcePath = path.join(workDirectory, "voice.mp3");
  try {
    await downloadChaplinAsset(url, sourcePath);
    const configuredFfprobe = process.env.CHAPLIN_FFPROBE_PATH?.trim();
    if (configuredFfprobe) {
      const result = await execute(configuredFfprobe, [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        sourcePath,
      ], { maxBuffer: 1024 * 1024, windowsHide: true });
      const seconds = Number(String(result.stdout).trim());
      if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
      throw new Error("FFprobe returned no measurable voice duration.");
    }
    try {
      await execute(ffmpegExecutable(), ["-hide_banner", "-i", sourcePath], {
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
    } catch (error) {
      if (isMissingFfmpegError(error)) throw error;
      const duration = durationFromFfmpeg(String((error as { stderr?: unknown }).stderr ?? ""));
      if (duration) return duration;
      throw error;
    }
    throw new Error("FFmpeg returned no measurable voice duration.");
  } finally {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Extracts the real terminal image from a rendered source clip. The frame is
 * persisted as an ordinary reference media_asset so downstream image/video
 * generation uses the same durable asset contract as every existing shot.
 */
export async function extractChainLastFrame(input: {
  characterId: string;
  sourceSlot: AdSlot;
  targetSlot: AdSlot;
}) {
  if (input.sourceSlot.status !== "rendered" || !input.sourceSlot.rendered_url || !input.sourceSlot.rendered_asset_id) {
    throw new Error("Chain source must be rendered before its last frame can be extracted.");
  }
  if (input.sourceSlot.wardrobe_state !== input.targetSlot.wardrobe_state) {
    throw new Error("Wardrobe state cannot change inside a motion chain.");
  }
  const workDirectory = await mkdtemp(path.join(tmpdir(), "chaplin-board-chain-"));
  const sourcePath = path.join(workDirectory, "source.mp4");
  const framePath = path.join(workDirectory, "last-frame.png");
  try {
    await downloadChaplinAsset(input.sourceSlot.rendered_url, sourcePath);
    await execute(ffmpegExecutable(), [
      "-y",
      "-sseof", "-0.1",
      "-i", sourcePath,
      "-frames:v", "1",
      framePath,
    ], { maxBuffer: 10 * 1024 * 1024, windowsHide: true });
    const bytes = await readFile(framePath);
    return saveMediaAsset({
      characterId: input.characterId,
      kind: "reference",
      provider: "ffmpeg",
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      contentType: "image/png",
      prompt: input.targetSlot.image_prompt,
      metadata: {
        adBoardSlotId: input.targetSlot.id,
        chainedFromSlotId: input.sourceSlot.id,
        chainedFromAssetId: input.sourceSlot.rendered_asset_id,
        extraction: "ffmpeg -sseof -0.1 -frames:v 1",
        identity_block: input.sourceSlot.identity_block,
        wardrobe_state: input.sourceSlot.wardrobe_state,
        age_state: input.sourceSlot.age_state,
      },
    });
  } finally {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
