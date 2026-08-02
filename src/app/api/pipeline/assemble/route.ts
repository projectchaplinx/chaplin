import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DELIVERY_LOUDNESS_FILTER, DUCK_UNDER_SPEECH } from "@/lib/audio-mix";
import { promisify } from "node:util";
import { attachMediaPipelineOutput, getMediaPipelineRun } from "@/lib/server/media-pipeline";
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

async function download(url: string, destination: string) {
  const parsed = new URL(url);
  const storageHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : "";
  if (parsed.protocol !== "https:" || parsed.hostname !== storageHost) {
    throw new Error("Shot media must come from Chaplin's configured storage.");
  }
  const response = await fetch(parsed);
  if (!response.ok) throw new Error(`Download shot media: ${response.status}.`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

function urlSlots(value: unknown, maximum = 20) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maximum).map((item) => typeof item === "string" ? item.trim() : "");
}


/**
 * Whether a rendered shot carries an audio stream of its own.
 *
 * Seedance generates the location's sound into the clip, but a shot rendered as
 * a silent plate has no audio stream at all - and naming a stream that does not
 * exist fails the whole assembly. Probed per clip so the two can be mixed in
 * the same master.
 */
async function hasAudioStream(sourcePath: string, ffmpeg: string) {
  try {
    await execute(ffmpeg, ["-hide_banner", "-i", sourcePath], { maxBuffer: 1024 * 1024, windowsHide: true });
    return false;
  } catch (error) {
    if (isMissingFfmpegError(error)) throw error;
    // ffmpeg exits non-zero for a probe-only call and prints the streams to stderr.
    const output = String((error as { stderr?: string }).stderr ?? "");
    return /Stream #\d+:\d+.*: Audio:/.test(output);
  }
}

export async function POST(request: Request) {
  let workDirectory = "";
  try {
    assertRequestBodySize(request, 256 * 1024);
    const identity = await requireRequestIdentity(request);
    const input = await request.json() as Record<string, unknown>;
    const runId = typeof input.runId === "string" ? input.runId : "";
    const characterId = typeof input.characterId === "string" ? input.characterId : "";
    const shotUrls = Array.isArray(input.shotUrls)
      ? input.shotUrls.filter((value): value is string => typeof value === "string" && Boolean(value))
      : [];
    const frameUrls = Array.isArray(input.frameUrls)
      ? input.frameUrls.filter((value): value is string => typeof value === "string" && Boolean(value))
      : [];
    const requestedDialogueUrls = urlSlots(input.dialogueUrls);
    const requestedSfxUrls = urlSlots(input.sfxUrls);
    const requestedDialogueUrl = typeof input.dialogueUrl === "string" ? input.dialogueUrl : "";
    const requestedSfxUrl = typeof input.sfxUrl === "string" ? input.sfxUrl : "";
    const requestedThemeUrl = typeof input.themeUrl === "string" ? input.themeUrl : "";
    const sceneDurationSeconds = Math.min(5, Math.max(1, Number(input.sceneDurationSeconds) || 4));
    const requestedSceneDurations = Array.isArray(input.sceneDurationsSeconds)
      ? input.sceneDurationsSeconds.slice(0, shotUrls.length).map((value) => Math.min(12, Math.max(1, Number(value) || sceneDurationSeconds)))
      : [];
    const sceneDurationsSeconds = requestedSceneDurations.length === shotUrls.length
      ? requestedSceneDurations
      : shotUrls.map(() => sceneDurationSeconds);
    const sceneOffsetsSeconds = sceneDurationsSeconds.map((_, index) => (
      sceneDurationsSeconds.slice(0, index).reduce((sum, value) => sum + value, 0)
    ));
    const solvedDurationSeconds = sceneDurationsSeconds.reduce((sum, value) => sum + value, 0);
    const finalDurationSeconds = Math.min(120, Math.max(1, Number(input.finalDurationSeconds) || solvedDurationSeconds));
    if (!runId || !characterId || shotUrls.length < 1 || shotUrls.length > 20) {
      throw new Error("A pipeline run, actor, and between one and twenty scene URLs are required.");
    }
    await Promise.all([
      requireOwnedPipelineRun(identity, runId),
      requireOwnedCharacter(identity, characterId),
    ]);
    if (identity.role !== "admin") {
      await enforceRateLimit({
        request,
        bucket: "pipeline-assembly",
        limit: 12,
        windowSeconds: 24 * 60 * 60,
        identityId: identity.id,
      });
    }
    const run = await getMediaPipelineRun(runId);
    if (!run) throw new Error("Pipeline run was not found.");
    if (run.outputType !== "punch") throw new Error("This assembler currently expects a Punch production.");

    workDirectory = await mkdtemp(path.join(tmpdir(), "chaplin-punch-"));
    const shotPaths = shotUrls.map((_, index) => path.join(workDirectory, `scene-${index + 1}.mp4`));
    const outputPath = path.join(workDirectory, "punch-master.mp4");
    await Promise.all(shotUrls.map((url, index) => download(url, shotPaths[index])));

    /*
      The master used to be assembled with concat a=0 and only [vout] mapped, so
      every audio stream was discarded and the delivered file was silent — the
      actor's locked voice and their theme never reached the cut.

      Audio is now built over a generated silent bed rather than taken from the
      clips, so assembly succeeds whether or not a shot carries sound: the bed
      guarantees a stream of exactly the right length, and the performance stems
      are mixed on top of it. Dialogue sits at full level; the theme sits well
      under it and loops to cover the whole cut.
    */
    /*
      Stems are resolved here rather than demanded from the caller: the spoken
      line is already attached to the run's dialogue step, and the theme belongs
      to the actor. Existing callers therefore gain sound without any change,
      and an explicit URL in the request still wins.
    */
    const runDialogueUrl = run.steps.find((step) => step.key === "dialogue")?.output.url;
    const production = await getCharacterProductionState(characterId).catch(() => null);
    const dialogueUrl = requestedDialogueUrl
      || (typeof runDialogueUrl === "string" ? runDialogueUrl : "")
      || production?.latestDialogueUrl
      || "";
    const sfxUrl = requestedSfxUrl || production?.latestSfxUrl || "";
    const themeUrl = requestedThemeUrl || production?.latestThemeUrl || "";

    const dialogueSources = requestedDialogueUrls.some(Boolean)
      ? requestedDialogueUrls
      : dialogueUrl
        ? [dialogueUrl]
        : [];
    const sfxSources = requestedSfxUrls.some(Boolean)
      ? requestedSfxUrls
      : sfxUrl
        ? [sfxUrl]
        : [];
    const dialogueFiles = dialogueSources.map((url, sceneIndex) => ({
      url,
      sceneIndex,
      path: url ? path.join(workDirectory, `dialogue-${sceneIndex + 1}.mp3`) : "",
    })).filter((source) => source.url);
    const sfxFiles = sfxSources.map((url, sceneIndex) => ({
      url,
      sceneIndex,
      path: url ? path.join(workDirectory, `sfx-${sceneIndex + 1}.mp3`) : "",
    })).filter((source) => source.url);
    const themePath = themeUrl ? path.join(workDirectory, "theme.mp3") : "";
    await Promise.all([
      ...dialogueFiles.map((source) => download(source.url, source.path)),
      ...sfxFiles.map((source) => download(source.url, source.path)),
      themePath ? download(themeUrl, themePath) : Promise.resolve(),
    ]);

    const stemInputs: string[] = [];
    const stemLabels: string[] = [];
    /*
      The shots' own sound is part of the cut.

      Audio was assembled over a generated silent bed and the clips were
      concatenated with a=0, so every scene's location sound - the rain, the
      room tone, the machinery Seedance rendered into the shot - was discarded
      at assembly and the delivered Punch had no ambience under it at all. Each
      clip's track now sits in the mix at its own scene offset, under the
      dialogue, and a silent plate simply contributes nothing.
    */
    const ffmpegPath = ffmpegExecutable();
    const shotHasAudio = await Promise.all(shotPaths.map((shotPath) => hasAudioStream(shotPath, ffmpegPath)));
    let inputIndex = shotPaths.length;
    // The silent bed is always input N, immediately after the shots.
    const bedIndex = inputIndex;
    inputIndex += 1;
    const audioFilters = [`[${bedIndex}:a]atrim=0:${finalDurationSeconds},asetpts=PTS-STARTPTS[abed]`];
    stemLabels.push("[abed]");

    shotPaths.forEach((_, index) => {
      if (!shotHasAudio[index]) return;
      const label = `aloc${index}`;
      const delay = Math.round(sceneOffsetsSeconds[index] * 1000);
      // Under the locked voice: this is the room, not the performance.
      audioFilters.push(`[${index}:a]volume=0.55,atrim=0:${sceneDurationsSeconds[index]},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},apad,atrim=0:${finalDurationSeconds},asetpts=PTS-STARTPTS[${label}]`);
      stemLabels.push(`[${label}]`);
    });

    for (const source of dialogueFiles) {
      const label = `adlg${source.sceneIndex}`;
      const delay = Math.round(sceneOffsetsSeconds[source.sceneIndex] * 1000);
      stemInputs.push("-i", source.path);
      audioFilters.push(`[${inputIndex}:a]volume=1.0,adelay=${delay}|${delay},apad,atrim=0:${finalDurationSeconds},asetpts=PTS-STARTPTS[${label}]`);
      stemLabels.push(`[${label}]`);
      inputIndex += 1;
    }
    for (const source of sfxFiles) {
      const label = `asfx${source.sceneIndex}`;
      const delay = Math.round(sceneOffsetsSeconds[source.sceneIndex] * 1000 + 180);
      stemInputs.push("-i", source.path);
      audioFilters.push(`[${inputIndex}:a]volume=0.7,adelay=${delay}|${delay},apad,atrim=0:${finalDurationSeconds},asetpts=PTS-STARTPTS[${label}]`);
      stemLabels.push(`[${label}]`);
      inputIndex += 1;
    }
    /*
      A silent plate contributes nothing to the mix, so a scene whose clip came
      back without an audio stream played as dead air between ambient scenes.
      Silent scenes now get a synthesized room-tone bed: band-limited pink
      noise at a level that reads as "the room is on", generated inside FFmpeg
      so it costs nothing, needs no network, and renders identically every
      time. A location-specific generated ambience can replace it later.
    */
    const silentScenes = shotPaths.map((_, index) => index).filter((index) => !shotHasAudio[index]);
    if (silentScenes.length) {
      const noiseIndex = inputIndex;
      stemInputs.push("-f", "lavfi", "-t", String(finalDurationSeconds), "-i", "anoisesrc=r=48000:c=pink:a=0.02");
      inputIndex += 1;
      const splitLabels = silentScenes.map((sceneIndex) => `[rtsrc${sceneIndex}]`).join("");
      audioFilters.push(`[${noiseIndex}:a]highpass=f=90,lowpass=f=900,volume=0.5,asplit=${silentScenes.length}${splitLabels}`);
      for (const sceneIndex of silentScenes) {
        const label = `artn${sceneIndex}`;
        const delay = Math.round(sceneOffsetsSeconds[sceneIndex] * 1000);
        audioFilters.push(`[rtsrc${sceneIndex}]atrim=0:${sceneDurationsSeconds[sceneIndex]},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},apad,atrim=0:${finalDurationSeconds},asetpts=PTS-STARTPTS[${label}]`);
        stemLabels.push(`[${label}]`);
      }
    }
    if (themePath) {
      stemInputs.push("-i", themePath);
      /*
        The theme is a bed, not a duet. Held at a flat level it competed with
        the actor's locked line, so it now drops 12dB for the length of every
        scene that actually speaks. Ducking is driven by the known speech
        windows rather than a sidechain compressor: the windows are exact, so
        the result is identical on every render instead of varying with the
        line's own level.
      */
      const speechWindows = dialogueFiles.map((source) => {
        const start = sceneOffsetsSeconds[source.sceneIndex];
        return { start, end: start + sceneDurationsSeconds[source.sceneIndex] };
      });
      const duckedGain = (0.18 * DUCK_UNDER_SPEECH).toFixed(4);
      const themeVolume = speechWindows.length
        ? `volume='if(gt(${speechWindows.map((window) => `between(t,${window.start},${window.end})`).join("+")},0),${duckedGain},0.18)':eval=frame`
        : "volume=0.18";
      audioFilters.push(`[${inputIndex}:a]${themeVolume},aloop=loop=-1:size=2e9,atrim=0:${finalDurationSeconds},asetpts=PTS-STARTPTS[athm]`);
      stemLabels.push("[athm]");
      inputIndex += 1;
    }
    // Normalised to the streaming reference so one Punch is not audibly louder
    // than the next; the limiter still catches anything the normaliser leaves.
    audioFilters.push(`${stemLabels.join("")}amix=inputs=${stemLabels.length}:duration=first:dropout_transition=0,${DELIVERY_LOUDNESS_FILTER},alimiter=limit=0.95[aout]`);

    await execute(ffmpegPath, [
      "-y",
      ...shotPaths.flatMap((shotPath) => ["-i", shotPath]),
      "-f", "lavfi", "-t", String(finalDurationSeconds), "-i", "anullsrc=r=48000:cl=stereo",
      ...stemInputs,
      "-filter_complex",
      [
        ...shotPaths.map((_, index) => (
          `[${index}:v]trim=duration=${sceneDurationsSeconds[index]},scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,fps=24,setsar=1,setpts=PTS-STARTPTS[v${index}]`
        )),
        `${shotPaths.map((_, index) => `[v${index}]`).join("")}concat=n=${shotPaths.length}:v=1:a=0[vout]`,
        ...audioFilters,
      ].join(";"),
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-t", String(finalDurationSeconds),
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
      durationSeconds: finalDurationSeconds,
      metadata: {
        pipelineRunId: run.id,
        outputType: "punch",
        sourceUrls: shotUrls,
        sourceFrameUrls: frameUrls,
        sceneDurationSeconds,
        sceneDurationsSeconds,
        finalDurationSeconds,
        audioManifest: {
          lockedVoice: dialogueFiles.map((source) => ({ sceneIndex: source.sceneIndex, url: source.url })),
          sceneEffects: sfxFiles.map((source) => ({ sceneIndex: source.sceneIndex, url: source.url })),
          themeUrl: themeUrl || null,
          syntheticRoomToneScenes: silentScenes,
        },
      },
    });
    const renderedOutput = {
      url: asset.url,
      durationSeconds: finalDurationSeconds,
      shotUrls,
      frameUrls,
      sceneDurationSeconds,
      sceneDurationsSeconds,
      audioManifest: {
        lockedVoiceCount: dialogueFiles.length,
        sceneEffectCount: sfxFiles.length,
        hasTheme: Boolean(themeUrl),
        syntheticRoomToneSceneCount: silentScenes.length,
        mix: "locked voice + scene effects + character theme",
      },
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
      ? "Chaplin's video editor is not available in this deployment. The bundled FFmpeg binary was not packaged."
      : error instanceof Error ? error.message : "Could not assemble the Punch output.";
    return Response.json(
      { error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 500) },
    );
  } finally {
    if (workDirectory) await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
