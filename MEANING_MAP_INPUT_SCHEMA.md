# Meaning Map Input Format

The OBT Retro-Verification app consumes a meaning map produced upstream in the Tripod
pipeline. The meaning map is **consultant-approved working-language content** — the app
does not let the mentor edit it during a session.

The rich shape can carry three levels:

- **Level 1** — whole-passage interpretation (4 prose fields).
- **Level 2** — scenes (title, range, summary, list of proposition indices).
- **Level 3** — propositions (reference, summary, Q&A rows). Required.

The strict machine-readable schema is in
[meaning-map-input.schema.json](./meaning-map-input.schema.json).

## Top-level shape — two accepted forms

### Flat shape (no scenes)

A JSON array. Each element is one **proposition**.

```json
[
  {
    "proposition": 1,
    "reference": "Esther 2:19",
    "summary": "positioning",
    "questions": [
      { "q": "What happened?", "a": "positioning" },
      { "q": "Who was positioned?", "a": "Mordecai" }
    ]
  }
]
```

### Rich shape (with Level 1 + Level 2 + Level 3)

A JSON object with optional `level_1`, optional `scenes`, and required
`propositions`. Use this shape to enable the full Study view and the Scenes
column on the Match screen.

```json
{
  "level_1": {
    "what_the_story_is_about_and_its_shape": "...",
    "where_and_when": "...",
    "feeling_of_the_story": "...",
    "why_being_told": "..."
  },
  "scenes": [
    {
      "scene": 1,
      "title": "Setting the scene",
      "range": "Esther 2:19-20",
      "summary": "Mordecai is positioned at the king's gate while Esther continues to conceal her family background and nationality.",
      "propositions": [1, 2, 3]
    }
  ],
  "propositions": [
    {
      "proposition": 1,
      "reference": "Esther 2:19",
      "summary": "positioning",
      "questions": [
        { "q": "What happened?", "a": "positioning" }
      ]
    }
  ]
}
```

### Level 1 fields

| field                                     | type   | description                                                |
|-------------------------------------------|--------|------------------------------------------------------------|
| `what_the_story_is_about_and_its_shape`   | string | The whole-passage gist and the shape of its movement.      |
| `where_and_when`                          | string | Setting in space and time.                                 |
| `feeling_of_the_story`                    | string | Emotional arc.                                             |
| `why_being_told`                          | string | Communicative purpose / pay-off.                           |

These mirror the Easy-Beads Level 1 fields, so a Tripod meaning map produced
upstream can flow directly into this app.

## Field reference

### Scene (rich shape only)

| field         | type                | required | description                                                |
|---------------|---------------------|----------|------------------------------------------------------------|
| `scene`       | integer (≥1)        | yes      | 1-based scene index.                                       |
| `title`       | string              | no       | Short scene title.                                         |
| `range`       | string              | no       | Reference range (e.g. `"Esther 2:19-20"`).                 |
| `summary`     | string              | no       | One-paragraph scene summary in the working language.       |
| `propositions`| array of integers   | yes      | Proposition indices that belong to this scene.             |

### Proposition

| field         | type                       | required | description                                                  |
|---------------|----------------------------|----------|--------------------------------------------------------------|
| `proposition` | integer (≥1)               | yes      | 1-based index within the passage.                            |
| `reference`   | string                     | no       | Scripture reference (e.g. `"Esther 2:19"`).                  |
| `summary`     | string                     | no       | Short headline (e.g. `"positioning"`).                       |
| `questions`   | array of Q&A rows          | yes      | One row per checkable point inside the proposition.          |

### Q&A row

| field | type   | required | description                              |
|-------|--------|----------|------------------------------------------|
| `q`   | string | yes      | The question (often a probe or a clarifier). |
| `a`   | string | yes      | The expected answer / claim.             |

## How the app turns this into checkable points

For each proposition the app derives:

- **One proposition-level checkable point** — id `p<N>`, text drawn from `summary` (or
  `"Proposition <N>"` if `summary` is empty). Anchoring at this level counts as anchoring
  *every* child Q&A row (useful when one bead span carries the whole proposition).
- **One Q&A-level checkable point per row** — id `p<N>.q<K>`, text rendered as
  `"<q> → <a>"`.

This means the Esther 2:19–23 sample (10 propositions, ~57 Q&A rows) yields **10 + ~57**
checkable points. The mentor can anchor at either level.

## Authoring conventions

- Keep `q`/`a` short — one short clause each. The mentor reads them under time pressure.
- One row = one **checkable atom**. Do not pack two facts into one row.
- Use `summary` as the proposition's headline, not as a full sentence.
- `reference` is shown in the UI as the row's anchor label; keep it short
  (`"Esther 2:19"`, not `"Esther chapter two verse nineteen"`).

## What the app does *not* require

- No `audio_start_sec` / `audio_end_sec` on input — those come from the mentor's bead
  selections during verification.
- No bead indices.
- No `additionalProperties` are allowed at the top level of a proposition or row;
  the schema is intentionally tight to keep upstream pipelines honest.
