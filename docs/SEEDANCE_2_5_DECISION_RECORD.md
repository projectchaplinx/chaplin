# Seedance 2.5 architecture decision record

Date: 2026-08-04  
Scope: ModelArk API used by Chaplin, not CapCut/Dreamina consumer UI.

## API claims to verify

| Item | Decision | Reason |
| --- | --- | --- |
| 30-second single generation | UNVERIFIABLE | The account lists 2.5 but task creation is `ModelNotOpen`, and public ModelArk docs do not publish a 2.5 duration field range. |
| Ultra-long 30-180 seconds | UNVERIFIABLE | No verified ModelArk parameter or callable control supports this claim. |
| Extension 4-30 seconds/pass, 60-second ceiling | MODIFIED | `VideoExtension` is declared, but the numeric limits are unverified; Chaplin adds a gated extension prompt and keeps frozen handoff as fallback. |
| Video editing | ADOPTED | `VideoEditing` is a declared 2.5 task type, represented as a generic capability only. |
| Subject/wardrobe/background swap | UNVERIFIABLE | Generic editing does not prove specialized swap schemas or quality. |
| Background-music strip preserving dialogue | UNVERIFIABLE | No verified ModelArk request field or account control establishes selective stem removal. |
| 30 image / 10 video / 10 audio references | UNVERIFIABLE | The public API currently verifies 9/3/3 for 2.0, not the claimed 2.5 budgets. |
| Timestamp adherence | MODIFIED | Time ranges remain prompt budgets, not frame-exact API fields. |
| Native clip joining | REJECTED | No structured join parameter is exposed; Chaplin assembly remains authoritative. |
| Green screen | MODIFIED | It remains a prompt plus post-compositing workflow, not a provider capability flag. |
| Storyboard-grid input | MODIFIED | A grid can be one image reference for composition, but never identity truth or a structured shot array. |
| Per-language on-screen text control | UNVERIFIABLE | No ModelArk control field is verified; Chaplin continues to avoid generated readable text. |
| Audio-only generation | REJECTED | The public multimodal contract requires image or video input. |

## Reported behavior and prompt findings

| Item | Decision | Reason |
| --- | --- | --- |
| Original frames remain untouched during extension | UNVERIFIABLE | Extension is declared but not callable on this account, so the preservation claim is not yet observed. |
| 1-8 subject identity integrity | UNVERIFIABLE | A valid matched-reference A/B could not run before model activation; the three-character job cap remains. |
| Negatives obey reliably | UNVERIFIABLE | This is a quality claim, not an API surface guarantee. |
| Dedicated `[SOUND]` no-music directive | ADOPTED | It is harmless prompt grammar and now accompanies Chaplin's post-mix music ownership. |
| Role-bound references with exclusions | ADOPTED | The compiler now states what every reference defines and what must not leak. |
| Long-form identity consistency sentence | ADOPTED | The exact same-face/wardrobe/body continuity line now closes multi-beat prompts. |
| Explicit crowd variety | ADOPTED | Generic extras now vary clothing, hair, features, and movement timing. |
| `(music)`, `<sfx>`, `{dialogue}`, `【subtitles】` markup | REJECTED | ModelArk exposes no parser contract, and it conflicts with Chaplin's owned audio-plan fields. |
| One primary change per stage | ADOPTED | Existing beat validation already enforces one visible action per beat. |
| Described END STATE per stage | ADOPTED | The compiler adds a textual landing while explicitly prohibiting rushing. |
| Time ranges are budgets | ADOPTED | Prompt text now says this directly; no frame-exact claim is made. |
| Split hard motion across extension passes | MODIFIED | Available only after extension validation; normal atomic shots remain the safe default. |
| Emotion as visible cues | ADOPTED | Existing action validation already rejects abstract emotion labels. |
| Separate angle images, never identity collage | ADOPTED | Composite sheets remain human-review-only and fail video-reference validation. |
| Storyboard grids up to 15 panels | UNVERIFIABLE | No panel-count or structured interpretation is documented for ModelArk. |
| Standard extension continuity sentence | ADOPTED | Added verbatim to the gated extension prompt builder. |

## Direct conflicts

| Item | Decision | Reason |
| --- | --- | --- |
| Raise tracked identity cap from three toward eight | REJECTED | The required controlled 2.5 identity test cannot run until activation; no unsupported cap change is allowed. |
| Described end state versus supplied last frame | MODIFIED | Textual end states are adopted; destination images remain distinct and are not added by default. |
| Delete frozen-handoff chaining | REJECTED | Native extension is unvalidated and may not fit all older models; frozen handoff remains the deterministic fallback. |
| Replace five seams with native joining | REJECTED | There is no verified native join contract; provider editing may later implement selected bridges experimentally. |
| Replace atomic shots with 30-second oners | REJECTED | Persistent-cast identity and editable causality matter more than a viral oner format; multi-beat oners remain an explicit option only. |
| Keep universal 80-word cap | MODIFIED | 2.0/older retain 80; activated 2.5 receives a 220-word hard budget so reference bindings and end states survive. |
| Price 2.5 at 1.8x 2.0 | UNVERIFIABLE | Chaplin's historical rows are rate-card estimates, not actual ModelArk billed usage, and the 2.5 control created no task. |

## Capabilities not yet exploited

| Item | Decision | Reason |
| --- | --- | --- |
| Clip swaps | UNVERIFIABLE | Kept outside UI until a structured request and an output-quality control pass. |
| BGM stripping | UNVERIFIABLE | Chaplin owns music as a separate post-mix stem, which is safer than unverified destructive editing. |
| Multilingual prompts | MODIFIED | Free-text prompts remain possible, but Chaplin makes no unsupported any-language guarantee. |
| Green-screen compositing | MODIFIED | Supported by Chaplin's future compositor, not represented as a native 2.5 feature. |
| Audio-only generation | REJECTED | Not supported by the verified video task contract. |

## Cost reconciliation

The latest 100 successful 2.0 video rows contain 218 seconds of explicit
duration metadata and $51.10 of stored cost, but those costs are Chaplin
rate-card estimates. They are not ModelArk invoice values, and incomplete
duration metadata makes a per-second reverse calculation invalid. Customer
credits therefore remain model-neutral at five credits per generated second.
The server rate card must use a model-specific environment override once an
actual 2.5 invoice or provider-reported cost exists; no invented 1.8x markup is
applied to wallets.

## Controlled-test status

- Transport control: **failed before creation** with `ModelNotOpen`; no cost.
- Identity cap A/B: **not run**, because 2.5 is not callable; cap unchanged.
- 80 versus 220 words: compiler tests run; output-quality A/B remains blocked.
- 30-second, extension, editing, reference-audio: blocked by activation.

This is an explicit result, not silent rejection: Chaplin has accepted the new
architecture surface while refusing to claim capabilities the called API has
not yet demonstrated.
