# Chaplin Shot Director Knowledge Base

This is the production contract for generated scenes. The executable version lives in
`src/lib/shot-director.ts`; the controlled camera vocabulary lives in
`src/lib/camera-movements.ts`.

## Core production model

1. Lock the runtime, shot count, cast, product, hero props, and reusable locations.
2. Create or select one reference still for each materially different shot angle.
3. Treat that still as the exact first frame and visual source of truth.
4. Generate one continuous four-second shot per scene.
5. Generate dialogue, effects, room tone, and music as separate layers.
6. Review usable ranges, regenerate only failures or missing bridges, then assemble.

## Asset and identity locks

- Actor references lock face, apparent age, hair, body proportions, wardrobe, materials,
  palette, marks, and asymmetry.
- Product references lock silhouette, packaging, label placement, cap, colors, materials,
  and proportions. A full-product view and label close-up are preferred when both shape
  and typography matter.
- Avoid ambiguous reference sheets containing multiple competing faces. A body reference
  must not introduce a second facial identity.
- Hero props and locations are named assets. Prompts state the asset owner and contact:
  for example, “her right hand grips the pen against the paper,” never merely “a pen writes.”
- Reference lighting transfers into generation. Prefer cinematic or neutral/flat reference
  lighting that can plausibly belong in the target world.

## Image prompt structure

Use this order:

1. Purpose and scene number
2. Exact four-second dramatic objective
3. Setting and spatial geography
4. First-frame action
5. Actor identity lock
6. Product/prop lock
7. Framing, angle, lens, and planned movement space
8. Motivated lighting
9. Continuity anchors
10. Realism or explicitly requested stylization
11. Exclusions

The image is a playable first frame, not a character biography, poster, fashion portrait,
or summary of the entire story.

## Video prompt structure

Keep video instructions short and executable:

- `0.0–0.8s`: establish the supplied frame and starting positions.
- `0.8–3.2s`: perform one body action and one facial beat.
- `3.2–4.0s`: land the action and hold the changed final state.
- Name one camera path from the controlled camera catalog.
- Preserve the first-frame axis, height, horizon, lens, scale, lighting, geography,
  object count, and screen direction.
- Anchor important off-camera asymmetry when the reference cannot show it.
- Keep picture silent. Audio is generated and mixed separately.

Do not request cuts inside a four-second generation. A new angle is a new scene with a
new still. Timestamp prompting organizes action inside one shot; the Chaplin timeline
organizes cuts across shots.

## Model-aware guardrails

- Crowds: one lead action, restrained background reactions. Avoid many people performing
  separate gestures.
- Hands and props: state the exact hand, grip, surface, direction, and transfer. Isolate
  intricate contact, liquid pouring, or mechanical transformation into its own shot.
- Physical interaction: avoid multi-person pushing, wrestling, or hand-offs unless the
  action is the only job of the shot and positions are explicit.
- Geography: preserve screen-left/screen-right positions and left-to-right/right-to-left
  travel. Carry a successful frame forward when placement matters.
- Camera: one motivated movement. No teleporting, angle jump, reframing reset, or
  simultaneous unrelated moves.
- Identity: no beautification, averaging, recasting, age shift, costume replacement, or
  disappearing marks.
- Product: no relabeling, morphing, rescaling, vanishing, floating, or incorrect usage.
- Style: default to photoreal live action. Use animation, manga, illustration, or CGI only
  when the concept explicitly asks for it.

## Review and recovery

- Grade generated clips by usable time ranges; do not discard a good section because the
  tail failed.
- Regenerate the missing action or bridge, not the whole film.
- Crop peripheral defects when composition survives.
- Flip only when labels, handedness, lighting, and geography remain valid.
- Reverse only when physical action still reads correctly.
- Carry sound across cuts to join independent shots; dialogue or effects may begin before
  the corresponding image appears.
- Track attempts, usable ranges, cost, and failure reasons in generation logs.

## Camera selection policy

The full catalog contains restrained, moderate, and high-energy movements. Chaplin chooses
from intent-specific pools:

- Establishing: crane, reveal, through-shot, or controlled pullback
- Dialogue/pressure: dolly-in, over-shoulder, rack focus, optical push, slow arc
- Product proof: rack focus, tilt-down, lateral truck, macro, or snap zoom
- Action: leading, following, side tracking, handheld, fast dolly, or ground tracking
- Unease/horror: slow push, Dutch roll, zolly, POV, or focus reveal
- Spectacle: precise orbit, bullet time, FPV dive, or large aerial orbit
- Resolution: pullback, crane-up, zoom-out, slow arc, or pedestal rise

High-energy movements are never automatic defaults for quiet dialogue. The user can
override every selected movement before generation.

## Identity-image compression contract

An identity image is a casting reference, not a biography or a story treatment. The
prompt sent to an image model must remain short enough for every instruction to carry
visual weight.

1. **Medium is binding.** Preserve explicit manga, anime, illustration, animation, CGI,
   or photographic language. Use cinematic live action only when the maker did not name
   another medium.
2. **Describe only what the frame can show.** State anatomy, hair, wardrobe, expression,
   gesture, set, camera, motivated light, and palette. Do not restate motives, backstory,
   symbolism, or plot.
3. **Use exactly four recognition locks.** Prefer one hair invariant, one facial invariant,
   one garment invariant, and one signature accessory or prop. These four remain fixed;
   pose, set dressing, framing, and scene action may change.
4. **Separate exclusions.** A short negative line prevents medium drift, generic faces,
   costume drift, extra people, typography, and watermarks.
5. **Scene prompts inherit the locks.** Each still reuses the four locks and the requested
   medium, then adds only the current playable moment, camera, light, and scene world.

Canonical output shape:

`<medium>. 16:9. <subject, visible anatomy, hair, wardrobe, expression/gesture>. <world, camera, light, palette>.`

`Negative: <medium-specific exclusions>.`

`Recognition locks: <lock 1>; <lock 2>; <lock 3>; <lock 4>. Everything else may move.`

## Frame-grounded image-to-video contract

This contract supersedes the older timestamp-based video structure above.

- The accepted scene image, not the script or actor biography, defines what exists.
- Inspect the actual first frame after still generation and before writing motion.
- A motion prompt may name only visible subjects, body parts, props, and environmental
  elements. If the crop does not show a hand, door, coat hem, or room, it cannot animate it.
- Request one subject-motion beat, one named camera move, optional subtle environmental
  motion already supported by the frame, and one ending state.
- Use ordering words such as hold, then, follows, and ends on. Do not request percentages,
  exact stop times, lens continuity, or frame-by-frame choreography.
- Do not restate identity, wardrobe, composition, palette, lighting, or source-of-truth
  instructions. The image supplies them.
- Keep the negative line to four failures relevant to the visible crop.
- If the scene concept requires geometry absent from the frame, regenerate the still first.

Close-up example:

`Hold for a beat. Slow push in. The eyes shift right, then the head follows a few degrees late. One slow blink. Faint breath in the shoulders. Background haze drifts. Ends on stillness, camera fully stopped.`

`Negative: warped face, lip movement, camera cut, invented objects. --duration 5`

## Director research and World Atlas contract

The campaign queue, the evidence library, and the knowledge available to Magic are three
different states. The interface and server must never present them as interchangeable.

1. **Queued source:** a rights-bounded pointer and research question. It is not knowledge
   and may not enter a production. An in-progress job is real only when the durable job
   ledger shows a lease, phase, progress, and attempt.
2. **Draft or reviewed study:** attributable observations with time, page, section,
   record, object, API-field, or benchmark locators; abstract candidate
   principles, uncertainty, and provenance have been recorded. The evidence is visible to
   reviewers but remains blocked from generation.
3. **Approved study:** a human has recorded an approval reason. Only then may matching
   abstract principles, their time/place coordinate, and their evidence boundary be
   retrieved into a Director Brain prompt and decision trace.

Research execution is bounded to four concurrent leased jobs. Text documents and provider
documentation may produce draft studies through GPT-5.6 Terra structured output. Collection
connectors stop for item selection and item-level rights review; catalog/provenance sources
stop for a reusable-item decision; timed media stops until contact-sheet, audio, and human
playback evidence exist. Transient failures retry at most three times. A server restart or
closed browser cannot erase queued work, and rerunning the same source/contract is idempotent.

The World Atlas is an evidence-coverage map, not a generic period-style picker:

- Every cell is the intersection of an era band and a broad region.
- A hard-coded period profile is a **baseline**, never proof that the cell is researched.
- A cell becomes **verified** only when at least one approved study is explicitly tagged as
  world evidence and resolves both a usable period and region.
- Eight evidence layers are tracked separately: built environment; transport and
  infrastructure; costume and body; objects and materials; work and domestic life; sound
  and acoustics; social and ritual context; capture and image language.
- A year alone never resolves a world. Place, community or role, season or time, and the
  immediate location remain required production coordinates.
- Empty cells remain visible gaps. Generation must stay neutral or ask for missing context,
  never fill gaps with decade shorthand or untraceable invention.
