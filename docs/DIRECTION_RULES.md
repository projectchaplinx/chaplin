# Direction safety rules

Magic Scene writes the dramatic board. The direction-safety pass then makes that board renderable without rewriting its dramatic objectives. The named house arc is `hook_escalate_reverse_cliffhanger`: hook, escalate cost, reverse power, cliffhanger.

## Identity budget

| Energy state | Maximum readable, identity-locked characters | Other humans |
| --- | ---: | --- |
| `action` | 1 | Anonymous dressing only |
| `sustained` | 1 | Anonymous dressing only |
| `static` | 2 | Anonymous dressing only |

Dressing receives no identity assertion or recognition locks. Faces remain unreadable through distance, backlight, smoke, motion blur, silhouette, or turned-away staging. When an action beat needs two heroes, the generator preserves the beat and splits it into lettered sub-slots such as `3a` and `3b`.

Every selected hero must contribute at least one behavior tell from their production bible or character card somewhere on the board.

## Camera matrix

| Energy state | Allowed camera |
| --- | --- |
| `action` | Locked-off, micro push, or single-axis micro lateral move |
| `sustained` | Locked-off, slow push/dolly in, or slow dolly out |
| `static` | Crane, orbit, dolly, reveal, and other established moves |

Orbit, crane/vertical, whip, and expressive moves are hard-blocked during action. The motion prompt names exactly one moving subject, holds all other people and dressing still except for passive inertia, and states camera drift separately. A locked action camera emits `--camerafixed true`.

## Duration

- The board target is authoritative; solved slot durations must sum exactly to it.
- A measured locked-voice file uses its measured duration plus a dialogue gap.
- When measurement is not yet available, speech receives a conservative word-timing estimate plus the same gap.
- Silent action defaults to 3000-4000 ms.
- The solver may shorten readable, non-action space before violating an action minimum.
- An explicit count such as “three shots” in the brief overrides the format default.
- The renderer and FFmpeg assembler consume every slot’s solved duration; they do not restore a flat four-second duration.

## Dialogue

| Rule | Enforcement |
| --- | --- |
| Dialogue during action | Move to an adjacent readable slot when possible; otherwise cut |
| Speakers per slot | Maximum 1 |
| Voice source | Locked TTS |
| No usable native audio reference | `off_face` framing |

Off-face coverage means hands, profile, listener, rear three-quarter, or reaction coverage. The original locked TTS asset is mixed into the final master.

## Props and weapons

The allowed set is the union of:

1. Props from the selected character card’s wardrobe states.
2. The board’s declared `sceneProps`.

A newly required object is added to `sceneProps` with a reason and `approved: false`. Studio blocks production until every pending prop is explicitly approved. Prompt assembly emits the resulting closed prop set and forbids new objects or weapons.

## Sensitive framing

A slot involving a minor, visible injury, or a weapon pointed at a person is forced to `framingConstraint: "non_readable"`. Prompt negatives prohibit a readable minor in violence, graphic injury detail, and weapon impact on a readable person. The dramatic beat remains; only coverage changes.

## Continuity and motion mode

| Intent | Motion mode |
| --- | --- |
| `CONTINUOUS` heading or physically carried action | `chain` |
| New or non-continuous beat | `forward` |

Chain mode extracts the real last frame of its rendered source clip and uses that persisted frame as the next clip’s starting reference. Chains are capped at three links; the next slot re-anchors as `forward` to control drift.

## Lint contract

Direction lint runs after normalization and again through prompt lint as `L10`. It checks:

- identity budget;
- camera against energy state;
- exact board duration;
- dialogue placement, one-speaker limit, and off-face rule;
- closed props;
- sensitive framing;
- explicit motion mode, valid chain source, and chain depth;
- at least one behavior tell per selected hero.

The war-drop regression fixture starts with four dramatic beats and asserts five safe render slots after the two-hero action split, 15000 ms total, safe action cameras, no combat dialogue, closed weapons, a non-readable child beat, and real chain intent on the continuous descent.
