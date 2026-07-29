# Chaplin Director Brain

## Purpose

The Director Brain turns observed film craft, historical evidence, production
tests, and provider capabilities into inspectable decisions for an original
Chaplin production.

It is not a library of copied scenes. It must not store or reproduce
screenplays, transcripts, copyrighted shot lists, or a filmmaker's protected
expression. It learns relationships such as:

- when a character changes tactic, what information a shot must reveal;
- how geography remains readable while action accelerates;
- how lens, framing, light, blocking, sound, and edit duration create tempo;
- which references and generation controls preserve identity and continuity;
- which dated evidence supports a period-world decision;
- which observed production rule improves or damages a generated result.

## Current flow

1. Magic Write receives the creator's brief, format, runtime, scene count, and
   selected actor canon.
2. `retrieveDirectorKnowledge` detects craft, genre, AI-production, and
   historical signals.
3. The retrieval selects a small set of source-linked craft patterns rather
   than injecting the entire corpus.
4. A historical profile is selected only when time and place are sufficiently
   resolved. Ambiguous prompts such as "3000 BCE" return a visible warning.
5. The runtime receives a second-by-second attention map.
6. The exact retrieved rules, warnings, sources, and attention map enter the
   writing request.
7. The same trace is written into generation metadata and returned to Studio.
8. The creator can expand the Director Brain trace beside the generated draft.
9. Super Admin can inspect the complete corpus at `/admin/director-brain`.
10. Rights-cleared studies enter a separate draft/review/approval ledger.
11. Magic can retrieve only approved abstract principles; raw observations,
    rights notes, and rejected or unreviewed studies never enter its prompt.

## Knowledge layers

### 1. Source register

Every rule points to one or more sources. Preferred sources are:

- cinematographer, editor, director, production designer, sound, or stunt
  interviews published by recognized craft institutions;
- museum, archive, archaeological, or dated documentary collections;
- official provider research, technical reports, model cards, and API docs;
- Chaplin's own controlled production experiments and keeper/kill verdicts.

Blogs that merely repeat prompting folklore are not enough to promote a rule.

### 2. Scene study

A scene study records observable facts without copying expressive text:

- work and scene locator;
- access or rights basis;
- start and end time;
- second or range;
- visible situation change;
- actor objective and tactic change;
- blocking and screen geography;
- frame size, lens behavior, camera position, and movement;
- cut cause and incoming consequence;
- diegetic sound, perspective, bridge, and silence;
- narrative job performed by the moment;
- evidence, inference, and confidence as separate fields.

Dialogue may be described by function such as "withholds the answer" or
"reverses the bargain." It must not be transcribed.

### 3. Derived pattern

A candidate pattern needs:

- a concise causal claim;
- conditions where it applies;
- conditions where it fails;
- at least one source or controlled Chaplin experiment;
- a production instruction;
- an evaluation measure;
- a review status.

Patterns are retrieved by production needs. They are never applied merely
because a creator mentioned a movie title.

### 4. Historical world profile

Historical direction is a four-part coordinate:

1. time range;
2. geography and culture;
3. social role, class, or occupation;
4. season, time of day, and immediate location.

Each profile separates:

- observed evidence;
- architecture and spatial organization;
- clothing and body presentation;
- objects, transport, tools, media, and technology;
- materials, wear, and construction;
- motivated light and capture language;
- diegetic sound sources;
- explicit anachronisms;
- unresolved questions.

A decade is not a color grade. "1950s" and "1960s" require a country, city or
region, year, community, and social context. "3000 BCE" requires a culture and
location before any production-design claim is allowed.

## Second-by-second direction

The attention map gives every delivered second a story job without forcing a
cut every second.

For the 15-second Punch:

| Second | Job |
| --- | --- |
| 0 | interrupt expectation |
| 1 | orient subject, place, situation |
| 2 | reveal objective |
| 3 | introduce obstacle |
| 4 | answer obstacle |
| 5 | impose cost |
| 6 | refresh geography |
| 7 | force a new tactic |
| 8 | show consequence |
| 9 | reverse knowledge, control, route, or relationship |
| 10 | force choice |
| 11 | commit physically |
| 12 | reveal price |
| 13 | open next pressure |
| 14 | hold the landing |

This is an attention plan, not a mechanical editing template. One shot may
carry several jobs; a cut must still be motivated by a change.

## Action and pursuit research

Vehicle pursuit and other action studies should measure:

- the first moment destination and threat are readable;
- screen direction and every intentional axis reversal;
- obstacle, response, and spatial fact added by each shot;
- option, tool, time, safety, leverage, or moral cost removed by each beat;
- the ratio of orientation, acceleration, impact, reaction, and recovery;
- when sound leads or trails a cut;
- when stillness or a wider shot resets comprehension;
- which action reveals character rather than adding noise.

The first case-study family is original vehicle-pursuit grammar inspired by the
user's observation that every second of a strong chase carries information.
No protected movie scene, transcript, or shot list is stored.

## AI filmmaking research

The brain must track provider capability separately from filmmaking craft.

Current provider-facing hypotheses:

- reference images are stronger identity constraints than repeated prose;
- subject motion, camera motion, dialogue, effects, ambience, and score should
  remain separately controllable when the provider path allows it;
- one reviewed frame, one action, one camera path, and one landing is the
  safest default generation unit;
- native multi-shot output is a distinct capability and must be version-gated;
- first/last-frame, ingredients, scene extension, motion controls, and native
  audio need provider-specific evaluation rather than generic prompt claims.

Every provider rule must name the provider, model/version, date observed,
request contract, output evidence, and known failure modes.

## Evaluation loop

Each production should eventually score:

- story change per shot;
- adjacent-beat similarity;
- geography readability;
- objective and tactic coverage;
- second-by-second attention coverage;
- identity, wardrobe, prop, period, and screen-direction continuity;
- anachronism findings;
- prompt adherence;
- usable duration;
- audio-source coherence;
- keeper/kill result and human reason;
- provider, model, references, cost, and latency.

A pattern is promoted only when it improves a defined measure or survives
expert review. Failed hypotheses remain in the audit ledger.

## Delivery phases

### Phase 1 - visible retrieval foundation

- [x] Source-linked craft corpus.
- [x] Action, rhythm, edit, sound, and AI-control patterns.
- [x] US 1950s, US 1960s, Uruk ca. 3000 BCE, and early Old Kingdom reference
  profiles with anachronism gates.
- [x] Deterministic retrieval and prompt injection.
- [x] Second-by-second attention maps.
- [x] Studio decision trace.
- [x] Super Admin corpus view.
- [x] Generation metadata provenance.

### Phase 2 - research ingestion and review

- [x] Persist source records, scene studies, evidence observations, pattern
  candidates, and review states.
- [x] Add Super Admin intake for licensed, public-domain, institutional, and
  original Chaplin studies.
- [x] Add source deduplication, access/rights basis, review, and rejection.
- [x] Distill approved observations into candidate patterns without copying
  expressive content.

### Phase 3 - retrieval and evaluation

- [x] Add database-backed approved-principle retrieval with deterministic
  static fallback.
- [ ] Record a first-class decision trace for every writing and render run.
- [ ] Evaluate attention, geography, tactic change, continuity, period, sound,
  provider adherence, and human verdicts.
- [ ] Add controlled A/B evaluation before pattern promotion.

### Phase 4 - corpus expansion

- [ ] Expand genres: suspense, comedy, romance, horror, musical, documentary,
  dialogue, commercial, animation, and episodic arcs.
- [ ] Expand action: vehicle, foot pursuit, rescue, combat, disaster, sport,
  heist, and large-scale staging.
- [ ] Expand period-world coverage by time *and region*, starting with user
  production demand rather than generic century presets.
- [ ] Add crafts: production design, costume, hair/makeup, color, VFX,
  animation, choreography, performance, sound editorial, score, and finishing.
- [ ] Maintain dated provider capability profiles and repeatable benchmark
  scenes.

### Phase 5 - ongoing operation

- [ ] Weekly research queue and review.
- [ ] Monthly provider re-benchmark.
- [ ] Pattern decay and contradiction review.
- [x] Initial coverage, confidence, source-diversity, rights, and human
  comparison dashboard.
- [ ] Exportable decision report for each finished production.

## Initial primary research register

- American Society of Cinematographers:
  `https://theasc.com/articles/shot-craft-analyzing-a-script`
- American Society of Cinematographers:
  `https://theasc.com/articles/shot-craft-where-do-you-put-the-camera`
- American Society of Cinematographers:
  `https://theasc.com/articles/rhythm-tempo-mickey-17-bong-joon-ho`
- American Society of Cinematographers:
  `https://theasc.com/articles/shooting-stars-for-rrr`
- Academy film-editing education guide:
  `https://www.oscars.org/sites/oscars/files/complet_film_editing_activities_guide.pdf`
- Library of Congress Look collection:
  `https://www.loc.gov/item/94837687/`
- Library of Congress Pittsburgh 1955-56 essay:
  `https://www.loc.gov/item/2005682181/`
- The Met, Uruk:
  `https://www.metmuseum.org/essays/uruk-the-first-city`
- The Met, Old Kingdom Egypt:
  `https://www.metmuseum.org/essays/egypt-in-the-old-kingdom-ca-2649-2150-b-c`
- ByteDance Seedance technical report:
  `https://seed.bytedance.com/en/public_papers/seedance-1-0-exploring-the-boundaries-of-video-generation-models`
- Google DeepMind Veo:
  `https://deepmind.google/technologies/veo/`
- Runway control research:
  `https://runwayml.com/research/more-control-fidelity-and-expressibility`
