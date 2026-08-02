import { readCharacterCardV2, selectedWardrobeState } from "@/lib/character-card";
import type { Character, Scene } from "@/lib/types";

/**
 * Which actors a scene is actually about, and how to describe only them.
 *
 * Every scene used to be rendered against the whole cast: one string joining
 * every name with "and", another concatenating every personality, and the first
 * actor's signature sound regardless of who was on screen. So a scene belonging
 * to one actor was generated holding another's weapon, wearing their silhouette,
 * and carrying their sound - the identities bled into each other because the
 * prompt never separated them.
 *
 * The character card is the style sheet that prevents this: it already carries
 * per-actor identity locks, wardrobe with props, and a negative prompt. The job
 * here is to read one actor's sheet at a time.
 */

export type SceneActors = {
  /** Actors with a line in this scene, or the lead when the scene is silent. */
  present: Character[];
  /** The actor the shot is built around. */
  lead: Character;
};

/**
 * Resolves a scene's actors from its own dialogue rather than the cast list.
 *
 * A scene with no lines is not evidence that the whole cast is in it, so it
 * falls back to the production lead alone - one actor, not everyone.
 */
export function resolveSceneActors(
  scene: Pick<Scene, "lines">,
  cast: Character[],
): SceneActors {
  const speakingIds = new Set(
    scene.lines.filter((line) => line.text.trim()).map((line) => line.characterId),
  );
  const present = cast.filter((character) => speakingIds.has(character.id));
  if (present.length) return { present, lead: present[0] };
  return { present: cast.slice(0, 1), lead: cast[0] };
}

/** One actor's visual style sheet, drawn from their card when they have one. */
export function actorStyleSheet(character: Character) {
  const card = readCharacterCardV2(character.cardV2);
  if (!card) {
    return {
      identity: `${character.name}: ${character.personality}`,
      props: [] as string[],
      negative: "",
    };
  }
  const wardrobe = selectedWardrobeState(card)?.state;
  return {
    identity: [
      `${character.name}: ${card.identity_locks.identity_block}`,
      card.identity_locks.face_anchors.length
        ? `Face anchors: ${card.identity_locks.face_anchors.map((anchor) => `${anchor.feature} at ${anchor.location}, ${anchor.size}${anchor.always_visible ? ", always visible" : ""}`).join("; ")}.`
        : "",
      wardrobe ? `Wardrobe: ${wardrobe.wardrobe}. Hair: ${wardrobe.hair}. Silhouette: ${wardrobe.silhouette}.` : "",
    ].filter(Boolean).join(" "),
    props: wardrobe?.props ?? [],
    negative: card.identity_locks.negative_prompt ?? "",
  };
}

/**
 * The identity block for a shot, covering only the actors in it.
 *
 * Props are attributed to their owner by name. Listing them loose let a weapon
 * belonging to one actor be drawn in another's hand.
 */
export function sceneActorIdentity(actors: Character[]) {
  return actors
    .map((character) => {
      const sheet = actorStyleSheet(character);
      const props = sheet.props.length
        ? ` Carries only: ${sheet.props.join(", ")} — these belong to ${character.name} and to no one else in frame.`
        : "";
      return `${sheet.identity}${props}`;
    })
    .join("\n");
}

/** Names of the actors in a shot, for the prompt's subject line. */
export function sceneActorNames(actors: Character[]) {
  return actors.map((character) => character.name).join(" and ");
}

/**
 * What must not appear: every cast member who is not in this shot, plus their
 * props. Without this the model is free to add an actor it saw in an earlier
 * scene's direction.
 */
export function absentCastNegative(actors: Character[], cast: Character[]) {
  const presentIds = new Set(actors.map((character) => character.id));
  const absent = cast.filter((character) => !presentIds.has(character.id));
  if (!absent.length) return "";
  const names = absent.map((character) => character.name);
  const props = absent.flatMap((character) => actorStyleSheet(character).props);
  return `Do not depict ${names.join(", ")} in this shot${props.length ? `, and do not include their equipment: ${props.join(", ")}` : ""}.`;
}
