import type { Character } from "@/lib/types";
import { composeCharacterInteractionPrompt, composeCharacterSheetPrompt } from "@/lib/character-system";
import {
  buildProductionBible,
  buildScenePackage,
  composeIdentityImagePrompt,
  composeSfxPrompt,
  composeThemePrompt,
  composeVideoPrompt,
  composeVoiceDesignPrompt,
} from "@/lib/production-prompting";
import { lintPromptHandoff, type PromptLintResult } from "@/lib/prompt-lint";
import type { PipelineStageId } from "@/lib/pipeline-config";
import { finalizeVideoPrompt, withStandingInjections } from "@/lib/prompt-standards";
import { budgetVideoPrompt } from "@/lib/video-prompt-budget";

export type HandoffPromptCard = {
  id: string;
  step: string;
  title: string;
  destination: string;
  note: string;
  prompt: string;
  consumer: "runtime" | "sheet" | "voice" | "dialogue" | "sfx" | "theme" | "image" | "video";
  stage?: PipelineStageId;
  medium?: string;
  framing?: string;
  expression?: string;
};

function recognitionVisibility(text: string) {
  const lower = text.toLowerCase();
  if (/\b(grin|smile|teeth|canine)\b/.test(lower)) {
    return { text, visibility: "expression" as const, when: "grin" };
  }
  if (/\b(hip|belt|feet|shoe|full.body|head.to.toe)\b/.test(lower)) {
    return { text, visibility: "framing" as const, when: "full" };
  }
  return { text, visibility: "always" as const };
}

export function buildPromptHandoff(
  character: Character,
  options: { presentationConfirmed?: boolean; canonicalMedium?: string } = {},
) {
  const bible = buildProductionBible(character);
  const scene = buildScenePackage({ ...character, brollLine: undefined }, 0);
  const cards: HandoffPromptCard[] = [
    {
      id: "master",
      step: "00 · Runtime identity",
      title: "Master character prompt",
      destination: "Character conversation agent",
      note: "First-person runtime identity, behavior, safety boundaries, memory contract, and voice continuity.",
      prompt: composeCharacterInteractionPrompt(character, bible),
      consumer: "runtime",
    },
    {
      id: "sheet",
      step: "01 · Identity reference",
      title: "Character sheet frame",
      destination: "Image provider",
      note: "Canonical front reference. Only locks visible in this framing are emitted.",
      prompt: withStandingInjections(composeCharacterSheetPrompt(character, bible, { viewId: "front", ageStateId: "canonical" }), true),
      consumer: "sheet",
      stage: "image",
      medium: bible.visual.medium,
      framing: "front full body",
      expression: bible.performance.restingExpression,
    },
    {
      id: "voice",
      step: "02 · Voice identity",
      title: "Voice design",
      destination: "ElevenLabs Voice Design",
      note: "Voice-only direction, rendered exactly once.",
      prompt: composeVoiceDesignPrompt(character),
      consumer: "voice",
      stage: "voice",
    },
    {
      id: "dialogue",
      step: "03 · Spoken performance",
      title: "Dialogue line",
      destination: "ElevenLabs TTS",
      note: "Exact spoken words only.",
      prompt: scene.dialogue,
      consumer: "dialogue",
      stage: "voice",
    },
    {
      id: "sfx",
      step: "04 · Sound stem",
      title: "Signature SFX",
      destination: "ElevenLabs Sound",
      note: "One atomic physical event, with no story or multi-event sequence.",
      prompt: composeSfxPrompt(character, scene.blueprint.soundTexture),
      consumer: "sfx",
      stage: "sfx",
    },
    {
      id: "theme",
      step: "05 · Music stem",
      title: "Theme ident",
      destination: "ElevenLabs Music",
      note: "Instrumental identity cue with a closed arrangement and avoid list.",
      prompt: composeThemePrompt(character, undefined),
      consumer: "theme",
      stage: "theme",
    },
    {
      id: "identity-still",
      step: "06 · Canonical visual",
      title: "Identity still",
      destination: "Image provider",
      note: "Definitive visual source with coherent medium and visible locks.",
      prompt: withStandingInjections(composeIdentityImagePrompt(character), true),
      consumer: "image",
      stage: "image",
      medium: bible.visual.medium,
      framing: "chest to knee",
      expression: "neutral",
    },
    {
      id: "scene-still",
      step: "07 · Directed first frame",
      title: "Scene still",
      destination: "Image provider",
      note: "Playable moment and composition; identity remains separate.",
      prompt: withStandingInjections(scene.image, true),
      consumer: "image",
      stage: "image",
      medium: bible.visual.medium,
      framing: scene.blueprint.framing,
      expression: scene.blueprint.facialBeat,
    },
    {
      id: "motion",
      step: "08 · Silent motion plate",
      title: "Image-to-video direction",
      destination: "Seedance",
      note: "Motion and one camera move only; no scene redesign.",
      prompt: budgetVideoPrompt(
        finalizeVideoPrompt(composeVideoPrompt(character, scene.blueprint), true),
        "image_to_video",
        true,
      ).prompt,
      consumer: "video",
      stage: "video",
    },
  ];
  const recognitionLocks = (bible.visual.recognitionLocks ?? bible.visual.continuityRules)
    .slice(0, 4)
    .map(recognitionVisibility);
  const lint: PromptLintResult = lintPromptHandoff({
    artifacts: cards.map(({ id, consumer, prompt, medium, framing, expression }) => ({
      id, consumer, prompt, medium, framing, expression,
    })),
    canonicalMedium: options.canonicalMedium ?? bible.visual.medium,
    recognitionLocks,
    wardrobe: bible.visual.wardrobe,
    canonPresentation: /\bwoman|female|feminine\b/i.test(bible.visual.perceivedAge)
      ? "feminine"
      : /\bman|male|masculine\b/i.test(bible.visual.perceivedAge) ? "masculine" : undefined,
    voicePresentation: character.voiceGender,
    presentationConfirmed: Boolean(options.presentationConfirmed),
  });
  return { bible, scene, cards, lint };
}
