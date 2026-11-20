# Comicshelf — bibliothèque personnelle

Site statique personnalisé à partir du CSV fourni.

## Contenu
- `index.html` : structure du site
- `style.css` : thème sombre responsive
- `script.js` : filtres, recherche, tri, pagination et fiches détaillées
- `comics.json` : les 1 654 entrées importées depuis le fichier CSV

## Mise en ligne sur GitHub Pages
1. Crée un dépôt GitHub (par exemple `comicshelf`).
2. Envoie tous les fichiers de ce dossier à la racine du dépôt.
3. Ouvre **Settings → Pages**.
4. Dans **Build and deployment**, choisis **Deploy from a branch**.
5. Sélectionne la branche `main` et le dossier `/ (root)`, puis sauvegarde.
6. Attends la publication : GitHub affichera l'adresse de ton site dans la section Pages.

## Mise à jour des données
Le site lit `comics.json`. Pour actualiser la collection, remplace ce fichier par un nouvel export JSON construit à partir du CSV, puis envoie le changement sur GitHub.

## À savoir
- Les colonnes importées sont les 14 premières colonnes du CSV, correspondant aux champs de comics.
- Les colonnes de notes/statistiques annexes présentes à droite du tableau n'ont pas été interprétées comme des comics.
- Les 19 URL de jaquettes présentes dans le CSV sont conservées. Les autres entrées affichent une couverture de remplacement avec le titre et l'éditeur.
- Le site est une copie statique des données au moment de l'export : il ne se synchronise pas automatiquement avec Google Sheets.
