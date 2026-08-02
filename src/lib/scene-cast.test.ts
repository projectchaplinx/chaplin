import assert from "node:assert/strict";
import test from "node:test";
import {
  absentCastNegative,
  resolveSceneActors,
  sceneActorIdentity,
  sceneActorNames,
} from "@/lib/scene-cast";
import { AGNI_MAYA_CARD_V2 } from "@/lib/character-card-fixtures";
import type { Character, Scene } from "@/lib/types";

const actor = (id: string, name: string, personality: string): Character => ({
  id,
  makerId: "u-creator",
  name,
  archetype: "rebel",
  tagline: `${name} tagline`,
  personality,
  voiceGender: "androgynous",
  voiceDesc: "",
  sfxDesc: `${name} signature sound`,
  themeDesc: "",
  avatarHue: 200,
  licenseType: "open",
  royaltyRate: 0,
  createdAt: new Date(0).toISOString(),
  stats: { castings: 0, fans: 0, earnings: 0, socialImpressions: 0, socialViews: 0, socialLikes: 0 },
}) as unknown as Character;

const ash = actor("c-ash", "Ash Reaper", "A debt collector who burns betrayers.");
const sprocket = actor("c-sprocket", "Sprocket", "A salvage android with a borrowed conscience.");
const cast = [ash, sprocket];

const scene = (lines: Array<{ characterId: string; text: string }>) =>
  ({ lines }) as Pick<Scene, "lines">;

test("a scene belongs to the actors who speak in it, not the whole cast", () => {
  const resolved = resolveSceneActors(scene([{ characterId: "c-sprocket", text: "I remember this place." }]), cast);
  assert.deepEqual(resolved.present.map((character) => character.name), ["Sprocket"]);
  assert.equal(resolved.lead.name, "Sprocket");
  // The bug: every scene was rendered against "Ash Reaper and Sprocket".
  assert.equal(sceneActorNames(resolved.present), "Sprocket");
});

test("a silent scene falls back to the lead alone, never the entire cast", () => {
  const resolved = resolveSceneActors(scene([]), cast);
  assert.deepEqual(resolved.present.map((character) => character.name), ["Ash Reaper"]);
  assert.equal(sceneActorNames(resolved.present), "Ash Reaper");
});

test("blank lines do not put an actor in a scene", () => {
  const resolved = resolveSceneActors(scene([{ characterId: "c-sprocket", text: "   " }]), cast);
  assert.deepEqual(resolved.present.map((character) => character.name), ["Ash Reaper"]);
});

test("identity covers only the actors in the shot", () => {
  const identity = sceneActorIdentity([sprocket]);
  assert.match(identity, /Sprocket/);
  assert.doesNotMatch(identity, /Ash Reaper/);
  assert.doesNotMatch(identity, /burns betrayers/);
});

test("card face anchors render as readable geometry, never [object Object]", () => {
  const carded = { ...actor("c-agni", "Agni Maya", "carded lead"), cardV2: AGNI_MAYA_CARD_V2 } as unknown as Character;
  const identity = sceneActorIdentity([carded]);
  assert.doesNotMatch(identity, /\[object Object\]/);
  // The bug: face_anchors are objects, and join() stringified them into garbage.
  assert.match(identity, /fine eyebrow scar at right brow interrupting hair growth, short, always visible/);
});

test("absent cast and their equipment are explicitly excluded", () => {
  const negative = absentCastNegative([sprocket], cast);
  assert.match(negative, /Do not depict Ash Reaper/);
});

test("a shot with the whole cast present excludes nobody", () => {
  assert.equal(absentCastNegative(cast, cast), "");
});
