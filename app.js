// Oral Retro-Verification — Tripod Ecosystem
// Static, single-file vanilla JS module. No build step.
// Borrows the bead/audio/persistence architecture of Easy-Beads v3, replaces the
// question-authoring layer with a coverage-driven link/tag layer.

// =============================================================================
// Constants
// =============================================================================

const SCHEMA_VERSION = "TRIPOD_RETRO_VERIFICATION_REPORT_V1";
const STORAGE_KEY = "oral-retro-verification-v1";
const LANG_KEY = "obt-retro-verification-lang";

// =============================================================================
// Bilingual support
// =============================================================================

// Auto-detect: pt-BR / pt-PT / pt-* → "pt", everything else → "en". User can
// override via the EN/PT toggle in the header; the choice persists in
// localStorage.
function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "pt") return saved;
  } catch {}
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("pt") ? "pt" : "en";
}

let CURRENT_LANG = detectLang();

// Tiny helper: pick the right string for the current language. Strings are
// inlined at every call site (`L("Setup", "Configurar")`) — no key table.
function L(en, pt) {
  return CURRENT_LANG === "pt" ? pt : en;
}

function setLang(lang) {
  if (lang !== "en" && lang !== "pt") return;
  CURRENT_LANG = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  applyShellI18n();
  render();
}

// Apply translations to all persistent shell elements that carry data-pt /
// data-pt-title / data-pt-aria attributes. Called on init and on language
// change.
function applyShellI18n() {
  const isPt = CURRENT_LANG === "pt";
  document.documentElement.lang = isPt ? "pt-BR" : "en";
  document.title = isPt
    ? "Retroverificação OBT — Ecossistema Tripod"
    : "OBT Retro-Verification — Tripod Ecosystem";

  document.querySelectorAll("[data-pt]").forEach((el) => {
    if (el.dataset._enText === undefined) el.dataset._enText = el.textContent;
    el.textContent = isPt ? el.dataset.pt : el.dataset._enText;
  });
  document.querySelectorAll("[data-pt-title]").forEach((el) => {
    if (el.dataset._enTitle === undefined) el.dataset._enTitle = el.title || "";
    el.title = isPt ? el.dataset.ptTitle : el.dataset._enTitle;
  });
  document.querySelectorAll("[data-pt-aria]").forEach((el) => {
    if (el.dataset._enAria === undefined) el.dataset._enAria = el.getAttribute("aria-label") || "";
    el.setAttribute("aria-label", isPt ? el.dataset.ptAria : el.dataset._enAria);
  });

  // Sync the EN/PT toggle visual state.
  document.querySelectorAll("#langToggle button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.lang === CURRENT_LANG);
  });
}

// Bead synthesis defaults (used when no acoustemes manifest is provided).
// Medium = ~0.5s/bead. Coarse doubles, fine halves.
const SECONDS_PER_BEAD = { coarse: 1.0, medium: 0.5, fine: 0.25 };

// Acoustemes-driven granularity (matches Easy-Beads v3).
const FRAMES_PER_BEAD = { coarse: 50, medium: 25, fine: 10 };

const STEPS = [
  { id: "setup",  label: "1", name_en: "Setup Your Verification Session", name_pt: "Configure sua sessão de verificação" },
  { id: "study",  label: "2", name_en: "Study the Meaning Map of the Passage", name_pt: "Estude o mapa de significado da passagem" },
  { id: "whole",  label: "3", name_en: "Listen to the Audio Draft With the Team", name_pt: "Ouça o rascunho de áudio com a equipe" },
  { id: "scenes", label: "4", name_en: "Verify People, Places, Objects and Elements", name_pt: "Verifique pessoas, lugares, objetos e elementos" },
  { id: "match",  label: "5", name_en: "Match Audio to Meaning", name_pt: "Combine áudio com significado" },
  { id: "sweep",  label: "6", name_en: "Check Unmarked Beads", name_pt: "Verifique contas não marcadas" },
  { id: "key",    label: "7", name_en: "Verify Key Terms", name_pt: "Verifique termos-chave" },
  { id: "review", label: "8", name_en: "Write Your Report", name_pt: "Escreva seu relatório" },
];

function stepName(step) {
  return CURRENT_LANG === "pt" ? step.name_pt : step.name_en;
}

// Suggested prompts for the Level 1 conversational review. Static — they are
// guides for the mentor's conversation, not a form to fill out.
const LEVEL1_PROMPTS_EN = [
  "Can the team retell what they heard in their own words?",
  "Is this a narrative? Did the team hear it as a story?",
  "What is the register — formal/official, intimate/family, or something else?",
  "What emotions are expressed or evident in the audio?",
  "Where and when does the story take place? Did the team hear that?",
  "Why is this story being told? What does it leave with the listener?",
  "Did anything in the audio surprise the team or sound off?",
];

const LEVEL1_PROMPTS_PT = [
  "A equipe consegue recontar o que ouviu com suas próprias palavras?",
  "Isto é uma narrativa? A equipe ouviu como uma história?",
  "Qual é o registro — formal/oficial, íntimo/familiar, ou outro?",
  "Quais emoções estão expressas ou evidentes no áudio?",
  "Onde e quando a história se passa? A equipe ouviu isso?",
  "Por que essa história está sendo contada? O que ela deixa para quem ouve?",
  "Algo no áudio surpreendeu a equipe ou soou estranho?",
];

function level1Prompts() {
  return CURRENT_LANG === "pt" ? LEVEL1_PROMPTS_PT : LEVEL1_PROMPTS_EN;
}

// =============================================================================
// State
// =============================================================================

const state = {
  view: "setup",
  // Inputs
  meaningMap: null, // flat propositions array (canonical internal shape — Level 3)
  scenes: [], // optional Level-2 scenes from rich input shape
  level1: null, // optional Level-1 whole-passage interpretation
  conceptBank: [], // optional Concept-Bank items (Key Terms step 7)
  figureFlags: [], // optional Figure / Idiom flags (Key Terms step 7)
  meaningMapFilename: "",
  meaningMapHash: "",
  audioSource: { filename: "", url: "", duration: 0 },
  acoustemes: null, // normalized {duration_sec, segments:[{start,end,unit_id}]}
  englishVersions: [], // [{name, text}]
  englishActiveIndex: 0,
  // Derived
  checkablePoints: [], // [{id, level: "proposition"|"qa", proposition, qIndex, ref, text}]
  beads: [], // [{index, startTime, endTime}]
  // Mentor work
  links: [], // [{id, point_id, start_bead_index, end_bead_index, audio_start_sec, audio_end_sec, note}]
  beadTags: [], // [{id, start_bead_index, end_bead_index, tag, note}] tag in {framing, added, altered}
  // Level 1 review (whole-story conversation)
  level1Review: { notes: "", revision: "none", revision_comment: "" },
  // Level 2 review (per-scene). Keyed by scene number.
  // Each entry: { status: "pending"|"ok"|"off", note, absence_confirmed, absence_note }
  level2Review: {},
  // Key Terms review (per concept-bank item). Keyed by term string.
  // Each entry: { status: "pending"|"ok"|"concern", note }
  keyTermsReview: {},
  // Figure flag review. Keyed by figure string.
  // Each entry: { status: "pending"|"ok"|"concern", note }
  figureFlagsReview: {},
  mentorOverallNote: "",
  // Session
  metadata: {
    mentor_id: "",
    team_present: "",
    project_title: "",
    translation_language: "",
    location: "",
    organization: "",
    started_at: "",
  },
  // UI
  beadGranularity: "medium",
  beadZoom: "standard",
  hoverPointId: null,   // transient: point/scene row currently hovered (preview only)
  selection: null, // {start, end} bead indices
  drag: null, // {anchorIndex} during selection drag
  hoverPreviewBeadIndex: null,
  banner: null, // {kind, text}
  studyVersions: detectLang() === "pt" ? "NVI,ARA,NTLH,ARC" : "NIV,ESV,NLT,NRSV",
};

// =============================================================================
// DOM refs
// =============================================================================

const dom = {
  storyStatus: document.getElementById("storyStatus"),
  stepNav: document.getElementById("stepNav"),
  audioDock: document.getElementById("audioDock"),
  audioElement: document.getElementById("audioElement"),
  playToggle: document.getElementById("playToggleButton"),
  backward: document.getElementById("backwardButton"),
  forward: document.getElementById("forwardButton"),
  audioTitle: document.getElementById("audioTitle"),
  audioBeadTimeline: document.getElementById("audioBeadTimeline"),
  currentTimeLabel: document.getElementById("currentTimeLabel"),
  durationLabel: document.getElementById("durationLabel"),
  granularity: document.getElementById("granularityControls"),
  rangeLabel: document.getElementById("rangeLabel"),
  banner: document.getElementById("banner"),
  screen: document.getElementById("screen"),
  summaryDialog: document.getElementById("summaryDialog"),
  summaryContent: document.getElementById("summaryContent"),
  summaryToggle: document.getElementById("summaryToggle"),
  resetSession: document.getElementById("resetSession"),
  openPassageBtn: document.getElementById("openPassageBtn"),
};

// =============================================================================
// Utilities
// =============================================================================

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

const fmtTime = (sec) => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const uid = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function hashString(text) {
  try {
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

function setBanner(kind, text) {
  state.banner = text ? { kind, text } : null;
  renderBanner();
}

// =============================================================================
// Bible passage parsing & external study links
// =============================================================================

// Parse a single reference like "Esther 2:19" or "1 Samuel 3:4a".
// Returns {book, chapter, verse, sub} or null.
function parseRef(s) {
  // Allow Unicode letters so Portuguese book names with accents (Coríntios,
  // Gálatas, Apocalipse, etc.) parse correctly alongside English ones.
  const m = String(s ?? "").match(/^(\d?\s*[\p{L}][\p{L}\s]*?)\s+(\d+):(\d+)([a-z])?\s*$/u);
  if (!m) return null;
  return {
    book: m[1].trim().replace(/\s+/g, " "),
    chapter: Number(m[2]),
    verse: Number(m[3]),
    sub: m[4] || "",
  };
}

// Aggregate the meaning map's references into a single passage range.
function passageRangeFromMap() {
  if (!state.meaningMap) return null;
  const refs = state.meaningMap.map((p) => parseRef(p.reference)).filter(Boolean);
  if (!refs.length) return null;
  const book = refs[0].book;
  const sortKey = (r) => r.chapter * 1000 + r.verse;
  refs.sort((a, b) => sortKey(a) - sortKey(b));
  const min = refs[0];
  const max = refs[refs.length - 1];
  const display = min.chapter === max.chapter
    ? `${book} ${min.chapter}:${min.verse}-${max.verse}`
    : `${book} ${min.chapter}:${min.verse}-${max.chapter}:${max.verse}`;
  return { book, startChapter: min.chapter, startVerse: min.verse, endChapter: max.chapter, endVerse: max.verse, display };
}

// Canonical NT book names in English and Portuguese; everything else is
// treated as Old Testament for the purpose of the original-language pick
// (Greek for NT, Hebrew for OT).
const NT_BOOKS = new Set([
  // English
  "Matthew","Mark","Luke","John","Acts",
  "Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians",
  "Philippians","Colossians","1 Thessalonians","2 Thessalonians",
  "1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James",
  "1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation",
  // Portuguese
  "Mateus","Marcos","Lucas","João","Atos",
  "Romanos","1 Coríntios","2 Coríntios","Gálatas","Efésios",
  "Filipenses","Colossenses","1 Tessalonicenses","2 Tessalonicenses",
  "1 Timóteo","2 Timóteo","Tito","Filemom","Hebreus","Tiago",
  "1 Pedro","2 Pedro","1 João","2 João","3 João","Judas","Apocalipse",
]);

function originalLanguageCodeForBook(book) {
  if (!book) return null;
  // Bible Gateway codes: WLC = Westminster Leningrad Codex (Hebrew OT);
  // SBLGNT = SBL Greek New Testament.
  return NT_BOOKS.has(book.trim()) ? "SBLGNT" : "WLC";
}

function bibleGatewayUrl(versions) {
  const range = passageRangeFromMap();
  if (!range) return null;
  const list = (versions || "NIV").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  // Always include an original-language column so the team can see Greek/Hebrew
  // alongside the working-language versions.
  const original = originalLanguageCodeForBook(range.book);
  if (original && !list.some((v) => v.toUpperCase() === original)) list.push(original);
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(range.display)}&version=${encodeURIComponent(list.join(";"))}`;
}

function updateOpenPassageBtn() {
  const url = bibleGatewayUrl(state.studyVersions);
  if (!url) {
    dom.openPassageBtn.hidden = true;
    return;
  }
  dom.openPassageBtn.hidden = false;
  dom.openPassageBtn.href = url;
  const range = passageRangeFromMap();
  dom.openPassageBtn.title = `Opens ${range.display} in a new tab`;
}

// =============================================================================
// Meaning map → checkable points
// =============================================================================

// Accepts either:
//  - a flat array of propositions (the original shape), or
//  - an object {scenes: [...], propositions: [...]} (rich shape with Level 2).
function parseMeaningMap(parsed) {
  if (Array.isArray(parsed)) {
    return { propositions: parsed, scenes: [], level1: null, conceptBank: [], figureFlags: [] };
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.propositions)) {
    return {
      propositions: parsed.propositions,
      scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
      level1: (parsed.level_1 && typeof parsed.level_1 === "object") ? parsed.level_1 : null,
      conceptBank: Array.isArray(parsed.concept_bank) ? parsed.concept_bank : [],
      figureFlags: Array.isArray(parsed.figure_flags) ? parsed.figure_flags : [],
    };
  }
  throw new Error("Meaning map must be a JSON array, or an object with a 'propositions' array.");
}

// Build a list of {label, text} pairs from whichever Level-1 field set the
// meaning map provides. Supports both the PDF's rich names and the original
// short names side by side.
function getLevel1Display() {
  const L1 = state.level1;
  if (!L1) return [];
  const candidates = [
    ["prose_arc", L("Prose Arc / Shape / Argument / Burden / Concern", "Arco / Forma / Argumento / Carga / Preocupação")],
    ["context", L("Context", "Contexto")],
    ["emotion_tone", L("Emotion / Tone", "Emoção / Tom")],
    ["communicative_function", L("Communicative Function", "Função comunicativa")],
    ["what_the_story_is_about_and_its_shape", L("What the story is about and its shape", "Sobre o que é a história e sua forma")],
    ["where_and_when", L("Where and when", "Onde e quando")],
    ["feeling_of_the_story", L("Feeling of the story", "Sentimento da história")],
    ["why_being_told", L("Why being told", "Por que está sendo contada")],
  ];
  return candidates
    .filter(([k]) => typeof L1[k] === "string" && L1[k].trim().length)
    .map(([k, label]) => ({ label, text: L1[k] }));
}

function sceneForProposition(propNum) {
  if (!state.scenes?.length) return null;
  return state.scenes.find((s) => Array.isArray(s.propositions) && s.propositions.includes(propNum)) || null;
}

// All proposition-level point ids inside a given scene (one per proposition).
function propLevelIdsInScene(sceneNum) {
  const sc = state.scenes.find((s) => s.scene === sceneNum);
  if (!sc) return [];
  return (sc.propositions || []).map((pn) => `p${pn}`);
}

// Beads linked to a single hover-preview point, used for transient highlight.
function beadsLinkedToPoint(pointId) {
  const set = new Set();
  for (const link of state.links) {
    if (link.point_id === pointId) {
      for (let i = link.start_bead_index; i <= link.end_bead_index; i++) set.add(i);
    }
  }
  return set;
}

// Does this point have a link whose bead range exactly matches the current
// bead selection? This is what drives the checkbox state in the propositions
// column. Ticking the box creates a link to the current selection; unticking
// removes the matching link(s).
function pointHasLinkToCurrentSelection(pointId) {
  if (!state.selection) return false;
  return state.links.some((l) =>
    l.point_id === pointId &&
    l.start_bead_index === state.selection.start &&
    l.end_bead_index === state.selection.end
  );
}

// Returns true if every scene checkbox should be ticked, i.e. every
// proposition-level point in this scene already has a link covering the
// current selection. Used for scene-level checkbox state.
function sceneFullyLinkedToCurrentSelection(sceneNum) {
  const ids = propLevelIdsInScene(sceneNum);
  if (!ids.length || !state.selection) return false;
  return ids.every(pointHasLinkToCurrentSelection);
}

function sceneAnyLinkedToCurrentSelection(sceneNum) {
  const ids = propLevelIdsInScene(sceneNum);
  if (!ids.length || !state.selection) return false;
  return ids.some(pointHasLinkToCurrentSelection);
}

// A scene is fully matched when every proposition inside it has all of its
// child Q&A points covered (either directly or via a proposition-level link).
// Used to colour the scene card on the Match screen once the team has worked
// the whole scene.
function sceneFullyMatched(sceneNum) {
  const sc = state.scenes.find((s) => s.scene === sceneNum);
  if (!sc || !(sc.propositions || []).length) return false;
  return sc.propositions.every((pn) => {
    const r = propositionRollup(pn);
    return r.children > 0 && r.anchored === r.children;
  });
}

function deriveCheckablePoints(meaningMap) {
  const out = [];
  meaningMap.forEach((p) => {
    const propId = `p${p.proposition}`;
    out.push({
      id: propId,
      level: "proposition",
      proposition: p.proposition,
      qIndex: -1,
      ref: p.reference || "",
      text: p.summary || `Proposition ${p.proposition}`,
    });
    (p.questions || []).forEach((qa, idx) => {
      out.push({
        id: `${propId}.q${idx + 1}`,
        level: "qa",
        proposition: p.proposition,
        qIndex: idx,
        ref: p.reference || "",
        text: `${qa.q} → ${qa.a}`,
      });
    });
  });
  return out;
}

// =============================================================================
// Bead construction
// =============================================================================

function buildBeads() {
  const duration = state.audioSource.duration || 0;
  if (duration <= 0) {
    state.beads = [];
    return;
  }
  if (state.acoustemes && state.acoustemes.segments?.length) {
    buildBeadsFromAcoustemes();
  } else {
    buildBeadsFromDuration();
  }
}

function buildBeadsFromDuration() {
  const sec = SECONDS_PER_BEAD[state.beadGranularity] || 0.5;
  const duration = state.audioSource.duration;
  const count = Math.max(1, Math.ceil(duration / sec));
  const beads = [];
  for (let i = 0; i < count; i++) {
    const start = i * sec;
    const end = Math.min((i + 1) * sec, duration);
    beads.push({ index: i, startTime: start, endTime: end });
  }
  state.beads = beads;
}

function buildBeadsFromAcoustemes() {
  const framesPerBead = FRAMES_PER_BEAD[state.beadGranularity] || 25;
  const segments = state.acoustemes.segments;
  const beads = [];
  for (let i = 0; i < segments.length; i += framesPerBead) {
    const slice = segments.slice(i, i + framesPerBead);
    if (!slice.length) continue;
    beads.push({
      index: beads.length,
      startTime: slice[0].start,
      endTime: slice[slice.length - 1].end,
    });
  }
  state.beads = beads;
}

function normalizeAcoustemeManifest(source) {
  if (!source || typeof source !== "object") return null;
  if (Array.isArray(source.segments)) {
    return {
      duration_sec: source.duration_sec ?? source.durationSec ?? 0,
      segments: source.segments.map((s) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        unit_id: s.unit_id ?? s.unitId ?? "",
      })),
    };
  }
  if (Array.isArray(source.units) && Array.isArray(source.timestamps)) {
    const segments = source.units.map((u, i) => {
      const ts = source.timestamps[i] || {};
      return {
        start: Number(ts.start ?? ts[0] ?? 0),
        end: Number(ts.end ?? ts[1] ?? 0),
        unit_id: typeof u === "string" ? u : u?.unit_id || "",
      };
    });
    return {
      duration_sec: source.duration_sec ?? source.durationSec ?? 0,
      segments,
    };
  }
  if (Array.isArray(source.U_acoustemes)) {
    const fdMs = source.frame_duration_ms ?? source.frameDurationMs ?? 20;
    const fd = fdMs / 1000;
    const segments = source.U_acoustemes.map((u, i) => ({
      start: i * fd,
      end: (i + 1) * fd,
      unit_id: typeof u === "string" ? u : String(u),
    }));
    return {
      duration_sec: segments.length * fd,
      segments,
    };
  }
  return null;
}

// =============================================================================
// Derived bead status
// =============================================================================

function beadStatusMap() {
  const map = new Array(state.beads.length).fill("unclassified");
  for (const link of state.links) {
    for (let i = link.start_bead_index; i <= link.end_bead_index; i++) {
      if (i >= 0 && i < map.length) map[i] = "covered";
    }
  }
  for (const tag of state.beadTags) {
    for (let i = tag.start_bead_index; i <= tag.end_bead_index; i++) {
      if (i >= 0 && i < map.length) {
        // Coverage wins over tag: a bead linked to a meaning point is covered
        // even if a tag also touches it. Tags only color the leftover beads.
        if (map[i] === "unclassified") map[i] = tag.tag;
      }
    }
  }
  return map;
}

function pointAnchorCount(pointId) {
  return state.links.filter((l) => l.point_id === pointId).length;
}

function propositionRollup(propNum) {
  const childPoints = state.checkablePoints.filter(
    (p) => p.level === "qa" && p.proposition === propNum
  );
  const propPoint = state.checkablePoints.find(
    (p) => p.level === "proposition" && p.proposition === propNum
  );
  const propAnchored = pointAnchorCount(propPoint.id) > 0;
  // A proposition-level anchor counts as covering every child row.
  const childrenAnchored = childPoints.filter(
    (c) => propAnchored || pointAnchorCount(c.id) > 0
  ).length;
  return { children: childPoints.length, anchored: childrenAnchored, propAnchored };
}

// =============================================================================
// Persistence
// =============================================================================

let persistTimer = null;
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistSession, 250);
}

function persistSession() {
  try {
    const snapshot = {
      version: SCHEMA_VERSION,
      view: state.view,
      meaningMap: state.meaningMap,
      scenes: state.scenes,
      level1: state.level1,
      conceptBank: state.conceptBank,
      figureFlags: state.figureFlags,
      level1Review: state.level1Review,
      level2Review: state.level2Review,
      keyTermsReview: state.keyTermsReview,
      figureFlagsReview: state.figureFlagsReview,
      meaningMapFilename: state.meaningMapFilename,
      meaningMapHash: state.meaningMapHash,
      audioSource: { filename: state.audioSource.filename, duration: state.audioSource.duration },
      acoustemes: state.acoustemes,
      englishVersions: state.englishVersions,
      englishActiveIndex: state.englishActiveIndex,
      checkablePoints: state.checkablePoints,
      links: state.links,
      beadTags: state.beadTags,
      mentorOverallNote: state.mentorOverallNote,
      metadata: state.metadata,
      beadGranularity: state.beadGranularity,
      beadZoom: state.beadZoom,
      studyVersions: state.studyVersions,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.warn("persist failed", e);
  }
}

function restoreSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw);
    if (snap.version !== SCHEMA_VERSION) return false;
    Object.assign(state, {
      view: snap.view || "setup",
      meaningMap: snap.meaningMap || null,
      scenes: snap.scenes || [],
      level1: snap.level1 || null,
      conceptBank: snap.conceptBank || [],
      figureFlags: snap.figureFlags || [],
      level1Review: snap.level1Review || { notes: "", revision: "none", revision_comment: "" },
      level2Review: snap.level2Review || {},
      keyTermsReview: snap.keyTermsReview || {},
      figureFlagsReview: snap.figureFlagsReview || {},
      meaningMapFilename: snap.meaningMapFilename || "",
      meaningMapHash: snap.meaningMapHash || "",
      audioSource: { filename: snap.audioSource?.filename || "", url: "", duration: snap.audioSource?.duration || 0 },
      acoustemes: snap.acoustemes || null,
      englishVersions: snap.englishVersions || [],
      englishActiveIndex: snap.englishActiveIndex || 0,
      checkablePoints: snap.checkablePoints || [],
      links: snap.links || [],
      beadTags: snap.beadTags || [],
      mentorOverallNote: snap.mentorOverallNote || "",
      metadata: { ...state.metadata, ...(snap.metadata || {}) },
      beadGranularity: snap.beadGranularity || "medium",
      beadZoom: snap.beadZoom || "standard",
      studyVersions: snap.studyVersions || state.studyVersions,
    });
    if (state.audioSource.duration > 0) buildBeads();
    return true;
  } catch (e) {
    console.warn("restore failed", e);
    return false;
  }
}

function resetSession() {
  if (!confirm(L("Reset the session? Matches, tags, and notes will be cleared.", "Reiniciar a sessão? Combinações, marcações e notas serão apagadas."))) return;
  sessionStorage.removeItem(STORAGE_KEY);
  location.reload();
}

// =============================================================================
// Audio control
// =============================================================================

let rangeStopHandler = null;

function attachAudio(file) {
  const url = URL.createObjectURL(file);
  state.audioSource.url = url;
  state.audioSource.filename = file.name;
  dom.audioElement.src = url;
  dom.audioElement.addEventListener(
    "loadedmetadata",
    () => {
      state.audioSource.duration = dom.audioElement.duration;
      buildBeads();
      schedulePersist();
      render();
    },
    { once: true }
  );
}

function togglePlayback() {
  if (!dom.audioElement.src) return;
  if (dom.audioElement.paused) dom.audioElement.play();
  else dom.audioElement.pause();
}

function seekRelative(delta) {
  if (!dom.audioElement.duration) return;
  dom.audioElement.currentTime = Math.max(
    0,
    Math.min(dom.audioElement.duration, dom.audioElement.currentTime + delta)
  );
}

function playRange(start, end) {
  if (!dom.audioElement.src) return;
  if (rangeStopHandler) {
    dom.audioElement.removeEventListener("timeupdate", rangeStopHandler);
    rangeStopHandler = null;
  }
  dom.audioElement.currentTime = start;
  dom.audioElement.play();
  rangeStopHandler = () => {
    if (dom.audioElement.currentTime >= end) {
      dom.audioElement.pause();
      dom.audioElement.removeEventListener("timeupdate", rangeStopHandler);
      rangeStopHandler = null;
    }
  };
  dom.audioElement.addEventListener("timeupdate", rangeStopHandler);
}

function playSelection() {
  if (!state.selection) return;
  const a = state.beads[state.selection.start];
  const b = state.beads[state.selection.end];
  if (!a || !b) return;
  playRange(a.startTime, b.endTime);
}

function playBeadRange(startIdx, endIdx) {
  const a = state.beads[startIdx];
  const b = state.beads[endIdx];
  if (!a || !b) return;
  playRange(a.startTime, b.endTime);
}

// =============================================================================
// Render: shell
// =============================================================================

const trackedScrollIds = ["mapColumn", "threadColumn", "contextColumn"];
const trackedScrolls = new Map();

function captureColumnScrolls() {
  for (const id of trackedScrollIds) {
    const el = document.getElementById(id);
    if (el) trackedScrolls.set(id, el.scrollTop);
  }
}

function restoreColumnScrolls() {
  for (const id of trackedScrollIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    const saved = trackedScrolls.get(id);
    if (typeof saved === "number") el.scrollTop = saved;
  }
}

function render() {
  captureColumnScrolls();
  renderStoryStatus();
  renderStepNav();
  renderAudioDock();
  renderBanner();
  renderScreen();
  renderAudioProgressBeads();
  updateOpenPassageBtn();
  restoreColumnScrolls();
  schedulePersist();
}

function renderStoryStatus() {
  const parts = [];
  if (state.metadata.project_title) parts.push(`<strong>${escapeHtml(state.metadata.project_title)}</strong>`);
  if (state.metadata.translation_language) parts.push(`${L("Translation", "Tradução")}: ${escapeHtml(state.metadata.translation_language)}`);
  if (state.metadata.location) parts.push(`${L("Location", "Localidade")}: ${escapeHtml(state.metadata.location)}`);
  if (state.metadata.organization) parts.push(`${L("Organization", "Organização")}: ${escapeHtml(state.metadata.organization)}`);
  if (state.metadata.mentor_id) parts.push(`${L("Mentor", "Mentor")}: ${escapeHtml(state.metadata.mentor_id)}`);
  if (state.audioSource.filename) parts.push(`${L("Audio", "Áudio")}: <span class="filename">${escapeHtml(state.audioSource.filename)}</span>`);
  if (state.meaningMapFilename) parts.push(`${L("Meaning map", "Mapa de significado")}: <span class="filename">${escapeHtml(state.meaningMapFilename)}</span>`);
  dom.storyStatus.innerHTML = parts.length
    ? parts.map((p) => `<p>${p}</p>`).join("")
    : `<p>${L("Load a meaning map and the translation audio to begin.", "Carregue um mapa de significado e o áudio da tradução para começar.")}</p>`;
}

function renderStepNav() {
  const hasMap = !!state.meaningMap;
  const hasAudio = !!state.audioSource.url && state.beads.length > 0;
  const ready = hasMap && hasAudio;
  dom.stepNav.innerHTML = STEPS.map((step) => {
    const isCurrent = state.view === step.id;
    let disabled = false;
    if (step.id === "study" || step.id === "whole" || step.id === "scenes") disabled = !hasMap;
    if (step.id === "match" || step.id === "sweep" || step.id === "key" || step.id === "review") disabled = !ready;
    return `
      <button type="button" data-action="step" data-step="${step.id}"
              title="${escapeHtml(stepName(step))}"
              ${isCurrent ? 'aria-current="step"' : ""}
              ${disabled ? "disabled" : ""}>
        <span class="step-label">${L("Step", "Etapa")} ${step.label}</span>
      </button>`;
  }).join("");
}

function renderAudioDock() {
  // The persistent audio dock (with the full-story bead timeline) shows on the
  // steps where the team is listening together to the whole audio: Step 3
  // (Whole Story) and Step 4 (Organize Your Props). Step 5 (Match) has its own
  // bead thread and granularity selector, so the dock is hidden there.
  // The element has `display: grid` in CSS, which overrides the `hidden`
  // attribute, so toggle display directly.
  const showDock = state.view === "whole" || state.view === "scenes";
  dom.audioDock.style.display = showDock ? "" : "none";
  if (!showDock) return;
  const hasAudio = !!dom.audioElement.src;
  dom.playToggle.disabled = !hasAudio;
  dom.backward.disabled = !hasAudio;
  dom.forward.disabled = !hasAudio;
  dom.audioTitle.textContent = state.audioSource.filename || L("Choose a recording to begin.", "Escolha um áudio para começar.");
  dom.durationLabel.textContent = fmtTime(state.audioSource.duration);
  dom.currentTimeLabel.textContent = fmtTime(dom.audioElement.currentTime || 0);
  dom.playToggle.textContent = dom.audioElement.paused ? L("Play", "Tocar") : L("Pause", "Pausar");
  renderGranularityControls();
  if (state.selection) {
    const a = state.beads[state.selection.start];
    const b = state.beads[state.selection.end];
    if (a && b) {
      const sel = `${state.selection.start + 1}–${state.selection.end + 1} (${fmtTime(a.startTime)}–${fmtTime(b.endTime)})`;
      dom.rangeLabel.textContent = L(`Selection: beads ${sel}.`, `Seleção: contas ${sel}.`);
    }
  } else {
    dom.rangeLabel.textContent = "";
  }
}

function renderGranularityControls() {
  if (!state.beads.length) {
    dom.granularity.innerHTML = "";
    return;
  }
  const granLabel = { coarse: L("coarse", "grossa"), medium: L("medium", "média"), fine: L("fine", "fina") };
  dom.granularity.innerHTML = `
    <div class="control-group">
      <label for="granSelect">${L("Bead granularity", "Granularidade das contas")}</label>
      <select id="granSelect">
        ${["coarse", "medium", "fine"].map(g => `<option value="${g}" ${state.beadGranularity===g?"selected":""}>${granLabel[g]}</option>`).join("")}
      </select>
    </div>
    <div class="control-group">
      <label>${L("Beads", "Contas")}: ${state.beads.length}</label>
    </div>
  `;
  dom.granularity.querySelector("#granSelect").addEventListener("change", (e) => {
    state.beadGranularity = e.target.value;
    // Granularity change invalidates current selection and existing index-based links.
    // We keep the audio-time-based info on links, but re-derive the bead indices.
    state.selection = null;
    buildBeads();
    rebaseLinksAndTagsToBeads();
    render();
  });
}

function rebaseLinksAndTagsToBeads() {
  const findIdx = (sec) => {
    let best = 0;
    let bestDelta = Infinity;
    for (const b of state.beads) {
      const d = Math.abs(b.startTime - sec);
      if (d < bestDelta) {
        bestDelta = d;
        best = b.index;
      }
    }
    return best;
  };
  for (const l of state.links) {
    l.start_bead_index = findIdx(l.audio_start_sec);
    l.end_bead_index = Math.max(l.start_bead_index, findIdx(l.audio_end_sec));
  }
  for (const t of state.beadTags) {
    const startSec = state.beads[t.start_bead_index]?.startTime ?? 0;
    const endSec = state.beads[t.end_bead_index]?.endTime ?? 0;
    t.start_bead_index = findIdx(startSec);
    t.end_bead_index = Math.max(t.start_bead_index, findIdx(endSec));
  }
}

function renderBanner() {
  if (!state.banner) {
    dom.banner.classList.add("hidden");
    dom.banner.textContent = "";
    return;
  }
  dom.banner.classList.remove("hidden", "is-warning", "is-success");
  if (state.banner.kind === "warning") dom.banner.classList.add("is-warning");
  if (state.banner.kind === "success") dom.banner.classList.add("is-success");
  dom.banner.textContent = state.banner.text;
}

function renderAudioProgressBeads() {
  if (!state.beads.length) {
    dom.audioBeadTimeline.innerHTML = "";
    return;
  }
  const now = dom.audioElement.currentTime || 0;
  dom.audioBeadTimeline.innerHTML = state.beads
    .map((b) => {
      const isCurrent = now >= b.startTime && now < b.endTime;
      const isPlayed = now >= b.endTime;
      return `<button class="recording-bead ${isPlayed ? "is-played" : ""} ${isCurrent ? "is-current" : ""}"
                       data-action="seek-bead" data-bead="${b.index}"
                       title="Bead ${b.index + 1} (${fmtTime(b.startTime)})"></button>`;
    })
    .join("");
}

// =============================================================================
// Render: screens
// =============================================================================

function renderScreen() {
  switch (state.view) {
    case "setup": renderSetupScreen(); break;
    case "study": renderStudyScreen(); break;
    case "whole": renderWholeStoryScreen(); break;
    case "scenes": renderScenesReviewScreen(); break;
    case "match": renderMatchScreen(); break;
    case "sweep": renderSweepScreen(); break;
    case "key": renderKeyTermsScreen(); break;
    case "review": renderReviewScreen(); break;
    default: dom.screen.innerHTML = "";
  }
}

// ----- Setup -----

function renderSetupScreen() {
  dom.screen.innerHTML = `
    <h2 class="screen-title">${L("Setup Your Verification Session", "Configure sua sessão de verificação")}</h2>
    <div class="setup-grid">
      <div class="setup-card">
        <h3>${L("1 · Project info", "1 · Informações do projeto")}</h3>
        <div class="field"><label>${L("Project title", "Título do projeto")}</label>
          <input type="text" data-field="project_title" value="${escapeHtml(state.metadata.project_title)}" /></div>
        <div class="field"><label>${L("Translation language", "Língua da tradução")}</label>
          <input type="text" data-field="translation_language" value="${escapeHtml(state.metadata.translation_language)}" /></div>
        <div class="field"><label>${L("Location", "Localidade")}</label>
          <input type="text" data-field="location" value="${escapeHtml(state.metadata.location || "")}" /></div>
        <div class="field"><label>${L("Organization", "Organização")}</label>
          <input type="text" data-field="organization" value="${escapeHtml(state.metadata.organization || "")}" /></div>
        <div class="field"><label>${L("Mentor / consultant ID", "ID do mentor / consultor")}</label>
          <input type="text" data-field="mentor_id" value="${escapeHtml(state.metadata.mentor_id)}" /></div>
        <div class="field"><label>${L("Team members present", "Membros da equipe presentes")}</label>
          <input type="text" data-field="team_present" placeholder="${L("comma-separated", "separados por vírgula")}" value="${escapeHtml(state.metadata.team_present)}" /></div>
      </div>

      <div class="setup-card">
        <h3>${L("2 · Meaning map (working language)", "2 · Mapa de significado (idioma de trabalho)")}</h3>
        <p>${L("Upload a consultant-approved meaning map for the passage in JSON format.", "Carregue um mapa de significado aprovado pelo consultor para a passagem em formato JSON.")}</p>
        <input type="file" accept="application/json,.json" data-action="upload-meaning-map" />
        ${state.meaningMap ? `<p class="loaded-info">${L("Loaded", "Carregado")} <span class="filename">${escapeHtml(state.meaningMapFilename)}</span> · ${state.meaningMap.length} ${L("propositions", "proposições")} · ${state.checkablePoints.length} ${L("checkable points", "pontos a verificar")}</p>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="ghost-button" type="button" data-action="load-demo-map">${L("Load Esther 2:19–23 demo", "Carregar demo de Ester 2:19–23")}</button>
          <button class="ghost-button" type="button" data-action="load-demo-map-jonah">${L("Load Jonah 4:5–8 demo", "Carregar demo de Jonas 4:5–8")}</button>
        </div>
      </div>

      <div class="setup-card">
        <h3>${L("3 · Translation audio", "3 · Áudio da tradução")}</h3>
        <p>${L("Upload the OBT audio draft to be verified.", "Carregue o rascunho do áudio OBT a ser verificado.")}</p>
        <input type="file" accept="audio/*" data-action="upload-audio" />
        ${state.audioSource.filename ? `<p class="loaded-info">${L("Loaded", "Carregado")} <span class="filename">${escapeHtml(state.audioSource.filename)}</span>${state.audioSource.duration ? ` · ${fmtTime(state.audioSource.duration)}` : ""}</p>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="ghost-button" type="button" data-action="load-demo-audio">${L("Load Esther demo audio", "Carregar áudio demo de Ester")}</button>
          <button class="ghost-button" type="button" data-action="load-demo-audio-jonah">${L("Load Jonah demo audio", "Carregar áudio demo de Jonas")}</button>
        </div>
      </div>

    </div>
    <div class="screen-footer setup-footer">
      <span></span>
      <button class="primary-button" type="button" data-action="step" data-step="study"
        ${state.meaningMap ? "" : "disabled"}>${L("Continue to Study →", "Continuar para Estudo →")}</button>
    </div>
  `;
}

// ----- Study -----

function renderStudyScreen() {
  if (!state.meaningMap) {
    dom.screen.innerHTML = `<p>${L("Load a meaning map on the Setup screen to begin studying.", "Carregue um mapa de significado na tela de Configuração para começar a estudar.")}</p>`;
    return;
  }
  const range = passageRangeFromMap();
  const url = bibleGatewayUrl(state.studyVersions);
  dom.screen.innerHTML = `
    <div class="study-screen">
      <div class="study-toolbar">
        <div>
          <h2 style="margin:0">${L("Study the Meaning Map of the Passage", "Estude o mapa de significado da passagem")}</h2>
          ${range ? `<p class="col-helper" style="margin:4px 0 0">${L("Detected passage", "Passagem detectada")}: <strong>${escapeHtml(range.display)}</strong></p>` : ""}
        </div>
        <div class="study-actions">
          ${url ? `<a href="${url}" target="_blank" rel="noopener">${L("Open Bible Gateway in new tab", "Abrir Bible Gateway em nova aba")}</a>` : ""}
          ${url ? `<button type="button" class="ghost-button" data-action="open-bible-side">${L("Open in side window", "Abrir em janela lateral")}</button>` : ""}
        </div>
      </div>
      <p class="col-helper">
        ${L(
          "Before the verification session, the mentor should study the meaning map of the passage carefully. Read it together with the Bible Gateway versions side by side — use <em>Open in side window</em> for a smaller window you can place next to this one.",
          "Antes da sessão de verificação, o mentor deve estudar com cuidado o mapa de significado da passagem. Leia-o junto com as versões do Bible Gateway lado a lado — use <em>Abrir em janela lateral</em> para uma janela menor que você pode colocar ao lado desta."
        )}
      </p>

      <div class="study-layout study-layout-single">
        <div class="study-column">
          <h3 class="study-section-head">${L("Meaning map", "Mapa de significado")}</h3>
          ${renderReadableMap()}
        </div>
      </div>

      <div class="screen-footer">
        <button class="ghost-button" type="button" data-action="step" data-step="setup">${L("← Back to Setup", "← Voltar para Configuração")}</button>
        <button class="primary-button" type="button" data-action="step" data-step="whole">${L("Continue to Whole Story →", "Continuar para Etapa 3 →")}</button>
      </div>
    </div>
  `;
}

function renderReadableMap() {
  let html = "";

  // Level 1 — whole-passage interpretation
  const L1 = getLevel1Display();
  if (L1.length) {
    html += `
      <section class="level-section">
        <h3 class="level-head"><span class="level-tag">${L("Level 1", "Nível 1")}</span> ${L("Whole story", "História toda")}</h3>
        <dl class="level1-list">
          ${L1.map((row) => `
            <div class="level1-row">
              <dt>${escapeHtml(row.label)}</dt>
              <dd>${escapeHtml(row.text)}</dd>
            </div>
          `).join("")}
        </dl>
      </section>
    `;
  }

  // Level 2 — scenes with people/places/objects/what-happens/communicative-purpose/absence
  if (state.scenes.length) {
    html += `
      <section class="level-section">
        <h3 class="level-head"><span class="level-tag">${L("Level 2", "Nível 2")}</span> ${L("Scenes", "Cenas")}</h3>
        ${state.scenes.map((sc) => `
          <div class="study-scene-card">
            <div class="study-scene-head">
              <span class="scene-badge">${L("Scene", "Cena")} ${sc.scene}</span>
              ${sc.title ? `<strong>${escapeHtml(sc.title)}</strong>` : ""}
              ${sc.range ? `<span class="col-helper">${escapeHtml(sc.range)}</span>` : ""}
            </div>
            ${sc.summary ? `<p class="study-scene-summary">${escapeHtml(sc.summary)}</p>` : ""}
            ${(sc.people || []).length ? `
              <details><summary>${L("People", "Pessoas")} (${sc.people.length})</summary>
                <table class="meaning-table">
                  <thead><tr><th>${L("Name", "Nome")}</th><th>${L("Role", "Papel")}</th><th>${L("Relationship", "Relacionamento")}</th><th>${L("Wants", "Quer")}</th><th>${L("Carries", "Carrega")}</th></tr></thead>
                  <tbody>${sc.people.map((p) => `<tr>
                    <td><strong>${escapeHtml(p.name||"")}</strong></td>
                    <td>${escapeHtml(p.role||"")}</td>
                    <td>${escapeHtml(p.relationship||"")}</td>
                    <td>${escapeHtml(p.wants||"")}</td>
                    <td>${escapeHtml(p.carries||"")}</td>
                  </tr>`).join("")}</tbody>
                </table></details>` : ""}
            ${(sc.places || []).length ? `
              <details><summary>${L("Places", "Lugares")} (${sc.places.length})</summary>
                <table class="meaning-table">
                  <thead><tr><th>${L("Name", "Nome")}</th><th>${L("Role", "Papel")}</th><th>${L("Type", "Tipo")}</th><th>${L("Meaning", "Significado")}</th><th>${L("Effect on scene", "Efeito na cena")}</th></tr></thead>
                  <tbody>${sc.places.map((p) => `<tr>
                    <td><strong>${escapeHtml(p.name||"")}</strong></td>
                    <td>${escapeHtml(p.role||"")}</td>
                    <td>${escapeHtml(p.type||"")}</td>
                    <td>${escapeHtml(p.meaning||"")}</td>
                    <td>${escapeHtml(p.effect_on_scene||"")}</td>
                  </tr>`).join("")}</tbody>
                </table></details>` : ""}
            ${(sc.objects || []).length ? `
              <details><summary>${L("Objects and elements", "Objetos e elementos")} (${sc.objects.length})</summary>
                <table class="meaning-table">
                  <thead><tr><th>${L("Name", "Nome")}</th><th>${L("What it is", "O que é")}</th><th>${L("Function in scene", "Função na cena")}</th><th>${L("Signals", "Sinaliza")}</th></tr></thead>
                  <tbody>${sc.objects.map((o) => `<tr>
                    <td><strong>${escapeHtml(o.name||"")}</strong></td>
                    <td>${escapeHtml(o.what_it_is||"")}</td>
                    <td>${escapeHtml(o.function_in_scene||"")}</td>
                    <td>${escapeHtml(o.signals||"")}</td>
                  </tr>`).join("")}</tbody>
                </table></details>` : ""}
            ${sc.what_happens ? `<p><strong>${L("What happens", "O que acontece")}:</strong> ${escapeHtml(sc.what_happens)}</p>` : ""}
            ${sc.communicative_purpose ? `<p><strong>${L("Communicative purpose", "Propósito comunicativo")}:</strong> ${escapeHtml(sc.communicative_purpose)}</p>` : ""}
            ${sc.significant_absence ? `<div class="absence-strip"><strong>${L("Significant absence", "Ausência significativa")}:</strong> ${escapeHtml(sc.significant_absence)}</div>` : ""}
            ${sc.propositions?.length ? `<p class="col-helper" style="margin:0">${L("Propositions", "Proposições")} ${sc.propositions.join(", ")}</p>` : ""}
          </div>
        `).join("")}
      </section>
    `;
  }

  // Level 3 — propositions (full Q&A)
  html += `
    <section class="level-section">
      <h3 class="level-head"><span class="level-tag">${L("Level 3", "Nível 3")}</span> ${L("Propositions", "Proposições")}</h3>
      ${state.meaningMap.map(renderReadableProposition).join("")}
    </section>
  `;
  return html;
}

function renderReadableProposition(p) {
  return `
    <div class="study-prop">
      <div class="study-prop-head">
        <span class="ref-badge">${escapeHtml(p.reference || "")}</span>
        <span class="prop-num">${L("Proposition", "Proposição")} ${p.proposition}</span>
        ${p.summary ? `<span class="prop-summary">— ${escapeHtml(p.summary)}</span>` : ""}
      </div>
      <dl class="study-qa">
        ${(p.questions || []).map((qa) => `
          <div class="study-qa-row">
            <dt>${escapeHtml(qa.q)}</dt>
            <dd>${escapeHtml(qa.a)}</dd>
          </div>
        `).join("")}
      </dl>
    </div>
  `;
}

// ----- Level 1 review (Whole story) -----

function renderWholeStoryScreen() {
  if (!state.meaningMap) {
    dom.screen.innerHTML = `<p>${L("Load a meaning map on the Setup screen to begin.", "Carregue um mapa de significado na tela de Configuração para começar.")}</p>`;
    return;
  }
  const r = state.level1Review;
  dom.screen.innerHTML = `
    <div class="review-screen">
      <header class="review-screen-head">
        <div>
          <h2 style="margin:0">${L("Listen to the Audio Draft With the Team", "Ouça o rascunho de áudio com a equipe")}</h2>
          <p class="col-helper" style="margin:4px 0 0">
            ${L(
              "Play the whole audio with the team and listen together. Then walk through the prompts below as conversation starters — let the team respond in their own words. Take notes only if something they share or something in the audio sounds off.",
              "Toque o áudio inteiro com a equipe e ouçam juntos. Depois passe pelas sugestões abaixo como ponto de partida da conversa — deixe a equipe responder com suas próprias palavras. Anote apenas se algo do que disserem ou algo no áudio soar fora do lugar."
            )}
          </p>
        </div>
      </header>

      <section class="level-section">
        <h3 class="level-head"><span class="level-tag">${L("Prompts", "Sugestões")}</span> ${L("Suggested conversation starters", "Pontos de partida sugeridos")}</h3>
        <ul class="prompt-list">
          ${level1Prompts().map((p) => `<li>${escapeHtml(p)}</li>`).join("")}
        </ul>
        <p class="col-helper" style="margin:0">
          ${L("These prompts are suggestions, not a form. Skip any that don't fit the conversation.", "Estas sugestões são apenas guias, não um formulário. Pule as que não couberem na conversa.")}
        </p>
      </section>

      <section class="level-section">
        <h3 class="level-head"><span class="level-tag">${L("Session", "Sessão")}</span> ${L("Mentor notes", "Notas do mentor")}</h3>
        <p class="col-helper" style="margin:0">${L("Capture what the team said. Write only what matters; skip the rest.", "Capture o que a equipe disse. Anote só o que importa; pule o resto.")}</p>
        <textarea class="big-textarea" data-action="l1-notes" placeholder="${L("What did the team say about the whole passage?", "O que a equipe disse sobre toda a passagem?")}">${escapeHtml(r.notes)}</textarea>

        <div class="revision-row">
          <span class="col-helper">${L("Does the whole-story rendering need revision?", "A interpretação da história toda precisa de revisão?")}</span>
          <label><input type="radio" name="l1-revision" value="none" ${r.revision==="none"?"checked":""} data-action="l1-revision"> ${L("None", "Nenhuma")}</label>
          <label><input type="radio" name="l1-revision" value="minor" ${r.revision==="minor"?"checked":""} data-action="l1-revision"> ${L("Minor", "Pequena")}</label>
          <label><input type="radio" name="l1-revision" value="major" ${r.revision==="major"?"checked":""} data-action="l1-revision"> ${L("Major", "Grande")}</label>
        </div>
        ${r.revision !== "none" ? `
          <input type="text" class="full-input" data-action="l1-revision-comment" placeholder="${L("What needs revising?", "O que precisa ser revisado?")}" value="${escapeHtml(r.revision_comment)}" />
        ` : ""}
      </section>

      <div class="screen-footer">
        <button class="ghost-button" type="button" data-action="step" data-step="study">${L("← Back to Study", "← Voltar para Estudo")}</button>
        <button class="primary-button" type="button" data-action="step" data-step="scenes">${L("Continue to Scenes →", "Continuar para Etapa 4 →")}</button>
      </div>
    </div>
  `;
}

// ----- Level 2 review (Scenes) -----

function renderScenesReviewScreen() {
  if (!state.meaningMap) {
    dom.screen.innerHTML = `<p>${L("Load a meaning map on the Setup screen to begin.", "Carregue um mapa de significado na tela de Configuração para começar.")}</p>`;
    return;
  }
  if (!state.scenes.length) {
    dom.screen.innerHTML = `
      <div class="review-screen">
        <h2 style="margin:0">${L("Scenes (Level 2)", "Cenas (Nível 2)")}</h2>
        <p class="col-helper">${L("This meaning map has no scenes. You can skip ahead to <em>Match</em>.", "Este mapa de significado não tem cenas. Você pode pular direto para <em>Combinação</em>.")}</p>
        <div class="screen-footer">
          <button class="ghost-button" type="button" data-action="step" data-step="whole">${L("← Back to Whole story", "← Voltar para Etapa 3")}</button>
          <button class="primary-button" type="button" data-action="step" data-step="match">${L("Continue to Match →", "Continuar para Combinação →")}</button>
        </div>
      </div>`;
    return;
  }

  const reviewed = state.scenes.filter((sc) => (state.level2Review[sc.scene]?.status || "pending") !== "pending").length;
  const total = state.scenes.length;
  const allReviewed = reviewed === total;

  dom.screen.innerHTML = `
    <div class="review-screen">
      <header class="review-screen-head">
        <div>
          <h2 style="margin:0">${L("Verify People, Places, Objects and Elements", "Verifique pessoas, lugares, objetos e elementos")}</h2>
          <p class="col-helper" style="margin:4px 0 0">
            ${L(
              "Play each scene's audio with the team. Ask them to listen carefully and to tell you whenever they hear one of the people, places, objects, or elements listed below — each time the team confirms hearing one, check its box. When the scene has been worked through, mark its status; only write a note if something sounds off.",
              "Toque o áudio de cada cena com a equipe. Peça para ouvirem com atenção e dizerem sempre que ouvirem uma das pessoas, lugares, objetos ou elementos listados abaixo — cada vez que a equipe confirmar ter ouvido um, marque a caixa. Quando terminar a cena, marque o status; só escreva uma nota se algo soar fora do lugar."
            )}
          </p>
        </div>
        <div class="scene-progress">
          <strong>${reviewed}/${total}</strong> ${L("scenes reviewed", "cenas revisadas")}
        </div>
      </header>

      ${renderMaquetteCard("gather")}

      ${state.scenes.map((sc) => renderSceneReviewCard(sc)).join("")}

      <div class="screen-footer">
        <button class="ghost-button" type="button" data-action="step" data-step="whole">${L("← Back to Whole story", "← Voltar para Etapa 3")}</button>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${!allReviewed ? `<span class="col-helper">${L(`⚠ ${total - reviewed} scene(s) not yet marked. You can still continue.`, `⚠ ${total - reviewed} cena(s) ainda não marcada(s). Você pode continuar mesmo assim.`)}</span>` : ""}
          <button class="primary-button" type="button" data-action="step" data-step="match">${L("Continue to Match →", "Continuar para Combinação →")}</button>
        </div>
      </div>
    </div>
  `;
}

function renderMaquetteCard(stage) {
  const body = stage === "use"
    ? L(
        `Now that the pieces are gathered, lay them out on the table as the team listens to each part of the audio. Move them around as the action unfolds — let them stand in for who is speaking, who is acting, and where the meaning is going. With the maquette in front of you, the team can hear the translation, point at the pieces it refers to, and you can tick the matching propositions on the right with confidence.`,
        `Agora que as peças estão reunidas, coloque-as sobre a mesa enquanto a equipe ouve cada parte do áudio. Mova-as conforme a ação se desenrola — deixe-as representar quem está falando, quem está agindo e para onde o significado está indo. Com a maquete na sua frente, a equipe pode ouvir a tradução, apontar para as peças mencionadas, e você pode marcar as proposições correspondentes à direita com confiança.`
      )
    : L(
        `Before you walk through the boxes below, gather whatever the team has at hand — stones, beans, seeds, leaves, slips of paper, small carved figures — and assign one piece to every person, place, object, or element listed in the scene. You will lay the pieces out together as a maquette in the next step.`,
        `Antes de passar pelas caixas abaixo, reúnam o que a equipe tiver à mão — pedrinhas, feijões, sementes, folhas, pedaços de papel, pequenas figuras esculpidas — e atribuam uma peça a cada pessoa, lugar, objeto ou elemento listado na cena. Vocês vão dispor as peças juntos como uma maquete na próxima etapa.`
      );
  return `
    <div class="maquette-card">
      <img class="maquette-art" src="./maquette.png"
           alt="${L("A collection of wooden discs, peg dolls, and brass keys arranged on a red cloth — props the team uses as a verification maquette.", "Uma coleção de discos de madeira, bonecas de pino e chaves de bronze sobre um pano vermelho — peças que a equipe usa como maquete de verificação.")}" />
      <div class="maquette-text">
        <h3 style="margin:0">${L("Verification maquette", "Maquete de verificação")} <span class="maquette-optional">${L("(Optional but Recommended)", "(Opcional mas Recomendado)")}</span></h3>
        <p style="margin:6px 0 0">${body}</p>
      </div>
    </div>
  `;
}

function ensureSceneReview(sceneNum) {
  let r = state.level2Review[sceneNum];
  if (!r) {
    r = { status: "pending", note: "", absence_confirmed: false, absence_note: "", items: {} };
    state.level2Review[sceneNum] = r;
  }
  if (!r.items) r.items = {};
  return r;
}

function renderCheckList(sceneNum, kind, label, items, count) {
  const r = ensureSceneReview(sceneNum);
  return `
    <div class="check-block">
      <div class="check-block-head">
        <strong>${escapeHtml(label)}</strong>
        <span class="col-helper">${count}</span>
      </div>
      <div class="check-list">
        ${items.map((it) => {
          const key = `${kind}:${it.name}`;
          const checked = !!r.items[key];
          return `<label class="check-item ${checked ? "is-checked" : ""}">
            <input type="checkbox" data-action="l2-item" data-scene="${sceneNum}" data-key="${escapeHtml(key)}" ${checked ? "checked" : ""} />
            <span>${escapeHtml(it.name)}</span>
          </label>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderSceneReviewCard(sc) {
  const r = ensureSceneReview(sc.scene);
  const people = sc.people || [];
  const places = sc.places || [];
  const objects = sc.objects || [];
  const statusClass = r.status === "ok" ? "is-ok" : r.status === "off" ? "is-off" : "is-pending";
  const checkCount = (kind, items) => {
    const checked = items.filter((it) => r.items[`${kind}:${it.name}`]).length;
    return `${checked}/${items.length}`;
  };
  return `
    <div class="scene-review-card ${statusClass}">
      <header class="scene-review-head">
        <span class="scene-badge">${L("Scene", "Cena")} ${sc.scene}</span>
        ${sc.title ? `<strong>${escapeHtml(sc.title)}</strong>` : ""}
        ${sc.range ? `<span class="col-helper">${escapeHtml(sc.range)}</span>` : ""}
      </header>

      ${people.length ? renderCheckList(sc.scene, "people", L("People", "Pessoas"), people, checkCount("people", people)) : ""}
      ${places.length ? renderCheckList(sc.scene, "places", L("Places", "Lugares"), places, checkCount("places", places)) : ""}
      ${objects.length ? renderCheckList(sc.scene, "objects", L("Objects and elements", "Objetos e elementos"), objects, checkCount("objects", objects)) : ""}

      ${sc.significant_absence ? `
        <div class="absence-strip">
          <div><strong>${L("Significant absence", "Ausência significativa")}:</strong> ${escapeHtml(sc.significant_absence)}</div>
          <label class="absence-confirm">
            <input type="checkbox" data-action="l2-absence" data-scene="${sc.scene}" ${r.absence_confirmed ? "checked" : ""} />
            ${L("Confirmed: this absence is preserved (not added) in the translation", "Confirmado: esta ausência é preservada (não adicionada) na tradução")}
          </label>
          <input type="text" class="full-input" data-action="l2-absence-note" data-scene="${sc.scene}"
                 placeholder="${L("Optional note", "Nota opcional")}" value="${escapeHtml(r.absence_note || "")}" />
        </div>
      ` : ""}

      <div class="status-row">
        <span class="col-helper">${L("Status", "Status")}:</span>
        <label><input type="radio" name="status-${sc.scene}" value="ok" ${r.status==="ok"?"checked":""} data-action="l2-status" data-scene="${sc.scene}"> ${L("✓ All present", "✓ Tudo presente")}</label>
        <label><input type="radio" name="status-${sc.scene}" value="off" ${r.status==="off"?"checked":""} data-action="l2-status" data-scene="${sc.scene}"> ${L("⚠ Something off", "⚠ Algo fora do lugar")}</label>
        <label><input type="radio" name="status-${sc.scene}" value="pending" ${r.status==="pending"?"checked":""} data-action="l2-status" data-scene="${sc.scene}"> ${L("— Not yet reviewed", "— Ainda não revisado")}</label>
      </div>

      ${r.status === "off" ? `
        <textarea class="big-textarea" data-action="l2-note" data-scene="${sc.scene}"
          placeholder="${L("What sounds off in this scene?", "O que soa fora do lugar nesta cena?")}">${escapeHtml(r.note || "")}</textarea>
      ` : ""}
    </div>
  `;
}

// ----- Key Terms (Step 7) -----

function ensureKeyTermReview(term) {
  let r = state.keyTermsReview[term];
  if (!r) {
    r = { status: "pending", note: "" };
    state.keyTermsReview[term] = r;
  }
  return r;
}

function ensureFigureFlagReview(figure) {
  let r = state.figureFlagsReview[figure];
  if (!r) {
    r = { status: "pending", note: "" };
    state.figureFlagsReview[figure] = r;
  }
  return r;
}

function renderKeyTermsScreen() {
  if (!state.meaningMap) {
    dom.screen.innerHTML = `<p>${L("Load a meaning map on the Setup screen to begin.", "Carregue um mapa de significado na tela de Configuração para começar.")}</p>`;
    return;
  }
  const terms = state.conceptBank || [];
  const reviewed = terms.filter((t) => (state.keyTermsReview[t.term]?.status || "pending") !== "pending").length;
  dom.screen.innerHTML = `
    <div class="review-screen">
      <header class="review-screen-head">
        <div>
          <h2 style="margin:0">${L("Verify Key Terms", "Verifique termos-chave")}</h2>
          <p class="col-helper" style="margin:4px 0 0">
            ${L(
              "Walk through each key term from the meaning map with the team. Confirm that the chosen rendering carries the meaning faithfully. Mark a status; only write a note if the rendering needs attention.",
              "Percorra com a equipe cada termo-chave do mapa de significado. Confirme se a tradução escolhida carrega o significado fielmente. Marque um status; só escreva uma nota se a tradução precisar de atenção."
            )}
          </p>
        </div>
        ${terms.length ? `<div class="scene-progress"><strong>${reviewed}/${terms.length}</strong> ${L("terms reviewed", "termos revisados")}</div>` : ""}
      </header>

      ${terms.length === 0 ? `
        <p class="col-helper">
          ${L(
            "No key terms declared in this meaning map. You can still capture any terms the team flagged in the notes below.",
            "Nenhum termo-chave declarado neste mapa de significado. Você ainda pode capturar nas notas abaixo qualquer termo que a equipe tenha sinalizado."
          )}
        </p>
        <textarea class="big-textarea" data-action="key-terms-freenote"
                  placeholder="${L("Free-form notes about key terms in this passage", "Notas livres sobre termos-chave nesta passagem")}">${escapeHtml(state.keyTermsReview.__freeNotes || "")}</textarea>
      ` : terms.map((t) => renderKeyTermCard(t)).join("")}

      ${state.figureFlags?.length ? renderFigureFlagsSection() : ""}

      <div class="screen-footer">
        <button class="ghost-button" type="button" data-action="step" data-step="sweep">${L("← Back to Unmarked Beads", "← Voltar para Contas não Marcadas")}</button>
        <button class="primary-button" type="button" data-action="step" data-step="review">${L("Continue to Report →", "Continuar para Relatório →")}</button>
      </div>
    </div>
  `;
}

function renderFigureFlagsSection() {
  const flags = state.figureFlags || [];
  return `
    <h3>${L("Figure &amp; Idiom Flags", "Sinalizações de figuras e expressões")}</h3>
    <p class="col-helper" style="margin:0 0 var(--space-3)">
      ${L(
        `Idioms, images, and figures in the meaning map. Confirm with the team that the chosen rendering carries the intended meaning. The "keep image" tag tells you how strongly the source image should be preserved.`,
        `Expressões idiomáticas, imagens e figuras do mapa de significado. Confirme com a equipe se a tradução escolhida carrega o significado pretendido. A etiqueta "manter imagem" indica o quão fortemente a imagem original deve ser preservada.`
      )}
    </p>
    ${flags.map(renderFigureFlagCard).join("")}
  `;
}

function renderFigureFlagCard(f) {
  const r = ensureFigureFlagReview(f.figure);
  const statusClass = r.status === "ok" ? "is-ok" : r.status === "concern" ? "is-off" : "is-pending";
  const keep = (f.keep_image || "").toUpperCase();
  const keepClass = `keep-${keep.toLowerCase()}`;
  const keepLabel = {
    REQUIRED: L("REQUIRED", "OBRIGATÓRIO"),
    PREFERRED: L("PREFERRED", "PREFERIDO"),
    OPTIONAL: L("OPTIONAL", "OPCIONAL"),
    AVOID: L("AVOID", "EVITAR"),
  }[keep] || keep;
  return `
    <div class="figure-flag-card ${statusClass}">
      <header class="figure-flag-head">
        <strong>${escapeHtml(f.figure)}</strong>
        ${keep ? `<span class="keep-image-badge ${keepClass}">${escapeHtml(keepLabel)}</span>` : ""}
      </header>
      ${f.surface_image ? `
        <div class="figure-flag-row">
          <dt>${L("Surface image", "Imagem superficial")}</dt>
          <dd>${escapeHtml(f.surface_image)}</dd>
        </div>
      ` : ""}
      ${f.intended_meaning ? `
        <div class="figure-flag-row">
          <dt>${L("Intended meaning", "Significado pretendido")}</dt>
          <dd>${escapeHtml(f.intended_meaning)}</dd>
        </div>
      ` : ""}
      ${f.review_note ? `
        <div class="figure-flag-row">
          <dt>${L("Review note", "Nota de revisão")}</dt>
          <dd>${escapeHtml(f.review_note)}</dd>
        </div>
      ` : ""}
      <div class="status-row">
        <span class="col-helper">${L("Rendering in the translation:", "Tradução escolhida:")}</span>
        <label><input type="radio" name="figureflag-${escapeHtml(f.figure)}" value="ok" ${r.status==="ok"?"checked":""} data-action="figure-flag-status" data-figure="${escapeHtml(f.figure)}"> ${L("✓ Preserved", "✓ Preservado")}</label>
        <label><input type="radio" name="figureflag-${escapeHtml(f.figure)}" value="concern" ${r.status==="concern"?"checked":""} data-action="figure-flag-status" data-figure="${escapeHtml(f.figure)}"> ${L("⚠ Needs attention", "⚠ Precisa de atenção")}</label>
        <label><input type="radio" name="figureflag-${escapeHtml(f.figure)}" value="pending" ${r.status==="pending"?"checked":""} data-action="figure-flag-status" data-figure="${escapeHtml(f.figure)}"> ${L("— Not yet reviewed", "— Ainda não revisado")}</label>
      </div>
      ${r.status === "concern" ? `
        <textarea class="big-textarea" data-action="figure-flag-note" data-figure="${escapeHtml(f.figure)}"
                  placeholder="${L("What needs attention?", "O que precisa de atenção?")}">${escapeHtml(r.note || "")}</textarea>
      ` : ""}
    </div>
  `;
}

function renderKeyTermCard(t) {
  const r = ensureKeyTermReview(t.term);
  const statusClass = r.status === "ok" ? "is-ok" : r.status === "concern" ? "is-off" : "is-pending";
  return `
    <div class="key-term-card ${statusClass}">
      <header class="scene-review-head">
        <strong>${escapeHtml(t.term)}</strong>
      </header>
      ${t.note ? `<p class="col-helper" style="margin:0">${escapeHtml(t.note)}</p>` : ""}
      <div class="status-row">
        <span class="col-helper">${L("Rendering in the translation:", "Tradução escolhida:")}</span>
        <label><input type="radio" name="keyterm-${escapeHtml(t.term)}" value="ok" ${r.status==="ok"?"checked":""} data-action="key-term-status" data-term="${escapeHtml(t.term)}"> ${L("✓ Preserved", "✓ Preservado")}</label>
        <label><input type="radio" name="keyterm-${escapeHtml(t.term)}" value="concern" ${r.status==="concern"?"checked":""} data-action="key-term-status" data-term="${escapeHtml(t.term)}"> ${L("⚠ Needs attention", "⚠ Precisa de atenção")}</label>
        <label><input type="radio" name="keyterm-${escapeHtml(t.term)}" value="pending" ${r.status==="pending"?"checked":""} data-action="key-term-status" data-term="${escapeHtml(t.term)}"> ${L("— Not yet reviewed", "— Ainda não revisado")}</label>
      </div>
      ${r.status === "concern" ? `
        <textarea class="big-textarea" data-action="key-term-note" data-term="${escapeHtml(t.term)}"
                  placeholder="${L("What needs attention?", "O que precisa de atenção?")}">${escapeHtml(r.note || "")}</textarea>
      ` : ""}
    </div>
  `;
}

// ----- Match (the main work screen) -----

function renderMatchScreen() {
  dom.screen.innerHTML = `
    <h2 class="screen-title">${L("Match Audio to Meaning", "Combine áudio com significado")}</h2>
    <p class="col-helper">
      ${L(
        "Play the audio bead by bead with the team. As they identify which proposition a bead — or string of beads — carries, select those beads on the left and tick the matching proposition on the right. The bead turns green when matched. The same beads can match more than one proposition; languages often merge or spread meaning differently.",
        "Toque o áudio conta por conta com a equipe. Conforme eles identificam qual proposição uma conta — ou um conjunto de contas — carrega, selecione essas contas à esquerda e marque a proposição correspondente à direita. A conta fica verde quando combinada. As mesmas contas podem combinar com mais de uma proposição; cada idioma frequentemente funde ou espalha o significado de modo diferente."
      )}
    </p>
    ${renderMaquetteCard("use")}
    <div class="work-layout">
      <div class="work-column" id="threadColumn">
        <h2>${L("Beads", "Contas")}</h2>
        ${renderMatchGranularityControl()}
        ${renderLegend()}
        <div id="beadThread" class="bead-thread"></div>
        ${renderSelectionActions()}
      </div>
      <div class="work-column" id="mapColumn">
        <h2>${L("Propositions", "Proposições")}</h2>
        ${renderMapColumn()}
      </div>
      <div class="work-column" id="contextColumn">
        <h2>${L("Scenes", "Cenas")}</h2>
        ${renderScenesColumn()}
      </div>
    </div>

    <div class="screen-footer">
      <button class="ghost-button" type="button" data-action="step" data-step="scenes">${L("← Back to Scenes", "← Voltar para Cenas")}</button>
      <button class="primary-button" type="button" data-action="step" data-step="sweep">${L("Continue to Unmarked Beads →", "Continuar para Contas não Marcadas →")}</button>
    </div>
  `;
  renderBeadThread();
}

function renderMapColumn() {
  if (!state.meaningMap) return `<p>${L("No meaning map loaded.", "Nenhum mapa de significado carregado.")}</p>`;
  const grouped = state.meaningMap.map((p) => {
    const propPoint = state.checkablePoints.find(
      (cp) => cp.level === "proposition" && cp.proposition === p.proposition
    );
    const propAnchored = pointAnchorCount(propPoint.id) > 0;
    const rollup = propositionRollup(p.proposition);
    const childPoints = state.checkablePoints.filter(
      (cp) => cp.level === "qa" && cp.proposition === p.proposition
    );
    const propLinkedToSel = pointHasLinkToCurrentSelection(propPoint.id);
    return `
      <div class="proposition-card ${propLinkedToSel ? "is-target-prop" : ""}">
        ${renderPointRow(propPoint, propAnchored, true, rollup)}
        ${childPoints.map((cp) => renderPointRow(cp, propAnchored, false)).join("")}
      </div>
    `;
  });
  return grouped.join("");
}

function renderPointRow(point, parentAnchored, isPropLevel, rollup) {
  const linksForPoint = state.links.filter((l) => l.point_id === point.id);
  const isAnchored = linksForPoint.length > 0 || (parentAnchored && !isPropLevel);
  const linkedToSel = pointHasLinkToCurrentSelection(point.id);
  const noSel = !state.selection;
  // For proposition-level rows, prefix the reference and show the X/Y rollup.
  // The proposition-level row is a label only (no checkbox); matching happens
  // via the Q&A rows below.
  const text = isPropLevel && point.ref
    ? `${escapeHtml(point.ref)} — ${escapeHtml(point.text)}`
    : escapeHtml(point.text);
  const countLabel = isPropLevel && rollup
    ? `${rollup.anchored}/${rollup.children}`
    : `${linksForPoint.length}`;
  if (isPropLevel) {
    return `
      <div class="point-row prop-level" data-hover-point="${point.id}">
        <span></span>
        <span class="point-dot ${isAnchored ? "is-anchored" : ""}"></span>
        <span class="point-text">${text}</span>
        <span class="anchor-count">${countLabel}</span>
      </div>
      ${linksForPoint.length ? `<div class="point-anchors">${linksForPoint.map((l) => renderAnchorPill(l)).join("")}</div>` : ""}
    `;
  }
  return `
    <label class="point-row ${linkedToSel ? "is-target" : ""}"
           data-hover-point="${point.id}">
      <input type="checkbox" data-action="toggle-point" data-point="${point.id}" ${linkedToSel ? "checked" : ""} ${noSel ? "disabled" : ""} />
      <span class="point-dot ${isAnchored ? "is-anchored" : ""}"></span>
      <span class="point-text">${text}</span>
      <span class="anchor-count">${countLabel}</span>
    </label>
    ${linksForPoint.length ? `<div class="point-anchors">${linksForPoint.map((l) => renderAnchorPill(l)).join("")}</div>` : ""}
  `;
}

function renderAnchorPill(link) {
  return `<span class="anchor-pill">
    ${L("beads", "contas")} ${link.start_bead_index + 1}–${link.end_bead_index + 1}
    <button type="button" data-action="play-link" data-link="${link.id}" title="${L("Play this match", "Tocar esta combinação")}">▶</button>
    <button type="button" data-action="delete-link" data-link="${link.id}" title="${L("Remove this match", "Remover esta combinação")}">×</button>
  </span>`;
}

function renderMatchGranularityControl() {
  if (!state.beads.length) return "";
  const granLabel = { coarse: L("coarse", "grossa"), medium: L("medium", "média"), fine: L("fine", "fina") };
  return `
    <div class="match-gran">
      <label for="matchGranSelect">${L("Bead granularity", "Granularidade das contas")}</label>
      <select id="matchGranSelect" data-action="match-granularity">
        ${["coarse", "medium", "fine"]
          .map((g) => `<option value="${g}" ${state.beadGranularity === g ? "selected" : ""}>${granLabel[g]}</option>`)
          .join("")}
      </select>
      <span class="col-helper">${state.beads.length} ${L("beads", "contas")}</span>
    </div>
  `;
}

function renderLegend() {
  return `
    <div class="legend">
      <span class="legend-swatch covered"><span class="dot"></span> ${L("covered", "coberta")}</span>
      <span class="legend-swatch unclassified"><span class="dot"></span> ${L("unclassified", "não classificada")}</span>
      <span class="legend-swatch framing"><span class="dot"></span> ${L("framing/repetition", "enquadramento/repetição")}</span>
      <span class="legend-swatch added"><span class="dot"></span> ${L("added meaning", "significado adicionado")}</span>
      <span class="legend-swatch altered"><span class="dot"></span> ${L("altered", "alterada")}</span>
    </div>
  `;
}

function renderBeadThread() {
  const threadEl = document.getElementById("beadThread");
  if (!threadEl) return;
  const status = beadStatusMap();
  // Hover-preview only: beads linked to the row currently hovered get a
  // transient outline so the mentor can see existing matches at a glance.
  const hoverSet = state.hoverPointId ? beadsLinkedToPoint(state.hoverPointId) : new Set();
  const sel = state.selection;
  threadEl.innerHTML = state.beads
    .map((b) => {
      const inSel = sel && b.index >= sel.start && b.index <= sel.end;
      const linked = hoverSet.has(b.index);
      return `<span class="bead status-${status[b.index]} ${inSel ? "in-selection" : ""} ${linked ? "linked-to-active" : ""}"
                    data-action="bead-click" data-bead="${b.index}"
                    title="Bead ${b.index + 1} · ${fmtTime(b.startTime)}–${fmtTime(b.endTime)} · ${status[b.index]}">${b.index + 1}</span>`;
    })
    .join("");
}

function renderSelectionActions() {
  if (!state.selection) {
    return `
      <div class="selection-actions">
        <p class="col-helper" style="margin:0">${L(
          "Click a bead to start a selection. Shift-click another bead to extend it. Then tick the proposition(s) it carries.",
          "Clique em uma conta para começar uma seleção. Shift-clique em outra para estender. Depois marque a(s) proposição(ões) que ela carrega."
        )}</p>
      </div>`;
  }
  const a = state.beads[state.selection.start];
  const b = state.beads[state.selection.end];
  return `
    <div class="selection-actions">
      <div class="row">
        <strong>${L("Selection", "Seleção")}:</strong>
        ${L("beads", "contas")} ${state.selection.start + 1}–${state.selection.end + 1}
        <span class="time-label">${fmtTime(a.startTime)}–${fmtTime(b.endTime)}</span>
        <button class="small-button" type="button" data-action="play-selection">${L("Play", "Tocar")}</button>
        <button class="small-button" type="button" data-action="clear-selection">${L("Clear", "Limpar")}</button>
      </div>
      <div class="row">
        <button class="tag-pill-button is-framing" type="button" data-action="tag-selection" data-tag="framing">${L("Tag as framing / repetition", "Marcar como enquadramento / repetição")}</button>
        <button class="tag-pill-button is-added" type="button" data-action="tag-selection" data-tag="added">${L("Tag as added meaning", "Marcar como significado adicionado")}</button>
        <button class="tag-pill-button is-altered" type="button" data-action="tag-selection" data-tag="altered">${L("Tag as altered", "Marcar como alterada")}</button>
        <button class="tag-pill-button" type="button" data-action="untag-selection">${L("Clear tag", "Remover marcação")}</button>
      </div>
    </div>
  `;
}

function renderScenesColumn() {
  if (!state.scenes.length) {
    return `<p class="english-text empty">${L("No scenes provided in the meaning map.", "Nenhuma cena fornecida no mapa de significado.")}</p>`;
  }
  return state.scenes.map((sc) => {
    const fullyMatched = sceneFullyMatched(sc.scene);
    return `
      <div class="scene-card ${fullyMatched ? "is-fully-matched" : ""}">
        <div class="scene-card-head">
          <span class="scene-badge">${L("Scene", "Cena")} ${sc.scene}</span>
          ${sc.title ? `<strong>${escapeHtml(sc.title)}</strong>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderEnglishColumn() {
  if (!state.englishVersions.length) {
    return `
      <p class="english-text empty">No English text loaded.</p>
      <div class="english-empty-help">
        Drop one or more <code>.txt</code> files into <code>demo/english/</code> and click
        <em>Load any .txt files in demo/english/</em> on the Setup screen, or upload them
        directly there.
      </div>
    `;
  }
  const idx = Math.min(state.englishActiveIndex, state.englishVersions.length - 1);
  const v = state.englishVersions[idx];
  return `
    <div class="english-shell">
      <div class="version-tabs">
        ${state.englishVersions.map((vv, i) => `
          <button type="button" data-action="english-version" data-index="${i}"
                  ${i === idx ? 'aria-current="true"' : ""}>${escapeHtml(vv.name)}</button>
        `).join("")}
      </div>
      <div class="english-text">${escapeHtml(v.text)}</div>
    </div>
  `;
}

// ----- Sweep -----

function renderSweepScreen() {
  const status = beadStatusMap();
  // Group consecutive unclassified beads into runs.
  const runs = [];
  let cur = null;
  for (let i = 0; i < state.beads.length; i++) {
    if (status[i] === "unclassified") {
      if (!cur) cur = { start: i, end: i };
      else cur.end = i;
    } else {
      if (cur) { runs.push(cur); cur = null; }
    }
  }
  if (cur) runs.push(cur);

  const tagged = state.beadTags.length;
  const tagLabel = (k) => ({
    framing: L("Framing", "Enquadramento"),
    added: L("Added", "Adicionado"),
    altered: L("Altered", "Alterada"),
  })[k] || k;
  dom.screen.innerHTML = `
    <h2 style="margin-top:0">${L("Check Unmarked Beads", "Verifique contas não marcadas")}</h2>
    <p class="col-helper">${L(
      "Every bead that was not linked to a checkable point appears below as a leftover run. Listen and tag each one as <em>framing/repetition</em> or <em>added meaning</em>. Existing tags are listed underneath.",
      "Toda conta que não foi associada a um ponto a verificar aparece abaixo como uma sequência sobrante. Escute e marque cada uma como <em>enquadramento/repetição</em> ou <em>significado adicionado</em>. As marcações existentes aparecem listadas embaixo."
    )}</p>
    <div class="sweep-list">
      ${runs.length === 0
        ? `<p><strong>${L("No unclassified beads remain.", "Não há mais contas sem classificação.")}</strong> ${tagged ? L("All leftovers have been tagged.", "Todas as sobras foram marcadas.") : L("Every bead is linked to at least one meaning point.", "Toda conta está associada a pelo menos um ponto de significado.")}</p>`
        : runs.map((r) => {
            const a = state.beads[r.start];
            const b = state.beads[r.end];
            return `
              <div class="sweep-item">
                <div><strong>${L("Beads", "Contas")} ${r.start + 1}–${r.end + 1}</strong> · ${fmtTime(a.startTime)}–${fmtTime(b.endTime)} (${(b.endTime - a.startTime).toFixed(1)}s)</div>
                <div class="row" style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="small-button" type="button" data-action="sweep-play" data-start="${r.start}" data-end="${r.end}">${L("Play", "Tocar")}</button>
                  <button class="tag-pill-button is-framing" type="button" data-action="sweep-tag" data-start="${r.start}" data-end="${r.end}" data-tag="framing">${L("Framing / repetition", "Enquadramento / repetição")}</button>
                  <button class="tag-pill-button is-added" type="button" data-action="sweep-tag" data-start="${r.start}" data-end="${r.end}" data-tag="added">${L("Added meaning", "Significado adicionado")}</button>
                  <button class="tag-pill-button is-altered" type="button" data-action="sweep-tag" data-start="${r.start}" data-end="${r.end}" data-tag="altered">${L("Altered", "Alterada")}</button>
                </div>
              </div>
            `;
          }).join("")
      }
    </div>

    ${state.beadTags.length ? `
      <h3 style="margin-top:20px">${L("Tagged leftovers", "Sobras marcadas")}</h3>
      <div class="sweep-list">
        ${state.beadTags.map((t) => `
          <div class="sweep-item">
            <div><strong>${tagLabel(t.tag)}</strong> · ${L("beads", "contas")} ${t.start_bead_index + 1}–${t.end_bead_index + 1}</div>
            <div class="row" style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="small-button" type="button" data-action="sweep-play" data-start="${t.start_bead_index}" data-end="${t.end_bead_index}">${L("Play", "Tocar")}</button>
              <button class="ghost-button" type="button" data-action="delete-tag" data-tag-id="${t.id}">${L("Remove tag", "Remover marcação")}</button>
            </div>
            <textarea data-action="tag-note" data-tag-id="${t.id}" placeholder="${L("Optional note", "Nota opcional")}">${escapeHtml(t.note || "")}</textarea>
          </div>
        `).join("")}
      </div>
    ` : ""}

    <div class="screen-footer">
      <button class="ghost-button" type="button" data-action="step" data-step="match">${L("← Back to Match", "← Voltar para Combinação")}</button>
      <button class="primary-button" type="button" data-action="step" data-step="key">${L("Continue to Key Terms →", "Continuar para Termos-chave →")}</button>
    </div>
  `;
}

// ----- Review -----

function renderReviewScreen() {
  const status = beadStatusMap();
  const beadsCovered = status.filter((s) => s === "covered").length;
  const beadsFraming = status.filter((s) => s === "framing").length;
  const beadsAdded = status.filter((s) => s === "added").length;
  const beadsAltered = status.filter((s) => s === "altered").length;
  const beadsUnclassified = status.filter((s) => s === "unclassified").length;
  const childPoints = state.checkablePoints.filter((p) => p.level === "qa");
  const propPoints = state.checkablePoints.filter((p) => p.level === "proposition");
  const anchoredChildren = childPoints.filter((c) => {
    if (pointAnchorCount(c.id) > 0) return true;
    const propPoint = propPoints.find((p) => p.proposition === c.proposition);
    return propPoint && pointAnchorCount(propPoint.id) > 0;
  }).length;
  const unanchored = childPoints.filter((c) => {
    if (pointAnchorCount(c.id) > 0) return false;
    const propPoint = propPoints.find((p) => p.proposition === c.proposition);
    return !(propPoint && pointAnchorCount(propPoint.id) > 0);
  });

  dom.screen.innerHTML = `
    <h2 style="margin-top:0">${L("Write Your Report", "Escreva seu relatório")}</h2>
    <div class="summary-content">
      <div class="stat-row">
        <div class="stat"><strong>${anchoredChildren}/${childPoints.length}</strong><span>${L("checkable points matched", "pontos a verificar combinados")}</span></div>
        <div class="stat"><strong>${beadsCovered}</strong><span>${L("beads covered", "contas cobertas")}</span></div>
        <div class="stat"><strong>${beadsFraming}</strong><span>${L("beads framing", "contas enquadramento")}</span></div>
        <div class="stat"><strong>${beadsAdded}</strong><span>${L("beads added", "contas adicionadas")}</span></div>
        <div class="stat"><strong>${beadsAltered}</strong><span>${L("beads altered", "contas alteradas")}</span></div>
        <div class="stat"><strong>${beadsUnclassified}</strong><span>${L("beads unclassified", "contas não classificadas")}</span></div>
      </div>
    </div>

    <div class="review-list">
      ${unanchored.length ? `
        <div class="review-item bad">
          <strong>${L("Map points without matches", "Pontos do mapa sem combinação")} (${unanchored.length})</strong>
          <ul>${unanchored.map((u) => `<li>${escapeHtml(u.ref)} — ${escapeHtml(u.text)}</li>`).join("")}</ul>
        </div>` : `<div class="review-item good"><strong>${L("All checkable points are matched.", "Todos os pontos a verificar foram combinados.")}</strong></div>`}

      ${beadsAdded ? `<div class="review-item bad"><strong>${beadsAdded} ${L("bead(s) tagged as added meaning", "conta(s) marcada(s) como significado adicionado")}</strong> — ${L("review notes below.", "veja as notas abaixo.")}</div>` : ""}
      ${beadsAltered ? `<div class="review-item altered"><strong>${beadsAltered} ${L("bead(s) tagged as altered", "conta(s) marcada(s) como alterada(s)")}</strong> — ${L("review notes below.", "veja as notas abaixo.")}</div>` : ""}
      ${beadsUnclassified ? `<div class="review-item warn"><strong>${beadsUnclassified} ${L("bead(s) still unclassified.", "conta(s) ainda sem classificação.")}</strong> ${L("Return to <em>Sweep leftovers</em> to tag or link them.", "Volte para <em>Verificar contas não marcadas</em> para marcá-las ou associá-las.")}</div>` : `<div class="review-item good"><strong>${L("No unclassified beads remain.", "Não há mais contas sem classificação.")}</strong></div>`}
    </div>

    <div class="setup-card" style="margin-top:16px">
      <h3>${L("Mentor overall note", "Nota geral do mentor")}</h3>
      <textarea id="mentorOverallNote" rows="4" style="width:100%">${escapeHtml(state.mentorOverallNote)}</textarea>
    </div>

    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="primary-button" type="button" data-action="export-json">${L("Download JSON report", "Baixar relatório JSON")}</button>
      <button class="ghost-button" type="button" data-action="export-html">${L("Download printable HTML report", "Baixar relatório HTML para impressão")}</button>
    </div>

    <div class="screen-footer">
      <button class="ghost-button" type="button" data-action="step" data-step="key">${L("← Back to Key Terms", "← Voltar para Termos-chave")}</button>
      <span></span>
    </div>
  `;
  document.getElementById("mentorOverallNote").addEventListener("input", (e) => {
    state.mentorOverallNote = e.target.value;
    schedulePersist();
  });
}

// =============================================================================
// Event handling
// =============================================================================

// Language toggle (sits outside the main data-action switch so it works even
// when data-action handlers below are gated on state).
document.addEventListener("click", (e) => {
  const lt = e.target.closest("#langToggle [data-lang]");
  if (lt) setLang(lt.dataset.lang);
});

document.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  switch (action) {
    case "step": {
      state.view = target.dataset.step;
      state.selection = null;
      render();
      break;
    }
    case "go-match": {
      state.view = "match";
      render();
      break;
    }
    case "go-study": {
      state.view = "study";
      render();
      break;
    }
    case "open-bible-side": {
      const url = bibleGatewayUrl(state.studyVersions);
      if (url) {
        const w = Math.min(720, Math.max(420, Math.floor(screen.availWidth * 0.45)));
        const h = Math.max(700, Math.floor(screen.availHeight * 0.9));
        const left = Math.max(0, screen.availWidth - w);
        window.open(url, "obtRetroBibleGateway", `popup=yes,width=${w},height=${h},left=${left},top=0`);
      }
      break;
    }
    case "load-demo-map": await loadDemoMap(); break;
    case "load-demo-map-jonah": await loadDemoMapJonah(); break;
    case "load-demo-audio": await loadDemoAudio(); break;
    case "load-demo-audio-jonah": await loadDemoAudioJonah(); break;
    case "load-demo-english": await loadDemoEnglish(); break;
    case "toggle-point": {
      toggleMatchForPoint(target.dataset.point);
      break;
    }
    case "toggle-scene": {
      toggleMatchForScene(Number(target.dataset.scene));
      break;
    }
    case "bead-click": {
      handleBeadClick(Number(target.dataset.bead), e.shiftKey);
      break;
    }
    case "play-selection": playSelection(); break;
    case "clear-selection": state.selection = null; render(); break;
    case "tag-selection": tagSelection(target.dataset.tag); break;
    case "untag-selection": untagSelection(); break;
    case "play-link": {
      const link = state.links.find((l) => l.id === target.dataset.link);
      if (link) playRange(link.audio_start_sec, link.audio_end_sec);
      break;
    }
    case "delete-link": {
      state.links = state.links.filter((l) => l.id !== target.dataset.link);
      render();
      break;
    }
    case "english-version": {
      state.englishActiveIndex = Number(target.dataset.index);
      render();
      break;
    }
    case "sweep-play": {
      playBeadRange(Number(target.dataset.start), Number(target.dataset.end));
      break;
    }
    case "sweep-tag": {
      const start = Number(target.dataset.start);
      const end = Number(target.dataset.end);
      addTag(start, end, target.dataset.tag);
      render();
      break;
    }
    case "delete-tag": {
      state.beadTags = state.beadTags.filter((t) => t.id !== target.dataset.tagId);
      render();
      break;
    }
    case "seek-bead": {
      const b = state.beads[Number(target.dataset.bead)];
      if (b) dom.audioElement.currentTime = b.startTime;
      break;
    }
    case "export-json": exportJson(); break;
    case "export-html": exportHtml(); break;
  }
});

document.addEventListener("change", (e) => {
  const target = e.target.closest("[data-field], [data-action]");
  if (!target) return;
  if (target.matches("[data-field]")) {
    state.metadata[target.dataset.field] = target.value;
    if (!state.metadata.started_at) state.metadata.started_at = new Date().toISOString();
    schedulePersist();
    return;
  }
  const action = target.dataset.action;
  if (action === "upload-meaning-map") handleMeaningMapUpload(target.files[0]);
  if (action === "upload-audio") handleAudioUpload(target.files[0]);
  if (action === "upload-acoustemes") handleAcoustemesUpload(target.files[0]);
  if (action === "match-granularity") {
    state.beadGranularity = target.value;
    state.selection = null;
    buildBeads();
    rebaseLinksAndTagsToBeads();
    render();
    return;
  }
  if (action === "upload-english") handleEnglishUpload(target.files);
  if (action === "l1-revision") {
    state.level1Review.revision = target.value;
    if (target.value === "none") state.level1Review.revision_comment = "";
    schedulePersist();
    render();
    return;
  }
  if (action === "key-term-status") {
    const term = target.dataset.term;
    const r = ensureKeyTermReview(term);
    r.status = target.value;
    if (r.status !== "concern") r.note = "";
    schedulePersist();
    render();
    return;
  }
  if (action === "figure-flag-status") {
    const figure = target.dataset.figure;
    const r = ensureFigureFlagReview(figure);
    r.status = target.value;
    if (r.status !== "concern") r.note = "";
    schedulePersist();
    render();
    return;
  }
  if (action === "l2-status") {
    const sn = Number(target.dataset.scene);
    const r = (state.level2Review[sn] = state.level2Review[sn] || { status: "pending", note: "", absence_confirmed: false, absence_note: "" });
    r.status = target.value;
    if (r.status !== "off") r.note = "";
    schedulePersist();
    render();
    return;
  }
  if (action === "l2-absence") {
    const sn = Number(target.dataset.scene);
    const r = ensureSceneReview(sn);
    r.absence_confirmed = target.checked;
    schedulePersist();
    return;
  }
  if (action === "l2-item") {
    const sn = Number(target.dataset.scene);
    const r = ensureSceneReview(sn);
    r.items[target.dataset.key] = target.checked;
    schedulePersist();
    // Re-render only the changed checkbox's label class (cheap visual feedback)
    // without redrawing the whole screen, which would lose scroll position.
    const label = target.closest(".check-item");
    if (label) label.classList.toggle("is-checked", target.checked);
    // Update the count badge in this block's head
    const block = target.closest(".check-block");
    if (block) {
      const inputs = block.querySelectorAll('input[type="checkbox"]');
      const checked = Array.from(inputs).filter((i) => i.checked).length;
      const head = block.querySelector(".check-block-head .col-helper");
      if (head) head.textContent = `${checked}/${inputs.length}`;
    }
    return;
  }
});

document.addEventListener("input", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  if (target.dataset.action === "tag-note") {
    const tag = state.beadTags.find((t) => t.id === target.dataset.tagId);
    if (tag) {
      tag.note = target.value;
      schedulePersist();
    }
  }
  if (target.dataset.action === "l1-notes") {
    state.level1Review.notes = target.value;
    schedulePersist();
  }
  if (target.dataset.action === "l1-revision-comment") {
    state.level1Review.revision_comment = target.value;
    schedulePersist();
  }
  if (target.dataset.action === "key-term-note") {
    const term = target.dataset.term;
    const r = ensureKeyTermReview(term);
    r.note = target.value;
    schedulePersist();
    return;
  }
  if (target.dataset.action === "figure-flag-note") {
    const figure = target.dataset.figure;
    const r = ensureFigureFlagReview(figure);
    r.note = target.value;
    schedulePersist();
    return;
  }
  if (target.dataset.action === "key-terms-freenote") {
    state.keyTermsReview.__freeNotes = target.value;
    schedulePersist();
    return;
  }
  if (target.dataset.action === "l2-note") {
    const sn = Number(target.dataset.scene);
    const r = (state.level2Review[sn] = state.level2Review[sn] || { status: "pending", note: "", absence_confirmed: false, absence_note: "" });
    r.note = target.value;
    schedulePersist();
  }
  if (target.dataset.action === "l2-absence-note") {
    const sn = Number(target.dataset.scene);
    const r = (state.level2Review[sn] = state.level2Review[sn] || { status: "pending", note: "", absence_confirmed: false, absence_note: "" });
    r.absence_note = target.value;
    schedulePersist();
  }
  if (target.dataset.action === "study-versions") {
    state.studyVersions = target.value;
    updateOpenPassageBtn();
    schedulePersist();
    // Update the in-card link href live without re-rendering the whole setup grid
    // (which would steal focus from the input).
    const card = target.closest(".setup-card");
    if (card) {
      const link = card.querySelector(".study-actions a");
      const url = bibleGatewayUrl(state.studyVersions);
      if (link && url) link.href = url;
    }
  }
});

// Hover preview on point rows: highlight any beads already linked to the hovered
// point (transient outline) so the mentor can see at a glance where it lives in
// the audio without committing a target tick.
document.addEventListener("mouseover", (e) => {
  const row = e.target.closest("[data-hover-point]");
  if (!row) return;
  const id = row.dataset.hoverPoint;
  if (state.hoverPointId === id) return;
  state.hoverPointId = id;
  renderBeadThread();
});
document.addEventListener("mouseout", (e) => {
  const row = e.target.closest("[data-hover-point]");
  if (!row) return;
  if (state.hoverPointId) {
    state.hoverPointId = null;
    renderBeadThread();
  }
});

// Hover preview: when the mentor hovers a bead in the main thread, after a short
// debounce play just that bead. Only fires when the audio is currently paused, so
// it does not hijack a deliberate playthrough.
let hoverPreviewTimer = null;
document.addEventListener("mouseover", (e) => {
  const beadEl = e.target.closest("#beadThread .bead");
  if (!beadEl) return;
  const beadIndex = Number(beadEl.dataset.bead);
  if (!Number.isFinite(beadIndex)) return;
  clearTimeout(hoverPreviewTimer);
  hoverPreviewTimer = setTimeout(() => {
    if (!dom.audioElement.paused) return;
    const b = state.beads[beadIndex];
    if (b) playRange(b.startTime, b.endTime);
  }, 120);
});
document.addEventListener("mouseout", (e) => {
  const beadEl = e.target.closest("#beadThread .bead");
  if (!beadEl) return;
  clearTimeout(hoverPreviewTimer);
});

dom.playToggle.addEventListener("click", togglePlayback);
dom.backward.addEventListener("click", () => seekRelative(-5));
dom.forward.addEventListener("click", () => seekRelative(5));
dom.audioElement.addEventListener("timeupdate", () => {
  dom.currentTimeLabel.textContent = fmtTime(dom.audioElement.currentTime);
  renderAudioProgressBeads();
});
dom.audioElement.addEventListener("play", () => { dom.playToggle.textContent = "Pause"; });
dom.audioElement.addEventListener("pause", () => { dom.playToggle.textContent = "Play"; });

dom.summaryToggle.addEventListener("click", () => {
  renderSummaryDialogContent();
  dom.summaryDialog.showModal();
});
dom.resetSession.addEventListener("click", resetSession);

// =============================================================================
// Bead interaction
// =============================================================================

function handleBeadClick(beadIndex, shiftKey) {
  if (!state.selection || !shiftKey) {
    state.selection = { start: beadIndex, end: beadIndex };
  } else {
    const start = Math.min(state.selection.start, beadIndex);
    const end = Math.max(state.selection.end, beadIndex);
    state.selection = { start, end };
  }
  render();
}

// Tick = create a link from the current bead selection to this point.
// Untick = remove links from this point that exactly match the current selection.
// Overlapping matches (same bead span on multiple points) work because each point
// gets its own independent link.
function toggleMatchForPoint(pointId) {
  if (!state.selection) {
    setBanner("warning", L("Select beads on the thread first, then tick the proposition.", "Selecione contas no fio primeiro, depois marque a proposição."));
    return;
  }
  const sel = state.selection;
  const a = state.beads[sel.start];
  const b = state.beads[sel.end];
  const matchingLinks = state.links.filter((l) =>
    l.point_id === pointId &&
    l.start_bead_index === sel.start &&
    l.end_bead_index === sel.end
  );
  if (matchingLinks.length) {
    state.links = state.links.filter((l) => !matchingLinks.includes(l));
  } else {
    state.links.push({
      id: uid("lnk"),
      point_id: pointId,
      start_bead_index: sel.start,
      end_bead_index: sel.end,
      audio_start_sec: a.startTime,
      audio_end_sec: b.endTime,
      note: "",
    });
  }
  render();
}

function toggleMatchForScene(sceneNum) {
  if (!state.selection) {
    setBanner("warning", L("Select beads on the thread first, then tick the scene.", "Selecione contas no fio primeiro, depois marque a cena."));
    return;
  }
  const ids = propLevelIdsInScene(sceneNum);
  if (!ids.length) return;
  const allLinked = ids.every(pointHasLinkToCurrentSelection);
  const sel = state.selection;
  const a = state.beads[sel.start];
  const b = state.beads[sel.end];
  if (allLinked) {
    state.links = state.links.filter((l) =>
      !(ids.includes(l.point_id) &&
        l.start_bead_index === sel.start &&
        l.end_bead_index === sel.end)
    );
  } else {
    for (const id of ids) {
      if (pointHasLinkToCurrentSelection(id)) continue;
      state.links.push({
        id: uid("lnk"),
        point_id: id,
        start_bead_index: sel.start,
        end_bead_index: sel.end,
        audio_start_sec: a.startTime,
        audio_end_sec: b.endTime,
        note: "",
      });
    }
  }
  render();
}

function addTag(start, end, tag) {
  state.beadTags.push({
    id: uid("tag"),
    start_bead_index: start,
    end_bead_index: end,
    tag,
    note: "",
  });
}

function tagSelection(tag) {
  if (!state.selection) return;
  addTag(state.selection.start, state.selection.end, tag);
  setBanner("success", `Tagged beads ${state.selection.start + 1}–${state.selection.end + 1} as ${tag}.`);
  state.selection = null;
  render();
}

function untagSelection() {
  if (!state.selection) return;
  const { start, end } = state.selection;
  state.beadTags = state.beadTags.filter((t) =>
    t.end_bead_index < start || t.start_bead_index > end
  );
  state.selection = null;
  render();
}

// =============================================================================
// Uploads
// =============================================================================

async function handleMeaningMapUpload(file) {
  if (!file) return;
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    const { propositions, scenes, level1, conceptBank, figureFlags } = parseMeaningMap(parsed);
    state.meaningMap = propositions;
    state.scenes = scenes;
    state.level1 = level1;
    state.conceptBank = conceptBank;
    state.figureFlags = figureFlags;
    state.meaningMapFilename = file.name;
    state.meaningMapHash = await hashString(text);
    state.checkablePoints = deriveCheckablePoints(propositions);
    state.links = [];
    setBanner("success", L(
      `Loaded meaning map: ${propositions.length} propositions${scenes.length ? `, ${scenes.length} scenes` : ""}${level1 ? ", with Level 1" : ""}${conceptBank.length ? `, ${conceptBank.length} key terms` : ""}${figureFlags.length ? `, ${figureFlags.length} figure flags` : ""}.`,
      `Mapa de significado carregado: ${propositions.length} proposições${scenes.length ? `, ${scenes.length} cenas` : ""}${level1 ? ", com Nível 1" : ""}${conceptBank.length ? `, ${conceptBank.length} termos-chave` : ""}${figureFlags.length ? `, ${figureFlags.length} sinalizações de figura` : ""}.`
    ));
    render();
  } catch (e) {
    setBanner("warning", L(`Could not parse meaning map: ${e.message}`, `Não foi possível analisar o mapa de significado: ${e.message}`));
  }
}

async function handleAudioUpload(file) {
  if (!file) return;
  attachAudio(file);
}

async function handleAcoustemesUpload(file) {
  if (!file) return;
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    const normalized = normalizeAcoustemeManifest(parsed);
    if (!normalized) throw new Error("Unknown acoustemes shape.");
    state.acoustemes = normalized;
    if (state.audioSource.duration) {
      buildBeads();
      rebaseLinksAndTagsToBeads();
    }
    setBanner("success", L(`Loaded acoustemes with ${normalized.segments.length} segments.`, `Acoustemes carregados com ${normalized.segments.length} segmentos.`));
    render();
  } catch (e) {
    setBanner("warning", L(`Could not parse acoustemes: ${e.message}`, `Não foi possível analisar acoustemes: ${e.message}`));
  }
}

async function handleEnglishUpload(files) {
  if (!files || !files.length) return;
  for (const f of files) {
    const text = await f.text();
    const name = f.name.replace(/\.txt$/i, "").replace(/^.*[\\/]/, "");
    state.englishVersions.push({ name, text });
  }
  setBanner("success", `Loaded ${files.length} English text file(s).`);
  render();
}

// =============================================================================
// Demo loaders
// =============================================================================

async function loadDemoMapFile(path, displayName) {
  try {
    const r = await fetch(path);
    const text = await r.text();
    const parsed = JSON.parse(text);
    const { propositions, scenes, level1, conceptBank, figureFlags } = parseMeaningMap(parsed);
    state.meaningMap = propositions;
    state.scenes = scenes;
    state.level1 = level1;
    state.conceptBank = conceptBank;
    state.figureFlags = figureFlags;
    state.meaningMapFilename = displayName;
    state.meaningMapHash = await hashString(text);
    state.checkablePoints = deriveCheckablePoints(propositions);
    state.links = [];
    setBanner("success", L(
      `Loaded demo meaning map (${propositions.length} propositions${scenes.length ? `, ${scenes.length} scenes` : ""}${level1 ? ", with Level 1" : ""}${conceptBank.length ? `, ${conceptBank.length} key terms` : ""}${figureFlags.length ? `, ${figureFlags.length} figure flags` : ""}).`,
      `Mapa de significado demo carregado (${propositions.length} proposições${scenes.length ? `, ${scenes.length} cenas` : ""}${level1 ? ", com Nível 1" : ""}${conceptBank.length ? `, ${conceptBank.length} termos-chave` : ""}${figureFlags.length ? `, ${figureFlags.length} sinalizações de figura` : ""}).`
    ));
    render();
  } catch (e) {
    setBanner("warning", L(`Demo map not found: ${e.message}`, `Mapa demo não encontrado: ${e.message}`));
  }
}

async function loadDemoMap() {
  const isPt = CURRENT_LANG === "pt";
  const path = isPt ? "./demo/ester-2-19-23.meaning-map.pt.json" : "./demo/esther-2-19-23.meaning-map.json";
  const name = isPt ? "ester-2-19-23.meaning-map.pt.json" : "esther-2-19-23.meaning-map.json";
  return loadDemoMapFile(path, name);
}

async function loadDemoMapJonah() {
  const isPt = CURRENT_LANG === "pt";
  const path = isPt ? "./demo/jonas-4-5-8.meaning-map.pt.json" : "./demo/jonah-4-5-8.meaning-map.json";
  const name = isPt ? "jonas-4-5-8.meaning-map.pt.json" : "jonah-4-5-8.meaning-map.json";
  return loadDemoMapFile(path, name);
}

async function loadDemoAudioFile(path, displayName) {
  try {
    const r = await fetch(path);
    const blob = await r.blob();
    attachAudio(new File([blob], displayName, { type: blob.type || "audio/mpeg" }));
  } catch (e) {
    setBanner("warning", L(`Demo audio not found: ${e.message}`, `Áudio demo não encontrado: ${e.message}`));
  }
}

async function loadDemoAudio() {
  return loadDemoAudioFile("./demo/ester-2-19-23.mp3", "ester-2-19-23.mp3");
}

async function loadDemoAudioJonah() {
  return loadDemoAudioFile("./demo/jonah-4-5-8.mp3", "jonah-4-5-8.mp3");
}

async function loadDemoEnglish() {
  // Tries a small set of conventional names. Add more as you drop them in.
  const candidates = [
    "esther-2-19-23.NIV.txt",
    "esther-2-19-23.ESV.txt",
    "esther-2-19-23.NLT.txt",
    "esther-2-19-23.NRSV.txt",
    "esther-2-19-23.KJV.txt",
    "esther-2-19-23.MSG.txt",
  ];
  let loaded = 0;
  for (const name of candidates) {
    try {
      const r = await fetch(`./demo/english/${name}`);
      if (!r.ok) continue;
      const text = await r.text();
      const versionName = name.replace(/^esther-2-19-23\./, "").replace(/\.txt$/, "");
      if (!state.englishVersions.find((v) => v.name === versionName)) {
        state.englishVersions.push({ name: versionName, text });
        loaded++;
      }
    } catch { /* ignore */ }
  }
  setBanner(loaded ? "success" : "warning", loaded
    ? `Loaded ${loaded} English text version(s) from demo/english/.`
    : `No matching .txt files found in demo/english/. Drop .txt files there and try again.`);
  render();
}

// =============================================================================
// Export
// =============================================================================

function buildExport() {
  const status = beadStatusMap();
  const childPoints = state.checkablePoints.filter((p) => p.level === "qa");
  const propPoints = state.checkablePoints.filter((p) => p.level === "proposition");
  const anchored = childPoints.filter((c) => {
    if (pointAnchorCount(c.id) > 0) return true;
    const pp = propPoints.find((p) => p.proposition === c.proposition);
    return pp && pointAnchorCount(pp.id) > 0;
  }).length;
  return {
    schema_version: SCHEMA_VERSION,
    session_metadata: { ...state.metadata, completed_at: new Date().toISOString() },
    source_meaning_map_ref: {
      filename: state.meaningMapFilename,
      hash: state.meaningMapHash,
      proposition_count: state.meaningMap?.length || 0,
    },
    english_versions_used: state.englishVersions.map((v) => v.name),
    translation_audio: {
      filename: state.audioSource.filename,
      duration_sec: state.audioSource.duration,
      bead_granularity: state.beadGranularity,
      bead_count: state.beads.length,
      acoustemes_loaded: !!state.acoustemes,
    },
    checkable_points: state.checkablePoints,
    links: state.links,
    bead_tags: state.beadTags,
    level_1_review: {
      notes: state.level1Review.notes,
      revision: state.level1Review.revision,
      revision_comment: state.level1Review.revision_comment,
    },
    level_2_review: {
      scenes: state.scenes.map((sc) => {
        const r = state.level2Review[sc.scene] || { status: "pending", note: "", absence_confirmed: false, absence_note: "", items: {} };
        const items = r.items || {};
        const summarize = (kind, list) => list.map((it) => ({
          name: it.name,
          checked: !!items[`${kind}:${it.name}`],
        }));
        return {
          scene: sc.scene,
          title: sc.title || "",
          status: r.status,
          note: r.note,
          significant_absence: sc.significant_absence || "",
          absence_confirmed: !!r.absence_confirmed,
          absence_note: r.absence_note || "",
          people_checked: summarize("people", sc.people || []),
          places_checked: summarize("places", sc.places || []),
          objects_checked: summarize("objects", sc.objects || []),
        };
      }),
    },
    key_terms_review: {
      free_notes: state.keyTermsReview.__freeNotes || "",
      terms: (state.conceptBank || []).map((t) => {
        const r = state.keyTermsReview[t.term] || { status: "pending", note: "" };
        return {
          term: t.term,
          guidance: t.note || "",
          status: r.status,
          note: r.note || "",
        };
      }),
    },
    figure_flags_review: {
      flags: (state.figureFlags || []).map((f) => {
        const r = state.figureFlagsReview[f.figure] || { status: "pending", note: "" };
        return {
          figure: f.figure,
          surface_image: f.surface_image || "",
          intended_meaning: f.intended_meaning || "",
          keep_image: f.keep_image || "",
          review_note: f.review_note || "",
          status: r.status,
          note: r.note || "",
        };
      }),
    },
    coverage_summary: {
      points_total: childPoints.length,
      points_anchored: anchored,
      points_unanchored: childPoints.length - anchored,
      beads_total: state.beads.length,
      beads_covered: status.filter((s) => s === "covered").length,
      beads_framing: status.filter((s) => s === "framing").length,
      beads_added: status.filter((s) => s === "added").length,
      beads_altered: status.filter((s) => s === "altered").length,
      beads_unclassified: status.filter((s) => s === "unclassified").length,
    },
    mentor_overall_note: state.mentorOverallNote,
    provenance: {
      mentor_id: state.metadata.mentor_id,
      team_present: state.metadata.team_present,
      started_at: state.metadata.started_at,
      completed_at: new Date().toISOString(),
      tool: "Oral Retro-Verification (Tripod ecosystem)",
    },
  };
}

function exportJson() {
  const data = buildExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `retro-verification-${(state.metadata.project_title || "report").replace(/\s+/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportHtml() {
  const data = buildExport();
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Retro-Verification Report</title>
<style>
body{font:14px/1.5 -apple-system,Helvetica,Arial,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#222}
h1{margin-top:0}
.stat{display:inline-block;border:1px solid #ddd;border-radius:6px;padding:8px 14px;margin:4px 6px 4px 0}
.point-list{margin:0;padding-left:20px}
.bad{color:#a33}.good{color:#373}.warn{color:#a60}
</style></head><body>
<h1>Oral Retro-Verification Report</h1>
<p><strong>Project:</strong> ${escapeHtml(data.session_metadata.project_title || "")}<br>
<strong>Translation language:</strong> ${escapeHtml(data.session_metadata.translation_language || "")}<br>
<strong>Community:</strong> ${escapeHtml(data.session_metadata.community || "")}<br>
<strong>Mentor:</strong> ${escapeHtml(data.session_metadata.mentor_id || "")}<br>
<strong>Team present:</strong> ${escapeHtml(data.session_metadata.team_present || "")}<br>
<strong>Audio:</strong> ${escapeHtml(data.translation_audio.filename || "")} (${fmtTime(data.translation_audio.duration_sec)})<br>
<strong>Meaning map:</strong> ${escapeHtml(data.source_meaning_map_ref.filename || "")}</p>
<h2>Coverage</h2>
<span class="stat">${data.coverage_summary.points_anchored}/${data.coverage_summary.points_total} points matched</span>
<span class="stat">${data.coverage_summary.beads_covered} beads covered</span>
<span class="stat">${data.coverage_summary.beads_framing} framing</span>
<span class="stat">${data.coverage_summary.beads_added} added</span>
<span class="stat">${data.coverage_summary.beads_altered} altered</span>
<span class="stat">${data.coverage_summary.beads_unclassified} unclassified</span>

<h2>Unmatched points</h2>
<ul class="point-list">
${data.checkable_points.filter((p) => p.level === "qa" && !data.links.some((l) => l.point_id === p.id) && !data.links.some((l) => l.point_id === `p${p.proposition}`)).map((p) => `<li class="bad">${escapeHtml(p.ref)} — ${escapeHtml(p.text)}</li>`).join("") || '<li class="good">All matched.</li>'}
</ul>

<h2>Bead tags</h2>
<ul class="point-list">
${data.bead_tags.map((t) => `<li class="${t.tag === "added" || t.tag === "altered" ? "bad" : "warn"}">${t.tag} · beads ${t.start_bead_index + 1}–${t.end_bead_index + 1}${t.note ? ` — ${escapeHtml(t.note)}` : ""}</li>`).join("") || "<li>None</li>"}
</ul>

<h2>Mentor overall note</h2>
<p>${escapeHtml(data.mentor_overall_note) || "<em>No overall note.</em>"}</p>
</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `retro-verification-${(state.metadata.project_title || "report").replace(/\s+/g, "-")}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderSummaryDialogContent() {
  const data = buildExport();
  dom.summaryContent.innerHTML = `
    <div class="stat-row">
      <div class="stat"><strong>${data.coverage_summary.points_anchored}/${data.coverage_summary.points_total}</strong><span>points matched</span></div>
      <div class="stat"><strong>${data.coverage_summary.beads_covered}</strong><span>beads covered</span></div>
      <div class="stat"><strong>${data.coverage_summary.beads_framing}</strong><span>framing</span></div>
      <div class="stat"><strong>${data.coverage_summary.beads_added}</strong><span>added</span></div>
      <div class="stat"><strong>${data.coverage_summary.beads_altered}</strong><span>altered</span></div>
      <div class="stat"><strong>${data.coverage_summary.beads_unclassified}</strong><span>unclassified</span></div>
    </div>
    <h3>Unmatched map points</h3>
    <ul>${data.checkable_points.filter((p) => p.level === "qa" && !data.links.some((l) => l.point_id === p.id) && !data.links.some((l) => l.point_id === `p${p.proposition}`)).map((p) => `<li>${escapeHtml(p.ref)} — ${escapeHtml(p.text)}</li>`).join("") || "<li>All matched.</li>"}</ul>
    <h3>Tagged leftovers</h3>
    <ul>${data.bead_tags.map((t) => `<li>${t.tag} · beads ${t.start_bead_index + 1}–${t.end_bead_index + 1}${t.note ? ` — ${escapeHtml(t.note)}` : ""}</li>`).join("") || "<li>None</li>"}</ul>
  `;
}

// =============================================================================
// Bootstrap
// =============================================================================

(function init() {
  applyShellI18n();
  if (restoreSession()) {
    setBanner("success", L("Restored previous session.", "Sessão anterior restaurada."));
    setTimeout(() => { setBanner(null, ""); render(); }, 2000);
  }
  render();
})();
