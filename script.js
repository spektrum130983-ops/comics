// Connexion exclusive à Google Sheets (onglet gid=0) via JSONP (évite les blocages CORS).
const SHEET_ID = "1-Gwoxyi5A3h2DmtCrX_ySN8sBu0irqWMykvjpHB7b1w";
const SHEET_GID = "0";
let comics = [], currentPublisher = "Tous", currentPage = 1;
const PAGE_SIZE = 48;
const $ = id => document.getElementById(id);
const clean = v => v == null ? "" : String(v).trim();
const esc = s => clean(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function gvizTableToComics(table) {
  if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) {
    throw Error("Format de réponse Google Sheets inattendu.");
  }
  const headers = table.cols.map(col => clean(col.label || col.id));
  const wanted = ["Date", "Titre", "num", "vf", "vo", "Editeur", "Equipe", "Periode", "Auteur", "Dessinateur", "Résumé", "Covers", "Planche", "lu 2 fois"];
  const indexes = wanted.map(h => headers.indexOf(h));
  if (indexes[1] === -1 || indexes[5] === -1) {
    throw Error("Colonnes « Titre » et « Editeur » introuvables dans la première ligne de l'onglet.");
  }
  return table.rows.map(r => {
    const cells = Array.isArray(r.c) ? r.c : [];
    const c = {};
    wanted.forEach((h, i) => {
      const idx = indexes[i];
      const cell = idx >= 0 ? cells[idx] : null;
      const val = cell ? (cell.f != null && cell.f !== "" ? cell.f : cell.v) : "";
      c[h] = clean(val);
    });
    return c;
  }).filter(c => c.Titre || c.Editeur);
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
    <div class="stat"><strong>${comics.filter(c => clean(c.Covers)).length.toLocaleString("fr-FR")}</strong><span>Couvertures HD</span></div>
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

function card(c, index) {
  const title = clean(c.Titre) || "Sans titre", cover = clean(c.Covers);
  return `<article class="comic-card" data-index="${index}" tabindex="0" role="button" aria-label="Détails : ${esc(title)}">
    <div class="cover">
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
  $("grid").innerHTML = visible.map((c, i) => card(c, start + i)).join("");
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
    ["Numéro", c.num ? "#" + c.num : ""],
    ["Titre VF", c.vf],
    ["Titre VO", c.vo],
    ["Équipe / Univers", c.Equipe],
    ["Période", c.Periode],
    ["Scénariste", c.Auteur],
    ["Dessinateur", c.Dessinateur]
  ];
  const cover = clean(c.Covers);
  $("detail-content").innerHTML = `
    <div class="detail-layout">
      <div>${cover ? `<img class="detail-cover" src="${esc(cover)}" alt="Couverture" onerror="this.style.display='none'">` : `<div class="detail-cover">${placeholder(c)}</div>`}</div>
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
}

$("dialog-close").addEventListener("click", () => $("detail-dialog").close());
$("detail-dialog").addEventListener("click", e => { if (e.target === $("detail-dialog")) $("detail-dialog").close(); });
$("search").addEventListener("input", () => { currentPage = 1; renderGrid(); });
$("sort").addEventListener("change", () => { currentPage = 1; renderGrid(); });

function fetchSheetJsonp() {
  return new Promise((resolve, reject) => {
    const callbackName = "__comicShelfGvizCb_" + Date.now();
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      cleanup();
      reject(Error("Délai dépassé lors de la connexion à Google Sheets."));
    }, 10000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (payload) => {
      cleanup();
      if (!payload || payload.status === "error") {
        const msg = payload?.errors?.[0]?.detailed_message || payload?.errors?.[0]?.message || "Google Sheets a refusé la lecture.";
        reject(Error(msg));
        return;
      }
      resolve(payload.table);
    };

    script.onerror = () => {
      cleanup();
      reject(Error("Impossible de charger le flux Google Sheets (vérifie l'accès réseau ou le partage du document)."));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(SHEET_ID)}/gviz/tq?gid=${encodeURIComponent(SHEET_GID)}&tqx=responseHandler:${callbackName}`;
    document.body.appendChild(script);
  });
}

async function loadComics() {
  const status = $("connection-status");
  const dot = $("live-dot");
  try {
    status.textContent = "Synchronisation Google Sheets…";
    const table = await fetchSheetJsonp();
    comics = gvizTableToComics(table);
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
