# Moteur de compréhension pédagogique de Notéa

Le moteur lit un cours, le comprend (notions, liens, importance), comprend l'élève (ce qu'il maîtrise vraiment) et choisit la prochaine activité. Il est dans `js/moteur/`, en JavaScript sans dépendance, et marche dans le navigateur comme dans Node (tests).

## 1. Choix d'architecture (et pourquoi)

| Besoin | Choix | Raison |
|---|---|---|
| Où tourne le moteur | Dans l'appli, sur l'appareil | Notéa est un site statique ; les cours restent chez l'élève (promesse « rien n'est envoyé »). Pas de serveur à payer ni à sécuriser. |
| Langage | JavaScript, aucune bibliothèque | Même code dans le navigateur et dans les tests Node. Pas de dépendance à maintenir. |
| Python / FastAPI / PostgreSQL / Neo4j | **Pas retenus pour l'instant** | Ils supposent un serveur et des comptes. Utiles plus tard pour la synchronisation entre appareils ou le partage par un enseignant. Le modèle de données ci-dessous se transpose tel quel (tables ou nœuds). |
| Graphe | Objets + listes d'adjacence (`Map`) | Un cours = quelques dizaines à centaines de notions : parcours en millisecondes, pas besoin d'une base de graphe. |
| IA (LLM) | Optionnelle, derrière une seule fonction | `appelerModele({systeme, images, schema}) → JSON`. Changer de fournisseur = changer cette fonction. Sortie validée par schéma (`validerVision`). |
| Déterminisme | Même cours → même résultat | Identifiants tirés du texte (`hid`), mélanges à graine fixe : on peut tester et comparer. |

## 2. Les 10 moteurs

| Fichier | Moteur | Ce qu'il fait |
|---|---|---|
| `00-outils.js` | — | Racines françaises (`stem`), mots vides, mots trop généraux, verbes courants, distance d'édition, frontière Unicode `U()` (le `\b` de JavaScript ignore « à », « é »). |
| `01-ingestion.js` | 1 · Ingestion | Pages (repères « — page 3 — » posés par l'import), ordre des pages rétabli d'après les numéros imprimés, titres et niveaux, paragraphes, listes, tableaux, formules (dont chimie), légendes, flèches A → B, gras / souligné / surligné / capitales / encadrés, qualité de lecture par ligne (OCR), document coupé, page vide. Chaque bloc garde document, page, ligne, confiance. Lecture d'images (schémas, manuscrit) : `lireVision` avec un modèle de vision au choix. |
| `02-classification.js` | 2 · Classification | Matière parmi 12 disciplines (lexique + motifs), domaine, chapitre, sous-chapitres, niveau scolaire **seulement s'il est écrit**, type de cours, objectifs et prérequis annoncés. Statut : confirmé / déduit / inconnu. Nouvelle discipline : `NM.ajouterDiscipline(id, {nom, domaine, mots, motifs})`. |
| `03-semantique.js` | 3 · Sens (cœur) | Unités (phrases, éléments de liste, lignes de tableau), 25 types de connaissance, notions (termes définis, mis en évidence, titres, groupes nominaux qui reviennent, noms propres, sujets et compléments d'une relation, genre d'une définition), 16 types de relations, négations ignorées, contrôles (définitions contradictoires, liens circulaires, notion jamais définie, phrases mal lues). |
| `04-pertinence.js` | 4 · Importance et difficulté | Deux scores séparés sur 100, avec facteurs et justification en phrases. Poids réglables et calibrables (`NM.calibrer`). |
| `05-graphe.js` | 5 · Graphe | Nœuds et arêtes typées, PageRank (centralité), prérequis directs et en chaîne, ordre d'apprentissage (tri topologique, cycles cassés au lien le plus faible), notions transversales, liens douteux ou manquants, notions qui bloquent, fusion de plusieurs cours, export / import pour le stockage. |
| `06-pedagogie.js` | 6 · Pédagogie | Objectifs mesurables rangés par niveau de Bloom (1 Mémoriser → 6 Créer), dimensions (savoir, comprendre, expliquer, comparer, reconnaître, appliquer, calculer, démontrer, interpréter, relier), difficultés probables, erreurs probables tirées du cours (statut « déduit ») et base d'erreurs par discipline (statut « externe », jamais présentée comme écrite dans le cours). |
| `07-eleve.js` | 7 · Profil de l'élève | Preuves datées par notion, 8 niveaux de maîtrise, stabilité de mémoire façon FSRS, correction des réponses écrites sans IA (fautes d'orthographe pardonnées, confusion repérée), carte de maîtrise par cours. |
| `08-generation.js` | 8 · Génération | 17 types de questions, chacune avec notions, objectif, source (phrase + page), Bloom, difficulté, réponse attendue, corrigé, critères, erreurs à détecter, pertinence. QCM aux mots exacts du cours. Exercice de calcul tiré d'une formule du cours. Exercices guidé / autonome / progressif / étude de cas. Explications (simple, approfondie, étape par étape, exemple, contre-exemple, reformulation, erreurs) sans rien inventer. Choix des questions selon le niveau de l'élève. |
| `08b-qcm.js` | 8 bis · QCM de compréhension | 6 sortes : « laquelle est juste » (vraie définition contre celles des notions voisines, même sujet, même forme), cause et effet (variation inversée, effet porté sur une autre grandeur qui varie dans le cours), date (autres dates du cours), situation (exemple du cours, notion cachée, choix parmi sa famille), ordre, intrus (familles « sorte de »). Chaque mauvaise réponse est une erreur plausible avec son explication. Pas d'indice de longueur. Pas de piège qui pourrait être vrai (rien de ce qui découle de la même cause). Pas assez de pièges crédibles → pas de QCM. |
| `08c-examen.js` | 8 ter · Questions de contrôle | Consignes de prof (Définis, Distingue, Cite, Quelles sont les causes, Décris les étapes, Énonce, Donne la formule, Cas pratique, une question par partie du plan, questions du cours). Note `examen` /100 = poids du type dans la matière × (0,4 + 0,6 × poids de la notion pour le contrôle). Sous 30 : retirée. Liste rangée par note ; `pertinence` = examen / 100. |
| `09-schemas.js` | 9 · Schémas | Type choisi selon les liens : causes → causalité, dates → frise, « sorte de / partie de » → arbre, oppositions → tableau comparatif, formules → schéma de calcul, étapes → processus, sinon carte conceptuelle ; carte mentale d'après le plan. Sortie structurée + Mermaid + plan pour la carte mentale de Notéa. Contrôle : chaque lien a sa phrase, aucune notion hors du graphe, 12 notions au plus. |
| `10-adaptation.js` | 10 · Adaptation | Score de priorité S, prérequis non compris mis devant, activité selon le niveau, variété, temps disponible, révision espacée. |
| `11-pipeline.js` | Chaîne complète | `analyserCours(sources, opts)` : étapes 1 à 10 + contrôle qualité (aucune question sans source ni sur un passage douteux). `analyserCoursAvecVision` pour les photos. |

## 3. Les calculs

### Importance (moteur 4), sur 100

`Importance = 100 × Σ poids × facteur`, chaque facteur entre 0 et 1.

| Facteur | Poids | Calcul |
|---|---|---|
| Importance conceptuelle | 20 % | 0,5 × base + 0,5 × centralité (PageRank). Base : définie 1 ; mise en évidence ou titre 0,7 ; confirmée 0,5 ; déduite 0,2. |
| Dépendances | 15 % | 1 − e^(−d/2), d = notions qui en ont besoin (prérequis, condition, calcul, « dépend de » : 1 ; « sorte de » : 0,35 ; « partie de » : 0,5 ; ×0,7 si déduit). |
| Utilité pédagogique | 15 % | question du cours 0,5 + « à retenir » 0,3 + définition 0,4 + théorème/loi/principe 0,3 (plafonné à 1). |
| Objectifs du cours | 15 % | titre du chapitre 1 ; sous-titre 0,8 ; dans un objectif annoncé 0,9 ; mots en partie dans un titre 0,2 à 0,5. |
| Capacité explicative | 10 % | 1 − e^(−x/2), x = liens explicatifs sortants (explique, provoque, calcule, condition…). |
| Méthodologique | 10 % | présence dans méthode / formule / processus / théorème ; symbole de formule. |
| Exemples | 5 % | nombre d'exemples du cours / 2. |
| Mise en évidence | 5 % | gras, encadré, « à retenir ». |
| Répétition | 5 % | log(1 + phrases) / log(1 + max). La fréquence ne pèse que 5 %. |

### Difficulté (moteur 4 + 5), sur 100, séparée

Abstraction 20 % · prérequis en chaîne 20 % · vocabulaire technique 15 % · confusion avec une autre notion 15 % · longueur de la définition 10 % · calcul 10 % · chaîne de causes 5 % · conditions et exceptions 5 %.

### Priorité (moteur 10)

`S = 0,25 I + 0,20 (1 − M) + 0,15 D + 0,15 P + 0,10 O + 0,10 E + 0,05 V` (valeurs entre 0 et 1)
I importance · M maîtrise · D difficulté · P part des notions qui en dépendent · O risque d'oubli (1 − rétention FSRS) · E erreurs dans les 5 dernières réponses · V transfert (sections, cours, centralité). Réglable : `NM.priorites(g, profil, {poids: {...}})`.
Si un prérequis est sous le niveau 3 : S de la notion × 0,5 et S du prérequis + 0,1.

### Niveaux de maîtrise (moteur 7)

| Niveau | Condition |
|---|---|
| 0 Non évalué | aucune preuve |
| 1 Découverte | vue, ou seulement des erreurs |
| 2 Reconnaissance | au moins une bonne réponse (QCM ou rappel). **Une seule bonne réponse ne va jamais plus haut.** |
| 3 Compréhension partielle | une bonne réponse de compréhension + au moins 2 bonnes réponses en tout |
| 4 Compréhension correcte | 2 types différents réussis (rappel, reformulation, explication), dernière réponse juste, au plus 1 erreur récente |
| 5 Application maîtrisée | niveau 4 + dernière application réussie |
| 6 Mémorisation durable | niveau 4 + réussite après au moins 7 jours sans révision + stabilité ≥ 14 jours |
| 7 Maîtrise avancée | niveau 6 + application + transfert (ou 2 explications) |
| Redescente | 2 erreurs dans les 3 dernières réponses → niveau 3 au plus |

Mémoire : rétention R = (1 + 19/81 × jours / S)^−0,5 (FSRS). Après une réussite, S × (1,3 + 2,5 × (1 − R)) ; après un échec, S × 0,35.

## 4. Fiabilité

- Statut de chaque information : `confirme` (écrit dans le cours), `infere` (calculé), `incertain` (indice faible ou lecture douteuse), `externe` (base Notéa, pas le cours).
- Chaque notion, lien, question et élément de schéma garde sa phrase source et sa page.
- Aucune question sur une phrase mal lue ; aucune question tirée d'un lien seulement deviné.
- Les explications ne prennent que le cours. S'il n'y a pas d'exemple : « Le cours ne donne pas d'exemple pour cette notion. »
- Négations (« ne … pas ») : pas de lien.

## 5. Modèle de données (les 25 entités de l'énoncé)

| Entité | Où |
|---|---|
| Course, Document, Page | `structure.id`, `structure.documents`, `structure.pages` |
| ExtractedContent | `structure.blocs` (type, texte, page, ligne, confiance, statut, mises en évidence) |
| Subject, Chapter | `classification.matiere`, `classification.chapitre`, `sousChapitres` |
| Knowledge | `comprehension.unites` (type de connaissance principal + secondaires) |
| Concept | `comprehension.notions` / `graphe.noeuds` |
| Relationship, Prerequisite | `graphe.aretes` (type `prerequis` et relations « à connaître avant ») |
| LearningObjective, Difficulty, Misconception | `pedagogie.parNotion[id].objectifs / difficultes / erreursProbables` |
| Question, Answer, Correction | `questions[]` (`reponseAttendue`, `corrige`, `criteres`) |
| LearningActivity, LearningSession | `prochaineSeance().activites` |
| Diagram | `schemas.principal`, `schemas.autres`, `schemas.carteMentale` |
| Student, StudentMastery, StudentResponse | `nouveauProfil()`, `profil.notions[id]`, `profil.notions[id].preuves[]` |
| RevisionSchedule | `prochaineRevision(etat)` |
| Evaluation | `evaluerReponse(question, reponse)` |
| ConfidenceScore | `conf` des blocs et unités, `confiance` des liens, `statut` |

Dans l'appli : l'analyse compacte d'un cours est gardée dans `db.moteur[idDuCours]` (localStorage, sur l'appareil). Elle est supprimée avec le cours.

## 6. Utilisation

```js
const a = NoteaMoteur.analyserCours([{nom: "SVT", type: "pdf", texte}], {matiere: "SVT"});
a.graphe.noeuds;            // notions avec importance, difficulté, prérequis, sources
a.questions;                // questions reliées au cours
a.schemas.carteMentale.plan // texte pour la carte mentale
const p = NoteaMoteur.nouveauProfil();
NoteaMoteur.enregistrer(p, {notion: id, activite: "definition", correct: true});
NoteaMoteur.prochaineSeance(a.graphe, a.questions, p, {minutes: 10});
```

## 7. Tests

- `node --test tests/moteur.test.js` : 33 tests (lecture, compréhension, graphe, génération, personnalisation, long cours).
- `node tests/mesures.js` : précision et rappel sur les cours de référence → `docs/MOTEUR-MESURES.md`.
