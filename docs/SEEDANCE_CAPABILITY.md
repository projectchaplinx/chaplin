# Seedance capability probe

Probe date: 2026-07-29
Region: ModelArk `ap-southeast`
Decision: keep production on the Seedance 2.0 adapter. Do not enable the
proposed Seedance 2.5 multi-shot transport until the authenticated model list
exposes a real 2.5 model ID and its request contract is verified.

## Account probe

The configured `SEEDANCE_API_KEY` was tested read-only against ModelArk.
Credentials and response bodies containing account data were not persisted.

| Probe | Result |
| --- | --- |
| `GET /api/v3/models` | HTTP 200 |
| Seedance models exposed | `seedance-1-0-lite-i2v-250428` (retiring), `seedance-1-0-lite-t2v-250428` (retiring), `seedance-1-0-pro-250528`, `seedance-1-0-pro-fast-251015`, `seedance-1-5-pro-251215`, `dreamina-seedance-2-0-260128`, `dreamina-seedance-2-0-fast-260128`, `dreamina-seedance-2-0-mini-260615` |
| Seedance 2.5 exposed | **No** |
| Configured primary | `dreamina-seedance-2-0-260128` |
| Model-reported input modalities | image, video, audio, text |
| Model-reported output modalities | video |
| Model-reported tasks | multimodal-to-video, video editing, video extension |
| `GET /contents/generations/tasks?page_num=1&page_size=100` | HTTP 200; 82 total tasks |
| Models observed in account tasks | `seedance-1-5-pro-251215`, `dreamina-seedance-2-0-260128` |

Probe request IDs:

- models: `02178526932427099a3f43520201fc0164769d66e52699f88e7bb`
- tasks: `02178526932436799a3f43520201fc0164769d66e52699f378755`

## Verified Seedance 2.0 transport

| Capability | Verified contract |
| --- | --- |
| Output duration | Integer 4–15 seconds, or `-1` for model-selected duration |
| Output resolution | 480p, 720p, 1080p, and 4K where the 2.0 model/ratio supports it |
| Structured shots per job | No `shots` or storyboard array exists in the task API |
| Multi-cut direction | Prompt-level time ranges and transitions are supported; the provider does not return or enforce a structured per-shot contract |
| Reference images | 1–9 in multimodal-reference mode |
| Reference videos | 0–3; each 2–15 seconds; combined reference-video duration at most 15 seconds |
| Reference audio | 0–3 WAV/MP3 files; each 2–15 seconds; combined reference-audio duration at most 15 seconds |
| Mixed references | image, video, and audio may be combined with text |
| Character/product/style/motion types | Not transport-level roles. ModelArk exposes `reference_image`, `reference_video`, and `reference_audio`; Chaplin must express semantic labels in prompt text |
| Native audio | `generate_audio: true` produces synchronized audio |
| Lip sync | Reference audio plus an explicit visible-speaker prompt is supported; there is no separate structured `lip_sync` field |
| Timecodes | Supported as prompt language, not as an API field |
| Exact frames plus references | Exact `first_frame`/`last_frame` mode and multimodal-reference mode are mutually exclusive |
| Request body | At most 64 MB |

Official sources:

- [Create a video generation task](https://docs.byteplus.com/en/docs/modelark/1520757)
- [Dreamina Seedance 2.0 series tutorial](https://docs.byteplus.com/en/docs/ModelArk/2291680)
- [Dreamina Seedance 2.0 prompt guide](https://docs.byteplus.com/api/docs/ModelArk/2222480)
- [Model releases](https://docs.byteplus.com/en/docs/modelark/1159178)

## What is not verified

The supplied target claims—Seedance 2.5, 30-second output, 50 mixed references,
a structured multi-shot storyboard request, and a provider-enforced shot count—
are not available in this account or the current ModelArk API contract. Chaplin
must not invent a model ID, submit undocumented fields, or claim those limits.

## Adapter policy

1. `seedance-1.x` and `dreamina-seedance-2-0-*` continue to use the existing
   single-output transport. Existing first-frame, first/last-frame, reference,
   audio, polling, and fallback behavior remains production-safe.
2. Chaplin may build and lint a provider-neutral `ShotJob` now. It may compile
   that contract to prompt-level timecoded direction for 2.0, but it must not
   claim provider-enforced per-shot fields.
3. A multi-shot transport is enabled only when an authenticated capability
   probe returns a recognized future model and a verified adapter defines its
   maximum output duration, structured shot limit, reference limits, and
   request shape.
4. Boards longer than the active adapter's maximum duration split at a seam.
   For the present 2.0 adapter, 15,000 ms is the hard output ceiling.
