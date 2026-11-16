# Moteur de compréhension : où on en est

Mis à jour le 16 novembre 2026. À lire avant de reprendre le travail.

## Fait et testé

- Phases 1 à 5 de l'énoncé : audit, conception (`docs/MOTEUR.md`), moteurs 1 à 10, chaîne complète (`analyserCours`).
- 33 tests automatiques au vert (`node --test tests/moteur.test.js`).
- Mesures (`docs/MOTEUR-MESURES.md`) sur 3 lots :
  - 6 cours de réglage (droit, SVT, histoire, maths, économie, physique).
  - 1er lot inédit (géographie, français, gestion) : a servi à trouver des défauts généraux.
  - 2e lot inédit (SVT immunité, philosophie, informatique), écrit après la fin des réglages. **Premier passage : relations trouvées 40 %, justes 56 %.** Après 3 corrections de bugs généraux : 60 % / 65 % strict, 93 % / 100 % souple. Définitions trouvées : 100 %.
- Branché dans l'appli :
  - l'import garde les pages (PDF), les diapos (PowerPoint), les photos numérotées, et dans Word les titres, le gras, les listes et les tableaux ;
  - nouveau panneau « Ce que Notéa a compris » à la lecture d'un cours : matière, chapitre, alertes, notions clés avec importance, difficulté et pourquoi, ordre d'apprentissage, liens écrits dans le cours, bouton « Voir en carte mentale » ;
  - l'analyse est gardée avec le cours (`db.moteur`) et supprimée avec lui.

## Pas encore fait (prochaines étapes, dans l'ordre conseillé)

1. **Brancher les questions et le profil élève dans les révisions** : la révision du jour, les quiz et le prof particulier utilisent encore l'ancien système (notions à trous + FSRS). Prochaine étape : proposer les questions du moteur (`db.moteur[id].questions`) et enregistrer chaque réponse avec `NoteaMoteur.enregistrer`, puis bâtir la séance avec `prochaineSeance`.
2. **Faire valider les annotations par des enseignants** (`tests/corpus/*/reference.json`) et ajouter de vrais cours d'élèves (anonymes) : c'est la seule façon de mesurer la pertinence pédagogique réelle.
3. **Limites connues du découpage** :
   - les bornes des groupes nominaux (« globules » au lieu de « globules blancs », « production de lymphocytes mémoire ») ;
   - les noms entre guillemets (« boucle « tant que » ») ;
   - les définitions sans « est / désigne » (« L'actif regroupe ce que… »).
4. **Lecture d'images (schémas, manuscrit, graphiques)** : l'intégration est prête (`lireVision`, validation du JSON, test avec un faux modèle). Il reste à la brancher sur un fournisseur. Sur le web, il faut un petit serveur qui garde la clé API (jamais dans la page). Sans cela, les photos passent par l'OCR Tesseract de l'appli (texte seulement).
5. **Vitesse** : environ 1 s pour 4 000 mots, dans le fil principal. Pour de très longs cours, passer le moteur dans un Web Worker.
6. **Calibrer les poids** avec des notes d'enseignants (`NM.calibrer`).
7. **Carte mentale** : la fonction de dessin existante de l'appli chevauche parfois les bulles du haut quand une branche a 4 notions.

## Ce qui n'est pas possible sans données ou service externe

- Cartes géographiques et schémas anatomiques générés : pas sans l'image du cours (le moteur le dit au lieu d'inventer).
- Niveau scolaire exact : seulement s'il est écrit dans le document.
- Mesure de la progression réelle des élèves : il faut des élèves et du temps.
