# Chaplin Video Format Taxonomy — intents, starting points, prompt families

Issued 2026-08-02. Answers: what kinds of videos can someone make with Chaplin,
what should each one ask for up front, and why one generic cinematic prompt is
wrong for most of them.

Grounded in code: all types below already exist in
`src/lib/media-output-definitions.ts`. What is missing is the **intake layer**
(intent → format → questions) and **per-format prompt families**. Nothing here
invents a new pipeline.

---

## 1. The routing principle

A duration is not an intent. "15 seconds" can be a UGC ad, a trailer, a
character reel, or a personality proof — four different prompts, audio
postures, and required inputs. The intake asks **what** first; the format then
implies duration, inputs, and prompt family.

```
WHO are you?            WHAT are you making?          Chaplin asks for…
─────────────           ─────────────────────         ─────────────────
Brand / marketer   →    UGC ad                   →    product image + claims
                        Product hero             →    product image only
                        Brand spot               →    product + actor pick
Creator / fan      →    Character punch (5s)     →    actor pick
                        Character reel (15s)     →    actor pick + vibe
                        Punch (15s proof)        →    actor + brief
                        Episode (60s drama)      →    cast + story
Either             →    Trailer / cliffhanger    →    source master OR cast + hook
                        Spark (5s audition)      →    actor pick
```

## 2. The catalog — status and starting points

| Format | Dur | Wiring today | Intake questions (the "starting point") | Prompt family |
|---|---|---|---|---|
| **Spark** | 5s | ✅ works (shotSteps) | Which actor? | Audition: one beat, face-forward, locked voice line |
| **Punch** | 15s | ✅ works (scene-clips) | Which actor? What's the promise/brief? | Personality proof: 4 authored beats |
| **Character Punch** | 5s | defined, no UI | Which actor? Which mood? | Single performance beat, no product |
| **Character Reel** | 15s | defined, no UI | Which actor? Vibe (3 chips)? | 3 vertical shots, energy-led, hook-first |
| **UGC ad** | 15s | defined, no UI | **Upload the product.** What does it do (claims)? Which actor presents? | Handheld selfie realism — NOT cinematic |
| **Product Hero** | 15s | defined, no UI | **Upload the product.** Hero angle or in-use? | Macro/pack-shot, product is the only star |
| **Brand Spot** | 30s | defined, no UI | Product + actor + one-line story | 6-shot narrative, claims-locked |
| **Spot (managed)** | 30/60s | defined, handlers missing | Managed intake (rights, claims) | Commercial delivery |
| **Episode** | 60s | defined, handlers missing | Cast + story + cliffhanger | Microdrama, 12 shots |
| **Trailer / cutdown** | 5–15s | defined, no UI | From existing master? Or fresh: which characters + what hook? | Tease grammar: cuts, sting, hard stop |
| Poster / stills | — | ✅ works | Purpose | Key art |

The user's cliffhanger example — "5-second, 2–3 characters, stop on crazy
audio" — is the **trailer family at 5s with a fresh-shoot source**, and it is
the strongest wedge format for the character-follower loop: it manufactures
anticipation for an episode that doesn't exist yet.

## 3. Why prompt families, not one cinematic prompt

The current shot prompt speaks one dialect: motivated light, lens grammar,
controlled motion. That is correct for Punch/Episode and **wrong** for:

- **UGC** — the entire value is that it does NOT look directed: phone-height
  framing, available light, imperfect walls, direct address, casual cadence.
  A cinematic UGC ad is a failed UGC ad.
- **Product hero** — no actor, no performance; macro texture, rotation,
  surface light. The identity system is irrelevant; the product IS identity
  (product refs already support up to 8 images in `product-card.ts`).
- **Trailer** — grammar of withholding: fragments, accelerating cuts, audio
  sting, cut-to-black title. It sells the gap, not the scene.

Each family therefore owns:

1. **Look contract** (replaces the one cinematic style block)
2. **Audio posture** — UGC: room + direct voice, no score. Trailer: score
   forward, sting, silence. Hero: sound-design only. Punch: full mix.
3. **Beat table** for its duration (feeds the Seedance 2.5 template work —
   a trailer's 00–05 is hook/withhold/sting; a UGC's is claim/demo/CTA)
4. **Required inputs** enforced at intake, not discovered at render

## 4. Intake UX — the create button becomes role-aware

Replace "format dropdown + duration" with a two-step popup:

1. **"What are you making?"** — cards with plain-language labels ("Sell a
   product with a creator-style ad", "Tease your characters", "Prove this
   character's personality", "Start an episode"). Role hint (brand vs
   creator) pre-sorts the cards; it never hides them.
2. **Format-specific mini-form** — only that format's questions (UGC: product
   upload is REQUIRED before continue; trailer: pick source master or cast +
   hook line). Duration appears only where a format genuinely offers a choice.

`?format=` deep links keep working; the popup is the default path.

## 5. Build order (recommendation)

1. **UGC ad** — clearest buyer intent, product upload flow already exists for
   Spot, `ugc_ad` steps are defined, and it exercises the claims-lock gate.
2. **Trailer (fresh-shoot, 5s cliffhanger)** — cheapest wow, pure
   character-moat play, single shot + sting audio + end card.
3. **Character Reel** — creator retention loop.
4. Then Brand Spot / Episode once multi-shot continuity is instrumented.

Each new family lands as: look contract + beat table + intake form + the
existing pipeline definition it already has. No new pipeline machinery.

## 6. Ties into the research loop

- Format becomes a first-class dimension on every render's provenance and
  evaluation row → per-family kill rates, not one blended number.
- Director Brain retrieval already keys on format signals; per-family beat
  tables replace the single Punch attention map as retrieval targets.
- The 2.5 native multi-shot template (Sprint 2 track) is written per family,
  not once — the beat table IS the family's 2.5 prompt skeleton.
