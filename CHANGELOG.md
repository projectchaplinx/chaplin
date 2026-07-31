# Chaplin Changelog

## v0.2.98 - 2026-08-01 - Preserve the Director quarantine ledger

- Persist every automatic quarantine reason in an immutable Director Brain
  ledger while leaving the evidence, playback, and study review states intact.
- Backfill restricted-rights, metadata-only, and culturally sensitive evidence
  assessments and retain each reason even after later human resolution.
- Detect duplicate content hashes and explicit opposite-polarity conflicts with
  approved principles without treating approximate semantic overlap as proof.
- Synchronize new assessments when Super Admin opens the review desk and merge
  durable reasons into the same visible coverage-ranked queue.
- Extend the preservation verifier to prove that quarantine rows cannot be
  updated or deleted and remain part of the same append-only safety boundary.

## v0.2.97 - 2026-08-01 - Make the research backlog reviewable

- Rework the Director Brain Human Review Desk into coverage-ranked lanes for
  source playback, directly approvable document studies, evidence records, and
  the separate post-playback knowledge decision.
- Put each exact source passage beside its derived contact sheet, signal-only
  waveform, machine observations, candidate principles, limitations, and up to
  three related approved studies.
- Require a substantive written reason for every decision and add keyboard
  navigation plus explicit approve/reject shortcuts without introducing bulk
  or automatic approval.
- Auto-quarantine restricted, metadata-only, culturally sensitive, duplicate,
  and explicitly contradictory items while preserving them for human review.
- Keep reviewed evidence immutable when future provider discovery encounters
  the same record again.

## v0.2.96 - 2026-08-01 - Enforce the Director Brain preservation contract

- Store an immutable baseline and every later before/after mutation for all
  Director Brain research, evidence, study, decision, and evaluation records.
- Block deletion at the database boundary and make terminal job evidence,
  human-reviewed studies, reviewed manifests, and playback verdicts write-once.
- Turn retries into linked new attempt rows so prior errors, outputs, usage,
  and cancelled or exhausted attempts remain readable.
- Backfill every one of the 351 existing research jobs into an append-only cost
  ledger, explicitly distinguishing known estimates, partial estimates,
  unpriced usage, and absent recorded usage without inventing provider spend.
- Keep research expansion dormant through P0-P3 and require an explicit P4
  phase plus enable flag before any new source or timed-media work can queue.
- Add a repeatable preservation proof covering deletion paths, database guards,
  immutable revisions, and complete job-cost classification.

## v0.2.95 - 2026-08-01 - Keep every research asset inside Director Brain

- Turn the Director Brain archive into source folders that connect each
  authoritative source to its jobs, saved status history, evidence records,
  derived film files, synthesized studies, and final retrieval state.
- Expose durable worker output references instead of reducing a completed job
  to a single evidence count.
- Show the complete append-only research timeline and load the full bounded
  evidence collection rather than silently stopping at the first 100 records.
- Keep links to contact sheets, waveforms, evidence packages, and canonical
  source records beside their knowledge destination.
- Preserve the existing safety boundary: stored and visible does not mean
  approved, and only separately reviewed studies can influence production.

## v0.2.94 - 2026-08-01 - Synthesize reviewed evidence into draft knowledge

- Add the missing eligible-evidence-to-study bridge inside Director Brain.
- Let Super Admin select reviewed records from one authoritative source and
  ask OpenAI to synthesize a source-linked draft study.
- Require every generated observation to cite one selected manifest ID and
  reject mixed-source, unreviewed, restricted, sensitive, or already-linked
  evidence groups.
- Preserve the separate human study review and approval transitions; synthesis
  never places candidate principles directly into Magic retrieval.
- Show evidence-to-study links in the item-level evidence UI so source assets
  remain visibly attached after synthesis.
- Remove a partially created study if its evidence-link transaction fails.

## v0.2.93 - 2026-08-01 - Review every research asset safely

- Bring item-level museum and archive records into the Director Brain Human
  Review Desk beside playback and knowledge decisions.
- Add search and focused shortcuts for 1950s, 1960s, 3000 BCE, sound, and
  action coverage, with rights, cultural-sensitivity, provenance, facets, and
  authoritative source links visible before a decision.
- Require substantive review notes and keep restricted, metadata-only, or
  culturally sensitive records ineligible for promotion.
- Keep public-provider calls serial inside each job while retaining four-way
  parallelism across durable, globally leased research jobs.
- Repair nested Library of Congress canonical item URLs, duplicate evidence
  upserts, and mixed bulk-upsert creation timestamps.
- Add a bounded retry path that can reopen only failed or empty-evidence jobs,
  never a completed human review decision.
- Drain the live queue to zero active and zero failed jobs, recovering the
  affected Library of Congress records into attributable manifests.

## v0.2.92 - 2026-08-01 - Add the Director Brain human review desk

- Add one prioritized review desk inside Director Brain for every pending film
  playback check and reusable-knowledge decision.
- Enforce the two-gate order in the interface: direct playback must be verified
  before a linked study can appear for approval.
- Rank missing approved coverage ahead of redundant material while keeping
  every decision individual and explicitly human.
- Show the exact evidence, candidate principles, coverage gaps, and related
  approved studies beside the decision so reinforcement and contradiction can
  be reviewed in context.
- Keep all draft material visibly outside retrieval until the existing server
  approval contract passes; add regression tests for ordering and gate safety.

## v0.2.91 - 2026-08-01 - Unify the Director Brain research archive

- Add a single archive at the top of Director Brain for live research activity,
  extracted knowledge, source evidence, and derived timed-film assets.
- Persist and expose the complete append-only history for every research job,
  including phase, progress, status, message, review, and asset updates.
- Keep draft observations and candidate principles visible without allowing
  them into Magic retrieval until playback and human approval gates pass.
- Complete 53 Library of Congress timed-film evidence packages with private
  contact sheets, signal-only waveforms, evidence JSON, and exact provenance.
- Add focused Academy sound craft, Uruk and third-millennium western Asian
  material evidence, and Library of Congress mid-century U.S. provenance.
- Add bounded official-PDF input, Met object-record expansion, source retries,
  and recoverable timed-audio fallback without retaining source media.
- Fix campaign verification so dynamically discovered film sources do not
  invalidate the declared campaign-source count.

## v0.2.90 - 2026-07-31 - Archive visible Director Brain research assets

- Resolve all 18 rights-cleared Library of Congress registry films into 52
  bounded timed passages and supersede the stalled 60-second extraction jobs.
- Extract each 30-second passage once, then derive its contact sheet, abstract
  sound reading, signal metrics, and waveform while deleting raw clips and
  soundtracks immediately.
- Archive the derived contact sheet, signal-only waveform, and complete JSON
  evidence package in a private Director Brain bucket with exact provenance,
  timecode, models, usage, limitations, and review state.
- Show saved research assets beside exact source playback in Super Admin, while
  retaining the human playback and separate study-approval gates before any
  candidate principle can reach production retrieval.
- Interleave films across the four-worker queue to preserve parallel execution
  without repeatedly loading three passages from one source at the same time.
- Verify the first new contract passage end to end: six draft observations and
  all three research assets were persisted for *Under Western Stars* 0-30s.

## v0.2.81 - 2026-07-30 - Guide first-time creators into Actor Studio

- Start a creator-only onboarding tour automatically for recently created
  accounts, with progress isolated per signed-in user and stored once.
- Mask and block the rest of the interface while spotlighting the real Create
  plus button, actor choice, visual medium, brief, name, archetype, and final
  actor-creation control in sequence.
- Carry the tour across navigation into `/characters/new`, recover safely after
  reloads, and return interrupted actor-form tours to their reachable workspace.
- Keep a permanent `How to create` launcher in the top bar so creators can reset
  and replay the full walkthrough at any time.
- Exclude sign-in, Admin, and Super Admin surfaces; add desktop/mobile selector
  contracts and six regression tests for eligibility, persistence, and resume.

## v0.2.80 - 2026-07-30 - Keep malformed voice keys out of request headers

- Validate every configured ElevenLabs credential before it is placed in the
  `xi-api-key` request header.
- Skip copied masked values containing Unicode bullets and continue to the next
  valid configured credential instead of failing voice auditions in Fetch.
- Recover an otherwise valid API key when it was accidentally pasted with one
  leading bullet-list marker.
- Add regression coverage for both masked-value fallback and bullet-prefix
  recovery; the ElevenLabs voice tests and production build pass.

## v0.2.79 - 2026-07-30 - Use the replacement ElevenLabs account

- Centralize ElevenLabs credential selection across voice design, voice locking,
  dialogue, playback, Concierge, deletion, capacity recovery, and provider health.
- Prefer the Chaplin-specific and documented replacement variables over the
  legacy `ELEVENLABS_API_KEY`, so an older full account cannot shadow a newly
  added key.
- Support staged rotation aliases ending in `_NEW`, `_2`, or `_V2` without
  exposing credential values.
- Show the winning environment-variable name in Super Admin provider health and
  correctly recognize restricted keys that can access voices but cannot read
  subscription quota.
- Add regression coverage proving replacement keys override the legacy
  credential while legacy-only setups continue to work.
This changelog records user-facing product changes, production-pipeline changes,
provider integrations, and the validation boundary for each major Chaplin update.

## v0.2.78 - 2026-07-30 - Keep Style Sheets out of scene seeds

- Remove character Style Sheet composites and all cropped turnaround panels
  from the animation seed-image chooser while preserving real identity images
  and authored scene stills.
- Enforce the same boundary on the server so an older client cannot select a
  Style Sheet asset as a video seed or public actor cover.
- Keep Style Sheet assets inside the private Style Sheet workspace instead of
  allowing them into public actor galleries or Feed publication.
- Add regression coverage for composite, panel, identity, scene, explicitly
  unsafe, profile, and Feed visibility cases.

## v0.2.77 - 2026-07-30 - Guided Director example and film-grade learning

- Make the Director Brain useful before its first live run with an original
  1966 suspense-shot walkthrough that explains the brief, story job, frame,
  camera, performance, diegetic sound, period evidence, continuity, and exact
  generator handoff.
- Add dimension-level Director reviews across intent following, temporal
  continuity, and aesthetic quality, while keeping geography, identity, period,
  prompt, prop, screen-direction, and audio failures as visible hard gates.
- Require reviewed Control and Challenger outputs, declared-target improvement,
  no target or hard-gate regression, a minimum composite gain, and explicit
  human preference before an experiment can enter production.
- Persist the rubric, scores, evidence, generated result, output asset, decision
  trace when available, and complete promotion comparison in the audit ledger.
- Register FilmBench v2 as an analytical evaluation source without ingesting
  its film clips or protected prompts.

## v0.2.76 - 2026-07-30 - Live Director Brain graph

- Add a LangGraph-style Director Brain view at the top of Super Admin's
  Director Brain page, with selectable writing and render runs.
- Persist the complete directing decision trace from Magic Write through the
  production pipeline, including sources, patterns, period-world resolution,
  attention beats, provider, model, outcome, and failure state.
- Connect render progress and completion back to the same trace so the graph
  distinguishes selected, running, succeeded, and failed decisions.
- Expand the research campaign with structured Library of Congress and
  Metropolitan Museum evidence sources for scalable period-world grounding.

## v0.2.75 - 2026-07-30 - Locked first looks in Feed

- Publish the exact canonical character cover to Feed when a creator locks it
  as the actor's first look.
- Keep unchosen comparison renders private and publish only the selected image
  with a clear "Meet [actor]" first-look post.
- Support both provider-generated looks and creator uploads, even when an
  uploaded asset has no generation job.
- Make repeated selections safe through source-asset deduplication, while
  surfacing publication failures instead of silently discarding them.

## v0.2.74 - 2026-07-30 - Centered actor build handoff

- Replaced the duplicated inline actor-writing progress cards with one centered
  build pop-up shared by desktop and mobile.
- Show live name, role, promise, engine, elapsed time, and field-driven progress
  inside the pop-up while the model is working.
- Keep the right-side identity editor unchanged during generation, then apply
  the complete authoritative actor in one handoff and close the pop-up.
- Keep single-field Magic Write actions in the same centered progress surface
  with an indeterminate live state.

## v0.2.73 - 2026-07-30 - Honest live actor creation

- Removed the canned instant actor draft that pre-filled a generic name,
  promise, personality, voice, sound, and score while the real model was still
  working.
- Made new actor forms begin without a selected archetype, sound preset, score
  preset, voice description, or forced visual medium.
- Stream name, role/archetype, character promise, and character engine into the
  form only after each completed value arrives from OpenAI.
- Replaced timer-driven progress with field-driven progress and made the model
  select one to three supported archetypes from the creator's actual brief.
- Prevent full actor generation from silently substituting canned local content
  when OpenAI is unavailable or fails.

## v0.2.72 - 2026-07-30 - Anatomy-gated scene frames

- Added actor-specific hand ownership and prop-grip direction to every
  generated scene frame, including explicit limits on duplicate hands,
  branching wrists, fused fingers, and disconnected limbs.
- Added a high-detail visual anatomy review before a scene frame can be saved
  to the Studio.
- Automatically regenerate a rejected scene frame with a precise correction,
  up to three attempts; malformed candidates never become usable assets.
- Record anatomy verdicts and retry counts with the generation, and count every
  provider attempt in credit billing.

## v0.2.71 - 2026-07-30 - Live render telemetry

- Added a live center-canvas render monitor with the exact active pipeline
  operation, continuously updating elapsed time, and explicitly estimated
  remaining time and overall progress.
- Added four per-scene activity states covering frame and soundtrack creation,
  frame readiness, animation, completion, and failure.
- Made the estimate respond to both phase time and actually attached frame,
  soundtrack, and video assets so a long provider call no longer looks frozen.
- Replaced the disabled `Working` label with a live render clock while the
  generation action is in flight.

## v0.2.70 - 2026-07-30 - Single-canvas scene production

- Removed the duplicated four-scene timeline from the desktop production
  canvas because the right Production Assets rail already owns scene selection.
- Made Scene 1 the initial center preview and wired every right-rail scene card
  to switch that same focused canvas, including during live generation.
- Reduced the multi-shot action to one clear `Generate four scenes` control and
  removed duplicate center-canvas generation buttons.
- Locked the desktop production workspace to a flex-fitted `100dvh` surface,
  with any exceptional decision panel scrolling internally instead of creating
  a page crawl.

## v0.2.69 - 2026-07-30 - Sound-aware Director Brain evidence

- Added a guarded audio-research command that combines non-verbatim
  `gpt-audio-1.5` perception, GPT-5.6 Terra structured synthesis, and local
  signal measurements without creating or storing a transcript.
- Added a third, 90-second rights-aware scene study joining timed visual,
  blocking, transition, audio, and sound-function evidence while keeping every
  reusable principle in draft until an administrator reviews the source.
- Expanded Super Admin research diagnostics with sound-study runtime and
  period-world coverage, and documented the nine-column evidence intake.
- Seeded 17 registered research sources and three draft studies in production;
  no study was automatically approved.

## v0.2.68 - 2026-07-30 - Rights-aware contact-sheet research

- Added a guarded Director Brain research command that analyzes local,
  rights-cleared contact sheets with GPT-5.6 Terra.
- Constrained the output to observable visual craft evidence, explicit sampling
  limits, and human-reviewed passage recommendations without copied dialogue,
  subtitles, performer identification, or inferred sound evidence.
- Kept source images inside the repository boundary, capped inputs at 10 MB,
  disabled response storage, and required strict structured output.

## v0.2.62 - 2026-07-29 - Explainable Director Brain

- Added a source-linked Director Brain corpus covering story beats, action
  geography, escalation, edit causality, rhythm, sound perspective, AI shot
  control, and reference continuity without storing copied scene expression.
- Added evidence-gated US 1950s, US 1960s, Uruk ca. 3000 BCE, and early Old
  Kingdom profiles with visible ambiguity and anachronism warnings.
- Wired deterministic knowledge retrieval and a second-by-second attention map
  into Magic Write, generation metadata, and the creator-facing Studio trace.
- Added a Super Admin Director Brain workspace with the complete learning
  contract, craft rules, historical profiles, and primary-source register.
- Documented the long-running research, ingestion, evaluation, period-world,
  provider-benchmark, and corpus-expansion program.

## v0.2.61 - 2026-07-29 - Full-width scene entry

- Fixed the scene runtime chooser collapsing into the hidden stage rail's
  15-rem column when the left and right studio panels were intentionally absent.
- Made the 5-, 15-, and 60-second entry decision use the full center canvas,
  then restore the normal three-panel studio immediately after selection.

## v0.2.60 - 2026-07-29 - Creator style sheets

- Added a creator-facing Style Sheet control beside the actor studio actions,
  with the current review composite and its front, three-quarter, profile, and
  full-body production references in one persistent side panel.
- Let actor owners lock a wardrobe direction and create or replace a sheet
  directly from the studio while keeping the composite out of video prompts.
- Hardened turnaround generation against copying a hero image's action, props,
  and location, and prevented visually rejected sheets from becoming current.
- Created and visually reviewed the first persisted four-view sheets for Arjan
  Devraj and Nova Calloway.

## v0.2.59 - 2026-07-29 - Selectable Punch generation

- Added a persisted Studio choice between four independently controlled scene
  clips and one complete native 15-second Seedance take.
- Wired the single-take path to one timed four-shot prompt with synchronized
  dialogue, ambience, physical effects, background noise, and score.
- Normalized separate scene clips to whole provider-safe durations while
  retaining their exact solved edit lengths for the final 15-second assembly.
- Recorded the selected generation mode and correct video-duration allocation
  in production, pipeline, generation, and credit metadata.

## v0.2.58 - 2026-07-29 - Runtime-first story creation

- Reduced the first scene-creation decision to three neutral runtime choices:
  5, 15, or 60 seconds, without format names, scene counts, or different
  creative promises competing at entry.
- Made every runtime open the same second choice between Magic Assist and
  writing your own, then reveal the shared Concept, Cast, and Script flow.
- Kept Magic available only on the assisted path, focused manual creators on
  the title field, and returned dismissed writing choices to runtime selection.

## v0.2.57 - 2026-07-29 - Focused scene-format entry

- Changed the 5s, 15s, and 60s output cards into a one-time entry decision that
  disappears completely after selection.
- Kept Concept, Cast, and the format-specific Script navigation as the primary
  workflow, with only a compact runtime/change control beside it.

## v0.2.56 - 2026-07-29 - GPT-5.6 Terra writing migration

- Replaced every active Anthropic writing, conversion, character-room,
  concierge, style-extraction, and experiment call with OpenAI Responses using
  `gpt-5.6-terra`.
- Preserved structured JSON, canonical image references, conversation history,
  generation-ledger usage, Quick Write delivery, and local fallbacks through a
  shared OpenAI adapter.
- Locked the writing stage to OpenAI, migrated the active Super Admin pipeline,
  updated provider readiness and UI copy, and added GPT-5.6 Terra rate-card
  accounting.

## v0.2.55 - 2026-07-29 - Production learning and style contracts

- Corrected character sheets so the 16:9 composite is review-only, automatically
  cropped into front, three-quarter, profile, and full-body assets, and blocked
  from video submission.
- Added editable project style contracts extracted from 5–10 stored references
  and injected verbatim into board image and video prompts.
- Added the 80-word image-to-video budget, original-versus-trimmed job logging,
  motion grammar checks, concrete `cinematic` lint, and positive stability
  direction.
- Added persisted keep/kill verdicts, single-variable iteration capture,
  board/character statistics, and verdict controls on generated image and SFX
  takes.
- Added config-driven image/video provider queues with bounded concurrency,
  same-prompt transient retry, exponential backoff, and fleet reporting.
- Added VO/score timeline authority, score movement timing for wordless boards,
  visible-intent craft warnings, object-first action guidance, and the
  720p-explore/1080p-keeper/4K-master resolution ladder.

## v0.2.54 - 2026-07-29 - Version-gated multi-shot direction

- Probed the configured ModelArk account and documented that it currently
  exposes Seedance 2.0 multimodal generation, but no verified Seedance 2.5 or
  structured storyboard request contract.
- Added a strict provider-neutral `ShotJob` with timecoded one-action beats,
  one camera move, separate semantic references and moment frames, five seams,
  exact duration sums, a three-character cap, and VO-first timing.
- Kept live production on the existing 2.0 single-shot transport while gating
  a future one-job multi-shot submission behind an explicit authenticated
  capability instead of a guessed model name.
- Added versioned three-panel character-sheet and selected self-tape audition
  primitives; renamed the Studio's first actor-production stage to Audition.
- Enforced standing film and skin prompt blocks, reusable portrait negatives,
  banned quality-slop phrases, lens-effect warnings, and the final video rule
  `No music. No subtitles.` in both prompt lint and the live generation route.
- Rebuilt war-drop as one internal four-shot, 15000 ms contract with both hero
  sheets and selected performance references, plus regression coverage for
  actions, cameras, timecodes, references, seams, identity caps, prompts,
  adapter gating, and duration.

## v0.2.53 - 2026-07-29 - Focused output selection

- Made the large Spark, Punch, and Episode format cards a one-time choice:
  selecting an output collapses them into a compact runtime and format summary.
- Preset format links such as 15-second Punch now open directly on the creation
  canvas, while generic creation still presents the chooser once.
- Added an explicit Change output action and moves keyboard and viewport focus
  to the Concept Magic brief immediately after selection.

## v0.2.52 - 2026-07-29 - Compact live actor conversation

- Reduced the actor hero's desktop and narrow-screen typography, spacing,
  conversation entry, stats, and action sizes so casting and editor controls
  remain visible instead of being clipped below an oversized identity block.
- Made Talk to Actor open the live room, play the actor's existing opening line
  when a locked voice is available, and focus the message composer immediately.
- Tightened the cinematic stage's viewport sizing while preserving its split
  actor-media presentation and responsive stacked layout.

## v0.2.51 - 2026-07-29 - Playable character file browser

- Rebuilt Super Admin character files as counted All, Images, Videos, Audio,
  and conditional Other tabs so large actor libraries can be reviewed by type.
- Added full-size in-page image inspection, native video playback with seek and
  volume controls, inline audio playback, and direct access for other files.
- Kept per-file permanent deletion alongside each playable asset and verified
  every current live media kind maps to the correct review tab.

## v0.2.50 - 2026-07-29 - Reliable permanent character deletion

- Corrected permanent deletion to remove an actor from
  `episode_shots.cast_character_ids`, the deployed cast-membership column,
  instead of querying a nonexistent field on media pipeline runs.
- Verified the corrected cleanup query and every related Sunanda Kulkarni
  deletion table read-only against the configured live database.

## v0.2.49 - 2026-07-29 - Unclipped admin deletion

- Moved the permanent character-deletion confirmation to a viewport-level
  portal so character-card overflow can no longer crop or layer over it.
- Added a scroll-safe responsive backdrop, protected busy state, and Escape or
  backdrop dismissal while preserving the typed-name deletion safeguard.

## v0.2.48 - 2026-07-29 - Parallel scene production

- Confirmed scene-frame generation uses four distinct prompts and provider jobs,
  then made the live Studio progress readout expose completed frame and
  soundtrack counts instead of showing one ambiguous selected canvas.
- Started all scene frames and per-scene soundtracks together. Each batch keeps
  a four-worker cap, so independent BytePlus and ElevenLabs work no longer waits
  behind the other stage.
- Restored parallel motion generation for every independent scene while keeping
  real `chain` dependencies ordered behind only the source clip whose terminal
  frame they require.

## v0.2.47 - 2026-07-29 - Production-safe Direction Brain

- Added a typed Direction Brain safety contract that preserves the
  hook-escalate-reverse-cliffhanger arc while enforcing per-slot energy,
  identity budgets, hero behavior tells, anonymous NPC dressing, safe cameras,
  closed props, sensitive framing, and dialogue placement.
- Made timing authoritative from writing through rendering and FFmpeg assembly:
  explicit shot counts win, action beats can split into lettered sub-slots, and
  solved slot durations sum exactly to the requested master duration.
- Connected continuous action to real chain rendering with persisted last-frame
  extraction, a three-link re-anchor cap, and controlled-motion prompts that
  name one moving subject and isolate camera drift.
- Added Studio approval for newly required scene props, `L10` direction lint,
  a five-slot 15-second war-drop regression fixture, and the complete constraint
  tables in `docs/DIRECTION_RULES.md`.

## v0.2.46 - 2026-07-29 - Complete credit and usage control

- Defined one canonical Chaplin rate card: 100 welcome credits, 25 credits per
  actor, and finished productions at 5 credits per second (25 Spark, 75 Punch,
  150 30-second Spot, and 300 Episode or 60-second Spot).
- Kept AI writing, voice, dialogue, sound, music, still, motion, and assembly
  allocations visible inside their paid bundle without double-charging the
  creator who already reserved that actor or production.
- Added a Super Admin Credits & Usage workspace with current per-user balances,
  lifetime grant and spend, wallet transactions, generation activity, actor or
  production context, provider/model/status, included allocations, and actual
  provider cost.
- Connected Magic actor writing, Magic production writing, Quick Write, scene
  writing, Concierge intent and speech, and every actor media generation to the
  same user-attributed ledger. Historical jobs are attributed through actor
  ownership, and all ledger queries paginate beyond Supabase's 1,000-row
  default.

## v0.2.45 - 2026-07-29 - Contained Cast-step action

- Fixed the `Next: generate scenes` footer remaining a negative-margin sticky
  overlay on desktop, where it escaped the center editor and covered the cast
  shelf and adjacent Studio columns.
- Matched the Script-step responsive behavior: the action remains reachable and
  sticky on smaller screens, but returns to contained normal flow on desktop.

## v0.2.44 - 2026-07-29 - Existing productions open in Studio

- Removed the last route-level Landing Zone exception. Opening an existing
  `/productions/[id]` link now uses the same persistent Scene Studio stage rail,
  compact live production canvas, and generated-asset panel.
- Restored predictable scrolling by keeping the Studio viewport fixed while
  giving the center production canvas its own vertical scroll.
- Preserved existing production plans, retry controls, live generated frames,
  and approvals without restoring the duplicate title, cast, workflow crawl,
  or locked-script recap.

## v0.2.43 - 2026-07-29 - Named voice-slot recovery

- Expanded creator voice-capacity recovery from only the currently open actor
  to every actor owned by that creator. Each safely reclaimable voice now shows
  its real ElevenLabs name and associated actor before deletion.
- Kept active voices and other creators' voices protected server-side. Untracked
  and other-app voices remain available only through account-wide Super Admin
  voice control, now linked directly from an empty creator recovery panel.
- After a confirmed deletion frees a custom-voice slot, added a direct action
  to create new voice takes and choose the replacement without losing context.

## v0.2.42 - 2026-07-28 - Scene generation stays in Studio

- Kept the Scene Studio stage rail, center canvas, and asset panel mounted when
  a locked script enters production. The interface no longer swaps to the
  separate Landing Zone production-detail composition.
- Made the original Generate in Studio action initialize the production plan
  and immediately begin the authorized 15-second Punch render, removing the
  second Generate master click.
- Streamed newly created production frames back into the existing right asset
  panel and kept retry plus final human approval in the center canvas.
- Removed the duplicate title, cast, output promise, workflow crawl, and locked
  script recap from the embedded Studio render view. Direct production URLs
  retain the complete detail page for deliberate inspection.

## v0.2.41 - 2026-07-28 - Live actor room layout guard

- Fixed the cinematic actor profile clipping its Cast and production actions
  after the live conversation room was opened.
- Kept the approved fixed-height composition while the compact Talk control is
  closed, then allows the stage and media panel to grow with the live room.

## v0.2.40 - 2026-07-28 - Clean voice auditions

- Fixed Voice Design auditions that repeated the same short sentence several
  times inside a take. Short text now becomes one natural provider-length line
  using the actor's canon once, followed by non-repeating delivery language.
- Made audition preparation idempotent so the API action and ElevenLabs wrapper
  cannot pad the same request twice.
- Added regression coverage for minimum provider length, single-use actor text,
  one-line output, and repeated preparation.

## v0.2.39 - 2026-07-28 - Persistent Studio mode switch

- Fixed the Actor / Scene / Projects control so it remains visible and active
  on every Studio surface. Actor creation no longer replaces it with a progress
  strip, and Projects no longer drops back into the old site shell.
- Brought the Projects dashboard into the same full-height Studio canvas with
  its drafts, actors, productions, earnings, and New Scene action intact.
- Existing actors now switch between Actor and Scene on their own Studio URL.
  Scene mode retains the locked actor plus the complete Voice, Dialogue, SFX,
  Theme, Still, Video, Magic Scene, and asset workspace instead of opening a
  detached blank story builder.
- Preserved the separate multi-actor Concept / Cast / Script builder for new
  stories while keeping its transition to rendering inside the Studio shell.

## v0.2.38 - 2026-07-28 - One persistent creative Studio

- Introduced a shared Studio bar and workspace language across actor creation,
  actor production, scene authoring, inline rendering, and saved productions.
  Actor, Scene, and Projects remain in predictable locations while the tools,
  canvas, stages, and assets change for the selected work.
- Creating an actor now continues directly into Actor Studio for voice, still,
  theme, and scene work instead of ejecting the creator to the public profile.
- Scene authoring now changes into Render mode inside the same persistent shell.
  Direct production links use that shell too, so production no longer feels
  like a separate application.
- Removed the redundant second production handoff: entering Render mode
  initializes the idempotent production plan once, in place. Punch generation
  is pinned at the top of the render canvas and creates the four scene clips
  and 15-second master without another page transition.
- Added responsive Studio chrome and preserved existing authentication,
  autosave, review gates, pipeline retries, and provider-spend boundaries.

## v0.2.37 - 2026-07-28 - Pixel-matched cinematic actor profile

- Rebuilt the desktop character profile around the approved Nova Calloway
  composition: exact viewport stage height, identity/media split, spacing,
  typography, stat dividers, scene-mix rail, and featured-performance status.
- Replaced the large closed conversation card with the approved compact
  `Talk to {actor}` control while preserving the full live room after entry.
- Kept creator-only production controls permission-gated, removed the public
  admin prompt shortcut, and suppresses the global navigation/footer chrome on
  the desktop profile canvas so the actor stage owns the viewport.
- Added responsive fallbacks for smaller screens without changing media,
  conversation, casting, or production behavior.

## v0.2.36 - 2026-07-28 - Admin character catalogue control

- Replaced the read-only actor-readiness table with an expandable Admin
  character manager covering all persisted actors and every attached media
  asset, with previews, provider/date metadata, Studio links, and the existing
  exact-name-confirmed complete actor deletion.
- Added Super Admin-only individual file deletion. It confirms the exact asset
  server-side, removes Chaplin storage when applicable, clears profile and voice
  preview references, removes feed posts sourced from the deleted file, relies
  on asset foreign keys to clear production selections, and records an audit
  event without exposing provider credentials.
- Added an ordered homepage cast selector for one to ten actors. Saving publishes
  exactly that set and removes previous placements; position controls determine
  the hero and shelf order.
- Fixed homepage slot loading to use the database's real `published` state
  instead of the nonexistent `active` state. Once Admin publishes a cast, the
  homepage hero, Watch Now, Characters, and Top Performers surfaces use only the
  selected actors; a never-curated catalogue retains its ranked fallback.

## v0.2.35 - 2026-07-28 - In-studio voice capacity recovery

- Voice-limit failures in an actor studio now include an inline
  `Manage unused voices` control, so the signed-in operator can inspect and
  permanently delete an eligible inactive ElevenLabs voice without leaving the
  failed production step.
- Regular creators only see inactive Chaplin-generated voices labelled for the
  actor they manage. Super Admin can recover any inactive generated voice on
  the connected ElevenLabs account, with voices from other apps and untracked
  voices clearly marked before irreversible confirmation. Active Chaplin voices
  remain protected server-side.
- Successful deletion now also removes any matching inactive Chaplin
  registration, freeing the provider slot without leaving stale voice metadata.

## v0.2.34 - 2026-07-28 - Cinematic actor studio

- Activated the previously unused cinematic actor hero on every character
  profile, matching the actor-first Studio direction with a large identity rail,
  full-bleed featured performance, Talk room, real stats, casting, and production
  actions in one coherent stage.
- Added a compact Scene Mix, Voice, Theme, and Effects control rail over the
  media edge; unavailable layers are visibly disabled and mobile visitors retain
  access through the sound console.
- Reworked the stage proportions and responsive order so desktop keeps identity
  on the left and performance on the right, while mobile leads with the actor
  media before the controls.
- Added a narrow public read-only actor-media endpoint so signed-out preview mode
  can truthfully play the selected video, locked-voice preview, theme, and
  signature effects without exposing prompts, jobs, provider traces, or private
  production state.
- Reels now reports the actor's actual saved performance count and actors with
  incomplete media fall back cleanly to their selected still with unavailable
  sound layers disabled.

## v0.2.33 - 2026-07-28 - Super Admin actor and voice cleanup

- Added a live ElevenLabs capacity manager to the private Admin Control Room,
  listing every personal generated voice with its actor linkage and locked or
  unused state.
- Super Admin can permanently delete any unused generated voice after confirming
  its exact Voice ID; actively locked voices are rechecked and protected on the
  server immediately before deletion.
- Voice-limit errors in the production studio now link directly to the Super
  Admin voice control instead of sending the operator to an unspecified external
  cleanup step.
- Added an exact-name-confirmed complete actor deletion that reclaims owned
  ElevenLabs voices, removes archived storage objects, briefs, cast memberships,
  actor-scoped pipeline runs, and cascading database history while preserving
  shared voices and leaving a system audit event.
- Made the database catalogue authoritative during browser synchronization so a
  permanently deleted actor cannot return from stale local storage.

## v0.2.32 - 2026-07-28 - Per-slot audio ownership and voice recovery

- Added a strict per-slot audio plan for dialogue, ambience, SFX, and music,
  resolved from the active Seedance capability, slot content, locked TTS asset,
  and Character Card delivery/SFX canon.
- Added read-only Seedance audio capabilities in Pipeline Lab, including the
  verified 15-second reference ceiling, native-output support, and safe
  per-model fallback behavior.
- Video prompts now contain only natively owned audio layers, always exclude
  music, never permit generated actor dialogue, and rebuild as post-mix/off-face
  when a fallback cannot accept the locked voice reference.
- Board assembly now detects native clip audio, preserves it once, adds only
  non-native stems, safely restores locked dialogue when expected native audio
  is absent, ducks music 15dB under narration and 20dB under character speech,
  and records per-slot ownership and cost-avoidance metadata.
- Added all six audio lint rules, four-row ownership tables and reasoned
  overrides in the Scene Handoff Map, provider fixtures, mix-planning tests, and
  a board-level `legacy_stems` escape hatch.
- When production is blocked by a missing locked voice or full ElevenLabs
  capacity, the UI now offers an explicitly confirmed deletion of a selected
  inactive Chaplin-generated voice. Active voices are excluded server-side,
  after which the creator is directed to lock the actor voice and retry.

## v0.2.31 - 2026-07-28 - Typed eight-slot ad production board

- Added a strict eight-slot Brand Spot board with problem-to-solution and
  journey-to-delivery house arcs, a fixed slot-four pivot, Mode A emotional
  counterpoint, Mode B explainer structure, and product appearances limited to
  slots four and eight unless an explicit creative reason is recorded.
- Added guarded forward, chained-last-frame, and first/last-frame motion modes
  with continuity metadata, prompt linting, chain-depth protection, and real
  FFmpeg last-frame extraction from completed source renders.
- Made board timing voice-first: persisted speech is measured with ffprobe,
  editorial gaps are added, and slots longer than five seconds are split into
  renderable sub-clips.
- Added per-slot 480p draft and 1080p final promotion, tier and spend metadata,
  and a board-aware assembler that trims or holds picture, carries the previous
  frame instead of cutting to black, mixes VO/SFX/music, ducks music by 15 dB
  under speech, and delivers at -14 LUFS.
- Preserved the existing single-shot generation path and documented the new
  board contract, decision tree, timing order, and assembly behavior.

## v0.2.30 - 2026-07-28 - Safe ElevenLabs voice-capacity recovery

- Added a guarded recovery when ElevenLabs reports that the custom-voice limit
  has been reached while locking a newly designed voice.
- Chaplin now finds at most two of the oldest superseded generated voices
  labeled for the same actor, excludes the actor's current locked voice, removes
  those old copies, and retries the lock once.
- Refuses cleanup when no actor-specific superseded voice is safe to remove;
  unrelated voices, other actors' voices, cloned voices, and unlabelled voices
  are never deletion candidates.
- Added focused selection-policy tests and a creator-facing confirmation when
  capacity was safely reclaimed.

## v0.2.29 - 2026-07-28 - Single voice audition player

- Replaced three repeated voice-preview cards with one audition player and
  Take 1, Take 2, and Take 3 selectors.
- Kept the provider's three distinct voice options while presenting the shared
  audition line only once and moving selection to one clear action.
- Reset the selected take whenever a fresh voice set is generated so the player
  and Choose action always stay in sync.

## v0.2.28 - 2026-07-28 - Project Chaplin X main reconciliation

- Reconciled the public-launch, owner-access, footer, Magic-action, and crisp
  wordmark work with the three actor-profile commits already on
  `projectchaplinx/chaplin`.
- Preserved the target repository's uncropped, natural-ratio actor frame and
  moved voice, theme, effects, and scene-mix controls beside the performance
  instead of over the actor's face.
- Kept one conversation room, retained server-derived owner-only production
  controls, and made the combined profile use the shared responsive stage.

## v0.2.24 - 2026-07-28 - Crisp Chaplin wordmark

- Removed the glow-baked full-logo raster from every live navigation and footer
  surface.
- Added one reusable, sharp brand lockup built from the clean gradient C mark
  and rendered CHAPLIN word text with no blur, shadow, filter, or bloom.
- Applied the lockup consistently to the global header, homepage, footer, and
  desktop actor-creation workspace while preserving the compact header mark.

## v0.2.23 - 2026-07-28 - Owner-only actor controls

- Replaced demo-role checks on public actor profiles with server-derived
  signed-in, owner, and private-admin access.
- Removed production, media-generation, management, and developer controls for
  signed-out visitors and signed-in non-owners while preserving casting for
  authenticated creators.
- Protected direct actor production-studio URLs on the server: signed-out
  visitors return to sign-in and non-owners return to the public actor profile.
- Stopped local hydration and catalogue synchronization from reassigning every
  actor, story, casting, and ledger record to the current browser account.
- Added explicit access-policy tests for signed-out, non-owner, owner, and
  allow-listed admin states.

## v0.2.22 - 2026-07-28 - Sign-in footer repair

- Aligned the shared desktop footer with the 5.5rem navigation rail so the
  Chaplin wordmark is no longer covered on the sign-in screen.
- Removed mobile-only bottom-navigation spacing from desktop footers, eliminating
  the oversized empty area beneath authentication and other public pages.
- Added safe shrinking and responsive text alignment for the footer description
  while preserving the existing mobile layout.

## v0.2.21 - 2026-07-28 - Magic action visual language

- Added a restrained cyan-to-violet-to-pink edge as the shared visual signature
  for controls that ask Chaplin or a media model to create something.
- Applied the treatment across Magic Write, scene shaping, actor production,
  production renders, in-character replies, and isolated provider tests while
  leaving navigation, uploads, saving, and approval controls unchanged.
- Gave the main Magic panels the same quiet spectrum edge and limited motion to
  hover, keyboard focus, and active generation, with reduced-motion support.

## v0.2.20 - 2026-07-28 - Public-launch security hardening

- Removed the user-metadata Super Admin escalation path and made the private
  deployment email allow-list the only source of admin authority.
- Enforced ownership across generation, uploads, series, products, media
  selection, and pipeline creation, transitions, mixing, and assembly.
- Added persistent Supabase rate limits for authentication, provider-backed
  generation and writing, uploads, public actor interactions, Concierge, feed,
  and high-volume mutations.
- Closed free-production format/duration mismatches while preserving the
  25-credit actor plus 75-credit 15-second Punch welcome promise, and bound that
  grant to server-entitled Chaplin signups so direct Supabase accounts cannot
  farm promotional wallets.
- Added same-origin mutation checks, safe local redirects, upload signature and
  payload validation, generic login failures, stronger signup passwords, and
  public security headers.
- Documented the remaining production controls that must be enabled at the
  Supabase and provider layers.

## v0.2.19 - 2026-07-28 - Private Super Admin entry

- Removed Super Admin links, role switching, and operations shortcuts from the
  public header, account menu, Create desk, and bottom creation assistant.
- Moved the credential form to the direct-only `/super-admin` route. The route
  hides the public header, footer, and bottom navigation so only the login gate
  is visible.
- The legacy `/admin/login` URL and every protected operations page now redirect
  to `/super-admin`, preserving a safe internal destination after login.
- Public client state no longer revives or exposes an admin mode. Authorization
  inside `/admin` and its APIs remains server-enforced and unchanged.

## v0.2.17 - 2026-07-28 - Creator sign-in gate and 100 welcome credits

- Browsing remains open, while actor, video, story, series, and general creation
  routes now send signed-out visitors to one combined sign-up / sign-in screen
  and return them to the creation route they originally chose.
- Every creator account receives 100 idempotent welcome credits. Creating an AI
  actor uses 25 credits and starting a 15-second Punch uses 75, so the welcome
  balance covers exactly that first creator loop.
- Added a dedicated creator wallet and immutable credit history, separate from
  actor royalty earnings. Failed actor or production saves refund a newly
  reserved charge, while retries reuse the original reservation.
- Character, story, writing, and generation APIs now require the authenticated
  account; character ownership comes from the server session rather than a
  browser-supplied maker ID. Native bearer-token creation remains supported.
- Applied the wallet migration and passed focused ESLint, strict TypeScript,
  credit-contract tests, the production build, and live HTTP checks for the
  creation redirect, welcome offer, and unauthenticated API rejection.
## v0.2.19 - 2026-07-28 - One "Talk to", not two

- Removed the "Talk to <name>" card added to the left column in v0.2.18. The
  Live character room below the hero already is the way to talk to an actor,
  so the card was a second invitation to the same thing on the same screen.
- `(pending)`

## v0.2.18 - 2026-07-27 - Nothing sits on the actor's face

- Scene mix, the voice/theme/effects track buttons and Sound details move off
  the frame and into the left column, in normal flow. They were floating over
  the right of the shot, which is where the actor is.
- `CharacterBroll` now owns the two-column layout as well as the audio state.
  That is what lets the controls sit beside the details rather than on top of
  the performance — the state they read never leaves the component.
- The left column gains a "Talk to <name>" card linking to the conversation
  panel further down, so the space is used and the actor is offered rather
  than only described.
- User-facing: the actor's face is completely unobstructed. Every sound control
  is still one click away, on the left.
- `(41af553)`

## v0.2.17 - 2026-07-27 - Stop cropping the actor on their own page

- The profile hero is now two columns: name, tagline, chips and all six stats
  sit beside the frame instead of on top of it.
- The frame sizes itself from the media's real dimensions rather than imposing
  a shape. Desktop fixes the height and the width follows; phone fixes the
  width and the height follows. Pinning both is what caused the crop.
- User-facing: nothing is cut off any more. A 1280x720 clip renders as a
  967x544 frame, a 4:3 still as 725x544 — measured, not assumed.
- The left-to-right scrim inside `CharacterBroll` is now optional and off here.
  It exists to keep overlaid text legible; with the text moved off the media it
  was only dimming a third of the performance.
- Fixes the regression in v0.2.14, where capping the height of a full-width
  16:9 frame produced a ~3:1 letterbox that `object-cover` filled by slicing
  the sides off the shot.
- `(pending)`
## v0.2.16 - 2026-07-27 - Step back through the hero

- The hero now has previous / next controls. It advances on its own — when a
  clip ends, or on a timer for a still — so a viewer who wanted the one that
  just passed had to hunt for it in the rail, and could not reach it at all
  once it scrolled out of the rail. Wraps in both directions.
- User-facing: `‹` and `›` sit beside the mute button, top-right of the hero.
- `(514e733)`

## v0.2.15 - 2026-07-27 - Close the Super Admin default credential; hero typography

- **Security (breaking):** `/api/auth` no longer falls back to a hardcoded
  `chaplin@chaplin.in` / `chaplin` when `SUPER_ADMIN_EMAIL` and
  `SUPER_ADMIN_PASSWORD` are unset, and `/admin/login` no longer pre-fills
  those credentials into the form. Previously anyone who opened the login page
  and pressed the button was granted full Super Admin, and the account was then
  created for real in Supabase. Admin sign-in now fails closed with an explicit
  message until both env vars are set; the password must be 12+ characters.
- User-facing: **admin sign-in will stop working on any deployment where those
  two environment variables are not set.** Set them to restore access.
- Hero type scaled up with the taller hero — headline 54px to 74px, supporting
  line 12.5px to 16px, actor name 17px to 21px.
- The hero line now rotates one use at a time (UGC / ads / films / microdramas)
  instead of listing them and trailing off with "and more". Width is reserved
  for the longest word so the line does not jog, the animation is gated behind
  `prefers-reduced-motion`, and the full list is exposed to screen readers.
- Archetype badges moved from top-left to bottom-left on both shelves. The card
  crop is anchored high, so the badge was landing across the actor's face.
- `(72db047)`

## v0.1.60 - 2026-07-26 - Correct Eleven Music v2 plan schema

- Replaced the legacy `sections`, `positive_global_styles`, and
  `negative_global_styles` payload with Music v2's required `chunks` schema.
- Kept exact 8-second and 15-second timing, instrumental section markers, and
  the actor's style palette while emitting only v2-valid composition fields.
- Removed `respect_sections_durations` from v2 requests because Music v2 always
  enforces chunk durations and the compatibility field only applies to v1.
- Added regression coverage that rejects any reappearance of the v1 plan shape.

## v0.1.57 - 2026-07-26 - Full-width trending rail

- Expanded Trending Now from six to ten distinct AI actors so wide screens stay
  filled and the rail has real content available beyond the first viewport.
- Added branded horizontal scrolling with viewport-sized arrow navigation and
  snap-aligned actor cards.
- Stopped Curated Collections from immediately repeating the trending faces by
  sourcing its covers from a separate catalogue pool.
- Passed focused ESLint, strict TypeScript, and local server rendering with all
  ten trending cards present.

## v0.1.56 - 2026-07-26 - Structured Eleven Music composition plans

- Replaced the default overloaded ElevenLabs theme prompt with validated
  `composition_plan` requests that never send the mutually exclusive `prompt`,
  `music_length_ms`, or `force_instrumental` fields.
- Added exact eight-second actor idents with five-second hook and three-second
  identity-hit chunks, plus exact 15-second scene cues split into establish,
  turn, and payoff chunks.
- Added Zod timing and style guards for lyric-free chunk text, chunk limits,
  duplicate tags, directive prose, character-name leakage, and exact totals.
- Added a Studio selector and read-only plan preview, with plan JSON, requested
  duration, and delivered duration preserved in job and asset ledger metadata.
- Kept the previous prompt workflow behind Super Admin's structured-plan toggle,
  where `music_length_ms` and `force_instrumental` remain correctly scoped.
- Passed strict TypeScript, focused ESLint, all 70 library tests, and the complete
  Next.js production build. A paid ElevenLabs generation was not triggered.

## 2026-07-26 - Global audio direction templates and studio fixes

- Voice and theme briefs are now rendered from two global slot templates, so
  every actor is directed on the same slots in the same order and a change to
  how Chaplin briefs a provider is one edit rather than a sweep.
- Fixed the theme brief sending character biography to the music model: mood
  fell back to the dramatic contradiction, so ElevenLabs received a paragraph of
  narrative psychology where genre, mood, and instrumentation belong.
- Fixed a theme regeneration bug where a saved brief was quoted back into the
  next prompt, nesting a whole template and growing it on every pass.
- Fixed the voice brief restating age and gender twice in one sentence.
- User-facing: production can be started from the Scene Studio rail instead of a
  button buried below every scene card; the Studio Productions tab now lists
  productions from the database rather than this browser's local storage.
- User-facing: removed fabricated audience numbers - every actor card read
  "40 fans" from a hardcoded seed, and castings silently invented 55 more each.
- Documented the Seedance 2.0 audio capability probe in docs/SEEDANCE_AUDIO.md.

## v0.1.54 - 2026-07-26 - Locked-voice audiovisual scene delivery

- Added the actor's locked ElevenLabs performance as a Seedance 2.0 audio
  reference so mouth, breath, expression, and pauses follow the real voice
  recording instead of an invented model voice.
- Added one action-derived SFX stem per authored scene and placed every dialogue
  and effect at its corresponding scene timestamp in the finished Punch.
- Preserved each scene's speaking character when selecting the locked voice,
  while keeping the character theme as a controlled music bed beneath dialogue.
- Extended final media manifests and production UI copy to identify locked
  voice, scene effects, room tone, and character theme as delivered audio.
- Kept Seedance 1.5 and open-weight video fallbacks intact; unsupported models
  continue without the multimodal audio-reference field.

## v0.1.51 - 2026-07-26 - Actor social performance stats

- Added per-character social impressions, views, and likes to actor cards,
  homepage featured cards, and actor profile heroes.
- Replaced fan-derived view and like estimates with explicit, zero-safe social
  metrics so an actor never displays invented performance.
- Added additive per-platform `character_social_metrics` storage and
  character-level aggregation for future Instagram, YouTube, TikTok, and other
  social imports.
- Preserved social totals through casting updates and across web and mobile
  character persistence.
- Applied the Supabase migration and passed TypeScript, ESLint with one
  pre-existing test warning, all 50 tests, and the production build.

## v0.1.48 - 2026-07-26 - Curated creator feed and full-viewport home

- Integrated the pending homepage shell and its full-viewport entertainment
  follow-up from the outstanding feature branch into `main`.
- Limited automatic generation posts to themes, verified Character Punch
  dialogue, images, and videos; voice auditions and SFX remain available in
  Studio and Admin logs without appearing in the public feed.
- Applied the same policy while reading existing posts, so older raw voice and
  SFX entries disappear from Feed without deleting their source assets.
- Removed generic audio uploads from the feed composer because public audio
  must now come from a finished theme or Character Punch dialogue generation.
- Added focused policy tests and passed TypeScript, ESLint with one pre-existing
  test warning, all test suites (50 tests), and the production build.

## v0.1.42 - 2026-07-26 - Scene audio and public-gallery safeguards

- Enabled Seedance diegetic location audio for room tone, Foley, machinery, and
  weather while explicitly reserving dialogue and music for the actor's locked
  voice and theme stems.
- Kept discarded identity candidates, character sheets, ensemble frames, and
  images derived from another actor out of public character galleries.
- Synchronized Chaplin's version metadata after the pipeline commits landed.

## v0.1.39 - 2026-07-26 - Stable Magic Write identity ownership

- Distinguished creator-entered names from names generated by Magic Write.
- A new full Magic Write run now treats the brief as authoritative instead of
  locking a previous generated or recovered-draft name into the next actor.
- Persisted name ownership in recoverable drafts while treating older unmarked
  draft names as generated, preventing stale identity carry-over.
- Cancelled delayed field reveals from superseded runs so an older generation
  cannot overwrite a newer actor after its response arrives.
- Passed TypeScript, ESLint with one pre-existing test warning, all four test
  suites (43 tests), and the complete Next.js production build.

## v0.1.38 - 2026-07-26 - Gender-coherent Magic Write identities

- Made Magic Write infer gender presentation from explicit brief pronouns before
  choosing the progressive-draft character name.
- Added a final coherence gate that aligns Claude's generated name with the
  brief while always preserving a name explicitly supplied by the creator.
- Propagated a corrected generated name through the tagline, personality, and
  complete production bible so stale naming cannot survive downstream.
- Added regression coverage for feminine briefs, conflicting model names, and
  creator-supplied name preservation.
- Passed TypeScript, ESLint with one pre-existing test warning, all four test
  suites (43 tests), and the complete Next.js production build.

## v0.1.36 - 2026-07-26 - Visible mobile hero performance

- Separated the homepage performance video from the mobile copy overlay so the
  active video is always visible as its own frame.
- Moved the headline, rotating format, and calls to action beneath the mobile
  video while preserving the desktop split-screen composition.
- Made featured actor thumbnails narrower and taller for a denser horizontal
  carousel, with scrolling fallback on short phone screens instead of clipping.
- Passed TypeScript, ESLint with one pre-existing test warning, all four test
  suites (40 tests), and the complete Next.js production build.

## v0.1.34 - 2026-07-26 - Selectable video seed images

- Added an explicit seed-image picker to the Video stage with compact
  thumbnails for generated, uploaded, and previously saved character stills.
- The chosen thumbnail is now persisted as the exact first frame and sent to
  Seedance, instead of silently falling back to the latest generated image.
- Allowed an intentional creator selection to use any saved character gallery
  image as the video seed, while keeping the identity image as a safe fallback.
- Passed TypeScript, ESLint with one pre-existing test warning, all four test
  suites (40 tests), and the complete Next.js production build.

## v0.1.28 - 2026-07-26 - Unified production workspace header

- Moved Magic Scene into the production header instead of stacking it as a
  separate full-width toolbar.
- Docked Studio Auto above the center editor column so the stage rail and Asset
  Canvas no longer sit beneath an unrelated full-width control layer.
- Replaced the generic `Build prompts` action with clear `Use Magic Scene` and
  `Direct scene` calls to action.
- Passed TypeScript, ESLint with one pre-existing test warning, all four test
  suites (40 tests), and the complete Next.js production build.

## v0.1.19 - 2026-07-26 - Ensemble scenes, generation resilience, hero framing

- Prompt lint no longer cancels paid generation. Two heuristic rules were hard
  gates and both produced false positives: L1 fired on persona boilerplate that
  legitimately repeats across composed prompt slots, and L4 flagged "shoes"
  because the canonical wardrobe sentence did not enumerate footwear. Studio
  Auto halted with Voice and Still in Error as a result. Both are now warnings,
  generic basics are exempt from the wardrobe check, and findings are recorded
  on the job as advisory. `CHAPLIN_BLOCK_ON_PROMPT_LINT=true` restores blocking.
- Video generation now fails over instead of losing the shot. The Dreamina line
  refuses image-to-video whenever the seed still reads as a real person, which
  is exactly what a Chaplin identity still is. The chain is Seedance 2.0 ->
  Seedance 1.5 Pro -> Replicate open weights, and only safety rejections advance
  it. Open-weights models have no vendor likeness filter to trip. Inert unless
  `REPLICATE_API_TOKEN` is set.
- Scenes stopped rendering twice. The auto-preview effect had no re-entrancy
  guard and its batch was only cleared after the whole run, so React
  StrictMode's double invocation started a second batch mid-flight.
- Changing the cast now actually repaints the scenes. The batch captured its
  lead when Magic Writer ran and never revalidated it against the current cast.
- User-facing: the hero performance now plays inside a real 16:9 frame instead
  of being cropped across the full panel width, featured cards are taller
  (4:5 on mobile), and the actor style picker uses a new four-image reference
  set showing one subject rendered realistic, cartoon, anime, and manga.
- Passed TypeScript, ESLint with one pre-existing test warning, and all four
  test suites (40 tests).
- `(b90d7d5)`

## v0.1.18 - 2026-07-26 - Immediate Studio asset previews

- Fixed Studio Auto incorrectly marking whichever open stage as generating for
  the full duration of the automation run.
- Completed dialogue, signature SFX, theme, and still stages now switch from
  progress placeholders to their playable or visible preview immediately.
- Refreshes persisted asset history after every automatic media stage and
  merges concurrent results without dropping assets generated in parallel.
- Passed TypeScript, ESLint with one pre-existing test warning, and the complete
  Next.js production build.

## v0.1.17 - 2026-07-26 - Clean actor creation feedback

- Removed provider attribution and completion boilerplate from the Magic Write
  panel after an actor identity finishes writing.
- Stopped exposing backend field names and raw API validation messages in the
  actor-creation interface; detailed failures remain available in developer
  logs while makers receive a concise retry message.
- Removed duplicated inline status details from the identity-writing card.
- Passed TypeScript, ESLint with one pre-existing test warning, and the complete
  Next.js production build.

## v0.1.16 - 2026-07-26 - Canonical actor workspace logo

- Replaced the improvised circular `C` and separate `CHAPLIN STUDIO` label in
  the actor-creation workspace with Chaplin's canonical transparent wordmark.
- Preserved the existing actor navigation, project field, stepper, and header
  layout while making the brand consistent with the rest of the product.
- Passed TypeScript, ESLint with one pre-existing test warning, and the complete
  Next.js production build.

## v0.1.15 - 2026-07-26 - Visible custom sound directions

- Restored saved and Magic Write custom voice, signature-SFX, and theme
  descriptions beneath their selectors instead of hiding retained content.
- Added explicit custom-direction labels and larger editable voice space in the
  desktop actor identity panel.
- Applied the same retained-content visibility rule to the responsive actor
  creation form.
- Passed TypeScript, ESLint with one pre-existing test warning, and the complete
  Next.js production build.

## v0.1.12 - 2026-07-26 - Clearer Magic Write progress

- Enlarged the Magic Write action and active generation card in the actor
  identity panel.
- Added an explicit current-step counter and promoted the live percentage to a
  large, high-contrast status.
- Increased the progress rail and explanatory copy so generation state remains
  readable inside the narrow desktop creation panel.
- Passed TypeScript, ESLint with one pre-existing test warning, and the complete
  Next.js production build.

## v0.1.11 - 2026-07-26 - Safe prompt handoffs

- Replaced legacy provider-prompt nesting with one-pass named-slot composition
  for voice, signature SFX, and theme generation.
- Added a deterministic Zod prompt linter for duplicated renders, unresolved
  defaults, medium conflicts, visibility-aware identity locks, closed wardrobe
  sets, narrative leakage, atomic SFX, and voice-presentation mismatches.
- Blocked paid provider jobs when their affected prompt card has a lint failure
  and stored the complete lint report in generation-job metadata.
- Added per-card failures, warnings, lint timing, and persisted presentation
  confirmation to the Super Admin Scene Handoff Map.
- Made recognition locks conditional on expression and framing, prevented
  non-canonical garment motion, and corrected legacy runtime first-person
  identity grammar.
- Added a Rukhsar "Ru" Ansari regression fixture, golden handoff assertions,
  malformed-prompt rule coverage, and prompt-lint operating documentation.
- Passed the prompt-lint suite, 22 production/video tests, TypeScript, and the
  complete Next.js production build.

## v0.1.10 - 2026-07-26 - Reference-free fresh identity casting

- Removed the existing actor cover and older scene stills from the live Asset
  Canvas whenever Fresh Identity is selected.
- Added an explicit empty fresh-casting state confirming that no visual reference
  is attached and the rewritten prompt is the only casting input.
- Stopped existing profile media from falsely marking a fresh identity result as
  ready, while preserving canonical-reference previews for Scene Frame mode.
- Renamed the fresh-result action from `Use seed` to `Use as identity` so choosing
  a new face is an explicit profile change rather than an implied generation seed.
- Confirmed the image API discards canonical, requested, and gallery references
  for identity-purpose generations and records a zero-reference request.

## v0.1.9 - 2026-07-26 - Reliable actor creation

- Fixed completed Magic Write actors failing to save when their generated voice,
  SFX, theme, or personality directions exceeded obsolete API length limits.
- Replaced the conditional Magic Write/Create button behavior with explicit
  Create submit actions once all required identity fields are present.
- Added visible missing-field readiness and save-error feedback beside the Create
  action so a blocked actor never fails silently.
- Passed TypeScript, ESLint with one pre-existing test warning, and the complete
  production build.

## v0.1.8 - 2026-07-26 - Live actor creation and split performance hero

- Rebuilt the homepage feature stage as a clear split composition with editorial
  copy on the left, a taller autoplay performance canvas on the right, and the
  active actor seal plus featured shelf underneath.
- Moved the complete Magic Write control to the top of the desktop Write Panel
  and connected its idea field to the full actor identity generation flow.
- Added an instant local identity draft that begins filling name, promise,
  personality, look, voice, SFX, and theme while Claude refines the final output.
- Exposed generated custom voice, signature-SFX, and theme directions as visible,
  editable fields instead of hiding them behind a Custom dropdown.
- Made Create readiness depend on the completed actor fields rather than a delayed
  production-bible reveal, restoring the header and panel Create actions.
- Added constrained native scrolling, branded scrollbars, touch overscroll
  containment, and route-level smooth-scroll isolation to the actor workspace.
- Passed TypeScript, ESLint with one pre-existing test warning, production build,
  local homepage/actor-route HTTP checks, and the instant-draft API smoke test.

## v0.1.5 - 2026-07-26 - Versioned production editor

- Established commit-ordinal Chaplin versions with the initial scaffold at
  `v0.0.0`, one increment per committed change, and base-100 patch/minor rollover.
- Backfilled the complete commit-to-version ledger in `docs/VERSION_HISTORY.md`.
- Added a visible version badge, `/api/build-info`, synchronized web/native/Expo
  versions, a tracked pre-commit version hook, and a GitHub history verification.
- Rebalanced the production editor around a wider desktop Asset Canvas and added
  an active mobile Asset Canvas with live image, video, audio, and recent outputs.
- Replaced shared canned scene prompts with actor-native scene construction and
  blocked repeated motion prompts using exact-frame and persisted-output history.
- Added end-to-end generation timing, estimated remaining time, image polling, and
  richer media-aware generation logs.
- Preserved the existing provider, authentication, feed, character, and production
  work while making the current release directly identifiable in the UI.

## 2026-07-25 - Creative engineering Experiment Ground

- Split Super Admin tooling into Production Controls and a separate Experiment
  Ground at `/admin/pipeline/experiments`.
- Added persistent, isolated A/B experiments for writing, voice, SFX, theme, image,
  and video stages.
- Every experiment snapshots the active production revision and starts with a
  Control and Challenger variant.
- Added shared test input, canonical-character reference selection, editable system
  prompt, provider, model, and complete provider-settings JSON per variant.
- Added effective-request inspection before credits are spent.
- Added real test execution through the selected provider while passing an isolated
  stage override; the live pipeline configuration is never changed by a test.
- Added experiment and variant lineage to generation jobs, including output asset,
  cost, latency, status, error, engineer score, and notes.
- Added side-by-side image, video, audio, voice-preview, and writing-result review.
- Experiment media is explicitly blocked from automatic publication to the creator
  feed.
- Added a guarded promotion gate: a variant needs a successful result and explicit
  winner selection before it can become the next active production revision.
- Preserved the prior production revision in pipeline history during promotion.
- Added protected experiment APIs, database tables, indexes, RLS, and generation-job
  linkage; the Supabase migration was applied successfully.
- Passed production build, TypeScript, targeted ESLint, authenticated API access,
  authenticated page rendering, and database setup checks.

## 2026-07-25 - Character Identity OS and node workspace

### Character system

- Added a versioned `CharacterSystemProfile` to every production bible.
- Added eight canonical reference-sheet targets: front, left/right three-quarter,
  left/right profile, back, full body, and under-pressure expression.
- Added younger, canonical, and older age states while preserving four recognition
  locks across every generated variation.
- Added interaction rules that keep a character in first person, preserve the
  dramatic contradiction, maintain locked voice continuity, and prevent biography
  or system-prompt recitation.
- Added a memory policy with immutable canon, allowed memory types, forbidden
  writes, and separate recent/salient retrieval budgets.
- Added provider-ready character-sheet and interaction prompt composers.
- Added `docs/CHARACTER_SYSTEM.md` as the implementation and data-contract reference.

### Node-based character workspace

- Added `/characters/[id]/system`, a dedicated visual operating system for each
  character.
- Added draggable, persistent desktop nodes for canonical identity, direction
  bible, reference-sheet generation, sheet outputs, voice and sound, memory and
  interaction, scene performance, and reusable media.
- Added a mobile-safe connected stack so the workspace stays readable without a
  giant horizontal canvas.
- Added live angle and age selectors that regenerate the provider-ready reference
  prompt from the character's existing canon.
- Added links between the character profile, node workspace, media library, and
  existing production studio rather than creating a second generation pipeline.
- Added branded canvas and prompt scrollbars plus locally persisted node positions.

### Image-provider controls

- Expanded the Super Admin image model list for OpenRouter-routed Google, OpenAI,
  and Seedream models.
- Kept OpenRouter opt-in: adding `OPENROUTER_API_KEY` makes the provider available,
  while BytePlus remains the default until an administrator changes the pipeline.
- Preserved canonical image references in image-generation requests and kept
  provider usage/cost logging in the existing generation ledger.

### Actor discovery and mobile layout

- Fixed mobile actor-gallery packing so the selected four-column preview no longer
  leaves broken empty cells or pushes the interface outside the viewport.
- Preserved the full-height actor universe, floating Create control, and bottom
  navigation while keeping expanded character previews in place.

### Validation

- Passed the Next.js production build, TypeScript, targeted ESLint, `git diff
  --check`, and HTTP checks for the character profile and character-system routes.
- Provider calls still require populated environment keys and real provider quota;
  build success does not claim that paid generation was executed.
- Added tracked, sanitized web and mobile environment templates while keeping
  `.env.local` and all real credentials ignored.

## 2026-07-24 - Cinematic prompting, creation flow, and native production

### Shot-director knowledge base

- Added a structured library of camera movements with use cases, motion language,
  continuity rules, and anti-patterns.
- Added shot-direction logic that chooses camera motion from the dramatic beat
  instead of appending generic camera language.
- Added image-to-video guardrails: the supplied frame is the visual source of
  truth; prompts describe only visible motion, one camera move, secondary motion,
  and a short failure-focused negative list.
- Added reference-aware character generation so the canonical image remains the
  identity seed for later angles, scenes, and motion.
- Added concise image prompting organized around identity locks, composition,
  lens, camera height, motivated light, wardrobe, material response, and medium.
- Added explicit medium control: photoreal by default, with manga, animation, or
  stylized rendering only when the character canon requests it.
- Added `docs/shot-director-knowledge-base.md`.

### Creation and production UX

- Simplified duplicate Magic controls into a single assisted concept entry point.
- Added a visible writing timeline so users can see when concept, cast, script, and
  production-plan work is active.
- Added scene thumbnails and per-shot preview structure for multi-scene productions.
- Standardized short shots around four-to-five-second generation units that can be
  reviewed and assembled into longer outputs.
- Added clear idle, running, blocked, review, failed, and completed states to the
  production canvas.
- Added direct recovery actions for regenerate, review outputs, exit production,
  and return to the actor profile.
- Kept voice, effects, theme, still, video, approval, and assembly as distinct
  production stages.

### Native creator beta

- Added the isolated Expo application under `mobile/` without replacing the Next.js
  web product.
- Added creator authentication, actor building, editable Spark writing, five-second
  Spark production, library, studio, settings, and native draft storage.
- Added `/api/v1/mobile/*` endpoints for sessions, characters, drafts, prompt
  generation, reference upload, media generation, and library retrieval.
- Added bearer-authenticated native API access and support for an absolute
  `EXPO_PUBLIC_API_URL`.
- Added EAS configuration and native verification scripts.

## 2026-07-23 - Truthful production, playable outputs, and approval flow

### Media output contracts

- Defined ten first-class outputs: identity still, gallery still, poster, Spark,
  Punch, shot package, episode, brand spot, trailer/cutdown, and delivery package.
- Added provider-neutral pipeline runs and ordered steps with idempotency, retries,
  review gates, manifests, generation-job lineage, and explicit terminal states.
- Added versioned episode-shot takes; rejected generations remain traceable and only
  an approved take with a final muxed asset is promoted.
- Added `/api/pipeline`, `/api/pipeline/[id]`, `/api/pipeline/assemble`, and
  `/api/pipeline/mix`.
- Added the `/studio/pipelines` catalog and production boards for Spark, Punch,
  Episode, and Brand Spot workflows.

### Real output and preview behavior

- Connected pipeline success to a persisted media asset with a playable URL and
  asset ID.
- Added a live production canvas showing the latest real frame/video instead of a
  checklist pretending to be output.
- Added explicit "nothing generated yet" and "waiting for first frame" states.
- Added clear human-approval cards and actions at identity/composition and final-shot
  gates.
- Added feed links back to the production or media output so published status is
  not a dead end.
- Added FFmpeg-backed deterministic audio/video assembly for completed Punch output.

### Scene and ad reliability

- Fixed Magic Scene parsing so valid scenes are produced from story concepts even
  when the model response differs from the preferred schema.
- Added local structured fallback scenes when the writing provider cannot return a
  playable beat.
- Made the product reference image the first required input for product ads.
- Carried product identity into script, shot, reference-frame, and video prompts.
- Added scene objective, visible action, dialogue, duration, preview image, camera
  movement, and reference-asset fields to the story model.
- Added meaningful regeneration with higher creative variance while preserving the
  actor's immutable identity locks.

### Character production

- Rebuilt actor production as a staged workflow: voice, dialogue, short SFX takes,
  theme, still, motion, review, and profile selection.
- Fixed ElevenLabs minimum/maximum text-length failures with stage-specific prompt
  normalization.
- Kept the locked voice ID attached to dialogue generation so preview voices do not
  silently replace the selected character voice.
- Added media selection for profile voice, theme, effects, cover, and featured video.
- Added generated video availability above license terms on actor profiles.

### Admin and observability

- Added protected Super Admin login and server-side role checks.
- Added complete generation logs with provider, model, prompt/input, output,
  provider credits, runtime, estimated method, USD, INR, and Chaplin token views.
- Added editable pipeline controls for writing, voice, SFX, music, image, video, and
  pricing assumptions.
- Added generation events to the creator feed across accounts while keeping
  incomplete/private productions out of public Watch surfaces.

## 2026-07-23 - Role-aware product and social platform

- Replaced generic creation choices with exact production formats: Spark (5 seconds,
  1 shot), Punch (15 seconds, 3 shots), Episode (60 seconds, 12 shots), and Brand
  Spot (30 or 60 seconds, 6 or 12 shots).
- Split Create by Creator, Brand, and Super Admin with matching quick actions and
  Concierge intents.
- Added creator/brand email authentication, private drafts, continue-from-draft,
  account-aware creation, and Super Admin access.
- Added the creator feed with posts, images/video, replies, likes, reposts, shares,
  and cross-account generation activity.
- Added series and episode data, pages, and creation paths.
- Rebuilt Watch as a browse surface for stories, Sparks, ads/reels, and series.
- Rebuilt the bottom navigation with persistent Feed, Actors, Create, Watch, and
  Studio destinations.
- Added a full-height actor gallery with expanding playable tiles, rotating format
  copy, and an in-place Create entry point.

## 2026-07-22 - Voice-first Concierge and actor-builder intelligence

### Concierge

- Added the ElevenLabs Conversational AI Concierge with signed server-side session
  URLs and typed-intent fallback.
- Added live listening, speaking, thinking, and handoff states so the orb does not
  look idle while work is happening.
- Added character/video navigation tools and mission telemetry for connection,
  recognition, intent, and builder-open timings.
- Added Claude structured intent for one-sentence actor, video, ad, reel, and series
  creation.
- Added graceful OS-voice fallback and preferred an appropriate Indian narrator
  voice when the live ElevenLabs agent is unavailable.

### Actor builder

- Added multi-select archetype mixes with one leading archetype and supporting
  contradictions.
- Added a required canon brief and blocked Magic Character generation until the
  brief is meaningful.
- Increased structured-generation token budgets and guarded against truncated JSON.
- Disabled adaptive thinking for structured field-writing routes to reduce latency
  variance.
- Added elapsed-time progress feedback for full character-bible generation.
- Added Claude-powered Quick Write and Magic suggestions throughout character and
  scene fields.

## 2026-07-21 - Persistent actor media and first generation pipeline

- Added persistent Supabase character, generation-job, asset, voice, feed, and
  ledger records.
- Added ElevenLabs voice candidates, locked character voice reuse, dialogue, SFX,
  and theme generation.
- Added Seedream image generation and Seedance five-second image-to-video generation.
- Added canonical reference-image reuse for later character scenes.
- Added actor profile galleries, featured images/videos, sound controls, B-roll,
  resume, licensing, earnings, and maker management.
- Added Maker, Caster, Brand, and Super Admin product views.
- Added the initial role-aware homepage, actor shelf, story creation, and casting
  flows.
