# Seedance capability probe

Latest probe: 2026-08-04

Region: ModelArk `ap-southeast`

Production decision: keep the default on `dreamina-seedance-2-0-260128`.

## Authenticated account result

`GET /api/v3/models` now lists `dreamina-seedance-2-5-260628`. Its catalogue
record declares text, image, video, and audio input; video output; and the task
types `MultimodalToVideo`, `VideoExtension`, and `VideoEditing`.

A minimal four-second 480p creation control was then submitted. ModelArk
returned HTTP 404 `ModelNotOpen`: the account has not activated the 2.5 model.
No task was created and no generation cost was incurred. A catalogue listing is
therefore discovery, not proof that a model is callable.

## Verified request surface

| Capability | Chaplin decision |
| --- | --- |
| Multimodal generation | Declared for 2.5; task creation blocked until activation |
| Video extension | Declared task type; exact 4-30 second/pass and 60-second ceiling unverified |
| Video editing | Declared task type; generic only, with no verified swap/BGM-strip schema |
| Output duration | 2.0 verified at 4-15 seconds; 2.5 30/180-second claims unverified |
| References | Public API verifies 2.0 budgets of 1-9 images, 0-3 videos, 0-3 audio; 2.5 30/10/10 claims unverified |
| Structured shots | No `shots` or storyboard array exists. Timed beats are prompt text |
| Timestamp adherence | Prompt-level direction, not an API guarantee |
| Native clip joining | No verified structured parameter |
| Green screen | Prompt/compositing technique, not a verified API control |
| Storyboard grid | May be supplied as an image reference; panels are not structured shots |
| Language/on-screen text | No verified per-language control field |
| Audio-only | Rejected by the public contract: a video/image input is required for multimodal reference generation |

Chaplin's capability object records per-medium budgets and separates
`promptTimedMultiBeat` from `structuredShotsField`. The latter is always false.
No duration or reference limit is inferred from the `2.5` name.

## Activation gate

1. Activate `dreamina-seedance-2-5-260628` in the ModelArk console.
2. Repeat the four-second transport control.
3. Run matched identity A/B jobs, a prompt-length A/B, a 30-second duration
   control, one extension, and one reference-audio job.
4. Record task IDs, provider usage, output assets, and blinded verdicts.
5. Only then set `apiAvailable: true`, raise verified ceilings, enable locked
   audio, or change the production default.

Official ModelArk sources:

- https://docs.byteplus.com/en/docs/modelark/1520757
- https://docs.byteplus.com/en/docs/modelark/1159178
- https://docs.byteplus.com/api/docs/ModelArk/2291680
- https://docs.byteplus.com/api/docs/ModelArk/2191775
