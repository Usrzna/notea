# Notéa

Notéa aide les élèves dys et TDAH à comprendre, apprendre et retenir leurs cours.
**Conçu pour les dys, utile à tous.**

## Lancer l'appli

C'est un site statique : pas d'installation. Ouvre `index.html` avec un petit serveur local :

```bash
npx http-server . -p 4173
```

Les cours et la progression restent sur l'appareil de l'élève (localStorage). Seule l'IA passe par internet (voir « Compte Notéa et serveur »).

## Ce que fait l'appli

- **Aujourd'hui** : la révision du jour, XP et plumes. Algorithme FSRS-5 (celui d'Anki) : 3 boutons, 90 % de souvenir visé (95 % la semaine de l'examen), 20 notions par jour au plus, une seule matière par séance (v1.14 : à la fin, « J'arrête là » ou « Passer à … », jamais d'enchaînement automatique ; on peut lancer une matière ou un seul thème), mélange de matières toujours annoncé (quiz, jeu, trous, examen blanc), mode vacances, « Annuler ma dernière note ».
- **Rappel actif** : on peut écrire ou dicter la réponse avant de la voir.
- **Mes progrès** : ce que je retiens, mes 7 prochains jours, par matière. Jamais de reproche.
- **Thèmes** : clair (lilas), blanc, sombre, en un geste depuis le haut de la page.
- **Mes cours** : import (photo, PDF, Word, PowerPoint, texte), analyse du cours, notions à trous.
- **Lire et écouter** : le cours lu à voix haute, le mot lu s'allume, marque « Je ne comprends pas ».
- **Carnet de mots** : mots difficiles, définition avec ses mots, familles de mots.
- **Feuille blanche**, **Carte mentale**, **Discussion** avec une IA.
- **Quiz et jeux**, **Examen blanc** (avec tiers-temps).
- **Mon planning**, **Imprimer**, **Réglages** d'accessibilité (toujours gratuits).

## Moteur de compréhension (v1.4)

`js/moteur/` : lit un cours (pages, titres, tableaux, formules), trouve les notions, leurs liens et leur importance, construit un graphe, génère des questions reliées au cours, des schémas, et suit la maîtrise de l'élève. Sans serveur, sans IA obligatoire.
Depuis la v1.5, ses questions servent dans le Quiz, la révision du jour, l'examen blanc et le prof particulier, et chaque réponse nourrit le profil de l'élève (`db.profil`).
Détails : `docs/MOTEUR.md`. Où on en est : `docs/MOTEUR-AVANCEMENT.md`. Tests : `node --test tests/moteur.test.js` et `node tests/mesures.js`.

Écoute (transcription en direct) est en pause : elle n'est pas dans cette version.

## Écrans (version 1.2, d'après la maquette de Simon)

- **Accueil** : « Bonjour », 3 chiffres, la prochaine session.
- **Agenda & planning** : envoyer son emploi du temps (photo ou fichier lu sur l'appareil), planning, progrès, impression.
- **Mes cours** : un dossier par matière, import, lecture à voix haute.
- **Mon carnet** : notions triées (à retravailler, peu compris, réussies), feuille blanche, carte mentale, quiz, examen, mots.
- **Quiz** (version 1.3) : une carte qui se retourne. Au recto, la question et au moins 3 choix. Au verso : juste ou faux, la bonne réponse et l'explication. Formes de questions : définition, mot à retrouver, exemple à relier à sa notion, affirmations à démêler, dates, exercices et cartes de l'élève. Les mauvaises réponses viennent du même cours, du même chapitre et du même type de notion.
- **Comprendre** (version 1.7, dans Mes cours) : avec une clé Claude (Paramètres), l'IA lit le cours une seule fois et rend le plan (I, A, B…), les notions expliquées simplement avec un exemple, et des questions de compréhension autonomes (4 choix, une explication par choix). Le Quiz utilise ces questions à la place des questions automatiques de la matière. Appels via le SDK officiel `@anthropic-ai/sdk@1.4.0` chargé dans la page ; la clé reste dans le navigateur de l'élève. Modèle au choix : Opus 5.5 (par défaut), Sonnet 5.5, Haiku 5.5.
- **Mes examens** (version 1.6, dans Mon carnet) : on met la date du contrôle d'une matière. Notéa simule chaque jour jusqu'au jour J avec FSRS : nouvelles notions étalées pour tout avoir vu à J-3, chaque notion revue juste avant l'oubli et la veille, feuille blanche à J-3, examen blanc à J-2, révision finale à J-1, un quiz par semaine. La révision du jour suit ce plan (même calcul), et l'accueil dit quoi faire aujourd'hui.
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

## Compte Notéa et serveur (version 1.8)

L'IA marche sans clé : l'élève se connecte (lien magique par e-mail) et dépense des **crédits**. Depuis la v2.1, l'IA du serveur est **Gemini (Google), offre gratuite** : Gemini Flash, avec Flash-Lite en secours si Google est saturé.

- **Serveur** : Supabase, projet `notea` (Europe, Paris). Code dans `supabase/`.
- **Base** (`supabase/migrations/`) : `paliers` (offres), `profils` (crédits, palier, date de recharge, accord RGPD), `appels` (journal sans le texte des cours). RLS : chaque élève ne lit que sa ligne et n'écrit rien directement.
- **Edge Functions** (`supabase/functions/`) :
  - `comprendre` : même consigne et même schéma que `iaAnalyser`. 5 crédits. Cours de 120 000 caractères au plus. 3 appels par minute au plus.
  - `discuter` : le prof particulier. 1 crédit par réponse. 10 appels par minute au plus.
  - `supprimer-compte` : « Supprimer mon compte » (RGPD).
  - `stripe-webhook` : emplacement pour Stripe, pas déployé.
  - Si l'appel à Claude échoue, les crédits sont rendus.
- **La clé Gemini** est le secret `GEMINI_API_KEY` du projet Supabase (créée sur aistudio.google.com). Elle n'est jamais dans ce dépôt. La clé `anon` dans `js/app.js` est publique par conception.
- **Offres** (table `paliers`, modifiable sans toucher au code) : Gratuit 25 crédits par mois ; Essentiel 40, Plus 100, Max 250 crédits par semaine. Tous avec Gemini Flash pour l'instant (colonne `modele`). Prix à fixer, Stripe pas encore activé.
- **Consignes** : après un changement de `IA_SYSTEME`, `IA_SCHEMA`, `DC_BASE` ou `DC_MODES` dans `js/app.js`, lancer `node scripts/consignes.js` puis redéployer les fonctions.
- **Mode « ma propre clé »** : toujours là, en option dans Paramètres.
- **RGPD** : accord clair avant le premier envoi, écran « Mes données » (ce qui est gardé, journal, téléchargement, retirer l'accord, supprimer le compte).

## Fichiers

- `index.html` : les écrans.
- `css/notea.css` : le design system.
- `js/app.js` : le moteur.
- `supabase/` : le serveur (base et Edge Functions).
- `scripts/consignes.js` : recopie la consigne de l'IA vers le serveur.
- `lib/` : lecture des fichiers Word (mammoth) et PDF (pdf.js), avec leurs licences.

Origine du code : dépôt `Larazdk/handicap`, dossier `ecoute` (Apprendre, version 66).
