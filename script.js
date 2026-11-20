// Connexion directe à Google Sheets (Lecture comics 2026 — Feuille 1, gid=0)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1-Gwoxyi5A3h2DmtCrX_ySN8sBu0irqWMykvjpHB7b1w/gviz/tq?tqx=out:csv&gid=0";

let comics = [], currentPublisher = "Tous", currentPage = 1;
const PAGE_SIZE = 48;
const $ = id => document.getElementById(id);
const clean = v => v == null ? "" : String(v).trim();
const esc = s => clean(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Cache local des couvertures trouvées sur le web
const COVER_CACHE_KEY = "comicshelf_web_covers_v1";
let coverCache = {};
try {
  coverCache = JSON.parse(localStorage.getItem(COVER_CACHE_KEY) || "{}");
} catch (_) {
  coverCache = {};
}
const inFlightCovers = new Map();

function saveCoverCache() {
  try {
    localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(coverCache));
  } catch (_) {}
}

function comicCacheKey(c) {
  return `${clean(c.Editeur)}|${clean(c.Titre)}|${clean(c.num)}|${clean(c.vo)}`.toLowerCase();
}

async function fetchFromOpenLibrary(c) {
  const title = clean(c.Titre);
  const num = clean(c.num).replace(/^#/, "");
  const queryParts = [title, num ? `#${num}` : "", clean(c.Editeur)].filter(Boolean);
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(queryParts.join(" "))}&limit=6&fields=title,cover_i,publisher`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const docs = Array.isArray(data.docs) ? data.docs : [];
  const match = docs.find(d => d.cover_i);
  return match ? `https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg?default=false` : null;
}

async function fetchFromWikipedia(c) {
  const queries = [
    `${clean(c.Titre)} ${clean(c.num) ? "#" + clean(c.num) : ""} comic`.trim(),
    `${clean(c.vo)} comic`.trim(),
    `${clean(c.Titre)} (${clean(c.Editeur)} Comics)`.trim()
  ].filter(q => q.length > 6);

  for (const q of queries) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=500&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {});
    const withImg = pages.find(p => p.thumbnail?.source);
    if (withImg) return withImg.thumbnail.source;
  }
  return null;
}

async function resolveWebCover(c) {
  const key = comicCacheKey(c);
  if (key in coverCache) return coverCache[key] || null;
  if (inFlightCovers.has(key)) return inFlightCovers.get(key);

  const task = (async () => {
    let found = null;
    try {
      found = await fetchFromOpenLibrary(c);
      if (!found) found = await fetchFromWikipedia(c);
    } catch (_) {
      found = null;
    }
    coverCache[key] = found || "";
    saveCoverCache();
    inFlightCovers.delete(key);
    return found;
  })();

  inFlightCovers.set(key, task);
  return task;
}

function hydrateMissingCovers(visibleComics) {
  visibleComics.forEach((c, idx) => {
    if (clean(c.Covers)) return;
    const slot = document.querySelector(`[data-cover-slot="${idx}"]`);
    if (!slot) return;

    resolveWebCover(c).then(url => {
      if (!url) return;
      c._resolvedCover = url;
      const img = document.createElement("img");
      img.src = url;
      img.alt = `Couverture de ${clean(c.Titre) || "Comic"}`;
      img.loading = "lazy";
      img.onload = () => {
        if (img.naturalWidth > 20) {
          slot.querySelector(".cover-placeholder")?.remove();
          slot.prepend(img);
        }
      };
      img.onerror = () => {
        coverCache[comicCacheKey(c)] = "";
        saveCoverCache();
      };
    });
  });
}

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

const KNOWN_PUBLISHERS = ["marvel", "dc", "image", "dark horse", "vertigo", "valiant", "top cow", "urban", "panini", "delcourt", "soleil", "glénat"];

function normalizeComicRow(raw) {
  const c = { ...raw };
  const ed = clean(c.Editeur).toLowerCase();
  const isKnownEd = KNOWN_PUBLISHERS.some(p => ed === p || ed.startsWith(p + " "));

  if (!isKnownEd && clean(c.Editeur)) {
    const candidateEd = [c.vo, c.vf, c.Equipe].map(clean).find(v =>
      KNOWN_PUBLISHERS.some(p => v.toLowerCase() === p || v.toLowerCase().startsWith(p + " "))
    );
    if (candidateEd) {
      return {
        Date: c.Date,
        Titre: c.Titre,
        num: c.num,
        vf: "",
        vo: c.vf || c.vo,
        Editeur: c.vo,
        Equipe: c.Editeur,
        Periode: "",
        Auteur: c.Equipe,
        Dessinateur: c.Periode,
        Résumé: "",
        Covers: clean(c.Auteur).startsWith("http") ? c.Auteur : (clean(c.Dessinateur).startsWith("http") ? c.Dessinateur : c.Covers),
        Planche: c.Planche,
        "lu 2 fois": c["lu 2 fois"]
      };
    }
  }
  return c;
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
      return normalizeComicRow(c);
    })
    .filter(c => clean(c.Titre) && /^\d{2}\/\d{2}\/\d{4}$/.test(clean(c.Date)));
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

function getFiltered() {
  const q = $("search").value.toLocaleLowerCase("fr").trim();
  let list = comics.filter(c => (currentPublisher === "Tous" || clean(c.Editeur) === currentPublisher));
  if (q) list = list.filter(c => ["Titre", "num", "vo", "vf", "Editeur", "Equipe", "Auteur", "Dessinateur", "Periode"].some(k => clean(c[k]).toLocaleLowerCase("fr").includes(q)));
  const sort = $("sort").value;
  list.sort((a, b) => sort === "title" ? clean(a.Titre).localeCompare(clean(b.Titre), "fr") : sort === "number" ? issueNum(a.num) - issueNum(b.num) : sort === "date-asc" ? parseDate(a.Date) - parseDate(b.Date) : parseDate(b.Date) - parseDate(a.Date));
  return list;
}

function renderStats() {
  const pub = publisherList();
  $("stats").innerHTML = `
    <div class="stat"><strong>${comics.length.toLocaleString("fr-FR")}</strong><span>Comics lus</span></div>
    <div class="stat"><strong>${pub.length}</strong><span>Éditeurs</span></div>
    <div class="stat"><strong>${new Set(comics.map(c => clean(c.Titre)).filter(Boolean)).size.toLocaleString("fr-FR")}</strong><span>Séries / Titres</span></div>
    <div class="stat"><strong>${comics.filter(c => clean(c.Covers)).length.toLocaleString("fr-FR")}</strong><span>Jaquettes Sheets</span></div>
  `;
}

function renderTabs() {
  const counts = {};
  comics.forEach(c => { const p = clean(c.Editeur); if (p) counts[p] = (counts[p] || 0) + 1; });
  $("tabs").innerHTML = ["Tous", ...publisherList()].map(p => `<button class="tab ${p === currentPublisher ? "active" : ""}" data-publisher="${esc(p)}">${esc(p)}<small>${p === "Tous" ? comics.length : counts[p]}</small></button>`).join("");
  $("tabs").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    currentPublisher = b.dataset.publisher;
    currentPage = 1;
    renderTabs();
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
    <span class="ph-top">${esc(c.Periode || "ARCHIVE")}</span>
    <b>${esc(c.Titre || "Comic")}</b>
    <small>${esc(c.Editeur || "COMIC BOOK")}</small>
  </div>`;
}

function isReread(c) {
  const v = clean(c["lu 2 fois"]).toLowerCase();
  return v && v !== "non" && v !== "0" && v !== "false";
}

function card(c, index, slotIndex) {
  const title = clean(c.Titre) || "Sans titre";
  const cover = clean(c.Covers) || c._resolvedCover || coverCache[comicCacheKey(c)] || "";
  return `<article class="comic-card" data-index="${index}" tabindex="0" role="button" aria-label="Détails : ${esc(title)}">
    <div class="cover" data-cover-slot="${slotIndex}">
      ${cover ? `<img src="${esc(cover)}" alt="Couverture de ${esc(title)}" loading="lazy" onerror="this.remove();this.parentElement.insertAdjacentHTML('beforeend', '${placeholder(c).replace(/'/g, "&#39;")}')">` : placeholder(c)}
      ${c.num ? `<span class="issue">#${esc(c.num)}</span>` : ""}
      ${isReread(c) ? `<span class="reread-badge" title="Lu 2 fois">2×</span>` : ""}
    </div>
    <div class="comic-info">
      <div class="comic-title" title="${esc(title)}">${esc(title)}</div>
      <div class="comic-meta">${esc(c.Editeur || "Éditeur inconnu")}${c.Equipe ? " · " + esc(c.Equipe) : c.Date ? " · " + esc(c.Date) : ""}</div>
    </div>
  </article>`;
}

function renderGrid() {
  const list = getFiltered(), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * PAGE_SIZE, visible = list.slice(start, start + PAGE_SIZE);
  $("grid").innerHTML = visible.map((c, i) => card(c, start + i, i)).join("");
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

  // Recherche automatique des jaquettes manquantes pour la page affichée
  hydrateMissingCovers(visible);
}

async function showDetail(c) {
  const fields = [
    ["Date de lecture", c.Date],
    ["Éditeur", c.Editeur],
    ["Numéro", c.num ? "#" + c.num : ""],
    ["Titre VF", c.vf],
    ["Titre VO", c.vo],
    ["Équipe / Univers", c.Equipe],
    ["Période", c.Periode],
    ["Scénariste", c.Auteur],
    ["Dessinateur", c.Dessinateur]
  ];
  const cover = clean(c.Covers) || c._resolvedCover || coverCache[comicCacheKey(c)] || "";
  $("detail-content").innerHTML = `
    <div class="detail-layout">
      <div id="detail-cover-wrap">${cover ? `<img class="detail-cover" src="${esc(cover)}" alt="Couverture" onerror="this.style.display='none'">` : `<div class="detail-cover">${placeholder(c)}</div>`}</div>
      <div>
        <div class="detail-badges">
          ${c.Editeur ? `<span class="detail-badge">${esc(c.Editeur)}</span>` : ""}
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
  $("detail-dialog").showModal();

  if (!cover) {
    const found = await resolveWebCover(c);
    const wrap = $("detail-cover-wrap");
    if (found && wrap && $("detail-dialog").open) {
      wrap.innerHTML = `<img class="detail-cover" src="${esc(found)}" alt="Couverture">`;
    }
  }
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
