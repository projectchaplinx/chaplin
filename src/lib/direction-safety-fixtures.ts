import { applyDirectionSafety, type DirectionCharacter } from "@/lib/direction-safety";
import { buildProductionBible } from "@/lib/production-prompting";

function hero(id: string, name: string, archetype: "hero" | "rebel"): DirectionCharacter {
  return {
    id,
    name,
    productionBible: buildProductionBible({
      name,
      archetype,
      tagline: `${name} finishes what they start.`,
      personality: `${name} stays readable under pressure.`,
      voiceGender: "androgynous",
    }),
  };
}

export const WAR_DROP_CHARACTERS = [
  hero("hero-a", "Rhea", "hero"),
  hero("hero-b", "Kade", "rebel"),
];

export function warDropBoard() {
  return applyDirectionSafety({
    characters: WAR_DROP_CHARACTERS,
    targetDurationMs: 15_000,
    board: {
      sceneProps: [
        { name: "rope", reason: "Declared descent rig for the war-drop sequence.", approved: true },
        { name: "rifle", reason: "Declared battlefield dressing; never newly invented.", approved: true },
        { name: "helmet", reason: "Declared protective wardrobe prop.", approved: true },
      ],
      scenes: [
        {
          slotId: "1",
          setting: "EXT. TROOP HELICOPTER - OPEN BAY - DAY",
          objective: "Hook: Rhea sees the impossible landing zone below.",
          action: "Rhea grips the rope while Kade checks the helmet and the anonymous soldiers remain unreadable dressing.",
          energyState: "static" as const,
          lockedCharacterIds: ["hero-a", "hero-b"],
          cameraMovementId: "slow-dolly-out",
          referencedProps: ["rope", "helmet"],
          lines: [{ characterId: "hero-a", text: "Hold." }],
        },
        {
          slotId: "2",
          setting: "EXT. ISLAND SKY - CONTINUOUS",
          objective: "Escalate cost: ground fire closes the safe descent corridor.",
          action: "Rhea continues descending on the rope while distant soldiers remain faceless silhouettes.",
          energyState: "action" as const,
          lockedCharacterIds: ["hero-a"],
          cameraMovementId: "crane-down",
          referencedProps: ["rope", "rifle"],
          lines: [],
        },
        {
          slotId: "3",
          setting: "EXT. BEACHHEAD - CONTINUOUS",
          objective: "Reverse power: the two heroes choose opposite sides of the exposed landing.",
          action: "Rhea sprints for cover as Kade leaps across the breach; three anonymous soldiers fire rifles in unreadable silhouette.",
          energyState: "action" as const,
          lockedCharacterIds: ["hero-a", "hero-b"],
          cameraMovementId: "true-orbit-360",
          referencedProps: ["rifle"],
          lines: [{ characterId: "hero-b", text: "Move now!" }],
        },
        {
          slotId: "4",
          setting: "EXT. BEACHHEAD TRENCH - DUSK",
          objective: "Cliffhanger: a child silhouette raises the same unit signal from beyond the wire.",
          action: "The minor remains a distant backlit silhouette while Rhea freezes and the rifles lower off-frame.",
          energyState: "static" as const,
          lockedCharacterIds: ["hero-a"],
          cameraMovementId: "slow-dolly-out",
          referencedProps: ["rifle"],
          lines: [],
        },
      ],
    },
  });
}
