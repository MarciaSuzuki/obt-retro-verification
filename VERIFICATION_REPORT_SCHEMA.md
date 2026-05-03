# Verification Report Schema

The exported JSON file at the end of an Oral Retro-Verification session.

Schema version constant: `TRIPOD_RETRO_VERIFICATION_REPORT_V1`.

Machine-readable schema:
[verification-report.schema.json](./verification-report.schema.json).

## Top-level shape

```json
{
  "schema_version": "TRIPOD_RETRO_VERIFICATION_REPORT_V1",
  "session_metadata": {},
  "source_meaning_map_ref": {},
  "english_versions_used": [],
  "translation_audio": {},
  "checkable_points": [],
  "links": [],
  "bead_tags": [],
  "coverage_summary": {},
  "mentor_overall_note": "",
  "provenance": {}
}
```

## Sections

### `session_metadata`

| field                  | type   | description                              |
|------------------------|--------|------------------------------------------|
| `mentor_id`            | string | Identifier the mentor used.              |
| `team_present`         | string | Free-text, comma-separated names/roles.  |
| `project_title`        | string | Project name (e.g. `Esther 2 — Sateré`). |
| `translation_language` | string | Target language.                         |
| `community`            | string | Community name.                          |
| `started_at`           | string | ISO timestamp (browser-generated).       |
| `completed_at`         | string | ISO timestamp at export.                 |

### `source_meaning_map_ref`

| field               | type    | description                                      |
|---------------------|---------|--------------------------------------------------|
| `filename`          | string  | Original meaning-map filename.                   |
| `hash`              | string  | First 16 hex chars of SHA-256 of the input file. |
| `proposition_count` | integer | Number of propositions in the source.            |

### `translation_audio`

| field               | type    | description                                       |
|---------------------|---------|---------------------------------------------------|
| `filename`          | string  | Audio filename.                                   |
| `duration_sec`      | number  | Audio duration.                                   |
| `bead_granularity`  | enum    | `coarse` / `medium` / `fine` at export time.      |
| `bead_count`        | integer | Number of beads at export-time granularity.       |
| `acoustemes_loaded` | boolean | Whether an acoustemes manifest was used.          |

### `checkable_points`

The full list derived from the input meaning map. Each entry:

| field         | type    | description                                            |
|---------------|---------|--------------------------------------------------------|
| `id`          | string  | `p<N>` (proposition-level) or `p<N>.q<K>` (Q&A-level). |
| `level`       | enum    | `proposition` or `qa`.                                 |
| `proposition` | integer | Source proposition index.                              |
| `qIndex`      | integer | Q&A row index (Q&A-level only; `-1` otherwise).        |
| `ref`         | string  | Scripture reference, copied from input.                |
| `text`        | string  | Display text used during verification.                 |

### `links`

Many-to-many anchor list. Each entry connects a checkable point to a bead span on the
translation thread:

| field              | type    | description                                                    |
|--------------------|---------|----------------------------------------------------------------|
| `id`               | string  | Random link id (`lnk-…`).                                      |
| `point_id`         | string  | The checkable point this anchor satisfies.                     |
| `start_bead_index` | integer | Inclusive start (0-based).                                     |
| `end_bead_index`   | integer | Inclusive end.                                                 |
| `audio_start_sec`  | number  | Bead span start time, captured at link time.                   |
| `audio_end_sec`    | number  | Bead span end time, captured at link time.                     |
| `note`             | string  | Optional mentor note.                                          |

The same bead span may appear in multiple links (one span carries multiple meanings).
The same `point_id` may appear in multiple links (one meaning is restated).

### `bead_tags`

Mentor classifications of beads that are *not* covered by any link:

| field              | type    | description                                |
|--------------------|---------|--------------------------------------------|
| `id`               | string  | Random tag id (`tag-…`).                   |
| `start_bead_index` | integer | Inclusive start.                           |
| `end_bead_index`   | integer | Inclusive end.                             |
| `tag`              | enum    | `framing` or `added`.                      |
| `note`             | string  | Optional mentor note.                      |

Coverage wins over tags: if a bead is part of a link, the bead is `covered` regardless
of tags.

### `coverage_summary`

Computed at export time from the data above.

| field                | type    | description                                                                      |
|----------------------|---------|----------------------------------------------------------------------------------|
| `points_total`       | integer | Q&A-level checkable points only (proposition-level is roll-up, not counted here).|
| `points_anchored`    | integer | Q&A points with ≥1 direct link OR whose proposition has a proposition-level link.|
| `points_unanchored`  | integer | `points_total - points_anchored`.                                                |
| `beads_total`        | integer | Bead count at export-time granularity.                                           |
| `beads_covered`      | integer | Beads inside at least one link.                                                  |
| `beads_framing`      | integer | Beads tagged framing and not covered.                                            |
| `beads_added`        | integer | Beads tagged added and not covered.                                              |
| `beads_unclassified` | integer | Beads with no link and no tag.                                                   |

### `mentor_overall_note`

Free-text mentor comment for the whole session.

### `provenance`

Audit fields (mentor id, team present, timestamps, tool name).

## Verdict logic at a glance

- **All meaning present?** `points_unanchored == 0`.
- **No additions?** `beads_added == 0`.
- **Sweep complete?** `beads_unclassified == 0`.
- A "clean pass" means all three are true.

## What is *not* in the export

- The audio file itself (only filename and duration).
- The meaning map content beyond a hash + filename + count.
- The English version texts (only their names).
- UI state (granularity may differ from session start; selection state is dropped).

## Backward-compatibility note

The schema version string is fixed at `TRIPOD_RETRO_VERIFICATION_REPORT_V1`. If the
shape ever changes, increment the version and update both the JSON Schema and this
document together.
