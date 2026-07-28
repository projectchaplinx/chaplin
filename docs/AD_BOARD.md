# Chaplin Ad Board

The ad board is Chaplin's typed directing contract for an eight-slot commercial.
It is stored inside the existing media-pipeline run `spec`; slots continue to
use the existing shot, take, generation-job, media-asset, QC, and ledger paths.

## Columns

| Column | Contract |
| --- | --- |
| `id` / `slot_no` | Stable slot ID and house position 1–8. |
| `segment` | Arc beat such as `THE CHAOS`, `THE TURN`, or `THE CLOSE`. |
| `description` | The visible dramatic event, not provider prose. |
| `camera` | Framing, movement, and stability. Stability tracks the psychological state. |
| `color_light` | Grade state: harsh contrast → neutral reset → warm white → controlled saturation. |
| `set` / `weather` / `location` | Physical ambience sources; biography and narrative are excluded. |
| `audio.music` / `audio.sfx` | Legacy score and physical-effects direction. |
| `audio_plan` | Resolved layer ownership and audited per-layer overrides. |
| `screen_text` | Sparse overlay copy. It is null throughout chaos slots 1–3. |
| `vo_line` / `vo_kind` | Written before picture timing. Mode A uses emotional counterpoint; Mode B may explain function. |
| `duration_ms` | Measured TTS duration plus 350 ms after narration or a 500 ms dialogue head offset. Silent slots are 4000 ms. |
| `image_prompt` | Provider-ready first/last-frame prompt carrying identity, wardrobe, and age state verbatim. |
| `motion` / `motion_reason` | Forward, chain, or first/last-frame contract. Target-frame mode requires a recorded reason. |
| `tier` | `draft` exploration is 720p; `final` keeper clips are 1080p. Only the assembled master is upscaled once to 4K. |
| `status` | Draft → still approved → queued → rendering → rendered, or failed. |

`identity_block`, `wardrobe_state`, and `age_state` are immutable continuity
fields on every slot. A chained slot inherits them from its source; a wardrobe
change inside a chain blocks queueing.

## Per-slot audio ownership

Each slot carries a Zod-validated `audio_plan` with four independently owned
layers:

- dialogue is `native` only when the persisted locked ElevenLabs TTS asset is
  attached as Seedance reference audio; otherwise it is `post_mix`
- ambience is native when the active model produces audio, otherwise generated
- SFX is native only for visible shot-scoped actions; signature or frame-exact
  events stay generated through the atomic SFX path
- music is always `post_mix`, as one continuous board-level bed

Dialogue, ambience, and SFX overrides require a new owner, typed reason,
operator, and timestamp. Music is not overridable, and dialogue can never be
`generated`. `audio_mode: "legacy_stems"` preserves the previous all-post-mix
behavior.

Assembly probes every rendered clip for an audio stream. Confirmed native audio
is retained once; generated and post-mix layers are added separately. Missing
native dialogue safely falls back to the locked TTS stem. Music ducks 15dB
under narration and 20dB under character dialogue before the master is
normalized to -14 LUFS.

## House arc templates

Both templates contain exactly eight slots and pivot at slot 4.

### `problem_solution`

1–3 are escalating chaos: handheld or dutch framing tightens toward an ECU,
grade stays harsh and high contrast, screen text remains absent, and the product
does not appear. Slot 4 is the silent neutral-gray reset and first product
appearance. Slots 5–7 parallel the opening failures as increasingly controlled
payoffs using static, dolly, track, or orbit movement and warmer light. Slot 8
uses glamour material ECUs and resolves into the product lockup.

### `journey_delivery`

Slot 1 establishes the need and geography; 2–3 travel with locked screen
direction; 4 is the human pivot and first product appearance; 5 arrives; 6–7
reveal concrete outcomes; and 8 closes on product glamour and lockup.

The product may appear only in slots 4 and 8. An operator can override that rule
only by recording `product_override_reason`.

## Board modes

- `emotional_counterpoint` (Mode A): voice-over must add meaning rather than
  describe the visible action. A keyword-overlap heuristic emits a warning,
  allowing the operator to make the final editorial judgment.
- `functional_explainer` (Mode B): voice-over may explain function directly.

## Motion decision tree

```text
Does this shot need a supplied destination image?
├─ Yes → ff_lf
│  ├─ first and last frame assets required
│  ├─ operator reason required
│  └─ warning: target-frame mode compresses timing; motion may rush
└─ No
   ├─ Must it continue exact spatial motion from the previous rendered clip?
   │  ├─ Yes → chain
   │  │  ├─ source slot must be rendered
   │  │  ├─ FFmpeg extracts the actual frame at -0.1 s
   │  │  ├─ extracted PNG is registered as a reference media_asset
   │  │  ├─ warn at chain depth 2
   │  │  └─ after 3 links, re-anchor from the canonical reference
   │  └─ No → forward
   │     ├─ animate only from the approved still
   │     ├─ no described destination
   │     └─ remove "ends on", "lands on", and "final frame" language
```

## VO-first render order

1. Write all `vo_line` values.
2. Generate TTS with the actor's locked ElevenLabs voice through the existing
   speech path.
3. Measure each stored track with FFprobe (FFmpeg metadata is the fallback).
4. Set `duration_ms` from measured audio plus the correct editorial gap.
5. Split anything over 5000 ms into independently rendered `4a`, `4b`, and so
   on. A long line is never stretched over one video clip.
6. Render every board slot at draft tier unless the operator promotes it.

## Assembly

The board assembler normalizes each render slot to its measured duration:

- Long clip: trim.
- Short clip: `tpad=stop_mode=clone` to hold the real final frame.
- Missing clip with a still: hold the supplied still.
- Missing clip and still: carry the preceding slot's extracted final frame.
- First slot with no media: use the canonical reference; if even that is
  absent, fail rather than insert black.

VO and SFX are placed at their measured slot offsets. Music ducks 15 dB during
VO and the delivered mix is normalized to -14 LUFS. The saved Spot asset records
slot tiers plus estimated and actual board spend in metadata and is attached to
the existing assembly/mastering/review pipeline steps.
