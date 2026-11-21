// WOD de référence (benchmarks) : liste, WOD du jour tiré de la liste (sans IA), score de la séance, résultats PR.
import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {startWorker, client, ADMIN_EMAIL, today, mondayOf, addDays} from "./helpers.mjs";

const PASSWORD = "MotDePasse-Test-123";
let worker, admin, alice, bob, activityId;

before(async () => {
  worker = await startWorker();
  admin = client(worker.base);
  alice = client(worker.base);
  bob = client(worker.base);
  await admin.post("/register", {email: ADMIN_EMAIL, password: PASSWORD});
  await alice.post("/register", {email: "alice@test.local", password: PASSWORD});
  await bob.post("/register", {email: "bob@test.local", password: PASSWORD});
  for (const name of ["Thruster", "Pull-up"]) await admin.post("/admin/movements", {name, measurement_method: "load"});
  activityId = (await alice.get("/activities")).data.activities[0].id;
});
after(() => worker?.stop());

test("benchmarks : liste avec contenu, lieux et chrono", async () => {
  const list = (await alice.get("/benchmarks")).data.benchmarks;
  assert.ok(list.length >= 20);
  const fran = list.find(b => b.id === "fran"),
    cindy = list.find(b => b.id === "cindy");
  assert.equal(fran.score, "time");
  assert.match(fran.content, /^Fran \(benchmark Girl\)/);
  assert.match(fran.content, /• Thruster @ 43\/30 kg\n   ↳ adapté : 29\/20 kg/);
  assert.deepEqual(fran.places, ["box"]);
  assert.equal(fran.chrono.mode, "fortime");
  assert.equal(cindy.round_reps, 30);
  assert.ok(cindy.places.includes("peu") && cindy.places.includes("exterieur"));
  assert.equal(cindy.chrono.mode, "amrap");
});

test("benchmarks : WOD du jour tiré de la liste, séance avec score, suivi dans les PR", async () => {
  const cid = randomUUID();
  assert.equal((await alice.post("/daily-wods/benchmark", {benchmark_id: "inconnu", wod_date: today()})).status, 400);
  assert.equal(
    (await alice.post("/daily-wods/benchmark", {benchmark_id: "fran", wod_date: addDays(today(), 3)})).status,
    400
  );
  const created = await alice.post("/daily-wods/benchmark", {client_id: cid, benchmark_id: "fran", wod_date: today()});
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal(created.data.wod.id, cid);
  assert.equal(created.data.wod.title, "Fran");
  assert.equal(created.data.wod.benchmark_id, "fran");
  assert.equal(created.data.wod.score_type, "time");
  assert.equal(created.data.wod.movement_ids.length, 2, "Thruster et Pull-up reconnus");
  // rejeu hors ligne : pas de doublon ; un autre compte ne peut pas reprendre l'identifiant
  assert.equal(
    (await alice.post("/daily-wods/benchmark", {client_id: cid, benchmark_id: "fran", wod_date: today()})).data.wod.id,
    cid
  );
  assert.equal(
    (await bob.post("/daily-wods/benchmark", {client_id: cid, benchmark_id: "fran", wod_date: today()})).status,
    409
  );
  const week = `/week-data?from=${mondayOf(today())}&to=${addDays(mondayOf(today()), 6)}`;
  assert.equal((await alice.get(week)).data.dailyWods.filter(w => w.id === cid).length, 1);
  // séance : score en secondes, Scaled
  const body = extra => ({
    program_id: "none",
    wod_id: "other",
    daily_wod_id: cid,
    session_date: today(),
    activity_id: activityId,
    duration_minutes: 30,
    movement_ids: [],
    catalog_movement_ids: [],
    ...extra,
  });
  assert.equal((await alice.post("/sessions", body({score_value: 12.5}))).status, 400);
  const session = await alice.post("/sessions", body({score_value: 372, score_scaled: true}));
  assert.equal(session.status, 200, JSON.stringify(session.data));
  const listed = (await alice.get(week)).data.sessions.find(s => s.id === session.data.id);
  assert.equal(listed.score_type, "time");
  assert.equal(listed.benchmark_id, "fran");
  assert.equal(listed.score_scaled, 1);
  // résultat saisi à la main dans les PR, puis liste : séance + saisie
  assert.equal(
    (await alice.post("/benchmark-results", {benchmark_id: "fran", result_date: today(), value: -3})).status,
    400
  );
  assert.equal(
    (await alice.post("/benchmark-results", {benchmark_id: "fran", result_date: addDays(today(), 1), value: 300}))
      .status,
    400
  );
  const manual = await alice.post("/benchmark-results", {
    client_id: randomUUID(),
    benchmark_id: "fran",
    result_date: addDays(today(), -30),
    value: 410,
    scaled: false,
  });
  assert.equal(manual.status, 200, JSON.stringify(manual.data));
  const results = (await alice.get("/benchmark-results")).data.results.filter(x => x.benchmark_id === "fran");
  assert.deepEqual(results.map(x => [x.source, x.value, x.scaled]).sort(), [
    ["manual", 410, 0],
    ["session", 372, 1],
  ]);
  assert.equal((await bob.get("/benchmark-results")).data.results.length, 0);
  // suppression : seulement ses propres résultats
  await bob.del(`/benchmark-results/${manual.data.id}`);
  assert.equal((await alice.get("/benchmark-results")).data.results.filter(x => x.source === "manual").length, 1);
  assert.equal((await alice.del(`/benchmark-results/${manual.data.id}`)).status, 200);
  assert.equal((await alice.get("/benchmark-results")).data.results.filter(x => x.source === "manual").length, 0);
});
