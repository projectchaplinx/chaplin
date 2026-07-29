This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Character generation pipeline

Character profiles include a production lab for generating a persistent voice,
signature SFX, consistent scene stills, and five-second videos. Provider keys
stay on the server behind `/api/generate`.

Create `.env.local` in the project root:

```bash
ELEVEN_LABS_API_KEY=your_elevenlabs_key
SEEDANCE_API_KEY=your_byteplus_modelark_key
OPENROUTER_API_KEY=your_openrouter_key
OPENAI_API_KEY=your_openai_key
ELEVEN_MUSIC_USD_PER_MINUTE=0.15
```

The admin cost ledger records provider-native usage and converts each completed
job into USD, INR, and a comparable Chaplin-token amount. Media APIs do not use
LLM tokens, so Chaplin tokens are deliberately normalized at 1,000 per US
dollar. Optional rate overrides:

```bash
ELEVEN_TTS_USD_PER_1K_CHARACTERS=0.10
ELEVEN_SFX_USD_PER_MINUTE=0.12
SEEDREAM_USD_PER_IMAGE=0.04
OPENAI_IMAGE_USD_PER_IMAGE=0.041
SEEDANCE_USD_PER_SECOND=0.10
CHAPLIN_TOKENS_PER_USD=1000
USD_TO_INR_RATE=96.45
```

When `USD_TO_INR_RATE` is omitted, the server fetches the latest USD/INR rate
from Frankfurter and stores the exact rate used on each job. Seed model rates
are contract-dependent estimates until ModelArk returns an explicit billed
dollar amount, so both are configurable and labeled as estimates in the UI.

- ElevenLabs Voice Design creates three candidates. Locking one stores the
  resulting `voiceId` on that character so every future line uses the same
  voice.
- ElevenLabs Sound Effects generates the character's five-second signature
  sound.
- The Super Admin Image stage can switch between BytePlus Seedream, OpenRouter
  (including Nano Banana), and OpenAI GPT Image. All three preserve the
  character's canonical reference image and add the result to the same gallery.
- OpenRouter logs its returned prompt/completion/total tokens and billed USD
  cost. OpenAI logs its returned usage object and uses
  `OPENAI_IMAGE_USD_PER_IMAGE` for the USD estimate when the provider does not
  return a dollar cost.
- BytePlus ModelArk runs Seedance 2.0 directly using that still as its
  identity reference and renders a five-second 720p motion plate. Voice, SFX,
  and music are generated and mixed separately.

Open `/characters/c-selene` to use the first configured pipeline for Meher Qureshi.

## GPT-5.6 Terra Magic Writer

The writing room at `/studio/write` can expand a short brief into a complete,
editable story, ad, or reel: title, logline, cast, creative direction, scene
objectives, visible action, and character-specific dialogue. The API key stays
server-side behind `/api/write/magic`.

Add these values to `.env.local` in the project root, and to the matching Vercel
environment when deployed:

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_WRITING_MODEL=gpt-5.6-terra
OPENAI_TERRA_INPUT_USD_PER_MILLION_TOKENS=2.5
OPENAI_TERRA_OUTPUT_USD_PER_MILLION_TOKENS=15
```

`OPENAI_WRITING_MODEL` is optional. When no OpenAI key is configured, Magic Writer
uses its built-in structured draft engine so the button remains usable during
setup.

Every editable production prompt on an actor page also has a character-aware
Quick Write button. OpenAI usage from these actions is recorded in the admin
generation log with input tokens, output tokens, USD, INR, and normalized
Chaplin tokens. The rate variables above are optional overrides for the current
GPT-5.6 Terra contract.

The actor builder at `/characters/new` has the same assistance at the identity
stage. Magic Character can fill tagline, personality, voice, signature SFX, and
theme together, while each field also has its own Suggest action. If OpenAI is
not configured or rejects the key, the builder falls back to archetype-aware
local suggestions instead of leaving the form blank.

## Production-directed prompting

Each actor now carries a persistent `productionBible` covering dramatic want
and contradiction, pressure behavior, facial and wardrobe continuity, movement
grammar, camera and motivated-light defaults, plus hook, escalation,
cliffhanger, payoff, and recurring motifs. It is stored in Supabase as
`characters.production_bible` and passed into Magic Writer as story canon.

The same JSONB canon now contains a `system` profile for canonical character
sheet angles, controlled younger/canonical/older states, interaction behavior,
and memory boundaries. See [`docs/CHARACTER_SYSTEM.md`](docs/CHARACTER_SYSTEM.md)
for the complete identity → prompt → media → interaction wiring.

Prompts are deliberately different by medium:

- ElevenLabs Voice Design receives language/dialect, presentation and age,
  quality, persona, emotion, timbre, pacing, and pressure delivery only.
- ElevenLabs SFX receives a physical five-second event and acoustic timeline;
  Eleven Music receives BPM, key, motif, instrumentation, musical development,
  mix priority, and an instrumental-only instruction.
- Seedream receives the designed first frame: face anchors, performance beat,
  set, blocking, framing, camera angle and lens, motivated key/fill/edge light,
  and continuity locks.
- Seedance receives the selected image as its exact first frame and source of
  truth. Its prompt contains only timed subject motion, facial beat, camera
  path, light continuity, secondary motion, final frame, and geometry locks.
  Voice, SFX, and music are generated and mixed separately.

Magic Scene asks GPT-5.6 Terra for a structured director blueprint first, then the app
renders separate provider-ready prompts from that blueprint. If OpenAI is
unavailable, the same pipeline uses production-directed local blueprints rather
than reverting to a shared biography prompt.

## Creative engineering Experiment Ground

Super Admins can open `/admin/pipeline/experiments` to fork any live stage into
isolated Control and Challenger variants. Both variants use the same actor,
canonical reference, and creative input; engineers can then compare real output,
latency, cost, errors, and a five-point review score.

Experiment jobs remain in the normal generation ledger but never publish to the
creator feed. A tested winner must be explicitly selected before it can be
promoted through the versioned production-settings path. See
[`docs/PIPELINE_EXPERIMENTS.md`](docs/PIPELINE_EXPERIMENTS.md) for the safety
boundary, workflow, data model, and API.
