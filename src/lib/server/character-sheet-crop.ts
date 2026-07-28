import "server-only";
import sharp from "sharp";
import { saveMediaAsset } from "@/lib/server/supabase-admin";

const PANEL_NAMES = ["front", "three_quarter", "profile", "full_body"] as const;

export async function cropCharacterSheet(input: {
  characterId: string;
  compositeAssetId: string;
  compositeUrl: string;
  provider: string;
  prompt: string;
}) {
  const response = await fetch(input.compositeUrl);
  if (!response.ok) throw new Error(`Load composite character sheet: ${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Character sheet has no readable dimensions.");
  const panelWidth = Math.floor(metadata.width / PANEL_NAMES.length);
  const panels = await Promise.all(PANEL_NAMES.map(async (view, index) => {
    const left = index * panelWidth;
    const width = index === PANEL_NAMES.length - 1 ? metadata.width! - left : panelWidth;
    const bytes = await sharp(source).extract({ left, top: 0, width, height: metadata.height! }).png().toBuffer();
    const asset = await saveMediaAsset({
      characterId: input.characterId,
      kind: "gallery",
      provider: input.provider,
      bytes: Uint8Array.from(bytes).buffer,
      contentType: "image/png",
      prompt: input.prompt,
      metadata: {
        characterSheetRole: "panel",
        characterSheetView: view,
        compositeAssetId: input.compositeAssetId,
        videoReferenceSafe: true,
      },
    });
    return [view, asset.id] as const;
  }));
  return Object.fromEntries(panels) as Record<(typeof PANEL_NAMES)[number], string>;
}
