# Comicshelf — connexion Google Sheets

Le site lit directement l'onglet `gid=0` de la feuille Google Sheets configurée dans `script.js`. Le navigateur recharge la feuille à chaque ouverture du site (cache désactivé).

## Autoriser la lecture
Dans Google Sheets :
1. Ouvre la feuille.
2. Clique sur **Partager**.
3. Dans **Accès général**, sélectionne **Tous les utilisateurs disposant du lien**.
4. Choisis le rôle **Lecteur** (pas Éditeur).
5. Enregistre.

Le site utilise un lien CSV de lecture Google Visualization. Il ne peut pas lire une feuille privée sans authentification. Ne publie pas de données confidentielles dans cette feuille.

## Déployer sur GitHub Pages
1. Remplace les anciens fichiers par les fichiers de cette archive dans le dépôt GitHub.
2. Conserve `index.html`, `style.css`, `script.js`, `comics.json` et ce README à la racine.
3. Vérifie Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
4. Recharge le site après la publication. L'état en haut à droite doit indiquer « Connecté à Google Sheets ».

## Colonnes utilisées
Date, Titre, num, vf, vo, Editeur, Equipe, Periode, Auteur, Dessinateur, Résumé, Covers, Planche, lu 2 fois.
Les colonnes doivent conserver ces intitulés sur la première ligne de l'onglet `gid=0`.

## Sécurité et limites
- Connexion en lecture seule : le site n'écrit et ne modifie jamais la feuille.
- Toute personne ayant accès au site peut consulter les données exposées par la feuille publique.
- Si tu ne souhaites pas rendre la feuille accessible par lien, il faudra mettre en place une authentification (par exemple OAuth ou un backend Apps Script protégé). Ne mets jamais une clé API privée ou un secret dans le JavaScript public.
