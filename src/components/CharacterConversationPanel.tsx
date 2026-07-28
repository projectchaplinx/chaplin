"use client";

import { useEffect, useRef, useState } from "react";
import type { Character } from "@/lib/types";
import { IconMicrophone } from "@/components/Icons";

type Turn = { role: "user" | "character"; text: string };

const STARTERS = [
  "What are you chasing right now?",
  "What makes you hesitate?",
  "What would you say before the scene starts?",
];

/** The theme is a bed under the performance, not a track competing with it. */
const THEME_BED_VOLUME = 0.16;
const THEME_DUCKED_VOLUME = 0.05;

export default function CharacterConversationPanel({
  character,
  variant = "full",
}: {
  character: Character;
  variant?: "full" | "hero";
}) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [canSpeak, setCanSpeak] = useState(Boolean(character.voiceId));
  const [themeUrl, setThemeUrl] = useState<string | null>(null);
  const [roomLive, setRoomLive] = useState(false);
  // The bed is audible for as long as the room is open, so it needs its own
  // control - there was no way to quiet it short of leaving the page.
  const [themePlaying, setThemePlaying] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const themeRef = useRef<HTMLAudioElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const openedRef = useRef(false);

  useEffect(() => () => {
    audioRef.current?.pause();
    themeRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  useEffect(() => {
    if (!roomLive || variant !== "hero") return;
    const frame = window.requestAnimationFrame(() => {
      messageInputRef.current?.focus({ preventScroll: true });
      messageInputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [roomLive, variant]);

  // The character's own theme is part of their identity, so the room plays it
  // rather than sitting in silence. Same production state the profile hero uses.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/characters/${encodeURIComponent(character.id)}/media`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { media?: { latestThemeUrl?: string | null } } | null) => {
        if (!cancelled) setThemeUrl(data?.media?.latestThemeUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setThemeUrl(null);
      });
    return () => { cancelled = true; };
  }, [character.id]);

  // Browsers block autoplay until a gesture, so the bed starts on first send or
  // on an explicit "enter the room" press rather than on mount.
  function startThemeBed() {
    if (!themeUrl || themeRef.current) return;
    const theme = new Audio(themeUrl);
    theme.loop = true;
    theme.volume = THEME_BED_VOLUME;
    themeRef.current = theme;
    void theme.play()
      .then(() => setThemePlaying(true))
      .catch(() => {
        // A blocked bed must never break the conversation itself.
        themeRef.current = null;
        setThemePlaying(false);
      });
  }

  /** Pauses or resumes the theme without disturbing the conversation. */
  function toggleThemeBed() {
    const theme = themeRef.current;
    if (!theme) {
      startThemeBed();
      return;
    }
    if (theme.paused) {
      void theme.play().then(() => setThemePlaying(true)).catch(() => setThemePlaying(false));
      return;
    }
    theme.pause();
    setThemePlaying(false);
  }

  /** Opens the room: theme bed up, and the actor lands their punchline aloud. */
  function enterRoom() {
    if (openedRef.current) return;
    openedRef.current = true;
    setRoomLive(true);
    startThemeBed();
    const opener = character.brollLine?.trim() || character.tagline?.trim();
    if (opener) {
      setTurns((current) => (current.length ? current : [{ role: "character", text: opener }]));
      void speak(opener);
    }
  }

  async function send(nextMessage = message) {
    const text = nextMessage.trim();
    if (!text || sending) return;
    setError("");
    setSending(true);
    setMessage("");
    enterRoom();
    // Snapshot before appending so the request carries prior turns, not this one.
    const history = turns;
    setTurns((current) => [...current, { role: "user", text }]);
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/interact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await response.json() as { reply?: string; error?: string; canSpeak?: boolean };
      if (!response.ok || !data.reply) throw new Error(data.error || "The actor could not answer right now.");
      const speakable = Boolean(data.canSpeak);
      setCanSpeak(speakable);
      setTurns((current) => [...current, { role: "character", text: data.reply! }]);
      // The room is a conversation, so the actor answers aloud without being asked.
      if (speakable) void speak(data.reply!);
    } catch (caught) {
      setTurns((current) => current.slice(0, -1));
      setMessage(text);
      setError(caught instanceof Error ? caught.message : "The actor could not answer right now.");
    } finally {
      setSending(false);
    }
  }

  async function speak(text: string) {
    if (speaking) return;
    setError("");
    if (!character.voiceId) return;
    setSpeaking(true);
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/interact/voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Voice playback is unavailable.");
      }
      const blob = await response.blob();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      // Duck the bed under the line, then lift it once the actor stops talking.
      if (themeRef.current) themeRef.current.volume = THEME_DUCKED_VOLUME;
      const liftBed = () => {
        if (themeRef.current) themeRef.current.volume = THEME_BED_VOLUME;
        setSpeaking(false);
      };
      audio.addEventListener("ended", liftBed, { once: true });
      audio.addEventListener("error", liftBed, { once: true });
      await audio.play();
      return;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Voice playback is unavailable.");
      if (themeRef.current) themeRef.current.volume = THEME_BED_VOLUME;
    }
    setSpeaking(false);
  }

  const lastReply = [...turns].reverse().find((turn) => turn.role === "character");

  if (variant === "hero" && !roomLive) {
    const firstName = character.name.split(" ")[0];
    const readiness = canSpeak && themeUrl
      ? "Voice, memory and theme ready"
      : canSpeak
        ? "Voice and memory ready"
        : themeUrl
          ? "Memory and theme ready"
          : "Start a live in-character conversation";

    return (
      <section
        className="character-hero-room character-hero-room--entry"
        data-character-conversation
        data-conversation-variant="hero"
      >
        <button
          type="button"
          onClick={enterRoom}
          className="character-hero-room__entry"
          aria-label={`Talk to ${firstName}`}
        >
          <span className="character-hero-room__mic" aria-hidden="true">
            <IconMicrophone className="h-7 w-7" />
          </span>
          <span className="character-hero-room__copy">
            <span className="character-hero-room__title">Talk to {firstName}</span>
            <span className="character-hero-room__subtitle">{readiness}</span>
          </span>
          <span className="character-hero-room__arrow" aria-hidden="true">→</span>
        </button>
      </section>
    );
  }

  if (variant === "hero") {
    return (
      <section className="character-hero-room" data-character-conversation data-conversation-variant="hero">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-accent-secondary">
              <span className={`h-1.5 w-1.5 rounded-full ${roomLive ? "animate-pulse bg-accent-secondary" : "bg-white/35"}`} />
              {roomLive ? speaking ? "Speaking now" : "Room is live" : "Live character room"}
            </p>
            <h2 className="reel-title mt-1 text-2xl sm:text-3xl">Talk to {character.name.split(" ")[0]}</h2>
          </div>
          {roomLive && themeUrl && (
            <button
              type="button"
              onClick={toggleThemeBed}
              aria-pressed={themePlaying}
              className="shrink-0 rounded-full border border-white/15 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/65 hover:border-accent-secondary hover:text-accent-secondary"
            >
              {themePlaying ? "Theme on" : "Theme off"}
            </button>
          )}
        </div>

        {!roomLive ? (
          <>
            <p className="mt-2 max-w-md text-xs leading-5 text-grey">
              Ask anything. {canSpeak ? `${character.name.split(" ")[0]} answers in their locked voice and remembers the conversation.` : "The reply stays in character."}
            </p>
            <button
              type="button"
              onClick={enterRoom}
              className="magic-action mt-4 flex w-full items-center justify-between rounded-xl px-4 py-3 text-left"
              data-intelligence-action
            >
              <span>
                <span className="block text-xs font-bold text-ink">Enter the room</span>
                <span className="mt-0.5 block text-[10px] text-grey">{themeUrl ? "Voice and character theme are ready" : "Start a live in-character conversation"}</span>
              </span>
              <span className="text-lg text-accent-secondary" aria-hidden="true">→</span>
            </button>
          </>
        ) : (
          <>
            {lastReply && (
              <div className="mt-3 max-h-28 overflow-y-auto rounded-xl border border-white/10 bg-black/20 px-3 py-2.5" aria-live="polite">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-accent-secondary">{character.name}</p>
                <p className="mt-1 text-xs leading-5 text-white/82">{lastReply.text}</p>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <input
                ref={messageInputRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void send(); }}
                placeholder={`Say something to ${character.name.split(" ")[0]}…`}
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-xs text-ink outline-none placeholder:text-grey focus:border-accent"
                aria-label={`Message ${character.name}`}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !message.trim()}
                className="magic-action rounded-xl px-4 py-2.5 text-xs font-bold disabled:opacity-40"
                data-intelligence-action
                aria-busy={sending}
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
            {!lastReply && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label={`Conversation starters for ${character.name}`}>
                {STARTERS.slice(0, 2).map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void send(starter)}
                    disabled={sending}
                    className="magic-action shrink-0 rounded-full px-3 py-1.5 text-[9px] font-semibold disabled:opacity-40"
                    data-intelligence-action
                    aria-busy={sending}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            )}
            {error && <p role="status" className="mt-2 text-[10px] text-amber-300">{error}</p>}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-accent/35 bg-[radial-gradient(circle_at_top_right,rgba(7,210,190,0.15),transparent_35%),linear-gradient(135deg,rgba(244,72,112,0.1),transparent_55%),#11190d]" data-character-conversation>
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-accent-secondary">Live character room</p>
          <h2 className="reel-title mt-1 text-2xl">Talk to {character.name}</h2>
          <p className="mt-1 text-xs text-grey">
            {canSpeak
              ? `${character.name.split(" ")[0]} answers out loud and remembers what you have already said.`
              : "Ask a question. The reply stays in character, not in the production notes."}
          </p>
          {!roomLive && canSpeak && (
            <button
              type="button"
              onClick={enterRoom}
              className="magic-action mt-2.5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[10px] font-semibold"
              data-intelligence-action
            >
              ▶ Enter the room{themeUrl ? " · with theme" : ""}
            </button>
          )}
          {roomLive && (
            <div className="mt-2.5 flex items-center gap-2">
              <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-secondary" />
                {speaking ? "Speaking" : "Listening"}
                {themePlaying ? " · theme running" : ""}
              </p>
              {themeUrl && (
                <button
                  type="button"
                  onClick={toggleThemeBed}
                  aria-pressed={themePlaying}
                  className="rounded-full border border-white/15 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/70 transition-colors hover:border-accent-secondary hover:text-accent-secondary"
                >
                  {themePlaying ? "Pause theme" : "Play theme"}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2" aria-label={`Conversation starters for ${character.name}`}>
          {STARTERS.map((starter) => (
            <button key={starter} type="button" onClick={() => void send(starter)} disabled={sending} className="magic-action rounded-full px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40" data-intelligence-action aria-busy={sending}>
              {starter}
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10 bg-black/15 p-4 sm:p-5">
        {turns.length > 0 && (
          <div className="mb-4 grid gap-2" aria-live="polite">
            {turns.slice(-4).map((turn, index) => (
              <p key={`${turn.role}-${index}-${turn.text.slice(0, 12)}`} className={`max-w-2xl rounded-lg px-3 py-2 text-xs leading-relaxed ${turn.role === "character" ? "bg-accent-secondary/10 text-ink" : "ml-auto bg-white/8 text-white/70"}`}>
                {turn.role === "character" && <span className="mr-2 text-[9px] font-semibold uppercase tracking-wide text-accent-secondary">{character.name}</span>}
                {turn.text}
              </p>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void send(); }}
            placeholder={`Say something to ${character.name.split(" ")[0]}…`}
            className="min-w-0 flex-1 rounded-sm border border-white/14 bg-black/25 px-3 py-3 text-sm text-ink outline-none transition-colors placeholder:text-grey focus:border-accent"
            aria-label={`Message ${character.name}`}
          />
          <button type="button" onClick={() => void send()} disabled={sending || !message.trim()} className="magic-action rounded-sm px-5 py-3 text-sm font-semibold disabled:opacity-40" data-intelligence-action aria-busy={sending}>
            {sending ? "Thinking…" : "Send"}
          </button>
          {lastReply && canSpeak && (
            <button type="button" onClick={() => void speak(lastReply.text)} disabled={speaking} className="rounded-sm border border-accent-secondary/55 px-4 py-3 text-sm font-semibold text-accent-secondary transition-colors hover:bg-accent-secondary/10 disabled:opacity-40">
              {speaking ? "Speaking…" : "Replay"}
            </button>
          )}
        </div>
        {error && <p role="status" className="mt-2 text-xs text-amber-300">{error}</p>}
      </div>
    </section>
  );
}
