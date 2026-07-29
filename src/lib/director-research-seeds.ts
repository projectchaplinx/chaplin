import type { DirectorStudyObservation } from "@/lib/director-research";

export type DirectorResearchStudySeed = {
  id: string;
  sourceUrl: string;
  studyTitle: string;
  workTitle: string;
  sceneLocator: string;
  durationSeconds: number;
  periodLabel: string;
  region: string;
  tags: string[];
  observations: DirectorStudyObservation[];
  candidatePrinciples: string[];
  limitations: string;
};

export const DIRECTOR_RESEARCH_STUDY_SEEDS: DirectorResearchStudySeed[] = [
  {
    id: "master-hands-process-montage-180-200",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Master_Hands_full_movie.webm",
    studyTitle: "Material → worker → system → material",
    workTitle: "Master Hands (1936)",
    sceneLocator: "Wikimedia viewing file 03:00–03:20",
    durationSeconds: 20,
    periodLabel: "Flint, Michigan, 1935–1936",
    region: "Flint, Michigan, United States",
    tags: ["public-domain-scene", "editing", "camera", "blocking", "documentary", "production-design", "1930s", "industry"],
    observations: [
      {
        startSecond: 0,
        endSecond: 7.9,
        evidence: "A small molten flow grows into a bright flame against a rigid industrial grating while the frame remains fixed.",
        craft: "Tight high-angle process detail; static geometry makes the changing material legible.",
        transition: "The transformation develops inside one held shot rather than through faster cutting.",
        narrativeJob: "Establish process energy, heat, and material danger before identifying an operator.",
        inference: "Holding on a physical transformation can create momentum while preserving comprehension.",
        confidence: "high",
      },
      {
        startSecond: 7.9,
        endSecond: 12.3,
        evidence: "A hard cut reveals a worker's lower body, stance, hose, and long tool beside the same grating and active flame.",
        craft: "High angle initially withholds the face and emphasizes balance, body, tool, and hazardous floor relation.",
        transition: "The outgoing material force is answered by the person controlling it.",
        narrativeJob: "Convert an abstract industrial force into readable human action and responsibility.",
        inference: "A causal cut can answer 'who or what controls this force?' without repeating the prior image.",
        confidence: "high",
      },
      {
        startSecond: 12.3,
        endSecond: 15,
        evidence: "A bright flare partially obscures and then reveals more of the standing worker operating the long tool.",
        craft: "Medium-to-full-body industrial view uses smoke and exposure change as active foreground material.",
        transition: "The flare masks the precise boundary between views and briefly reduces spatial certainty.",
        narrativeJob: "Increase sensory intensity while retaining the worker-tool action as the anchor.",
        inference: "Motivated light or smoke can bridge a scale change when the continuing action remains identifiable.",
        confidence: "medium",
      },
      {
        startSecond: 15,
        endSecond: 17.4,
        evidence: "A wider view makes the worker small inside a larger field of platforms, machinery, smoke, and hard industrial edges.",
        craft: "Static wide scale reset; human figure supplies proportion within the production system.",
        transition: "Cut from bodily operation to environmental scale.",
        narrativeJob: "Re-establish where the labor sits inside the larger machine process.",
        inference: "After compressed process details, a wide scale reset restores geography and changes the meaning from individual effort to system.",
        confidence: "high",
      },
      {
        startSecond: 17.4,
        endSecond: 20,
        evidence: "The sequence returns to a tight view of flame and the tool or nozzle producing it.",
        craft: "Close process detail removes most surrounding geography but retains the established force and tool relationship.",
        transition: "Wide system view cuts back to elemental material action.",
        narrativeJob: "Land the sequence on the transformed material process after human and system context are understood.",
        inference: "A process montage can cycle detail → operator → system → detail, with each return carrying more context.",
        confidence: "high",
      },
    ],
    candidatePrinciples: [
      "In process montage, alternate material transformation, worker-tool relation, and system-wide scale so energy never outruns comprehension.",
      "A hard cut becomes causal when the incoming shot reveals the human or machine producing the force shown immediately before it.",
      "Let a physical transformation build within a held shot; cut when the audience needs a new causal or spatial fact.",
      "After compressed action details, use a wide scale reset to restore geography and redefine the individual action inside its larger system.",
    ],
    limitations: "Draft analysis of the public-domain Wikimedia 27:20 viewing file, not the differently timed Library of Congress copy. Visual review used a 20-second research extract, a 2 fps contact sheet, and automated change detection. Audio was excluded, so no score or sound claims are made. The flare around 12.3 seconds makes the exact transition boundary uncertain and is marked medium confidence.",
  },
];
