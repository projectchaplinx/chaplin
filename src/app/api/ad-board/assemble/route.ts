import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { adBoardSchema, expandLongAdSlots, lintAdBoard } from "@/lib/ad-board";
import { planAdBoardPictureSources } from "@/lib/ad-board-assembly";
import { DELIVERY_LOUDNESS_FILTER } from "@/lib/audio-mix";
import { requireOwnedCharacter, requireOwnedPipelineRun, requireRequestIdentity } from "@/lib/server/auth";
import { ffmpegExecutable, isMissingFfmpegError } from "@/lib/server/ffmpeg-runtime";
import { attachMediaPipelineOutput, getMediaPipelineRun } from "@/lib/server/media-pipeline";
import { assertRequestBodySize, enforceRateLimit, securityErrorStatus } from "@/lib/server/request-security";
import { saveMediaAsset } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const execute = promisify(execFile);
const MUSIC_DUCK_GAIN = Math.pow(10, -15 / 20);

type SlotMedia = {
  slotId: string;
  videoUrl?: string;
  stillUrl?: string;
  sfxUrl?: string;
};

async function download(url: string, destination: string) {
  const parsed = new URL(url);
  const storageHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : "";
  if (parsed.protocol !== "https:" || parsed.hostname !== storageHost) {
    throw new Error("Board media must come from Chaplin's configured storage.");
  }
  const response = await fetch(parsed, { cache: "no-store" });
  if (!response.ok) throw new Error(`Download board media: ${response.status}.`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

function slotMedia(value: unknown): SlotMedia[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.slotId !== "string" || !row.slotId.trim()) return [];
    const optionalUrl = (field: string) => typeof row[field] === "string" && row[field] ? String(row[field]) : undefined;
    return [{
      slotId: row.slotId.trim(),
      videoUrl: optionalUrl("videoUrl"),
      stillUrl: optionalUrl("stillUrl"),
      sfxUrl: optionalUrl("sfxUrl"),
    }];
  });
}

export async function POST(request: Request) {
  let workDirectory = "";
  try {
    assertRequestBodySize(request, 2 * 1024 * 1024);
    const identity = await requireRequestIdentity(request);
    const input = await request.json() as Record<string, unknown>;
    const runId = typeof input.runId === "string" ? input.runId : "";
    const characterId = typeof input.characterId === "string" ? input.characterId : "";
    if (!runId || !characterId) throw new Error("Pipeline run and character are required.");
    await Promise.all([
      requireOwnedPipelineRun(identity, runId),
      requireOwnedCharacter(identity, characterId),
    ]);
    if (identity.role !== "admin") {
      await enforceRateLimit({
        request,
        bucket: "ad-board-assembly",
        limit: 8,
        windowSeconds: 24 * 60 * 60,
        identityId: identity.id,
      });
    }
    const run = await getMediaPipelineRun(runId);
    if (!run) throw new Error("Pipeline run was not found.");
    if (!["spot", "brand_spot", "ugc_ad"].includes(run.outputType)) {
      throw new Error("Ad-board assembly requires an advertising pipeline.");
    }
    const board = adBoardSchema.parse(input.board);
    const failures = lintAdBoard(board).filter((issue) => issue.level === "failure");
    if (failures.length) throw new Error(`Ad board is not renderable: ${failures.map((issue) => `${issue.slotId}: ${issue.message}`).join(" ")}`);
    const renderSlots = expandLongAdSlots(board);
    const mediaBySlot = new Map(slotMedia(input.slotMedia).map((item) => [item.slotId, item]));
    const canonicalReferenceUrl = typeof input.canonicalReferenceUrl === "string" ? input.canonicalReferenceUrl : "";
    const themeUrl = typeof input.themeUrl === "string" ? input.themeUrl : "";
    const totalDurationSeconds = renderSlots.reduce((total, slot) => total + slot.duration_ms, 0) / 1000;
    const width = board.slots.some((slot) => slot.tier === "final") ? 1920 : 854;
    const height = board.slots.some((slot) => slot.tier === "final") ? 1080 : 480;

    workDirectory = await mkdtemp(path.join(tmpdir(), "chaplin-ad-board-"));
    const ffmpeg = ffmpegExecutable();
    const normalized: string[] = [];
    let previousFrame = "";
    const picturePlan = planAdBoardPictureSources(
      renderSlots.map((slot) => slot.id),
      [...mediaBySlot.values()],
      canonicalReferenceUrl,
    );
    for (const [index, slot] of renderSlots.entries()) {
      const media = mediaBySlot.get(slot.id);
      if (slot.part && !media?.videoUrl && !media?.stillUrl) {
        throw new Error(`Long slot ${slot.source_slot_id} requires its own clip or still for sub-slot ${slot.id}.`);
      }
      const durationSeconds = slot.duration_ms / 1000;
      const outputPath = path.join(workDirectory, `slot-${index + 1}.mp4`);
      const lastFramePath = path.join(workDirectory, `slot-${index + 1}-last.png`);
      const picture = picturePlan[index].source;
      if (picture.kind === "video") {
        const source = path.join(workDirectory, `slot-${index + 1}-source.mp4`);
        await download(picture.url, source);
        await execute(ffmpeg, [
          "-y", "-i", source,
          "-vf", `tpad=stop_mode=clone:stop_duration=${durationSeconds},trim=duration=${durationSeconds},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=24,setsar=1`,
          "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
          "-t", String(durationSeconds), outputPath,
        ], { maxBuffer: 10 * 1024 * 1024, windowsHide: true });
      } else {
        const stillUrl = picture.kind === "still" || picture.kind === "canonical" ? picture.url : "";
        const stillPath = stillUrl
          ? path.join(workDirectory, `slot-${index + 1}-still.png`)
          : previousFrame;
        if (stillUrl) await download(stillUrl, stillPath);
        if (!stillPath) throw new Error(`Slot ${slot.id} has no clip, still, canonical reference, or previous frame to carry forward.`);
        await execute(ffmpeg, [
          "-y", "-loop", "1", "-i", stillPath,
          "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=24,setsar=1`,
          "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
          "-t", String(durationSeconds), outputPath,
        ], { maxBuffer: 10 * 1024 * 1024, windowsHide: true });
      }
      await execute(ffmpeg, [
        "-y", "-sseof", "-0.1", "-i", outputPath, "-frames:v", "1", lastFramePath,
      ], { maxBuffer: 10 * 1024 * 1024, windowsHide: true });
      previousFrame = lastFramePath;
      normalized.push(outputPath);
    }

    const dialogueInputs: Array<{ path: string; offsetMs: number; durationSeconds: number }> = [];
    const sfxInputs: Array<{ path: string; offsetMs: number; durationSeconds: number }> = [];
    let offsetMs = 0;
    for (const slot of board.slots) {
      if (slot.vo_line && slot.dialogue_url) {
        const sourcePath = path.join(workDirectory, `vo-${slot.slot_no}.mp3`);
        await download(slot.dialogue_url, sourcePath);
        dialogueInputs.push({ path: sourcePath, offsetMs, durationSeconds: slot.duration_ms / 1000 });
      }
      const media = mediaBySlot.get(slot.id);
      if (media?.sfxUrl) {
        const sourcePath = path.join(workDirectory, `sfx-${slot.slot_no}.mp3`);
        await download(media.sfxUrl, sourcePath);
        sfxInputs.push({ path: sourcePath, offsetMs, durationSeconds: slot.duration_ms / 1000 });
      }
      offsetMs += slot.duration_ms;
    }
    const themePath = themeUrl ? path.join(workDirectory, "theme.mp3") : "";
    if (themePath) await download(themeUrl, themePath);
    const outputPath = path.join(workDirectory, "ad-board-master.mp4");
    const concatList = path.join(workDirectory, "concat.txt");
    await writeFile(
      concatList,
      normalized.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"),
    );

    const audioInputs: string[] = [];
    const audioFilters: string[] = [];
    const labels = ["[bed]"];
    let inputIndex = 2;
    for (const [index, source] of dialogueInputs.entries()) {
      audioInputs.push("-i", source.path);
      audioFilters.push(`[${inputIndex}:a]adelay=${source.offsetMs}|${source.offsetMs},apad,atrim=0:${totalDurationSeconds},asetpts=PTS-STARTPTS[vo${index}]`);
      labels.push(`[vo${index}]`);
      inputIndex += 1;
    }
    for (const [index, source] of sfxInputs.entries()) {
      audioInputs.push("-i", source.path);
      audioFilters.push(`[${inputIndex}:a]volume=0.7,adelay=${source.offsetMs}|${source.offsetMs},apad,atrim=0:${totalDurationSeconds},asetpts=PTS-STARTPTS[sfx${index}]`);
      labels.push(`[sfx${index}]`);
      inputIndex += 1;
    }
    if (themePath) {
      audioInputs.push("-i", themePath);
      const windows = dialogueInputs.map((source) => `between(t,${source.offsetMs / 1000},${source.offsetMs / 1000 + source.durationSeconds})`);
      const volume = windows.length
        ? `volume='if(gt(${windows.join("+")},0),${(0.18 * MUSIC_DUCK_GAIN).toFixed(4)},0.18)':eval=frame`
        : "volume=0.18";
      audioFilters.push(`[${inputIndex}:a]${volume},aloop=loop=-1:size=2e9,atrim=0:${totalDurationSeconds},asetpts=PTS-STARTPTS[music]`);
      labels.push("[music]");
    }
    audioFilters.unshift(`[1:a]atrim=0:${totalDurationSeconds},asetpts=PTS-STARTPTS[bed]`);
    audioFilters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=first:dropout_transition=0,${DELIVERY_LOUDNESS_FILTER},alimiter=limit=0.95[aout]`);

    await execute(ffmpeg, [
      "-y",
      "-f", "concat", "-safe", "0", "-i", concatList,
      "-f", "lavfi", "-t", String(totalDurationSeconds), "-i", "anullsrc=r=48000:cl=stereo",
      ...audioInputs,
      "-filter_complex", audioFilters.join(";"),
      "-map", "0:v", "-map", "[aout]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-t", String(totalDurationSeconds), "-movflags", "+faststart",
      outputPath,
    ], { maxBuffer: 20 * 1024 * 1024, windowsHide: true });

    const output = await readFile(outputPath);
    const asset = await saveMediaAsset({
      characterId,
      kind: "spot",
      provider: "ffmpeg",
      bytes: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer,
      contentType: "video/mp4",
      durationSeconds: totalDurationSeconds,
      metadata: {
        pipelineRunId: run.id,
        adBoard: board,
        renderSlots: renderSlots.map((slot) => ({ id: slot.id, sourceSlotId: slot.source_slot_id, durationMs: slot.duration_ms, tier: slot.tier })),
        assembly: {
          missingVideo: "approved still",
          missingStill: "carry previous slot last frame",
          longVideo: "trim",
          shortVideo: "tpad clone",
          musicDuckDb: -15,
          loudnessLufs: -14,
        },
        estimatedSpendUsd: board.estimated_spend_usd,
        actualSpendUsd: board.actual_spend_usd,
      },
    });
    const renderedOutput = {
      url: asset.url,
      durationSeconds: totalDurationSeconds,
      slotCount: board.slots.length,
      renderSlotCount: renderSlots.length,
      estimatedSpendUsd: board.estimated_spend_usd,
      actualSpendUsd: board.actual_spend_usd,
      renderedAt: new Date().toISOString(),
    };
    const updatedRun = await attachMediaPipelineOutput({
      runId,
      stepKeys: ["assembly", "mastering", "creative-review"],
      output: renderedOutput,
      outputAssetId: asset.id,
    });
    return Response.json({ url: asset.url, assetId: asset.id, run: updatedRun });
  } catch (error) {
    const message = isMissingFfmpegError(error)
      ? "Chaplin's video editor is not available in this deployment."
      : error instanceof Error ? error.message : "Could not assemble the ad board.";
    return Response.json(
      { error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 500) },
    );
  } finally {
    if (workDirectory) await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
