// Produits scannés : fiche Open Food Facts par code-barres (faux service local), cache, repas mixtes avec l'IA.
import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {startWorker, client, today} from "./helpers.mjs";

const PASSWORD = "MotDePasse-Test-123";
const PRODUCTS = {
  // Yaourt : énergie en kcal, sel donné, portion connue.
  3000000000017: {
    code: "3000000000017",
    product_name: "Yaourt nature",
    product_name_fr: "Yaourt nature au lait entier",
    brands: "Laiterie Test, Autre marque",
    quantity: "4 x 125 g",
    serving_size: "125 g",
    serving_quantity: "125",
    nutriscore_grade: "A",
    nova_group: 1,
    image_front_small_url: "https://images.openfoodfacts.org/images/products/300/front_fr.200.jpg",
    nutriments: {
      "energy-kcal_100g": 61,
      proteins_100g: 3.6,
      carbohydrates_100g: 4.4,
      sugars_100g: 4.4,
      fat_100g: 3.2,
      "saturated-fat_100g": 2.1,
      salt_100g: 0.13,
    },
  },
  // Biscuit : énergie en kJ seulement, sodium au lieu du sel, groupe NOVA 4.
  3000000000024: {
    product_name: "Biscuit chocolat",
    nutriscore_grade: "unknown",
    nova_group: "4",
    image_front_small_url: "https://exemple.test/image.jpg",
    nutriments: {energy_100g: 2092, proteins_100g: 6, fat_100g: 24, sodium_100g: 0.2, fiber_100g: ""},
  },
};
let worker,
  off,
  openai,
  offCalls = [],
  aiCalls = [],
  alice;

const json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(data));
};
before(async () => {
  off = createServer((req, res) => {
    offCalls.push({url: req.url, ua: req.headers["user-agent"]});
    const code = req.url.match(/^\/api\/v2\/product\/(\d+)\.json/)?.[1];
    if (code === "3000000000031") return json(res, 500, {});
    if (!PRODUCTS[code]) return json(res, 404, {status: 0, status_verbose: "product not found"});
    json(res, 200, {status: 1, product: PRODUCTS[code]});
  });
  openai = createServer((req, res) => {
    let raw = "";
    req.on("data", c => (raw += c));
    req.on("end", () => {
      aiCalls.push(JSON.parse(raw));
      const meal = {titre: "Salade", aliments: [], confiance: "moyenne", remarques: null};
      json(res, 200, {output: [{type: "message", content: [{type: "output_text", text: JSON.stringify(meal)}]}]});
    });
  });
  await new Promise(r => off.listen(0, "127.0.0.1", r));
  await new Promise(r => openai.listen(0, "127.0.0.1", r));
  worker = await startWorker(undefined, {
    OFF_API_URL: `http://127.0.0.1:${off.address().port}`,
    OPENAI_API_KEY: "cle-de-test",
    OPENAI_API_URL: `http://127.0.0.1:${openai.address().port}/v1/responses`,
  });
  alice = client(worker.base);
  await alice.post("/register", {email: "alice@test.local", password: PASSWORD});
});
after(() => {
  worker?.stop();
  off?.close();
  openai?.close();
});

test("Produits : contrôles d'accès et de saisie", async () => {
  assert.equal((await client(worker.base).get("/food-products/3000000000017")).status, 401);
  assert.equal((await alice.get("/food-products/1234567")).status, 400, "8 chiffres au moins");
  assert.equal((await alice.get("/food-products/30000000000a7")).status, 400);
  assert.equal((await alice.get("/food-products/123456789012345")).status, 400, "14 chiffres au plus");
  assert.equal(offCalls.length, 0, "aucun appel à Open Food Facts pour un code invalide");
});

test("Produits : fiche réduite, puis servie depuis la base", async () => {
  const res = await alice.get("/food-products/3000000000017");
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data.product, {
    barcode: "3000000000017",
    name: "Yaourt nature au lait entier",
    brand: "Laiterie Test",
    quantity: "4 x 125 g",
    serving_size: "125 g",
    serving_g: 125,
    nutriscore: "a",
    nova: 1,
    per100: {
      kcal: 61,
      protein_g: 3.6,
      carbs_g: 4.4,
      sugars_g: 4.4,
      fat_g: 3.2,
      sat_fat_g: 2.1,
      fiber_g: null,
      salt_g: 0.13,
    },
  });
  assert.match(offCalls[0].url, /^\/api\/v2\/product\/3000000000017\.json\?fields=/);
  assert.match(offCalls[0].ua, /^myFitFactory\//, "application identifiée auprès d'Open Food Facts");
  const again = await alice.get("/food-products/3000000000017");
  assert.deepEqual(again.data, res.data);
  assert.equal(offCalls.length, 1, "deuxième lecture servie depuis la base");

  const biscuit = (await alice.get("/food-products/3000000000024")).data.product;
  assert.equal(biscuit.name, "Biscuit chocolat");
  assert.equal(biscuit.per100.kcal, 500, "kJ convertis en kcal");
  assert.equal(biscuit.per100.salt_g, 0.5, "sel déduit du sodium");
  assert.equal(biscuit.per100.fiber_g, null);
  assert.equal(biscuit.nutriscore, "");
  assert.equal(biscuit.nova, 4);
  assert.equal(biscuit.serving_g, null);

  const missing = await alice.get("/food-products/3000000000048");
  assert.equal(missing.status, 404);
  assert.match(missing.data.error, /introuvable/);
  assert.equal((await alice.get("/food-products/3000000000031")).status, 502);
});

test("Produits : repas avec un produit scanné, sans analyse par l'IA", async () => {
  const day = today(),
    items = [
      {
        name: "Yaourt nature au lait entier",
        quantity: "1 portion (125 g)",
        grams: 125,
        kcal: 76.3,
        protein_g: 4.5,
        source: "off",
        barcode: "3000000000017",
        nutriscore: "a",
        nova: 1,
      },
      {name: "Biscuit", quantity: "30 g", grams: 30, kcal: 150, source: "off", barcode: "abc", nova: 7},
      {name: "Pomme", quantity: "1", grams: 150, kcal: 78, source: "off", barcode: "3000000000055", nova: 9},
    ],
    res = await alice.post("/meals", {meal_date: day, meal_time: "16:00", title: "Goûter", items});
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const meal = (await alice.get(`/meals?from=${day}&to=${day}`)).data.meals[0];
  assert.equal(meal.kcal, 304.3);
  assert.equal(meal.items[0].source, "off");
  assert.equal(meal.items[0].barcode, "3000000000017");
  assert.equal(meal.items[0].nutriscore, "a");
  assert.equal(meal.items[0].nova, 1);
  assert.equal(meal.items[1].source, undefined, "code-barres invalide : aliment ordinaire");
  assert.equal(meal.items[2].nova, null, "groupe NOVA hors 1 à 4 écarté");
  assert.equal(aiCalls.length, 0);
});

test("Produits : l'IA ne reprend pas les produits déjà comptés", async () => {
  const res = await alice.post("/meal-analysis", {
    items: [{name: "Salade verte", quantity: "1 bol"}],
    known: [{name: "Yaourt nature au lait entier", quantity: "125 g"}],
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const prompt = aiCalls.at(-1).input[0].content[0].text;
  assert.match(prompt, /## Produits déjà comptés \(ne pas inclure\)\n- Yaourt nature au lait entier : 125 g/);
  assert.match(aiCalls.at(-1).instructions, /produits déjà comptés/);
});
