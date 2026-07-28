import { notFound, redirect } from "next/navigation";
import CharacterStudioScreen from "@/components/CharacterStudioScreen";
import { characterViewerAccess } from "@/lib/character-access";
import { getServerAuthIdentity } from "@/lib/server/auth";
import { listCharacters } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

export default async function CharacterStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const mode = (await searchParams).mode === "scene" ? "scene" : "actor";
  const nextPath = `/characters/${id}/studio`;
  const identity = await getServerAuthIdentity();
  if (!identity) redirect(`/auth?next=${encodeURIComponent(nextPath)}`);

  const character = (await listCharacters()).find((item) => item.id === id);
  if (!character) notFound();
  if (!characterViewerAccess(identity, character.makerId).canManage) {
    redirect(`/characters/${id}`);
  }

  return <CharacterStudioScreen character={character} initialMode={mode} />;
}
