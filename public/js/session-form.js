// FitFactory — saisie et modification d’une séance, planification d’un WOD.
// Scripts classiques chargés dans l’ordre par index.html (portée globale partagée) ; boot.js démarre l’application en dernier.

function defaultActivity() {
  return activities.find(a => a.is_default) || activities[0];
}
function fillActivitySelect(select, selected = "") {
  select.innerHTML = activities
    .filter(a => a.is_active)
    .map(a => `<option value="${a.id}">${esc(a.name)}</option>`)
    .join("");
  if (selected) select.value = selected;
  else if (defaultActivity()) select.value = defaultActivity().id;
}
// WOD de box proposés dans le formulaire : ceux de la semaine de la date de séance, pour les box dont on est membre.
let formBoxWods = [],
  formBoxWeek = "";
function loadFormBoxWods(date, onLoaded) {
  const week = mondayOf(date || today());
  formBoxWeek = week;
  formBoxWods = [];
  if (!memberBoxIds().length) return;
  if (week === selectedWeekStart) {
    formBoxWods = rememberBoxWods(boxWods);
    return;
  }
  api("/box-wods?from=" + week + "&to=" + addDays(week, 6))
    .then(d => {
      if (formBoxWeek !== week) return;
      formBoxWods = rememberBoxWods(d.wods);
      onLoaded();
    })
    .catch(() => {});
}
// WOD de box choisi dans la liste (valeur « box:<id> »), sinon null.
function selectedBoxWod() {
  const v = $("#sessionform").elements.wod_id.value || "";
  return v.startsWith("box:") ? boxWodsById.get(v.slice(4)) || null : null;
}
// WOD du jour choisi dans la liste (valeur « daily:<id> »), sinon null.
function selectedDailyWod() {
  const v = $("#sessionform").elements.wod_id.value || "";
  return v.startsWith("daily:") ? dailyWodsById.get(v.slice(6)) || null : null;
}
function fillWodOptions(pid, selected = "") {
  const f = $("#sessionform").elements.wod_id,
    ws = pid === "none" ? [] : visibleWods(pid),
    list = formBoxWods.filter(w => w.wod_date <= today()),
    // WOD du jour de la semaine de la séance (jusqu’à aujourd’hui), plus celui de la séance modifiée.
    week = mondayOf($("#sessionform").elements.session_date.value || today()),
    dailyList = [...dailyWodsById.values()].filter(
      w => (w.wod_date <= today() && mondayOf(w.wod_date) === week) || "daily:" + w.id === selected
    );
  if (selected.startsWith("box:") && !list.some(w => "box:" + w.id === selected) && boxWodsById.has(selected.slice(4)))
    list.push(boxWodsById.get(selected.slice(4)));
  const severalBoxes = new Set(list.map(w => w.box_id)).size > 1,
    programOptions = ws.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join(""),
    boxOptions = list
      .map(
        w =>
          `<option value="box:${w.id}">${esc(wodDay(w.wod_date) + " · " + boxWodLabel(w) + (severalBoxes ? " (" + w.box_name + ")" : ""))}</option>`
      )
      .join("");
  const dailyOptions = dailyList
    .sort((a, b) => a.wod_date.localeCompare(b.wod_date))
    .map(w => `<option value="daily:${w.id}">${esc(wodDay(w.wod_date) + " · " + w.title)}</option>`)
    .join("");
  f.innerHTML =
    (boxOptions || dailyOptions
      ? (programOptions
          ? `<optgroup label="${esc(programs.find(p => p.id === pid)?.name || "Programmation")}">${programOptions}</optgroup>`
          : "") +
        (dailyOptions ? `<optgroup label="WOD du jour">${dailyOptions}</optgroup>` : "") +
        (boxOptions ? `<optgroup label="WOD de la box">${boxOptions}</optgroup>` : "")
      : programOptions) + `<option value="other">Autres</option>`;
  if (selected) f.value = selected;
  if (f.selectedIndex < 0) f.selectedIndex = 0;
  syncSessionWod();
}
// Mouvements (catalogue pour un WOD de box ou « hors programme ») et score selon le WOD choisi.
function syncSessionWod(session = null) {
  const f = $("#sessionform"),
    boxWod = selectedBoxWod(),
    dailyWod = selectedDailyWod(),
    box = $("#sessionmovementchecks");
  // WOD de box, WOD du jour ou « Autres » : tous les mouvements du catalogue ; sinon ceux du programme (ou le
  // catalogue s’il n’en a pas).
  renderSessionMovementChecks(
    boxWod || dailyWod || f.elements.wod_id.value === "other" ? "none" : f.elements.program_id.value,
    f.elements.session_id.value
  );
  // Nouvelle séance sur un WOD du jour : les mouvements reconnus dans le WOD sont cochés par défaut.
  if (dailyWod && !f.elements.session_id.value && box.dataset.presetWod !== "daily:" + dailyWod.id) {
    const preset = new Set(dailyWod.movement_ids || []);
    box.querySelectorAll('input[name="catalog_movement_ids"]').forEach(i => (i.checked = preset.has(i.value)));
    box.dataset.presetWod = "daily:" + dailyWod.id;
  }
  // Nouvelle séance sur un WOD de box : ses mouvements (cochés par le gestionnaire) sont cochés par défaut,
  // une seule fois par WOD choisi ; l’utilisateur peut ensuite les modifier.
  if (boxWod && !f.elements.session_id.value && box.dataset.presetWod !== boxWod.id) {
    const preset = new Set(boxWod.movement_ids || []);
    box.querySelectorAll('input[name="catalog_movement_ids"]').forEach(i => (i.checked = preset.has(i.value)));
    box.dataset.presetWod = boxWod.id;
  }
  renderSessionScore(session);
  syncSessionMovementCount();
}
// Liste des mouvements repliée par défaut : le titre indique combien sont cochés.
function syncSessionMovementCount() {
  const n = $("#sessionmovementchecks").querySelectorAll("input:checked").length;
  $("#sessionmovementcount").textContent = n ? n + (n > 1 ? " cochés" : " coché") : "aucun coché";
}
$("#sessionmovementchecks").onchange = syncSessionMovementCount;
$("#sessionform").elements.program_id.onchange = e => {
  fillWodOptions(e.target.value);
  const w = (wodsByProgram[e.target.value] || [])[0];
  fillActivitySelect($("#sessionform").elements.activity_id, w?.activity_id || defaultActivity()?.id);
  $("#sessionform").elements.duration_minutes.value = w?.duration_minutes || defaultActivity()?.duration_minutes || 60;
  applyPlannedSessionNote();
};
function applyPlannedSessionNote() {
  const f = $("#sessionform"),
    field = f.elements.actual_comment,
    previous = field.dataset.plannedDefault || "";
  if (field.value === previous || !field.value.trim()) {
    const boxWod = selectedBoxWod(),
      dailyWod = selectedDailyWod(),
      wod = (wodsByProgram[f.elements.program_id.value] || []).find(x => x.id === f.elements.wod_id.value);
    const week = mondayOf(f.elements.session_date.value || today());
    const planned = boxWod
      ? boxWod.content || ""
      : dailyWod
        ? dailyWod.content || ""
        : wod
          ? weeklyWodContent(wod.id, week) || wod.planned_comment || ""
          : "";
    field.value = planned;
    field.dataset.plannedDefault = planned;
  }
}
$("#sessionform").elements.wod_id.onchange = e => {
  const w = (wodsByProgram[$("#sessionform").elements.program_id.value] || []).find(x => x.id === e.target.value);
  if (w) {
    fillActivitySelect($("#sessionform").elements.activity_id, w.activity_id || defaultActivity()?.id);
    $("#sessionform").elements.duration_minutes.value = w.duration_minutes || defaultActivity()?.duration_minutes || 60;
  }
  syncSessionWod();
  applyPlannedSessionNote();
};
$("#sessionform").elements.session_date.onchange = e => {
  const f = $("#sessionform"),
    refill = () => {
      fillWodOptions(f.elements.program_id.value, f.elements.wod_id.value);
      applyPlannedSessionNote();
    };
  if (mondayOf(e.target.value || today()) !== formBoxWeek) {
    loadFormBoxWods(e.target.value, refill);
    refill();
  } else applyPlannedSessionNote();
};
// Score d’un WOD de box : catégorie de la box et valeur selon le type (temps, répétitions, charge).
function renderSessionScore(session = null) {
  const f = $("#sessionform"),
    w = selectedBoxWod(),
    show = !!w && w.score_type !== "none",
    box = $("#scoreinputs");
  $("#sessionscoresection").hidden = !show;
  if (!show) {
    box.innerHTML = "";
    box.dataset.wod = "";
    return;
  }
  if (box.dataset.wod === w.id && !session) return;
  box.dataset.wod = w.id;
  const cats = boxCategories.filter(c => c.box_id === w.box_id),
    previous = session?.score_category_id || f.elements.score_category_id.value,
    v = session?.score_value ?? null;
  f.elements.score_category_id.innerHTML = cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  if (cats.some(c => c.id === previous)) f.elements.score_category_id.value = previous;
  box.innerHTML =
    w.score_type === "time"
      ? `<label>Temps (min : s)<span class="score-time"><input name="score_min" type="number" min="0" max="1440" step="1" inputmode="numeric" placeholder="min" value="${v === null ? "" : Math.floor(v / 60)}"><span>:</span><input name="score_sec" type="number" min="0" max="59" step="1" inputmode="numeric" placeholder="s" value="${v === null ? "" : v % 60}"></span></label>`
      : w.score_type === "reps"
        ? `<label>Répétitions<input name="score_reps" type="number" min="1" max="100000" step="1" inputmode="numeric" value="${v ?? ""}"></label>`
        : `<label>Charge (kg)<input name="score_load" type="number" min="0.5" max="1000" step="0.5" inputmode="decimal" value="${v ?? ""}"></label>`;
}
// Valeur du score saisie (null si vide) ; le temps est converti en secondes.
function readSessionScore() {
  const f = $("#sessionform").elements,
    w = selectedBoxWod();
  if (!w || w.score_type === "none") return {score_value: null, score_category_id: null};
  let value = null;
  if (w.score_type === "time") {
    const mn = f.score_min.value,
      sec = f.score_sec.value;
    if (mn !== "" || sec !== "") value = Number(mn || 0) * 60 + Number(sec || 0);
    if (value !== null && (!Number.isInteger(value) || value < 1 || Number(sec || 0) > 59))
      return {error: "Temps invalide : minutes et secondes (0 à 59)."};
  } else {
    const raw = (w.score_type === "reps" ? f.score_reps : f.score_load).value;
    if (raw !== "") value = Number(raw);
  }
  return {score_value: value, score_category_id: value === null ? null : f.score_category_id.value};
}
function renderSessionMovementChecks(pid, sessionId = "") {
  const box = $("#sessionmovementchecks"),
    programItems = movementsByProgram[pid] || [],
    fromCatalog = !programItems.length,
    items = fromCatalog ? movementCatalog : programItems,
    field = fromCatalog ? "catalog_movement_ids" : "movement_ids",
    // Cases déjà cochées dans le formulaire ouvert (changement de date ou de WOD) : gardées.
    ticked = new Set([...box.querySelectorAll("input:checked")].map(x => x.name + ":" + x.value)),
    isChecked = m =>
      ticked.has(field + ":" + m.id) ||
      (fromCatalog
        ? catalogChecks.some(c => c.session_id === sessionId && c.catalog_movement_id === m.id) ||
          // Séance « Autres » enregistrée avec des mouvements du programme : retrouvés dans la liste complète.
          movementChecks.some(
            c =>
              c.session_id === sessionId &&
              Object.values(movementsByProgram)
                .flat()
                .some(pm => pm.id === c.movement_id && pm.catalog_movement_id === m.id)
          )
        : movementChecks.some(c => c.session_id === sessionId && c.movement_id === m.id));
  $("#sessionmovementsection").hidden = !items.length;
  box.innerHTML = items
    .map(
      m =>
        `<label class="movement-check"><input type="checkbox" name="${field}" value="${esc(m.id)}" ${isChecked(m) ? "checked" : ""}><span>${esc(m.name)}</span></label>`
    )
    .join("");
}
function openSession(s = null, presetWodId = "") {
  const f = $("#sessionform");
  f.reset();
  $("#sessionmovementchecks").innerHTML = "";
  $("#sessionmovementchecks").dataset.presetWod = "";
  $("#sessionmovementdetails").open = false;
  f.elements.session_date.max = today();
  f.elements.session_id.value = s?.id || "";
  f.elements.actual_comment.value = s?.actual_comment || "";
  f.elements.actual_comment.dataset.plannedDefault = "";
  const weekEnd = addDays(selectedWeekStart, 6),
    defaultDate = selectedWeekStart > today() ? today() : weekEnd < today() ? weekEnd : today(),
    presetBoxWod = presetWodId.startsWith("box:") ? boxWodsById.get(presetWodId.slice(4)) : null,
    presetDaily = presetWodId.startsWith("daily:") ? dailyWodsById.get(presetWodId.slice(6)) : null,
    presetDate = presetBoxWod?.wod_date || presetDaily?.wod_date,
    sessionDate = s?.session_date || (presetDate && presetDate <= today() ? presetDate : defaultDate);
  f.elements.session_date.value = sessionDate;
  // Programmes réels + « Hors programme » (programme technique caché, créé par le serveur si besoin).
  f.elements.program_id.innerHTML =
    programs
      .filter(p => !isFallbackProgram(p))
      .map(p => `<option value="${p.id}">${esc(p.name)}</option>`)
      .join("") + `<option value="none">Sans programme</option>`;
  let selectedProgram = s ? programs.find(p => p.id === s.program_id) : null;
  if (!selectedProgram && presetWodId)
    selectedProgram = programs.find(p => (wodsByProgram[p.id] || []).some(x => x.id === presetWodId));
  if (!selectedProgram) selectedProgram = programForDate(sessionDate);
  f.elements.program_id.value = selectedProgram && !isFallbackProgram(selectedProgram) ? selectedProgram.id : "none";
  const pid = f.elements.program_id.value;
  // Séance sur un WOD de box : le WOD est retrouvé même s’il n’est pas dans la semaine de la séance.
  if (s?.box_wod_id)
    rememberBoxWods([
      {
        id: s.box_wod_id,
        box_id: s.box_id,
        box_name: s.box_name,
        wod_date: s.box_wod_date || s.session_date,
        name: s.wod_name,
        content: s.planned_comment || "",
        score_type: s.score_type || "none",
        ...boxWodsById.get(s.box_wod_id),
      },
    ]);
  // Séance sur un WOD du jour : le WOD est retrouvé même s’il n’est pas dans la semaine affichée.
  if (s?.daily_wod_id)
    rememberDailyWods([
      {
        id: s.daily_wod_id,
        wod_date: s.daily_wod_date || s.session_date,
        title: s.wod_name,
        content: s.planned_comment || "",
        ...dailyWodsById.get(s.daily_wod_id),
      },
    ]);
  const initialWod = s?.box_wod_id
    ? "box:" + s.box_wod_id
    : s?.daily_wod_id
      ? "daily:" + s.daily_wod_id
      : s?.wod_name === "Autres"
        ? "other"
        : s?.wod_id || presetWodId;
  loadFormBoxWods(sessionDate, () =>
    fillWodOptions(f.elements.program_id.value, f.elements.wod_id.value || initialWod)
  );
  fillWodOptions(pid, initialWod);
  // Sans programme : le WOD du jour généré (pas encore enregistré), sinon le WOD de la box du jour, est proposé
  // par défaut.
  if (!s && !presetWodId && pid === "none") {
    const daily = [...dailyWodsById.values()].find(w => w.wod_date === sessionDate && !dailySessions(w.id)),
      todays = formBoxWods.find(w => w.wod_date === sessionDate);
    if (daily || todays) {
      f.elements.wod_id.value = daily ? "daily:" + daily.id : "box:" + todays.id;
      syncSessionWod();
    }
  }
  const selectedWod = (wodsByProgram[pid] || []).find(w => w.id === (s?.wod_id || presetWodId));
  fillActivitySelect(f.elements.activity_id, s?.activity_id || selectedWod?.activity_id || defaultActivity()?.id);
  f.elements.duration_minutes.value =
    s?.duration_minutes || selectedWod?.duration_minutes || defaultActivity()?.duration_minutes || 60;
  const defaultStart = new Date(Date.now() - Number(f.elements.duration_minutes.value) * 60000);
  f.elements.start_time.value = s?.started_at
    ? new Date(s.started_at).toLocaleTimeString("fr-FR", {hour: "2-digit", minute: "2-digit", hour12: false})
    : defaultStart.toLocaleTimeString("fr-FR", {hour: "2-digit", minute: "2-digit", hour12: false});
  f.elements.start_time.dataset.manual = "";
  f.elements.start_time.onchange = () => {
    f.elements.start_time.dataset.manual = "1";
  };
  f.elements.duration_minutes.oninput = () => {
    if (!f.elements.start_time.dataset.manual) {
      const d = new Date(Date.now() - Number(f.elements.duration_minutes.value || 0) * 60000);
      f.elements.start_time.value = d.toLocaleTimeString("fr-FR", {hour: "2-digit", minute: "2-digit", hour12: false});
    }
  };
  $("#scoreinputs").dataset.wod = "";
  syncSessionWod(s);
  if (!s) applyPlannedSessionNote();
  $("#sessiontitle").textContent = s ? "Modifier la séance" : "Enregistrer une séance";
  setSessionPartners(s);
  $("#sessiondialog").showModal();
}
// Partenaires tagués : ceux déjà invités (avec l’état de l’invitation ; une invitation acceptée ou refusée ne se
// retire plus) et ceux ajoutés par la recherche (comptes de l’application, par prénom et nom, 10 au plus).
let sessionPartners = [],
  partnerTimer = null;
const partnerName = x => [x.first_name, x.last_name].filter(Boolean).join(" ");
const PARTNER_STATUS = {pending: "en attente", accepted: "a accepté", declined: "a refusé"};
function setSessionPartners(s) {
  sessionPartners = s
    ? sessionTags
        .filter(t => t.session_id === s.id)
        .map(t => ({id: t.to_user_id, name: partnerName(t), status: t.status}))
    : [];
  $("#partnersearch").value = "";
  $("#partnerresults").innerHTML = "";
  renderPartners();
}
function renderPartners() {
  $("#partnerchips").innerHTML = sessionPartners
    .map(
      p =>
        `<span class="tracked-tag partner-chip">${esc(p.name)}${p.status ? " · " + PARTNER_STATUS[p.status] : ""}${!p.status || p.status === "pending" ? `<button type="button" data-partner-remove="${esc(p.id)}" aria-label="Retirer ${esc(p.name)}" title="Retirer">×</button>` : ""}</span>`
    )
    .join("");
  $("#partnerchips")
    .querySelectorAll("[data-partner-remove]")
    .forEach(
      b =>
        (b.onclick = () => {
          sessionPartners = sessionPartners.filter(p => p.id !== b.dataset.partnerRemove);
          renderPartners();
        })
    );
}
$("#partnersearch").onkeydown = e => {
  if (e.key === "Enter") e.preventDefault(); // pas d’enregistrement de la séance depuis la recherche
};
$("#partnersearch").oninput = e => {
  clearTimeout(partnerTimer);
  const q = e.target.value.trim(),
    results = $("#partnerresults");
  if (q.length < 2) {
    results.innerHTML = "";
    return;
  }
  partnerTimer = setTimeout(async () => {
    try {
      const d = await sendApi("/users/search?q=" + encodeURIComponent(q), "GET");
      if ($("#partnersearch").value.trim() !== q) return;
      const list = d.users.filter(x => !sessionPartners.some(p => p.id === x.id));
      results.innerHTML =
        list
          .map(
            x =>
              `<button type="button" class="smallbtn partner-result" data-partner-add="${esc(x.id)}">＋ ${esc(partnerName(x))}</button>`
          )
          .join("") || `<p class="muted">Personne trouvée.</p>`;
      results.querySelectorAll("[data-partner-add]").forEach(
        b =>
          (b.onclick = () => {
            if (sessionPartners.length >= 10) return toast("10 partenaires au plus par séance.");
            const x = list.find(y => y.id === b.dataset.partnerAdd);
            sessionPartners.push({id: x.id, name: partnerName(x)});
            $("#partnersearch").value = "";
            results.innerHTML = "";
            renderPartners();
          })
      );
    } catch (x) {
      results.innerHTML = `<p class="muted">${esc(x.offline ? OFFLINE_MESSAGE : x.message)}</p>`;
    }
  }, 250);
};
let choiceWodId = "";
function openWodChoice(wodId) {
  const planned = weeklyPlans.some(x => x.wod_id === wodId);
  if (selectedWeekStart < mondayOf(today())) {
    openSession(null, wodId);
    return;
  }
  if (planned) {
    if (selectedWeekStart > mondayOf(today())) {
      toast("Cette séance est planifiée pour une semaine future.");
      return;
    }
    openSession(null, wodId);
    return;
  }
  choiceWodId = wodId;
  const w = programs.flatMap(p => wodsByProgram[p.id] || []).find(x => x.id === wodId);
  $("#wodchoicetitle").textContent = w?.name || "Que souhaites-tu faire ?";
  $("#choice-record").disabled = selectedWeekStart > mondayOf(today());
  $("#choice-plan").textContent = "Planifier";
  $("#wodchoice").showModal();
}
$("#closewodchoice").onclick = () => $("#wodchoice").close();
$("#choice-record").onclick = () => {
  const id = choiceWodId;
  $("#wodchoice").close();
  openSession(null, id);
};
$("#choice-plan").onclick = async () => {
  const id = choiceWodId;
  try {
    await api("/weekly-plans", {method: "POST", body: JSON.stringify({week_start: selectedWeekStart, wod_id: id})});
    $("#wodchoice").close();
    await changeWeek(selectedWeekStart);
    toast("WOD planifié.");
  } catch (e) {
    toast(e.message);
  }
};
function addSessionFromWeek() {
  if (selectedWeekStart > mondayOf(today())) {
    toast("Impossible de saisir une séance sur une semaine future.");
    return;
  }
  openSession();
}
$("#closesession").onclick = () => $("#sessiondialog").close();
async function saveSession(event) {
  if (event) event.preventDefault();
  const form = $("#sessionform");
  if (!form.reportValidity()) return;
  const f = new FormData(form),
    id = f.get("session_id");
  if (f.get("session_date") > today()) {
    $("#sessionerror").textContent = "Impossible d’enregistrer une séance à une date future.";
    return;
  }
  const button = $("#savesession");
  button.disabled = true;
  $("#sessionerror").textContent = "";
  const body = {
    program_id: f.get("program_id"),
    wod_id: f.get("wod_id"),
    session_date: f.get("session_date"),
    activity_id: f.get("activity_id"),
    duration_minutes: Number(f.get("duration_minutes")),
    started_at: new Date(f.get("session_date") + "T" + f.get("start_time")).toISOString(),
    actual_comment: f.get("actual_comment"),
    movement_ids: [...form.querySelectorAll('input[name="movement_ids"]:checked')].map(x => x.value),
    catalog_movement_ids: [...form.querySelectorAll('input[name="catalog_movement_ids"]:checked')].map(x => x.value),
    tagged_user_ids: sessionPartners.map(p => p.id),
  };
  // WOD de box : séance « hors programme » rattachée au WOD de la box, avec son score éventuel.
  const boxWod = selectedBoxWod();
  if (boxWod) {
    const score = readSessionScore();
    if (score.error) {
      $("#sessionerror").textContent = score.error;
      button.disabled = false;
      return;
    }
    Object.assign(body, {program_id: "none", wod_id: "other", box_wod_id: boxWod.id}, score);
  }
  // WOD du jour : séance « hors programme » rattachée au WOD généré.
  const dailyWod = selectedDailyWod();
  if (dailyWod) Object.assign(body, {program_id: "none", wod_id: "other", daily_wod_id: dailyWod.id});
  try {
    await api(id ? "/sessions/" + id : "/sessions", {method: id ? "PUT" : "POST", body: JSON.stringify(body)});
    if (!boxWod && !dailyWod)
      await api("/weekly-plans", {
        method: "DELETE",
        body: JSON.stringify({week_start: mondayOf(body.session_date), wod_id: body.wod_id}),
      });
    $("#sessiondialog").close();
    selectedWeekStart = mondayOf(body.session_date);
    await load(); // recharge aussi les programmes (état « contient des séances »)
    renderWeek();
    toast(id ? "Séance modifiée." : "Séance enregistrée.");
  } catch (x) {
    $("#sessionerror").textContent = x.message;
  } finally {
    button.disabled = false;
  }
}
$("#sessionform").onsubmit = saveSession;
$("#savesession").onclick = () => saveSession();
