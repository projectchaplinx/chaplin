# Seedance audio capability contract

This contract is verified against the current ModelArk task-creation API and
enforced by `src/app/api/generate/route.ts`, `src/lib/seedance-audio.ts`, and
`src/lib/audio-plan.ts`.

## Persisted capability config

| Model family | Audio reference input | Native output | Maximum reference |
| --- | ---: | ---: | ---: |
| Seedance 2.0 | yes | yes | 15,000ms |
| Seedance 1.5 | no | yes | not applicable |
| Other/fallback | no | no | not applicable |

The code-owned `SEEDANCE_AUDIO_CAPABILITIES` object is displayed read-only in
Pipeline Lab. Routing may select a different capability profile, but an
operator cannot claim a transport feature the provider does not expose.

## Audio reference input

Seedance 2.0 accepts multimodal reference content:

```js
content: [
  { type: "text", text: prompt },
  { type: "image_url", image_url: { url }, role: "reference_image" },
  { type: "audio_url", audio_url: { url }, role: "reference_audio" },
]
```

Audio input must be WAV or MP3, each file must be 2–15 seconds, no more than
three references may be supplied, and their combined duration may not exceed
15 seconds. Chaplin additionally requires the locked TTS render to fit within
the slot duration minus the 500ms dialogue head offset.

Source:
[Create a video generation task](https://docs.byteplus.com/en/docs/modelark/1520757).

## Native audio output

`generate_audio` is supported by Seedance 2.0 and Seedance 1.5. ModelArk may
otherwise generate voice, effects, and background music, so the board resolver
turns it on only when at least one layer is owned by `native`. Every board video
prompt carries `no music` and either:

- the locked audio-reference lip-sync instruction, with no invented voices or
  narration; or
- a complete no-speech, no-dialogue, no-vocal-sounds negative.

## First-frame exclusivity

ModelArk treats exact first/last-frame generation and multimodal reference
generation as mutually exclusive scenarios:

```text
first/last frame content cannot be mixed with reference media content
```

Native-dialogue forward and chain slots therefore use multimodal reference mode
(`reference_image` plus `reference_audio`). Strict `ff_lf` slots keep their
exact-frame contract and resolve dialogue to post-mix.

## Fallback behavior

The configured Seedance 1.5 fallback cannot accept the locked audio reference.
Before that fallback runs, Chaplin resolves the slot again for the fallback
capability and rebuilds the prompt as post-mix dialogue with an off-face
constraint. It never leaves a native-dialogue instruction in a request with no
locked recording attached.

Board-level `audio_mode: "legacy_stems"` remains the explicit all-post-mix
escape hatch.
