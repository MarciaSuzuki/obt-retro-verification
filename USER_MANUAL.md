# OBT Retro-Verification — Mentor Manual

## Who this is for

Translation mentors, consultants, and facilitators who need to check whether an
oral translation in a low-resource language faithfully carries the meaning of a
consultant-approved meaning map.

You do not need to be a linguist. You do not need to invent questions. The meaning
map already holds the consultant-approved questions and answers — your job is to
**locate** them in the translation audio and **classify** the leftovers.

## What the app helps you prove

Two parallel checks:

1. **Map → Audio:** every checkable point in the meaning map appears somewhere in
   the translation audio.
2. **Audio → Map:** every part of the translation audio is either delivering a
   point in the map, or is *framing/repetition* (legitimate oral structure that
   the language requires), or is *added meaning* (a problem to flag).

When both are clean, the verification is complete.

## Vocabulary

- **Bead** — a small piece of time on the translation audio.
- **Thread** — the row of beads representing the whole audio.
- **Checkable point** — one Q&A row from the meaning map. The mentor anchors
  these to bead spans.
- **Proposition** — a group of checkable points (the meaning-map row).
- **Anchor / Link** — a connection between a checkable point and a bead span.
- **Tag** — a label for leftover beads: *framing/repetition* or *added meaning*.

## Step-by-step

### Workflow at a glance

1. **Setup** — load files and project info.
2. **Study** — read the full meaning map (Level 1 → 2 → 3) side-by-side with
   Bible Gateway versions and any uploaded English `.txt` files.
3. **Whole story** — *Level 1 review.* Have a free-form conversation with the
   team about the whole passage. Take notes only if something sounds off.
4. **Scenes** — *Level 2 review.* Walk the team through each scene's people,
   places, objects, and what happens. Confirm each scene with one click; write
   a note only if something is missing or wrong. Confirm any *significant
   absence* with the team.
5. **Match** — *Level 3 review.* The exhaustive bead-by-bead matching of every
   checkable point in the meaning map to the translation audio.
6. **Sweep leftovers** — tag uncovered beads as framing, added, or altered.
7. **Review & export** — confirm coverage and download the report.

The three review steps are deliberately different in shape:

- **Whole story** is a conversation. There are suggested prompts but no
  per-prompt fields — just one free-text notes box and a revision flag.
- **Scenes** is also conversational. Per scene, the mentor only marks
  *all present* / *something off* and writes a note when needed.
- **Match** is the exhaustive part — slow, precise, evidence-based.

### Step 1 · Setup

Fill in the project info (title, language, community, mentor name, team
present), then load:

- the **meaning map JSON** (consultant-approved, working language)
- the **translation audio** (the recording you are checking)
- optionally, an **acoustemes manifest** for that audio
- optionally, one or more **English `.txt` versions** of the passage as
  read-only context

Click **Open Study** when ready.

### Step 2 · Study

Read the meaning map together with the Bible Gateway versions before you start
anchoring.

- The meaning map is rendered in a readable form: each scene (when provided)
  shows its title, range, and summary, followed by its propositions and Q&A
  rows.
- Click **Open Bible Gateway in new tab** for a full window, or **Open in side
  window** to get a smaller window you can place next to this one.
- Any English `.txt` versions you uploaded on Setup appear on the right side of
  this screen, with version tabs.
- When the team has read the passage and discussed the meaning map, click
  **Begin anchoring →**.

### Step 3 · Whole story (Level 1)

Open this step after Study. The screen shows:

- The Level 1 prose from the meaning map (Prose Arc / Context / Emotion–Tone /
  Communicative Function — whichever fields the map provided).
- A list of **suggested conversation prompts** (Is this a narrative? What is
  the register? What emotions did the team feel? etc.). These are guides only —
  skip any that don't fit the conversation.
- A **mentor notes** text box — write only what matters; skip the rest.
- A **needs revision?** radio (None / Minor / Major) plus an optional one-line
  comment.

When you're done, click **Continue to Scenes →**.

### Step 4 · Scenes (Level 2)

For each scene the meaning map declares, you see a card with:

- People, Places, Objects (open by default in compact tables).
- *What happens* and *Communicative purpose* prose.
- A *Significant absence* strip if the meaning map declares one — confirm it
  with the team and tick the **Confirmed** box.
- A **status** row: ✓ All present / ⚠ Something off / — Not yet reviewed.
- A free-text **note** field that appears only when the status is ⚠.

A small *N/M scenes reviewed* counter at the top tracks progress. You can
move on at any time — the footer shows a soft warning if some scenes are still
*Not yet reviewed*, but does not block you.

### Step 5 · Match (Level 3)

You see three columns:

- **Left — Scenes (Level 2).** A short, scrollable view of the meaning map's
  Level-2 scenes. The scene that contains your active proposition is highlighted.
  Click the small numbered chips inside a scene to jump to a specific
  proposition's points.
- **Centre — Propositions.** The Level-3 checkable points, grouped by
  proposition. Coloured dots show which rows are matched.
- **Right — Beads (translation audio).** Click a bead to start a selection;
  shift-click another to extend it. Hover a bead to preview-play it.

The basic loop is short:

1. Click a checkable point in the **Propositions** column to make it **active**
   (highlighted).
2. Listen to the audio, click bead(s) on the thread to select the span where
   that point is heard.
3. Click **Match to active point**.

A single bead span can carry several points — match it to each in turn (the
same selection stays available; just click another point and match again, or
repeat the selection).

If a whole proposition is delivered as one chunk, click the **proposition-level**
row (italic, at the top of each card) and match the span there. That counts as
matching every Q&A row inside the proposition.

You can also tag a selection directly here (framing / added / altered) without
matching it to a point — useful when you spot a repetition, addition, or
distortion in the moment.

### Step 6 · Sweep leftovers

Switch to **Sweep leftovers** in the top nav. The app lists every consecutive
run of beads that is still unclassified. For each:

- click **Play** to listen
- click **Framing / repetition** if the audio is legitimate oral structure
- click **Added meaning** if the audio carries content not in the map
- click **Altered** if the audio carries content that *should* be in the map but
  is distorted, shifted, or partially wrong

Add a short note when useful.

### Step 7 · Review & export

The Review screen shows:

- how many checkable points are matched vs unmatched
- how many beads are covered, framing, added, altered, or still unclassified
- a list of any unmatched points (these are *missing meaning*)
- a list of any added- or altered-meaning beads (these are *drift*)

Add an overall mentor note, then **Download JSON report** for the project record
and/or **Download printable HTML report** for the team.

## When to switch granularity

If a proposition is delivered very quickly, switch to **fine** granularity to
get tighter anchors. If the recording is long and beads feel cluttered, switch
to **coarse**. The app re-bases your existing anchors against the new beads
automatically.

## Many-to-many is normal

A bead span can serve multiple points. A point can have multiple spans. Languages
condense and spread information differently. Don't force 1:1 anchors.

## Tips

- **Listen first, match second.** Play the whole audio once before matching.
- **Match at proposition level when you can.** It's faster and the rollup
  shows it as full coverage of the children.
- **Drop down to Q&A level only when needed** — when one row is missing while
  others in the same proposition are present.
- **Don't fight the language.** Repetition and oral framing are not errors —
  tag them and move on.
- **Tag, don't argue.** If you suspect added meaning, tag it and write a note;
  the consultant reviews tagged spans later.
