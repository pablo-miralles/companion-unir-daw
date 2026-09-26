const STORAGE_KEY = "daw-progress-v1";
const API_PROGRESS_URL = "/api/progress";
const URL_STATE_VERSION = 1;
const URL_STATE_HASH_PREFIX = "progreso=";
const PUBLIC_APP_URL = "";
const SUBJECTS = CURRICULUM;

const SUMMARY_LINKS = {
  "bases-datos": { slug: "bbdd", suffix: "intro" },
  "lenguajes-marcas": { slug: "lmsgi", suffix: "intro" },
  programacion: { slug: "prog", suffix: "intro" },
  "entornos-desarrollo": { slug: "ed", suffix: "intro-objetivos" },
  "sistemas-informaticos": { slug: "si", suffix: "intro-objetivos" },
};

const LEGACY_DEFAULTS = {
  "bases-datos": { testsTotal: 4, activitiesTotal: 3 },
  "entornos-desarrollo": { testsTotal: 4, activitiesTotal: 2 },
  ingles: { testsTotal: 5, activitiesTotal: 3 },
  empleabilidad: { testsTotal: 4, activitiesTotal: 3 },
  "lenguajes-marcas": { testsTotal: 5, activitiesTotal: 4 },
  programacion: { testsTotal: 5, activitiesTotal: 4 },
  "sistemas-informaticos": { testsTotal: 4, activitiesTotal: 3 },
};

const weeksTimeline = document.querySelector("#weeksTimeline");
const progressList = document.querySelector("#progressList");
const progressSummary = document.querySelector("#progressSummary");
const curriculumList = document.querySelector("#curriculumList");
const curriculumSearch = document.querySelector("#curriculumSearch");
const deadlinesList = document.querySelector("#deadlinesList");
const nextDeadline = document.querySelector("#nextDeadline");
const weeksSubjectFilter = document.querySelector("#weeksSubjectFilter");
const deadlinesSubjectFilter = document.querySelector("#deadlinesSubjectFilter");
const savedState = document.querySelector("#savedState");
const shareState = document.querySelector("#shareState");
const copyProgressButton = document.querySelector("#copyProgressButton");
const persistenceHint = document.querySelector("#persistenceHint");
const resetDialog = document.querySelector("#resetDialog");

let saveTimer = null;
let persistenceMode = "local";
let serverSaveQueue = Promise.resolve();
const stateFromUrl = loadStateFromUrl();
let importedStateFromUrl = Boolean(stateFromUrl);
let state = stateFromUrl || loadLocalState();
let currentRenderedWeek = null;
let selectedWeeksSubject = "all";
let selectedDeadlinesSubject = "all";

function createInitialState() {
  return Object.fromEntries(
    SUBJECTS.map((subject) => [
      subject.id,
      {
        topics: Array(subject.topics.length).fill(false),
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
    const legacy = LEGACY_DEFAULTS[subject.id];
    const storedTestsTotal = clampNumber(current.testsTotal, 0, 30, subject.testsTotal);
    const storedActivitiesTotal = clampNumber(current.activitiesTotal, 0, 30, subject.activitiesTotal);
    const testsTotal = storedTestsTotal === legacy?.testsTotal ? subject.testsTotal : storedTestsTotal;
    const activitiesTotal =
      storedActivitiesTotal === legacy?.activitiesTotal
        ? subject.activitiesTotal
        : storedActivitiesTotal;

    initial[subject.id] = {
      topics,
      testsTotal,
      testsDone: clampNumber(current.testsDone, 0, testsTotal, 0),
      activitiesTotal,
      activitiesDone: clampNumber(current.activitiesDone, 0, activitiesTotal, 0),
    };
  });

  return initial;
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
        return [
          subject.id,
          [
            topicMask,
            subjectState.testsDone,
            subjectState.testsTotal,
            subjectState.activitiesDone,
            subjectState.activitiesTotal,
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
    if (!Array.isArray(values) || values.length !== 5) return;
    const [topicMask, testsDone, testsTotal, activitiesDone, activitiesTotal] = values;
    if (!Number.isInteger(topicMask) || topicMask < 0) return;
    decoded[subject.id] = {
      topics: Array.from(
        { length: subject.topics.length },
        (_, index) => Boolean(topicMask & (1 << index)),
      ),
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

function syncStateUrl() {
  const shareUrl = getShareUrl();
  const localUrl = new URL(window.location.href);
  localUrl.hash = new URL(shareUrl).hash;
  window.history.replaceState(null, "", localUrl);
  return shareUrl;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function setPersistenceHint(message) {
  if (persistenceHint) persistenceHint.textContent = message;
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

async function writeServerSnapshot(snapshot) {
  const response = await fetch(API_PROGRESS_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: snapshot,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`No se pudo guardar el progreso (${response.status})`);
}

function queueServerSnapshot(snapshot) {
  serverSaveQueue = serverSaveQueue
    .then(async () => {
      if (persistenceMode === "server") await writeServerSnapshot(snapshot);
    })
    .then(() => {
      if (persistenceMode === "server") markSaved("Guardado en progress.json");
    })
    .catch(() => {
      persistenceMode = "local";
      saveLocalSnapshot(snapshot);
      setPersistenceHint("Servidor no disponible · guardado solo en este dispositivo");
      savedState.textContent = "Servidor no disponible · guardado en este dispositivo";
      savedState.classList.remove("is-saving");
    });
}

function saveState() {
  const snapshot = JSON.stringify(state);
  syncStateUrl();
  markSaving();

  if (persistenceMode === "server") {
    queueServerSnapshot(snapshot);
    return;
  }

  saveLocalSnapshot(snapshot);
  markSaved("Guardado en este dispositivo");
}

async function initialisePersistence() {
  try {
    const response = await fetch(API_PROGRESS_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`API no disponible (${response.status})`);

    const payload = await response.json();
    const remoteState = Object.prototype.hasOwnProperty.call(payload, "state") ? payload.state : payload;
    persistenceMode = "server";
    setPersistenceHint("Guardado en progress.json");

    if (importedStateFromUrl) {
      importedStateFromUrl = false;
      saveLocalSnapshot(JSON.stringify(state));
      queueServerSnapshot(JSON.stringify(state));
      savedState.textContent = "Progreso cargado desde el enlace";
      shareState.textContent = "Este enlace ya contiene el estado mostrado.";
      return;
    }

    if (remoteState && typeof remoteState === "object") {
      state = hydrateState(remoteState);
      renderAll();
      syncStateUrl();
      savedState.textContent = "Guardado en progress.json";
      savedState.classList.remove("is-saving");
      return;
    }

    // Primera ejecución del servidor: conserva lo que hubiera en localStorage.
    queueServerSnapshot(JSON.stringify(state));
  } catch {
    persistenceMode = "local";
    setPersistenceHint("Guardado solo en este dispositivo");
    if (importedStateFromUrl) {
      importedStateFromUrl = false;
      saveLocalSnapshot(JSON.stringify(state));
      savedState.textContent = "Progreso cargado desde el enlace";
      shareState.textContent = "Este enlace ya contiene el estado mostrado.";
    }
  }
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

function renderAll() {
  renderTimeline();
  renderProgress();
  renderNextDeadline();
  renderDeadlines();
  renderCurriculum(curriculumSearch.value);
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

  for (let week = 1; week <= 32; week += 1) {
    const dateGroups = getWeekDateGroups(week, visibleSubjects);
    const currentSubjects = visibleSubjects.filter((subject) => subjectWeeks[subject.id] === week);
    const section = document.createElement("section");
    const isPast = week < currentWeek;
    const isCurrent = currentSubjects.length > 0;
    section.className = `week-section${isPast ? " is-past" : ""}${isCurrent ? " is-current" : ""}`;
    section.id = week === currentWeek ? "semana-actual" : `semana-${week}`;
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

    if (items.length > 0) {
      items.forEach((item) => content.append(createWeekSubject(item)));
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

    section.append(meta, content);
    weeksTimeline.append(section);
  }
}

function createWeekSubject({ subject, week, heading, subtopics, material, scheduleTopicNumber, dateRange }) {
  const row = document.createElement("article");
  row.className = "week-subject";
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

  const actions = document.createElement("div");
  actions.className = "study-actions";
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
    actions.append(link);
  }
  row.append(label, copy, actions);
  return row;
}

function createTopicToggle(subject, topic, complete) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = `topic-check${complete ? " is-complete" : ""}`;
  toggle.dataset.subjectId = subject.id;
  toggle.dataset.topicNumber = String(topic.number);
  toggle.setAttribute("aria-pressed", String(complete));
  toggle.setAttribute(
    "aria-label",
    `${complete ? "Marcar pendiente" : "Marcar estudiado"}: ${subject.name}, ${subject.topicLabel.toLowerCase()} ${topic.number}`,
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
    createSummaryMetric(`${totals.topicsDone}/${totals.topicsTotal}`, "temas"),
    createSummaryMetric(`${totals.testsDone}/${totals.testsTotal}`, "tests"),
    createSummaryMetric(`${totals.activitiesDone}/${totals.activitiesTotal}`, "actividades"),
  );
  progressList.replaceChildren();

  SUBJECTS.forEach((subject) => {
    const subjectState = state[subject.id];
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
    copy.append(strong, progress);
    name.append(code, copy);

    const dots = document.createElement("div");
    dots.className = "topic-dots";
    dots.setAttribute("aria-label", `${subject.topicLabel === "Unidad" ? "Unidades" : "Temas"} de ${subject.name}`);
    subject.topics.forEach((topic, index) => {
      const complete = subjectState.topics[index];
      const button = document.createElement("button");
      button.type = "button";
      button.className = `topic-dot${complete ? " is-complete" : ""}`;
      button.dataset.subjectId = subject.id;
      button.dataset.topicNumber = String(topic.number);
      button.setAttribute("aria-pressed", String(complete));
      button.setAttribute("aria-label", `${subject.topicLabel} ${topic.number}: ${complete ? "estudiado" : "pendiente"}`);
      button.title = `${subject.topicLabel} ${topic.number} · ${topic.title}`;
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
    progressList.append(row);
  });
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
    .filter((deadline) => new Date(deadline.due) >= now)
    .sort((a, b) => new Date(a.due) - new Date(b.due))[0];

  if (!upcoming) {
    delete nextDeadline.dataset.subject;
    nextDeadline.classList.add("is-empty");
    nextDeadline.textContent =
      selectedWeeksSubject === "all"
        ? "No hay entregas próximas configuradas."
        : "Esta asignatura no tiene próximas entregas configuradas.";
    return;
  }

  nextDeadline.classList.remove("is-empty");
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
    section.className = "deadline-group";
    const heading = document.createElement("div");
    heading.className = "deadline-group-heading";
    const date = document.createElement("h2");
    date.textContent = formatDeadlineDate(group.due);
    const time = document.createElement("span");
    time.textContent = "23:59 · hora peninsular";
    heading.append(date, time);

    const items = document.createElement("div");
    items.className = "deadline-items";
    group.items.forEach((deadline) => {
      const subject = SUBJECTS.find((candidate) => candidate.id === deadline.subjectId);
      if (!subject) return;

      const row = document.createElement("article");
      row.className = `deadline-row${new Date(deadline.due) < now ? " is-past" : ""}`;
      row.dataset.subject = subject.id;

      const type = document.createElement("span");
      type.className = `deadline-type is-${deadline.type === "Tests" ? "test" : "activity"}`;
      type.textContent = deadline.type;

      const content = document.createElement("div");
      content.className = "deadline-content";
      const title = document.createElement("strong");
      title.textContent = deadline.title;
      const subjectName = document.createElement("span");
      subjectName.textContent = subject.name;
      content.append(title, subjectName);

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
      row.append(type, content, details);
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
  const doneKey = `${kind}Done`;
  const totalKey = `${kind}Total`;
  const counter = document.createElement("div");
  counter.className = "counter";
  const name = document.createElement("span");
  name.textContent = label;
  const decrease = document.createElement("button");
  decrease.type = "button";
  decrease.dataset.subjectId = subjectId;
  decrease.dataset.kind = kind;
  decrease.dataset.change = "-1";
  decrease.disabled = subjectState[doneKey] === 0;
  decrease.setAttribute("aria-label", `Restar ${label.toLowerCase()}`);
  decrease.textContent = "−";
  const value = document.createElement("strong");
  value.className = "counter-value";
  value.dataset.subjectId = subjectId;
  value.dataset.kind = kind;
  value.title = "Doble clic para editar el total";
  value.setAttribute("role", "button");
  value.setAttribute("tabindex", "0");
  value.setAttribute("aria-label", `Doble clic para editar el total de ${label.toLowerCase()}`);
  value.textContent = `${subjectState[doneKey]}/${subjectState[totalKey]}`;
  const increase = document.createElement("button");
  increase.type = "button";
  increase.dataset.subjectId = subjectId;
  increase.dataset.kind = kind;
  increase.dataset.change = "1";
  increase.disabled = subjectState[doneKey] >= subjectState[totalKey];
  increase.setAttribute("aria-label", `Sumar ${label.toLowerCase()}`);
  increase.textContent = "+";
  counter.append(name, decrease, value, increase);
  return counter;
}

function renderCurriculum(query = "") {
  const normalizedQuery = normalizeText(query.trim());
  const openSubjectIds = new Set(
    Array.from(curriculumList.querySelectorAll("details[open]"), (details) => details.dataset.subjectId),
  );
  curriculumList.replaceChildren();

  SUBJECTS.forEach((subject) => {
    const subjectMatches = normalizeText(subject.name).includes(normalizedQuery);
    const topics = subject.topics.filter(
      (topic) =>
        !normalizedQuery ||
        subjectMatches ||
        normalizeText(`${topic.number} ${topic.title}`).includes(normalizedQuery),
    );
    if (topics.length === 0) return;

    const details = document.createElement("details");
    details.className = "curriculum-subject";
    details.dataset.subjectId = subject.id;
    details.dataset.subject = subject.id;
    details.open = Boolean(normalizedQuery) || openSubjectIds.has(subject.id);
    const summary = document.createElement("summary");
    const code = document.createElement("span");
    code.className = "subject-code";
    code.textContent = subject.short;
    const title = document.createElement("h2");
    title.textContent = subject.name;
    summary.append(code, title);

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

    if (!SUMMARY_LINKS[subject.id]) {
      const note = document.createElement("p");
      note.className = "summary-unavailable";
      note.textContent = "No hay resúmenes externos disponibles para esta asignatura.";
      body.append(note);
    }

    topics.forEach((topic) => body.append(createCurriculumTopic(subject, topic)));

    details.append(summary, body);
    curriculumList.append(details);
  });

  if (curriculumList.childElementCount === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay resultados para esa búsqueda.";
    curriculumList.append(empty);
  }
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

  const summaryUrl = getSummaryUrl(subject.id, topic.number);
  if (summaryUrl) {
    const summaryLink = document.createElement("a");
    summaryLink.className = "summary-link";
    summaryLink.href = summaryUrl;
    summaryLink.target = "_blank";
    summaryLink.rel = "noreferrer";
    summaryLink.title = "Abrir el resumen de este tema en Compendio DAW";
    summaryLink.textContent = "Resumen de apoyo ↗";
    links.append(summaryLink);
  }

  if (links.childElementCount > 0) row.append(links);
  return row;
}

function getSummaryUrl(subjectId, topicNumber) {
  const config = SUMMARY_LINKS[subjectId];
  return config
    ? `https://compendio-daw.vercel.app/#${config.slug}-${topicNumber}-${config.suffix}`
    : null;
}

function normalizeText(value) {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toggleTopic(subjectId, topicNumber) {
  const subjectState = state[subjectId];
  const index = topicNumber - 1;
  if (!subjectState || index < 0 || index >= subjectState.topics.length) return;
  subjectState.topics[index] = !subjectState.topics[index];
  saveState();
  renderAll();
}

function updateCounter(subjectId, kind, change) {
  const subjectState = state[subjectId];
  if (!subjectState || !["tests", "activities"].includes(kind)) return;
  const doneKey = `${kind}Done`;
  const totalKey = `${kind}Total`;
  subjectState[doneKey] = Math.min(
    subjectState[totalKey],
    Math.max(0, subjectState[doneKey] + change),
  );
  saveState();
  renderAll();
}

function beginCounterTotalEdit(valueElement) {
  const subjectId = valueElement.dataset.subjectId;
  const kind = valueElement.dataset.kind;
  const subjectState = state[subjectId];
  if (!subjectState || !["tests", "activities"].includes(kind)) return;

  const totalKey = `${kind}Total`;
  const doneKey = `${kind}Done`;
  const input = document.createElement("input");
  input.className = "counter-total-input";
  input.type = "number";
  input.min = "0";
  input.max = "30";
  input.step = "1";
  input.inputMode = "numeric";
  input.value = String(subjectState[totalKey]);
  input.setAttribute("aria-label", `Total de ${kind === "tests" ? "tests" : "actividades"}`);

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;

    if (!commit) {
      renderAll();
      return;
    }

    const nextTotal = Number.parseInt(input.value, 10);
    if (!Number.isInteger(nextTotal) || nextTotal < 0 || nextTotal > 30) {
      savedState.textContent = "El total debe ser un entero entre 0 y 30";
      savedState.classList.remove("is-saving");
      renderAll();
      return;
    }

    subjectState[totalKey] = nextTotal;
    subjectState[doneKey] = Math.min(subjectState[doneKey], nextTotal);
    saveState();
    renderAll();
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
  valueElement.replaceWith(input);
  window.requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function scrollToCurrentWeek(behavior = "smooth") {
  document.querySelector("#semana-actual")?.scrollIntoView({ behavior, block: "center" });
}

function refreshCurrentWeek() {
  const nextContext = getPlanningContext();
  if (JSON.stringify(nextContext.subjectWeeks) === currentRenderedWeek) return;
  renderTimeline();
  const weeksPanel = document.querySelector('[data-view-panel="weeks"]');
  if (!weeksPanel.hidden) window.requestAnimationFrame(() => scrollToCurrentWeek("smooth"));
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
  const shareUrl = syncStateUrl();
  let copied = false;

  try {
    await navigator.clipboard.writeText(shareUrl);
    copied = true;
  } catch {
    copied = copyTextFallback(shareUrl);
  }

  shareState.textContent = copied
    ? "Enlace copiado. Al abrirlo se restaurará este progreso."
    : "No se pudo copiar automáticamente; copia la URL de la barra del navegador.";
  shareState.classList.toggle("is-error", !copied);
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

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    document.querySelectorAll(".nav-button").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-view-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.viewPanel !== view;
    });
    window.scrollTo({ top: 0, behavior: "auto" });
    if (view === "weeks") window.requestAnimationFrame(() => scrollToCurrentWeek("smooth"));
  });
});

document.querySelector("#todayButton").addEventListener("click", () => scrollToCurrentWeek());
copyProgressButton?.addEventListener("click", () => void copyProgressLink());

weeksSubjectFilter?.addEventListener("change", () => {
  selectedWeeksSubject = weeksSubjectFilter.value;
  renderTimeline();
  renderNextDeadline();
  window.requestAnimationFrame(() => scrollToCurrentWeek("auto"));
});

deadlinesSubjectFilter?.addEventListener("change", () => {
  selectedDeadlinesSubject = deadlinesSubjectFilter.value;
  renderDeadlines();
});

[weeksTimeline, progressList, curriculumList].forEach((container) => {
  container.addEventListener("click", (event) => {
    const toggle = event.target.closest("button[data-subject-id][data-topic-number]");
    if (toggle) {
      toggleTopic(toggle.dataset.subjectId, Number.parseInt(toggle.dataset.topicNumber, 10));
      return;
    }

    const counter = event.target.closest("button[data-subject-id][data-kind][data-change]");
    if (counter) {
      updateCounter(
        counter.dataset.subjectId,
        counter.dataset.kind,
        Number.parseInt(counter.dataset.change, 10),
      );
    }
  });
});

progressList.addEventListener("dblclick", (event) => {
  const value = event.target.closest(".counter-value");
  if (value) beginCounterTotalEdit(value);
});

curriculumSearch.addEventListener("input", () => renderCurriculum(curriculumSearch.value));
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
        subjectState.testsDone = input.testsDone;
        subjectState.activitiesDone = input.activitiesDone;
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

populateSubjectFilter(weeksSubjectFilter);
populateSubjectFilter(deadlinesSubjectFilter);
renderAll();
syncStateUrl();
registerProgressTools();
void initialisePersistence();
window.requestAnimationFrame(() => scrollToCurrentWeek("auto"));
window.setInterval(refreshCurrentWeek, 60 * 1000);
window.addEventListener("focus", refreshCurrentWeek);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshCurrentWeek();
});
