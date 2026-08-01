import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getMediaPipelineRun } from "@/lib/server/media-pipeline";
import { getCharacterProductionState, saveMediaAsset } from "@/lib/server/supabase-admin";
import { ffmpegExecutable, isMissingFfmpegError } from "@/lib/server/ffmpeg-runtime";
import {
  requireOwnedCharacter,
  requireOwnedPipelineRun,
  requireRequestIdentity,
} from "@/lib/server/auth";
import {
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";
export const maxDuration = 120;

const execute = promisify(execFile);

function stepUrl(run: NonNullable<Awaited<ReturnType<typeof getMediaPipelineRun>>>, key: string) {
  const value = run.steps.find((step) => step.key === key)?.output.url;
  if (typeof value !== "string" || !value) throw new Error(`${key} has no generated media URL.`);
  return value;
}

async function download(url: string, destination: string) {
  const parsed = new URL(url);
  const storageHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : "";
  if (parsed.protocol !== "https:" || parsed.hostname !== storageHost) {
    throw new Error("Pipeline media must come from Chaplin’s configured Supabase storage.");
  }
  const response = await fetch(parsed);
  if (!response.ok) throw new Error(`Download pipeline media: ${response.status}.`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

export async function POST(request: Request) {
  let workDirectory = "";
  try {
    assertRequestBodySize(request, 64 * 1024);
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
        bucket: "pipeline-mix",
        limit: 30,
        windowSeconds: 24 * 60 * 60,
        identityId: identity.id,
      });
    }
    const run = await getMediaPipelineRun(runId);
    if (!run) throw new Error("Pipeline run was not found.");

    workDirectory = await mkdtemp(path.join(tmpdir(), "chaplin-mix-"));
    const videoPath = path.join(workDirectory, "motion.mp4");
    const dialoguePath = path.join(workDirectory, "dialogue.mp3");
    const sfxPath = path.join(workDirectory, "sfx.mp3");
    const roomTonePath = path.join(workDirectory, "room-tone.mp3");
    const outputPath = path.join(workDirectory, "master.mp4");

    // The character theme was missing from the shot mix entirely, so a shot
    // carried voice, effects and room tone but never its own score. It is
    // optional: an actor without a locked theme still mixes.
    const production = await getCharacterProductionState(characterId).catch(() => null);
    const themeUrl = production?.latestThemeUrl ?? "";
    const themePath = themeUrl ? path.join(workDirectory, "theme.mp3") : "";
    const dialogueValue = run.steps.find((step) => step.key === "dialogue")?.output.url;
    const dialogueUrl = typeof dialogueValue === "string" ? dialogueValue : "";
    const hasDialogue = Boolean(dialogueUrl);
    const dialogueStep = run.steps.find((step) => step.key === "dialogue");
    const dialogueRequired = dialogueStep && dialogueStep.status !== "skipped";
    if (dialogueRequired && !hasDialogue) {
      throw new Error(
        "VOICE_STAGE_FAILED: the exact locked voice is missing. A visual-only plate may exist, but it cannot be mixed, completed, or promoted.",
      );
    }

    await Promise.all([
      download(stepUrl(run, "motion-plate"), videoPath),
      hasDialogue ? download(dialogueUrl, dialoguePath) : Promise.resolve(),
      download(stepUrl(run, "sfx"), sfxPath),
      download(stepUrl(run, "room-tone"), roomTonePath),
      themePath ? download(themeUrl, themePath) : Promise.resolve(),
    ]);

    const audioInputs: Array<{ path: string; filter: (index: number, label: string) => string }> = [];
    if (hasDialogue) audioInputs.push({ path: dialoguePath, filter: (index, label) => `[${index}:a]volume=1.0${label}` });
    audioInputs.push(
      { path: sfxPath, filter: (index, label) => `[${index}:a]volume=0.72,adelay=350|350${label}` },
      { path: roomTonePath, filter: (index, label) => `[${index}:a]volume=0.22${label}` },
    );
    if (themePath) {
      // Well under the voice, looped so a short cue still covers the shot.
      audioInputs.push({ path: themePath, filter: (index, label) => `[${index}:a]volume=0.16,aloop=loop=-1:size=2e9${label}` });
    }
    const mixLabels = audioInputs.map((_, index) => `[a${index + 1}]`);
    const mixFilters = audioInputs.map((input, index) => input.filter(index + 1, mixLabels[index]));
    mixFilters.push(
      `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0,atrim=0:5,alimiter=limit=0.95[aout]`,
    );

    await execute(ffmpegExecutable(), [
      "-y",
      "-i", videoPath,
      ...audioInputs.flatMap((input) => ["-i", input.path]),
      "-filter_complex",
      mixFilters.join(";"),
      "-map", "0:v:0",
      "-map", "[aout]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-t", "5",
      "-movflags", "+faststart",
      outputPath,
    ], { maxBuffer: 10 * 1024 * 1024, windowsHide: true });

    const output = await readFile(outputPath);
    const bytes = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
    const asset = await saveMediaAsset({
      characterId,
      kind: "video",
      provider: "ffmpeg",
      bytes,
      contentType: "video/mp4",
      durationSeconds: 5,
      metadata: {
        pipelineRunId: run.id,
        sourceSteps: ["motion-plate", ...(hasDialogue ? ["dialogue"] : []), "sfx", "room-tone", ...(themePath ? ["character-theme"] : [])],
        audioManifest: {
          lockedVoice: hasDialogue ? dialogueUrl : null,
          sceneEffects: stepUrl(run, "sfx"),
          roomTone: stepUrl(run, "room-tone"),
          themeUrl: themeUrl || null,
        },
      },
    });
    return Response.json({ url: asset.url, assetId: asset.id });
  } catch (error) {
    const message = isMissingFfmpegError(error)
      ? "Chaplin's sound-and-video editor is not available in this deployment. The bundled FFmpeg binary was not packaged."
      : error instanceof Error ? error.message : "Could not mix the shot.";
    return Response.json(
      { error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 500) },
    );
  } finally {
    if (workDirectory) await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
