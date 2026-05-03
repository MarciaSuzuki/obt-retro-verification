# OBT Retro-Verification — Technical Documentation

## 1. Purpose

Static browser application for retro-verifying an oral Bible translation against
a consultant-approved meaning map. Outputs a `TRIPOD_RETRO_VERIFICATION_REPORT_V1`
JSON file plus an optional printable HTML report.

## 2. Stack

- `index.html` — app shell
- `styles.css` — visual design
- `app.js` — all runtime logic (single ES module, no bundler)
- Browser APIs: `HTMLAudioElement`, `sessionStorage`, `Blob`,
  `URL.createObjectURL`, `crypto.subtle.digest`, DOM event delegation

No backend, no database, no auth, no framework, no build step.

## 3. Files

| file                                                | purpose                              |
|-----------------------------------------------------|--------------------------------------|
| [index.html](./index.html)                          | App shell                            |
| [styles.css](./styles.css)                          | All styling                          |
| [app.js](./app.js)                                  | All runtime logic                    |
| [meaning-map-input.schema.json](./meaning-map-input.schema.json) | Input validator        |
| [verification-report.schema.json](./verification-report.schema.json) | Export validator   |
| `demo/`                                             | Bundled sample inputs                |

## 4. Runtime model

Single-page app, single global `state` object, render-from-state on every change.

Render pipeline:

1. `renderStoryStatus()`
2. `renderStepNav()`
3. `renderAudioDock()` (includes granularity controls)
4. `renderBanner()`
5. `renderScreen()` (one of `setup`, `anchor`, `sweep`, `review`)
6. `renderAudioProgressBeads()`
7. `schedulePersist()`

No virtual DOM. Each render writes string templates to `innerHTML`.

## 5. Views

| view      | purpose                                                                 |
|-----------|-------------------------------------------------------------------------|
| `setup`   | Load inputs, capture metadata.                                          |
| `anchor`  | Three-column work surface: meaning map · bead thread · English context. |
| `sweep`   | Tag every leftover (unclassified) bead run.                             |
| `review`  | Coverage report + mentor overall note + JSON/HTML export.               |

## 6. State

Top-level keys (see `state` in `app.js`):

- `view`
- `meaningMap`, `meaningMapFilename`, `meaningMapHash`
- `audioSource` (`{filename, url, duration}`)
- `acoustemes` (normalized `{duration_sec, segments}`)
- `englishVersions`, `englishActiveIndex`
- `checkablePoints`
- `beads`
- `links`
- `beadTags`
- `mentorOverallNote`
- `metadata`
- `beadGranularity`, `beadZoom`
- `activePointId`, `selection`, `drag`, `hoverPreviewBeadIndex`, `banner`

## 7. Bead system

### 7.1 Construction

`buildBeads()` chooses one of two paths:

- **Acoustemes-driven** (`buildBeadsFromAcoustemes`) — groups segments by
  `FRAMES_PER_BEAD[granularity]` (`coarse=50`, `medium=25`, `fine=10`). Same as
  Easy-Beads v3.
- **Duration-driven** (`buildBeadsFromDuration`) — slices audio into beads of
  `SECONDS_PER_BEAD[granularity]` seconds (`coarse=1.0`, `medium=0.5`, `fine=0.25`).
  Used when no acoustemes manifest is provided. **This is the default path.**

### 7.2 Acoustemes normalization

`normalizeAcoustemeManifest()` accepts the same three input shapes as
Easy-Beads v3 and returns `{duration_sec, segments:[{start, end, unit_id}]}`.

### 7.3 Re-basing on granularity change

When the mentor changes granularity mid-session, `rebaseLinksAndTagsToBeads()`
re-derives `start_bead_index` / `end_bead_index` from the audio time fields
captured at link time, so existing anchors and tags survive the change.

## 8. Audio control

One global `<audio>` element. Helpers:

- `togglePlayback()`
- `seekRelative(delta)`
- `playRange(start, end)` — attaches a temporary `timeupdate` stop handler that
  pauses at `end`.
- `playSelection()` / `playBeadRange(startIdx, endIdx)`

## 9. Coverage model

### 9.1 Checkable points

Derived from the meaning map by `deriveCheckablePoints()`:

- One **proposition-level** point per proposition (id `p<N>`).
- One **Q&A-level** point per row (id `p<N>.q<K>`).

### 9.2 Links

A `link` connects a `point_id` to `[start_bead_index .. end_bead_index]` plus
the captured audio times. Many-to-many: same span can satisfy many points;
same point can have many spans.

### 9.3 Bead tags

A `bead_tag` labels a span as `framing` or `added`. Tags only color beads that
no link has covered (coverage wins).

### 9.4 Status derivation

`beadStatusMap()` returns a per-bead enum:

- `covered` — inside at least one link
- `framing` — tagged framing (and not covered)
- `added` — tagged added (and not covered)
- `unclassified` — no link, no tag

### 9.5 Proposition rollup

`propositionRollup(propNum)` returns `{children, anchored, propAnchored}`. A
proposition-level link counts as anchoring every child Q&A row.

## 10. Persistence

`sessionStorage` under key `oral-retro-verification-v1`. Debounced via
`schedulePersist()` (250 ms). The audio blob URL is **not** persisted — the
mentor must re-attach the audio after a hard reload (the rest of the session
restores). Filename and duration *are* persisted, so the UI can warn if needed.

## 11. Export

`buildExport()` produces an object matching
`verification-report.schema.json`. `exportJson()` triggers a download via a
Blob URL. `exportHtml()` produces a printable HTML summary using the same
data.

## 12. Event handling

Delegated `click` / `change` / `input` listeners on `document` keyed by
`data-action` attributes. Persistent shell elements (play/back/forward/seek,
timeline, granularity selector) bind directly.

## 13. Reuse from Easy-Beads v3

Direct port (renamed but conceptually unchanged):

- `FRAMES_PER_BEAD` granularity map
- `normalizeAcoustemeManifest`
- `buildBeads*` (split into acoustemes/duration paths)
- `playRange` with temporary stop handler
- `schedulePersist` / `sessionStorage` debounce

Replaced (specific to retro-verification):

- proposition creation → already done by upstream pipeline; consumed read-only
- free-form Q&A → coverage-driven link/tag layer
- export shape → `TRIPOD_RETRO_VERIFICATION_REPORT_V1`

## 14. Known limitations

- Audio is not persisted across hard reloads (session work is).
- Drag-to-select is implemented as click + shift-click, not as mouse-drag.
- Bead thread is a flat wrap; very long recordings benefit from acoustemes +
  coarse granularity.
- No multi-user collaboration, no backend, no undo/redo, no auth.
- The English text panel renders plain text only; no verse-level alignment.
- Coverage rollup is computed on every render — fine for sub-thousand beads.

## 15. Suggested extensions

- Drag-to-select on the bead thread (mousemove during press).
- Verse-level alignment between bead spans and English text.
- Audio waveform overlay per bead.
- Persistence to IndexedDB so the audio survives reload.
- Multi-tagger reconciliation export.
- Hotkeys for the most common loop (activate point → play → link).
