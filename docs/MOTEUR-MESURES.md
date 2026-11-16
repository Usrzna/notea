# Mesures du moteur de compréhension

Cours de référence : `tests/corpus/`. Annotations : `tests/corpus/reference.json` (écrites par Claude, **à faire valider par des enseignants**).

- Rappel = part des éléments attendus que le moteur trouve. Précision = part des relations « confirmées » du moteur qui sont justes.
- Strict = la notion doit avoir exactement les mêmes mots. Souple = même type de lien et même mot principal de chaque côté (« globules » pour « globules blancs »).
- **Premier passage du 2e lot inédit, avant toute correction : rappel 40 %, précision 56 % (strict).** Trois bugs généraux corrigés ensuite (« s'oppose au », « provient de », groupes commençant par un mot courant) ; aucun autre réglage sur ce lot.

### Mesure finale : 2e lot inédit (écrit après la fin des réglages ; seulement 3 bugs généraux corrigés ensuite)

| Cours | Matière | Définitions trouvées | Relations trouvées (strict / souple) | Relations justes (strict / souple) | Rang de la notion principale | Questions |
|---|---|---|---|---|---|---|
| inedits2/svt-immunite.txt | SVT | 100 % | 60 % / 100 % | 60 % / 100 % | 2 | 36 |
| inedits2/philo-liberte.txt | Philosophie | 100 % | 60 % / 100 % | 60 % / 100 % | 1 | 26 |
| inedits2/info-boucles.txt | Informatique | 100 % | 60 % / 80 % | 75 % / 100 % | 1 | 23 |
| **Moyenne finale** | 3/3 | 100 % | 60 % / 93 % | 65 % / 100 % | | 85 |

### 1er lot inédit (a servi à trouver des défauts généraux, puis corrigé)

| Cours | Matière | Définitions trouvées | Relations trouvées (strict / souple) | Relations justes (strict / souple) | Rang de la notion principale | Questions |
|---|---|---|---|---|---|---|
| inedits/geo-mondialisation.txt | Géographie | 100 % | 100 % / 100 % | 100 % / 100 % | 1 | 27 |
| inedits/francais-figures.txt | Français | 83 % | 100 % / 100 % | 100 % / 100 % | 1 | 37 |
| inedits/gestion-bilan.txt | Gestion | 50 % | 100 % / 100 % | 100 % / 100 % | 1 | 18 |
| **Moyenne inédits** | 3/3 | 78 % | 100 % / 100 % | 100 % / 100 % | | 82 |

### Cours de réglage (le moteur a été ajusté dessus : chiffres optimistes)

| Cours | Matière | Définitions trouvées | Relations trouvées (strict / souple) | Relations justes (strict / souple) | Rang de la notion principale | Questions |
|---|---|---|---|---|---|---|
| droit-propriete.txt | Droit | 100 % | 100 % / 100 % | 100 % / 100 % | 1 | 43 |
| svt-photosynthese.txt | SVT | 100 % | 100 % / 100 % | 100 % / 100 % | 1 | 32 |
| histoire-ww1.txt | Histoire | 100 % | 100 % / 100 % | 100 % / 100 % | 1 | 15 |
| maths-pythagore.txt | Mathématiques | 100 % | 100 % / 100 % | 100 % / 100 % | 1 | 27 |
| eco-inflation.txt | Économie | 100 % | 100 % / 100 % | 100 % / 100 % | 1 | 33 |
| physique-puissance.txt | Physique-chimie | 100 % | 100 % / 100 % | 100 % / 100 % | 1 | 28 |
| **Moyenne réglage** | 6/6 | 100 % | 100 % / 100 % | 100 % / 100 % | | 178 |

- inedits2/svt-immunite.txt — relations manquées : lymphocytes categorie globules blancs ; vaccination provoque lymphocytes mémoire
- inedits2/svt-immunite.txt — relations en trop : lymphocyt categorie globul ; vaccin provoque production lymphocyt memoir
- inedits2/philo-liberte.txt — relations manquées : liberté categorie capacité ; ignorance des causes provoque illusion de la liberté
- inedits2/philo-liberte.txt — relations en trop : libert categorie capacit agir ; ignoranc provoque illusion libert
- inedits2/info-boucles.txt — relations manquées : algorithme categorie suite finie d'instructions ; boucle tant que depend_de condition
- inedits2/info-boucles.txt — relations en trop : algorithm categorie suite

_Mesuré le 2026-11-16, moteur 1.0._
