// Connexion directe à Google Sheets (Lecture comics 2026 — Feuille 1, gid=0)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1-Gwoxyi5A3h2DmtCrX_ySN8sBu0irqWMykvjpHB7b1w/gviz/tq?tqx=out:csv&gid=0";

let comics = [];
let currentPublisher = "Tous";
let currentTeam = "Toutes";
let currentPeriod = "Toutes";
let currentEvent = "Tous";
let onlyIssueOne = false;
let currentPage = 1;
let spotlightComic = null;

const ZOOM_FACTOR = 1.8;
let zoomState = {
  zoomed: false,
  panX: 0,
  panY: 0,
  dragging: false,
  moved: false,
  startX: 0,
  startY: 0,
  originPanX: 0,
  originPanY: 0
};

const PAGE_SIZE = 48;
const $ = id => document.getElementById(id);
const clean = v => v == null ? "" : String(v).trim();
const esc = s => clean(s).replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function findColIndex(headers, candidates) {
  const normHeaders = headers.map(h => clean(h).toLowerCase().replace(/\s+/g, ""));
  for (const cand of candidates) {
    const normCand = cand.toLowerCase().replace(/\s+/g, "");
    const idx = normHeaders.indexOf(normCand);
    if (idx !== -1) return idx;
  }
  for (const cand of candidates) {
    const normCand = cand.toLowerCase().replace(/\s+/g, "");
    const partialIdx = normHeaders.findIndex(h => h.includes(normCand));
    if (partialIdx !== -1) return partialIdx;
  }
  return -1;
}

function findExactColIndex(headers, candidates) {
  const normHeaders = headers.map(h => clean(h).toLowerCase().replace(/\s+/g, ""));
  for (const cand of candidates) {
    const idx = normHeaders.indexOf(cand.toLowerCase().replace(/\s+/g, ""));
    if (idx !== -1) return idx;
  }
  return -1;
}

function resolveNumColIndex(headers) {
  const idx = findColIndex(headers, ["num", "numero", "numéro", "n°", "no"]);
  if (idx !== -1) return idx;
  return headers.length > 2 ? 2 : -1;
}

function resolveIssueOneColIndex(headers) {
  const exactIdx = findExactColIndex(headers, ["#1", "1"]);
  if (exactIdx !== -1) return exactIdx;
  return headers.length > 14 ? 14 : -1;
}

function resolveEventColIndex(headers) {
  const idx = findColIndex(headers, ["event", "events", "événement", "evenement", "événements", "evenements"]);
  if (idx !== -1) return idx;
  return headers.length > 16 ? 16 : -1;
}

function rowsToComics(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) {
    throw Error("La feuille Google Sheets ne contient aucune ligne exploitable.");
  }
  const headers = rows[0].map(x => clean(x).replace(/^\uFEFF/, ""));

  const colMap = {
    Date: findColIndex(headers, ["Date"]),
    Titre: findColIndex(headers, ["Titre"]),
    num: resolveNumColIndex(headers),
    vf: findColIndex(headers, ["vf"]),
    vo: findColIndex(headers, ["vo"]),
    Editeur: findColIndex(headers, ["Editeur", "Éditeur"]),
    Equipe: findColIndex(headers, ["Equipe", "Équipe", "Equipes", "Équipes"]),
    Periode: findColIndex(headers, ["Periode", "Période"]),
    Event: resolveEventColIndex(headers),
    Auteur: findColIndex(headers, ["Auteur", "Scénariste"]),
    Dessinateur: findColIndex(headers, ["Dessinateur"]),
    "Résumé": findColIndex(headers, ["Résumé", "Resume"]),
    Covers: findColIndex(headers, ["Covers", "Cover", "Jaquette"]),
    Planche: findColIndex(headers, ["Planche", "Planches"]),
    "lu 2 fois": findColIndex(headers, ["lu 2 fois", "lu2fois"]),
    "#1": resolveIssueOneColIndex(headers)
  };

  if (colMap.Titre === -1 || colMap.Editeur === -1) {
    throw Error("Colonnes « Titre » et « Editeur » introuvables dans la première ligne de l'onglet.");
  }

  return rows.slice(1)
    .map((r, rowIdx) => {
      const c = { _rowIndex: rowIdx };
      Object.entries(colMap).forEach(([key, idx]) => {
        c[key] = idx >= 0 ? clean(r[idx]) : "";
      });
      return c;
    })
    .filter(c => c.Titre || c.Editeur);
}

function getValidUrl(val) {
  const s = clean(val);
  return /^https?:\/\//i.test(s) ? s : "";
}

function getSheetCover(c) {
  return getValidUrl(c.Covers);
}

function getSheetPlanche(c) {
  return getValidUrl(c.Planche);
}

function formatIssueNum(num) {
  const n = clean(num);
  if (!n) return "";
  return n.startsWith("#") ? n : `#${n}`;
}

function hasIssueOne(c) {
  const v = clean(c["#1"]);
  return v === "1" || v === "#1";
}

function parseDate(s) {
  const v = clean(s);
  if (!v) return NaN;

  let m = v.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();

  m = v.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2})$/);
  if (m) {
    const year = +m[3] >= 70 ? 1900 + +m[3] : 2000 + +m[3];
    return new Date(year, +m[2] - 1, +m[1]).getTime();
  }

  m = v.match(/^(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();

  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function issueNum(s) {
  const n = parseFloat(String(s || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function getScopeBase() {
  return onlyIssueOne ? comics.filter(hasIssueOne) : comics;
}

function publisherList(baseList = getScopeBase()) {
  return [...new Set(baseList.map(c => clean(c.Editeur)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr"));
}

function teamList(baseList = getScopeBase()) {
  const counts = {};
  baseList.forEach(c => {
    const eq = clean(c.Equipe);
    if (eq) counts[eq] = (counts[eq] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([name, count]) => ({ name, count }));
}

function periodList(baseList = getScopeBase()) {
  const counts = {};
  baseList.forEach(c => {
    const per = clean(c.Periode);
    if (per) counts[per] = (counts[per] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0], "fr", { numeric: true }))
    .map(([name, count]) => ({ name, count }));
}

function eventList(baseList = getScopeBase()) {
  const counts = {};
  baseList.forEach(c => {
    const ev = clean(c.Event);
    if (ev) counts[ev] = (counts[ev] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([name, count]) => ({ name, count }));
}

function getFiltered() {
  const q = $("search") ? $("search").value.toLocaleLowerCase("fr").trim() : "";
  let list = comics.filter(c => {
    const oneOk = !onlyIssueOne || hasIssueOne(c);
    const pubOk = currentPublisher === "Tous" || clean(c.Editeur) === currentPublisher;
    const teamOk = currentTeam === "Toutes" || clean(c.Equipe) === currentTeam;
    const periodOk = currentPeriod === "Toutes" || clean(c.Periode) === currentPeriod;
    const eventOk = currentEvent === "Tous" || clean(c.Event) === currentEvent;
    return oneOk && pubOk && teamOk && periodOk && eventOk;
  });

  if (q) {
    list = list.filter(c =>
      ["Titre", "num", "vo", "vf", "Editeur", "Equipe", "Periode", "Event", "Auteur", "Dessinateur"]
        .some(k => clean(c[k]).toLocaleLowerCase("fr").includes(q))
    );
  }

  const sort = $("sort") ? $("sort").value : "date-desc";
  const isAsc = sort === "date-asc";

  list.sort((a, b) => {
    if (sort === "title") {
      return clean(a.Titre).localeCompare(clean(b.Titre), "fr");
    }
    if (sort === "number") {
      return issueNum(a.num) - issueNum(b.num);
    }

    const da = parseDate(a.Date);
    const db = parseDate(b.Date);
    const aValid = Number.isFinite(da);
    const bValid = Number.isFinite(db);

    if (aValid && bValid && da !== db) {
      return isAsc ? da - db : db - da;
    }
    if (aValid && !bValid) {
      return isAsc ? -1 : 1;
    }
    if (!aValid && bValid) {
      return isAsc ? 1 : -1;
    }

    return isAsc ? a._rowIndex - b._rowIndex : b._rowIndex - a._rowIndex;
  });

  return list;
}

function renderSpotlight(attempts = 0) {
  const box = $("hero-spotlight");
  const cardEl = $("spotlight-card");
  const imgEl = $("spotlight-img");
  if (!box || !cardEl || !imgEl) return;

  const pool = getScopeBase().filter(c => getSheetCover(c));
  if (!pool.length || attempts > 8) {
    box.style.display = "none";
    return;
  }

  const candidates = pool.length > 1 && spotlightComic
    ? pool.filter(c => c !== spotlightComic)
    : pool;

  spotlightComic = candidates[Math.floor(Math.random() * candidates.length)];

  const cover = getSheetCover(spotlightComic);
  const issueLabel = formatIssueNum(spotlightComic.num);
  const title = clean(spotlightComic.Titre) || "Sans titre";
  const meta = [clean(spotlightComic.Editeur), clean(spotlightComic.Equipe), clean(spotlightComic.Periode)]
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");

  imgEl.onerror = () => {
    renderSpotlight(attempts + 1);
  };
  imgEl.src = cover;
  imgEl.alt = `Couverture de ${issueLabel ? issueLabel + " " : ""}${title}`;
  $("spotlight-issue").textContent = issueLabel || "ÉDITION";
  $("spotlight-title").textContent = title;
  $("spotlight-meta").textContent = meta || "Collection personnelle";

  box.style.display = "flex";
}

function ensureIssueOneFilterButton() {
  let btn = $("issue-one-filter-btn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "issue-one-filter-btn";
    btn.className = "issue-one-filter-btn";
    btn.title = "Afficher uniquement les comics où la colonne O vaut 1";

    const anchor = $("sort")?.parentElement || $("search")?.parentElement || $("result-count")?.parentElement;
    if (anchor) {
      anchor.appendChild(btn);
    } else if ($("tabs")?.parentElement) {
      $("tabs").parentElement.insertBefore(btn, $("tabs"));
    }

    btn.addEventListener("click", () => {
      onlyIssueOne = !onlyIssueOne;
      currentPublisher = "Tous";
      currentTeam = "Toutes";
      currentPeriod = "Toutes";
      currentEvent = "Tous";
      currentPage = 1;
      renderAllFilters();
      renderGrid();
      renderSpotlight();
    });
  }

  const totalOne = comics.filter(hasIssueOne).length;
  btn.classList.toggle("is-active", onlyIssueOne);
  btn.setAttribute("aria-pressed", String(onlyIssueOne));
  btn.innerHTML = `<span>✦ #1</span><small>${totalOne}</small>`;
}

function renderStats() {
  const base = getScopeBase();
  const pub = publisherList(base);
  const teams = new Set(base.map(c => clean(c.Equipe)).filter(Boolean));
  const periods = new Set(base.map(c => clean(c.Periode)).filter(Boolean));
  $("stats").innerHTML = `
    <div class="stat"><strong>${base.length.toLocaleString("fr-FR")}</strong><span>${onlyIssueOne ? "Numéros #1" : "Comics lus"}</span></div>
    <div class="stat"><strong>${pub.length}</strong><span>Éditeurs</span></div>
    <div class="stat"><strong>${teams.size.toLocaleString("fr-FR")}</strong><span>Équipes</span></div>
    <div class="stat"><strong>${periods.size.toLocaleString("fr-FR")}</strong><span>Périodes</span></div>
  `;
}

function renderTabs() {
  const base = getScopeBase();
  const pubs = publisherList(base);
  if (currentPublisher !== "Tous" && !pubs.includes(currentPublisher)) {
    currentPublisher = "Tous";
  }

  const counts = {};
  base.forEach(c => {
    const p = clean(c.Editeur);
    if (p) counts[p] = (counts[p] || 0) + 1;
  });

  $("tabs").innerHTML = ["Tous", ...pubs]
    .map(p => `<button class="tab ${p === currentPublisher ? "active" : ""}" data-publisher="${esc(p)}">${esc(p)}<small>${p === "Tous" ? base.length : counts[p]}</small></button>`)
    .join("");

  $("tabs").querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      currentPublisher = b.dataset.publisher;
      currentTeam = "Toutes";
      currentPeriod = "Toutes";
      currentEvent = "Tous";
      currentPage = 1;
      renderTabs();
      renderTeamTabs();
      renderPeriodTabs();
      renderEventTabs();
      renderGrid();
    });
  });
}

function renderTeamTabs() {
  const teamEl = $("team-tabs");
  if (!teamEl) return;
  const base = getScopeBase();
  const scoped = currentPublisher === "Tous"
    ? base
    : base.filter(c => clean(c.Editeur) === currentPublisher);
  const teams = teamList(scoped);
  if (currentTeam !== "Toutes" && !teams.some(t => t.name === currentTeam)) {
    currentTeam = "Toutes";
  }

  const allBtn = `<button class="tab ${currentTeam === "Toutes" ? "active" : ""}" data-team="Toutes">Toutes<small>${scoped.length}</small></button>`;
  const btns = teams
    .map(t => `<button class="tab ${t.name === currentTeam ? "active" : ""}" data-team="${esc(t.name)}">${esc(t.name)}<small>${t.count}</small></button>`)
    .join("");

  teamEl.innerHTML = allBtn + btns;
  teamEl.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      currentTeam = b.dataset.team;
      currentPeriod = "Toutes";
      currentEvent = "Tous";
      currentPage = 1;
      renderTeamTabs();
      renderPeriodTabs();
      renderEventTabs();
      renderGrid();
    });
  });
}

function renderPeriodTabs() {
  const periodEl = $("period-tabs");
  if (!periodEl) return;
  const base = getScopeBase();
  const scoped = base.filter(c => {
    const pubOk = currentPublisher === "Tous" || clean(c.Editeur) === currentPublisher;
    const teamOk = currentTeam === "Toutes" || clean(c.Equipe) === currentTeam;
    return pubOk && teamOk;
  });
  const periods = periodList(scoped);
  if (currentPeriod !== "Toutes" && !periods.some(p => p.name === currentPeriod)) {
    currentPeriod = "Toutes";
  }

  const allBtn = `<button class="tab ${currentPeriod === "Toutes" ? "active" : ""}" data-period="Toutes">Toutes<small>${scoped.length}</small></button>`;
  const btns = periods
    .map(p => `<button class="tab ${p.name === currentPeriod ? "active" : ""}" data-period="${esc(p.name)}">${esc(p.name)}<small>${p.count}</small></button>`)
    .join("");

  periodEl.innerHTML = allBtn + btns;
  periodEl.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      currentPeriod = b.dataset.period;
      currentEvent = "Tous";
      currentPage = 1;
      renderPeriodTabs();
      renderEventTabs();
      renderGrid();
    });
  });
}

function renderEventTabs() {
  const eventEl = $("event-tabs");
  if (!eventEl) return;
  const base = getScopeBase();
  const scoped = base.filter(c => {
    const pubOk = currentPublisher === "Tous" || clean(c.Editeur) === currentPublisher;
    const teamOk = currentTeam === "Toutes" || clean(c.Equipe) === currentTeam;
    const periodOk = currentPeriod === "Toutes" || clean(c.Periode) === currentPeriod;
    return pubOk && teamOk && periodOk;
  });
  const events = eventList(scoped);
  if (currentEvent !== "Tous" && !events.some(e => e.name === currentEvent)) {
    currentEvent = "Tous";
  }

  const allBtn = `<button class="tab ${currentEvent === "Tous" ? "active" : ""}" data-event="Tous">Tous<small>${scoped.length}</small></button>`;
  const btns = events
    .map(e => `<button class="tab ${e.name === currentEvent ? "active" : ""}" data-event="${esc(e.name)}">${esc(e.name)}<small>${e.count}</small></button>`)
    .join("");

  eventEl.innerHTML = allBtn + btns;
  eventEl.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      currentEvent = b.dataset.event;
      currentPage = 1;
      renderEventTabs();
      renderGrid();
    });
  });
}

function renderAllFilters() {
  ensureIssueOneFilterButton();
  renderStats();
  renderTabs();
  renderTeamTabs();
  renderPeriodTabs();
  renderEventTabs();
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
  const labelTop = clean(c.Periode) || clean(c.Equipe) || "ARCHIVE";
  return `<div class="cover-placeholder" style="--ph-accent:${publisherColor(c.Editeur)}">
    <span class="ph-top">${esc(labelTop)}</span>
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
  const issueLabel = formatIssueNum(c.num);
  const titleWithNum = issueLabel ? `${issueLabel} ${title}` : title;
  const metaParts = [clean(c.Equipe), clean(c.Periode), clean(c.Editeur)].filter(Boolean);
  const isOne = hasIssueOne(c);
  const goldClass = isOne ? " has-gold-halo" : "";
  const cardGoldClass = isOne ? " is-issue-one" : "";

  return `<article class="comic-card${cardGoldClass}" data-index="${index}" tabindex="0" role="button" aria-label="Détails : ${esc(titleWithNum)}">
    <div class="cover${goldClass}">
      ${placeholder(c)}
      ${cover ? `<img class="comic-cover-img" src="${esc(cover)}" alt="Couverture de ${esc(titleWithNum)}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;">` : ""}
      ${issueLabel ? `<span class="issue">${esc(issueLabel)}</span>` : ""}
      ${isReread(c) ? `<span class="reread-badge" style="z-index:5;" title="Lu 2 fois">2×</span>` : ""}
    </div>
    <div class="comic-info">
      <div class="comic-title" title="${esc(titleWithNum)}">${issueLabel ? `<span class="card-issue-prefix">${esc(issueLabel)}</span>` : ""}${esc(title)}</div>
      <div class="comic-meta">${esc(metaParts.slice(0, 2).join(" · ") || "Éditeur inconnu")}${c.Date ? " · " + esc(c.Date) : ""}</div>
    </div>
  </article>`;
}

function bindCoverFallbacks() {
  $("grid").querySelectorAll(".comic-cover-img").forEach(img => {
    img.addEventListener("error", () => img.remove(), { once: true });
  });
}

function renderGrid() {
  const list = getFiltered();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = list.slice(start, start + PAGE_SIZE);

  $("grid").innerHTML = visible.map((c, i) => card(c, start + i)).join("");
  bindCoverFallbacks();

  $("result-count").textContent = `${list.length.toLocaleString("fr-FR")} résultat${list.length > 1 ? "s" : ""}`;
  $("empty").hidden = list.length !== 0;

  $("pagination").innerHTML = pages <= 1 ? "" : `
    <button class="page-btn" id="prev" ${currentPage === 1 ? "disabled" : ""}>← Précédent</button>
    <span class="result-count">Page ${currentPage} sur ${pages}</span>
    <button class="page-btn" id="next" ${currentPage === pages ? "disabled" : ""}>Suivant →</button>
  `;

  $("prev")?.addEventListener("click", () => {
    currentPage--;
    renderGrid();
    window.scrollTo({ top: $("tabs").offsetTop - 90, behavior: "smooth" });
  });

  $("next")?.addEventListener("click", () => {
    currentPage++;
    renderGrid();
    window.scrollTo({ top: $("tabs").offsetTop - 90, behavior: "smooth" });
  });

  $("grid").querySelectorAll(".comic-card").forEach(el => {
    const open = () => showDetail(list[Number(el.dataset.index)]);
    el.addEventListener("click", open);
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function clampPan(stage, img, x, y) {
  if (!zoomState.zoomed || !stage || !img) return { x: 0, y: 0 };
  const stageRect = stage.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();
  const baseWidth = imgRect.width / (zoomState.zoomed ? ZOOM_FACTOR : 1);
  const baseHeight = imgRect.height / (zoomState.zoomed ? ZOOM_FACTOR : 1);
  const scaledWidth = baseWidth * ZOOM_FACTOR;
  const scaledHeight = baseHeight * ZOOM_FACTOR;

  const maxX = Math.max(0, (scaledWidth - stageRect.width) / 2 + stageRect.width * 0.15);
  const maxY = Math.max(0, (scaledHeight - stageRect.height) / 2 + stageRect.height * 0.15);

  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y))
  };
}

function applyImageTransform() {
  const img = $("lightbox-img");
  const zoomBtn = $("lightbox-zoom-btn");
  if (!img) return;
  if (!zoomState.zoomed) {
    img.style.transform = "translate3d(0px, 0px, 0px) scale(1)";
    img.classList.remove("is-zoomed");
    if (zoomBtn) zoomBtn.textContent = "Zoom +";
  } else {
    img.style.transform = `translate3d(${zoomState.panX}px, ${zoomState.panY}px, 0px) scale(${ZOOM_FACTOR})`;
    img.classList.add("is-zoomed");
    if (zoomBtn) zoomBtn.textContent = "Adapter à l'écran";
  }
}

function setZoomMode(enabled) {
  zoomState.zoomed = enabled;
  zoomState.panX = 0;
  zoomState.panY = 0;
  zoomState.dragging = false;
  zoomState.moved = false;
  $("lightbox-img")?.classList.remove("is-dragging");
  applyImageTransform();
}

function ensureLightboxDialog() {
  let dlg = $("lightbox-dialog");
  if (dlg) return dlg;

  dlg = document.createElement("dialog");
  dlg.id = "lightbox-dialog";
  dlg.className = "lightbox-dialog";
  dlg.innerHTML = `
    <div class="lightbox-inner">
      <div class="lightbox-toolbar">
        <span class="lightbox-title" id="lightbox-title">Aperçu</span>
        <div class="lightbox-actions">
          <button type="button" class="lightbox-btn" id="lightbox-zoom-btn">Zoom +</button>
          <button type="button" class="lightbox-btn" id="lightbox-close-btn">Fermer ✕</button>
        </div>
      </div>
      <div class="lightbox-stage" id="lightbox-stage">
        <img class="lightbox-img" id="lightbox-img" alt="Image agrandie">
      </div>
    </div>
  `;
  document.body.appendChild(dlg);

  const stage = $("lightbox-stage");
  const img = $("lightbox-img");
  const zoomBtn = $("lightbox-zoom-btn");

  zoomBtn.addEventListener("click", () => setZoomMode(!zoomState.zoomed));

  img.addEventListener("pointerdown", e => {
    if (!zoomState.zoomed) return;
    zoomState.dragging = true;
    zoomState.moved = false;
    zoomState.startX = e.clientX;
    zoomState.startY = e.clientY;
    zoomState.originPanX = zoomState.panX;
    zoomState.originPanY = zoomState.panY;
    img.classList.add("is-dragging");
    img.setPointerCapture(e.pointerId);
  });

  img.addEventListener("pointermove", e => {
    if (!zoomState.dragging || !zoomState.zoomed) return;
    const dx = e.clientX - zoomState.startX;
    const dy = e.clientY - zoomState.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      zoomState.moved = true;
    }
    const clamped = clampPan(stage, img, zoomState.originPanX + dx, zoomState.originPanY + dy);
    zoomState.panX = clamped.x;
    zoomState.panY = clamped.y;
    applyImageTransform();
  });

  const endDrag = e => {
    if (!zoomState.dragging) return;
    zoomState.dragging = false;
    img.classList.remove("is-dragging");
    if (img.hasPointerCapture && img.hasPointerCapture(e.pointerId)) {
      img.releasePointerCapture(e.pointerId);
    }
  };

  img.addEventListener("pointerup", endDrag);
  img.addEventListener("pointercancel", endDrag);

  img.addEventListener("click", () => {
    if (zoomState.moved) {
      zoomState.moved = false;
      return;
    }
    setZoomMode(!zoomState.zoomed);
  });

  $("lightbox-close-btn").addEventListener("click", () => {
    setZoomMode(false);
    dlg.close();
  });
  dlg.addEventListener("click", e => {
    if (e.target === dlg) {
      setZoomMode(false);
      dlg.close();
    }
  });
  dlg.addEventListener("close", () => setZoomMode(false));

  return dlg;
}

function openLightbox(src, label) {
  if (!src) return;
  const dlg = ensureLightboxDialog();
  const img = $("lightbox-img");
  const titleEl = $("lightbox-title");
  titleEl.textContent = label || "Aperçu";
  img.src = src;
  img.alt = label || "Image agrandie";
  setZoomMode(false);
  dlg.showModal();
}

function showDetail(c) {
  const issueLabel = formatIssueNum(c.num);
  const fields = [
    ["Numéro", issueLabel],
    ["Date de lecture", c.Date],
    ["Éditeur", c.Editeur],
    ["Équipe", c.Equipe],
    ["Période", c.Periode],
    ["Event", c.Event],
    ["Titre VF", c.vf],
    ["Titre VO", c.vo],
    ["Scénariste", c.Auteur],
    ["Dessinateur", c.Dessinateur]
  ];
  const cover = getSheetCover(c);
  const planche = getSheetPlanche(c);
  const baseTitle = clean(c.Titre) || "Sans titre";
  const fullSeriesTitle = issueLabel ? `${issueLabel} ${baseTitle}` : baseTitle;
  const goldClass = hasIssueOne(c) ? " has-gold-halo" : "";

  const coverCaption = issueLabel
    ? `<div class="cover-num-caption">${esc(issueLabel)} — ${esc(baseTitle)}</div>`
    : "";

  const coverCol = cover
    ? `<div class="detail-col-cover">
         <div class="zoomable-card${goldClass}" id="open-cover-zoom" title="Cliquer pour agrandir la jaquette">
           <img src="${esc(cover)}" alt="Jaquette de ${esc(fullSeriesTitle)}">
           <div class="zoom-label"><span>Jaquette</span><span>🔍 Agrandir</span></div>
         </div>
         ${coverCaption}
       </div>`
    : `<div class="detail-col-cover">
         <div class="detail-cover${goldClass}">${placeholder(c)}</div>
         ${coverCaption}
       </div>`;

  const plancheCol = planche
    ? `<div class="detail-col-planche">
         <div class="zoomable-card" id="open-planche-zoom" title="Cliquer pour agrandir la planche">
           <img src="${esc(planche)}" alt="Planche de ${esc(fullSeriesTitle)}">
           <div class="zoom-label"><span>Planche</span><span>🔍 Agrandir</span></div>
         </div>
       </div>`
    : "";

  $("detail-content").innerHTML = `
    <div class="detail-layout">
      ${coverCol}
      <div class="detail-col-info">
        <div class="detail-badges">
          ${c.Editeur ? `<span class="detail-badge">${esc(c.Editeur)}</span>` : ""}
          ${c.Equipe ? `<span class="detail-badge">${esc(c.Equipe)}</span>` : ""}
          ${c.Periode ? `<span class="detail-badge">${esc(c.Periode)}</span>` : ""}
          ${c.Event ? `<span class="detail-badge">${esc(c.Event)}</span>` : ""}
          ${issueLabel ? `<span class="detail-badge">${esc(issueLabel)}</span>` : ""}
          ${hasIssueOne(c) ? `<span class="detail-badge">#1</span>` : ""}
          ${isReread(c) ? `<span class="detail-badge reread">Lu 2 fois</span>` : ""}
        </div>
        <h3 class="detail-title">
          ${issueLabel ? `<span class="detail-issue-prefix">${esc(issueLabel)}</span>` : ""}${esc(baseTitle)}
        </h3>
        <div class="detail-list">
          ${fields.filter(x => clean(x[1])).map(x => `<div class="detail-field"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join("")}
        </div>
        ${c["Résumé"] ? `<p class="detail-summary">${esc(c["Résumé"])}</p>` : ""}
      </div>
      ${plancheCol}
    </div>
  `;

  const coverZoomEl = $("open-cover-zoom");
  if (coverZoomEl && cover) {
    coverZoomEl.addEventListener("click", () => openLightbox(cover, `Jaquette — ${fullSeriesTitle}`));
    coverZoomEl.querySelector("img")?.addEventListener("error", () => {
      coverZoomEl.replaceWith(Object.assign(document.createElement("div"), {
        className: `detail-cover${goldClass}`,
        innerHTML: placeholder(c)
      }));
    }, { once: true });
  }

  const plancheZoomEl = $("open-planche-zoom");
  if (plancheZoomEl && planche) {
    plancheZoomEl.addEventListener("click", () => openLightbox(planche, `Planche — ${fullSeriesTitle}`));
    plancheZoomEl.querySelector("img")?.addEventListener("error", () => {
      plancheZoomEl.closest(".detail-col-planche")?.remove();
    }, { once: true });
  }

  $("detail-dialog").showModal();
}

$("spotlight-card")?.addEventListener("click", () => {
  if (spotlightComic) showDetail(spotlightComic);
});

$("spotlight-card")?.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && spotlightComic) {
    e.preventDefault();
    showDetail(spotlightComic);
  }
});

$("spotlight-reroll")?.addEventListener("click", e => {
  e.stopPropagation();
  renderSpotlight();
});

$("dialog-close")?.addEventListener("click", () => $("detail-dialog").close());
$("detail-dialog")?.addEventListener("click", e => {
  if (e.target === $("detail-dialog")) $("detail-dialog").close();
});
$("search")?.addEventListener("input", () => {
  currentPage = 1;
  renderGrid();
});
$("sort")?.addEventListener("change", () => {
  currentPage = 1;
  renderGrid();
});

async function loadComics() {
  const status = $("connection-status");
  const dot = $("live-dot");
  try {
    if (status) status.textContent = "Synchronisation Google Sheets…";
    const response = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!response.ok) {
      throw Error(`Google Sheets a répondu avec le statut ${response.status}.`);
    }
    const csv = await response.text();
    if (csv.trim().startsWith("<!DOCTYPE") || csv.trim().startsWith("<html")) {
      throw Error("Google Sheets a renvoyé une page HTML (connexion requise ou export bloqué).");
    }
    comics = rowsToComics(csv);
    if (status) {
      status.textContent = "Connecté à Google Sheets";
      status.classList.add("connected");
    }
    if (dot) dot.classList.add("connected");
    renderAllFilters();
    renderGrid();
    renderSpotlight();
  } catch (err) {
    if (status) {
      status.textContent = "Erreur Google Sheets";
      status.title = err.message;
    }
    $("grid").innerHTML = `<div class="empty" style="grid-column: 1 / -1;">
      <strong>Connexion à Google Sheets impossible</strong><br><br>
      ${esc(err.message)}
    </div>`;
  }
}

loadComics();
