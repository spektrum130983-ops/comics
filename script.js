// Connexion directe en lecture à Google Sheets (onglet gid=0).
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1-Gwoxyi5A3h2DmtCrX_ySN8sBu0irqWMykvjpHB7b1w/gviz/tq?tqx=out:csv&gid=0";
let comics=[], currentPublisher="Tous", currentPage=1;
const PAGE_SIZE=48;
const $=id=>document.getElementById(id);
const clean=v=>v==null?"":String(v).trim();
const esc=s=>clean(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function parseCSV(text){
 const rows=[];let row=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i],next=text[i+1];
  if(quoted){if(ch==='"'&&next==='"'){field+='"';i++}else if(ch==='"')quoted=false;else field+=ch}
  else if(ch==='"')quoted=true;
  else if(ch===","){row.push(field);field=""}
  else if(ch==="\\n"){row.push(field);rows.push(row);row=[];field=""}
  else if(ch!=="\\r")field+=ch;
 }
 if(field.length||row.length){row.push(field);rows.push(row)}
 return rows;
}
function rowsToComics(csv){
 const rows=parseCSV(csv);
 if(rows.length<2)throw Error("La feuille Google Sheets ne contient aucune ligne exploitable.");
 const headers=rows[0].map(x=>clean(x).replace(/^\\uFEFF/,""));
 const wanted=["Date","Titre","num","vf","vo","Editeur","Equipe","Periode","Auteur","Dessinateur","Résumé","Covers","Planche","lu 2 fois"];
 const indexes=wanted.map(h=>headers.indexOf(h));
 if(indexes[1]===-1||indexes[5]===-1)throw Error("Colonnes « Titre » et « Editeur » introuvables. Vérifie la première ligne de l'onglet.");
 return rows.slice(1).map(r=>{
  const c={};wanted.forEach((h,i)=>{c[h]=indexes[i]>=0?clean(r[indexes[i]]):""});
  return c;
 }).filter(c=>c.Titre||c.Editeur);
}
function parseDate(s){if(!s)return 0;const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():0}
function issueNum(s){const n=parseFloat(String(s||"").replace(",", "."));return Number.isFinite(n)?n:0}
function publisherList(){return [...new Set(comics.map(c=>clean(c.Editeur)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fr"))}
function getFiltered(){
 const q=$("search").value.toLocaleLowerCase("fr").trim();
 let list=comics.filter(c=>(currentPublisher==="Tous"||clean(c.Editeur)===currentPublisher));
 if(q)list=list.filter(c=>["Titre","num","vo","vf","Editeur","Equipe","Auteur","Dessinateur","Periode"].some(k=>clean(c[k]).toLocaleLowerCase("fr").includes(q)));
 const sort=$("sort").value;
 list.sort((a,b)=>sort==="title"?clean(a.Titre).localeCompare(clean(b.Titre),"fr"):sort==="number"?issueNum(a.num)-issueNum(b.num):sort==="date-asc"?parseDate(a.Date)-parseDate(b.Date):parseDate(b.Date)-parseDate(a.Date));
 return list;
}
function renderStats(){
 const pub=publisherList();
 $("stats").innerHTML=`<div class="stat"><strong>${comics.length.toLocaleString("fr-FR")}</strong><span>Comics référencés</span></div><div class="stat"><strong>${pub.length}</strong><span>Éditeurs</span></div><div class="stat"><strong>${new Set(comics.map(c=>clean(c.Titre)).filter(Boolean)).size}</strong><span>Séries / titres</span></div><div class="stat"><strong>${comics.filter(c=>clean(c.Covers)).length}</strong><span>Jaquettes disponibles</span></div>`;
}
function renderTabs(){
 const counts={};comics.forEach(c=>{const p=clean(c.Editeur);if(p)counts[p]=(counts[p]||0)+1});
 $("tabs").innerHTML=["Tous",...publisherList()].map(p=>`<button class="tab ${p===currentPublisher?"active":""}" data-publisher="${esc(p)}">${esc(p)}<small>${p==="Tous"?comics.length:counts[p]}</small></button>`).join("");
 $("tabs").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{currentPublisher=b.dataset.publisher;currentPage=1;renderTabs();renderGrid()}));
}
function placeholder(c){return `<div class="cover-placeholder"><span class="symbol">✦</span><b>${esc(c.Titre||"Comic")}</b><small>${esc(c.Editeur||"COMIC BOOK")}</small></div>`}
function card(c,index){
 const title=clean(c.Titre)||"Sans titre",cover=clean(c.Covers);
 return `<article class="comic-card" data-index="${index}" tabindex="0" role="button" aria-label="Détails : ${esc(title)}"><div class="cover">${cover?`<img src="${esc(cover)}" alt="Couverture de ${esc(title)}" loading="lazy" onerror="this.remove();this.parentElement.insertAdjacentHTML('beforeend', '${placeholder(c).replace(/'/g,"&#39;")}')">`:placeholder(c)}${c.num?`<span class="issue">#${esc(c.num)}</span>`:""}</div><div class="comic-info"><div class="comic-title" title="${esc(title)}">${esc(title)}</div><div class="comic-meta">${esc(c.Editeur||"Éditeur inconnu")} · ${esc(c.Equipe||c.Date||"")}</div></div></article>`;
}
function renderGrid(){
 const list=getFiltered(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));currentPage=Math.min(currentPage,pages);
 const start=(currentPage-1)*PAGE_SIZE,visible=list.slice(start,start+PAGE_SIZE);
 $("grid").innerHTML=visible.map((c,i)=>card(c,start+i)).join("");
 $("result-count").textContent=`${list.length.toLocaleString("fr-FR")} résultat${list.length>1?"s":""}`;
 $("empty").hidden=list.length!==0;
 $("pagination").innerHTML=pages<=1?"":`<button class="page-btn" id="prev" ${currentPage===1?"disabled":""}>←</button><span class="result-count">Page ${currentPage} / ${pages}</span><button class="page-btn" id="next" ${currentPage===pages?"disabled":""}>→</button>`;
 $("prev")?.addEventListener("click",()=>{currentPage--;renderGrid();window.scrollTo({top:$("tabs").offsetTop-20,behavior:"smooth"})});
 $("next")?.addEventListener("click",()=>{currentPage++;renderGrid();window.scrollTo({top:$("tabs").offsetTop-20,behavior:"smooth"})});
 $("grid").querySelectorAll(".comic-card").forEach(el=>{const open=()=>showDetail(list[Number(el.dataset.index)]);el.addEventListener("click",open);el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}})});
}
function showDetail(c){
 const fields=[["Date",c.Date],["Éditeur",c.Editeur],["Numéro",c.num],["Titre VF",c.vf],["Titre VO",c.vo],["Équipe",c.Equipe],["Période",c.Periode],["Scénariste",c.Auteur],["Dessinateur",c.Dessinateur]];
 const cover=clean(c.Covers);
 $("detail-content").innerHTML=`<div class="detail-layout"><div>${cover?`<img class="detail-cover" src="${esc(cover)}" alt="Couverture" onerror="this.style.display='none'">`:`<div class="detail-cover cover-placeholder">${placeholder(c)}</div>`}</div><div><h3 class="detail-title">${esc(c.Titre||"Sans titre")}</h3><div class="detail-sub">${esc(c.Editeur||"")} ${c.num?"· N° "+esc(c.num):""}</div><div class="detail-list">${fields.filter(x=>clean(x[1])).map(x=>`<div class="detail-field"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join("")}</div>${c["Résumé"]?`<p class="detail-summary">${esc(c["Résumé"])}</p>`:""}</div></div>`;
 $("detail-dialog").showModal();
}
$("dialog-close").addEventListener("click",()=>$("detail-dialog").close());
$("detail-dialog").addEventListener("click",e=>{if(e.target===$("detail-dialog"))$("detail-dialog").close()});
$("search").addEventListener("input",()=>{currentPage=1;renderGrid()});
$("sort").addEventListener("change",()=>{currentPage=1;renderGrid()});

async function loadComics(){
 const status=$("connection-status");
 try{
  status.textContent="Synchronisation Google Sheets…";
  const response=await fetch(SHEET_CSV_URL,{cache:"no-store"});
  if(!response.ok)throw Error("Google Sheets a refusé l'accès ("+response.status+").");
  const csv=await response.text();
  if(csv.trim().startsWith("<!DOCTYPE")||csv.trim().startsWith("<html"))throw Error("Google Sheets renvoie une page HTML : la feuille n'est probablement pas accessible en lecture publique.");
  comics=rowsToComics(csv);
  status.textContent="Connecté à Google Sheets";
  status.classList.add("connected");
  renderStats();renderTabs();renderGrid();
 }catch(err){
  status.textContent="Connexion Google Sheets impossible";
  status.title=err.message;
  $("grid").innerHTML=`<div class="empty">Impossible de lire ta feuille Google Sheets.<br><br>${esc(err.message)}<br><br>Dans Google Sheets, partage la feuille en mode « Tous les utilisateurs disposant du lien — Lecteur », puis recharge le site.</div>`;
 }
}
loadComics();
