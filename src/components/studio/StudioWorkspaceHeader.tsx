"use client";

import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

export type StudioMode = "actor" | "scene" | "render" | "projects";

export default function StudioWorkspaceHeader({
  mode,
  projectName,
  status,
  backHref = "/studio",
  backLabel = "Studio",
  actions,
  actorHref = "/characters/new",
  sceneHref = "/studio/write",
  projectsHref = "/studio",
}: {
  mode: StudioMode;
  projectName: string;
  status: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  actorHref?: string;
  sceneHref?: string;
  projectsHref?: string;
}) {
  const activeMode = mode === "render" ? "scene" : mode;
  const modeLinks = [
    { mode: "actor" as const, label: "Actor", href: actorHref },
    { mode: "scene" as const, label: "Scene", href: sceneHref },
    { mode: "projects" as const, label: "Projects", href: projectsHref },
  ];

  return (
    <header className="studio-workspace-header" data-studio-workspace-header>
      <div className="studio-workspace-header__identity">
        <Link href={backHref} className="studio-workspace-header__brand" aria-label={`Back to ${backLabel}`}>
          <BrandLogo priority className="h-9" />
        </Link>
        <span className="studio-workspace-header__divider" aria-hidden="true" />
        <div className="min-w-0">
          <p className="studio-workspace-header__project">{projectName || "Untitled project"}</p>
          <p className="studio-workspace-header__status">{status}</p>
        </div>
      </div>

      <div className="studio-workspace-header__center">
        <nav className="studio-workspace-switcher" aria-label="Studio workspace">
          {modeLinks.map((item) => (
            <Link
              key={item.mode}
              href={item.href}
              aria-current={activeMode === item.mode ? "page" : undefined}
              className={activeMode === item.mode ? "is-active" : ""}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="studio-workspace-header__actions">
        <span className="studio-workspace-header__mode">{mode} studio</span>
        {actions}
      </div>
    </header>
  );
}
