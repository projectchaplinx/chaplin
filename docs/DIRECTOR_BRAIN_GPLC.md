# Director Brain — Operating Contract (GPLC)

Issued 2026-07-31. Applies to the running Director Brain research agent and every
worker it spawns. Supersedes ad-hoc instructions. Read before claiming a lease.

Baseline at issue (measured, campaign `2026.07.31-a`):

- 351 jobs — 67 succeeded, 226 review-required, 55 cancelled, 3 failed, 7 attempt-exhausted, 0 queued, 0 running
- 43 sources · 79 studies (15 approved / 4 rejected / 60 draft) · 456 observations
- 69 approved principles live · 282 draft principles pending
- 53 timed-media packages — all `playback_status: required`, none verified
- 136 manifests — 12 eligible, 15 needs-review, 109 discovered; 8 restricted, 7 sensitive
- **0 decision traces · 0 evaluations** ← the gap this contract exists to close

---

## G — GOAL

Reach one common point:

> Every piece of evidence already collected ends as either an **approved,
> retrievable principle** or an **explicitly rejected record with a written
> reason** — and every promotion is justified by a **visible test result**, not
> by assertion.

Three sub-goals, in priority order:

1. **Preserve.** Nothing collected is lost, ever.
2. **Resolve.** The 282 draft principles stop being a backlog and become decided.
3. **Prove.** `director_decision_traces` and `director_evaluations` stop being empty.

Success is not "more evidence collected." Success is **decided evidence with
test results attached.** Do not grow the pile before draining it.

---

## P — PLAN

Execute in order. Do not start a phase before its predecessor's exit check passes.

### P0 — Preservation (do first, blocks everything)

- Convert all job/study/manifest mutation paths to **append-only**. Retries create
  a new attempt row; they never overwrite a prior result, error, or reviewed state.
- Backfill and preserve the 55 cancelled + 3 failed + 7 exhausted jobs as durable
  history with their original error text. These are training signal, not garbage.
- Populate `cost_usd` on every job. It currently reads 0 across all 351 rows —
  spend is invisible, which means limits cannot be enforced.
- **Exit check:** no code path performs DELETE or destructive UPDATE on
  `director_*` tables. Every existing row still present and readable.

### P1 — Drain the review backlog

- Build one **review surface** at `/admin/director-brain#director-review-queue`:
  the 30-second passage plays beside its contact sheet, waveform, machine
  reading, candidate principles, limitations, and up to three related approved
  studies. Keyboard approve/reject with a required written reason.
- Rank the queue by **coverage gap first** — items whose tags are absent from the
  approved corpus outrank already-covered work.
- Auto-quarantine (never auto-reject, never delete): restricted, metadata-only,
  culturally sensitive, duplicate content-hash, and any candidate principle that
  contradicts an approved principle. Quarantined items stay visible with reason.
- Surface the 7 drafts that carry **no playback gate** (39 principles) as a
  separate "approvable now" lane — these need no video review.
- **Exit check:** draft studies < 10. All 53 timed-media packages carry a
  playback verdict (verified or rejected). Manifest `discovered` count → 0.

### P2 — Close the evaluation loop

This is the missing half of the system. Until it exists, no promotion is earned.

- Every writing and render run emits a `director_decision_traces` row: which
  rules fired, which period profile, sources, attention map, provider, outcome.
- Every generated result gets a `director_evaluations` row scored on the three
  existing axes — intent following, temporal continuity, aesthetic quality —
  with geography, identity, period, prompt, prop, screen-direction, and audio
  continuity as **hard gates**. A clean image never hides a gate failure.
- Automatic scoring is permitted but must be **labelled as automatic**. It never
  presents itself as a human review and never carries approval authority.
- **Exit check:** both tables non-zero and visibly populating in Super Admin.

### P3 — Test-in-place scenario harness

When a candidate principle looks good, test it immediately. Do not queue it for later.

- Run the same brief through **Control** (current config) and **Challenger**
  (config + candidate principle).
- Score both against all applicable dimensions. Require a passing control.
- Promote only when **all** hold: challenger beats control by the configured
  threshold · zero hard-gate regression · zero declared-target regression ·
  at least two independent sources or one controlled Chaplin experiment ·
  explicit human preference recorded.
- Store comparison, rubric, and both outputs with the promoted config revision.
- **Failed hypotheses stay in the ledger.** A rejected test is data. Never delete.
- **Exit check:** every principle promoted after this date has a linked test row.

### P4 — Bounded expansion

Only after P2 exit check passes. Re-queue the 55 cancelled and 7 exhausted jobs.
Fix the three known breakages first: `tile.loc.gov` ffmpeg stream failures,
source 403s, Smithsonian 429 quota. Configure `DPLA_API_KEY` or record it as a
visible blocker. Then expand coverage by measured gap, not by appetite.

---

## L — LIMITS

Hard ceilings. Exceeding any of these is a contract violation — stop and report.

### Data preservation

| Rule | Value |
|---|---|
| Delete any `director_*` row | **Never** |
| Overwrite a human-reviewed state | **Never** |
| Overwrite a prior error or result | **Never** — append a new attempt |
| Retry scope | Failed or empty-evidence jobs only |

### Concurrency

| Rule | Value |
|---|---|
| Global research leases | **4** (`DIRECTOR_RESEARCH_CONCURRENCY`) |
| Per-provider LOC / Europeana / Smithsonian / DPLA | Serial — 1 at a time |
| Met requests | Max 2 |
| Concurrent generations | **2** |

### Generation volume — learning-first, generation dormant

**Default posture: generation is OFF.** The agent's job is learning. Image and
video generation is the expensive tail of this system and stays closed until
learning has earned it. No render happens without a named candidate from the
top-5 shortlist and a queued test.

One image and one shot per test. Nothing assembled, nothing sequenced.

| Rule | Value |
|---|---|
| Per challenger test | **1 keyframe image + 1 video shot** |
| Video shot length | **4–5 seconds** |
| Control baseline | Rendered **once per brief**, then reused across every challenger |
| Control re-render | Only when the base config revision changes |
| Candidates tested per cycle | **Max 5** — the shortlist, nothing else |
| Ceiling per cycle | 6 images + 6 videos (1 control + 5 challengers) |
| Cycles per day | **Max 1** |
| Batch trigger | Explicit — never self-triggered |

Reusing one control baseline is what makes A/B affordable: each new candidate
costs one image and one shot instead of a matched pair. Hundreds-at-once is
prohibited. If the queue implies more, it waits for the next cycle and the
report says so.

### The top-5 gate

Learning output does not flow into generation. It flows into a **ranked
shortlist**, and only the top 5 cross into testing.

Rank every candidate principle by:

1. **Coverage gap** — does it cover tags absent from the approved corpus?
2. **Source strength** — independent sources, or a controlled Chaplin experiment
3. **Cross-study agreement** — how many separate studies point the same way
4. **Production reach** — how many briefs would actually retrieve it

Publish the full ranked list in Super Admin. Everything below rank 5 stays
learning-only and costs nothing. The shortlist refreshes each cycle as review
decisions land, so a principle can rise into the top 5 later.

### Shot and duration contract

**The single 4–5 second shot is the whole unit.** Not a piece, not an assembly,
not a 30-second cut. One image and one shot is the entire deliverable of a test.

Multi-shot assembly is **deferred**. Once top runners emerge from testing, we
decide what to build from them. Until then the agent does not plan, sequence,
or render anything longer than one shot.

| Rule | Value |
|---|---|
| Unit of work | **One 4–5 second shot** |
| Shots rendered per test | **1** |
| Keyframe images per test | **1** |
| Assembled pieces / multi-shot cuts | **Deferred — do not build** |
| 30-second pieces, full videos, episodes | **Prohibited** |
| Generation mode | `punchGenerationMode: "scene-clips"` — never `single-take` |

Each shot still declares its story job, frame, camera, action, sound, world, and
what it would hand off to a next shot. The handoff is recorded as **evidence for
later assembly**, not as an instruction to render one.

> **Do not confuse this with research passages.** The 53 timed-media packages
> analyse 30-second passages of public-domain source film. That is evidence
> collection and it is unchanged. This limit governs what Chaplin *generates*,
> not what it *studies*. Do not re-cut, shorten, or re-run existing research
> passages on account of this rule.

**Do not extend the attention map.** `buildAttentionMap()` accepts arbitrary
duration, but no longer-form job table is needed or wanted. A single shot draws
the 4–5 seconds of story job it needs. Longer attention maps get designed when
assembly is un-deferred, not before.

### Learning boundary — unchanged, non-negotiable

No transcript, dialogue, lyrics, subtitle, screenplay text, or full source film
is ever stored. Dialogue is described by function ("withholds the answer"),
never transcribed. Source clips and extracted audio are deleted immediately
after derived assets are produced. **This is the one deletion that is required.**

Human gates are not automatable and not removable:

1. A person plays the exact source passage and verifies or rejects the machine reading.
2. A person separately approves the resulting study.

The agent may rank, batch, pre-fill, and quarantine to make these fast. It may
not skip, infer, or self-grant them. `discovered → eligible → approved study`
stays a three-state ladder; only the third state reaches Magic retrieval.

---

## C — CHECKS

### Visibility requirement

Every test and its result must be visible in Super Admin without reading the
database. The Director Graph and Learning sections currently render empty —
they are the required surface. A test that ran but cannot be seen did not count.

Each test row must expose:

- the brief, and which principle is under test
- Control vs Challenger side by side, both playable
- the one 4–5 second shot with its duration, story job, and continuity handoff
- scores on all three axes, with hard-gate pass/fail called out separately
- the recorded human preference and its written reason
- provider, model, response IDs, usage, cost

### Report after every run

State plainly, no rounding up:

1. Jobs claimed / succeeded / review-required / failed — and **why** each failed
2. New observations and candidate principles, with their review state
3. Tests run, tests passed, tests **failed** — failures listed first
4. Principles promoted, with the linked test ID for each
5. Items quarantined, with reason
6. Spend against the daily ceiling
7. What was skipped because a limit was hit

### Stop conditions — halt and report, do not work around

- Any limit in this contract would be exceeded
- A destructive operation is the only way forward
- A human gate blocks progress
- A source's rights basis is unclear or an item is culturally sensitive
- The evaluation loop is still empty and a promotion is being requested

Report honestly. A failed test reported is worth more than a passed test assumed.
