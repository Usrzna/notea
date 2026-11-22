# Notéa 2.0 : audit et plan

Mis à jour le 22 novembre 2026. But : faire de Notéa le centre de tout l'apprentissage.
L'élève importe ses cours. Notéa comprend, construit le parcours, organise les révisions, évalue et s'adapte.

## 1. Audit de la version 1.17

### Ce qui existe et marche (on le garde)

| Partie | Où | État |
|---|---|---|
| Import (photo, PDF, Word, PowerPoint, texte) | `app.js` import | Marche. Garde les pages, diapos, titres. |
| Moteur de compréhension (plan, notions, définitions, liens, prérequis, importance, difficulté, ordre, questions) | `js/moteur/` | Marche. 33 tests. |
| IA Claude (plan, notions expliquées, questions de compréhension) | `app.js` v1.7, serveur v1.8 | Marche avec une clé. Le serveur attend la clé Anthropic. |
| FSRS (révision espacée) | `schedule()` | Marche. Corrigé en v1.15 : les notions réussies s'espacent. |
| Révision du jour, une matière par séance, examen d'abord | `todayQueue()` | Marche (v1.13, v1.14). |
| Plan d'examen jour par jour | `examPlan()` | Marche. Se recalcule chaque jour (séance manquée = reste réparti). |
| Quiz, trous, cartes, fiches, feuille blanche, examen blanc, prof particulier | onglets | Marchent. |
| Ordre des questions (difficiles d'abord, jamais la même notion de suite) | `ordreMalin()` | Marche (v1.12). |

### Les problèmes trouvés

1. **L'import demandait du travail.** Le moteur trouvait les notions, mais l'élève devait surligner les phrases à la main. Les notions créées n'avaient ni prérequis, ni page, ni pertinence. L'analyse du moteur ne servait qu'à afficher.
2. **La maîtrise était mélangée.** Il n'y avait qu'une note FSRS, plus « compréhension » (v1.15). Rien pour l'application ni l'autonomie. Une notion vue une fois pouvait paraître « réussie ».
3. **Les prérequis étaient ignorés.** Une notion pouvait arriver avant ce qu'il faut savoir pour la comprendre. Une erreur ne faisait pas revenir la lacune.
4. **Le quiz ne disait pas d'où venait l'erreur.** Il ne repérait pas non plus les confusions qui reviennent.
5. **L'accueil ne disait pas l'essentiel.** On voyait la séance et le plan d'examen. On ne voyait pas « ce qui me pose problème » ni la vraie progression.
6. **Deux suivis en parallèle.** Le moteur a son propre profil élève (`db.profil`), l'appli a FSRS. Ils ne sont pas encore fusionnés (voir étape 3).
7. **Notes de projet et notes du jour.** Notéa n'a pas de « notes de projet » ni de « notes du jour ». Ces règles concernent sans doute le MÉMO dans le Drive. Rien n'a été changé ici.

## 2. Ce que fait la version 2.0 (étape 1, faite)

- **Import automatique** (`js/parcours.js` → `notionsDepuisAnalyse`, `app.js` → `importAuto`).
  - Le cours est lu, puis les notions sont créées sans rien surligner.
  - Chaque notion garde : sa phrase exacte du cours, sa page, sa partie, sa pertinence (1 à 3), sa difficulté, ses prérequis et son rang dans l'ordre d'apprentissage.
  - **Fiabilité** : une définition n'est gardée que si elle parle bien du mot. Sinon, Notéa garde la phrase du cours et y cache le mot. Notéa n'écrit jamais une définition qui n'est pas dans le cours. Les passages mal lus sont signalés.
  - L'élève peut encore « choisir lui-même les phrases » ou « approfondir avec l'IA ».
- **Suivi en 5 dimensions** (`enregistrer`, `profil`, `maitrise`).
  - Les 5 dimensions : pertinence, compréhension, mémorisation, application, autonomie.
  - Chaque genre de question mesure sa dimension. Les questions de mémoire mesurent la mémoire. Exemples, vrai ou faux et IA mesurent la compréhension. Les exercices mesurent l'application. Réussir sans aide mesure l'autonomie.
  - La note suit les **derniers résultats** (moyenne glissante), pas le nombre de réussites.
  - **Hésitation ≠ oubli** : « avec effort » compte 0,6, « raté » compte 0.
  - La mémorisation dépend de FSRS : est-ce que je m'en souviendrai dans 3 semaines ?
  - Une notion vue une seule fois ne peut pas être « acquise ».
- **Diagnostic** (`besoin`, `fragile`, `prerequisBloquants`, `confusionFrequente`).
  - Chaque notion a un besoin : découvrir, comprendre, mémoriser, appliquer ou réussir sans aide. Le quiz choisit les formats qui correspondent.
  - « Semble acquise mais fragile » : la mémoire va bien, mais comprendre ou appliquer ne suit pas.
- **Prérequis dans le parcours.**
  - Une nouvelle notion ne vient jamais avant ses prérequis.
  - Une notion ratée fait revenir tout de suite le prérequis mal maîtrisé.
  - Au dos du quiz : « ton erreur vient peut-être de… », « tu confonds souvent avec… », « c'est page X ».
- **Accueil « Aujourd'hui ».** Il montre : à apprendre, à réviser, la maîtrise réelle (pondérée par la pertinence), l'échéance, et les 3 notions qui posent le plus problème avec la raison. Le bouton « Travailler » prend d'abord les prérequis.
- **Tests** : `node --test tests/` (49 tests). 16 tests sont nouveaux et vérifient l'import, la fiabilité, les dimensions, le diagnostic, les prérequis et le tableau du jour.

## 3. Les étapes suivantes (dans l'ordre)

1. **Fusionner les deux suivis.** Le profil du moteur (`db.profil`, `NM.enregistrer`) doit lire et écrire les mêmes dimensions que `parcours.js`. Les questions du moteur feront alors bouger la notion de l'appli qui va avec (aujourd'hui, elles sont à part).
2. **Questions ouvertes et « explique avec tes mots »** corrigées par l'IA (serveur Notéa), qui comptent pour la compréhension. Il faut d'abord que la clé Anthropic soit mise dans Supabase.
3. **Autonomie plus fine** : compter les indices et les « demander une explication » comme une aide, notion par notion.
4. **Examen blanc et feuille blanche** : enregistrer leurs résultats dans les dimensions (application, autonomie).
5. **Retards** : quand l'élève a beaucoup de retard, étaler sur plusieurs jours en gardant l'essentiel d'abord (aujourd'hui, la limite du jour coupe simplement).
6. **Révisions globales** : un quiz qui mélange les chapitres d'une matière, une fois la matière apprise.
7. **Prof particulier** : lui donner le diagnostic (besoin, prérequis manquants, confusions) pour qu'il cible ses explications.
8. **Mesurer pour de vrai** avec des élèves : temps gagné, notes aux contrôles. On ne peut pas le prouver sans données.

## 4. Lancer les tests

```bash
node --test tests/
```
