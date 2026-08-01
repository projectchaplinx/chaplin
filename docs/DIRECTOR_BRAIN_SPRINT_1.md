# Director Brain — Sprint 1 Goal

Issued 2026-08-01. Supersedes the P1–P4 sequencing in `DIRECTOR_BRAIN_GPLC.md`.
The GPLC's **Limits** and **Checks** sections remain fully in force — preservation,
concurrency, generation ceilings, and visibility are unchanged.

Prior research phase is stopped. Do not restart collection.

---

## The goal

> Convert the research we already have into a **small, trusted, character-serving
> principle set**, prove it on **one real marketplace character in one shot**, and
> ship that shot with a **visible test result** behind it.

Sprint is done when Chaplin has created something, not when the backlog is empty.

---

## Why this goal and not "finish the review"

Measured state of the 282 draft principles:

| Bucket | Count |
|---|---|
| Unclassified | 108 |
| Explicit noise — title cards, credits, contact-sheet caveats | 35 |
| Production design | 34 |
| Sound | 26 |
| Face and framing | 25 |
| Identity and continuity | 24 (heavily false-positive) |
| Blocking and geography | 20 |
| Performance | **12** |

Three problems this exposes:

1. **Wrong sample.** Research concentrated on opening passages, so a large share of
   the corpus describes title cards and credit sequences of public-domain shorts.
   That has near-zero value for 4–5 second character shots.
2. **Low self-confidence.** Many principles hedge themselves — "treat contact-sheet
   evidence as provisional until direct playback verifies." The analysis ran on
   12-frame contact sheets, not motion.
3. **Meta-notes stored as craft.** Several entries record that a source could not be
   reached, phrased as a principle.

Realistic usable yield is **30–40 principles**, not 282. Reviewing all 282 to find
them is the wrong shape of work.

**Chaplin is a character marketplace.** Its moat is that a character stays the same
character across scenes and accumulates followers. So the only craft axes that
matter commercially, in order:

1. **Identity and continuity** — same face, wardrobe, props, across shots
2. **Performance** — tactic, objective, reaction, eyeline
3. **Face and framing** — how a character reads in close coverage
4. **Blocking** — where the character is and where they go

Period accuracy, production design, and title-card grammar are demoted. They are
not worthless, they are just not this sprint.

---

## Deliverables

### D1 — Triage without watching

Classify all 282 draft principles into three lanes. **No video review in this step.**

| Lane | Rule | Action |
|---|---|---|
| **Discard** | Noise, meta-notes, source-unreachable notes, pure title/credit grammar | Mark `rejected` with reason. Row is preserved. |
| **Park** | Real craft, but not character-serving this sprint | Stays `draft`, tagged `parked-sprint-1`. Costs nothing. |
| **Candidate** | Serves identity, performance, face-framing, or blocking | Advances to D2 |

Target: **≤ 40 candidates.** If more survive, tighten — take the strongest 40.

Deliver a **one-page digest**: every candidate as a single line with its bucket,
source work, and confidence. That page is what a human reads. Not 53 videos.

### D2 — Character-relevance ranking

Re-rank the candidates for a character marketplace. Replaces the GPLC ranking weights:

1. **Character axis** (identity / performance / framing / blocking) — heaviest weight
2. **Cross-study agreement** — how many independent studies point the same way
3. **Source strength** — motion-verified beats contact-sheet-only
4. **Production reach** — how many real briefs would retrieve it

Publish the full ranked list in Super Admin. Take the **top 5**.

### D3 — Playback only on the shortlist

The playback gate applies to **promotion, not retention**.

- Everything stays preserved and inspectable. Nothing is deleted.
- Only the **top 5** require direct playback verification before promotion.
- That is roughly **2–3 minutes of footage**, not 27.
- Anything contact-sheet-only that reaches the shortlist gets its passage played
  once to confirm the reading, then promoted or rejected.

Parked and discarded items never need watching, because they are never promoted.

### D4 — Test on a real character

Use an existing marketplace character, not an abstract brief.

- **1 control baseline**: 1 keyframe image + 1 shot of 4–5 seconds, current config
- **5 challengers**: same character, same brief, one candidate principle each
- Ceiling: **6 images + 6 videos**, one cycle. Per GPLC limits.
- Score on the three axes, with **identity and continuity as the hard gate** —
  a beautiful shot with a drifting face is a failure.

### D5 — Visible results

`director_decision_traces` and `director_evaluations` stop being zero. Every test
renders in Super Admin: brief, character, principle under test, control vs
challenger side by side, scores, hard-gate pass/fail, human preference.

### D6 — Ship one shot

The winning configuration produces **one publishable character shot**. That is the
sprint artifact. If no challenger beats control, the honest result is "control
held" — record it, ship the control shot, and say so.

---

## Exit criteria

- [ ] 282 principles triaged into discard / park / candidate, all rows preserved
- [ ] One-page candidate digest exists and is readable in under 10 minutes
- [ ] Ranked list published; top 5 named
- [ ] Top 5 playback-verified — and only the top 5
- [ ] 1 control + 5 challenger tests run, ≤ 6 images and 6 videos total
- [ ] Decision traces and evaluations non-zero and visible
- [ ] One character shot shipped with a linked test result

---

## Explicitly out of scope

- New collection or discovery runs. The pile is big enough.
- Further opening-passage or title-card analysis.
- Multi-shot assembly, 30-second pieces, sequencing.
- Adjacent UI work not on this path.
- Re-queueing the 55 superseded jobs — they were replaced, not lost.
- Manifest triage beyond what a shortlist candidate needs.

---

## Standing rules, unchanged

Preservation triggers stay on. Nothing is deleted. Rejected principles keep their
row and their reason — a rejection is data. Generation stays dormant until D4.
Source media and extracted audio are still deleted after derived assets are
archived; that remains the only permitted deletion.

Report failures first.

---

# Amendment 1 — 2026-08-01, after the first triage run

The first triage run is accepted: 282 principles assessed, 128 discard / 117 park /
37 candidate, nothing lost, no generation spend. The principle-level ledger was the
correct call — study-level status could not express a per-principle decision.

The first ranking pass is rejected, and the reason is not only the weights.

## A1.1 — The real defect: five restatements, not five hypotheses

The rejected shortlist read:

1. Contrast close interpersonal framing with a wider social tableau…
2. Establish a focal figure in close framing, then widen…
3. Hold a wide tableau when the relationship…
4. Shift from a character close-up to a wider frame when…
5. Shift from wide coverage to crowded close framing when…

That is **one principle — "move between close and wide" — restated five times.**
Re-weighting toward identity produces the same failure on a different axis.

**Required constraint, in addition to the weight fix:**

| Rule | Value |
|---|---|
| Max shortlist entries per `character_axis` | **2** |
| Near-duplicate texts within an axis | Collapse to the strongest one |
| Shortlist must cover | **At least 3 distinct axes** |

The point of five tests is five things learned. A cycle that tests one idea five
times has wasted the cycle.

## A1.2 — Do not force identity to fill the shortlist

Measured axis spread:

| Axis | All 282 | Candidates |
|---|---|---|
| framing | 51 | 19 |
| blocking | 19 | 10 |
| performance | 7 | 5 |
| **identity** | **3** | **3** |
| other | 202 | — |

**Only 3 identity principles exist in the entire corpus, and all 3 are already
candidates.** Tightening the identity definition to "explicitly protects face,
wardrobe, props, or reference continuity" will reduce that number, not raise it.

Do not manufacture identity entries to satisfy the priority order. Take the
strongest available under the diversity cap — for example 2 identity + 1
performance + 1 framing + 1 blocking. An honest four-axis shortlist beats a
padded identity-first one.

## A1.3 — Retire the ranking signals that cannot discriminate

| Signal | Measured | Action |
|---|---|---|
| `source_strength` | 243 contact-sheet-only, 39 document, **0 motion-verified** | Cannot reward motion-verified. Drop from weighting until motion-verified evidence exists. |
| `confidence` | 183 high / 93 medium / 6 low | Self-rated "high" on 65% while reading 12 still frames. Overconfident. Drop from weighting. |
| `cross_study_agreement` | Caused the failure — 40 pts overwhelmed a 20-pt axis lead | Cap its contribution below the character-axis weight. |

## A1.4 — Record the identity gap as a first-class finding

This is the sprint's most valuable output. Write it into the corpus as a named
coverage gap with its cause:

> A 12-frame contact sheet can show composition, so the method produced 51 framing
> principles. It cannot show whether a character stays the same across time, because
> persistence requires motion and frame-to-frame comparison. The research method is
> structurally incapable of producing identity/continuity principles — which is the
> single most commercially important axis for a character marketplace.

Next research sprint must use **paired-frame comparison across a passage**, not a
12-cell grid, if identity coverage is the goal.

Preserve the rejected first ranking run as the evidence for this finding. Do not
overwrite it.

## A1.5 — Unchanged

Everything else in Sprint 1 stands: playback verification on the shortlist only,
one control plus five challengers on a real marketplace character, ceiling of 6
images and 6 videos, identity-and-continuity as the hard gate in scoring, one
shipped shot as the sprint artifact.
