const STORAGE_KEY = "daw-progress-v1";
const COMPENDIO_HOST = "compendio-daw.vercel.app";
const COMPENDIO_READ_KEY = "daw_compendio_read_topics";
const COMPENDIO_SYNC_KEY = "daw-compendio-sync-v1";
const URL_STATE_VERSION = 1;
const URL_STATE_HASH_PREFIX = "progreso=";
const PUBLIC_APP_URL = "";
const SUBJECTS = CURRICULUM;

const SUMMARY_SLUGS = {
  "bases-datos": "bbdd",
  "lenguajes-marcas": "lmsgi",
  programacion: "prog",
  "entornos-desarrollo": "ed",
  "sistemas-informaticos": "si",
};

const weeksTimeline = document.querySelector("#weeksTimeline");
const progressList = document.querySelector("#progressList");
const progressSummary = document.querySelector("#progressSummary");
const deadlinesList = document.querySelector("#deadlinesList");
const nextDeadline = document.querySelector("#nextDeadline");
const weeksSubjectFilter = document.querySelector("#weeksSubjectFilter");
const deadlinesSubjectFilter = document.querySelector("#deadlinesSubjectFilter");
const savedState = document.querySelector("#savedState");
const shareState = document.querySelector("#shareState");
const copyProgressButton = document.querySelector("#copyProgressButton");
const resetDialog = document.querySelector("#resetDialog");
const completeWeeksDialog = document.querySelector("#completeWeeksDialog");
const importDialog = document.querySelector("#importDialog");
const shareLinkField = document.querySelector("#shareLinkField");
let pendingWeeksCompletion = null;

let saveTimer = null;
let copyFeedbackTimer = null;
// El progreso del enlace solo se aplica sin preguntar si este navegador no tiene otro distinto.
// Después se limpia la barra de direcciones para que Favoritos e historial no guarden copias viejas.
const stateFromUrl = loadStateFromUrl();
clearStateFromUrl();
const localStateAtStart = loadLocalState();
let pendingUrlState =
  stateFromUrl && hasProgress(localStateAtStart) && !isSameProgress(stateFromUrl, localStateAtStart)
    ? stateFromUrl
    : null;
let importedStateFromUrl = Boolean(stateFromUrl) && !pendingUrlState;
let state = importedStateFromUrl ? stateFromUrl : localStateAtStart;
let currentRenderedWeek = null;
let selectedWeeksSubject = "all";
let pendingWeeksExpanded = false;
// Progreso incluye el temario: asignaturas desplegadas y búsqueda de temas.
const expandedSubjects = new Set();
let progressQuery = "";
let selectedDeadlinesSubject = "all";

function createInitialState() {
  return Object.fromEntries(
    SUBJECTS.map((subject) => [
      subject.id,
      {
        topics: Array(subject.topics.length).fill(false),
        weeks: [],
        tests: Array(subject.testsTotal).fill(false),
        activities: Array(subject.activitiesTotal).fill(false),
        testsDone: 0,
        testsTotal: subject.testsTotal,
        activitiesDone: 0,
        activitiesTotal: subject.activitiesTotal,
      },
    ]),
  );
}

function hydrateState(stored) {
  const initial = createInitialState();

  if (!stored || typeof stored !== "object") return initial;

  SUBJECTS.forEach((subject) => {
    const current = stored[subject.id];
    if (!current) return;

    const topics = Array.isArray(current.topics)
      ? Array.from({ length: subject.topics.length }, (_, index) => Boolean(current.topics[index]))
      : initial[subject.id].topics;
    const studyWeeks = WEEKLY_STUDY[subject.id] || {};
    const weeks = Array.isArray(current.weeks)
      ? [...new Set(current.weeks.map(Number))]
          .filter((week) => Number.isInteger(week) && studyWeeks[week])
          .sort((a, b) => a - b)
      : [];
    // Tests y actividades se marcan uno a uno en Entregas. Los contadores antiguos
    // (solo "cuántos") se convierten en los primeros N elementos marcados.
    const tests = hydrateChecklist(current.tests, current.testsDone, subject.testsTotal);
    const activities = hydrateChecklist(current.activities, current.activitiesDone, subject.activitiesTotal);

    initial[subject.id] = {
      topics,
      weeks,
      tests,
      activities,
      testsTotal: subject.testsTotal,
      testsDone: tests.filter(Boolean).length,
      activitiesTotal: subject.activitiesTotal,
      activitiesDone: activities.filter(Boolean).length,
    };
  });

  return initial;
}

function hydrateChecklist(items, legacyCount, total) {
  if (Array.isArray(items)) return Array.from({ length: total }, (_, index) => Boolean(items[index]));
  const done = clampNumber(legacyCount, 0, total, 0);
  return Array.from({ length: total }, (_, index) => index < done);
}

function syncChecklistCounts(subjectState) {
  subjectState.testsDone = subjectState.tests.filter(Boolean).length;
  subjectState.activitiesDone = subjectState.activities.filter(Boolean).length;
}

function toMask(items) {
  return items.reduce((mask, done, index) => (done ? mask | (1 << index) : mask), 0);
}

function fromMask(mask, length) {
  return Array.from({ length }, (_, index) => Boolean(mask & (1 << index)));
}

function loadLocalState() {
  try {
    return hydrateState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return createInitialState();
  }
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function createUrlStatePayload() {
  return {
    v: URL_STATE_VERSION,
    d: Object.fromEntries(
      SUBJECTS.map((subject) => {
        const subjectState = state[subject.id];
        const topicMask = subjectState.topics.reduce(
          (mask, complete, index) => (complete ? mask | (1 << index) : mask),
          0,
        );
        // Semanas 1–32 como máscara numérica (2 ** 31 no cabe en operadores de bits).
        const weekMask = subjectState.weeks.reduce((mask, week) => mask + 2 ** (week - 1), 0);
        return [
          subject.id,
          [
            topicMask,
            subjectState.testsDone,
            subjectState.testsTotal,
            subjectState.activitiesDone,
            subjectState.activitiesTotal,
            weekMask,
            toMask(subjectState.tests),
            toMask(subjectState.activities),
          ],
        ];
      }),
    ),
  };
}

function hydrateUrlState(payload) {
  if (payload?.v !== URL_STATE_VERSION || !payload.d || typeof payload.d !== "object") {
    return null;
  }

  const decoded = {};
  SUBJECTS.forEach((subject) => {
    const values = payload.d[subject.id];
    if (!Array.isArray(values) || values.length < 5 || values.length > 8) return;
    const [topicMask, testsDone, testsTotal, activitiesDone, activitiesTotal, weekMask = 0, testMask, activityMask] =
      values;
    if (!Number.isInteger(topicMask) || topicMask < 0) return;
    const weeks = Number.isSafeInteger(weekMask) && weekMask > 0
      ? Array.from({ length: 32 }, (_, index) => index + 1).filter(
          (week) => Math.floor(weekMask / 2 ** (week - 1)) % 2 === 1,
        )
      : [];
    decoded[subject.id] = {
      topics: Array.from(
        { length: subject.topics.length },
        (_, index) => Boolean(topicMask & (1 << index)),
      ),
      weeks,
      tests: Number.isInteger(testMask) && testMask >= 0 ? fromMask(testMask, subject.testsTotal) : undefined,
      activities:
        Number.isInteger(activityMask) && activityMask >= 0
          ? fromMask(activityMask, subject.activitiesTotal)
          : undefined,
      testsDone,
      testsTotal,
      activitiesDone,
      activitiesTotal,
    };
  });

  return hydrateState(decoded);
}

function loadStateFromUrl() {
  const hash = window.location.hash.slice(1);
  if (!hash.startsWith(URL_STATE_HASH_PREFIX)) return null;

  try {
    const encoded = hash.slice(URL_STATE_HASH_PREFIX.length);
    return hydrateUrlState(JSON.parse(decodeBase64Url(encoded)));
  } catch {
    return null;
  }
}

function getShareUrl() {
  const url = new URL(
    PUBLIC_APP_URL || window.location.href,
    window.location.href,
  );
  url.hash = `${URL_STATE_HASH_PREFIX}${encodeBase64Url(JSON.stringify(createUrlStatePayload()))}`;
  return url.toString();
}

function clearStateFromUrl() {
  if (!window.location.hash.slice(1).startsWith(URL_STATE_HASH_PREFIX)) return;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.hash = "";
  window.history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search);
}

function getProgressCounts(progress) {
  const values = Object.values(progress);
  return {
    topics: values.reduce((sum, item) => sum + item.topics.filter(Boolean).length, 0),
    weeks: values.reduce((sum, item) => sum + item.weeks.length, 0),
    tests: values.reduce((sum, item) => sum + item.testsDone, 0),
    activities: values.reduce((sum, item) => sum + item.activitiesDone, 0),
  };
}

function hasProgress(progress) {
  return Object.values(getProgressCounts(progress)).some((count) => count > 0);
}

function getProgressSignature(progress) {
  return JSON.stringify(
    SUBJECTS.map(({ id }) => {
      const item = progress[id];
      return [item.topics, item.weeks, item.tests, item.activities];
    }),
  );
}

function isSameProgress(a, b) {
  return getProgressSignature(a) === getProgressSignature(b);
}

function describeProgress(progress) {
  const { topics, weeks, tests, activities } = getProgressCounts(progress);
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  return [
    plural(topics, "tema completado", "temas completados"),
    plural(weeks, "semana estudiada", "semanas estudiadas"),
    plural(tests, "test", "tests"),
    plural(activities, "actividad", "actividades"),
  ].join(", ");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

function offerUrlStateImport() {
  if (!pendingUrlState || !importDialog) return;
  if (isSameProgress(pendingUrlState, state)) {
    pendingUrlState = null;
    showToast("Este enlace tiene el mismo progreso que ya tienes guardado.");
    return;
  }
  importDialog.querySelector("#importLocalSummary").textContent = describeProgress(state);
  importDialog.querySelector("#importLinkSummary").textContent = describeProgress(pendingUrlState);
  if (!importDialog.open) importDialog.showModal();
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function markSaving() {
  savedState.textContent = "Guardando…";
  savedState.classList.add("is-saving");
}

function markSaved(message) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    savedState.textContent = message;
    savedState.classList.remove("is-saving");
  }, 420);
}

function saveLocalSnapshot(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, snapshot);
  } catch {
    savedState.textContent = "No se pudo guardar en este dispositivo";
    savedState.classList.remove("is-saving");
  }
}

function saveState() {
  const snapshot = JSON.stringify(state);
  markSaving();
  saveLocalSnapshot(snapshot);
  writeCompendioReadTopics();
  markSaved("Todo guardado en este navegador");
}

function announceUrlStateImport() {
  if (importedStateFromUrl) {
    importedStateFromUrl = false;
    saveLocalSnapshot(JSON.stringify(state));
    writeCompendioReadTopics();
    savedState.textContent = "Progreso recuperado desde el enlace";
    showToast("Progreso recuperado desde el enlace.");
    shareState.textContent = "Puedes seguir avanzando y crear una copia nueva cuando quieras.";
  }
  offerUrlStateImport();
}

function getCompleted(subjectState) {
  return subjectState.topics.filter(Boolean).length + subjectState.testsDone + subjectState.activitiesDone;
}

function getTotal(subjectState) {
  return subjectState.topics.length + subjectState.testsTotal + subjectState.activitiesTotal;
}

function getPercent(subjectState) {
  const total = getTotal(subjectState);
  return total === 0 ? 0 : Math.round((getCompleted(subjectState) / total) * 100);
}

function getPlanningContext(date = new Date()) {
  const planningDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const day = planningDate.getDay();
  if (day === 6) planningDate.setDate(planningDate.getDate() + 2);
  if (day === 0) planningDate.setDate(planningDate.getDate() + 1);

  const subjectWeeks = Object.fromEntries(
    SUBJECTS.map((subject) => [subject.id, getSubjectCurrentWeek(subject.id, planningDate)]),
  );
  const counts = new Map();
  Object.values(subjectWeeks)
    .filter(Number.isInteger)
    .forEach((week) => counts.set(week, (counts.get(week) || 0) + 1));
  const week = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 1;
  return { week, subjectWeeks };
}

function parseSourceDate(value) {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day, 12);
}

function getSubjectCurrentWeek(subjectId, planningDate) {
  const dates = WEEK_DATES[subjectId];
  if (planningDate < parseSourceDate(dates[1].start)) return 1;
  if (planningDate > parseSourceDate(dates[32].end)) return 32;
  for (let week = 1; week <= 32; week += 1) {
    const start = parseSourceDate(dates[week].start);
    const end = parseSourceDate(dates[week].end);
    if (planningDate >= start && planningDate <= end) return week;
  }
  return null;
}

function getWeekDateGroups(week, subjects = SUBJECTS) {
  const groups = new Map();
  subjects.forEach((subject) => {
    const range = WEEK_DATES[subject.id][week];
    const key = `${range.start}|${range.end}`;
    if (!groups.has(key)) groups.set(key, { ...range, subjects: [] });
    groups.get(key).subjects.push(subject);
  });
  return [...groups.values()];
}

function formatDay(date) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" })
    .format(date)
    .replace(".", "");
}

function formatSourceRange(range) {
  return `${formatDay(parseSourceDate(range.start))} — ${formatDay(parseSourceDate(range.end))}`;
}

function getWeekItems(week) {
  return SUBJECTS.flatMap((subject) => {
    const item = WEEKLY_STUDY[subject.id]?.[week];
    if (!item) return [];
    const materialTopicNumber = item.materialTopic || item.topic;
    const material = subject.topics.find((candidate) => candidate.number === materialTopicNumber);
    return material
      ? [{
          subject,
          week,
          scheduleTopicNumber: item.topic,
          heading: item.heading,
          subtopics: item.subtopics,
          material,
          dateRange: WEEK_DATES[subject.id][week],
        }]
      : [];
  });
}

function getRepeatedBlockInfo(subjectId, week, heading, subtopics) {
  const matchingWeeks = Object.entries(WEEKLY_STUDY[subjectId] || {})
    .filter(([, item]) => JSON.stringify([item.heading, item.subtopics || []]) === JSON.stringify([heading, subtopics]))
    .map(([itemWeek]) => Number(itemWeek))
    .sort((a, b) => a - b);

  if (matchingWeeks.length < 2) return null;

  return {
    index: matchingWeeks.indexOf(week) + 1,
    total: matchingWeeks.length,
  };
}

function getStudyTopicNumber(subjectId, week) {
  const item = WEEKLY_STUDY[subjectId]?.[week];
  return item ? item.materialTopic || item.topic : null;
}

function isWeekStudied(subjectId, week) {
  return Boolean(state[subjectId]?.weeks.includes(week));
}

function getTopicStatus(subjectId, topicNumber) {
  const subjectState = state[subjectId];
  if (!subjectState) return "pending";
  if (subjectState.topics[topicNumber - 1]) return "done";
  return subjectState.weeks.some((week) => getStudyTopicNumber(subjectId, week) === topicNumber)
    ? "progress"
    : "pending";
}

function countTopicsInProgress() {
  return SUBJECTS.reduce(
    (sum, subject) =>
      sum + subject.topics.filter((topic) => getTopicStatus(subject.id, topic.number) === "progress").length,
    0,
  );
}

function renderAll() {
  renderTimeline();
  renderProgress();
  renderNextDeadline();
  renderDeadlines();
  renderOverall();
}

function renderTimeline() {
  const planningContext = getPlanningContext();
  const { subjectWeeks } = planningContext;
  const visibleSubjects =
    selectedWeeksSubject === "all"
      ? SUBJECTS
      : SUBJECTS.filter((subject) => subject.id === selectedWeeksSubject);
  const currentWeek =
    selectedWeeksSubject === "all"
      ? planningContext.week
      : subjectWeeks[selectedWeeksSubject] || planningContext.week;
  currentRenderedWeek = JSON.stringify(subjectWeeks);
  weeksTimeline.replaceChildren();

  const buildWeek = (week) => {
    const dateGroups = getWeekDateGroups(week, visibleSubjects);
    const currentSubjects = visibleSubjects.filter((subject) => subjectWeeks[subject.id] === week);
    const section = document.createElement("section");
    const isPast = week < currentWeek;
    const isCurrent = currentSubjects.length > 0;
    section.className = `week-section${isPast ? " is-past" : ""}${isCurrent ? " is-current" : ""}`;
    section.dataset.week = String(week);

    const meta = document.createElement("div");
    meta.className = "week-meta";
    const number = document.createElement("span");
    number.className = "week-number";
    number.textContent = `Semana ${week}`;
    const dates = document.createElement("span");
    dates.className = "week-dates";
    let groups = null;
    if (dateGroups.length === 1) {
      dates.textContent = formatSourceRange(dateGroups[0]);
    } else {
      dates.textContent = "Fechas según asignatura";
      groups = document.createElement("span");
      groups.className = "week-date-groups";
      dateGroups.forEach((group) => {
        const line = document.createElement("span");
        line.textContent = `${group.subjects.map((subject) => subject.short).join(" · ")} · ${formatSourceRange(group)}`;
        groups.append(line);
      });
    }
    meta.append(number, dates);
    if (groups) meta.append(groups);

    if (isCurrent) {
      const current = document.createElement("span");
      current.className = "current-label";
      current.textContent =
        currentSubjects.length === SUBJECTS.length
          ? "Ahora"
          : `Ahora · ${currentSubjects.map((subject) => subject.short).join(" · ")}`;
      meta.append(current);
    }

    const content = document.createElement("div");
    content.className = "week-content";
    const items = getWeekItems(week).filter(
      ({ subject }) => selectedWeeksSubject === "all" || subject.id === selectedWeeksSubject,
    );
    const phase = WEEK_PHASES[week];

    const notes = visibleSubjects
      .filter((subject) => SUBJECT_WEEK_NOTES[subject.id]?.[week] && !items.some((item) => item.subject.id === subject.id))
      .map((subject) => createWeekNote(subject, SUBJECT_WEEK_NOTES[subject.id][week]));

    if (items.length > 0 || notes.length > 0) {
      if (items.length === 0 && phase) {
        const phaseBlock = document.createElement("div");
        phaseBlock.className = "week-phase";
        const title = document.createElement("strong");
        title.textContent = phase.title;
        const detail = document.createElement("span");
        detail.textContent = phase.detail;
        phaseBlock.append(title, detail);
        content.append(phaseBlock);
      }
      items.forEach((item) => content.append(createWeekSubject(item)));
      notes.forEach((note) => content.append(note));
    } else if (phase) {
      const phaseBlock = document.createElement("div");
      phaseBlock.className = "week-phase";
      const title = document.createElement("strong");
      title.textContent = phase.title;
      const detail = document.createElement("span");
      detail.textContent = phase.detail;
      phaseBlock.append(title, detail);
      content.append(phaseBlock);
    } else {
      const phaseBlock = document.createElement("div");
      phaseBlock.className = "week-phase";
      const title = document.createElement("strong");
      title.textContent = selectedWeeksSubject === "all" ? "Seguimiento" : "Sin contenido nuevo";
      const detail = document.createElement("span");
      detail.textContent =
        selectedWeeksSubject === "all"
          ? "Continúa con lo pendiente y consolida lo visto."
          : "Esta asignatura no tiene temario programado esta semana.";
      phaseBlock.append(title, detail);
      content.append(phaseBlock);
    }

    const todo = createWeekTodo(week, visibleSubjects, week === currentWeek);
    if (todo) content.append(todo);

    section.append(meta, content);
    return section;
  };

  // 1) La semana actual, completa, arriba del todo.
  const current = buildWeek(currentWeek);
  current.id = "semana-actual";
  weeksTimeline.append(current);

  // 2) Lo que falta de semanas anteriores (solo si falta algo).
  const pending = createPendingWeeksBox(currentWeek, visibleSubjects);
  if (pending) weeksTimeline.append(pending);

  // 3) Todas las semanas en orden; la actual, solo como referencia para no repetirla.
  const allHeading = document.createElement("h2");
  allHeading.className = "weeks-all-heading";
  allHeading.textContent = "Todas las semanas";
  weeksTimeline.append(allHeading);
  for (let week = 1; week <= 32; week += 1) {
    if (week === currentWeek) {
      const ref = document.createElement("div");
      ref.className = "week-ref";
      ref.id = `semana-${week}`;
      const label = document.createElement("strong");
      label.textContent = `Semana ${week}`;
      const tag = document.createElement("span");
      tag.className = "current-label";
      tag.textContent = "Ahora";
      const back = document.createElement("button");
      back.type = "button";
      back.className = "week-ref-link";
      back.dataset.scrollWeek = "actual";
      back.textContent = "Es la semana actual · ver arriba ↑";
      ref.append(label, tag, back);
      weeksTimeline.append(ref);
      continue;
    }
    const section = buildWeek(week);
    section.id = `semana-${week}`;
    weeksTimeline.append(section);
  }
}

// Bloques de semanas pasadas sin marcar como estudiados (y cuyo tema no está completado).
function getPendingStudyBlocks(currentWeek, subjects) {
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  const blocks = [];
  for (let week = 1; week < currentWeek; week += 1) {
    getWeekItems(week)
      .filter(({ subject }) => subjectIds.has(subject.id))
      .forEach((item) => {
        if (isWeekStudied(item.subject.id, week)) return;
        if (getTopicStatus(item.subject.id, item.material.number) === "done") return;
        blocks.push(item);
      });
  }
  return blocks;
}

function createPendingWeeksBox(currentWeek, subjects) {
  const activities = getPendingActivities(currentWeek, subjects);
  const blocks = getPendingStudyBlocks(currentWeek, subjects);
  if (activities.length === 0 && blocks.length === 0) return null;

  const box = document.createElement("aside");
  box.className = "weeks-pending";
  const title = document.createElement("h2");
  title.textContent = "Para ponerte al día";
  const hint = document.createElement("p");
  hint.textContent =
    activities.length > 0
      ? "Sin agobios: céntrate primero en las actividades, que son lo que más puntúa. Lo demás, poco a poco."
      : "Sin agobios: repásalo poco a poco y márcalo como «¿Estudiado?» cuando lo tengas.";
  box.append(title, hint);

  if (activities.length > 0) {
    const heading = document.createElement("h3");
    heading.textContent = "Actividades pendientes";
    const list = document.createElement("ul");
    list.className = "weeks-pending-activities";
    activities.forEach((item) => list.append(createTodoItem(item, currentWeek)));
    box.append(heading, list);
  }

  // Agrupado por semana: una línea por semana, "toda la semana" si no se ha marcado nada.
  const byWeek = new Map();
  blocks.forEach((block) => {
    if (!byWeek.has(block.week)) byWeek.set(block.week, []);
    byWeek.get(block.week).push(block.subject);
  });
  if (byWeek.size > 0) {
    const heading = document.createElement("h3");
    heading.textContent = byWeek.size === 1 ? "1 semana por repasar" : `${byWeek.size} semanas por repasar`;
    const list = document.createElement("ul");
    list.className = "weeks-pending-weeks";
    const weeks = [...byWeek.entries()];
    const limit = pendingWeeksExpanded ? weeks.length : 4;
    weeks.slice(0, limit).forEach(([week, pendingSubjects]) => {
      const total = getWeekItems(week).filter(({ subject }) => subjects.some((candidate) => candidate.id === subject.id)).length;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.scrollWeek = String(week);
      const when = document.createElement("strong");
      when.className = "weeks-pending-week";
      when.textContent = `Semana ${week}`;
      const text = document.createElement("span");
      text.className = "weeks-pending-text";
      if (pendingSubjects.length === total && total > 1) {
        text.textContent = "Toda la semana";
      } else {
        text.append(document.createTextNode("Te falta: "));
        pendingSubjects.forEach((subject) => {
          const code = document.createElement("span");
          code.className = "subject-code";
          code.dataset.subject = subject.id;
          code.textContent = subject.short;
          code.title = subject.name;
          text.append(code);
        });
      }
      const go = document.createElement("span");
      go.className = "weeks-pending-go";
      go.textContent = "Ir →";
      button.append(when, text, go);
      item.append(button);
      list.append(item);
    });
    box.append(heading, list);
    if (weeks.length > 4) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "weeks-pending-more";
      more.dataset.togglePending = "1";
      more.textContent = pendingWeeksExpanded ? "Ver menos" : `Ver ${weeks.length - 4} más`;
      box.append(more);
    }
  }
  return box;
}

function scrollToWeek(target) {
  const element = document.querySelector(target === "actual" ? "#semana-actual" : `#semana-${target}`);
  if (!element) return;
  const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
  window.scrollTo({ top: Math.max(0, window.scrollY + element.getBoundingClientRect().top - headerHeight - 16), behavior: "smooth" });
}

function createWeekSubject({ subject, week, heading, subtopics, material, scheduleTopicNumber, dateRange }) {
  const studied = isWeekStudied(subject.id, week);
  const topicStatus = getTopicStatus(subject.id, material.number);
  const row = document.createElement("article");
  row.className = `week-subject${studied ? " is-studied" : ""}`;
  row.dataset.subject = subject.id;

  const label = document.createElement("div");
  label.className = "subject-label";
  const code = document.createElement("span");
  code.className = "subject-code";
  code.textContent = subject.short;
  const labelCopy = document.createElement("div");
  labelCopy.className = "subject-label-copy";
  const name = document.createElement("span");
  name.textContent = subject.name;
  const date = document.createElement("span");
  date.className = "subject-row-date";
  date.textContent = formatSourceRange(dateRange);
  labelCopy.append(name, date);
  label.append(code, labelCopy);

  const copy = document.createElement("div");
  copy.className = "study-copy";
  const repetition = getRepeatedBlockInfo(subject.id, week, heading, subtopics);
  const title = document.createElement("h3");
  title.append(document.createTextNode(heading));
  if (repetition) {
    const marker = document.createElement("span");
    marker.className = "repeat-marker";
    marker.textContent = ` (${repetition.index}/${repetition.total})`;
    marker.title = "Este bloque se repite exactamente igual en varias semanas.";
    title.append(marker);
  }
  copy.append(title);
  if (repetition) {
    const note = document.createElement("p");
    note.className = "repetition-note";
    note.textContent = `Bloque repetido exactamente igual en ${repetition.total} semanas. No tienes que prepararlo entero desde cero en cada repetición.`;
    note.title = "El título y todos los subtemas coinciden exactamente con otras semanas.";
    copy.append(note);
  }
  if (subtopics.length > 0) {
    const list = document.createElement("ul");
    subtopics.forEach((subtopic) => {
      const item = document.createElement("li");
      item.textContent = subtopic;
      list.append(item);
    });
    copy.append(list);
  } else {
    const note = document.createElement("p");
    note.className = "no-subtopics";
    note.textContent = "El cronograma no desglosa subtemas esta semana.";
    copy.append(note);
  }
  if (topicStatus === "done") {
    const status = document.createElement("p");
    status.className = "topic-status-note";
    status.textContent = `${subject.topicLabel} ${material.number} marcado como completado`;
    copy.append(status);
  }

  const studyLinks = document.createElement("div");
  studyLinks.className = "study-links";
  const campusTopicUrl = getCampusTopicUrl(subject.id, scheduleTopicNumber || material.number);
  if (campusTopicUrl) {
    const link = document.createElement("a");
    link.className = "material-link";
    link.href = campusTopicUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Tema en Campus ↗";
    link.title = `Abrir este tema de ${subject.name} en Campus`;
    link.setAttribute("aria-label", `Abrir este tema de ${subject.name} en Campus`);
    studyLinks.append(link);
  }
  const weekSummaryUrl = getSummaryUrl(subject.id, scheduleTopicNumber || material.number);
  if (weekSummaryUrl) {
    const link = document.createElement("a");
    link.className = "material-link";
    link.href = weekSummaryUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Resumen ↗";
    link.title = `Abrir el resumen de este tema de ${subject.name} en Compendio DAW`;
    link.setAttribute("aria-label", `Abrir el resumen de este tema de ${subject.name} en Compendio DAW`);
    studyLinks.append(link);
  }
  if (studyLinks.childElementCount > 0) copy.append(studyLinks);

  const actions = document.createElement("div");
  actions.className = "study-actions";
  const weekToggle = document.createElement("button");
  weekToggle.type = "button";
  weekToggle.className = `week-check${studied ? " is-complete" : ""}`;
  weekToggle.dataset.subjectId = subject.id;
  weekToggle.dataset.week = String(week);
  weekToggle.setAttribute("aria-pressed", String(studied));
  weekToggle.title = studied
    ? "Desmarcar esta semana"
    : "Marca que has estudiado esta parte. El tema no se da por completado hasta que lo marques en Progreso o Temario.";
  weekToggle.setAttribute("aria-label", `Semana ${week} de ${subject.name} estudiada`);
  const box = document.createElement("span");
  box.className = "week-check-box";
  box.setAttribute("aria-hidden", "true");
  box.textContent = "✓";
  const text = document.createElement("span");
  text.textContent = studied ? "Estudiado" : "¿Estudiado?";
  weekToggle.append(box, text);
  actions.append(weekToggle);
  row.append(label, copy, actions);
  return row;
}

function createTopicToggle(subject, topic, complete) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  const inProgress = !complete && getTopicStatus(subject.id, topic.number) === "progress";
  toggle.className = `topic-check${complete ? " is-complete" : ""}${inProgress ? " is-progress" : ""}`;
  toggle.dataset.subjectId = subject.id;
  toggle.dataset.topicNumber = String(topic.number);
  toggle.setAttribute("aria-pressed", String(complete));
  toggle.setAttribute(
    "aria-label",
    `${complete ? "Marcar pendiente" : "Marcar completado"}: ${subject.name}, ${subject.topicLabel.toLowerCase()} ${topic.number}${inProgress ? " (en progreso)" : ""}`,
  );
  toggle.textContent = "✓";
  return toggle;
}

function getTotals() {
  const values = Object.values(state);
  const topicsDone = values.reduce((sum, item) => sum + item.topics.filter(Boolean).length, 0);
  const topicsTotal = values.reduce((sum, item) => sum + item.topics.length, 0);
  const testsDone = values.reduce((sum, item) => sum + item.testsDone, 0);
  const testsTotal = values.reduce((sum, item) => sum + item.testsTotal, 0);
  const activitiesDone = values.reduce((sum, item) => sum + item.activitiesDone, 0);
  const activitiesTotal = values.reduce((sum, item) => sum + item.activitiesTotal, 0);
  const done = topicsDone + testsDone + activitiesDone;
  const total = topicsTotal + testsTotal + activitiesTotal;
  return {
    topicsDone,
    topicsTotal,
    testsDone,
    testsTotal,
    activitiesDone,
    activitiesTotal,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

function renderOverall() {
  const totals = getTotals();
  document.querySelector("#overallPercent").textContent = `${totals.percent}%`;
  document.querySelector("#overallBar").style.width = `${totals.percent}%`;
}

function renderProgress() {
  const totals = getTotals();
  progressSummary.replaceChildren(
    createSummaryMetric(
      `${totals.topicsDone}/${totals.topicsTotal}`,
      countTopicsInProgress() > 0 ? `temas · ${countTopicsInProgress()} en progreso` : "temas",
    ),
    createSummaryMetric(`${totals.testsDone}/${totals.testsTotal}`, "tests"),
    createSummaryMetric(`${totals.activitiesDone}/${totals.activitiesTotal}`, "actividades"),
  );
  progressList.replaceChildren();
  const normalizedQuery = normalizeText(progressQuery.trim());

  SUBJECTS.forEach((subject) => {
    const subjectState = state[subject.id];
    const subjectMatches = normalizeText(subject.name).includes(normalizedQuery);
    const topics = subject.topics.filter(
      (topic) =>
        !normalizedQuery ||
        subjectMatches ||
        normalizeText(`${topic.number} ${topic.title}`).includes(normalizedQuery),
    );
    if (normalizedQuery && topics.length === 0) return;
    const expanded = Boolean(normalizedQuery) || expandedSubjects.has(subject.id);

    const wrapper = document.createElement("section");
    wrapper.className = `progress-subject${expanded ? " is-expanded" : ""}`;
    wrapper.dataset.subject = subject.id;
    const row = document.createElement("article");
    row.className = "progress-row";
    row.dataset.subject = subject.id;

    const name = document.createElement("div");
    name.className = "progress-name";
    const code = document.createElement("span");
    code.className = "subject-code";
    code.textContent = subject.short;
    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = subject.name;
    const progress = document.createElement("div");
    progress.className = "subject-progress";
    const bar = document.createElement("span");
    bar.style.width = `${getPercent(subjectState)}%`;
    progress.append(bar);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "topics-toggle";
    toggle.dataset.toggleTopics = subject.id;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded
      ? `Ocultar ${subject.topicLabel === "Unidad" ? "unidades" : "temas"}`
      : `Ver ${subject.topicLabel === "Unidad" ? "unidades" : "temas"} y enlaces`;
    copy.append(strong, progress, toggle);
    name.append(code, copy);

    const dots = document.createElement("div");
    dots.className = "topic-dots";
    dots.setAttribute("aria-label", `${subject.topicLabel === "Unidad" ? "Unidades" : "Temas"} de ${subject.name}`);
    subject.topics.forEach((topic, index) => {
      const complete = subjectState.topics[index];
      const inProgress = getTopicStatus(subject.id, topic.number) === "progress";
      const button = document.createElement("button");
      button.type = "button";
      button.className = `topic-dot${complete ? " is-complete" : ""}${inProgress ? " is-progress" : ""}`;
      button.dataset.subjectId = subject.id;
      button.dataset.topicNumber = String(topic.number);
      button.setAttribute("aria-pressed", String(complete));
      button.setAttribute("aria-label", `${subject.topicLabel} ${topic.number}: ${complete ? "completado" : inProgress ? "en progreso" : "pendiente"}`);
      button.title = `${subject.topicLabel} ${topic.number} · ${topic.title}${inProgress ? " (en progreso)" : ""}`;
      button.textContent = String(topic.number);
      dots.append(button);
    });

    const work = document.createElement("div");
    work.className = "work-counts";
    work.append(createCounter(subject.id, "tests", "Tests", subjectState));
    if (subject.activitiesTotal > 0) {
      work.append(createCounter(subject.id, "activities", "Actividades", subjectState));
    } else {
      const empty = document.createElement("span");
      empty.className = "counter-empty";
      empty.textContent = "Sin actividades";
      empty.title = "Esta asignatura no tiene actividades evaluables configuradas.";
      work.append(empty);
    }

    row.append(name, dots, work);
    wrapper.append(row);
    if (expanded) wrapper.append(createSubjectTopicsBody(subject, topics));
    progressList.append(wrapper);
  });

  if (progressList.childElementCount === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay temas que coincidan con esa búsqueda.";
    progressList.append(empty);
  }
}

function createSummaryMetric(value, label) {
  const metric = document.createElement("div");
  metric.className = "summary-metric";
  const strong = document.createElement("strong");
  strong.textContent = value;
  const span = document.createElement("span");
  span.textContent = label;
  metric.append(strong, span);
  return metric;
}

function formatDeadlineDate(value) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(new Date(value))
    .replace(/(^|\s)(\p{L})/u, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function formatDeadlineParts(value) {
  const date = new Date(value);
  const clean = (part) => part.replaceAll(".", "");

  return {
    day: new Intl.DateTimeFormat("es-ES", { day: "2-digit" }).format(date),
    month: clean(
      new Intl.DateTimeFormat("es-ES", { month: "short" }).format(date),
    ).toUpperCase(),
    weekday: clean(
      new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(date),
    ),
    time: new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

function renderNextDeadline() {
  if (!nextDeadline) return;
  nextDeadline.replaceChildren();

  const now = new Date();
  const upcoming = [...DEADLINES]
    .filter(
      (deadline) =>
        selectedWeeksSubject === "all" || deadline.subjectId === selectedWeeksSubject,
    )
    .filter((deadline) => new Date(deadline.due) >= now && !isDeliverableDone(deadline))
    .sort((a, b) => new Date(a.due) - new Date(b.due))[0];

  if (!upcoming) {
    delete nextDeadline.dataset.subject;
    nextDeadline.classList.add("is-empty");
    nextDeadline.hidden = true;
    nextDeadline.textContent =
      selectedWeeksSubject === "all"
        ? "No hay entregas próximas configuradas."
        : "Esta asignatura no tiene próximas entregas configuradas.";
    return;
  }

  nextDeadline.classList.remove("is-empty");
  nextDeadline.hidden = false;
  nextDeadline.dataset.subject = upcoming.subjectId;
  const subject = SUBJECTS.find((candidate) => candidate.id === upcoming.subjectId);
  const days = Math.ceil((new Date(upcoming.due) - now) / 86400000);
  const dateParts = formatDeadlineParts(upcoming.due);

  const due = document.createElement("time");
  due.className = "next-deadline-date";
  due.dateTime = upcoming.due;
  const dateMain = document.createElement("strong");
  const dateDay = document.createElement("span");
  dateDay.className = "next-deadline-day";
  dateDay.textContent = dateParts.day;
  const dateMonth = document.createElement("span");
  dateMonth.className = "next-deadline-month";
  dateMonth.textContent = dateParts.month;
  const dateDetail = document.createElement("span");
  dateDetail.className = "next-deadline-date-detail";
  dateDetail.textContent = `${dateParts.weekday} · ${dateParts.time}`;
  dateMain.append(dateDay, dateMonth);
  due.append(dateMain, dateDetail);

  const content = document.createElement("div");
  content.className = "next-deadline-content";
  const label = document.createElement("div");
  label.className = "next-deadline-label";
  const labelText = document.createElement("span");
  labelText.textContent = "Próxima entrega";
  const countdown = document.createElement("span");
  countdown.className = "next-deadline-countdown";
  countdown.textContent = days === 0 ? "Hoy" : days === 1 ? "Mañana" : `En ${days} días`;
  label.append(labelText, countdown);
  const title = document.createElement("strong");
  title.textContent = upcoming.title;
  const meta = document.createElement("span");
  meta.className = "next-deadline-subject";
  meta.textContent = subject?.name || upcoming.subjectId;
  content.append(label, title, meta);

  const link = document.createElement("a");
  link.href = upcoming.campusUrl || upcoming.source;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Campus ↗";
  link.title = "Abrir esta entrega en Campus";
  nextDeadline.append(due, content, link);
}

function getSubjectActivities(subjectId) {
  return DEADLINES.filter(
    (deadline) => deadline.subjectId === subjectId && deadline.type !== "Tests",
  ).sort((a, b) => new Date(a.due) - new Date(b.due));
}

function getActivityIndex(deadline) {
  return getSubjectActivities(deadline.subjectId).indexOf(deadline);
}

function isDeliverableDone(deadline) {
  const subjectState = state[deadline.subjectId];
  if (!subjectState) return false;
  if (deadline.type === "Tests") return subjectState.tests.length > 0 && subjectState.tests.every(Boolean);
  return Boolean(subjectState.activities[getActivityIndex(deadline)]);
}

function toggleDeliverable(subjectId, kind, index) {
  const subjectState = state[subjectId];
  const list = kind === "test" ? subjectState?.tests : subjectState?.activities;
  if (!list || index < 0 || index >= list.length) return;
  list[index] = !list[index];
  syncChecklistCounts(subjectState);
  saveState();
  renderAll();
}

// ───────── Recomendaciones de tests y actividades (según el cronograma de Campus) ─────────
function getRecommendedWeek(subjectId, kind, index) {
  const weeks = RECOMMENDED_WEEKS[subjectId]?.[kind === "test" ? "tests" : "activities"];
  return weeks?.[index] ?? null;
}

function formatWeekStart(subjectId, week) {
  const range = WEEK_DATES[subjectId]?.[week];
  return range ? formatDay(parseSourceDate(range.start)) : "";
}

function describeRecommendation(subjectId, kind, index) {
  const week = getRecommendedWeek(subjectId, kind, index);
  if (!week) return "Sin semana recomendada en el cronograma de Campus";
  const verb = kind === "test" ? "Recomendado a partir de" : "Se explica en";
  return `${verb} la semana ${week} (${formatWeekStart(subjectId, week)})`;
}

function getDeliverableLabel(subject, kind, index) {
  if (kind === "test") return `Test del ${subject.topicLabel.toLowerCase()} ${index + 1}`;
  return getSubjectActivities(subject.id)[index]?.title || `Actividad ${index + 1}`;
}

// Tests y actividades que el cronograma coloca en una semana concreta.
function getWeekDeliverables(week, subjects) {
  const items = [];
  subjects.forEach((subject) => {
    const subjectState = state[subject.id];
    (RECOMMENDED_WEEKS[subject.id]?.tests || []).forEach((recommended, index) => {
      if (recommended === week) items.push({ subject, kind: "test", index, done: subjectState.tests[index] });
    });
    (RECOMMENDED_WEEKS[subject.id]?.activities || []).forEach((recommended, index) => {
      if (recommended === week) {
        items.push({ subject, kind: "activity", index, done: subjectState.activities[index] });
      }
    });
  });
  return items;
}

// Tests recomendados antes de esta semana que siguen sin hacer.
function getOverdueDeliverables(week, subjects) {
  const items = [];
  subjects.forEach((subject) => {
    const subjectState = state[subject.id];
    (RECOMMENDED_WEEKS[subject.id]?.tests || []).forEach((recommended, index) => {
      if (recommended && recommended < week && !subjectState.tests[index]) {
        items.push({ subject, kind: "test", index, done: false });
      }
    });
  });
  return items;
}

// Actividades ya explicadas, sin entregar y aún dentro de plazo.
function getPendingActivities(week, subjects) {
  const now = new Date();
  const items = [];
  subjects.forEach((subject) => {
    (RECOMMENDED_WEEKS[subject.id]?.activities || []).forEach((recommended, index) => {
      const deadline = getSubjectActivities(subject.id)[index];
      if (!recommended || recommended >= week || state[subject.id].activities[index]) return;
      if (!deadline || new Date(deadline.due) < now) return;
      items.push({ subject, kind: "activity", index, done: false, due: new Date(deadline.due) });
    });
  });
  return items.sort((a, b) => a.due - b.due);
}

function createTodoItem({ subject, kind, index, done }, week) {
  const item = document.createElement("li");
  item.className = `week-todo-item${done ? " is-complete" : ""}`;
  item.dataset.subject = subject.id;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `todo-check${done ? " is-complete" : ""}`;
  button.dataset.deliverable = kind;
  button.dataset.subjectId = subject.id;
  button.dataset.index = String(index);
  button.setAttribute("aria-pressed", String(Boolean(done)));
  const label = getDeliverableLabel(subject, kind, index);
  button.setAttribute("aria-label", `${label} de ${subject.name}: ${done ? "hecho" : "pendiente"}`);
  const box = document.createElement("span");
  box.className = "week-check-box";
  box.setAttribute("aria-hidden", "true");
  box.textContent = "✓";
  button.append(box);

  const copy = document.createElement("span");
  copy.className = "week-todo-copy";
  const title = document.createElement("strong");
  title.textContent = label;
  const meta = document.createElement("span");
  const code = document.createElement("span");
  code.className = "subject-code";
  code.textContent = subject.short;
  const metaText = document.createElement("span");
  metaText.textContent = subject.name;
  if (kind === "activity") {
    const deadline = getSubjectActivities(subject.id)[index];
    const recommended = getRecommendedWeek(subject.id, kind, index);
    const when = recommended === week ? "se explica esta semana" : `se explicó en la semana ${recommended}`;
    if (deadline) {
      const due = formatDeadlineParts(deadline.due);
      const daysLeft = Math.ceil((new Date(deadline.due) - new Date()) / 86400000);
      const left = daysLeft <= 0 ? "vence hoy" : daysLeft === 1 ? "queda 1 día" : `quedan ${daysLeft} días`;
      metaText.textContent += ` · ${when} · entrega ${due.day} ${due.month.toLowerCase()} · ${left}`;
    }
  }
  meta.append(code, metaText);
  copy.append(title, meta);
  item.append(button, copy);
  return item;
}

function createWeekTodo(week, subjects, isCurrentWeek) {
  const current = getWeekDeliverables(week, subjects);
  const overdue = isCurrentWeek ? getOverdueDeliverables(week, subjects) : [];
  if (current.length === 0 && overdue.length === 0) return null;
  const block = document.createElement("div");
  block.className = "week-todo";
  const addGroup = (heading, items) => {
    if (items.length === 0) return;
    const title = document.createElement("h4");
    title.textContent = heading;
    const list = document.createElement("ul");
    items.forEach((item) => list.append(createTodoItem(item, week)));
    block.append(title, list);
  };
  addGroup("Para hacer esta semana", current);
  addGroup("Pendiente de semanas anteriores", overdue);
  return block;
}

function createWeekNote(subject, text) {
  const row = document.createElement("article");
  row.className = "week-subject week-note-row";
  row.dataset.subject = subject.id;
  const label = document.createElement("div");
  label.className = "subject-label";
  const code = document.createElement("span");
  code.className = "subject-code";
  code.textContent = subject.short;
  const labelCopy = document.createElement("div");
  labelCopy.className = "subject-label-copy";
  const name = document.createElement("span");
  name.textContent = subject.name;
  labelCopy.append(name);
  label.append(code, labelCopy);
  const copy = document.createElement("div");
  copy.className = "study-copy";
  const title = document.createElement("h3");
  title.textContent = text;
  const detail = document.createElement("p");
  detail.className = "no-subtopics";
  detail.textContent = "Sin temario nuevo esta semana en esta asignatura.";
  copy.append(title, detail);
  row.append(label, copy);
  return row;
}

function createDeliverableControl(deadline, subject) {
  const subjectState = state[subject.id];
  if (deadline.type === "Tests") {
    const wrap = document.createElement("div");
    wrap.className = "test-checks";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", `Tests hechos de ${subject.name}`);
    const count = document.createElement("span");
    count.className = "test-checks-count";
    count.textContent = `${subjectState.testsDone}/${subjectState.testsTotal} hechos`;
    wrap.append(count);
    subjectState.tests.forEach((done, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `test-check${done ? " is-complete" : ""}`;
      button.dataset.deliverable = "test";
      button.dataset.subjectId = subject.id;
      button.dataset.index = String(index);
      button.setAttribute("aria-pressed", String(done));
      button.setAttribute(
        "aria-label",
        `Test del ${subject.topicLabel.toLowerCase()} ${index + 1}: ${done ? "hecho" : "pendiente"}`,
      );
      const recommendedWeek = getRecommendedWeek(subject.id, "test", index);
      const isEarly = !done && recommendedWeek && recommendedWeek > getPlanningContext().week;
      button.classList.toggle("is-early", Boolean(isEarly));
      button.title = `Test del ${subject.topicLabel.toLowerCase()} ${index + 1} · ${describeRecommendation(subject.id, "test", index)}${isEarly ? ": aún no has llegado a este tema" : ""}`;
      button.textContent = String(index + 1);
      wrap.append(button);
    });
    return wrap;
  }

  const index = getActivityIndex(deadline);
  const done = Boolean(subjectState.activities[index]);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `week-check deliverable-check${done ? " is-complete" : ""}`;
  button.dataset.deliverable = "activity";
  button.dataset.subjectId = subject.id;
  button.dataset.index = String(index);
  button.setAttribute("aria-pressed", String(done));
  button.setAttribute("aria-label", `${deadline.title} de ${subject.name} entregada`);
  const box = document.createElement("span");
  box.className = "week-check-box";
  box.setAttribute("aria-hidden", "true");
  box.textContent = "✓";
  const text = document.createElement("span");
  const isPastDue = new Date(deadline.due) < new Date();
  text.textContent = done ? "Entregada" : isPastDue ? "¿La entregaste?" : "¿Entregada?";
  button.append(box, text);
  return button;
}

function renderDeadlines() {
  if (!deadlinesList) return;
  deadlinesList.replaceChildren();

  const subjectOrder = new Map(SUBJECTS.map((subject, index) => [subject.id, index]));
  const groups = new Map();
  const visibleDeadlines = DEADLINES.filter(
    (deadline) =>
      selectedDeadlinesSubject === "all" || deadline.subjectId === selectedDeadlinesSubject,
  );

  [...visibleDeadlines]
    .sort(
      (a, b) =>
        new Date(a.due) - new Date(b.due) ||
        subjectOrder.get(a.subjectId) - subjectOrder.get(b.subjectId),
    )
    .forEach((deadline) => {
      const dateKey = deadline.due.slice(0, 10);
      if (!groups.has(dateKey)) groups.set(dateKey, { due: deadline.due, items: [] });
      groups.get(dateKey).items.push(deadline);
    });

  const now = new Date();
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = `deadline-group${new Date(group.due) < now ? " is-past" : ""}`;
    const dateParts = formatDeadlineParts(group.due);
    const heading = document.createElement("div");
    heading.className = "deadline-group-heading";
    const date = document.createElement("h2");
    date.className = "sr-only";
    date.textContent = formatDeadlineDate(group.due);
    const day = document.createElement("span");
    day.className = "deadline-day";
    day.textContent = dateParts.day;
    day.setAttribute("aria-hidden", "true");
    const month = document.createElement("span");
    month.className = "deadline-month";
    month.textContent = dateParts.month;
    month.setAttribute("aria-hidden", "true");
    const time = document.createElement("span");
    time.className = "deadline-time";
    time.textContent = `${dateParts.weekday} · ${dateParts.time}`;
    time.title = "Hora peninsular";
    heading.append(date, day, month, time);

    const items = document.createElement("div");
    items.className = "deadline-items";
    group.items.forEach((deadline) => {
      const subject = SUBJECTS.find((candidate) => candidate.id === deadline.subjectId);
      if (!subject) return;

      const row = document.createElement("article");
      const done = isDeliverableDone(deadline);
      const isPastDue = new Date(deadline.due) < now;
      const isOverdue = isPastDue && !done;
      row.className = `deadline-row${isPastDue ? " is-past" : ""}${done ? " is-done" : ""}${isOverdue ? " is-overdue" : ""}${deadline.type === "Tests" ? " is-tests" : ""}`;
      row.dataset.subject = subject.id;

      const code = document.createElement("span");
      code.className = "subject-code";
      code.textContent = subject.short;

      const content = document.createElement("div");
      content.className = "deadline-content";
      const title = document.createElement("strong");
      title.textContent = deadline.title;
      const meta = document.createElement("span");
      const type = document.createElement("span");
      type.className = `deadline-type is-${deadline.type === "Tests" ? "test" : "activity"}`;
      type.textContent = deadline.type;
      meta.append(type, document.createTextNode(subject.name));
      content.append(title, meta);
      if (isOverdue) {
        const overdue = document.createElement("span");
        overdue.className = "deadline-overdue";
        overdue.textContent =
          deadline.type === "Tests"
            ? "Plazo cerrado: puedes marcar igualmente los tests que hiciste"
            : "Vencida: si la entregaste, puedes marcarla igualmente";
        content.append(overdue);
      }
      if (deadline.type !== "Tests") {
        const hint = document.createElement("span");
        hint.className = "deadline-recommendation";
        hint.textContent = describeRecommendation(subject.id, "activity", getActivityIndex(deadline));
        content.append(hint);
      }

      const details = document.createElement("div");
      details.className = "deadline-details";
      const points = document.createElement("span");
      points.textContent = deadline.points;
      details.append(points);
      if (deadline.week) {
        const week = document.createElement("span");
        week.textContent = `Semana ${deadline.week}`;
        details.append(week);
      }
      if (deadline.campusUrl) {
        const campusLink = document.createElement("a");
        campusLink.href = deadline.campusUrl;
        campusLink.target = "_blank";
        campusLink.rel = "noreferrer";
        campusLink.textContent = "Campus ↗";
        campusLink.title = "Abrir esta entrega o el listado de tests en Campus";
        details.append(campusLink);
      }
      row.append(code, content, details, createDeliverableControl(deadline, subject));
      items.append(row);
    });
    section.append(heading, items);
    deadlinesList.append(section);
  });

  if (groups.size === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay entregas configuradas para esta asignatura.";
    deadlinesList.append(empty);
  }

  const visibleMissingSources = MISSING_DEADLINE_SOURCES.filter(
    ({ subjectId }) => selectedDeadlinesSubject === "all" || subjectId === selectedDeadlinesSubject,
  );
  if (visibleMissingSources.length > 0) {
    const missing = document.createElement("aside");
    missing.className = "deadlines-missing";
    const missingTitle = document.createElement("strong");
    missingTitle.textContent = "Faltan cronogramas de entregas";
    missing.append(missingTitle);
    visibleMissingSources.forEach(({ subjectId, message }) => {
      const subject = SUBJECTS.find((candidate) => candidate.id === subjectId);
      const line = document.createElement("span");
      line.textContent = `${subject?.name || subjectId}: ${message}`;
      missing.append(line);
    });
    deadlinesList.append(missing);
  }

  const subjectsWithoutActivities = SUBJECTS.filter(
    (subject) =>
      subject.activitiesTotal === 0 &&
      (selectedDeadlinesSubject === "all" || subject.id === selectedDeadlinesSubject),
  );
  if (subjectsWithoutActivities.length > 0) {
    const note = document.createElement("aside");
    note.className = "deadlines-info";
    const title = document.createElement("strong");
    title.textContent = "Sin actividades";
    const names = document.createElement("span");
    names.textContent = `${subjectsWithoutActivities.map((subject) => subject.name).join(", ")}: solo tienen tests configurados.`;
    note.append(title, names);
    deadlinesList.append(note);
  }
}

function createCounter(subjectId, kind, label, subjectState) {
  const done = subjectState[`${kind}Done`];
  const total = subjectState[`${kind}Total`];
  const counter = document.createElement("button");
  counter.type = "button";
  counter.className = "counter";
  counter.dataset.openDeadlines = subjectId;
  counter.title = `Marca los ${label.toLowerCase()} en la pestaña Entregas`;
  counter.setAttribute("aria-label", `${label}: ${done} de ${total}. Abrir en Entregas para marcarlos`);
  const name = document.createElement("span");
  name.textContent = label;
  const value = document.createElement("strong");
  value.textContent = `${done}/${total}`;
  const arrow = document.createElement("span");
  arrow.className = "counter-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "›";
  counter.append(name, value, arrow);
  return counter;
}

function createSubjectTopicsBody(subject, topics) {
  const body = document.createElement("div");
  body.className = "curriculum-body";
  const scheduleUrl = getCampusScheduleUrl(subject.id);
  if (scheduleUrl) {
    const link = document.createElement("a");
    link.className = "schedule-link";
    link.href = scheduleUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Cronograma en Campus ↗";
    body.append(link);
  }

  const temarioUrl = getCampusTemarioUrl(subject.id);
  if (temarioUrl) {
    const link = document.createElement("a");
    link.className = "schedule-link";
    link.href = temarioUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Temario oficial en Campus ↗";
    link.title = "Abrir el temario oficial de esta asignatura en Campus";
    body.append(link);
  }

  if (!SUMMARY_SLUGS[subject.id]) {
    const note = document.createElement("p");
    note.className = "summary-unavailable";
    note.textContent = "No hay resúmenes externos disponibles para esta asignatura.";
    body.append(note);
  }

  topics.forEach((topic) => body.append(createCurriculumTopic(subject, topic)));
  return body;
}

function createCurriculumTopic(subject, topic) {
  const complete = state[subject.id].topics[topic.number - 1];
  const row = document.createElement("div");
  row.className = "curriculum-topic";
  row.append(createTopicToggle(subject, topic, complete));

  const copy = document.createElement("div");
  copy.className = "curriculum-topic-copy";
  const title = document.createElement("strong");
  title.textContent = `${subject.topicLabel} ${topic.number} · ${topic.title}`;
  const weeks = document.createElement("span");
  weeks.textContent =
    topic.weeks[0] === topic.weeks[1]
      ? `Semana ${topic.weeks[0]}`
      : `Semanas ${topic.weeks[0]}–${topic.weeks[1]}`;
  copy.append(title, weeks);
  if (getTopicStatus(subject.id, topic.number) === "progress") {
    const badge = document.createElement("span");
    badge.className = "topic-progress-badge";
    badge.textContent = "En progreso";
    weeks.append(" · ", badge);
  }
  row.append(copy);

  const links = document.createElement("div");
  links.className = "topic-links";

  const campusTopicUrl = getCampusTopicUrl(subject.id, topic.number);
  if (campusTopicUrl) {
    const campusLink = document.createElement("a");
    campusLink.className = "campus-link";
    campusLink.href = campusTopicUrl;
    campusLink.target = "_blank";
    campusLink.rel = "noreferrer";
    campusLink.title = `Abrir ${subject.topicLabel.toLowerCase()} ${topic.number} en Campus`;
    campusLink.textContent = "Tema en Campus ↗";
    links.append(campusLink);
  }

  const summaryUrl = getSummaryUrlForMaterial(subject.id, topic.number);
  if (summaryUrl) {
    const summaryLink = document.createElement("a");
    summaryLink.className = "summary-link";
    summaryLink.href = summaryUrl;
    summaryLink.target = "_blank";
    summaryLink.rel = "noreferrer";
    summaryLink.title = "Abrir el resumen de este tema en Compendio DAW";
    summaryLink.textContent = "Resumen ↗";
    links.append(summaryLink);
  }

  if (links.childElementCount > 0) row.append(links);
  return row;
}

function getSummaryUrl(subjectId, topicNumber) {
  const slug = SUMMARY_SLUGS[subjectId];
  return slug ? `https://compendio-daw.vercel.app/${slug}/tema-${topicNumber}` : null;
}

// El compendio numera los temas como el cronograma; en Programación el temario de Campus
// intercambia algunos números (p. ej. material 8 = tema 10 del cronograma).
function getCompendioTopicNumber(subjectId, materialNumber) {
  const scheduledItem = Object.values(WEEKLY_STUDY[subjectId] || {}).find(
    (item) => (item.materialTopic || item.topic) === materialNumber,
  );
  return scheduledItem?.topic || materialNumber;
}

function getSummaryUrlForMaterial(subjectId, materialNumber) {
  return getSummaryUrl(subjectId, getCompendioTopicNumber(subjectId, materialNumber));
}

// Sincronización con Compendio DAW: solo funciona si ambas webs comparten dominio
// (y por tanto localStorage). "Leído" en el compendio equivale a "completado" aquí.
function isCompendioSyncEnabled() {
  try {
    return window.location.hostname === COMPENDIO_HOST || localStorage.getItem(COMPENDIO_READ_KEY) !== null;
  } catch {
    return false;
  }
}

function readStoredIdSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? new Set(value.filter((item) => typeof item === "string")) : null;
  } catch {
    return null;
  }
}

function getCompendioTopicEntries() {
  return SUBJECTS.flatMap((subject) => {
    const slug = SUMMARY_SLUGS[subject.id];
    if (!slug) return [];
    return subject.topics.map((topic) => ({
      subjectId: subject.id,
      index: topic.number - 1,
      id: `${slug}-tema-${getCompendioTopicNumber(subject.id, topic.number)}`,
    }));
  });
}

function writeCompendioReadTopics() {
  if (!isCompendioSyncEnabled()) return;
  const entries = getCompendioTopicEntries();
  const knownIds = new Set(entries.map((entry) => entry.id));
  // Conserva lo que el compendio tenga y el companion no conozca.
  const next = [...(readStoredIdSet(COMPENDIO_READ_KEY) || [])].filter((id) => !knownIds.has(id));
  entries.forEach(({ subjectId, index, id }) => {
    if (state[subjectId].topics[index]) next.push(id);
  });
  try {
    const serialized = JSON.stringify(next);
    localStorage.setItem(COMPENDIO_READ_KEY, serialized);
    localStorage.setItem(COMPENDIO_SYNC_KEY, serialized);
  } catch {
    // Sin almacenamiento disponible no hay nada que sincronizar.
  }
}

// Aplica lo que haya cambiado en el compendio desde la última sincronización.
// La primera vez solo suma: lo leído allí pasa a completado aquí, sin desmarcar nada.
function pullCompendioReadTopics() {
  if (!isCompendioSyncEnabled()) return false;
  const current = readStoredIdSet(COMPENDIO_READ_KEY) || new Set();
  const lastSynced = readStoredIdSet(COMPENDIO_SYNC_KEY);
  let changed = false;

  getCompendioTopicEntries().forEach(({ subjectId, index, id }) => {
    const readInCompendio = current.has(id);
    const changedInCompendio = lastSynced ? readInCompendio !== lastSynced.has(id) : readInCompendio;
    if (changedInCompendio && state[subjectId].topics[index] !== readInCompendio) {
      state[subjectId].topics[index] = readInCompendio;
      changed = true;
    }
  });

  writeCompendioReadTopics();
  return changed;
}

function normalizeText(value) {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getTopicWeeks(subjectId, topicNumber) {
  return Object.keys(WEEKLY_STUDY[subjectId] || {})
    .map(Number)
    .filter((week) => getStudyTopicNumber(subjectId, week) === topicNumber)
    .sort((a, b) => a - b);
}

function toggleTopic(subjectId, topicNumber) {
  const subjectState = state[subjectId];
  const index = topicNumber - 1;
  if (!subjectState || index < 0 || index >= subjectState.topics.length) return;
  subjectState.topics[index] = !subjectState.topics[index];
  saveState();
  renderAll();
  offerToSyncTopicWeeks(subjectId, topicNumber, subjectState.topics[index]);
}

function offerToSyncTopicWeeks(subjectId, topicNumber, completed) {
  const affectedWeeks = getTopicWeeks(subjectId, topicNumber).filter(
    (week) => isWeekStudied(subjectId, week) !== completed,
  );
  if (!completeWeeksDialog || affectedWeeks.length === 0) return;

  const subject = SUBJECTS.find((candidate) => candidate.id === subjectId);
  const isFeminine = subject.topicLabel === "Unidad";
  const weeksText =
    affectedWeeks.length === 1
      ? `la semana ${affectedWeeks[0]}`
      : `las semanas ${affectedWeeks.slice(0, -1).join(", ")} y ${affectedWeeks.at(-1)}`;
  const topicText = isFeminine ? "esta unidad" : "este tema";
  const studiedText = isFeminine ? "estudiada" : "estudiado";

  pendingWeeksCompletion = { subjectId, weeks: affectedWeeks, completed };
  completeWeeksDialog.querySelector("#completeWeeksTitle").textContent = completed
    ? `${subject.topicLabel} ${topicNumber} ${isFeminine ? "completada" : "completado"}`
    : `${subject.topicLabel} ${topicNumber} ${isFeminine ? "desmarcada" : "desmarcado"}`;
  completeWeeksDialog.querySelector("#completeWeeksText").textContent = completed
    ? `¿Quieres marcar también ${topicText} como ${studiedText} en ${weeksText} de la pestaña Semanas?`
    : `¿Quieres desmarcar también ${topicText} como ${studiedText} en ${weeksText} de la pestaña Semanas?`;
  completeWeeksDialog.querySelector("#completeWeeksConfirm").textContent = completed
    ? "Sí, marcar semanas"
    : "Sí, desmarcar semanas";
  completeWeeksDialog.showModal();
}

function applyPendingWeeksChange() {
  if (!pendingWeeksCompletion) return;
  const { subjectId, weeks, completed } = pendingWeeksCompletion;
  const subjectState = state[subjectId];
  subjectState.weeks = completed
    ? [...new Set([...subjectState.weeks, ...weeks])].sort((a, b) => a - b)
    : subjectState.weeks.filter((week) => !weeks.includes(week));
  pendingWeeksCompletion = null;
  saveState();
  renderAll();
}

function toggleWeek(subjectId, week) {
  const subjectState = state[subjectId];
  if (!subjectState || !WEEKLY_STUDY[subjectId]?.[week]) return;
  subjectState.weeks = isWeekStudied(subjectId, week)
    ? subjectState.weeks.filter((item) => item !== week)
    : [...subjectState.weeks, week].sort((a, b) => a - b);

  // El tema se completa solo cuando todas sus semanas están estudiadas,
  // y vuelve a "en progreso" si se desmarca alguna.
  const topicNumber = getStudyTopicNumber(subjectId, week);
  const index = topicNumber - 1;
  const allWeeksStudied = getTopicWeeks(subjectId, topicNumber).every((item) => isWeekStudied(subjectId, item));
  const subject = SUBJECTS.find((candidate) => candidate.id === subjectId);
  const isFeminine = subject.topicLabel === "Unidad";
  const topicTitle = subject.topics[index]?.title;
  const topicName = `${subject.name} · ${subject.topicLabel} ${topicNumber}${topicTitle ? ` (${topicTitle})` : ""}`;
  let message = null;
  if (allWeeksStudied && !subjectState.topics[index]) {
    subjectState.topics[index] = true;
    message = `${topicName} ${isFeminine ? "completada" : "completado"}.`;
  } else if (!allWeeksStudied && subjectState.topics[index]) {
    subjectState.topics[index] = false;
    message = `${topicName} vuelve a estar en progreso.`;
  }

  saveState();
  renderAll();
  if (message) showToast(message);
}

function refreshCurrentWeek() {
  const nextContext = getPlanningContext();
  if (JSON.stringify(nextContext.subjectWeeks) === currentRenderedWeek) return;
  renderTimeline();
  renderNextDeadline();
}

function copyTextFallback(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

async function copyProgressLink() {
  const shareUrl = getShareUrl();
  let copied = false;

  try {
    await navigator.clipboard.writeText(shareUrl);
    copied = true;
  } catch {
    copied = copyTextFallback(shareUrl);
  }

  shareState.textContent = copied
    ? "Enlace copiado. Al abrirlo recuperarás el progreso que tienes ahora."
    : "No se pudo copiar automáticamente. Copia el enlace de aquí abajo (mantén pulsado o selecciónalo).";
  shareState.classList.toggle("is-error", !copied);
  if (shareLinkField) {
    shareLinkField.hidden = copied;
    if (!copied) {
      shareLinkField.value = shareUrl;
      shareLinkField.focus();
      shareLinkField.select();
    }
  }

  window.clearTimeout(copyFeedbackTimer);
  copyProgressButton.textContent = copied ? "Enlace copiado ✓" : "No se pudo copiar";
  copyFeedbackTimer = window.setTimeout(() => {
    copyProgressButton.textContent = "Copiar enlace con mi progreso";
  }, 2400);
}

function populateSubjectFilter(select) {
  if (!select) return;
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "Todas";
  select.append(all);
  SUBJECTS.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.name;
    select.append(option);
  });
}

// Cada pestaña tiene su dirección (#/entregas…). Va detrás de "#" porque GitHub Pages
// solo sirve archivos: una ruta como /entregas daría 404.
const VIEW_ROUTES = {
  weeks: "semanas",
  deadlines: "entregas",
  progress: "progreso",
  guide: "como-usar",
};

function getViewFromUrl() {
  const match = window.location.hash.match(/^#\/([a-z-]+)/);
  if (match?.[1] === "temario") return "progress"; // Temario ahora vive dentro de Progreso.
  if (match?.[1] === "horario") return "weeks"; // El horario cambia cada semana: se consulta en Campus.
  return Object.keys(VIEW_ROUTES).find((view) => VIEW_ROUTES[view] === match?.[1]) || null;
}

function showView(view, { updateUrl = true } = {}) {
  if (!VIEW_ROUTES[view]) return;
  document.querySelectorAll(".nav-button").forEach((item) => {
    const active = item.dataset.view === view;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
  document.body.dataset.view = view;
  document.querySelector(`.nav-button[data-view="${view}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (updateUrl && getViewFromUrl() !== view) {
    window.history.pushState(null, "", `#/${VIEW_ROUTES[view]}`);
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

document.querySelectorAll("[data-go-view]").forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.goView);
  });
});

document.querySelector(".brand")?.addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector('.nav-button[data-view="weeks"]')?.click();
});
copyProgressButton?.addEventListener("click", () => void copyProgressLink());

weeksSubjectFilter?.addEventListener("change", () => {
  selectedWeeksSubject = weeksSubjectFilter.value;
  renderTimeline();
  renderNextDeadline();
});

deadlinesSubjectFilter?.addEventListener("change", () => {
  selectedDeadlinesSubject = deadlinesSubjectFilter.value;
  renderDeadlines();
});

// Confeti al marcar algo (nunca al desmarcar). Se respeta "reducir movimiento".
const confettiMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function launchConfetti(origin) {
  if (confettiMotionQuery.matches || !origin) return;
  const rect = origin.getBoundingClientRect();
  const subjectColor = getComputedStyle(origin).getPropertyValue("--subject").trim();
  const colors = [subjectColor || "#0a86b8", "#f5b83d", "#5ee0a0", "#ff7aa8", "#7c8cff"];
  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  document.body.append(canvas);
  const context = canvas.getContext("2d");
  context.scale(devicePixelRatio, devicePixelRatio);

  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const pieces = Array.from({ length: 46 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 5 + Math.random() * 6;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 5,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  });

  const start = performance.now();
  const duration = 1300;
  const frame = (now) => {
    const progress = (now - start) / duration;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    pieces.forEach((piece) => {
      piece.vy += 0.28;
      piece.vx *= 0.985;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.rotation += piece.spin;
      context.save();
      context.globalAlpha = Math.max(0, 1 - progress);
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.fillStyle = piece.color;
      context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      context.restore();
    });
    if (progress < 1 && canvas.isConnected) window.requestAnimationFrame(frame);
    else canvas.remove();
  };
  window.requestAnimationFrame(frame);
  // Por si el navegador pausa la animación (pestaña en segundo plano), se retira igualmente.
  window.setTimeout(() => canvas.remove(), duration + 200);
}

function celebrateIfMarking(button) {
  if (button?.getAttribute("aria-pressed") === "false") launchConfetti(button);
}

weeksTimeline.addEventListener("click", (event) => {
  const jump = event.target.closest("button[data-scroll-week]");
  if (jump) {
    scrollToWeek(jump.dataset.scrollWeek);
    return;
  }
  const morePending = event.target.closest("button[data-toggle-pending]");
  if (morePending) {
    pendingWeeksExpanded = !pendingWeeksExpanded;
    renderTimeline();
    return;
  }
  const control = event.target.closest("button[data-deliverable]");
  if (!control) return;
  celebrateIfMarking(control);
  toggleDeliverable(
    control.dataset.subjectId,
    control.dataset.deliverable,
    Number.parseInt(control.dataset.index, 10),
  );
});

[weeksTimeline, progressList].forEach((container) => {
  container.addEventListener("click", (event) => {
    const toggle = event.target.closest("button[data-subject-id][data-topic-number]");
    if (toggle) {
      celebrateIfMarking(toggle);
      toggleTopic(toggle.dataset.subjectId, Number.parseInt(toggle.dataset.topicNumber, 10));
      return;
    }

    const weekToggle = event.target.closest("button[data-subject-id][data-week]");
    if (weekToggle) {
      celebrateIfMarking(weekToggle);
      toggleWeek(weekToggle.dataset.subjectId, Number.parseInt(weekToggle.dataset.week, 10));
      return;
    }

    const topicsToggle = event.target.closest("button[data-toggle-topics]");
    if (topicsToggle) {
      const subjectId = topicsToggle.dataset.toggleTopics;
      if (expandedSubjects.has(subjectId)) expandedSubjects.delete(subjectId);
      else expandedSubjects.add(subjectId);
      renderProgress();
      return;
    }

    const counter = event.target.closest("button[data-open-deadlines]");
    if (counter) openDeadlinesFor(counter.dataset.openDeadlines);
  });
});

deadlinesList.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-deliverable]");
  if (!control) return;
  celebrateIfMarking(control);
  toggleDeliverable(
    control.dataset.subjectId,
    control.dataset.deliverable,
    Number.parseInt(control.dataset.index, 10),
  );
});

function openDeadlinesFor(subjectId) {
  selectedDeadlinesSubject = subjectId;
  if (deadlinesSubjectFilter) deadlinesSubjectFilter.value = subjectId;
  renderDeadlines();
  document.querySelector('.nav-button[data-view="deadlines"]')?.click();
}

document.querySelector("#progressSearch")?.addEventListener("input", (event) => {
  progressQuery = event.target.value;
  renderProgress();
});
document.querySelector("#resetButton").addEventListener("click", () => resetDialog.showModal());
document.querySelector("#confirmResetButton").addEventListener("click", (event) => {
  event.preventDefault();
  state = createInitialState();
  saveState();
  resetDialog.close();
  renderAll();
});
resetDialog.addEventListener("click", (event) => {
  if (event.target === resetDialog) resetDialog.close();
});
// Pegar un enlace de progreso con la página ya abierta solo cambia el "#": no recarga.
window.addEventListener("storage", (event) => {
  if (event.key !== COMPENDIO_READ_KEY) return;
  if (pullCompendioReadTopics()) {
    saveState();
    renderAll();
    showToast("Progreso actualizado desde el compendio.");
  }
});

window.addEventListener("hashchange", () => {
  const routedView = getViewFromUrl();
  if (routedView) {
    showView(routedView, { updateUrl: false });
    return;
  }
  const linkedState = loadStateFromUrl();
  if (!linkedState) return;
  clearStateFromUrl();
  if (!hasProgress(state) && hasProgress(linkedState)) {
    state = linkedState;
    saveState();
    renderAll();
    savedState.textContent = "Progreso recuperado desde el enlace";
    showToast("Progreso recuperado desde el enlace.");
    return;
  }
  pendingUrlState = linkedState;
  offerUrlStateImport();
});

importDialog?.addEventListener("close", () => {
  if (importDialog.returnValue === "link" && pendingUrlState) {
    state = pendingUrlState;
    saveState();
    renderAll();
    savedState.textContent = "Progreso recuperado desde el enlace";
    showToast("Progreso recuperado desde el enlace.");
  }
  pendingUrlState = null;
  importDialog.returnValue = "";
});
completeWeeksDialog?.addEventListener("click", (event) => {
  if (event.target === completeWeeksDialog) completeWeeksDialog.close();
});
completeWeeksDialog?.addEventListener("close", () => {
  if (completeWeeksDialog.returnValue === "confirm") applyPendingWeeksChange();
  pendingWeeksCompletion = null;
  completeWeeksDialog.returnValue = "";
});

function registerProgressTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const subjectIds = SUBJECTS.map((subject) => subject.id);

  const tools = [
    {
      name: "get_weekly_study_plan",
      title: "Consultar el plan de estudio semanal",
      description: "Devuelve el tema y los subtemas previstos para una semana del curso.",
      inputSchema: {
        type: "object",
        properties: { week: { type: "integer", minimum: 1, maximum: 32 } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input = {}) {
        const selectedWeek = Number.isInteger(input.week) ? input.week : getPlanningContext().week;
        return {
          week: selectedWeek,
          dateRanges: getWeekDateGroups(selectedWeek).map((group) => ({
            subjects: group.subjects.map((subject) => subject.id),
            start: group.start,
            end: group.end,
          })),
          phase: WEEK_PHASES[selectedWeek] || null,
          items: getWeekItems(selectedWeek).map(({ subject, scheduleTopicNumber, heading, subtopics, material, dateRange }) => ({
            subjectId: subject.id,
            subject: subject.name,
            start: dateRange.start,
            end: dateRange.end,
            topicNumber: scheduleTopicNumber,
            topic: heading,
            subtopics,
            completed: state[subject.id].topics[material.number - 1],
          })),
        };
      },
    },
    {
      name: "set_subject_progress",
      title: "Actualizar progreso de una asignatura",
      description: "Actualiza los temas, tests y actividades completados de una asignatura.",
      inputSchema: {
        type: "object",
        properties: {
          subjectId: { type: "string", enum: subjectIds },
          topicsDone: { type: "integer", minimum: 0, maximum: 10 },
          testsDone: { type: "integer", minimum: 0 },
          activitiesDone: { type: "integer", minimum: 0 },
        },
        required: ["subjectId", "topicsDone", "testsDone", "activitiesDone"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== "object" || !subjectIds.includes(input.subjectId)) {
          throw new Error("La asignatura indicada no existe.");
        }
        const subjectState = state[input.subjectId];
        const valid =
          Number.isInteger(input.topicsDone) &&
          input.topicsDone >= 0 &&
          input.topicsDone <= subjectState.topics.length &&
          Number.isInteger(input.testsDone) &&
          input.testsDone >= 0 &&
          input.testsDone <= subjectState.testsTotal &&
          Number.isInteger(input.activitiesDone) &&
          input.activitiesDone >= 0 &&
          input.activitiesDone <= subjectState.activitiesTotal;
        if (!valid) throw new Error("Los valores deben ser enteros dentro de sus totales.");

        subjectState.topics = Array.from(
          { length: subjectState.topics.length },
          (_, index) => index < input.topicsDone,
        );
        subjectState.tests = subjectState.tests.map((_, index) => index < input.testsDone);
        subjectState.activities = subjectState.activities.map((_, index) => index < input.activitiesDone);
        syncChecklistCounts(subjectState);
        saveState();
        renderAll();
        return { subjectId: input.subjectId, percent: getPercent(subjectState) };
      },
    },
  ];

  tools.forEach((tool) => {
    try {
      void Promise.resolve(context.registerTool(tool)).catch(() => {});
    } catch {
      // El panel sigue funcionando en navegadores sin WebMCP.
    }
  });
}

if (pullCompendioReadTopics()) saveLocalSnapshot(JSON.stringify(state));
populateSubjectFilter(weeksSubjectFilter);
populateSubjectFilter(deadlinesSubjectFilter);
renderAll();
registerProgressTools();
announceUrlStateImport();
const initialView = getViewFromUrl() || "weeks";
document.body.dataset.view = initialView;
if (initialView !== "weeks") showView(initialView, { updateUrl: false });
window.setInterval(refreshCurrentWeek, 60 * 1000);
window.addEventListener("focus", refreshCurrentWeek);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshCurrentWeek();
});
