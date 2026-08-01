# Director Brain — GPSC (Sprint 2)

Issued 2026-08-01. Supersedes the human playback gate in `DIRECTOR_BRAIN_SPRINT_1.md`.
Sprint 1 is closed: 282 principles triaged, 5 shortlisted, 5 human-verified, all
preserved. Those five verdicts stand as the calibration set for everything below.

The preservation contract in `DIRECTOR_BRAIN_GPLC.md` remains fully in force.

---

## G — GOAL

> Stop gating knowledge on a person watching archive footage. Let the machine
> verify, rank, and generate — and let the **generated output** be the test a
> human judges, after the fact, at their own pace.

The shift: human attention moves off *inputs* (old documentaries) and onto
*outputs* (Chaplin's own shots). Judgement is spent where it is uniquely
valuable and nowhere else.

---

## P — PLAN

### P1 — Automated verification replaces human playback

The human playback gate is **removed as a blocker**.

Replace it with a dense-frame verification pass:

| | Sprint 1 (research) | Sprint 2 (verification) |
|---|---|---|
| Sampling | 1 frame per 2.5s, 12 cells | **2 frames per second** |
| Frames per 30s passage | 12 | **~60** |
| Purpose | Discover observations | **Test whether the claim survives motion** |

The verifier is adversarial: it is asked to **refute** the principle, not confirm
it. Default to `refuted` when uncertain. A principle passes verification only if
the dense pass fails to refute it.

Calibrate against the five human verdicts from Sprint 1 — four held, one was
initially misread from a single frame. If the automated verifier disagrees with a
human verdict on those five, the verifier is wrong and needs correcting before it
runs on the rest.

### P2 — Auto-rank and auto-shortlist

Unchanged from Amendment 1: character-axis weighting, **max 2 per axis**,
near-duplicate collapse, minimum 3 axes represented. No human step.

### P3 — Generate the comparison set

**One brief. One character. One prompt. Many versions.**

The brief and the character are fixed and identical across every version. The
*only* thing that varies is the injected principle. That is the experiment.

| Version | Injected |
|---|---|
| V0 — Control | Current config, no new principle |
| V1–V5 | Control + exactly one shortlisted principle each |

Each version renders at **two durations**:

- **5 seconds** — one shot. Tests whether the principle helps a single beat.
- **15 seconds** — three shots of 5 seconds. Tests whether it survives assembly
  and continuity across cuts.

### P4 — Auto-score, then human review whenever convenient

Every render is scored automatically on the three axes, with identity and
continuity as hard gates. Scoring is **labelled automatic** and carries no
promotion authority.

Results land in a gallery. The human comes back when they want, watches the
versions side by side, and picks what actually worked. **That pick is the
promotion decision.** Nothing is promoted without it, and nothing waits on it.

---

## S — SCOPE

### Generation matrix and ceiling

| Item | Value |
|---|---|
| Briefs | **1**, fixed |
| Characters | **1**, with locked reference images |
| Versions | **6** (V0 control + V1–V5) |
| Durations | **2** (5s and 15s) |
| Keyframe images | **6** — one per version, reused across both durations |
| Video renders | **12** — 6 versions × 2 durations |
| Shot length | **5 seconds**, always |
| Cycles per day | **1** |

15s is assembled as **3 × 5s shots**, not a single long generation. Shot length
never changes; only the number of shots does.

### What the human gate is replaced with — and what stays automatic

**Removed:** human playback verification of research passages. This was a quality
check on public-domain material, and a denser automated pass plus the generation
test does the same job better.

**Kept, and fully automatic — no human time:** restricted, metadata-only, and
culturally sensitive records still cannot promote. That filter reads metadata
flags, costs nothing, and is the only one carrying real downstream risk. It never
asks anyone to watch anything.

Also unchanged: no transcripts, dialogue, lyrics, or subtitles are ever stored;
source media and extracted audio are still deleted after derived assets are
archived.

### Out of scope

- New research collection runs.
- More than one brief or character this cycle — varying them destroys the comparison.
- Durations other than 5s and 15s.
- Promoting anything the human has not picked from the gallery.

---

## C — CHECKS

### Must be visible without touching the database

- All **6 versions** side by side at both durations, playable
- For each: the injected principle, its axis, its source work, its verification verdict
- Auto-scores per axis, with hard-gate pass/fail called out separately
- The identical brief and character shown once, so it is obvious what was held constant
- A clear **"pick this one"** action that records the promotion

### Exit criteria

- [ ] Dense-frame verifier built and calibrated against the 5 human verdicts
- [ ] All 37 candidates auto-verified; results recorded, nothing deleted
- [ ] Shortlist regenerated under the diversity cap
- [ ] 6 keyframes + 12 renders produced, within ceiling
- [ ] `director_evaluations` non-zero and visible
- [ ] Human has picked winners from the gallery; picks recorded as promotions

### Report after every cycle

Failures first. Specifically:

1. Which principles the dense verifier **refuted**, and on what evidence
2. Any disagreement between the verifier and the 5 human verdicts
3. Renders that failed a hard gate — especially identity drift
4. Spend against the 6-image / 12-render ceiling
5. What was skipped because a limit was hit

A cycle where the control wins is a valid result. Record it and say so plainly.
