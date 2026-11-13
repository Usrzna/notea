# Notéa

Notéa aide les élèves dys et TDAH à comprendre, apprendre et retenir leurs cours.
**Conçu pour les dys, utile à tous.**

## Lancer l'appli

C'est un site statique : pas d'installation. Ouvre `index.html` avec un petit serveur local :

```bash
npx http-server . -p 4173
```

Tout reste sur l'appareil de l'élève (localStorage). Rien n'est envoyé.

## Ce que fait l'appli

- **Aujourd'hui** : la révision du jour (répétition espacée inspirée de FSRS), XP et plumes.
- **Mes cours** : import (photo, PDF, Word, PowerPoint, texte), analyse du cours, notions à trous.
- **Lire et écouter** : le cours lu à voix haute, le mot lu s'allume, marque « Je ne comprends pas ».
- **Carnet de mots** : mots difficiles, définition avec ses mots, familles de mots.
- **Feuille blanche**, **Carte mentale**, **Discussion** avec une IA.
- **Quiz et jeux**, **Examen blanc** (avec tiers-temps).
- **Mon planning**, **Imprimer**, **Réglages** d'accessibilité (toujours gratuits).

Écoute (transcription en direct) est en pause : elle n'est pas dans cette version.

## Design

Style « collage » (référence de Simon) : lilas pastel, police Nunito, boutons en dégradé violet, tuiles pastel, singe mascotte (`img/`).
Base : Digital Productivity Ecosystem, référentiel v2.0.
Tokens dans `css/notea.css` : couleurs sémantiques clair et sombre, grille de 4 pt, rayons, mouvement.
Le verre est réservé à la navigation et aux barres d'outils. Le contenu repose sur des surfaces opaques.

## Fichiers

- `index.html` : les écrans.
- `css/notea.css` : le design system.
- `js/app.js` : le moteur.
- `lib/` : lecture des fichiers Word (mammoth) et PDF (pdf.js), avec leurs licences.

Origine du code : dépôt `Larazdk/handicap`, dossier `ecoute` (Apprendre, version 66).
