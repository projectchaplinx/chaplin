"use client";

import Image from "next/image";

export type SceneAsset = {
  index: number;
  setting: string;
  action: string;
  previewImageUrl?: string;
  lineCount: number;
  authored: boolean;
};

/**
 * Right panel of the Scene Studio. Shows every frame the production will need
 * and its live state, so a creator can see what exists and what is still
 * missing without scrolling the script.
 */
export default function SceneStudioAssets({
  assets,
  busyIndex,
  onSelect,
  onGenerateAll,
  canGenerate,
  productImageUrl,
  productionMode = false,
}: {
  assets: SceneAsset[];
  busyIndex: number | null;
  onSelect: (index: number) => void;
  onGenerateAll: () => void;
  canGenerate: boolean;
  productImageUrl?: string;
  productionMode?: boolean;
}) {
  const ready = assets.filter((asset) => asset.previewImageUrl).length;

  return (
    <aside className="studio-asset-panel flex flex-col gap-3 border-l border-line/70 p-3" data-scene-studio-assets>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent-secondary">
            {productionMode ? "Production assets" : "Asset canvas"}
          </p>
          <p className="mt-0.5 text-[10px] text-grey">{ready} of {assets.length} frames rendered</p>
        </div>
        {!productionMode && (
          <button
            type="button"
            onClick={onGenerateAll}
            disabled={!canGenerate || busyIndex !== null}
            className="shrink-0 rounded-full border border-accent-secondary/55 px-3 py-1.5 text-[10px] font-semibold text-accent-secondary transition-colors hover:bg-accent-secondary/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busyIndex !== null ? `Framing ${busyIndex + 1}…` : "Render all"}
          </button>
        )}
      </div>

      {/*
        The panel is a fixed-height flex column, so a shrinkable list is
        compressed to fit instead of overflowing - `overflow-y: auto` then has
        nothing to scroll and the canvas is stuck no matter how many scenes are
        rendered. Holding natural height is what produces the scrollbar.
      */}
      <ul className="flex shrink-0 flex-col gap-2">
        {assets.map((asset) => {
          const busy = busyIndex === asset.index;
          const state = busy ? "rendering" : asset.previewImageUrl ? "ready" : asset.authored ? "queued" : "empty";
          return (
            <li key={asset.index}>
              <button
                type="button"
                onClick={() => onSelect(asset.index)}
                className="group w-full overflow-hidden rounded-xl border border-line/70 bg-black/20 text-left transition-colors hover:border-accent/45"
              >
                <span className="relative block aspect-video w-full overflow-hidden bg-black/40">
                  {asset.previewImageUrl ? (
                    <Image
                      src={asset.previewImageUrl}
                      alt=""
                      fill
                      sizes="300px"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-grey">
                      {busy ? "Rendering…" : asset.authored ? "Not rendered" : "Scene not written"}
                    </span>
                  )}
                  {busy && (
                    <span className="asset-canvas-shimmer absolute inset-0" aria-hidden="true" />
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white/85">
                    Scene {asset.index + 1}
                  </span>
                  <span
                    className={`absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
                      state === "ready"
                        ? "bg-emerald-400/20 text-emerald-300"
                        : state === "rendering"
                          ? "bg-accent/25 text-accent"
                          : "bg-white/10 text-white/55"
                    }`}
                  >
                    {state === "rendering" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
                    {state}
                  </span>
                </span>
                <span className="block px-2.5 py-2">
                  <span className="block truncate text-[10.5px] font-semibold text-ink">
                    {asset.setting || "Untitled setting"}
                  </span>
                  <span className="mt-0.5 block truncate text-[9.5px] text-grey">
                    {asset.action || "No action written yet"}
                  </span>
                  {asset.lineCount > 0 && (
                    <span className="mt-1 inline-block rounded bg-white/8 px-1.5 py-0.5 text-[8.5px] text-white/60">
                      {asset.lineCount} {asset.lineCount === 1 ? "line" : "lines"}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {productImageUrl && (
        <div className="rounded-xl border border-line/70 bg-black/20 p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-grey">Product reference</p>
          <span className="relative mt-2 block aspect-video w-full overflow-hidden rounded-lg">
            <Image src={productImageUrl} alt="" fill sizes="300px" className="object-cover" />
          </span>
        </div>
      )}
    </aside>
  );
}
