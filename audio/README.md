# Radar Beirut Audio

This folder contains audio-generation tooling for Radar Beirut briefing audio.
Date-specific audio artifacts are written outside this tooling folder, under
`briefings/YYYY-MM-DD/audio/`.

## Briefing Audio

Generate Hamsa text-to-speech WAV files from a date folder's built
`output/briefing.json`. Full-editorial output includes outlet scenes, the
closing/synthesis scene, and the outro question.

```bash
HAMSA_API_KEY=... npm run audio:outlets -- --date YYYY-MM-DD
```

You may also place `HAMSA_API_KEY=...` in the project root `.env` or
`.env.local`. Shell-provided environment variables take precedence over values
from those files.

Defaults:

- Provider: Hamsa realtime TTS
- Endpoint: `https://api.tryhamsa.com/v1/realtime/tts`
- Auth header: `Authorization: Token <API key>`
- Speaker pool: `Lamees`, `Marwan`, `Nabil`, `Gassan`
- Dialect: `leb`
- Text source: scene `audioText` when present, otherwise scene `body`
- Output: `briefings/YYYY-MM-DD/audio/`

The script writes:

- one `*.wav` file per briefing audio entry
- `manifest.json` with `audioByOutlet`, `audioByScene`, and full `entries`
  records. Each record includes outlet key/name when present, scene id, source text,
  requested scene duration, generated audio duration, and audio path.
- missing entries when using `--existing-only`, with `durationSeconds: null` and
  `status: "missing"`

Existing WAV files are reused by default. Use `--dry-run` to inspect the
manifest without calling Hamsa, and `--force` only when you intentionally want to
regenerate existing audio.

When missing audio cannot be generated, the manifest records `errorCategory`.
For example, `missing-api-key` means Hamsa was not called, while
`hamsa-credits-or-quota` means the key was sent and Hamsa returned a billing,
quota, or rate-limit style error.

Use `--existing-only` to refresh the manifest from files already present in the
date folder's `audio/` directory without calling Hamsa for missing outlets.

When `scripts/sync-outlet-audio-timing.mjs` copies WAV durations into
`output/timing-config.json`, it adds a default `0.5s` buffer to each usable audio
duration. Scene audio updates `briefing.scenes`; the outro audio updates
`briefing.outroSeconds`. Override with `--pad-seconds <seconds>` only when a
different transition buffer is needed.

For full-editorial `scene-11`, `body` may include opening context plus the
penultimate summary for analysis/display context, but `audioText` should contain
only the penultimate summary paragraph. Hamsa generation prefers `audioText` so
the closing WAV does not repeat the opening paragraph.

The script shuffles the speaker pool from the date folder name, so each briefing
day gets one stable first-choice voice. If that voice fails during generation,
the script tries the remaining voices and keeps using the first working fallback
for that run. Override the pool with comma-separated `HAMSA_TTS_SPEAKERS`, or
force one voice with `HAMSA_TTS_SPEAKER`.

The script validates configured speakers through Hamsa's voice catalog and
records the resolved voice id in the manifest. For built-in catalog voices it
still sends the voice name to realtime TTS; `HAMSA_TTS_SPEAKER_ID` is reserved
for an explicitly configured custom/preloaded voice id.

For a one-audio smoke test on the latest date folder:

```bash
HAMSA_API_KEY=... npm run audio:outlets -- --first
```

You can still pass `--folder briefings/YYYY-MM-DD` when working with a custom
folder path.
