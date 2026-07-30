import type { ProductionFormat } from "@/lib/production-formats";
import type { ApprovedDirectorStudyContext } from "@/lib/director-research";

export type DirectorKnowledgeDomain =
  | "story"
  | "camera"
  | "editing"
  | "action"
  | "sound"
  | "ai-production"
  | "period-world";

export type DirectorKnowledgeSource = {
  id: string;
  title: string;
  institution: string;
  url: string;
  domains: DirectorKnowledgeDomain[];
  note: string;
};

export type DirectorPattern = {
  id: string;
  name: string;
  domain: DirectorKnowledgeDomain;
  tags: string[];
  principle: string;
  application: string[];
  sourceIds: string[];
};

export type DirectorPeriodProfile = {
  id: string;
  label: string;
  dateRange: string;
  region: string;
  tags: string[];
  evidence: string[];
  visualRules: string[];
  materialRules: string[];
  soundRules: string[];
  anachronisms: string[];
  sourceIds: string[];
};

export type DirectorWorldResolution = {
  status: "not-requested" | "unresolved" | "partial" | "resolved";
  time: string | null;
  place: string | null;
  roleOrCommunity: string | null;
  seasonOrTime: string | null;
  immediateLocation: string | null;
  evidenceSourceIds: string[];
  missing: Array<"time" | "place" | "role-or-community" | "season-or-time" | "immediate-location">;
};
export type DirectorBrainTrace = {
  version: string;
  query: {
    format: ProductionFormat;
    durationSeconds: number;
    sceneCount: number;
    brief: string;
  };
  signals: string[];
  patternIds: string[];
  periodProfileId: string | null;
  worldResolution?: DirectorWorldResolution;
  sourceIds: string[];
  approvedStudies: ApprovedDirectorStudyContext[];
  warnings: string[];
  selectionReasons: string[];
  attentionMap: Array<{
    second: number;
    phase: string;
    job: string;
  }>;
};

export const DIRECTOR_BRAIN_VERSION = "2026.07.30-f";

export const DIRECTOR_BRAIN_POLICY = [
  "Learn reusable craft relationships, never reproduce a screenplay, transcript, shot list, or scene verbatim.",
  "Keep every learned rule attached to its source and domain.",
  "Treat a movie title as an analysis target, not as permission to imitate its protected expression.",
  "Separate observed evidence from interpretation and from a generated production decision.",
  "Historical direction must resolve time, place, social context, and available materials before visual generation.",
] as const;

export const DIRECTOR_SOURCES: DirectorKnowledgeSource[] = [
  {
    id: "asc-script-analysis",
    title: "Shot Craft: Analyzing a Script",
    institution: "American Society of Cinematographers",
    url: "https://theasc.com/articles/shot-craft-analyzing-a-script",
    domains: ["story", "camera"],
    note: "Objectives, tactics, beat changes, lookbooks, and scene-by-scene visual analysis.",
  },
  {
    id: "asc-camera-geography",
    title: "Shot Craft: Where Do You Put the Camera?",
    institution: "American Society of Cinematographers",
    url: "https://theasc.com/articles/shot-craft-where-do-you-put-the-camera",
    domains: ["camera", "action"],
    note: "Camera placement begins with readable geography, especially during action.",
  },
  {
    id: "asc-rhythm-tempo",
    title: "Rhythm and Tempo: Mickey 17",
    institution: "American Society of Cinematographers",
    url: "https://theasc.com/articles/rhythm-tempo-mickey-17-bong-joon-ho",
    domains: ["camera", "editing"],
    note: "Composition, lensing, light, and shadow establish rhythm before the edit.",
  },
  {
    id: "asc-rrr-previs",
    title: "Shooting Stars for RRR",
    institution: "American Society of Cinematographers",
    url: "https://theasc.com/articles/shooting-stars-for-rrr",
    domains: ["action", "camera"],
    note: "Complex action is aligned through storyboards, previs, and stuntvis before capture.",
  },
  {
    id: "academy-editing",
    title: "The Art and Science of Film Editing",
    institution: "Academy of Motion Picture Arts and Sciences",
    url: "https://www.oscars.org/sites/oscars/files/complet_film_editing_activities_guide.pdf",
    domains: ["editing", "story", "sound"],
    note: "Shot order and duration establish mood, action, rhythm, time, and space.",
  },
  {
    id: "loc-look-collection",
    title: "Look Magazine Photograph Collection",
    institution: "Library of Congress",
    url: "https://www.loc.gov/item/94837687/",
    domains: ["period-world"],
    note: "Millions of dated photographs documenting 1950-1970 clothing, cities, homes, work, transport, and customs.",
  },
  {
    id: "loc-json-api",
    title: "JSON/YAML for loc.gov",
    institution: "Library of Congress",
    url: "https://www.loc.gov/apis/json-and-yaml/",
    domains: ["period-world"],
    note: "Structured discovery of dated photographs, films, maps, metadata, rights notes, locations, and collection records without scraping.",
  },
  {
    id: "loc-pittsburgh-1955",
    title: "Pittsburgh Photographic Essay, 1955-56",
    institution: "Library of Congress",
    url: "https://www.loc.gov/item/2005682181/",
    domains: ["period-world"],
    note: "Dated urban evidence for streets, shops, industry, houses, labor, and public life.",
  },
  {
    id: "loc-nyc-streets",
    title: "New York World-Telegram & Sun Staff Photos",
    institution: "Library of Congress",
    url: "https://blogs.loc.gov/picturethis/2015/12/taking-to-the-streets-new-york-world-telegram-sun-staff-photos/",
    domains: ["period-world"],
    note: "Observed New York faces, streets, events, and everyday life through the 1960s.",
  },
  {
    id: "lapl-photo-collection",
    title: "Los Angeles Public Library Photo Collection",
    institution: "Los Angeles Public Library",
    url: "https://tessa.lapl.org/photocol",
    domains: ["period-world"],
    note: "Dated photographs document Southern California life with an emphasis on Los Angeles, across neighborhoods, work, streets, buildings, transport, and communities.",
  },
  {
    id: "lapl-sunset-strip-1976",
    title: "Sunset Strip, April 1976",
    institution: "Los Angeles Public Library",
    url: "https://tessa2.lapl.org/digital/collection/photos/id/137167/",
    domains: ["period-world"],
    note: "A dated color street record identifies automobiles, commercial buildings, billboards, street signs, stores, street lighting, and sidewalks at Sunset Boulevard and Sunset Plaza Drive.",
  },
  {
    id: "loc-la-used-cars-1970s",
    title: "Giant Felix Used Cars, Los Angeles",
    institution: "Library of Congress",
    url: "https://www.loc.gov/pictures/item/2017707618/",
    domains: ["period-world"],
    note: "A 1977 color-slide record documents a Los Angeles automobile dealership, roadside sign, pumps, and commercial street context.",
  },
  {
    id: "lapl-echo-park-1976",
    title: "Echo Park, October 1976",
    institution: "Los Angeles Public Library",
    url: "https://tessa2.lapl.org/digital/collection/photos/id/137719/",
    domains: ["period-world"],
    note: "A dated neighborhood view records homes, apartments, businesses, a church, market, bank, billboards, overhead wires, automobiles, and traffic.",
  },
  {
    id: "lapl-hollywood-sunset-1976",
    title: "La Brea and Sunset, October 1976",
    institution: "Los Angeles Public Library",
    url: "https://tessa2.lapl.org/digital/collection/photos/id/137028/",
    domains: ["period-world"],
    note: "A sunset view of a Hollywood intersection records traffic, buses, offices, automobiles, street lighting, and recording-industry businesses.",
  },
  {
    id: "met-uruk",
    title: "Uruk: The First City",
    institution: "The Metropolitan Museum of Art",
    url: "https://www.metmuseum.org/essays/uruk-the-first-city",
    domains: ["period-world"],
    note: "Evidence for southern Mesopotamia around 3500-2900 BCE, including urban form, mud brick, clay, trade, and administration.",
  },
  {
    id: "met-collection-api",
    title: "The Met Collection API",
    institution: "The Metropolitan Museum of Art",
    url: "https://metmuseum.github.io/",
    domains: ["period-world"],
    note: "Open-access object records expose culture, object dates, geography, medium, dimensions, and image availability for evidence-led material research.",
  },
  {
    id: "met-old-kingdom",
    title: "Egypt in the Old Kingdom",
    institution: "The Metropolitan Museum of Art",
    url: "https://www.metmuseum.org/essays/egypt-in-the-old-kingdom-ca-2649-2150-b-c",
    domains: ["period-world"],
    note: "Evidence for Egyptian architecture, settlement hierarchy, materials, painted relief, and social organization after ca. 2650 BCE.",
  },
  {
    id: "bytedance-seedance",
    title: "Seedance 1.0 Technical Report",
    institution: "ByteDance Seed",
    url: "https://seed.bytedance.com/en/public_papers/seedance-1-0-exploring-the-boundaries-of-video-generation-models",
    domains: ["ai-production"],
    note: "Native multi-shot generation, multimodal conditioning, prompt following, and model limitations are evaluated as production capabilities.",
  },
  {
    id: "deepmind-veo",
    title: "Veo",
    institution: "Google DeepMind",
    url: "https://deepmind.google/technologies/veo/",
    domains: ["ai-production", "sound"],
    note: "Reference-conditioned video, native audio, prompt adherence, scene extension, and first/last-frame controls.",
  },
  {
    id: "runway-control",
    title: "More Control, Fidelity and Expressibility",
    institution: "Runway",
    url: "https://runwayml.com/research/more-control-fidelity-and-expressibility",
    domains: ["ai-production", "camera"],
    note: "Subject motion, camera motion, and style are separate control surfaces.",
  },
  {
    id: "filmbench-v2",
    title: "FilmBench v2: Benchmarking Image-to-Video Models for Film-Grade Video Generation",
    institution: "Beijing Film Academy and collaborators",
    url: "https://arxiv.org/abs/2607.24241",
    domains: ["ai-production", "camera", "editing", "sound"],
    note: "Film-grade evaluation separates instruction following, temporal continuity, and aesthetic quality across shot, performance, world, edit, and audio dimensions.",
  },
];

export const DIRECTOR_PATTERNS: DirectorPattern[] = [
  {
    id: "beat-before-shot",
    name: "Change the tactic before changing the shot",
    domain: "story",
    tags: ["all", "dialogue", "drama", "action"],
    principle: "A beat is a new attempt to achieve an objective. A new shot must reveal or intensify that change, not merely rephrase the previous moment.",
    application: [
      "Name the objective, tactic, obstacle, and resulting change for every scene slot.",
      "Reject adjacent slots that preserve the same tactic and outcome.",
      "Let camera distance or angle change because power, knowledge, or intimacy changed.",
    ],
    sourceIds: ["asc-script-analysis"],
  },
  {
    id: "action-geography",
    name: "Geography before velocity",
    domain: "action",
    tags: ["action", "chase", "pursuit", "vehicle", "fight", "escape"],
    principle: "The audience must understand where people, exits, obstacles, and objectives are before speed or fragmentation increases.",
    application: [
      "Establish destination, threat, obstacle, and screen direction before acceleration.",
      "Preserve the travel axis across adjacent shots unless reversal is the story event.",
      "Each action shot carries one cause, one response, and one new spatial fact.",
    ],
    sourceIds: ["asc-camera-geography", "academy-editing"],
  },
  {
    id: "action-escalation-ladder",
    name: "Escalate cost, not noise",
    domain: "action",
    tags: ["action", "chase", "pursuit", "vehicle", "fight", "rescue"],
    principle: "Action remains legible when each beat removes an option, changes the route, exposes character, or increases a specific cost.",
    application: [
      "Open with a readable goal and constraint.",
      "Escalate through route loss, tool loss, time loss, or moral cost.",
      "Land on a choice or reversal rather than a larger generic impact.",
    ],
    sourceIds: ["asc-rrr-previs", "asc-script-analysis"],
  },
  {
    id: "rhythm-designed-in-frame",
    name: "Design rhythm before the cut",
    domain: "editing",
    tags: ["all", "pacing", "suspense", "dialogue", "action"],
    principle: "Frame size, lens, light-dark balance, actor movement, and camera movement already set tempo before editorial duration is chosen.",
    application: [
      "Assign every shot an information-release moment and a visual landing.",
      "Use stillness as a deliberate contrast, not as empty time.",
      "Vary visual density and shot duration around story changes rather than on a mechanical beat.",
    ],
    sourceIds: ["asc-rhythm-tempo", "academy-editing"],
  },
  {
    id: "causal-cut",
    name: "Cut on causality",
    domain: "editing",
    tags: ["all", "action", "suspense", "comedy"],
    principle: "A cut is strongest when the outgoing shot creates a question, force, sound, eyeline, or motion that the incoming shot answers or redirects.",
    application: [
      "Record the outgoing cause and incoming consequence for every edit.",
      "Prefer eyeline, movement, object, or sound bridges over unrelated spectacle.",
      "Do not repeat establishing information after the audience already understands it.",
    ],
    sourceIds: ["academy-editing", "asc-script-analysis"],
  },
  {
    id: "sound-perspective",
    name: "Sound carries space and attention",
    domain: "sound",
    tags: ["all", "action", "suspense", "period"],
    principle: "Room tone, perspective, off-screen cues, and bridges tell the audience what is near, distant, continuous, or newly dangerous.",
    application: [
      "Define diegetic ambience by location and microphone perspective.",
      "Give every important off-screen sound a physical source.",
      "Bridge cuts with continuous ambience or a motivated cue; reserve silence for a story event.",
    ],
    sourceIds: ["academy-editing", "deepmind-veo"],
  },
  {
    id: "ai-atomic-shot",
    name: "Generate one controllable shot at a time",
    domain: "ai-production",
    tags: ["all", "ai", "single-shot"],
    principle: "Identity and physics remain more controllable when a generated unit has one framing, one subject action, one camera path, and one landing.",
    application: [
      "Bind a reviewed first frame before motion generation.",
      "Separate subject motion, camera motion, dialogue, effects, and score into explicit controls.",
      "Use native multi-shot generation only when the model and product mode explicitly support it; otherwise cut approved atomic shots.",
    ],
    sourceIds: ["runway-control", "bytedance-seedance", "deepmind-veo"],
  },
  {
    id: "ai-reference-chain",
    name: "Carry references through the sequence",
    domain: "ai-production",
    tags: ["all", "ai", "continuity", "multi-shot"],
    principle: "A sequence needs binding identity, wardrobe, prop, spatial, and style references; text alone is not a reliable continuity system.",
    application: [
      "Attach canonical actor and product references to every relevant shot.",
      "Carry an approved landing frame into the next shot when geography matters.",
      "Log the exact reference assets and rules used for each generation.",
    ],
    sourceIds: ["bytedance-seedance", "deepmind-veo", "runway-control"],
  },
  {
    id: "period-evidence-gate",
    name: "Time plus place before period styling",
    domain: "period-world",
    tags: ["period", "history", "1950s", "1960s", "ancient"],
    principle: "A year is not a look. Historical direction must identify geography, season, class or occupation, and specific evidence before selecting dress, architecture, transport, objects, or sound.",
    application: [
      "Ask for region when the brief supplies only a date.",
      "Prefer dated photographs, museum objects, excavation evidence, and institutional collections.",
      "List forbidden anachronisms explicitly and keep uncertain details out of the frame.",
    ],
    sourceIds: ["loc-look-collection", "met-uruk", "met-old-kingdom"],
  },
];

export const DIRECTOR_PERIOD_PROFILES: DirectorPeriodProfile[] = [
  {
    id: "us-1950s-observed",
    label: "United States, observed 1950s",
    dateRange: "1950-1959",
    region: "United States; city and social context must still be specified",
    tags: ["1950", "1950s", "fifties", "mid-century", "postwar"],
    evidence: [
      "Dated documentary and magazine photographs rather than a generic retro palette.",
      "Street, home, shop, workplace, vehicle, clothing, and public-life evidence should match the named city and year.",
    ],
    visualRules: [
      "Build the location from observed street width, storefront density, signage scale, traffic mix, interiors, and practical light in dated references.",
      "Treat black-and-white capture, color stock, television imagery, and modern digital recreation as different image languages.",
    ],
    materialRules: [
      "Select clothing, appliances, furniture, vehicles, packaging, and print only after location, year, occupation, and income context are known.",
      "Weathering and repair must match the object's age in the story; period does not mean every object is new.",
    ],
    soundRules: [
      "Use the actual room, street, engine, public-address, telephone, radio, and mechanical sources present in the scene.",
      "Do not add a stereotyped period song as shorthand unless music is licensed and story-motivated.",
    ],
    anachronisms: ["modern LED fixtures", "contemporary road markings", "late-model vehicles", "modern plastic packaging", "digital displays", "generic diner shorthand without location evidence"],
    sourceIds: ["loc-look-collection", "loc-pittsburgh-1955"],
  },
  {
    id: "us-1960s-observed",
    label: "United States, observed 1960s",
    dateRange: "1960-1969",
    region: "United States; city, year, community, and social context must still be specified",
    tags: ["1960", "1960s", "sixties", "mid-century"],
    evidence: [
      "Use dated street and magazine photography to distinguish 1960 from 1969 and one community from another.",
      "Cars, shop fronts, interiors, work, clothing, and public events should be selected from the named place and year.",
    ],
    visualRules: [
      "Do not collapse the decade into psychedelic color; ordinary life remains location- and class-specific.",
      "Choose capture language independently from production design: documentary monochrome, news photography, home film, and polished color cinema are different looks.",
    ],
    materialRules: [
      "Verify vehicle year, street furniture, telephones, televisions, office equipment, print, textiles, and hair against dated evidence.",
      "Use era wear: older 1940s and 1950s objects can remain in service; not every object was manufactured in the scene year.",
    ],
    soundRules: [
      "Build traffic, engines, transit, room appliances, radio, telephones, crowds, and public-address systems from visible sources.",
      "Keep music separate from historical ambience and verify rights before using a period recording.",
    ],
    anachronisms: ["modern LEDs", "smartphones", "digital signage", "contemporary vehicle safety lights", "current road furniture", "decade-wide psychedelic styling without story evidence"],
    sourceIds: ["loc-look-collection", "loc-nyc-streets"],
  },
  {
    id: "us-1970s-los-angeles",
    label: "Los Angeles, observed 1970s",
    dateRange: "1970-1979",
    region: "Los Angeles, California; exact year, neighborhood, community, occupation, and occasion must still be specified",
    tags: ["1970", "1970s", "seventies"],
    evidence: [
      "Use dated Los Angeles Public Library photographs to resolve the exact street, neighborhood, community, work, clothing, signage, transport, and public-life context.",
      "A 1976 Sunset Strip record exposes automobiles, commercial buildings, billboards, street signs, shops, street lighting, and sidewalks as separate evidence fields rather than one retro impression.",
      "The Library of Congress roadside archive supplies dated Los Angeles automotive-business and streetside references from the decade.",
    ],
    visualRules: [
      "Treat Los Angeles as many distinct neighborhoods and working environments; do not substitute a single Hollywood or Sunset Strip look for the whole city.",
      "Separate period production design from capture language. Dated color slides, newspaper photography, television news, 16mm documentary, and polished narrative cinema are not interchangeable grades.",
    ],
    materialRules: [
      "Verify vehicle model year, accumulated wear, plates, fuel and service equipment, road furniture, shop signage, tools, telephones, print, clothing, and hair against the named year and occupation.",
      "Allow older vehicles, buildings, and tools to remain in service; a 1974 street is not composed only of objects manufactured in 1974.",
    ],
    soundRules: [
      "Build the location from physically present engines, tires, horns, workshop tools, ventilation, radios, telephones, traffic distance, aircraft, crowds, and room reflections.",
      "Keep licensed music and score separate from historical ambience; a popular song is not a substitute for the sound of a real Los Angeles location.",
    ],
    anachronisms: ["smartphones", "LED signs and fixtures", "modern vehicle lighting", "current road furniture", "contemporary plates", "digital diagnostic tools", "all-purpose orange retro grade", "empty streets where the selected location evidence shows active public life"],
    sourceIds: [
      "lapl-photo-collection",
      "lapl-sunset-strip-1976",
      "lapl-echo-park-1976",
      "lapl-hollywood-sunset-1976",
      "loc-la-used-cars-1970s",
    ],
  },
  {
    id: "uruk-3000-bce",
    label: "Southern Mesopotamia around 3000 BCE",
    dateRange: "ca. 3200-2900 BCE",
    region: "Uruk and southern Mesopotamia",
    tags: ["3000 bc", "3000 bce", "uruk", "sumer", "sumerian", "mesopotamia"],
    evidence: [
      "Uruk was a large riverine city with monumental mud-brick buildings and painted clay-cone wall mosaics.",
      "Administrative clay tablets, cylinder-seal impressions, agriculture, animals, trade, and imported luxury materials are evidenced.",
    ],
    visualRules: [
      "Stage urban scale through mud-brick mass, courtyards, controlled thresholds, river and canal geography, and labor rather than fantasy ruins.",
      "Use the sun, shade, dust, smoke, oil flame, and reflected earth surfaces as motivated light.",
    ],
    materialRules: [
      "Prioritize clay, mud brick, reeds, woven fiber, stone where imported or locally available, seal objects, and evidence-based containers.",
      "Treat rare materials as trade goods with status and story consequences, not ordinary set dressing.",
    ],
    soundRules: [
      "Build ambience from people, animals, water, wind, feet on earth, hand tools, pottery, fiber, fire, and ritual or work only when story-evidenced.",
      "No generic orchestral ancient-world bed; music requires a separately researched instrument and performance context.",
    ],
    anachronisms: ["iron-age weapons", "Roman or Greek columns", "medieval markets", "glass windows", "modern woven patterns", "fantasy armor", "Egyptian monuments used as generic ancient shorthand"],
    sourceIds: ["met-uruk"],
  },
  {
    id: "egypt-old-kingdom",
    label: "Egypt, early Old Kingdom reference",
    dateRange: "ca. 2650-2500 BCE",
    region: "Egypt; settlement and social role must be specified",
    tags: ["old kingdom", "ancient egypt", "egypt 3000 bc", "egypt 3000 bce", "pyramid age"],
    evidence: [
      "Mud-brick mastabas preceded and accompanied increasingly monumental stone funerary complexes.",
      "Architecture, painted relief, statues, agriculture, offerings, and a highly stratified administration are evidenced.",
    ],
    visualRules: [
      "Do not place every Egyptian story beside a finished Giza pyramid; select settlement, river edge, field, workshop, tomb, or court from the exact period.",
      "Separate lived architecture from funerary representation and idealized art conventions.",
    ],
    materialRules: [
      "Use mud brick, stone in appropriate monumental contexts, wood, fiber, pigment, food, tools, and containers based on role and location.",
      "Do not infer later New Kingdom objects, crowns, or temple forms backward.",
    ],
    soundRules: [
      "Build sound from the Nile edge, agriculture, animals, stone or mud-brick work, hand tools, people, and enclosed chamber acoustics as visible.",
      "Do not use a generic Hollywood ancient-Egypt score as documentary ambience.",
    ],
    anachronisms: ["New Kingdom iconography", "Roman Egypt", "Greek dress", "steel tools", "modern desert-tourism imagery", "all scenes staged at pyramids"],
    sourceIds: ["met-old-kingdom"],
  },
];

const SIGNAL_RULES: Array<{ id: string; expression: RegExp }> = [
  { id: "action", expression: /\b(action|fight|battle|attack|combat|explosion|rescue|stunt)\b/i },
  { id: "chase", expression: /\b(chase|pursuit|escape|flee|run down|tailing)\b/i },
  { id: "vehicle", expression: /\b(car|cars|vehicle|motorcycle|bike|truck|highway|road|driver|driving)\b/i },
  { id: "suspense", expression: /\b(suspense|tension|stalk|secret|trap|threat|mystery|heist)\b/i },
  { id: "comedy", expression: /\b(comedy|comic|funny|joke|awkward|farce)\b/i },
  { id: "dialogue", expression: /\b(dialogue|conversation|argument|confession|interview|negotiation)\b/i },
  { id: "history", expression: /\b(history|historical|period|ancient|bc|bce|1950|1960|1970s|197\d|fifties|sixties|seventies)\b/i },
  { id: "ai", expression: /\b(ai|generated|seedance|veo|runway|video model|image to video)\b/i },
];

function unique(values: string[]) {
  return [...new Set(values)];
}

const FIFTEEN_SECOND_ATTENTION = [
  ["hook", "Interrupt the expected image or action."],
  ["orientation", "Make the subject, place, and immediate situation readable."],
  ["objective", "Reveal what the lead is trying to change."],
  ["obstacle", "Put a specific obstacle in the route."],
  ["response", "Let action answer the obstacle, not decorate it."],
  ["cost", "Remove time, safety, leverage, or a useful option."],
  ["geography", "Refresh destination, threat, and screen direction."],
  ["pressure", "Force a more revealing tactic."],
  ["consequence", "Show what the previous action caused."],
  ["reversal", "Change who knows, controls, or can escape."],
  ["choice", "Make the character choose under the new terms."],
  ["commit", "Turn the choice into a visible physical action."],
  ["price", "Let the action create an immediate price."],
  ["cliffhanger", "Introduce the next pressure or unanswered fact."],
  ["landing", "Hold a clean final image long enough to register."],
] as const;

export function buildAttentionMap(durationSeconds: number) {
  const seconds = Math.max(1, Math.round(durationSeconds));
  if (seconds === 15) {
    return FIFTEEN_SECOND_ATTENTION.map(([phase, job], second) => ({ second, phase, job }));
  }
  if (seconds === 5) {
    return [
      { second: 0, phase: "hook", job: "Interrupt the expected image or action." },
      { second: 1, phase: "read", job: "Make subject, place, and pressure readable." },
      { second: 2, phase: "choice", job: "Reveal one casting-defining decision." },
      { second: 3, phase: "action", job: "Complete one visible, physically clear action." },
      { second: 4, phase: "landing", job: "Hold the consequence and a clean final frame." },
    ];
  }
  const phases = [
    ["hook", "Create the opening question."],
    ["orientation", "Establish objective, geography, and constraints."],
    ["escalation", "Change tactics and increase a specific cost."],
    ["reversal", "Change knowledge, control, route, or relationship."],
    ["choice", "Force and execute the defining decision."],
    ["landing", "Register consequence and open the next question."],
  ] as const;
  return Array.from({ length: seconds }, (_, second) => {
    const phaseIndex = Math.min(phases.length - 1, Math.floor((second / seconds) * phases.length));
    return { second, phase: phases[phaseIndex][0], job: phases[phaseIndex][1] };
  });
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function periodScore(profile: DirectorPeriodProfile, text: string) {
  if (
    profile.id === "us-1970s-los-angeles"
    && !/\b(los angeles|hollywood|west hollywood|sunset strip|echo park)\b/.test(text)
  ) return 0;
  const tagScore = profile.tags.reduce((score, tag) => score + (text.includes(tag) ? Math.max(2, tag.split(" ").length * 2) : 0), 0);
  const exactYearScore =
    profile.id === "us-1950s-observed" && /\b195\d\b/.test(text) ? 6
      : profile.id === "us-1960s-observed" && /\b196\d\b/.test(text) ? 6
        : profile.id === "us-1970s-los-angeles" && /\b197\d\b/.test(text) ? 6
          : 0;
  return tagScore + exactYearScore;
}

const WORLD_PLACE_PATTERNS: Array<[RegExp, string]> = [
  [/\bsunset strip\b/i, "Sunset Strip, West Hollywood, California"],
  [/\bwest hollywood\b/i, "West Hollywood, California"],
  [/\beast hollywood\b/i, "East Hollywood, Los Angeles, California"],
  [/\becho park\b/i, "Echo Park, Los Angeles, California"],
  [/\bhollywood\b/i, "Hollywood, Los Angeles, California"],
  [/\blos angeles\b/i, "Los Angeles, California"],
  [/\bnew york(?: city)?\b/i, "New York City"],
  [/\bchicago\b/i, "Chicago"],
  [/\bpittsburgh\b/i, "Pittsburgh"],
  [/\bdetroit\b/i, "Detroit"],
  [/\bsan francisco\b/i, "San Francisco"],
  [/\buruk\b/i, "Uruk, southern Mesopotamia"],
  [/\b(?:southern )?mesopotamia\b/i, "Southern Mesopotamia"],
  [/\b(?:ancient )?egypt\b/i, "Egypt"],
  [/\bunited states\b|\bu\.s\.\b|\bamerica\b/i, "United States"],
];

const WORLD_ROLE_PATTERN = /\b(mechanic|driver|clerk|worker|merchant|artisan|soldier|officer|farmer|priest|scribe|doctor|nurse|teacher|student|journalist|detective|courier|shopkeeper|performer|family|commuter|crew|community)\b/i;
const WORLD_LOCATION_PATTERN = /\b(service bay|garage|workshop|street|sidewalk|highway|freeway|road|alley|apartment|house|home|office|shop|store|market|courtyard|temple|palace|tomb|field|river edge|desert|station|airport|school|hospital|factory|warehouse)\b/i;

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function resolveDirectorWorld(
  brief: string,
  period: DirectorPeriodProfile | null,
  historyRequested: boolean,
): DirectorWorldResolution {
  const timeMatch = brief.match(/\b(?:ca\.\s*)?\d{3,4}\s*(?:bc|bce|ce|ad)?\b/i);
  const place = WORLD_PLACE_PATTERNS.find(([expression]) => expression.test(brief))?.[1] ?? null;
  const role = brief.match(WORLD_ROLE_PATTERN)?.[1] ?? null;
  const seasonOrTime = [...brief.matchAll(/\b(spring|summer|autumn|fall|winter|dawn|sunrise|morning|noon|afternoon|sunset|dusk|evening|night|midnight)\b/gi)]
    .map((match) => titleCase(match[1]))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" / ") || null;
  const immediateLocation = brief.match(WORLD_LOCATION_PATTERN)?.[1] ?? null;
  const time = timeMatch?.[0].trim() ?? (period ? period.dateRange : null);
  const missing: DirectorWorldResolution["missing"] = [];
  if (!time) missing.push("time");
  if (!place) missing.push("place");
  if (!role) missing.push("role-or-community");
  if (!seasonOrTime) missing.push("season-or-time");
  if (!immediateLocation) missing.push("immediate-location");
  const requested = historyRequested || Boolean(period || timeMatch);
  return {
    status: !requested ? "not-requested" : !period ? "unresolved" : missing.length ? "partial" : "resolved",
    time,
    place,
    roleOrCommunity: role ? titleCase(role) : null,
    seasonOrTime,
    immediateLocation: immediateLocation ? titleCase(immediateLocation) : null,
    evidenceSourceIds: period?.sourceIds ?? [],
    missing,
  };
}
export function retrieveDirectorKnowledge(input: {
  brief: string;
  format: ProductionFormat;
  durationSeconds: number;
  sceneCount: number;
}): DirectorBrainTrace {
  const text = normalize(input.brief);
  const signals = SIGNAL_RULES.filter((rule) => rule.expression.test(text)).map((rule) => rule.id);
  if (!signals.length) signals.push("story");
  const periodCandidates = DIRECTOR_PERIOD_PROFILES
    .map((profile) => ({ profile, score: periodScore(profile, text) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  let period: DirectorPeriodProfile | null = periodCandidates[0]?.profile ?? null;
  const warnings: string[] = [];

  const asksFor3000 = /\b3000\s*(?:bc|bce)\b/i.test(text);
  const namesMesopotamia = /\b(uruk|sumer|sumerian|mesopotamia)\b/i.test(text);
  const namesEgypt = /\b(egypt|egyptian|old kingdom)\b/i.test(text);
  if (asksFor3000 && !namesMesopotamia && !namesEgypt) {
    period = null;
    warnings.push("3000 BCE is not one visual world. Name a region or culture before Chaplin selects architecture, clothing, objects, or ritual.");
  }
  if (
    /\b(?:197\d|1970s|seventies)\b/i.test(text)
    && !/\b(los angeles|hollywood|west hollywood|sunset strip|echo park)\b/i.test(text)
  ) {
    warnings.push("The 1970s is not one visual world. Name a supported country, city, neighborhood, community or occupation, season or time of day, and immediate location.");
  }
  if (period?.id.startsWith("us-") && !/\b(united states|u\.s\.|america|american|new york|los angeles|chicago|pittsburgh|detroit|san francisco)\b/i.test(text)) {
    warnings.push(`${period.label} is a US reference profile, not a global decade style. Add the country, city, community, season, and social context.`);
  }

  const worldResolution = resolveDirectorWorld(input.brief, period, signals.includes("history"));

  const taggedSignals = unique([
    "all",
    ...signals,
    ...(period ? ["period", ...period.tags] : []),
    input.sceneCount > 1 ? "multi-shot" : "single-shot",
  ]);
  const rankedPatterns = DIRECTOR_PATTERNS
    .map((pattern) => ({
      pattern,
      score: pattern.tags.reduce((score, tag) => score + (taggedSignals.includes(tag) ? (tag === "all" ? 1 : 3) : 0), 0),
    }))
    .sort((left, right) => right.score - left.score || left.pattern.id.localeCompare(right.pattern.id));
  const selected = rankedPatterns.slice(0, input.sceneCount > 1 ? 7 : 5).map((entry) => entry.pattern);
  if (period && !selected.some((pattern) => pattern.id === "period-evidence-gate")) {
    selected.push(DIRECTOR_PATTERNS.find((pattern) => pattern.id === "period-evidence-gate")!);
  }
  const sourceIds = unique([
    ...selected.flatMap((pattern) => pattern.sourceIds),
    ...(period?.sourceIds ?? []),
  ]);
  const selectionReasons = [
    `${input.format} asks for ${input.sceneCount} authored shot${input.sceneCount === 1 ? "" : "s"} across ${input.durationSeconds} seconds.`,
    signals.length ? `Detected craft signals: ${signals.join(", ")}.` : "No specialist genre signal detected; using core visual-story rules.",
    period ? `Matched historical evidence profile: ${period.label}.` : "No unambiguous historical evidence profile matched.",
    worldResolution.status === "resolved"
      ? "World coordinate resolved: time, place, role or community, season or time of day, and immediate location."
      : worldResolution.status === "partial" || worldResolution.status === "unresolved"
        ? `World coordinate still needs: ${worldResolution.missing.join(", ") || "a supported evidence profile"}.`
        : "No historical world coordinate was requested.",
    input.sceneCount > 1
      ? "Sequence rules include geography, causality, rhythm, and reference continuity."
      : "Single-shot rules prioritize one readable change, controlled motion, and a clear landing.",
  ];
  return {
    version: DIRECTOR_BRAIN_VERSION,
    query: {
      format: input.format,
      durationSeconds: input.durationSeconds,
      sceneCount: input.sceneCount,
      brief: input.brief,
    },
    signals,
    patternIds: unique(selected.map((pattern) => pattern.id)),
    periodProfileId: period?.id ?? null,
    worldResolution,
    sourceIds,
    approvedStudies: [],
    warnings,
    selectionReasons,
    attentionMap: buildAttentionMap(input.durationSeconds),
  };
}

export function directorTraceDetails(trace: DirectorBrainTrace) {
  const patterns = trace.patternIds
    .map((id) => DIRECTOR_PATTERNS.find((pattern) => pattern.id === id))
    .filter((pattern): pattern is DirectorPattern => Boolean(pattern));
  const period = trace.periodProfileId
    ? DIRECTOR_PERIOD_PROFILES.find((profile) => profile.id === trace.periodProfileId) ?? null
    : null;
  const sources = trace.sourceIds
    .map((id) => DIRECTOR_SOURCES.find((source) => source.id === id))
    .filter((source): source is DirectorKnowledgeSource => Boolean(source));
  return { patterns, period, sources };
}

export function buildDirectorPromptBlock(trace: DirectorBrainTrace) {
  const { patterns, period } = directorTraceDetails(trace);
  const world = trace.worldResolution;
  return [
    "DIRECTOR BRAIN - RETRIEVED CRAFT, NOT STYLE IMITATION",
    `Brain version: ${trace.version}. Signals: ${trace.signals.join(", ")}.`,
    ...patterns.flatMap((pattern) => [
      `RULE ${pattern.id}: ${pattern.principle}`,
      ...pattern.application.map((application) => `- ${application}`),
    ]),
    ...(period
      ? [
          `HISTORICAL EVIDENCE PROFILE: ${period.label}; ${period.dateRange}; ${period.region}.`,
          ...period.evidence.map((item) => `- Evidence: ${item}`),
          ...period.visualRules.map((item) => `- Visual: ${item}`),
          ...period.materialRules.map((item) => `- Material: ${item}`),
          ...period.soundRules.map((item) => `- Sound: ${item}`),
          `- Forbid anachronisms: ${period.anachronisms.join("; ")}.`,
        ]
      : []),
    ...(world && world.status !== "not-requested"
      ? [
          `WORLD COORDINATE: status=${world.status}; time=${world.time ?? "missing"}; place=${world.place ?? "missing"}; role/community=${world.roleOrCommunity ?? "missing"}; season/time=${world.seasonOrTime ?? "missing"}; immediate location=${world.immediateLocation ?? "missing"}.`,
          ...(world.missing.length
            ? [`WORLD GAPS: ${world.missing.join(", ")}. Keep these fields neutral, avoid unsupported invention, and expose the gaps to the creator.`]
            : ["WORLD GAPS: none. The production still uses source-bounded evidence rather than generic period shorthand."]),
        ]
      : []),
    ...trace.warnings.map((warning) => `HISTORICAL RESOLUTION WARNING: ${warning}`),
    ...(trace.approvedStudies.length
      ? [
          "HUMAN-APPROVED RESEARCH PRINCIPLES:",
          ...trace.approvedStudies.flatMap((study) => [
            `STUDY ${study.id}: ${study.studyTitle}. Source: ${study.sourceTitle} (${study.sourceKind}).`,
            ...study.principles.map((principle) => `- ${principle}`),
          ]),
        ]
      : []),
    "SECOND-BY-SECOND ATTENTION MAP:",
    ...trace.attentionMap.map((beat) => `${beat.second.toString().padStart(2, "0")}s ${beat.phase}: ${beat.job}`),
    "Do not recreate a protected movie scene or imitate a living filmmaker's signature style. Apply only the abstract craft relationships above to the user's original production.",
  ].join("\n");
}
