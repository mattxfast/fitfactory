// FitFactory — produits scannés : lecture du code-barres à la caméra (ou saisie du code), fiche Open Food Facts (via le
// Worker, gardée sur le téléphone pour le hors ligne), quantité en grammes ou en portions, ajout au repas en cours.
// Scripts classiques chargés dans l’ordre par index.html (portée globale partagée) ; boot.js démarre l’application en dernier.
// Lecteur : BarcodeDetector du navigateur s’il existe (Android), sinon zxing-wasm hébergé dans public/vendor/ (iPhone),
// chargé seulement au premier scan.

const OFF_CREDIT = "Données produits : Open Food Facts (licence ODbL).",
  SCAN_FORMATS = ["EAN13", "EAN8", "UPCA", "UPCE"],
  NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"],
  ZXING_DIR = "/vendor/zxing-wasm/";
let scanStream = null,
  // Caméra voulue : faux dès qu’on ferme la fenêtre ou qu’on tape le code (même si la caméra est encore en démarrage).
  scanCameraWanted = false,
  scanTimer = null,
  scanProduct = null,
  zxingReady = null;

// Pastilles Nutri-Score (A à E) et NOVA (1 à 4) d’un produit ou d’un aliment scanné.
function foodBadges(x) {
  return (
    (x.nutriscore
      ? `<span class="nutriscore nutriscore-${esc(x.nutriscore)}" title="Nutri-Score ${esc(x.nutriscore.toUpperCase())}">Nutri-Score ${esc(x.nutriscore.toUpperCase())}</span>`
      : "") +
    (x.nova
      ? `<span class="nova nova-${Number(x.nova)}" title="Groupe NOVA ${Number(x.nova)} : ${esc(NOVA_LABELS[x.nova])}">NOVA ${Number(x.nova)}</span>`
      : "")
  );
}
const NOVA_LABELS = {
  1: "aliment pas ou peu transformé",
  2: "ingrédient culinaire",
  3: "aliment transformé",
  4: "produit ultra-transformé",
};

function loadZxing() {
  if (!zxingReady)
    zxingReady = new Promise((ok, ko) => {
      const script = document.createElement("script");
      script.src = ZXING_DIR + "zxing-reader.js";
      script.onload = () => {
        // Le fichier .wasm est servi par l’application (jamais par un CDN).
        ZXingWASM.prepareZXingModule({
          overrides: {locateFile: (path, prefix) => (path.endsWith(".wasm") ? ZXING_DIR + path : prefix + path)},
        });
        ok();
      };
      script.onerror = () => {
        zxingReady = null;
        ko(Error("Lecteur de code-barres indisponible : saisis le code à la main."));
      };
      document.head.append(script);
    });
  return zxingReady;
}
// Fonction de lecture d’une image de la vidéo : renvoie le code lu ou rien.
async function barcodeReader() {
  if ("BarcodeDetector" in window)
    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      if (supported.includes("ean_13")) {
        const detector = new BarcodeDetector({formats: NATIVE_FORMATS.filter(f => supported.includes(f))});
        return async video => (await detector.detect(video))[0]?.rawValue;
      }
    } catch {}
  await loadZxing();
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d", {willReadFrequently: true});
  return async video => {
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const results = await ZXingWASM.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), {
      formats: SCAN_FORMATS,
      tryHarder: true,
      maxNumberOfSymbols: 1,
    });
    return results.find(r => r.isValid)?.text;
  };
}
function stopCamera() {
  scanCameraWanted = false;
  clearTimeout(scanTimer);
  scanTimer = null;
  scanStream?.getTracks().forEach(t => t.stop());
  scanStream = null;
  $("#scancamera").hidden = true;
  $("#scancamera video").srcObject = null;
}
async function startCamera() {
  const status = $("#scanstatus");
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = "Caméra indisponible sur cet appareil : saisis le code-barres.";
    return;
  }
  scanCameraWanted = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {facingMode: {ideal: "environment"}, width: {ideal: 1280}},
      audio: false,
    });
  } catch {
    if (scanCameraWanted) status.textContent = "Accès à la caméra refusé : saisis le code-barres à la main.";
    scanCameraWanted = false;
    return;
  }
  if (!scanCameraWanted || !$("#scandialog").open) return stream.getTracks().forEach(t => t.stop());
  scanStream = stream;
  const video = $("#scancamera video");
  video.srcObject = stream;
  $("#scancamera").hidden = false;
  status.textContent = "Place le code-barres dans le cadre.";
  try {
    await video.play();
    const read = await barcodeReader();
    const tick = async () => {
      if (scanStream !== stream) return;
      let code = null;
      try {
        if (video.readyState >= 2 && video.videoWidth) code = await read(video);
      } catch {}
      if (scanStream !== stream) return;
      if (code) {
        stopCamera();
        navigator.vibrate?.(60);
        lookupProduct(code);
      } else scanTimer = setTimeout(tick, 250);
    };
    tick();
  } catch (e) {
    stopCamera();
    status.textContent = e.message || "Lecture impossible : saisis le code-barres.";
  }
}
function openScan() {
  const form = $("#scanform");
  form.reset();
  scanProduct = null;
  $("#scanproduct").hidden = true;
  $("#scanerror").textContent = "";
  $("#scanstatus").textContent = "";
  $("#scancredit").textContent = OFF_CREDIT;
  renderScanQuantity();
  $("#scandialog").showModal();
  startCamera();
}
// Code-barres UPC-A (12 chiffres) : même produit que l’EAN-13 précédé d’un zéro.
const normalizeBarcode = code => {
  const digits = String(code || "").replace(/\D/g, "");
  return digits.length === 12 ? "0" + digits : digits;
};
async function lookupProduct(raw) {
  const code = normalizeBarcode(raw);
  $("#scanerror").textContent = "";
  $("#scanform").elements.barcode.value = code;
  if (!/^\d{8,14}$/.test(code)) {
    $("#scanerror").textContent = "Code-barres invalide : 8 à 14 chiffres.";
    return;
  }
  $("#scanstatus").textContent = "Recherche du produit…";
  try {
    scanProduct = (await api("/food-products/" + code)).product;
    $("#scanstatus").textContent = "";
  } catch (e) {
    scanProduct = null;
    $("#scanstatus").textContent = "";
    $("#scanerror").textContent =
      e.status === 404
        ? "Produit introuvable dans Open Food Facts : ajoute-le comme aliment à analyser par l’IA."
        : e.message;
  }
  renderScanProduct();
}
function renderScanProduct() {
  const p = scanProduct,
    f = $("#scanform").elements;
  $("#scanproduct").hidden = !p;
  if (!p) return renderScanQuantity();
  const v = p.per100,
    value = (x, unit) =>
      x === null ? "?" : (unit === "kcal" ? kcalText(x) : gramText(x)) + (unit === "kcal" ? " kcal" : ""),
    missing = ["kcal", "protein_g", "carbs_g", "fat_g"].some(k => v[k] === null);
  $("#scanproductinfo").innerHTML =
    `<b>${esc(p.name)}</b><small>${esc([p.brand, p.quantity].filter(Boolean).join(" · "))}</small><div class="food-badges">${foodBadges(p)}</div><p class="meal-extra">Pour 100 g : ${value(v.kcal, "kcal")} · P ${value(v.protein_g)} · G ${value(v.carbs_g)} · L ${value(v.fat_g)}</p>${missing ? `<p class="hint">Valeurs manquantes sur la fiche (?) : comptées à 0.</p>` : ""}`;
  // Portion connue : quantité en portions par défaut ; sinon en grammes.
  f.unit.innerHTML =
    `<option value="g">Grammes</option>` +
    (p.serving_g ? `<option value="portion">Portion (${esc(p.serving_g.toLocaleString("fr-FR"))} g)</option>` : "");
  f.unit.value = p.serving_g ? "portion" : "g";
  f.amount.value = p.serving_g ? 1 : 100;
  renderScanQuantity();
}
// Aliment calculé à partir de la fiche et de la quantité choisie (valeur absente comptée à 0).
function scannedItem() {
  const p = scanProduct,
    f = $("#scanform").elements,
    amount = Number(String(f.amount.value).replace(",", "."));
  if (!p || !Number.isFinite(amount) || amount <= 0) return null;
  const portion = f.unit.value === "portion" && p.serving_g,
    grams = Math.round((portion ? amount * p.serving_g : amount) * 10) / 10;
  if (grams > 5000) return null;
  const round = x => Math.round(x * 100) / 100,
    number = n => n.toLocaleString("fr-FR");
  return {
    name: (p.name + (p.brand ? " (" + p.brand + ")" : "")).slice(0, 100),
    quantity: portion
      ? number(amount) + " portion" + (amount > 1 ? "s" : "") + " (" + number(grams) + " g)"
      : number(grams) + " g",
    grams,
    ...Object.fromEntries(NUTRIENT_KEYS.map(k => [k, round(((p.per100[k] || 0) * grams) / 100)])),
    source: "off",
    barcode: p.barcode,
    nutriscore: p.nutriscore,
    nova: p.nova,
  };
}
function renderScanQuantity() {
  const item = scannedItem();
  $("#scanadd").hidden = !scanProduct;
  $("#scanadd").disabled = !item;
  $("#scanpreview").innerHTML = item
    ? `<strong>${kcalText(item.kcal)} kcal</strong> · P ${gramText(item.protein_g)} · G ${gramText(item.carbs_g)} · L ${gramText(item.fat_g)}`
    : scanProduct
      ? "Indique une quantité."
      : "";
}
$("#scanform").elements.unit.onchange = e => {
  const p = scanProduct,
    f = $("#scanform").elements;
  // Changement d’unité : même quantité, convertie.
  const amount = Number(String(f.amount.value).replace(",", "."));
  if (p?.serving_g && Number.isFinite(amount) && amount > 0)
    f.amount.value =
      e.target.value === "g"
        ? Math.round(amount * p.serving_g * 10) / 10
        : Math.round((amount / p.serving_g) * 100) / 100;
  renderScanQuantity();
};
$("#scanform").elements.amount.oninput = renderScanQuantity;
$("#scanlookup").onclick = () => {
  stopCamera();
  lookupProduct($("#scanform").elements.barcode.value);
};
// Saisie du code à la main : la caméra s’arrête (elle ne doit pas remplacer le code tapé).
$("#scanform").elements.barcode.oninput = () => {
  if (scanCameraWanted) {
    stopCamera();
    $("#scanstatus").textContent = "";
  }
};
$("#scanform").elements.barcode.onkeydown = e => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  $("#scanlookup").click();
};
$("#scanform").onsubmit = e => {
  e.preventDefault();
  const item = scannedItem();
  if (!item) return;
  addScannedItem(item);
  $("#scandialog").close();
};
$("#closescan").onclick = () => $("#scandialog").close();
$("#scandialog").onclose = stopCamera;
