# Chaplin Changelog

This changelog records user-facing product changes, production-pipeline changes,
provider integrations, and the validation boundary for each major Chaplin update.

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
