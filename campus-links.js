// Enlaces oficiales comprobados en la navegación de cada asignatura de Campus.
// El panel solo guarda el índice; el contenido del temario sigue en Campus.
const CAMPUS_LINKS = Object.freeze({
  "bases-datos": {
    temario: "https://campusfp.unir.net/courses/3427/external_tools/8908",
    cronograma: "https://campusfp.unir.net/courses/3427/external_tools/6085",
  },
  "entornos-desarrollo": {
    temario: "https://campusfp.unir.net/courses/3430/external_tools/8908",
    cronograma: "https://campusfp.unir.net/courses/3430/external_tools/6085",
  },
  ingles: {
    temario: "https://campusfp.unir.net/courses/3429/external_tools/8908",
    cronograma: "https://campusfp.unir.net/courses/3429/external_tools/6085",
  },
  empleabilidad: {
    temario: "https://campusfp.unir.net/courses/3425/external_tools/8908",
    cronograma: "https://campusfp.unir.net/courses/3425/external_tools/6085",
  },
  "lenguajes-marcas": {
    temario: "https://campusfp.unir.net/courses/3431/external_tools/8908",
    cronograma: "https://campusfp.unir.net/courses/3431/external_tools/6085",
  },
  programacion: {
    temario: "https://campusfp.unir.net/courses/3426/external_tools/8908",
    cronograma: "https://campusfp.unir.net/courses/3426/external_tools/6085",
  },
  "sistemas-informaticos": {
    temario: "https://campusfp.unir.net/courses/3428/external_tools/8908",
    cronograma: "https://campusfp.unir.net/courses/3428/external_tools/6085",
  },
});

// Rutas directas comprobadas abriendo cada tema desde el índice del Visor.
// Se mantienen separadas del cronograma para que un cambio en una ruta de
// Campus no pueda alterar qué semana o qué tema se muestra en el panel.
const CAMPUS_TOPIC_URLS = Object.freeze({
  "bases-datos": {
    1: "https://visorinteractivo.unir.net/asignaturas/11731264/mis-temas/11729655",
    2: "https://visorinteractivo.unir.net/asignaturas/11731264/mis-temas/11729688",
    3: "https://visorinteractivo.unir.net/asignaturas/11731264/mis-temas/11729764",
    4: "https://visorinteractivo.unir.net/asignaturas/11731264/mis-temas/11729822",
    5: "https://visorinteractivo.unir.net/asignaturas/11731264/mis-temas/11729844",
    6: "https://visorinteractivo.unir.net/asignaturas/11731264/mis-temas/11729947",
    7: "https://visorinteractivo.unir.net/asignaturas/11731264/mis-temas/11729991",
    8: "https://visorinteractivo.unir.net/asignaturas/11731264/mis-temas/11730013",
    9: "https://visorinteractivo.unir.net/asignaturas/11731264/mis-temas/11730043",
    10: "https://visorinteractivo.unir.net/asignaturas/11731264/mis-temas/11730065",
  },
  "entornos-desarrollo": {
    1: "https://visorinteractivo.unir.net/asignaturas/10771938/mis-temas/10541719",
    2: "https://visorinteractivo.unir.net/asignaturas/10771938/mis-temas/10542583",
    3: "https://visorinteractivo.unir.net/asignaturas/10771938/mis-temas/10543204",
    4: "https://visorinteractivo.unir.net/asignaturas/10771938/mis-temas/10566674",
    5: "https://visorinteractivo.unir.net/asignaturas/10771938/mis-temas/10545389",
    6: "https://visorinteractivo.unir.net/asignaturas/10771938/mis-temas/10544382",
    7: "https://visorinteractivo.unir.net/asignaturas/10771938/mis-temas/10544570",
    8: "https://visorinteractivo.unir.net/asignaturas/10771938/mis-temas/10544749",
    9: "https://visorinteractivo.unir.net/asignaturas/10771938/mis-temas/10545052",
    10: "https://visorinteractivo.unir.net/asignaturas/10771938/mis-temas/10545121",
  },
  ingles: {
    1: "https://visorinteractivo.unir.net/asignaturas/11602649/mis-temas/11561719",
    2: "https://visorinteractivo.unir.net/asignaturas/11602649/mis-temas/11561838",
    3: "https://visorinteractivo.unir.net/asignaturas/11602649/mis-temas/11562095",
    4: "https://visorinteractivo.unir.net/asignaturas/11602649/mis-temas/11562154",
    5: "https://visorinteractivo.unir.net/asignaturas/11602649/mis-temas/11562412",
  },
  empleabilidad: {
    1: "https://visorinteractivo.unir.net/asignaturas/11610777/mis-temas/11558327",
    2: "https://visorinteractivo.unir.net/asignaturas/11610777/mis-temas/11558380",
    3: "https://visorinteractivo.unir.net/asignaturas/11610777/mis-temas/11558428",
    4: "https://visorinteractivo.unir.net/asignaturas/11610777/mis-temas/11558459",
    5: "https://visorinteractivo.unir.net/asignaturas/11610777/mis-temas/11558482",
    6: "https://visorinteractivo.unir.net/asignaturas/11610777/mis-temas/11558505",
    7: "https://visorinteractivo.unir.net/asignaturas/11610777/mis-temas/11558602",
    8: "https://visorinteractivo.unir.net/asignaturas/11610777/mis-temas/11558684",
    9: "https://visorinteractivo.unir.net/asignaturas/11610777/mis-temas/11558859",
    10: "https://visorinteractivo.unir.net/asignaturas/11610777/mis-temas/11558955",
  },
  "lenguajes-marcas": {
    1: "https://visorinteractivo.unir.net/asignaturas/10731231/mis-temas/10563248",
    2: "https://visorinteractivo.unir.net/asignaturas/10731231/mis-temas/10601501",
    3: "https://visorinteractivo.unir.net/asignaturas/10731231/mis-temas/10604204",
    4: "https://visorinteractivo.unir.net/asignaturas/10731231/mis-temas/10604870",
    5: "https://visorinteractivo.unir.net/asignaturas/10731231/mis-temas/10608414",
    6: "https://visorinteractivo.unir.net/asignaturas/10731231/mis-temas/10633737",
    7: "https://visorinteractivo.unir.net/asignaturas/10731231/mis-temas/10636218",
    8: "https://visorinteractivo.unir.net/asignaturas/10731231/mis-temas/10641693",
    9: "https://visorinteractivo.unir.net/asignaturas/10731231/mis-temas/10651151",
    10: "https://visorinteractivo.unir.net/asignaturas/10731231/mis-temas/10652506",
  },
  programacion: {
    1: "https://visorinteractivo.unir.net/asignaturas/11706748/mis-temas/11704374",
    2: "https://visorinteractivo.unir.net/asignaturas/11706748/mis-temas/11704456",
    3: "https://visorinteractivo.unir.net/asignaturas/11706748/mis-temas/11704478",
    4: "https://visorinteractivo.unir.net/asignaturas/11706748/mis-temas/11704501",
    5: "https://visorinteractivo.unir.net/asignaturas/11706748/mis-temas/11704523",
    6: "https://visorinteractivo.unir.net/asignaturas/11706748/mis-temas/11704589",
    7: "https://visorinteractivo.unir.net/asignaturas/11706748/mis-temas/11704626",
    8: "https://visorinteractivo.unir.net/asignaturas/11706748/mis-temas/11704648",
    9: "https://visorinteractivo.unir.net/asignaturas/11706748/mis-temas/11704697",
    10: "https://visorinteractivo.unir.net/asignaturas/11706748/mis-temas/11704719",
  },
  "sistemas-informaticos": {
    1: "https://visorinteractivo.unir.net/asignaturas/11635611/mis-temas/11549058",
    2: "https://visorinteractivo.unir.net/asignaturas/11635611/mis-temas/11549060",
    3: "https://visorinteractivo.unir.net/asignaturas/11635611/mis-temas/11549062",
    4: "https://visorinteractivo.unir.net/asignaturas/11635611/mis-temas/11549063",
    5: "https://visorinteractivo.unir.net/asignaturas/11635611/mis-temas/11549064",
    6: "https://visorinteractivo.unir.net/asignaturas/11635611/mis-temas/11549065",
    7: "https://visorinteractivo.unir.net/asignaturas/11635611/mis-temas/11549066",
    8: "https://visorinteractivo.unir.net/asignaturas/11635611/mis-temas/11549067",
    9: "https://visorinteractivo.unir.net/asignaturas/11635611/mis-temas/11549068",
    10: "https://visorinteractivo.unir.net/asignaturas/11635611/mis-temas/11549069",
  },
});

function getCampusTemarioUrl(subjectId) {
  return CAMPUS_LINKS[subjectId]?.temario || null;
}

function getCampusTopicUrl(subjectId, topicNumber) {
  return CAMPUS_TOPIC_URLS[subjectId]?.[topicNumber] || getCampusTemarioUrl(subjectId);
}

function getCampusScheduleUrl(subjectId) {
  return CAMPUS_LINKS[subjectId]?.cronograma || null;
}
