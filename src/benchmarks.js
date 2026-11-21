// WOD de référence (« benchmarks ») : WOD célèbres et toujours identiques, pour se mesurer dans le temps. Tirés au
// hasard dans la rubrique « WOD du jour » (sans IA, gratuits) et suivis dans la page PR.
// Chaque benchmark est décrit au format JSON des WOD générés (blocs, mouvements, version adaptée) : le texte est mis
// en forme par wodToText (src/ai.js), les mouvements du catalogue sont reconnus par dailyMovementIds.
import {wodToText, dailyChrono, dailyMovementIds} from "./ai.js";

// Matériel : barre, traction (barre de traction), anneaux, kb (kettlebell), corde (à sauter), rameur, course,
// wall_ball, box (box jump). Lieux : « box » (tout le matériel), « exterieur » (course, traction, corde),
// « peu » (barre de traction et corde à sauter au plus).
export const BENCHMARK_PLACES = {
  box: null,
  exterieur: ["course", "traction", "corde"],
  peu: ["traction", "corde"],
};
const WARMUP = {
  type: "echauffement",
  duree_min: 10,
  format: null,
  time_cap_min: null,
  description: "Cardio léger et mobilité, puis quelques répétitions progressives de chaque mouvement du WOD.",
  mouvements: [],
};
const m = (reps, nom, charge = null, scaling = null) => ({reps, nom, charge, scaling});
// score : « time » (temps, le plus court gagne) ou « reps » (AMRAP : tours + répétitions, round_reps par tour).
const B = (id, name, kind, score, minutes, equipment, format, description, mouvements, extra = {}) => ({
  id,
  name,
  kind,
  score,
  minutes,
  equipment,
  format,
  description,
  mouvements,
  cap: extra.cap ?? null,
  round_reps: extra.round_reps ?? null,
  chrono:
    extra.chrono ||
    (score === "reps"
      ? {mode: "amrap", minutes: minutes, intervalle_s: null, tours: null, travail_s: null, repos_s: null}
      : {mode: "fortime", minutes: extra.cap ?? null, intervalle_s: null, tours: null, travail_s: null, repos_s: null}),
});

export const BENCHMARKS = [
  B(
    "fran",
    "Fran",
    "Girl",
    "time",
    8,
    ["barre", "traction"],
    "21-15-9",
    "Le plus vite possible.",
    [m(null, "Thruster", "43/30 kg", "29/20 kg"), m(null, "Pull-up", null, "ring rows")],
    {cap: 10}
  ),
  B(
    "grace",
    "Grace",
    "Girl",
    "time",
    6,
    ["barre"],
    "For Time",
    "30 répétitions, le plus vite possible.",
    [m("30", "Clean & jerk", "61/43 kg", "40/30 kg")],
    {cap: 10}
  ),
  B(
    "isabel",
    "Isabel",
    "Girl",
    "time",
    6,
    ["barre"],
    "For Time",
    "30 répétitions, le plus vite possible.",
    [m("30", "Snatch", "61/43 kg", "40/30 kg")],
    {cap: 10}
  ),
  B(
    "helen",
    "Helen",
    "Girl",
    "time",
    12,
    ["course", "kb", "traction"],
    "3 tours For Time",
    "3 tours, le plus vite possible.",
    [m("400 m", "Run"), m("21", "Kettlebell swing", "24/16 kg", "16/12 kg"), m("12", "Pull-up", null, "ring rows")],
    {cap: 15}
  ),
  B(
    "diane",
    "Diane",
    "Girl",
    "time",
    8,
    ["barre"],
    "21-15-9",
    "Le plus vite possible.",
    [m(null, "Deadlift", "102/70 kg", "70/50 kg"), m(null, "Handstand push-up", null, "pike push-ups")],
    {cap: 12}
  ),
  B(
    "elizabeth",
    "Elizabeth",
    "Girl",
    "time",
    9,
    ["barre", "anneaux"],
    "21-15-9",
    "Le plus vite possible.",
    [m(null, "Squat clean", "61/43 kg", "40/30 kg"), m(null, "Ring dip", null, "dips sur box")],
    {cap: 12}
  ),
  B(
    "annie",
    "Annie",
    "Girl",
    "time",
    10,
    ["corde"],
    "50-40-30-20-10",
    "Le plus vite possible.",
    [m(null, "Double under", null, "2 sauts simples par double"), m(null, "Sit-up")],
    {cap: 15}
  ),
  B(
    "karen",
    "Karen",
    "Girl",
    "time",
    10,
    ["wall_ball"],
    "For Time",
    "150 répétitions, découpe en séries.",
    [m("150", "Wall ball", "9/6 kg", "6/4 kg")],
    {cap: 15}
  ),
  B(
    "jackie",
    "Jackie",
    "Girl",
    "time",
    10,
    ["rameur", "barre", "traction"],
    "For Time",
    "Dans l'ordre, le plus vite possible.",
    [m("1000 m", "Rameur"), m("50", "Thruster", "20/15 kg", "15/10 kg"), m("30", "Pull-up", null, "ring rows")],
    {cap: 15}
  ),
  B(
    "nancy",
    "Nancy",
    "Girl",
    "time",
    15,
    ["course", "barre"],
    "5 tours For Time",
    "5 tours, le plus vite possible.",
    [m("400 m", "Run"), m("15", "Overhead squat", "43/30 kg", "29/20 kg")],
    {cap: 20}
  ),
  B(
    "kelly",
    "Kelly",
    "Girl",
    "time",
    25,
    ["course", "box", "wall_ball"],
    "5 tours For Time",
    "5 tours, le plus vite possible.",
    [m("400 m", "Run"), m("30", "Box jump", "60/50 cm", "step-ups"), m("30", "Wall ball", "9/6 kg", "6/4 kg")],
    {cap: 30}
  ),
  B(
    "cindy",
    "Cindy",
    "Girl",
    "reps",
    20,
    ["traction"],
    "AMRAP 20 min",
    "Le plus de tours possible en 20 minutes.",
    [m("5", "Pull-up", null, "ring rows"), m("10", "Push-up", null, "sur les genoux"), m("15", "Air squat")],
    {round_reps: 30}
  ),
  B(
    "mary",
    "Mary",
    "Girl",
    "reps",
    20,
    ["traction"],
    "AMRAP 20 min",
    "Le plus de tours possible en 20 minutes.",
    [
      m("5", "Handstand push-up", null, "pike push-ups"),
      m("10", "Pistol", null, "pistols sur box"),
      m("15", "Pull-up", null, "ring rows"),
    ],
    {round_reps: 30}
  ),
  B(
    "angie",
    "Angie",
    "Girl",
    "time",
    22,
    ["traction"],
    "For Time",
    "Chaque mouvement terminé avant le suivant.",
    [
      m("100", "Pull-up", null, "ring rows"),
      m("100", "Push-up", null, "sur les genoux"),
      m("100", "Sit-up"),
      m("100", "Air squat"),
    ],
    {cap: 30}
  ),
  B(
    "barbara",
    "Barbara",
    "Girl",
    "time",
    35,
    ["traction"],
    "5 tours For Time",
    "5 tours, 3 minutes de repos entre les tours.",
    [
      m("20", "Pull-up", null, "ring rows"),
      m("30", "Push-up", null, "sur les genoux"),
      m("40", "Sit-up"),
      m("50", "Air squat"),
    ],
    {cap: 45}
  ),
  B(
    "amanda",
    "Amanda",
    "Girl",
    "time",
    10,
    ["anneaux", "barre"],
    "9-7-5",
    "Le plus vite possible.",
    [m(null, "Muscle-up", null, "2 pull-ups + 2 dips par muscle-up"), m(null, "Squat snatch", "61/43 kg", "40/30 kg")],
    {cap: 15}
  ),
  B(
    "eva",
    "Eva",
    "Girl",
    "time",
    45,
    ["course", "kb", "traction"],
    "5 tours For Time",
    "5 tours, le plus vite possible.",
    [m("800 m", "Run"), m("30", "Kettlebell swing", "32/24 kg", "24/16 kg"), m("30", "Pull-up", null, "ring rows")],
    {cap: 60}
  ),
  B(
    "murph",
    "Murph",
    "Hero",
    "time",
    50,
    ["course", "traction"],
    "For Time",
    "Gilet de 9/6 kg si possible. Pull-ups, push-ups et squats peuvent être partagés en tours (ex. 20 x 5-10-15).",
    [
      m("1,6 km", "Run"),
      m("100", "Pull-up", null, "ring rows"),
      m("200", "Push-up", null, "sur les genoux"),
      m("300", "Air squat"),
      m("1,6 km", "Run"),
    ],
    {cap: 70}
  ),
  B(
    "dt",
    "DT",
    "Hero",
    "time",
    12,
    ["barre"],
    "5 tours For Time",
    "5 tours, la même barre pour les trois mouvements.",
    [
      m("12", "Deadlift", "70/47 kg", "50/35 kg"),
      m("9", "Hang power clean", "70/47 kg", "50/35 kg"),
      m("6", "Push jerk", "70/47 kg", "50/35 kg"),
    ],
    {cap: 20}
  ),
  B(
    "jt",
    "JT",
    "Hero",
    "time",
    12,
    ["anneaux"],
    "21-15-9",
    "Le plus vite possible.",
    [
      m(null, "Handstand push-up", null, "pike push-ups"),
      m(null, "Ring dip", null, "dips sur box"),
      m(null, "Push-up", null, "sur les genoux"),
    ],
    {cap: 15}
  ),
  B(
    "randy",
    "Randy",
    "Hero",
    "time",
    8,
    ["barre"],
    "For Time",
    "75 répétitions, le plus vite possible.",
    [m("75", "Power snatch", "34/25 kg", "25/15 kg")],
    {cap: 15}
  ),
  B(
    "nate",
    "Nate",
    "Hero",
    "reps",
    20,
    ["anneaux", "kb"],
    "AMRAP 20 min",
    "Le plus de tours possible en 20 minutes.",
    [
      m("2", "Muscle-up", null, "4 pull-ups + 4 dips"),
      m("4", "Handstand push-up", null, "pike push-ups"),
      m("8", "Kettlebell swing", "32/24 kg", "24/16 kg"),
    ],
    {round_reps: 14}
  ),
];
export const benchmarkById = id => BENCHMARKS.find(b => b.id === id) || null;

// Benchmark au format des WOD générés : échauffement, puis le WOD (version adaptée sous chaque mouvement).
export function benchmarkWod(b) {
  return {
    titre: b.name + " (benchmark " + b.kind + ")",
    duree_estimee_min: b.minutes + WARMUP.duree_min,
    blocs: [
      WARMUP,
      {
        type: "metcon",
        duree_min: b.score === "reps" ? b.minutes : null,
        format: b.format,
        time_cap_min: b.cap,
        description: b.description,
        mouvements: b.mouvements,
      },
    ],
    objectif_score:
      b.score === "reps"
        ? "Note tes tours et répétitions (" + b.round_reps + " rép. par tour)."
        : "Note ton temps, et si tu l'as fait Rx ou Scaled.",
    notes_coach: null,
  };
}
// Liste envoyée à l'application (tirage au sort, aperçu, page PR) : gardée sur le téléphone pour le hors-ligne.
export function benchmarkOut(b) {
  return {
    id: b.id,
    name: b.name,
    kind: b.kind,
    score: b.score,
    round_reps: b.round_reps,
    minutes: b.minutes,
    equipment: b.equipment,
    places: Object.keys(BENCHMARK_PLACES).filter(
      p => !BENCHMARK_PLACES[p] || b.equipment.every(x => BENCHMARK_PLACES[p].includes(x))
    ),
    content: wodToText(benchmarkWod(b)),
    chrono: dailyChrono(b.chrono),
  };
}
// Mouvements du catalogue cités dans le benchmark (cochés par défaut dans la séance).
export const benchmarkMovementIds = (b, catalog) => dailyMovementIds(benchmarkWod(b), catalog);

// Score d'un benchmark : temps en secondes (1 s à 24 h) ou répétitions (AMRAP, total des tours et répétitions).
export function benchmarkScore(b, raw) {
  const v = Number(raw);
  if (b.score === "time" && (!Number.isInteger(v) || v < 1 || v > 86400)) return {error: "Temps invalide."};
  if (b.score === "reps" && (!Number.isInteger(v) || v < 1 || v > 100000))
    return {error: "Le score doit être un nombre entier de répétitions."};
  return {value: v};
}
