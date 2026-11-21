// Interface du compte (avancée ou simplifiée) : préférence enregistrée par utilisateur, valeur contrôlée.
import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import {startWorker, client} from "./helpers.mjs";

let worker, alice, bob;
before(async () => {
  worker = await startWorker();
  alice = client(worker.base);
  bob = client(worker.base);
  await alice.post("/register", {email: "alice@test.local", password: "MotDePasse-Test-123"});
  await bob.post("/register", {email: "bob@test.local", password: "MotDePasse-Test-123"});
});
after(() => worker?.stop());

test("interface : avancée par défaut, simplifiée au choix, valeur inconnue refusée", async () => {
  assert.equal((await alice.get("/preferences")).data.interface, "advanced");
  assert.equal((await alice.put("/preferences", {interface: "expert"})).status, 400);
  assert.equal((await alice.put("/preferences", {interface: "simple", theme: "light"})).status, 200);
  const prefs = (await alice.get("/preferences")).data;
  assert.equal(prefs.interface, "simple");
  assert.equal(prefs.theme, "light");
  assert.equal((await bob.get("/preferences")).data.interface, "advanced", "chacun son interface");
  assert.equal((await alice.put("/preferences", {interface: "advanced"})).status, 200);
  assert.equal((await alice.get("/preferences")).data.interface, "advanced");
});
