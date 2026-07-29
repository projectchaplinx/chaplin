"use client";

import { create } from "zustand";
import { SEED_WORLD } from "@/data/seed";
import { buildProductionBible } from "@/lib/production-prompting";
import type { CameraMovementId } from "@/lib/camera-movements";
import type { EnergyState, FramingConstraint, SceneProp } from "@/lib/direction-safety";
import type {
  Character,
  Story,
  Casting,
  LedgerEntry,
  ChaplinWorld,
  AppRole,
  LicenseType,
} from "@/lib/types";

const STORAGE_KEY = "chaplin:v15";

export type NewCharacterInput = Pick<
  Character,
  | "name"
  | "archetype"
  | "archetypeMix"
  | "tagline"
  | "personality"
  | "voiceGender"
  | "voiceDesc"
  | "sfxDesc"
  | "themeDesc"
  | "productionBible"
  | "licenseType"
  | "royaltyRate"
  | "avatarHue"
> & { makerId: string };

export interface NewSceneInput {
  slotId?: string;
  sourceSlotId?: string;
  setting: string;
  objective?: string;
  action?: string;
  energyState?: EnergyState;
  lockedCharacterIds?: string[];
  dressing?: string;
  behaviorTell?: { characterId: string; tell: string } | null;
  durationSeconds?: number;
  durationMs?: number;
  previewImageUrl?: string;
  previewAssetId?: string;
  cameraMovementId?: CameraMovementId;
  motionMode?: "forward" | "chain";
  motionFromSlotId?: string | null;
  framingConstraint?: FramingConstraint;
  sensitiveNegatives?: string[];
  referencedProps?: string[];
  dialogueFramingConstraint?: "off_face" | null;
  lines: Array<{ characterId: string; text: string }>;
}

export interface NewStoryInput {
  title: string;
  logline: string;
  format?: "story" | "ad" | "reel" | "spark" | "punch" | "episode" | "spot";
  durationSeconds?: number;
  punchGenerationMode?: "scene-clips" | "single-take";
  status?: "production" | "published";
  creativeDirection?: string;
  sceneProps?: SceneProp[];
  productImageUrl?: string;
  productImageName?: string;
  authorId: string;
  coverHue: number;
  castCharacterIds: string[];
  scenes: NewSceneInput[];
}

interface ChaplinState extends ChaplinWorld {
  currentUserId: string;
  activeRole: AppRole;
  hydrated: boolean;
  syncAuthenticatedUser: (profile: { id: string; name: string; role: "creator" | "admin"; imageUrl: string }) => void;
  addCharacter: (input: NewCharacterInput) => Character;
  removeCharacter: (characterId: string) => void;
  addStory: (input: NewStoryInput) => Story;
  removeStory: (storyId: string) => void;
  setCharacterVoice: (characterId: string, voiceId: string) => void;
  addCharacterImage: (characterId: string, imageUrl: string) => void;
  setCharacterVideo: (characterId: string, videoUrl: string) => void;
  mergePersistedCharacters: (characters: Character[]) => void;
  hydrateFromStorage: () => void;
}

function persist(state: ChaplinState) {
  if (typeof window === "undefined") return;
  try {
    const snapshot = {
      users: state.users,
      characters: state.characters,
      stories: state.stories,
      castings: state.castings,
      ledger: state.ledger,
      currentUserId: state.currentUserId,
      activeRole: state.activeRole,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    document.cookie = `chaplin-demo-role=${state.activeRole}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // storage full or unavailable, demo still works in-memory
  }
}

function nextId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

export const useChaplinStore = create<ChaplinState>((set, get) => ({
  ...SEED_WORLD,
  currentUserId: "u-creator",
  activeRole: "maker",
  hydrated: false,

  syncAuthenticatedUser: (profile) => {
    // The public product never switches into an admin mode. Admin authority is
    // server-checked inside /admin after entering through /super-admin.
    const activeRole: AppRole = "maker";
    const roleBadges: AppRole[] = profile.role === "admin" ? ["admin"] : ["maker"];
    set((state) => {
      const existing = state.users.find((user) => user.id === profile.id);
      const adminUser = state.users.find((user) => user.id === "u-admin")
        ?? SEED_WORLD.users.find((user) => user.id === "u-admin");
      const authenticatedUser = {
        id: profile.id,
        name: profile.name,
        handle: profile.role === "admin"
          ? "@chaplin"
          : existing?.handle ?? `@${profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "creator"}`,
        roleBadges,
        avatarInitial: profile.name.slice(0, 1).toUpperCase(),
        avatarHue: existing?.avatarHue ?? (profile.role === "admin" ? 165 : 202),
        imageUrl: profile.imageUrl || existing?.imageUrl,
      };
      const users = profile.role === "admin"
        ? [authenticatedUser]
        : [authenticatedUser, ...(adminUser && adminUser.id !== authenticatedUser.id ? [adminUser] : [])];
      return {
        users,
        currentUserId: profile.id,
        activeRole,
      };
    });
    persist(get());
  },

  addCharacter: (input) => {
    const character: Character = {
      id: nextId("c"),
      makerId: input.makerId,
      name: input.name,
      archetype: input.archetype,
      archetypeMix: input.archetypeMix,
      tagline: input.tagline,
      personality: input.personality,
      voiceGender: input.voiceGender,
      voiceDesc: input.voiceDesc,
      sfxDesc: input.sfxDesc,
      themeDesc: input.themeDesc,
      productionBible: input.productionBible ?? buildProductionBible(input),
      avatarHue: input.avatarHue,
      licenseType: input.licenseType as LicenseType,
      royaltyRate: input.licenseType === "open" ? 0 : input.royaltyRate,
      createdAt: nowIso(),
      stats: {
        castings: 0,
        // A new actor has no audience. This seeded 40, so every card in the
        // gallery read "40 fans" beside honest zeroes for impressions, views
        // and likes - a number that was invented rather than counted.
        fans: 0,
        earnings: 0,
        socialImpressions: 0,
        socialViews: 0,
        socialLikes: 0,
      },
    };
    set((s) => ({ characters: [character, ...s.characters] }));
    persist(get());
    return character;
  },

  removeCharacter: (characterId) => {
    set((state) => ({ characters: state.characters.filter((character) => character.id !== characterId) }));
    persist(get());
  },

  addStory: (input) => {
    const state = get();
    const storyId = nextId("s");
    const timestamp = nowIso();

    const scenes = input.scenes.map((sc, si) => ({
      id: `${storyId}-sc${si}`,
      slotId: sc.slotId,
      sourceSlotId: sc.sourceSlotId,
      setting: sc.setting,
      objective: sc.objective,
      action: sc.action,
      energyState: sc.energyState,
      lockedCharacterIds: sc.lockedCharacterIds,
      dressing: sc.dressing,
      behaviorTell: sc.behaviorTell,
      durationSeconds: sc.durationSeconds,
      durationMs: sc.durationMs,
      previewImageUrl: sc.previewImageUrl,
      previewAssetId: sc.previewAssetId,
      cameraMovementId: sc.cameraMovementId,
      motionMode: sc.motionMode,
      motionFromSlotId: sc.motionFromSlotId,
      framingConstraint: sc.framingConstraint,
      sensitiveNegatives: sc.sensitiveNegatives,
      referencedProps: sc.referencedProps,
      dialogueFramingConstraint: sc.dialogueFramingConstraint,
      lines: sc.lines.map((ln, li) => ({
        id: `${storyId}-sc${si}-l${li}`,
        characterId: ln.characterId,
        text: ln.text,
        voiceClipMock: {
          durationSec: 2 + ((ln.text.length + li * 3) % 5),
          waveformSeed: (li * 7 + ln.text.length * 3) % 13,
        },
      })),
    }));

    const story: Story = {
      id: storyId,
      authorId: input.authorId,
      title: input.title,
      logline: input.logline,
      format: input.format,
      durationSeconds: input.durationSeconds,
      punchGenerationMode: input.punchGenerationMode,
      status: input.status ?? "published",
      creativeDirection: input.creativeDirection,
      sceneProps: input.sceneProps,
      productImageUrl: input.productImageUrl,
      productImageName: input.productImageName,
      coverHue: input.coverHue,
      createdAt: timestamp,
      scenes,
      views: 40,
    };

    const newCastings: Casting[] = [];
    const newLedger: LedgerEntry[] = [];

    for (const characterId of input.castCharacterIds) {
      const character = state.characters.find((c) => c.id === characterId);
      if (!character) continue;
      const castingId = nextId("cast");
      const fee = character.licenseType === "open" ? 0 : character.royaltyRate;
      newCastings.push({
        id: castingId,
        characterId,
        storyId,
        casterId: input.authorId,
        timestamp,
        fee,
      });
      if (fee > 0) {
        newLedger.push({
          id: nextId("ledg"),
          castingId,
          characterId,
          storyId,
          makerId: character.makerId,
          amount: fee,
          type: "royalty",
          timestamp,
        });
      }
    }

    set((s) => {
      const updatedCharacters = s.characters.map((c) => {
        const gained = newCastings.filter((cst) => cst.characterId === c.id);
        if (gained.length === 0) return c;
        const earned = newLedger
          .filter((l) => l.characterId === c.id)
          .reduce((sum, l) => sum + l.amount, 0);
        return {
          ...c,
          stats: {
            ...c.stats,
            castings: c.stats.castings + gained.length,
            // Castings are counted; fans are not invented from them. A fan is
            // an audience action and only a real one may move this number.
            earnings: c.stats.earnings + earned,
          },
        };
      });
      return {
        stories: [story, ...s.stories],
        castings: [...newCastings, ...s.castings],
        ledger: [...newLedger, ...s.ledger],
        characters: updatedCharacters,
      };
    });

    persist(get());
    return story;
  },

  removeStory: (storyId) => {
    set((state) => ({
      stories: state.stories.filter((story) => story.id !== storyId),
      castings: state.castings.filter((casting) => casting.storyId !== storyId),
      ledger: state.ledger.filter((entry) => entry.storyId !== storyId),
    }));
    persist(get());
  },


  setCharacterVoice: (characterId, voiceId) => {
    set((s) => ({
      characters: s.characters.map((character) =>
        character.id === characterId ? { ...character, voiceId } : character
      ),
    }));
    persist(get());
  },

  addCharacterImage: (characterId, imageUrl) => {
    set((s) => ({
      characters: s.characters.map((character) =>
        character.id === characterId
          ? {
              ...character,
              imageUrl: character.imageUrl ?? imageUrl,
              galleryUrls: [
                imageUrl,
                ...(character.galleryUrls ?? []).filter((url) => url !== imageUrl),
              ],
            }
          : character
      ),
    }));
    persist(get());
  },

  setCharacterVideo: (characterId, videoUrl) => {
    set((s) => ({
      characters: s.characters.map((character) =>
        character.id === characterId ? { ...character, videoUrl } : character
      ),
    }));
    persist(get());
  },
  mergePersistedCharacters: (persistedCharacters) => {
    set((state) => {
      const localById = new Map(state.characters.map((character) => [character.id, character]));
      const mergedRemote = persistedCharacters.map((remote) => {
        const local = localById.get(remote.id);
        return {
          ...local,
          ...remote,
          // Ownership comes from Supabase. Reassigning every catalogue actor to
          // the current browser user made public actors look editable.
          makerId: remote.makerId,
          galleryUrls: [...new Set([
            ...(remote.galleryUrls ?? []),
            ...(local?.galleryUrls ?? []),
          ])],
        };
      });
      return {
        // Supabase is the catalogue authority. Keeping local-only rows here
        // resurrected actors after Super Admin permanently deleted them.
        characters: mergedRemote,
      };
    });
    persist(get());
  },
  hydrateFromStorage: () => {
    if (typeof window === "undefined" || get().hydrated) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && Array.isArray(saved.characters)) {
          const currentCharacters = get().characters;
          const currentUsers = get().users;
          // Older builds persisted a full cast of demo people. Accounts now
          // contain only the active Creator and Super Admin, so never revive
          // those demo identities from local storage.
          const mergedUsers = currentUsers;
          const savedCharacters = saved.characters as Character[];
          const mergedCharacters = [
            ...currentCharacters.map((current) => ({
              ...current,
              ...(savedCharacters.find((savedCharacter) => savedCharacter.id === current.id) ?? {}),
            })),
            ...savedCharacters.filter(
              (savedCharacter) => !currentCharacters.some((current) => current.id === savedCharacter.id)
            ),
          ];
          const requestedUserId = saved.currentUserId ?? get().currentUserId;
          const requestedUser = mergedUsers.find((user) => user.id === requestedUserId);
          // Do not revive the old front-end Super Admin role from localStorage.
          const activeRole: AppRole = "maker";
          set({
            users: mergedUsers,
            characters: mergedCharacters.map((character) => ({
              ...character,
              galleryUrls: character.galleryUrls
                ? [...new Set(character.galleryUrls)]
                : undefined,
              voiceGender:
                character.voiceGender ??
                currentCharacters.find((current) => current.id === character.id)?.voiceGender ??
                "androgynous",
            })),
            stories: saved.stories ?? get().stories,
            castings: saved.castings ?? get().castings,
            ledger: saved.ledger ?? get().ledger,
            currentUserId: requestedUser?.id ?? get().currentUserId,
            activeRole,
          });
        }
      }
    } catch {
      // corrupt storage, fall back to seed silently
    }
    set({ hydrated: true });
    persist(get());
  },
}));
