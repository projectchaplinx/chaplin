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
  {
    id: "great-train-robbery-pursuit-showdown-690-780",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:The_Great_Train_Robbery_(1903).webm",
    studyTitle: "Empty route -> pursuit -> concealed threat -> showdown",
    workTitle: "The Great Train Robbery (1903)",
    sceneLocator: "Wikimedia viewing file 11:30-13:00",
    durationSeconds: 90,
    periodLabel: "United States, 1903",
    region: "Wooded exterior, United States",
    tags: ["public-domain-scene", "action", "camera", "blocking", "editing", "geography", "suspense", "1900s"],
    observations: [
      {
        startSecond: 0,
        endSecond: 8,
        evidence: "A fixed wide view holds an empty diagonal forest path before riders enter from deep background.",
        craft: "The path, tree rows, and open foreground create a readable travel axis before speed arrives.",
        transition: "The sequence begins on absence and environmental geometry rather than immediate action.",
        narrativeJob: "Let the audience learn the route and anticipate an arrival.",
        inference: "Holding an empty route briefly can turn geography into suspense when an expected force has not yet entered.",
        confidence: "high",
      },
      {
        startSecond: 8,
        endSecond: 22,
        evidence: "The mounted posse advances from background to foreground in staggered depth, with lead riders crossing closest to camera while others remain visible behind.",
        craft: "Static camera; diagonal approach separates riders by scale and preserves group direction.",
        transition: "Off-screen expectation becomes visible forward movement without a cut.",
        narrativeJob: "Establish pursuit force, number, speed, and direction in one spatially complete image.",
        inference: "A deep approach can communicate scale and acceleration through changing figure size while the camera preserves orientation.",
        confidence: "high",
      },
      {
        startSecond: 22,
        endSecond: 37.5,
        evidence: "Successive riders clear the foreground and exit while trailing riders complete the same path, allowing the frame to empty again.",
        craft: "Entrances and exits provide internal punctuation inside the held wide shot.",
        transition: "The group passes the spectator and transfers momentum toward the next location.",
        narrativeJob: "Complete the pursuit vector rather than cutting away before the last spatial fact lands.",
        inference: "Let the final member clear a route when the audience needs certainty about group direction and destination.",
        confidence: "high",
      },
      {
        startSecond: 37.5,
        endSecond: 48.4,
        evidence: "A hard cut reveals the fugitives clustered low in a separate clearing, handling the stolen goods while horses remain stationed in the background.",
        craft: "Fixed wide tableau layers loot activity in the foreground and escape capability in the background.",
        transition: "The pursuers' exit direction is answered by the fugitives' vulnerable pause.",
        narrativeJob: "Transfer attention from advancing threat to an unaware target and expose the target's current priority.",
        inference: "A pursuit handoff gains tension when the incoming location shows the quarry occupied before the threat arrives.",
        confidence: "high",
      },
      {
        startSecond: 48.4,
        endSecond: 58.8,
        evidence: "The fugitives continue sorting and dividing the goods while the clearing remains visually open around them.",
        craft: "Duration, not camera movement, makes their exposure and delayed awareness legible.",
        transition: "The shot withholds the pursuers and lets the target activity continue past the point of comfort.",
        narrativeJob: "Build a window of vulnerability before the confrontation.",
        inference: "When the threat location is already known, sustained ordinary task behavior can build suspense more clearly than premature cutting.",
        confidence: "medium",
      },
      {
        startSecond: 58.8,
        endSecond: 76,
        evidence: "Gunfire and smoke enter the tableau; standing figures separate, return fire, change levels, and begin to fall while the horses remain a stable background landmark.",
        craft: "Static wide framing lets smoke bursts, body height, and lateral displacement register as distinct state changes.",
        transition: "The concealed pursuit force becomes an active attack inside the established target space.",
        narrativeJob: "Escalate from exposure to combat while retaining who occupies which area.",
        inference: "In a wide action frame, readable state changes such as standing, firing, falling, and retreating can carry intensity without faster coverage.",
        confidence: "high",
      },
      {
        startSecond: 76,
        endSecond: 86.7,
        evidence: "Repeated smoke blooms briefly obscure figures, then reveal fewer active bodies and more fallen bodies in the same clearing.",
        craft: "Occlusion is temporary; the unchanged frame supplies a before-and-after comparison after each burst clears.",
        transition: "Successive volleys reduce the number and options of the fugitives.",
        narrativeJob: "Make attrition measurable and show the confrontation reaching its outcome.",
        inference: "Smoke and impact effects remain legible when the composition gives the audience a stable baseline for counting changed body states.",
        confidence: "high",
      },
      {
        startSecond: 86.7,
        endSecond: 90,
        evidence: "The action settles into an aftermath state with survivors upright around bodies and reduced movement in the clearing.",
        craft: "The held wide shot allows the new balance of control to become readable after the final burst.",
        transition: "Combat energy resolves into a visible control and casualty state.",
        narrativeJob: "Land the action on consequence rather than ending at peak motion.",
        inference: "A short aftermath hold converts spectacle into story information by showing who remains able to act.",
        confidence: "medium",
      },
    ],
    candidatePrinciples: [
      "Before fast movement, hold a route long enough for its axis, depth, and exits to become readable; anticipation then turns geography into suspense.",
      "A static wide action shot can stay information-dense when entrances, exits, scale changes, smoke, and body-state changes continually revise the situation.",
      "Cut from pursuers completing a travel vector to the quarry occupied by a vulnerable task so the edit transfers momentum and creates dramatic irony.",
      "Treat smoke and impact effects as temporary occlusion: preserve stable landmarks so every reveal communicates a measurable change.",
      "After peak action, hold long enough to reveal survivors, casualties, control, and remaining options.",
    ],
    limitations: "Draft visual analysis of the public-domain Wikimedia 13:28 viewing file, whose timing differs from other Library of Congress and restored copies. Review used a 90-second 1 fps contact sheet plus automated scene-change detection; frame-level boundaries are rounded and two uncertain passages are marked medium confidence. The source is silent and this analysis adds no claims about exhibition accompaniment, tinting, or original projection speed.",
  },
];
