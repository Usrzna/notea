# Notéa : audit de l'IA (Gemini) et nouveau cerveau pédagogique

22 novembre 2026. Version 2.2.

## 1. Ce qui se passait avant (v2.1)

| Étape | Comment | Problème |
|---|---|---|
| Import d'un cours | Le moteur local (`js/moteur`) découpe le texte et `parcours.js` crée une notion **par phrase** du cours. Pas d'IA. | C'est l'origine des questions « phrase recopiée ». Le moteur repère des phrases, il ne comprend pas le sens. |
| IA (« Comprendre ») | Écran à part, sur demande. **Un seul appel** demande en même temps le plan, les notions et 30 questions. | L'IA fait tout d'un coup, sans recul : elle écrit les questions en même temps qu'elle lit. |
| Réglage Gemini | Réflexion « low », et repli sur Flash-Lite quand Flash est saturé. | Analyse peu profonde. Flash-Lite trouvait 3 ou 4 notions sur un cours qui en a 7. |
| Notions de l'IA | Gardées à part (`db.ia`), **jamais reliées** aux notions de l'appli. | Les réponses aux questions de l'IA ne comptaient pas dans le suivi (5 dimensions, FSRS). Deux systèmes en parallèle. |
| Questions | Toutes en QCM à 4 choix, 3 « objectifs » seulement. | Pas d'explication, de raisonnement, de restitution, d'exercice. Une question développée était évaluée comme un QCM. |
| Correction | Le QCM dit juste ou faux. Les réponses écrites sont comparées par mots-clés sur l'appareil. | On ne sait pas **pourquoi** l'élève s'est trompé (oubli, confusion, raisonnement…). |
| Prof particulier | Reçoit la liste des notions. | Ne connaît ni les difficultés de l'élève ni la meilleure méthode. Répète la même explication. |
| Mémoire entre séances | FSRS et dimensions sur l'appareil. | Rien de tout ça n'était donné à l'IA. |

## 2. Ce qui change (v2.2)

1. **Analyse en 2 étapes** (fonction serveur `comprendre`, `etape`).
   - **Étape 1, comprendre** (réflexion « medium ») : objectif du cours, type de matière, plan, notions avec importance, ce qui est attendu (mémoriser, expliquer, raisonner, appliquer), « à retenir » exact, prérequis, confusions, erreurs fréquentes, **méthode d'apprentissage choisie pour la notion** et son contenu (analogie, étapes, tableau, moyen mnémotechnique…), liens entre notions, et ce qu'il **ne faut pas** apprendre.
   - **Étape 2, questions** : écrites **à partir de l'analyse**, pas des phrases. 9 types (définition, compréhension, explication, raisonnement, mémorisation, application, comparaison, restitution, exercice), 3 formats (QCM, réponse courte, réponse développée). Chaque question a un objectif, une réponse attendue et des points clés. Les mauvais choix des QCM viennent des confusions repérées à l'étape 1.
2. **Les notions de l'IA deviennent les notions de l'appli.** Elles remplacent les notions « phrase » du même cours pas encore travaillées. Révision du jour, FSRS, 5 dimensions et prérequis marchent dessus.
3. **Correction par l'IA** (fonction `corriger`) pour les réponses écrites : note sur les points clés (l'orthographe ne compte pas), et **cause** : absence de connaissance, incompréhension, oubli, confusion, erreur de raisonnement, réponse incomplète, difficulté d'application. Gratuit en crédits.
4. **Adaptation.** La cause est gardée sur la notion. Les questions suivantes visent cette cause (confusion → comparaison, incompréhension → explication, oubli → mémorisation, application → exercice).
5. **Prof particulier** : reçoit pour chaque notion l'essentiel, la méthode conseillée, les confusions et les difficultés de l'élève. Il commence par ce qui bloque et **change de méthode** si l'élève ne comprend pas.
6. **Plus simple** : connecté, l'IA analyse le cours **toute seule** juste après l'import.
7. **Fiabilité** : plus de repli vers Flash-Lite pour l'analyse (trop faible) ; on attend Flash et on rend les crédits si Google est saturé.

## 3. Limites connues

- Cours de plus de 120 000 caractères : à couper (une analyse doit tenir en 150 s sur le serveur gratuit).
- Offre gratuite de Gemini : parfois saturée. L'élève voit « réessaie », ses crédits sont rendus.
- Mode « ma propre clé » : même analyse et mêmes questions ; la correction des réponses écrites demande un compte Notéa (sinon l'élève se note lui-même).

## 4. Version 2.4 (24 novembre 2026)

- **Fiche de compréhension faite une fois, à l'import.** Connecté, l'IA comprend le cours toute seule après l'import. La fiche (notions reformulées, méthodes, pièges, questions) est gardée dans Notéa ; chaque outil y pioche sans rappeler l'IA. Seule la correction d'une réponse écrite rappelle l'IA.
- **En arrière-plan.** L'élève révise tout de suite. Un petit bandeau montre où en est l'IA. Ce qui est fait est gardé : si l'appli se ferme, l'IA reprend à la prochaine ouverture (`db.iaAFaire`, `parts`).
- **Gros cours en morceaux** d'environ 11 000 caractères, coupés aux titres, réunis ensuite en une seule fiche (`iaMorceaux`, `iaFusion`). 1 crédit par morceau pour comprendre, 1 pour les questions.
- **Deux IA gratuites.** Groq (`GROQ_API_KEY`, modèle gpt-oss) d'abord pour les morceaux, la correction et le prof : 2 à 20 s. Gemini en secours (et pour un cours qui ne tient pas chez Groq). Limite connue de Groq gratuit : 8 000 jetons par minute.
- **Moteur local** (sans IA, ou cours pas encore compris) : le mot à trouver est caché partout ; les questions dont la réponse se lit dans l'énoncé sont écartées. Un cours compris par l'IA n'utilise plus les questions du moteur local.
- **Serveur** : les fonctions importent le code commun depuis GitHub à une version figée (`cdn.jsdelivr.net/gh/Usrzna/notea@<commit>/supabase/functions/_shared/…`). Pour redéployer : pousser, puis déployer `index.ts` avec le nouveau commit.
- **Mesuré sur une vraie fiche** (Communication commerciale, 24 000 caractères) : import en 4 s, révision possible tout de suite ; fiche IA complète (27 notions, 33 questions, aucune réponse dans l'énoncé) en arrière-plan ; correction d'une réponse écrite en 2 s.
