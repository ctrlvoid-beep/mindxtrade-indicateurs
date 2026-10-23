# Mind xTrade — bibliothèque d'indicateurs

Site statique (HTML/CSS/JS, sans build) hébergé sur **Vercel** et versionné sur **GitHub**.
Tout le contenu affiché (textes, versions, liens de téléchargement, historique) vient d'un seul fichier : `data/indicators.json`.

## Arborescence

```
index.html               page unique
assets/css/styles.css    design
assets/js/app.js         rendu à partir du JSON
data/indicators.json     catalogue : textes + versions des indicateurs
downloads/<id>/          archives zip (une par version) + guide PDF extrait
scripts/publish.mjs      publication d'une nouvelle version
vercel.json              en-têtes (téléchargement forcé des zip, cache)
```

## Publier une mise à jour d'indicateur

Une seule commande, depuis ce dossier :

```bash
node scripts/publish.mjs --id indicateur-01 --version 1.1.0 --zip "C:\chemin\MonIndicateur.zip" --notes "Correction du calcul|Nouveau paramètre" --push
```

Le script :

1. copie le zip dans `downloads/indicateur-01/indicateur-01-v1.1.0.zip` (les anciennes versions restent disponibles) ;
2. extrait le guide PDF de l'archive pour qu'il soit consultable en ligne ;
3. calcule la taille et l'empreinte SHA-256 ;
4. met à jour `data/indicators.json` (version courante + entrée dans l'historique) ;
5. avec `--push` : commit + push sur GitHub, et **Vercel redéploie automatiquement** en une trentaine de secondes.

Sans `--push`, vérifiez localement puis poussez vous-même (`git add -A`, `git commit`, `git push`).

## Modifier les textes

Éditez directement `data/indicators.json` : `name`, `tagline`, `description`, `features`, `useCases`, `platform`, `category`, `tags`.
`status` accepte `stable`, `beta` ou `soon`. Le lien YouTube se règle dans `site.youtube`.

## Mise en ligne initiale (une seule fois)

1. Créer un dépôt GitHub (par ex. `mindxtrade-indicateurs`) et y pousser ce dossier.
2. Sur vercel.com : *Add New → Project → Import* du dépôt. Framework : **Other**, aucune commande de build, dossier de sortie : racine.
3. Optionnel : brancher un nom de domaine dans *Settings → Domains*.

Ensuite, chaque `git push` sur `main` met le site à jour.

## Aperçu local

```bash
npx serve .
```

(Ouvrir `index.html` directement depuis l'explorateur ne fonctionne pas : le navigateur bloque la lecture du JSON en `file://`.)
