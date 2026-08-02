"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  clearClientAuthIdentity,
  getClientAuthIdentity,
  type ClientAuthIdentity,
} from "@/lib/client-auth";

/**
 * Account control for studio workspaces.
 *
 * The studio header replaces the global site header, and with it the only
 * sign-in/sign-out surface — clicking the brand just navigated back to
 * /studio, leaving no way to change accounts mid-test. This restores the
 * account affordance everywhere the workspace header is used.
 */
export default function StudioAccountMenu() {
  const [identity, setIdentity] = useState<ClientAuthIdentity | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getClientAuthIdentity()
      .then((value) => {
        if (!cancelled) {
          setIdentity(value);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  async function signOut() {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    clearClientAuthIdentity();
    window.location.assign("/");
  }

  if (!ready) return null;

  if (!identity) {
    return (
      <Link href="/auth?next=/studio" className="rounded-full border border-accent/50 px-3 py-1.5 text-[10px] font-semibold text-accent hover:bg-accent/10">
        Sign in
      </Link>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-black/20 text-[11px] font-semibold uppercase text-ink hover:border-accent/60"
        aria-label="Account menu"
      >
        {(identity.name ?? identity.email ?? "C").slice(0, 1)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-[95] w-60 rounded-lg border border-line bg-paper-dim p-3 shadow-2xl">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">Signed in</p>
          <p className="mt-1 truncate text-xs text-ink">{identity.name ?? identity.email}</p>
          {identity.email && identity.name ? <p className="truncate text-[10px] text-grey">{identity.email}</p> : null}
          <div className="mt-3 grid gap-1.5 border-t border-line pt-3">
            <Link href="/studio" onClick={() => setOpen(false)} className="rounded-md px-2 py-1.5 text-xs text-grey hover:bg-white/5 hover:text-ink" role="menuitem">
              My Studio
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md px-2 py-1.5 text-left text-xs font-semibold text-grey hover:bg-white/5 hover:text-accent"
              role="menuitem"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
