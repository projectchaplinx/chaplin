"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useChaplinStore } from "@/lib/store";
import {
  storiesByAuthor,
  ledgerForMaker,
  makerEarnings,
  castForStory,
  getUser,
  getCharacter,
  getStory,
} from "@/lib/selectors";
import Avatar from "@/components/Avatar";
import CharacterCard from "@/components/CharacterCard";
import StoryCard from "@/components/StoryCard";
import SectionHeading from "@/components/SectionHeading";
import StudioWorkspaceHeader from "@/components/studio/StudioWorkspaceHeader";
import { getClientAuthIdentity } from "@/lib/client-auth";
import { money, formatDate, compactNumber } from "@/lib/format";
import { composeCharacterMasterPrompt } from "@/lib/production-prompting";
import type { Character, Story } from "@/lib/types";

type Tab = "drafts" | "characters" | "stories" | "earnings";

type SavedStoryRow = {
  id: string;
  title: string;
  logline: string | null;
  cover_hue: number | null;
  poster_url: string | null;
  backdrop_url: string | null;
  views: number | null;
  created_at: string;
};

type DraftSummary = {
  id: string;
  format: "spark" | "punch" | "episode" | "spot";
  title: string;
  logline: string;
  updated_at: string;
};

export default function StudioPage() {
  const world = useChaplinStore((s) => s);
  const currentUserId = useChaplinStore((s) => s.currentUserId);
  const [tab, setTab] = useState<Tab>("drafts");
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsNeedLogin, setDraftsNeedLogin] = useState(false);
  const [draftsError, setDraftsError] = useState("");
  const [copiedCharacterId, setCopiedCharacterId] = useState("");
  const [copyError, setCopyError] = useState("");
  const [savedStories, setSavedStories] = useState<Story[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let identity = await getClientAuthIdentity();
        if (!identity) {
          if (!cancelled) setDraftsNeedLogin(true);
          return;
        }

        let response = await fetch("/api/drafts", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.status === 401) {
          identity = await getClientAuthIdentity(true);
          if (identity) {
            response = await fetch("/api/drafts", {
              cache: "no-store",
              credentials: "same-origin",
            });
          }
        }
        const data = await response.json() as { drafts?: DraftSummary[] };
        if (cancelled) return;
        if (!identity || response.status === 401) setDraftsNeedLogin(true);
        else if (response.ok) {
          setDraftsNeedLogin(false);
          setDrafts(data.drafts ?? []);
        }
      } catch {
        if (!cancelled) setDraftsError("Your drafts could not be loaded. Refresh and try again.");
      } finally {
        if (!cancelled) setDraftsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/stories", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const data = await response.json() as { stories?: SavedStoryRow[] };
        if (cancelled) return;
        setSavedStories((data.stories ?? []).map((row) => ({
          id: row.id,
          authorId: currentUserId,
          title: row.title,
          logline: row.logline ?? "",
          coverHue: row.cover_hue ?? 205,
          posterUrl: row.poster_url ?? undefined,
          backdropUrl: row.backdrop_url ?? undefined,
          createdAt: row.created_at,
          status: "production",
          // The list endpoint returns the story row only; scenes live on the
          // pipeline run and the card does not read them.
          scenes: [],
          views: row.views ?? 0,
        })));
      } catch {
        // The local store still covers this browser's own productions.
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId]);

  const user = getUser(world, currentUserId);
  const myCharacters = world.characters;
  /*
    Productions live in the database once a run starts, but this tab only ever
    read the client store, so anything produced in another browser - or after
    localStorage was cleared - listed as nothing. The saved rows lead; local
    store entries the server has not seen yet are appended so a production is
    visible the instant it is started, before the round trip lands.
  */
  const localStories = storiesByAuthor(world, currentUserId);
  const myStories = [
    ...savedStories,
    ...localStories.filter((story) => !savedStories.some((saved) => saved.id === story.id)),
  ];
  const myLedger = ledgerForMaker(world, currentUserId);
  const earnings = makerEarnings(world, currentUserId);
  const totalCastings = myCharacters.reduce((n, c) => n + c.stats.castings, 0);
  const totalFans = myCharacters.reduce((n, c) => n + c.stats.fans, 0);

  async function copyCharacterPrompt(character: Character) {
    try {
      await navigator.clipboard.writeText(composeCharacterMasterPrompt(character));
      setCopyError("");
      setCopiedCharacterId(character.id);
      window.setTimeout(() => {
        setCopiedCharacterId((current) => current === character.id ? "" : current);
      }, 1800);
    } catch {
      setCopyError("Your browser blocked clipboard access. Please allow clipboard access and try again.");
    }
  }

  return (
    <section className="unified-studio-shell" data-unified-studio-shell data-studio-mode="projects">
      <StudioWorkspaceHeader
        mode="projects"
        projectName={user?.name ? `${user.name}'s projects` : "My projects"}
        status="Projects · drafts, actors, productions and earnings"
        actions={
          <Link href="/studio/write" className="studio-workspace-header__saved">
            New scene
          </Link>
        }
      />
      <div className="unified-studio-shell__body studio-projects-scroll">
    <div className="max-w-6xl mx-auto px-6 py-10 w-full">
      <div className="flex items-center gap-4 mb-8">
        {user && (
          <span className="accent-ring shrink-0">
            <Avatar hue={user.avatarHue} label={user.name} src={user.imageUrl} size={56} />
          </span>
        )}
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-accent font-semibold mb-1">
            My Studio
          </p>
          <h1 className="reel-title text-3xl">{user?.name ?? "Guest"}</h1>
          <p className="text-xs text-grey">{user?.roleBadges.join(" · ")}</p>
        </div>
        <div className="ml-auto hidden sm:flex gap-6 text-right">
          <div>
            <p className="text-xl font-semibold">{myCharacters.length}</p>
            <p className="text-[11px] text-grey uppercase tracking-wide">AI actors</p>
          </div>
          <div>
            <p className="text-xl font-semibold">{totalCastings}</p>
            <p className="text-[11px] text-grey uppercase tracking-wide">Castings</p>
          </div>
          <div>
            <p className="text-xl font-semibold">{compactNumber(totalFans)}</p>
            <p className="text-[11px] text-grey uppercase tracking-wide">Fans</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-accent">{money(earnings)}</p>
            <p className="text-[11px] text-grey uppercase tracking-wide">Earnings</p>
          </div>
        </div>
      </div>

      <Link
        href="/studio/pipelines"
        className="poster-card mb-6 flex items-center justify-between gap-4 rounded-md p-4 hover:border-accent"
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-accent">Production system</p>
          <p className="mt-1 text-sm font-semibold">See every image, shot, video, audio, and delivery pipeline</p>
        </div>
        <span className="text-accent">→</span>
      </Link>

      <div className="-mx-6 mb-6 overflow-x-auto px-6 no-scrollbar" role="tablist" aria-label="Studio sections">
        <div className="flex w-max min-w-full items-end gap-1 border-b border-line">
          {(
            [
              ["drafts", "Drafts", draftsLoading ? "…" : drafts.length],
              ["characters", "Actors", myCharacters.length],
              ["stories", "Productions", myStories.length],
              ["earnings", "Earnings", myLedger.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls="studio-tab-panel"
              onClick={(event) => {
                setTab(key as Tab);
                event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
              }}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                tab === key
                  ? "border-accent text-ink"
                  : "border-transparent text-grey hover:border-white/20 hover:text-ink"
              }`}
            >
              <span>{label}</span>
              <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[9px] ${
                tab === key ? "bg-accent text-white" : "bg-white/[0.05] text-grey"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <section id="studio-tab-panel" role="tabpanel">
      {tab === "drafts" && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="reel-title text-2xl">Continue where you stopped</h2>
              <p className="mt-1 text-xs text-grey">Private, account-owned work automatically saved from the writing room.</p>
            </div>
            <Link href="/studio/write" className="shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white">
              + New draft
            </Link>
          </div>
          {draftsLoading ? (
            <div className="poster-card rounded-md p-10 text-center text-sm text-grey">Loading your drafts…</div>
          ) : draftsNeedLogin ? (
            <div className="poster-card rounded-md p-10 text-center">
              <p className="text-sm font-semibold">Sign in to keep drafts private and available on every device.</p>
              <Link href="/auth?next=/studio" className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white">Create creator account</Link>
            </div>
          ) : draftsError ? (
            <div className="poster-card rounded-md p-8 text-center text-sm text-red-300">{draftsError}</div>
          ) : drafts.length === 0 ? (
            <Link href="/studio/write" className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line p-6 text-grey transition-colors hover:border-accent hover:text-accent">
              <span className="text-2xl">+</span>
              <span className="text-sm">Start your first Spark, Punch, Episode, or Spot</span>
            </Link>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {drafts.map((draft) => (
                <Link key={draft.id} href={`/studio/write?format=${draft.format}&draft=${draft.id}`} className="poster-card rounded-md p-5 hover:border-accent">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                      {draft.format === "episode" ? "Episode · 60s" : draft.format === "punch" ? "Punch · 15s" : draft.format === "spark" ? "Spark · 5s" : "Brand Spot"}
                    </span>
                    <span className="text-[10px] text-grey">{new Date(draft.updated_at).toLocaleDateString()}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">{draft.title || "Untitled draft"}</h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-grey">{draft.logline || "Open this draft and continue writing."}</p>
                  <span className="mt-5 block text-xs font-semibold text-accent">Continue →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "characters" && (
        <div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">My AI actors</h2>
              <p className="mt-1 text-xs text-grey">Copy an actor&apos;s complete creator brief and production canon for reuse.</p>
            </div>
            {copyError && <p className="text-xs text-red-300" role="alert">{copyError}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Link
              href="/characters/new"
              className="border border-dashed border-line rounded-md flex flex-col items-center justify-center gap-2 text-grey hover:border-accent hover:text-accent transition-colors p-6 min-h-40"
            >
              <span className="text-2xl">+</span>
              <span className="text-sm">Build a new AI actor</span>
            </Link>
            {myCharacters.map((c) => (
              <div key={c.id} className="relative">
                <CharacterCard character={c} />
                <button
                  type="button"
                  onClick={() => void copyCharacterPrompt(c)}
                  className="absolute right-3 top-3 z-10 rounded-full border border-white/20 bg-black/75 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur transition-colors hover:border-accent hover:text-accent"
                  aria-label={`Copy the complete character prompt for ${c.name}`}
                >
                  {copiedCharacterId === c.id ? "Copied ✓" : "Copy full prompt"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "stories" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/studio/write"
            className="border border-dashed border-line rounded-md flex flex-col items-center justify-center gap-2 text-grey hover:border-accent hover:text-accent transition-colors p-6 min-h-48"
          >
            <span className="text-2xl">+</span>
            <span className="text-sm">Start a new production</span>
          </Link>
          {myStories.map((story) => {
            const cast = castForStory(world, story.id).map((r) => r.character);
            return <StoryCard key={story.id} story={story} cast={cast} />;
          })}
        </div>
      )}

      {tab === "earnings" && (
        <div>
          <SectionHeading
            eyebrow="Every reel, traced"
            title={`${money(earnings)} earned so far`}
          />
          {myLedger.length === 0 ? (
            <div className="poster-card rounded-md p-10 text-center text-grey">
              No earnings yet, cast one of your AI actors into a story to start the ledger.
            </div>
          ) : (
            <div className="poster-card rounded-md overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-grey">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">AI actor</th>
                    <th className="px-4 py-3 font-medium">Story</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {myLedger.map((entry) => {
                    const character = getCharacter(world, entry.characterId);
                    const story = getStory(world, entry.storyId);
                    return (
                      <tr key={entry.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3 text-grey whitespace-nowrap">
                          {formatDate(entry.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          {character ? (
                            <Link
                              href={`/characters/${character.id}`}
                              className="hover:text-accent font-medium"
                            >
                              {character.name}
                            </Link>
                          ) : (
                            "unknown"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {story ? (
                            <Link href={`/stories/${story.id}`} className="hover:text-accent">
                              {story.title}
                            </Link>
                          ) : (
                            "unknown"
                          )}
                        </td>
                        <td className="px-4 py-3 capitalize text-grey">{entry.type}</td>
                        <td className="px-4 py-3 text-right font-semibold text-accent">
                          {money(entry.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </section>
    </div>
      </div>
    </section>
  );
}
