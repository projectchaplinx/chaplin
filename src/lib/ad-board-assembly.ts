export type AdBoardSlotMedia = {
  slotId: string;
  videoUrl?: string;
  stillUrl?: string;
};

export type AdBoardAssemblySource =
  | { kind: "video"; url: string; fit: "trim-or-hold-last-frame" }
  | { kind: "still"; url: string; fit: "hold" }
  | { kind: "carry"; fromSlotId: string; fit: "hold" }
  | { kind: "canonical"; url: string; fit: "hold" };

/**
 * Chooses picture fallback without ever inventing a black frame.
 */
export function planAdBoardPictureSources(
  slotIds: string[],
  media: AdBoardSlotMedia[],
  canonicalReferenceUrl: string,
): Array<{ slotId: string; source: AdBoardAssemblySource }> {
  const mediaBySlot = new Map(media.map((item) => [item.slotId, item]));
  let previousSlotId = "";
  return slotIds.map((slotId, index) => {
    const item = mediaBySlot.get(slotId);
    let source: AdBoardAssemblySource;
    if (item?.videoUrl) source = { kind: "video", url: item.videoUrl, fit: "trim-or-hold-last-frame" };
    else if (item?.stillUrl) source = { kind: "still", url: item.stillUrl, fit: "hold" };
    else if (previousSlotId) source = { kind: "carry", fromSlotId: previousSlotId, fit: "hold" };
    else if (index === 0 && canonicalReferenceUrl) source = { kind: "canonical", url: canonicalReferenceUrl, fit: "hold" };
    else throw new Error(`Slot ${slotId} has no picture source and there is no earlier frame to carry.`);
    previousSlotId = slotId;
    return { slotId, source };
  });
}
