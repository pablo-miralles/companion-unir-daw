// Horario semanal de 1º DAW: clases en directo y tutorías, en hora peninsular.
// day: 1 = lunes … 5 = viernes. Válido para todo el curso salvo aviso.
// Profesorado con nombre e inicial del primer apellido, por privacidad.
const TEACHERS = {
  ingles: "Ana Cristina G.",
  "entornos-desarrollo": "David C.",
  empleabilidad: "Alfredo C.",
  "lenguajes-marcas": "César C.",
  "bases-datos": "Carlos R.",
  "sistemas-informaticos": "David C.",
  programacion: "Tomás E.",
};

const TUTOR = "Tomás E.";

const TIMETABLE = [
  { day: 1, start: "17:00", end: "17:30", subjectId: "ingles", kind: "class" },
  { day: 1, start: "17:30", end: "18:00", subjectId: "ingles", kind: "tutoring" },
  { day: 1, start: "19:00", end: "20:30", subjectId: "lenguajes-marcas", kind: "class" },
  { day: 1, start: "20:30", end: "21:00", subjectId: "bases-datos", kind: "tutoring" },

  { day: 2, start: "16:00", end: "17:00", subjectId: "sistemas-informaticos", kind: "class" },
  { day: 2, start: "17:00", end: "18:00", subjectId: "empleabilidad", kind: "class" },
  { day: 2, start: "21:00", end: "21:30", subjectId: "entornos-desarrollo", kind: "tutoring" },

  { day: 3, start: "18:00", end: "19:00", subjectId: "bases-datos", kind: "class" },
  { day: 3, start: "20:00", end: "20:30", subjectId: "empleabilidad", kind: "tutoring" },

  { day: 4, start: "16:00", end: "16:30", subjectId: "sistemas-informaticos", kind: "tutoring" },
  { day: 4, start: "17:00", end: "18:00", subjectId: "entornos-desarrollo", kind: "class" },
  { day: 4, start: "18:00", end: "19:30", subjectId: "programacion", kind: "class" },
  { day: 4, start: "19:30", end: "20:00", subjectId: "programacion", kind: "tutoring" },

  { day: 5, start: "18:30", end: "19:00", subjectId: "lenguajes-marcas", kind: "tutoring" },
];
