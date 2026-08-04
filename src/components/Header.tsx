"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useChaplinStore } from "@/lib/store";
import Avatar from "@/components/Avatar";
import HydrateStore from "@/components/HydrateStore";
import BrandLogo from "@/components/BrandLogo";
import { CHAPLIN_VERSION_LABEL } from "@/lib/version";
import {
  clearClientAuthIdentity,
  getClientAuthIdentity,
  type ClientAuthIdentity,
} from "@/lib/client-auth";
import { CREATOR_ONBOARDING_EVENT } from "@/lib/creator-onboarding";

export default function Header() {
  const pathname = usePathname();
  const users = useChaplinStore((state) => state.users);
  const currentUserId = useChaplinStore((state) => state.currentUserId);
  const syncAuthenticatedUser = useChaplinStore((state) => state.syncAuthenticatedUser);
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [authIdentity, setAuthIdentity] = useState<ClientAuthIdentity | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const updateHeader = () => setCompact(window.scrollY > 48);

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadIdentity = (force = false) => void getClientAuthIdentity(force)
      .then((identity) => {
        if (cancelled) return;
        setAuthIdentity(identity);
        setAuthReady(true);
        if (identity) syncAuthenticatedUser(identity);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthIdentity(null);
          setAuthReady(true);
        }
      });
    loadIdentity();
    const refreshCredits = () => loadIdentity(true);
    window.addEventListener("chaplin:credits-updated", refreshCredits);
    return () => {
      cancelled = true;
      window.removeEventListener("chaplin:credits-updated", refreshCredits);
    };
  }, [syncAuthenticatedUser]);

  async function signOut() {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    clearClientAuthIdentity();
    window.location.assign("/");
  }

  const currentUser = users.find((user) => user.id === currentUserId) ?? users[0];
  const headerName = authIdentity?.name ?? (authReady ? "Preview mode" : currentUser?.name);
  const headerStatus = authIdentity
    ? authIdentity.role === "creator" ? "Creator" : "Signed in"
    : authReady
      ? "Not signed in"
      : "Checking account";
  const contextLink = { href: "/feed", label: "Creator feed" };

  if (pathname === "/super-admin") return null;

  return (
    <>
      <header
        data-header-compact={compact ? "true" : "false"}
        className={`fixed inset-x-0 top-0 z-[70] border-b backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300 ${compact ? "border-line/70 bg-paper/95 shadow-lg shadow-black/10" : "border-line bg-paper/90"}`}
      >
      <HydrateStore />
      <div className={`app-width px-4 sm:px-6 flex items-center justify-between gap-3 transition-[height] duration-300 ${compact ? "h-12" : "h-16"}`}>
        <Link
          href="/"
          aria-label="Chaplin home"
          data-header-logo
          className={`relative flex items-center shrink-0 transition-[width,height] duration-300 ${compact ? "h-9 w-9" : "h-11 w-[8.75rem]"}`}
        >
          <span
            data-header-wordmark
            className={`absolute inset-y-0 left-0 flex items-center transition-all duration-300 ${compact ? "pointer-events-none -translate-y-2 opacity-0" : "translate-y-0 opacity-100"}`}
          >
            <BrandLogo
              data-header-full-logo
              priority
              className="h-11"
            />
          </span>
          <Image
            src="/brand/chaplin-mark.png"
            alt=""
            aria-hidden="true"
            data-header-compact-mark
            width={40}
            height={40}
            priority
            className={`absolute inset-0 h-9 w-9 object-contain transition-all duration-300 ${compact ? "scale-100 rotate-0 opacity-100" : "pointer-events-none scale-75 -rotate-6 opacity-0"}`}
          />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {authIdentity?.role === "creator" && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(CREATOR_ONBOARDING_EVENT))}
              className="rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[9px] font-semibold text-accent transition hover:border-accent hover:bg-accent/15 sm:px-3 sm:text-[10px]"
              data-onboarding-replay
            >
              How to create
            </button>
          )}
          <Link
            href="/api/build-info"
            title={`Chaplin ${CHAPLIN_VERSION_LABEL}`}
            className="rounded-full border border-line/80 px-2 py-1 font-mono text-[8px] font-semibold tracking-wide text-grey transition-colors hover:border-accent hover:text-accent sm:text-[9px]"
          >
            {CHAPLIN_VERSION_LABEL}
          </Link>
          <Link href={contextLink.href} className={`hidden sm:block text-[10px] uppercase tracking-wider text-grey hover:text-accent transition-all duration-200 ${compact ? "pointer-events-none max-w-0 -translate-y-1 overflow-hidden opacity-0" : "max-w-28 translate-y-0 opacity-100"}`}>
            {contextLink.label}
          </Link>
          {!authIdentity && <Link href="/auth" className={`text-[10px] font-semibold uppercase tracking-wider text-accent transition-all duration-200 ${compact ? "hidden" : ""}`}>Sign in</Link>}
          <div className="relative">
            <button
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label="Open account menu"
              className={`flex items-center rounded-full border py-1 transition-all duration-300 ${compact ? "gap-0 px-1" : "gap-2 px-1.5"} ${open ? "border-accent bg-white/[0.06]" : "border-line hover:border-accent"}`}
            >
              {currentUser && (
                <span className="accent-ring">
                  <Avatar
                    hue={authIdentity ? currentUser.avatarHue : 205}
                    label={authIdentity ? currentUser.avatarInitial : "P"}
                    src={authIdentity ? currentUser.imageUrl : undefined}
                    size={32}
                  />
                </span>
              )}
              <span className={`text-left overflow-hidden transition-all duration-300 ${compact ? "max-w-0 pr-0 opacity-0" : "max-w-32 pr-2 opacity-100 sm:max-w-44"}`}>
                <span className="block text-xs sm:text-sm leading-tight font-medium truncate">{headerName}</span>
                <span className="block leading-tight text-[9px] sm:text-[10px] text-accent uppercase tracking-wide truncate">
                  {headerStatus}
                </span>
              </span>
            </button>

            {open && (
              <div className={`fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[24rem] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border border-line bg-paper-dim shadow-2xl p-3 z-[90] ${compact ? "top-[3.25rem]" : "top-[4.25rem]"}`}>
                <div className="flex items-start justify-between gap-3 px-1 mb-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">{authIdentity ? "Signed-in account" : "Chaplin account"}</p>
                    <p className="text-xs text-grey mt-1">{authIdentity ? authIdentity.email : "Sign in once and start creating."}</p>
                  </div>
                  <button onClick={() => setOpen(false)} className="text-grey hover:text-ink text-lg leading-none" aria-label="Close account menu">×</button>
                </div>

                {authIdentity?.role === "creator" && (
                  <div
                    data-account-credit-balance
                    aria-live="polite"
                    className="mb-3 flex items-center justify-between gap-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3"
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Available credits</p>
                      <p className="mt-1 text-[10px] leading-snug text-grey">Your current balance, ready to create.</p>
                    </div>
                    <p className="shrink-0 font-mono text-2xl font-semibold leading-none text-ink">
                      {(authIdentity.creditBalance ?? 0).toLocaleString()}
                    </p>
                  </div>
                )}

                {authIdentity?.role === "creator" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/studio" onClick={() => setOpen(false)} className="rounded-md border border-line p-3 hover:border-accent/60">
                      <span className="block text-xs font-semibold">My Studio</span>
                      <span className="mt-1 block text-[10px] leading-snug text-grey">All actors, published work, and drafts.</span>
                    </Link>
                    <Link href="/create" onClick={() => setOpen(false)} className="rounded-md border border-accent bg-accent/10 p-3">
                      <span className="block text-xs font-semibold">Start creating</span>
                      <span className="mt-1 block text-[10px] leading-snug text-grey">Create an actor, scene, reel, or micro drama.</span>
                    </Link>
                  </div>
                ) : authIdentity ? (
                  <p className="rounded-md border border-line p-3 text-xs text-grey">
                    This account is signed in. Open the private operations URL directly to manage the platform.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    <Link href="/auth?next=/create" onClick={() => setOpen(false)} className="rounded-md border border-accent bg-accent/10 p-3">
                      <span className="block text-xs font-semibold">Sign up or sign in</span>
                      <span className="mt-1 block text-[10px] leading-snug text-grey">New creators get 100 credits on the house.</span>
                    </Link>
                  </div>
                )}

                <div className="border-t border-line mt-3 pt-3 px-1 flex items-center justify-between gap-3">
                  {authIdentity ? <button type="button" onClick={() => void signOut()} className="text-xs font-semibold text-grey hover:text-accent">Sign out</button> : <Link href="/auth?next=/create" onClick={() => setOpen(false)} className="text-xs font-semibold text-accent">Sign up or sign in</Link>}
                  {authIdentity?.role === "creator" && (
                    <Link href="/characters/new" onClick={() => setOpen(false)} className="text-xs text-accent hover:underline whitespace-nowrap">
                      + New actor
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </header>
      <div
        aria-hidden="true"
        className={`shrink-0 transition-[height] duration-300 ${compact ? "h-12" : "h-16"}`}
      />
    </>
  );
}
