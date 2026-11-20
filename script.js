// Connexion directe à Google Sheets (Lecture comics 2026 — Feuille 1, gid=0)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1-Gwoxyi5A3h2DmtCrX_ySN8sBu0irqWMykvjpHB7b1w/gviz/tq?tqx=out:csv&gid=0";

let comics = [], currentPublisher = "Tous", currentSaga = "Toutes", currentPage = 1;
const PAGE_SIZE = 48;
const $ = id => document.getElementById(id);
const clean = v => v == null ? "" : String(v).trim();
const esc = s => clean(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function rowsToComics(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) throw Error("La feuille Google Sheets ne contient aucune ligne exploitable.");
  const headers = rows[0].map(x => clean(x).replace(/^\uFEFF/, ""));
  const wanted = ["Date", "Titre", "num", "vf", "vo", "Editeur", "Equipe", "Periode", "Auteur", "Dessinateur", "Résumé", "Covers", "Planche", "lu 2 fois"];
  const indexes = wanted.map(h => headers.indexOf(h));
  if (indexes[1] === -1 || indexes[5] === -1) {
    throw Error("Colonnes « Titre » et « Editeur » introuvables dans la première ligne de l'onglet.");
  }
  return rows.slice(1)
    .map(r => {
      const c = {};
      wanted.forEach((h, i) => { c[h] = indexes[i] >= 0 ? clean(r[indexes[i]]) : ""; });
      return c;
    })
    .filter(c => c.Titre || c.Editeur);
}

function getSheetCover(c) {
  const direct = clean(c.Covers);
  if (/^https?:\/\//i.test(direct)) return direct;
  const planche = clean(c.Planche);
  if (/^https?:\/\//i.test(planche)) return planche;
  return "";
}

function getSagaName(c) {
  return clean(c.Equipe) || clean(c.Periode) || clean(c.Titre);
}

function parseDate(s) {
  if (!s) return 0;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0;
}

function issueNum(s) {
  const n = parseFloat(String(s || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function publisherList() {
  return [...new Set(comics.map(c => clean(c.Editeur)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
}

function sagaList(baseList = comics) {
  const counts = {};
  baseList.forEach(c => {
    const s = getSagaName(c);
    if (s) counts[s] = (counts[s] || 0) + 1;
  });
  return Object.entries(counts)
    .filter(([, count]) => count >= 2 || baseList.length <= 60)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([name, count]) => ({ name, count }));
}

function getFiltered() {
  const q = $("search").value.toLocaleLowerCase("fr").trim();
  let list = comics.filter(c => {
    const pubOk = currentPublisher === "Tous" || clean(c.Editeur) === currentPublisher;
    const sagaOk = currentSaga === "Toutes" || getSagaName(c) === currentSaga;
    return pubOk && sagaOk;
  });
  if (q) list = list.filter(c => ["Titre", "num", "vo", "vf", "Editeur", "Equipe", "Periode", "Auteur", "Dessinateur"].some(k => clean(c[k]).toLocaleLowerCase("fr").includes(q)));
  const sort = $("sort").value;
  list.sort((a, b) => sort === "title" ? clean(a.Titre).localeCompare(clean(b.Titre), "fr") : sort === "number" ? issueNum(a.num) - issueNum(b.num) : sort === "date-asc" ? parseDate(a.Date) - parseDate(b.Date) : parseDate(b.Date) - parseDate(a.Date));
  return list;
}

function renderStats() {
  const pub = publisherList();
  const sagas = new Set(comics.map(getSagaName).filter(Boolean));
  const sheetsCount = comics.filter(c => getSheetCover(c)).length;
  $("stats").innerHTML = `
    <div class="stat"><strong>${comics.length.toLocaleString("fr-FR")}</strong><span>Comics lus</span></div>
    <div class="stat"><strong>${pub.length}</strong><span>Éditeurs</span></div>
    <div class="stat"><strong>${sagas.size.toLocaleString("fr-FR")}</strong><span>Sagas / Séries</span></div>
    <div class="stat"><strong>${sheetsCount.toLocaleString("fr-FR")}</strong><span>Jaquettes</span></div>
  `;
}

function renderTabs() {
  const counts = {};
  comics.forEach(c => { const p = clean(c.Editeur); if (p) counts[p] = (counts[p] || 0) + 1; });
  $("tabs").innerHTML = ["Tous", ...publisherList()].map(p => `<button class="tab ${p === currentPublisher ? "active" : ""}" data-publisher="${esc(p)}">${esc(p)}<small>${p === "Tous" ? comics.length : counts[p]}</small></button>`).join("");
  $("tabs").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    currentPublisher = b.dataset.publisher;
    currentSaga = "Toutes";
    currentPage = 1;
    renderTabs();
    renderSagaTabs();
    renderGrid();
  }));
}

function renderSagaTabs() {
  const sagaContainer = $("saga-tabs");
  if (!sagaContainer) return;
  const scoped = currentPublisher === "Tous"
    ? comics
    : comics.filter(c => clean(c.Editeur) === currentPublisher);
  const sagas = sagaList(scoped);
  if (currentSaga !== "Toutes" && !sagas.some(s => s.name === currentSaga)) {
    currentSaga = "Toutes";
  }
  const allItem = `<button class="tab ${currentSaga === "Toutes" ? "active" : ""}" data-saga="Toutes">Toutes les sagas<small>${scoped.length}</small></button>`;
  const items = sagas.map(s => `<button class="tab ${s.name === currentSaga ? "active" : ""}" data-saga="${esc(s.name)}">${esc(s.name)}<small>${s.count}</small></button>`).join("");
  sagaContainer.innerHTML = allItem + items;
  sagaContainer.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    currentSaga = b.dataset.saga;
    currentPage = 1;
    renderSagaTabs();
    renderGrid();
  }));
}

function publisherColor(pub) {
  const p = clean(pub).toLowerCase();
  if (p.includes("marvel")) return "rgba(237, 29, 36, 0.35)";
  if (p.includes("dc")) return "rgba(4, 118, 242, 0.35)";
  if (p.includes("image")) return "rgba(245, 158, 11, 0.32)";
  if (p.includes("urban")) return "rgba(56, 189, 248, 0.32)";
  if (p.includes("panini")) return "rgba(244, 63, 94, 0.32)";
  return "rgba(139, 92, 246, 0.3)";
}

function placeholder(c) {
  return `<div class="cover-placeholder" style="--ph-accent:${publisherColor(c.Editeur)}">
    <span class="ph-top">${esc(getSagaName(c) || "ARCHIVE")}</span>
    <b>${esc(c.Titre || "Comic")}</b>
    <small>${esc(c.Editeur || "COMIC BOOK")}</small>
  </div>`;
}

function isReread(c) {
  const v = clean(c["lu 2 fois"]).toLowerCase();
  return v && v !== "non" && v !== "0" && v !== "false";
}

function card(c, index) {
  const title = clean(c.Titre) || "Sans titre";
  const cover = getSheetCover(c);
  const saga = getSagaName(c);
  return `<article class="comic-card" data-index="${index}" tabindex="0" role="button" aria-label="Détails : ${esc(title)}">
    <div class="cover">
      ${placeholder(c)}
      ${cover ? `<img class="comic-cover-img" src="${esc(cover)}" alt="Couverture de ${esc(title)}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;">` : ""}
      ${c.num ? `<span class="issue" style="z-index:2;">#${esc(c.num)}</span>` : ""}
      ${isReread(c) ? `<span class="reread-badge" style="z-index:2;" title="Lu 2 fois">2×</span>` : ""}
    </div>
    <div class="comic-info">
      <div class="comic-title" title="${esc(title)}">${esc(title)}</div>
      <div class="comic-meta">${esc(saga || c.Editeur || "Éditeur inconnu")}${c.Date ? " · " + esc(c.Date) : ""}</div>
    </div>
  </article>`;
}

function bindCoverFallbacks() {
  $("grid").querySelectorAll(".comic-cover-img").forEach(img => {
    img.addEventListener("error", () => img.remove(), { once: true });
  });
}

function renderGrid() {
  const list = getFiltered(), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * PAGE_SIZE, visible = list.slice(start, start + PAGE_SIZE);
  $("grid").innerHTML = visible.map((c, i) => card(c, start + i)).join("");
  bindCoverFallbacks();
  $("result-count").textContent = `${list.length.toLocaleString("fr-FR")} résultat${list.length > 1 ? "s" : ""}`;
  $("empty").hidden = list.length !== 0;
  $("pagination").innerHTML = pages <= 1 ? "" : `
    <button class="page-btn" id="prev" ${currentPage === 1 ? "disabled" : ""}>← Précédent</button>
    <span class="result-count">Page ${currentPage} sur ${pages}</span>
    <button class="page-btn" id="next" ${currentPage === pages ? "disabled" : ""}>Suivant →</button>
  `;
  $("prev")?.addEventListener("click", () => { currentPage--; renderGrid(); window.scrollTo({ top: $("tabs").offsetTop - 90, behavior: "smooth" }); });
  $("next")?.addEventListener("click", () => { currentPage++; renderGrid(); window.scrollTo({ top: $("tabs").offsetTop - 90, behavior: "smooth" }); });
  $("grid").querySelectorAll(".comic-card").forEach(el => {
    const open = () => showDetail(list[Number(el.dataset.index)]);
    el.addEventListener("click", open);
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}

function showDetail(c) {
  const fields = [
    ["Date de lecture", c.Date],
    ["Éditeur", c.Editeur],
    ["Saga / Équipe", getSagaName(c)],
    ["Numéro", c.num ? "#" + c.num : ""],
    ["Titre VF", c.vf],
    ["Titre VO", c.vo],
    ["Période", c.Periode],
    ["Scénariste", c.Auteur],
    ["Dessinateur", c.Dessinateur]
  ];
  const cover = getSheetCover(c);
  $("detail-content").innerHTML = `
    <div class="detail-layout">
      <div>${cover ? `<img class="detail-cover" src="${esc(cover)}" alt="Couverture">` : `<div class="detail-cover">${placeholder(c)}</div>`}</div>
      <div>
        <div class="detail-badges">
          ${c.Editeur ? `<span class="detail-badge">${esc(c.Editeur)}</span>` : ""}
          ${getSagaName(c) ? `<span class="detail-badge">${esc(getSagaName(c))}</span>` : ""}
          ${c.num ? `<span class="detail-badge">N° ${esc(c.num)}</span>` : ""}
          ${isReread(c) ? `<span class="detail-badge reread">Lu 2 fois</span>` : ""}
        </div>
        <h3 class="detail-title">${esc(c.Titre || "Sans titre")}</h3>
        <div class="detail-list">
          ${fields.filter(x => clean(x[1])).map(x => `<div class="detail-field"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join("")}
        </div>
        ${c["Résumé"] ? `<p class="detail-summary">${esc(c["Résumé"])}</p>` : ""}
      </div>
    </div>
  `;
  const detailImg = $("detail-content").querySelector(".detail-cover[src]");
  if (detailImg) {
    detailImg.addEventListener("error", () => {
      detailImg.replaceWith(Object.assign(document.createElement("div"), {
        className: "detail-cover",
        innerHTML: placeholder(c)
      }));
    }, { once: true });
  }
  $("detail-dialog").showModal();
}

$("dialog-close").addEventListener("click", () => $("detail-dialog").close());
$("detail-dialog").addEventListener("click", e => { if (e.target === $("detail-dialog")) $("detail-dialog").close(); });
$("search").addEventListener("input", () => { currentPage = 1; renderGrid(); });
$("sort").addEventListener("change", () => { currentPage = 1; renderGrid(); });

async function loadComics() {
  const status = $("connection-status");
  const dot = $("live-dot");
  try {
    status.textContent = "Synchronisation Google Sheets…";
    const response = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!response.ok) throw Error(`Google Sheets a répondu avec le statut ${response.status}.`);
    const csv = await response.text();
    if (csv.trim().startsWith("<!DOCTYPE") || csv.trim().startsWith("<html")) {
      throw Error("Google Sheets a renvoyé une page HTML (connexion requise ou export bloqué).");
    }
    comics = rowsToComics(csv);
    status.textContent = "Connecté à Google Sheets";
    status.classList.add("connected");
    dot.classList.add("connected");
    renderStats();
    renderTabs();
    renderSagaTabs();
    renderGrid();
  } catch (err) {
    status.textContent = "Erreur Google Sheets";
    status.title = err.message;
    $("grid").innerHTML = `<div class="empty" style="grid-column: 1 / -1;">
      <strong>Connexion à Google Sheets impossible</strong><br><br>
      ${esc(err.message)}
    </div>`;
  }
}

loadComics();
