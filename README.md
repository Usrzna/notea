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

- **Aujourd'hui** : la révision du jour, XP et plumes. Algorithme FSRS-5 (celui d'Anki) : 3 boutons, 90 % de souvenir visé (95 % la semaine de l'examen), 20 notions par jour au plus, matières mélangées, mode vacances, « Annuler ma dernière note ».
- **Rappel actif** : on peut écrire ou dicter la réponse avant de la voir.
- **Mes progrès** : ce que je retiens, mes 7 prochains jours, par matière. Jamais de reproche.
- **Thèmes** : clair (lilas), blanc, sombre, en un geste depuis le haut de la page.
- **Mes cours** : import (photo, PDF, Word, PowerPoint, texte), analyse du cours, notions à trous.
- **Lire et écouter** : le cours lu à voix haute, le mot lu s'allume, marque « Je ne comprends pas ».
- **Carnet de mots** : mots difficiles, définition avec ses mots, familles de mots.
- **Feuille blanche**, **Carte mentale**, **Discussion** avec une IA.
- **Quiz et jeux**, **Examen blanc** (avec tiers-temps).
- **Mon planning**, **Imprimer**, **Réglages** d'accessibilité (toujours gratuits).

Écoute (transcription en direct) est en pause : elle n'est pas dans cette version.

## Écrans (version 1.2, d'après la maquette de Simon)

- **Accueil** : « Bonjour », 3 chiffres, la prochaine session.
- **Agenda & planning** : envoyer son emploi du temps (photo ou fichier lu sur l'appareil), planning, progrès, impression.
- **Mes cours** : un dossier par matière, import, lecture à voix haute.
- **Mon carnet** : notions triées (à retravailler, peu compris, réussies), feuille blanche, carte mentale, quiz, examen, mots.
- **Quiz** (version 1.3) : une carte qui se retourne. Au recto, la question et au moins 3 choix. Au verso : juste ou faux, la bonne réponse et l'explication. Formes de questions : définition, mot à retrouver, exemple à relier à sa notion, affirmations à démêler, dates, exercices et cartes de l'élève. Les mauvaises réponses viennent du même cours, du même chapitre et du même type de notion.
- **Questions à trous** : un outil à part (Facile 3 choix, Moyen 4, Difficile à écrire).
- **Mes cartes** : recto et verso écrits par l'élève, rangés par chapitre, révisés avec FSRS.
- **Créer à la main** (Mes cours) : écrire son cours, ses notions (définition, concept, formule, date, à retenir, règle), ses exercices avec leurs pièges.
- **Prof particulier** : l'IA pose les questions, avec « Un indice » et « Explique-moi ».
- **Accessibilité** et **Paramètres**.

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
