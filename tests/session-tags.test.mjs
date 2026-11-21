// Partenaires tagués sur une séance : recherche, invitation, acceptation (copie indépendante), refus, contrôles.
import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import {startWorker, client, ADMIN_EMAIL, today, mondayOf, addDays} from "./helpers.mjs";

const PASSWORD = "MotDePasse-Test-123";
let worker, alice, bob, carol, ids, activityId, squatId;
const weekData = async who => {
  const week = mondayOf(today());
  return (await who.get(`/week-data?from=${week}&to=${addDays(week, 6)}`)).data;
};

before(async () => {
  worker = await startWorker();
  const admin = client(worker.base);
  alice = client(worker.base);
  bob = client(worker.base);
  carol = client(worker.base);
  await admin.post("/register", {email: ADMIN_EMAIL, password: PASSWORD});
  await admin.post("/admin/movements", {name: "Back squat", measurement_method: "load"});
  ids = {};
  for (const [who, email, first, last] of [
    [alice, "alice@test.local", "Alice", "Martin"],
    [bob, "bob@test.local", "Bob", "Durand"],
    [carol, "carol@test.local", "Carol", "Petit"],
  ]) {
    await who.post("/register", {email, password: PASSWORD});
    ids[first] = (await who.put("/profile", {first_name: first, last_name: last})).data.user.id;
  }
  activityId = (await alice.get("/activities")).data.activities[0].id;
  squatId = (await alice.get("/movement-catalog")).data.movements.find(m => m.name === "Back squat").id;
});
after(() => worker?.stop());

const session = extra => ({
  program_id: "none",
  wod_id: "other",
  session_date: today(),
  activity_id: activityId,
  duration_minutes: 45,
  actual_comment: "5 x 5 back squat",
  movement_ids: [],
  catalog_movement_ids: [squatId],
  ...extra,
});

test("partenaires : recherche par nom, sans e-mail ni soi-même", async () => {
  const r = (await alice.get("/users/search?q=dur")).data.users;
  assert.deepEqual(
    r.map(x => [x.first_name, x.last_name]),
    [["Bob", "Durand"]]
  );
  assert.equal(r[0].email, undefined, "pas d'adresse e-mail");
  assert.equal((await alice.get("/users/search?q=alice")).data.users.length, 0, "pas soi-même");
  assert.equal((await alice.get("/users/search?q=a")).data.users.length, 0, "2 caractères au moins");
  assert.equal((await alice.get("/users/search?q=%25")).data.users.length, 0, "joker échappé");
});

let tagId, sessionId;
test("partenaires : invitation, acceptation et copie indépendante", async () => {
  const saved = await alice.post("/sessions", session({tagged_user_ids: [ids.Bob, ids.Alice, "inconnu"]}));
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  sessionId = saved.data.id;
  const mine = await weekData(alice);
  assert.deepEqual(
    mine.tags.map(t => [t.to_user_id, t.status]),
    [[ids.Bob, "pending"]],
    "ni soi-même ni compte inconnu"
  );
  const pending = (await bob.get("/session-tags")).data.tags;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].first_name, "Alice");
  tagId = pending[0].id;
  assert.equal((await carol.get("/session-tags")).data.tags.length, 0);
  assert.equal((await carol.post(`/session-tags/${tagId}/accept`)).status, 404, "pas l'invitation d'un autre");

  const accepted = await bob.post(`/session-tags/${tagId}/accept`);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal((await bob.post(`/session-tags/${tagId}/accept`)).status, 404, "déjà traitée");
  const bobWeek = await weekData(bob);
  const copy = bobWeek.sessions.find(s => s.id === accepted.data.id);
  assert.ok(copy, "séance copiée dans l'historique du partenaire");
  assert.equal(copy.actual_comment, "5 x 5 back squat");
  assert.equal(copy.shared_from_first_name, "Alice");
  assert.deepEqual(
    bobWeek.catalogChecks.filter(c => c.session_id === copy.id).map(c => c.catalog_movement_id),
    [squatId]
  );
  assert.equal((await bob.get("/session-tags")).data.tags.length, 0);
  assert.equal((await weekData(alice)).tags[0].status, "accepted");

  // La copie appartient au partenaire : la modifier ou la supprimer ne touche pas la séance de l'auteur.
  assert.equal((await bob.put("/sessions/" + copy.id, session({actual_comment: "Modifié"}))).status, 200);
  assert.equal((await bob.del("/sessions/" + copy.id)).status, 200);
  const original = (await weekData(alice)).sessions.find(s => s.id === sessionId);
  assert.equal(original.actual_comment, "5 x 5 back squat");
  assert.equal((await alice.del("/sessions/" + copy.id)).status, 200);
  assert.equal((await weekData(bob)).sessions.length, 0);
});

test("partenaires : refus et retrait d'une invitation en attente", async () => {
  assert.equal(
    (await alice.put("/sessions/" + sessionId, session({tagged_user_ids: [ids.Bob, ids.Carol]}))).status,
    200
  );
  const carolTag = (await carol.get("/session-tags")).data.tags[0];
  assert.ok(carolTag);
  assert.equal((await carol.post(`/session-tags/${carolTag.id}/decline`)).status, 200);
  assert.equal((await carol.get("/session-tags")).data.tags.length, 0);
  assert.equal((await weekData(carol)).sessions.length, 0, "rien d'enregistré après un refus");
  // Nouvelle invitation retirée avant réponse ; l'invitation acceptée de Bob reste.
  const dave = client(worker.base);
  await dave.post("/register", {email: "dave@test.local", password: PASSWORD});
  const daveId = (await dave.put("/profile", {first_name: "Dave", last_name: "Roux"})).data.user.id;
  await alice.put("/sessions/" + sessionId, session({tagged_user_ids: [ids.Bob, ids.Carol, daveId]}));
  assert.equal((await dave.get("/session-tags")).data.tags.length, 1);
  await alice.put("/sessions/" + sessionId, session({tagged_user_ids: []}));
  assert.equal((await dave.get("/session-tags")).data.tags.length, 0, "invitation en attente retirée");
  assert.deepEqual(
    (await weekData(alice)).tags.map(t => t.status).sort(),
    ["accepted", "declined"],
    "les réponses déjà données restent"
  );
});
