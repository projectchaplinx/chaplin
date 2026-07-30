import type { DirectorSourceKind } from "@/lib/director-research";

export type DirectorResearchTrack = "film-craft" | "public-domain-scene" | "period-world" | "ai-production";
export type DirectorResearchPriority = "now" | "next" | "later";

export type DirectorResearchCampaignItem = {
  id: string;
  track: DirectorResearchTrack;
  title: string;
  institution: string;
  sourceUrl: string;
  sourceKind: DirectorSourceKind;
  rightsBasis: string;
  accessNotes: string;
  targetTags: string[];
  researchQuestions: string[];
  priority: DirectorResearchPriority;
  periodLabel?: string;
  region?: string;
};

export type DirectorResearchCoverageTarget = {
  id: string;
  label: string;
  track: DirectorResearchTrack;
  targetApprovedStudies: number;
  reason: string;
};

export const DIRECTOR_RESEARCH_CAMPAIGN_VERSION = "2026.07.30-c";

export const DIRECTOR_RESEARCH_COVERAGE_TARGETS: DirectorResearchCoverageTarget[] = [
  { id: "story", label: "Story change", track: "film-craft", targetApprovedStudies: 12, reason: "Objectives, tactics, reversals, choices, and consequences." },
  { id: "camera", label: "Camera and lens", track: "film-craft", targetApprovedStudies: 12, reason: "Position, distance, lens behavior, movement, and motivated reframing." },
  { id: "blocking", label: "Blocking and geography", track: "film-craft", targetApprovedStudies: 10, reason: "Actor movement, spatial relations, eyelines, and readable action." },
  { id: "editing", label: "Editing and rhythm", track: "film-craft", targetApprovedStudies: 10, reason: "Cut cause, consequence, duration, compression, and release." },
  { id: "sound", label: "Sound and music", track: "film-craft", targetApprovedStudies: 10, reason: "Perspective, ambience, bridges, silence, dialogue, and score." },
  { id: "performance", label: "Screen performance", track: "film-craft", targetApprovedStudies: 8, reason: "Physical tactics, stillness, reaction, status, and interaction with space." },
  { id: "production-design", label: "Production design", track: "film-craft", targetApprovedStudies: 8, reason: "Story-bearing space, objects, surface, palette, and practical constraints." },
  { id: "costume", label: "Costume and makeup", track: "film-craft", targetApprovedStudies: 8, reason: "Silhouette, class, occupation, wear, transformation, and continuity." },
  { id: "period", label: "Historical worlds", track: "period-world", targetApprovedStudies: 24, reason: "Time × region × community × role, with explicit anachronism checks." },
  { id: "public-domain-scene", label: "Timed scene studies", track: "public-domain-scene", targetApprovedStudies: 20, reason: "Second-by-second evidence from rights-cleared moving-image works." },
  { id: "ai", label: "AI production controls", track: "ai-production", targetApprovedStudies: 20, reason: "Dated, model-specific capabilities, limits, cost, latency, and continuity tests." },
];

export const DIRECTOR_RESEARCH_CAMPAIGN: DirectorResearchCampaignItem[] = [
  {
    id: "academy-craft-guides",
    track: "film-craft",
    title: "Academy Teachers Guide Series",
    institution: "Academy of Motion Picture Arts and Sciences",
    sourceUrl: "https://www.oscars.org/education-grants/teachers-guide-series",
    sourceKind: "institutional",
    rightsBasis: "Official Academy educational material used for analytical craft research; no expressive film content is copied.",
    accessNotes: "Index includes guides for editing, art direction, costume, makeup, sound and music, animation, documentary, screenwriting, and visual effects.",
    targetTags: ["editing", "sound", "production-design", "costume", "vfx", "story"],
    researchQuestions: [
      "Which observable choices define each department's narrative contribution?",
      "Which continuity checks should be measurable before a generated shot is approved?",
    ],
    priority: "now",
  },
  {
    id: "asc-camera-movement",
    track: "film-craft",
    title: "Shot Craft: Tools for Camera Movement",
    institution: "American Society of Cinematographers",
    sourceUrl: "https://theasc.com/articles/shot-craft-camera-movement",
    sourceKind: "institutional",
    rightsBasis: "Official ASC craft article analyzed for reusable relationships; quotations and protected scene expression are not stored.",
    accessNotes: "Research movement purpose, physical tool behavior, operator constraints, and motivated transitions.",
    targetTags: ["camera", "blocking", "movement", "geography"],
    researchQuestions: [
      "What story change motivates a dolly, crane, handheld, or stabilized move?",
      "How should actor marks and camera correction interact without making performance mechanical?",
    ],
    priority: "now",
  },
  {
    id: "asc-location-blocking",
    track: "film-craft",
    title: "John Bailey, ASC: Inside the Outsider",
    institution: "American Society of Cinematographers",
    sourceUrl: "https://theasc.com/articles/john-bailey-asc-inside-the-outsider",
    sourceKind: "filmmaker-interview",
    rightsBasis: "Official ASC filmmaker interview analyzed for abstract craft relationships; no film scene is reconstructed.",
    accessNotes: "Focus on how location, actor choreography, camera, and lighting decisions constrain one another.",
    targetTags: ["blocking", "performance", "camera", "production-design"],
    researchQuestions: [
      "How does location determine playable actor behavior before camera placement?",
      "Which camera constraints protect performance rather than forcing it?",
    ],
    priority: "now",
  },
  {
    id: "loc-public-domain-registry",
    track: "public-domain-scene",
    title: "Public Domain Films from the National Film Registry",
    institution: "Library of Congress",
    sourceUrl: "https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry",
    sourceKind: "public-domain",
    rightsBasis: "The Library of Congress identifies this curated selection as public-domain films that are free to use and reuse; item-level rights notes remain mandatory.",
    accessNotes: "Use as the primary timed-analysis pool. Preserve item URL, access date, rights statement, and exact scene locator.",
    targetTags: ["public-domain-scene", "editing", "camera", "sound", "performance", "period"],
    researchQuestions: [
      "Which seconds change information, tactic, geography, rhythm, or attention?",
      "How do silent, documentary, animation, industrial, and narrative forms solve different problems?",
    ],
    priority: "now",
  },
  {
    id: "loc-great-train-robbery",
    track: "public-domain-scene",
    title: "The Great Train Robbery (1903)",
    institution: "Library of Congress",
    sourceUrl: "https://www.loc.gov/item/00694220/",
    sourceKind: "public-domain",
    rightsBasis: "Listed by the Library of Congress in its public-domain National Film Registry collection; verify the item record before any source-file reuse.",
    accessNotes: "Timed study target: spatial continuity, staging in depth, action legibility, and scene-to-scene escalation.",
    targetTags: ["public-domain-scene", "action", "camera", "blocking", "editing", "1900s"],
    researchQuestions: [
      "How is action geography communicated before continuity editing conventions stabilized?",
      "Which tableau changes carry cause and consequence without close coverage?",
    ],
    priority: "now",
    periodLabel: "United States, 1903",
    region: "United States",
  },
  {
    id: "commons-great-train-robbery-viewing-file",
    track: "public-domain-scene",
    title: "The Great Train Robbery full-movie viewing file",
    institution: "Wikimedia Commons / Library of Congress",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:The_Great_Train_Robbery_(1903).webm",
    sourceKind: "public-domain",
    rightsBasis: "The Wikimedia Commons file record identifies the 1903 U.S. film and digital copy as free of known copyright restrictions under the Public Domain Mark; the Library of Congress independently includes the work in its public-domain National Film Registry selection.",
    accessNotes: "Research copy verified 2026-07-30: 13:28 WebM sourced from the Library of Congress. Timed locators use this file's clock; the Library of Congress item record remains the catalog and rights cross-check.",
    targetTags: ["public-domain-scene", "action", "camera", "blocking", "editing", "geography", "1900s"],
    researchQuestions: [
      "How does static tableau staging maintain readable pursuit and combat geography without modern coverage?",
      "Which entrances, exits, depth changes, smoke events, and body-state changes provide new information inside a held shot?",
    ],
    priority: "now",
    periodLabel: "United States, 1903",
    region: "United States",
  },
  {
    id: "loc-master-hands",
    track: "public-domain-scene",
    title: "Master Hands (1936)",
    institution: "Library of Congress",
    sourceUrl: "https://www.loc.gov/item/2022600183/",
    sourceKind: "public-domain",
    rightsBasis: "Included in the Library of Congress public-domain National Film Registry selection; the item record's rights notice must be retained.",
    accessNotes: "Timed study target: industrial montage, machine-human scale, rhythmic cutting, process clarity, and orchestral counterpoint.",
    targetTags: ["public-domain-scene", "editing", "sound", "camera", "documentary", "1930s", "industry"],
    researchQuestions: [
      "How does montage make a complex process legible while sustaining momentum?",
      "How do scale changes and musical phrasing organize attention?",
    ],
    priority: "now",
    periodLabel: "Flint, Michigan, 1935–1936",
    region: "Flint, Michigan, United States",
  },
  {
    id: "commons-master-hands-viewing-file",
    track: "public-domain-scene",
    title: "Master Hands full-movie viewing file",
    institution: "Wikimedia Commons / Prelinger Archives",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Master_Hands_full_movie.webm",
    sourceKind: "public-domain",
    rightsBasis: "The Wikimedia Commons file record identifies the 1936 U.S. work as public domain because its copyright was not renewed; the Library of Congress public-domain registry listing provides a second rights reference.",
    accessNotes: "Research copy verified 2026-07-30: 27:20 WebM, 320×240. Use this file's clock for timed locators and retain the Library of Congress item URL in study limitations.",
    targetTags: ["public-domain-scene", "editing", "camera", "blocking", "documentary", "1930s", "industry"],
    researchQuestions: [
      "How does the montage alternate material transformation, worker-tool relations, and system-wide scale?",
      "Which cuts add a new causal or spatial fact, and which physical transformations build within a held shot?",
    ],
    priority: "now",
    periodLabel: "Flint, Michigan, 1935–1936",
    region: "Flint, Michigan, United States",
  },
  {
    id: "loc-hitch-hiker",
    track: "public-domain-scene",
    title: "The Hitch-Hiker (1953)",
    institution: "Library of Congress",
    sourceUrl: "https://www.loc.gov/item/mbrs00047382/",
    sourceKind: "public-domain",
    rightsBasis: "Listed in the Library of Congress public-domain National Film Registry collection; item-level rights and access notes remain binding.",
    accessNotes: "Timed study target: confined-space suspense, eyelines, off-screen threat, negative space, silence, and pressure escalation.",
    targetTags: ["public-domain-scene", "suspense", "camera", "blocking", "editing", "sound", "1950s"],
    researchQuestions: [
      "How does a confined frame keep geography readable while restricting options?",
      "When do sound, gaze, and withheld reverse angles move attention?",
    ],
    priority: "next",
    periodLabel: "United States and Mexico, early 1950s",
    region: "Southwestern United States and Baja California",
  },
  {
    id: "commons-hitch-hiker-viewing-file",
    track: "public-domain-scene",
    title: "The Hitch-Hiker full-movie viewing file",
    institution: "Wikimedia Commons / Library of Congress",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:The_Hitch-Hiker.webm",
    sourceKind: "public-domain",
    rightsBasis: "The Wikimedia Commons file record marks this U.S. film public domain in the United States and cites Library of Congress item mbrs00047382 as confirmation. Jurisdiction-specific reuse caveats remain attached to the file record.",
    accessNotes: "Research copy verified 2026-07-30: 70:58 WebM; the timed study uses 15:00-16:30 on this file's clock. Contact-sheet and audio analysis are transient; no frames, soundtrack, transcript, subtitles, or dialogue are stored in the corpus.",
    targetTags: ["public-domain-scene", "suspense", "camera", "blocking", "editing", "sound", "dialogue", "performance", "1950s", "vehicle"],
    researchQuestions: [
      "How does the car partition access, bodies, eyelines, and escape routes before the action moves into open rocks?",
      "How do sparse ambience, separated speech turns, impact sounds, and late score shape pressure without storing dialogue?",
      "Which weapon vectors, gestures, wide resets, and reaction close-ups create causal edit opportunities?",
    ],
    priority: "now",
    periodLabel: "United States and Mexico, early 1950s",
    region: "Southwestern United States and Baja California",
  },
  {
    id: "met-roman-housing",
    track: "period-world",
    title: "Roman Housing",
    institution: "The Metropolitan Museum of Art",
    sourceUrl: "https://www.metmuseum.org/essays/roman-housing",
    sourceKind: "institutional",
    rightsBasis: "Metropolitan Museum scholarly essay used as historical evidence with source attribution; no object image is redistributed.",
    accessNotes: "Distinguish elite domus and villas, urban insulae, rural farms, and worker housing before defining a Roman interior.",
    targetTags: ["period", "production-design", "architecture", "rome", "first-century"],
    researchQuestions: [
      "How do class, work, and geography alter Roman domestic space?",
      "Which materials, circulation patterns, displays, hazards, and light sources are evidenced?",
    ],
    priority: "now",
    periodLabel: "Roman Italy, first century CE",
    region: "Italy within the Roman Empire",
  },
  {
    id: "met-edo-period",
    track: "period-world",
    title: "Art of the Edo Period (1615–1868)",
    institution: "The Metropolitan Museum of Art",
    sourceUrl: "https://www.metmuseum.org/essays/art-of-the-edo-period-1615-1868",
    sourceKind: "institutional",
    rightsBasis: "Metropolitan Museum scholarly essay and dated object records used as attributed evidence; no protected exhibition text or images are reproduced.",
    accessNotes: "Resolve year, city, class, occupation, occasion, and trade context before selecting objects or costume.",
    targetTags: ["period", "production-design", "costume", "edo", "japan"],
    researchQuestions: [
      "How do samurai, artisan, merchant, court, and performance contexts differ?",
      "Which textiles, ceramics, lacquer, screens, tools, and urban practices belong to a given date and class?",
    ],
    priority: "now",
    periodLabel: "Edo Japan, 1615–1868",
    region: "Edo, Kyoto, or Nagasaki, Japan",
  },
  {
    id: "met-mughal-court",
    track: "period-world",
    title: "The Mughal Court and the Art of Observation",
    institution: "The Metropolitan Museum of Art",
    sourceUrl: "https://www.metmuseum.org/-/media/files/learn/for%20educators/publications%20for%20educators/islamic%20teacher%20resource/unit5.pdf",
    sourceKind: "institutional",
    rightsBasis: "Metropolitan Museum educational publication used for attributed historical research; images and expressive text are not republished.",
    accessNotes: "Start with Jahangir and Shah Jahan court contexts; do not flatten Mughal India into a single pan-Indian visual preset.",
    targetTags: ["period", "production-design", "costume", "mughal", "india", "1600s"],
    researchQuestions: [
      "How do patronage, rank, court ritual, natural observation, and regional exchange shape material choices?",
      "Which precious materials, textiles, architecture, vessels, gardens, and botanical motifs are documented?",
    ],
    priority: "now",
    periodLabel: "Mughal India, 1605–1658",
    region: "Agra, Delhi, Lahore, and the Mughal court",
  },
  {
    id: "openai-sora-video-api",
    track: "ai-production",
    title: "OpenAI Video API",
    institution: "OpenAI",
    sourceUrl: "https://developers.openai.com/api/reference/resources/videos",
    sourceKind: "provider-research",
    rightsBasis: "Official public API documentation used to record dated capability and request-contract facts.",
    accessNotes: "As verified 2026-07-30: create, edit, extend, remix, character, reference-image, lifecycle, duration, and resolution contracts require separate benchmarks.",
    targetTags: ["ai", "video", "reference", "extension", "editing", "sora"],
    researchQuestions: [
      "Which identity and continuity properties survive reference, edit, extension, and remix operations?",
      "How do 4, 8, and 12-second units differ in usable motion, landing quality, latency, and cost?",
    ],
    priority: "now",
  },
  {
    id: "google-video-generation",
    track: "ai-production",
    title: "Video generation in the Gemini API",
    institution: "Google AI for Developers",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/video",
    sourceKind: "provider-research",
    rightsBasis: "Official Google API documentation used to record dated model capabilities and limitations.",
    accessNotes: "As verified 2026-07-30: compare Gemini Omni Flash with Veo 3.1 for multi-input reasoning, character consistency, conversational editing, extension, last-frame control, and native audio.",
    targetTags: ["ai", "video", "audio", "reference", "extension", "editing", "veo", "gemini"],
    researchQuestions: [
      "Which workflow should use conversational editing versus a controlled generation pipeline?",
      "How reliable are native audio, final-frame guidance, extension, and character continuity?",
    ],
    priority: "now",
  },
  {
    id: "runway-video-api",
    track: "ai-production",
    title: "Runway API Reference",
    institution: "Runway",
    sourceUrl: "https://docs.dev.runwayml.com/api/",
    sourceKind: "provider-research",
    rightsBasis: "Official Runway API documentation used for dated request-contract and capability research.",
    accessNotes: "Model availability changes quickly. Store observed model identifier, API version, date, input contract, output evidence, cost, latency, and failure modes.",
    targetTags: ["ai", "video", "reference", "camera", "motion", "runway"],
    researchQuestions: [
      "Which model and input path best preserve identity, camera intent, and a readable action landing?",
      "Which capabilities are native versus routed to third-party models through the API?",
    ],
    priority: "next",
  },
  {
    id: "adobe-firefly-video-api",
    track: "ai-production",
    title: "Adobe Firefly Generate Video API usage notes",
    institution: "Adobe",
    sourceUrl: "https://developer.adobe.com/firefly-services/docs/firefly-api/getting-started/usage-notes/",
    sourceKind: "provider-research",
    rightsBasis: "Official Adobe developer documentation used for dated request-contract, aspect-ratio, and limitation research.",
    accessNotes: "Track supported dimensions, storage constraints, commercial workflow assumptions, model/version changes, and provenance behavior.",
    targetTags: ["ai", "video", "commercial", "aspect-ratio", "firefly"],
    researchQuestions: [
      "How do supported aspect ratios and resolutions change composition reliability?",
      "Which production and provenance controls are useful for commercial delivery?",
    ],
    priority: "later",
  },
];

export function campaignTrackLabel(track: DirectorResearchTrack) {
  if (track === "film-craft") return "Film craft";
  if (track === "public-domain-scene") return "Timed public-domain scenes";
  if (track === "period-world") return "Historical worlds";
  return "AI production";
}
