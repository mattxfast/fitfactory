// myFitFactory — WOD du jour (page Séances) : l’athlète qui s’entraîne au jour le jour, hors programme, fait générer
// son entraînement par l’IA (aujourd’hui ou demain), le retrouve dans la rubrique « WOD du jour » de la semaine, lance
// le chrono préréglé et enregistre sa séance quand il veut (elle est rattachée au WOD).
// Scripts classiques chargés dans l’ordre par index.html (portée globale partagée) ; boot.js démarre l’application en dernier.
// La génération demande le réseau : elle n’entre jamais dans la file d’attente hors ligne.

const dailyWodsById = new Map();
let dailyWods = [],
  dailyReplaceId = null,
  dailyRunning = false;
// WOD du jour déjà chargés (semaine affichée, séances) : retrouvés dans le formulaire de séance, même hors ligne.
// Ceux de la semaine chargée que le serveur ne renvoie plus (supprimés, ici ou sur un autre appareil) sont oubliés.
function rememberDailyWods(list, from = null) {
  const ids = new Set((list || []).map(w => w.id));
  if (from)
    for (const [id, w] of dailyWodsById)
      if (w.wod_date >= from && w.wod_date <= addDays(from, 6) && !ids.has(id)) dailyWodsById.delete(id);
  for (const w of list || []) dailyWodsById.set(w.id, {...dailyWodsById.get(w.id), ...w});
  return list || [];
}
const dailyDayLabel = d =>
  d === today() ? "Aujourd’hui" : d === addDays(today(), 1) ? "Demain" : wodDay(d).replace(/^\w/, c => c.toUpperCase());
// Texte du WOD sans sa première ligne (le titre, déjà affiché au-dessus).
const dailyBody = w => String(w?.content || "").replace(/^[^\n]*\n+/, "");
const dailySessions = id => sessions.filter(s => s.daily_wod_id === id).length;
// La génération ne concerne qu’aujourd’hui ou demain : le bouton ✨ n’apparaît que sur la semaine qui les contient.
const dailyCanGenerate = from => {
  const to = addDays(from, 6);
  return (today() >= from && today() <= to) || (addDays(today(), 1) >= from && addDays(today(), 1) <= to);
};

// Rubrique « WOD du jour » de la semaine (toujours affichée, comme les autres rubriques).
function weekDailySection(from, folded) {
  const list = dailyWods,
    done = list.filter(w => dailySessions(w.id)).length,
    canGenerate = dailyCanGenerate(from);
  const cards = list
    .map(w => {
      const n = dailySessions(w.id),
        future = w.wod_date > today();
      // Même forme que les cartes « WOD de la programmation » et « WOD de la box » : texte à gauche, boutons
      // à droite.
      // Une ligne « WOD du JJ/MM/AAAA » (titre de l’IA dessous) ; un toucher sur la ligne ouvre le détail.
      return `<article class="weekwod card ${n ? "done" : ""}"><div class="weekcount"><button type="button" class="smallbtn" data-daily-log="${w.id}" ${future ? "disabled" : ""} aria-label="${future ? "Prévu pour demain" : "Enregistrer la séance"}" title="${future ? "Prévu pour demain" : "Enregistrer la séance"}"><svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>${n ? "" : `<button type="button" class="smallbtn delete" data-daily-del="${w.id}" aria-label="Supprimer ce WOD" title="Supprimer ce WOD"><svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button>`}</div><div class="weekwod-text" role="button" tabindex="0" data-daily-open="${w.id}" aria-label="Voir le détail du WOD du ${fmt(w.wod_date)}"><b>WOD du ${fmt(w.wod_date)}</b><p>${esc(w.title)}</p></div></article>`;
    })
    .join("");
  return `<section class="session-fold ${folded.has("daily") ? "collapsed" : ""}" data-session-fold="daily"><div class="weekheading"><button class="smallbtn section-collapse" aria-label="Replier le WOD du jour" aria-expanded="${!folded.has("daily")}">${folded.has("daily") ? "＋" : "−"}</button><h2>WOD du jour</h2>${canGenerate ? `<button type="button" class="smallbtn weekheading-action" data-bench-new aria-label="Tirer un WOD de référence (Fran, Cindy…)" title="WOD de référence au hasard">${DICE_ICON}</button><button type="button" class="smallbtn weekheading-action" id="dailynew" aria-label="Générer mon WOD du jour" title="Générer mon WOD du jour">${AI_ICON}</button>` : ""}<span>${done}/${list.length}</span></div><div class="session-fold-body"><div class="weekwodlist">${
    cards ||
    (canGenerate
      ? `<article class="weekwod card section-empty daily-empty"><span>Besoin d’un entraînement ? L’IA te prépare ton WOD du jour.</span><span class="daily-empty-actions"><button type="button" class="primary" data-daily-new>${AI_ICON}<span>Générer</span></button><button type="button" class="smallbtn" data-bench-new>${DICE_ICON}<span>WOD de référence</span></button></span></article>`
      : sectionEmpty("Pas de WOD du jour cette semaine"))
  }</div></div></section>`;
}
// Détail d’un WOD du jour, en fenêtre : texte complet, chrono et séance.
function openDailyDetail(id) {
  const w = dailyWodsById.get(id),
    dialog = $("#dailydetaildialog");
  if (!w) return;
  const done = dailySessions(w.id) > 0,
    future = w.wod_date > today();
  $("#dailydetailtitle").textContent = "WOD du " + fmt(w.wod_date);
  $("#dailydetailmeta").textContent =
    w.title + " · " + dailyDayLabel(w.wod_date) + (done ? " · séance enregistrée" : "");
  $("#dailydetailbody").textContent = dailyBody(w);
  $("#dailydetailactions").innerHTML = done
    ? ""
    : `<button type="button" class="primary" data-daily-log="${w.id}" ${future ? "disabled" : ""}><svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg><span>${future ? "Prévu pour demain" : "Enregistrer la séance"}</span></button>`;
  bindDailySection($("#dailydetailactions"));
  // La fenêtre se ferme avant d’ouvrir le formulaire de séance.
  $("#dailydetailactions")
    .querySelectorAll("button")
    .forEach(b => {
      const run = b.onclick;
      b.onclick = () => {
        dialog.close();
        run?.();
      };
    });
  dialog.showModal();
}
function bindDailySection(root) {
  root
    .querySelectorAll("[data-daily-open]")
    .forEach(b => (b.onclick = e => (blurAfterTap(b, e), openDailyDetail(b.dataset.dailyOpen))));
  root.querySelectorAll("#dailynew, [data-daily-new]").forEach(b => (b.onclick = () => openDailyDialog()));
  root.querySelectorAll("[data-bench-new]").forEach(b => (b.onclick = () => openBenchmarkDraw()));
  root
    .querySelectorAll("[data-daily-log]")
    .forEach(b => (b.onclick = () => openSession(null, "daily:" + b.dataset.dailyLog)));
  root.querySelectorAll("[data-daily-del]").forEach(
    b =>
      (b.onclick = async () => {
        if (!confirm("Supprimer ce WOD du jour ?")) return;
        try {
          await sendApi("/daily-wods/" + b.dataset.dailyDel, "DELETE");
          dailyWodsById.delete(b.dataset.dailyDel);
          await loadSessions();
          toast("WOD du jour supprimé.");
        } catch (e) {
          toast(e.offline ? OFFLINE_MESSAGE : e.message);
        }
      })
  );
}

// Fenêtre de génération : derniers choix mémorisés sur l’appareil, profil d’athlète partagé avec la génération
// des programmes.
function dailyLastChoices() {
  try {
    return JSON.parse(localStorage.getItem("fitfactory-daily") || "{}");
  } catch {
    return {};
  }
}
async function openDailyDialog(replaceId = null) {
  const form = $("#dailyform"),
    f = form.elements,
    last = dailyLastChoices(),
    replaced = replaceId ? dailyWodsById.get(replaceId) : null;
  form.reset();
  dailyReplaceId = replaceId;
  const days = [today(), addDays(today(), 1)];
  f.wod_date.innerHTML = days
    .map(d => `<option value="${d}">${esc(dailyDayLabel(d) + " (" + wodDay(d) + ")")}</option>`)
    .join("");
  f.wod_date.value = replaced && days.includes(replaced.wod_date) ? replaced.wod_date : today();
  // Durée : toujours 1 h par défaut (le lieu et la forme reprennent le dernier choix).
  f.duration_minutes.value = "60";
  for (const k of ["place", "energy"]) {
    const input = form.querySelector(`input[name="${k}"][value="${last[k]}"]`);
    if (input) input.checked = true;
  }
  $("#dailytitle").textContent = replaced ? "Autre WOD du jour" : "WOD du jour";
  $("#dailysubmit").textContent = replaced ? "Générer un autre WOD" : "Générer mon WOD";
  $("#dailyerror").textContent = "";
  $("#dailyprogress").hidden = true;
  $("#dailysubmit").disabled = false;
  $("#dailydialog").showModal();
  try {
    const d = await sendApi("/ai-profile", "GET");
    for (const k of ["level", "goals", "equipment", "constraints"]) f[k].value = d.profile[k] || "";
    if (!d.enabled) {
      $("#dailyerror").textContent =
        "La génération par IA n’est pas encore activée : l’administrateur doit configurer la clé OpenAI.";
      $("#dailysubmit").disabled = true;
    }
  } catch (e) {
    $("#dailyerror").textContent = e.offline ? OFFLINE_MESSAGE : e.message;
    $("#dailysubmit").disabled = true;
  }
}
$("#dailyform").onsubmit = async e => {
  e.preventDefault();
  if (dailyRunning) return;
  const f = e.target.elements,
    request = {
      wod_date: f.wod_date.value,
      duration_minutes: Number(f.duration_minutes.value),
      place: f.place.value,
      energy: f.energy.value,
      instructions: f.instructions.value.trim(),
      ...(dailyReplaceId ? {replace_id: dailyReplaceId} : {}),
    };
  $("#dailyerror").textContent = "";
  if (!navigator.onLine) {
    $("#dailyerror").textContent = OFFLINE_MESSAGE;
    return;
  }
  try {
    localStorage.setItem(
      "fitfactory-daily",
      JSON.stringify({duration_minutes: request.duration_minutes, place: request.place, energy: request.energy})
    );
  } catch {}
  dailyRunning = true;
  $("#dailysubmit").disabled = true;
  aiWaitStart($("#dailyprogress"), "Ton coach prépare le WOD… (jusqu’à une minute)");
  try {
    await sendApi("/ai-profile", "PUT", {
      level: f.level.value,
      goals: f.goals.value,
      equipment: f.equipment.value,
      constraints: f.constraints.value,
    });
    const d = await sendApi("/daily-wods", "POST", request, AI_TIMEOUT);
    rememberDailyWods([d.wod]);
    await aiWaitDone($("#dailyprogress"), "WOD prêt !");
    $("#dailydialog").close();
    selectedWeekStart = mondayOf(d.wod.wod_date);
    await loadSessions();
    toast("WOD du jour prêt : bon entraînement !");
  } catch (x) {
    $("#dailyerror").textContent = x.offline ? OFFLINE_MESSAGE : x.message;
  } finally {
    dailyRunning = false;
    $("#dailysubmit").disabled = false;
    $("#dailyprogress").hidden = true;
  }
};
$("#closedaily").onclick = () => {
  if (dailyRunning && !confirm("Abandonner la génération en cours ?")) return;
  $("#dailydialog").close();
};
