// myFitFactory — progression (page PR) : séances des 12 dernières semaines, régularité, répartition par origine et
// mouvements les plus travaillés. Calculée par le serveur (GET /api/progress), gardée hors ligne.
// Scripts classiques chargés dans l’ordre par index.html (portée globale partagée) ; boot.js démarre l’application en dernier.

let progressData = null;
async function loadProgress() {
  try {
    progressData = await api("/progress");
  } catch {}
  if (!$("#view-prs").hidden) renderPrs();
}
const PROGRESS_SOURCES = [
  ["prog", "WOD de la prog"],
  ["box", "WOD de la box"],
  ["daily", "WOD du jour"],
  ["libre", "Séances libres"],
];
const progressPlural = (n, word) => n + " " + word + (n > 1 ? "s" : "");
// Barres horizontales (une seule série : longueur = valeur, texte en clair) : répartition, mouvements.
function progressBars(rows) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return rows
    .map(
      r =>
        `<div class="progress-row"><span>${esc(r.label)}</span><span class="progress-track"><span class="progress-fill" style="width:${Math.max(r.value ? 3 : 0, Math.round((r.value / max) * 100))}%"></span></span><strong>${r.value}</strong></div>`
    )
    .join("");
}
// Histogramme des séances par semaine (SVG) : un toucher ou le survol d’une colonne affiche son détail.
function progressWeekChart(weeks) {
  const width = 340,
    height = 132,
    left = 22,
    right = 4,
    top = 8,
    bottom = 20,
    max = Math.max(2, ...weeks.map(w => w.count)),
    step = Math.ceil(max / 2),
    axisMax = step * 2,
    plotW = width - left - right,
    plotH = height - top - bottom,
    col = plotW / weeks.length,
    barW = Math.min(18, col - 6),
    y = v => top + plotH - (v / axisMax) * plotH;
  const grid = [0, step, axisMax]
    .map(
      v =>
        `<line class="progress-grid" x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}"/><text class="progress-axis" x="${left - 5}" y="${y(v) + 3}" text-anchor="end">${v}</text>`
    )
    .join("");
  const bars = weeks
    .map((w, i) => {
      const x = left + i * col + (col - barW) / 2,
        h = (w.count / axisMax) * plotH,
        r = Math.min(4, h / 2, barW / 2),
        base = top + plotH,
        // Barre arrondie en haut seulement, posée sur la ligne de base.
        path = h
          ? `<path class="progress-mark" d="M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + barW - r}Q${x + barW},${base - h} ${x + barW},${base - h + r}V${base}Z"/>`
          : "",
        label =
          i % 3 === weeks.length % 3 || i === weeks.length - 1
            ? `<text class="progress-axis" x="${x + barW / 2}" y="${height - 6}" text-anchor="middle">${w.week_start.slice(8, 10)}/${w.week_start.slice(5, 7)}</text>`
            : "";
      return `<g data-progress-week="${i}">${path}<rect class="progress-hit" x="${left + i * col}" y="${top}" width="${col}" height="${plotH}"/>${label}</g>`;
    })
    .join("");
  return `<svg class="progress-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Séances par semaine sur les ${weeks.length} dernières semaines">${grid}${bars}</svg>`;
}
const progressWeekCaption = (w, last) =>
  (last ? "Cette semaine" : "Semaine du " + fmt(w.week_start)) + " : " + progressPlural(w.count, "séance");
function renderProgressSection() {
  const key = "records:progress",
    collapsed = !!window.cfPrCategorySections[key],
    d = progressData;
  let body =
    '<div class="admin-row section-empty"><span>Progression indisponible hors ligne pour l’instant</span></div>';
  if (d?.weeks?.length) {
    const avg = (d.total / d.weeks.length).toLocaleString("fr-FR", {maximumFractionDigits: 1}),
      last = d.weeks[d.weeks.length - 1];
    body =
      `<div class="progress-tiles"><div><strong>${d.total}</strong><span>séances en ${d.weeks.length} semaines</span></div><div><strong>${avg}</strong><span>par semaine en moyenne</span></div><div><strong>${d.streak_weeks}</strong><span>${d.streak_weeks > 1 ? "semaines actives d’affilée" : "semaine active d’affilée"}</span></div></div>` +
      `<h4 class="progress-title">Séances par semaine</h4><p class="progress-caption" aria-live="polite">${esc(progressWeekCaption(last, true))}</p>${progressWeekChart(d.weeks)}` +
      `<h4 class="progress-title">Répartition</h4>${progressBars(PROGRESS_SOURCES.map(([k, label]) => ({label, value: d.by_source?.[k] || 0})))}` +
      `<h4 class="progress-title">Mouvements les plus travaillés</h4>${
        d.movements?.length
          ? progressBars(d.movements.slice(0, 8).map(m => ({label: m.name, value: m.count})))
          : '<p class="muted">Aucun mouvement coché dans tes séances sur la période.</p>'
      }`;
  }
  return `<section class="admin-group pr-category-group ${collapsed ? "collapsed" : ""}" data-pr-category="${key}"><div class="admin-group-title" role="button" tabindex="0" data-toggle-pr-category="${key}" aria-expanded="${!collapsed}"><span class="admin-collapse-indicator">${collapsed ? "＋" : "−"}</span><span>PROGRESSION</span></div><div class="admin-group-body"><div class="progress-body">${body}</div></div></section>`;
}
function bindProgressSection(root) {
  const chart = root.querySelector(".progress-chart"),
    caption = root.querySelector(".progress-caption"),
    weeks = progressData?.weeks || [];
  if (!chart || !caption) return;
  const show = g => {
    const i = Number(g.dataset.progressWeek);
    chart.querySelectorAll("[data-progress-week]").forEach(x => x.classList.toggle("active", x === g));
    chart.classList.add("has-active");
    caption.textContent = progressWeekCaption(weeks[i], i === weeks.length - 1);
  };
  chart.querySelectorAll("[data-progress-week]").forEach(g => {
    g.onpointerenter = () => show(g);
    g.onclick = () => show(g);
  });
}
