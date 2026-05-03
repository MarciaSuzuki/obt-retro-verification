# OBT Retro-Verification — Tripod Ecosystem

A static web app for retro-verifying an oral Bible translation against a
consultant-approved meaning map.

## Goal

Prove two things at once:

1. **Map → Audio:** every checkable point in the meaning map can be anchored to bead
   span(s) on the translation audio. Anything unanchored = missing meaning.
2. **Audio → Map:** every bead is either covered by an anchor or classified as
   *framing/repetition* or *added meaning*. No silent leftovers.

The app does not generate verification questions. It uses the meaning map's text
verbatim and lets the mentor cross-check coverage.

## What's in this folder

| file                                                          | purpose                                |
|---------------------------------------------------------------|----------------------------------------|
| [index.html](./index.html)                                    | App shell                              |
| [styles.css](./styles.css)                                    | Branding + bead/thread styling         |
| [app.js](./app.js)                                            | All runtime logic (vanilla JS module)  |
| [meaning-map-input.schema.json](./meaning-map-input.schema.json) | Input format validator              |
| [verification-report.schema.json](./verification-report.schema.json) | Export validator                |
| [MEANING_MAP_INPUT_SCHEMA.md](./MEANING_MAP_INPUT_SCHEMA.md)  | Input format guide                     |
| [VERIFICATION_REPORT_SCHEMA.md](./VERIFICATION_REPORT_SCHEMA.md) | Export format guide                 |
| [USER_MANUAL.md](./USER_MANUAL.md)                            | Mentor field manual                    |
| [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md)    | Developer reference                    |
| [demo/](./demo/)                                              | Bundled Esther 2:19–23 sample          |

## Run locally

```bash
cd "oral retro-verification app claude"
python3 -m http.server 4280
```

Open <http://127.0.0.1:4280/>.

## Loading inputs

Three required, two optional:

| input                         | required | how to load                                                          |
|-------------------------------|----------|----------------------------------------------------------------------|
| Meaning map JSON              | yes      | Setup → step 2 (or click *Load Esther 2:19–23 demo*)                 |
| Translation audio             | yes      | Setup → step 3 (or click *Load demo audio*)                          |
| Project metadata              | yes      | Setup → step 1                                                       |
| Acoustemes manifest           | no       | Setup → step 4. If absent, beads synthesize from duration (~0.5s/bead at medium). |
| English text version(s) `.txt`| no       | Setup → step 5. Drop `.txt` files into `demo/english/` for one-click loading. |

## Reusing Easy-Beads logic

The bead/audio model (granularity, zoom, selection, `playRange`, acoustemes
normalization, sessionStorage persistence) is ported from
`Easy-Beads-v3/app.js`. The proposition-creation and Q&A-authoring layers are
replaced by a coverage-driven link/tag layer specific to this app.
