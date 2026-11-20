let comics = [];
let current = "Tous";

fetch("comics.json")
  .then(r => r.json())
  .then(data => { comics = data; render(); });

document.getElementById("search").addEventListener("input", render);

function render() {
  const q = document.getElementById("search").value.toLowerCase();
  const publishers = [...new Set(comics.map(c => c.editeur))].sort();
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";
  ["Tous", ...publishers].forEach(p => {
    const b = document.createElement("button");
    b.textContent = p;
    if (p === current) b.classList.add("active");
    b.onclick = () => { current = p; render(); };
    tabs.appendChild(b);
  });

  const grid = document.getElementById("grid");
  grid.innerHTML = comics
    .filter(c => (current === "Tous" || c.editeur === current)
      && c.titre.toLowerCase().includes(q))
    .map(c => `
      <div class="card">
        <img src="${c.image}" alt="${c.titre}" loading="lazy">
        <p>${c.titre}<small>${c.editeur}</small></p>
      </div>`).join("");
}
