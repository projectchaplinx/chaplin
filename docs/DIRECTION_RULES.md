# Direction and shot-job rules

Magic Scene writes the dramatic board. Direction safety preserves its dramatic
objective while compiling it into the strict `ShotJob` contract in
`src/lib/shot-job.ts`. A scene is one job whenever the probed provider duration
allows it. Crossing that ceiling is the only reason to chain jobs.

## Identity and references

- A job may track at most three named characters across all cuts.
- Every tracked character carries the current canonical still or 16:9,
  three-panel character sheet as a `character` reference.
- The selected self-tape audition rides as a `motion` reference in subsequent
  scenes.
- Product shots carry the current product card as a `product` reference.
- A start or end frame pins a moment. It does not replace an identity, product,
  style, motion, or audio reference.
- Extras remain generic and unnamed, with non-readable faces and no identity
  assertion.
- Every cut re-establishes screen position and facing direction. The camera
  stays on one side of the action line.

Character sheets are keyed by character, age state, and wardrobe state. An
appearance change supersedes the old sheet; the replacement sheet is generated
before prompts for the changed appearance.

## Shot grammar

- One beat contains one visible or audible action.
- A shot contains exactly one camera move, or `locked`.
- Stacked actions become separate timecoded beats.
- Camera moves gain `slow` by default. Explicit whip and crash moves retain
  their requested speed.
- Every beat begins strictly inside its shot duration and timecodes increase.
- Shot durations sum exactly to the job target.
- Duration is measured VO plus the dialogue gap when VO exists. Otherwise it is
  derived from beat count and capped by the probed model maximum. There is no
  flat 4000 ms slot default.

## Five seams

| Seam | Contract |
| --- | --- |
| `hard_cut` | Default when the brief is silent. No continuity frame is implied. |
| `frozen_handoff` | The previous rendered clip must end in a freezable state. Its real extracted final frame opens the next shot, whose first action restates that state verbatim. |
| `action_bridge` | Both sides name the continuing motion and its screen direction. |
| `match_cut` | Both sides name the rhyming shape, position, or colour. |
| `portal` | Stylized transition; maximum one per board. |

Brief mapping:

- `seamless`, `one take`, `flow` → `frozen_handoff`
- `cut to`, `meanwhile`, `vignettes` → `hard_cut`
- `morphs into`, `becomes` → `match_cut`

Legacy migration is deterministic: `forward` becomes `hard_cut`, `chain`
becomes `frozen_handoff`, and `ff_lf` becomes explicit start and end frame
assets rather than a motion mode.

## Character sheet and audition

The review sheet is one 16:9 image with four panels: straight-on,
three-quarter, exact side profile, and full body in final wardrobe. It uses a
plain studio background, no props, and no text. The composite is for human
approval only. Chaplin automatically crops every panel into its own stored
asset; only those cropped assets may ride as video references. ShotJob lint
hard-fails any composite reference.

The Studio's **Audition** stage produces two or three self-tape takes. Each is a
locked-off, eye-level medium close-up with shallow focus, a short line with
subtext, a three-quality voice recipe, one named vocal moment, one named
physical behaviour, silence before and after, and an unresolved ending. Only
one rendered take can be selected.

## Project style contract

A board may lock one editable style contract extracted from 5–10 stored
reference stills. The locked paragraph names lens feel, motivated lighting
direction and source, palette, grain, contrast, blocking, atmosphere, and era
markers. Chaplin appends the creator-approved paragraph verbatim to every image
and video prompt on that board. Existing boards without a contract remain
valid. Bare `cinematic` warns unless at least two concrete visual terms support
it.

## Video prompt budget and motion grammar

Image-to-video prompts on verified 1.x/2.0 paths have an 80-word hard cap.
Seedance 2.5 uses a 220-word cap after activation because role-bound
references, described end states, and continuity/sound contracts must survive.
Builder compaction drops
world/atmosphere prose, biography, then lighting adjectives, preserving the
camera move, visible event, identity/reference language, style contract, and
terminal audio negative. Development lint hard-fails overflow; production
records original and trimmed text on the generation job.

Every image-to-video prompt names one camera move or `camera locked`, gives a
visible in-scene event in a separate sentence, and says `No frozen figures`.
Negated stability language belongs in the negative field. Positive direction
states the desired picture behavior.

## Judgment, scheduling, and resolution

Persisted takes carry `kept`, `killed`, or `pending` verdicts plus the one
changed variable: camera, lighting, speed, action, or reference. Board and
character stats report kill rate and the variable most often associated with a
subsequent keep.

Provider work enters a central per-provider queue. Concurrency comes from
pipeline settings. Transient retries reuse the exact same prompt and use
exponential backoff. Reports expose submitted, active, queued, failed, and kept.

VO boards remain VO-timed. Wordless boards set `timeline_authority: score`,
generate the build/peak/quiet/resolve score first, then trim slot durations to
that score. Exploration clips render at 720p, keeper clips at 1080p, and only
the assembled cut is upscaled once to 4K.

## Observable physics

- Direct intent with a named visible move; never describe biomechanics.
- Convert emotion labels into physical action.
- Describe only what can be seen or heard: no smell, thought, or backstory.
- A subject that exits frame is absent for the rest of that shot.
- Compose movement past mirrors, never into them.

## Standing prompt rules

`FILM_LOOK_LINE` is appended to every image and video prompt.
`SKIN_REALISM_BLOCK` is also appended when skin is visible. Every video prompt
ends exactly with `No music. No subtitles.`

The following phrases are hard failures in every prompt:

- ultra sharp
- hyper detailed
- crisp
- razor sharp
- 8K clarity
- HDR
- ultra-realistic detail

Bare lens or aperture numbers such as `50mm` or `f/1.8` warn unless paired with
a visible effect such as perspective compression or background blur. Portraits
reuse `STANDARD_PORTRAIT_NEGATIVES`.

## Provider gate

The configured account lists Seedance 2.5 but returns `ModelNotOpen` when a
task is created. The internal contract therefore stays on the verified 2.0
path. ModelArk has no structured shots field: a single job may carry
prompt-timed beats only after an authenticated probe reports `apiAvailable`.
Model naming alone never activates it. See
`docs/SEEDANCE_CAPABILITY.md`.

The war-drop regression fixture is a single internal 15000 ms job with four
shots, two tracked heroes and their sheets, generic extras, timecoded beats, and
assigned seams. On the current account the adapter safely emits four 2.0
submissions; a future verified transport emits the one job.
