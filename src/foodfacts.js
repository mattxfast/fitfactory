// Produits emballés : fiche Open Food Facts lue par code-barres (base ouverte, licence ODbL), réduite aux champs utiles
// (nom, marque, portion, valeurs pour 100 g, Nutri-Score, groupe NOVA). Le Worker garde chaque fiche 30 jours en base.

export const FOOD_CACHE_DAYS = 30;
const FIELDS = [
  "code",
  "product_name",
  "product_name_fr",
  "generic_name_fr",
  "brands",
  "quantity",
  "serving_size",
  "serving_quantity",
  "nutriments",
  "nutriscore_grade",
  "nova_group",
].join(",");
// Identification demandée par Open Food Facts : nom de l'application et adresse (aucune donnée personnelle).
const USER_AGENT = "myFitFactory/1.0 (+https://myfitfactory.mattxfast.workers.dev)";

// Code-barres EAN-8, UPC-A, EAN-13 ou GTIN-14 : 8 à 14 chiffres.
export const validBarcode = s => /^\d{8,14}$/.test(String(s || ""));

const text = (v, max) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
// Valeur pour 100 g : nombre positif arrondi au centième (sel, fibres), null si absente.
const per100 = v => {
  const n = Number(v);
  return v !== "" && v !== null && v !== undefined && Number.isFinite(n) && n >= 0 && n < 10000
    ? Math.round(n * 100) / 100
    : null;
};

// Fiche réduite (format de l'API myFitFactory). Énergie en kcal (convertie depuis les kJ si besoin), sel déduit du
// sodium si besoin. Une valeur absente reste null : l'utilisateur sait qu'elle manque sur l'étiquette.
export function productFrom(code, p) {
  const n = p.nutriments || {},
    kj = per100(n["energy-kj_100g"] ?? n["energy_100g"]),
    kcal = per100(n["energy-kcal_100g"]) ?? (kj === null ? null : Math.round((kj / 4.184) * 100) / 100),
    sodium = per100(n.sodium_100g),
    serving = Number(p.serving_quantity),
    grade = String(p.nutriscore_grade || "").toLowerCase(),
    nova = Number(p.nova_group);
  return {
    barcode: code,
    name: text(p.product_name_fr || p.product_name || p.generic_name_fr, 100) || "Produit " + code,
    brand: text(String(p.brands || "").split(",")[0], 60),
    quantity: text(p.quantity, 40),
    serving_size: text(p.serving_size, 40),
    serving_g: Number.isFinite(serving) && serving > 0 && serving < 5000 ? Math.round(serving * 10) / 10 : null,
    nutriscore: /^[a-e]$/.test(grade) ? grade : "",
    nova: [1, 2, 3, 4].includes(nova) ? nova : null,
    per100: {
      kcal,
      protein_g: per100(n.proteins_100g),
      carbs_g: per100(n.carbohydrates_100g),
      sugars_g: per100(n.sugars_100g),
      fat_g: per100(n.fat_100g),
      sat_fat_g: per100(n["saturated-fat_100g"]),
      fiber_g: per100(n.fiber_100g),
      salt_g: per100(n.salt_100g) ?? (sodium === null ? null : Math.round(sodium * 2.5 * 100) / 100),
    },
  };
}

// Lecture d'une fiche sur Open Food Facts : {product}, {missing: true} ou {error}.
export async function fetchProduct(env, code) {
  const base = String(env.OFF_API_URL || "https://world.openfoodfacts.org");
  let res;
  try {
    res = await fetch(base + "/api/v2/product/" + code + ".json?fields=" + FIELDS, {
      headers: {"user-agent": USER_AGENT, accept: "application/json"},
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return {error: "Open Food Facts ne répond pas. Réessaie dans un instant."};
  }
  const data = await res.json().catch(() => null);
  if (res.status === 404 || (data && data.status === 0)) return {missing: true};
  if (!res.ok || !data?.product) {
    console.error("Open Food Facts", res.status);
    return {error: "Open Food Facts a renvoyé une erreur (" + res.status + ")."};
  }
  return {product: productFrom(code, data.product)};
}
