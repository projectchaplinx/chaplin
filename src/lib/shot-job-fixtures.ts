import { DEFAULT_AUDIO_PLAN } from "@/lib/audio-plan";
import { buildShotJob } from "@/lib/shot-job";

const rhea = "war-rhea-sheet";
const kade = "war-kade-sheet";

export function warDropShotJob(modelVersion = "dreamina-seedance-2-0-260128") {
  return buildShotJob({
    model_version: modelVersion,
    total_duration_ms: 15_000,
    aspect_ratio: "16:9",
    references: [
      { id: rhea, kind: "character", asset_id: "asset-rhea-current-sheet", label: "@image1" },
      { id: kade, kind: "character", asset_id: "asset-kade-current-sheet", label: "@image2" },
      { id: "war-rhea-audition", kind: "motion", asset_id: "asset-rhea-selected-audition", label: "@video1" },
      { id: "war-kade-audition", kind: "motion", asset_id: "asset-kade-selected-audition", label: "@video2" },
    ],
    shots: [
      {
        id: "war-drop-1",
        index: 0,
        duration_ms: 3_500,
        framing: "medium-wide profile from inside the helicopter",
        camera_move: "dolly out",
        beats: [
          { at_ms: 0, action: "Rhea grips the descent rope facing screen right" },
          { at_ms: 1_700, action: "Kade secures his helmet behind her facing screen right" },
        ],
        subject_refs: [rhea, kade],
        start_frame_asset: "asset-war-drop-opening",
        seam_to_next: "action_bridge",
        audio: structuredClone(DEFAULT_AUDIO_PLAN),
      },
      {
        id: "war-drop-2",
        index: 1,
        duration_ms: 4_000,
        framing: "wide side profile above the island",
        camera_move: "crane down",
        beats: [
          { at_ms: 0, action: "Rhea descends screen right along the taut rope" },
          { at_ms: 2_000, action: "Kade follows downward on the same screen-right line" },
        ],
        subject_refs: [rhea, kade],
        seam_to_next: "hard_cut",
        audio: structuredClone(DEFAULT_AUDIO_PLAN),
      },
      {
        id: "war-drop-3",
        index: 2,
        duration_ms: 4_000,
        framing: "ground-level medium-wide from the safe side of the action line",
        camera_move: "micro-lateral",
        beats: [
          { at_ms: 0, action: "Rhea sprints screen right toward concrete cover" },
          { at_ms: 1_700, action: "Kade crosses behind her in the same direction" },
          { at_ms: 3_000, action: "Faceless extras drop below the unreadable horizon" },
        ],
        subject_refs: [rhea, kade],
        seam_to_next: "match_cut",
        audio: structuredClone(DEFAULT_AUDIO_PLAN),
      },
      {
        id: "war-drop-4",
        index: 3,
        duration_ms: 3_500,
        framing: "locked medium profile inside the trench",
        camera_move: "locked",
        beats: [
          { at_ms: 0, action: "Rhea freezes frame left facing screen right" },
          { at_ms: 1_800, action: "Kade lowers his rifle behind her facing screen right" },
        ],
        subject_refs: [rhea, kade],
        seam_to_next: "hard_cut",
        audio: structuredClone(DEFAULT_AUDIO_PLAN),
      },
    ],
  });
}
