"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/credits", label: "Credits & usage", exact: false },
  { href: "/admin/scene-map", label: "Scene map", exact: false },
  { href: "/admin/pipeline", label: "Pipeline lab", exact: true },
  { href: "/admin/pipeline/experiments", label: "Experiment ground", exact: false },
  { href: "/admin/logs", label: "Generation logs", exact: false },
];

export default function AdminSectionNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="inline-flex rounded-full border border-line bg-black/10 p-1 mb-8">
      {SECTIONS.map((section) => {
        const active = section.exact ? pathname === section.href : pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              active ? "bg-accent text-white" : "text-grey hover:text-ink"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
