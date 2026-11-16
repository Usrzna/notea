/* Notéa — moteur 2 : classification pédagogique.
   Matière, discipline, domaine, thème, chapitre, sous-chapitres, niveau scolaire probable, type de cours,
   objectifs, compétences et prérequis annoncés.
   Chaque réponse porte un statut : confirme (déclaré par l'élève ou écrit dans le cours), infere (calculé
   à partir d'indices, avec un score), inconnu (pas assez d'indices : on ne devine pas). */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {U, STATUT, norm, stem, words, round} = NM;

  // Lexique par discipline : mots typiques (racines) et motifs forts. Ajouter une discipline : NM.ajouterDiscipline().
  const DISCIPLINES = {
    mathematiques: {nom: "Mathématiques", domaine: "Sciences", mots: "fonction dérivée intégrale équation inéquation théorème démonstration propriété lemme vecteur matrice suite limite probabilité statistique géométrie triangle cercle angle droite plan repère calcul nombre entier réel fraction polynôme racine variable ensemble algèbre logarithme exponentielle cosinus sinus tangente pourcentage coefficient proportionnalité médiane moyenne".split(" "), motifs: [U(/\bf\s*\(\s*x\s*\)/i), U(/\b(soit|on pose)\s+\p{L}\s*[∈=]/u), U(/\b(th[ée]or[èe]me|lemme|corollaire)\b/i), /[∑∫√∈∀∃]/]},
    physique_chimie: {nom: "Physique-chimie", domaine: "Sciences", mots: "énergie force masse vitesse accélération tension intensité courant circuit résistance puissance onde fréquence lumière atome molécule ion électron réaction chimique solution concentration mole acide base oxydation réduction température pression newton joule watt volt ampère gravitation optique lentille".split(" "), motifs: [U(/\b\d+([.,]\d+)?\s?(N|J|W|V|A|Hz|Pa|mol|K|°C|m\/s|kg)\b/), U(/\b[A-Z][a-z]?\d*(\s*\+\s*[A-Z])/)]},
    svt: {nom: "SVT", domaine: "Sciences", mots: "cellule organe organisme tissu gène génétique adn chromosome protéine enzyme photosynthèse respiration chloroplaste mitochondrie écosystème espèce évolution sélection biodiversité immunité anticorps neurone hormone digestion sang muscle squelette végétal animal bactérie virus roche séisme volcan plaque".split(" "), motifs: [U(/\b(ADN|ARN|ATP)\b/)]},
    histoire: {nom: "Histoire", domaine: "Sciences humaines", mots: "guerre révolution empire roi royaume république régime traité bataille siècle époque période colonisation décolonisation monarchie démocratie dictature totalitarisme résistance armistice indépendance réforme civilisation antiquité moyen renaissance industrialisation".split(" "), motifs: [U(/\b(1[0-9]{3}|20[0-2][0-9])\b/), U(/\b[IVX]{1,4}e\s+siècle\b/i), U(/\bav(ant)?\.?\s*J\.?-?C/i)]},
    geographie: {nom: "Géographie", domaine: "Sciences humaines", mots: "territoire population ville métropole urbanisation mondialisation flux réseau espace frontière région littoral climat ressource développement aménagement migration densité carte échelle paysage agriculture mobilité".split(" "), motifs: [U(/\bhab(itants)?\s*\/\s*km/i)]},
    francais: {nom: "Français", domaine: "Lettres", mots: "texte auteur narrateur personnage récit roman poème poésie vers strophe rime théâtre scène métaphore comparaison figure style registre argumentation énonciation verbe sujet complément proposition subordonnée conjugaison grammaire orthographe vocabulaire lecture écriture".split(" "), motifs: [U(/\b(alexandrin|anaphore|oxymore|allitération|champ lexical)\b/i)]},
    philosophie: {nom: "Philosophie", domaine: "Lettres", mots: "conscience liberté vérité raison morale devoir bonheur justice état art travail technique nature culture inconscient désir existence sujet autrui temps religion langage politique philosophe concept".split(" "), motifs: [U(/\b(Platon|Aristote|Descartes|Kant|Hegel|Nietzsche|Spinoza|Rousseau|Sartre|Freud)\b/)]},
    langues: {nom: "Langues", domaine: "Langues", mots: "anglais espagnol allemand italien vocabulaire prétérit présent futur modal traduction prononciation".split(" "), motifs: [U(/\b(the|and|is|are|el|los|las|der|die|das)\b/i)]},
    economie: {nom: "Économie", domaine: "Sciences économiques et sociales", mots: "marché offre demande prix production consommation croissance inflation chômage emploi monnaie banque crédit investissement épargne pib revenu salaire entreprise ménage état fiscalité impôt commerce échange concurrence monopole capital".split(" "), motifs: [U(/\b(PIB|BCE|INSEE|OCDE)\b/)]},
    gestion: {nom: "Gestion", domaine: "Sciences économiques et sociales", mots: "comptabilité bilan actif passif charge produit résultat trésorerie stock facture client fournisseur marketing stratégie management organisation ressources humaines budget amortissement marge rentabilité".split(" "), motifs: [U(/\b(TVA|HT|TTC|CA)\b/)]},
    droit: {nom: "Droit", domaine: "Droit", mots: "droit loi article code contrat obligation propriété propriétaire juge tribunal cour jurisprudence responsabilité faute préjudice personne juridique civil pénal constitution usufruit usufruitier servitude possession bien meuble immeuble acte litige partie".split(" "), motifs: [U(/\b(art(icle)?\.?\s*\d+|C\.\s?civ|Cass\.)/i), U(/\b(usus|fructus|abusus)\b/i)]},
    informatique: {nom: "Informatique", domaine: "Sciences", mots: "algorithme programme variable boucle condition fonction donnée base requête réseau protocole octet bit binaire langage python code tableau liste fichier serveur client internet".split(" "), motifs: [U(/\b(def|print|while|for|if|return)\s*\(/), U(/\b(SQL|HTML|CSS|HTTP|IP)\b/)]}
  };
  function ajouterDiscipline(id, def) { DISCIPLINES[id] = def; delete cacheLex[id]; }
  const cacheLex = {};
  const lex = id => cacheLex[id] || (cacheLex[id] = new Set(DISCIPLINES[id].mots.map(stem)));

  const NIVEAUX = [[U(/\b(CP|CE1|CE2|CM1|CM2)\b/), "École primaire"], [U(/\b(6e|5e|4e|3e|sixième|cinquième|quatrième|troisième|brevet)\b/i), "Collège"],
    [U(/\b(seconde|2nde|première|1re|terminale|tle|bac(calauréat)?)\b/i), "Lycée"], [U(/\b(BTS|DUT|BUT|IUT)\b/), "BTS / BUT"],
    [U(/\b(licence|L1|L2|L3|master|M1|M2|université|faculté|amphi|TD\s?\d|CM)\b/), "Université"], [U(/\b(prépa|CPGE|khâgne|hypokhâgne|MPSI|PCSI)\b/i), "Classe préparatoire"]];
  const TYPES = [[U(/\b(exercice|exercices|corrigé|énoncé|application\s+\d)\b/i), "exercices"], [U(/\b(TD|travaux dirigés)\b/), "travaux dirigés"], [U(/\b(fiche|résumé|synthèse|mémo)\b/i), "fiche de révision"], [U(/\b(TP|travaux pratiques|protocole|expérience)\b/i), "travaux pratiques"], [U(/\b(sujet|devoir|contrôle|examen|évaluation)\b/i), "sujet d'évaluation"]];
  const R_OBJ = U(/^(objectifs?|à la fin|vous (devez|serez) (être )?capables?|je dois savoir|savoir[- ]faire|compétences?)\b/i);
  const R_PRE = U(/^(prérequis|pré-requis|rappels?|ce qu'il faut savoir|connaissances? préalables?)\b/i);

  function classifier(structure, opts = {}) {
    const blocs = structure.blocs, texte = blocs.map(b => b.texte).join("\n"), ws = words(texte).map(stem), nb = Math.max(1, ws.length);
    // 1. Matière : score = mots du lexique (pondérés par leur rareté dans le texte) + motifs forts.
    const scores = Object.keys(DISCIPLINES).map(id => { const L = lex(id), vus = new Map();
      ws.forEach(w => { if (L.has(w)) vus.set(w, (vus.get(w) || 0) + 1); });
      let s = [...vus.values()].reduce((a, n) => a + 1 + Math.log(n), 0);
      const motifs = DISCIPLINES[id].motifs.filter(r => r.test(texte)); s += motifs.length * 2;
      return {id, nom: DISCIPLINES[id].nom, score: s, indices: [...vus.keys()].slice(0, 6), motifs: motifs.length}; }).sort((a, b) => b.score - a.score);
    const [a, b] = scores, total = scores.reduce((s, x) => s + x.score, 0) || 1;
    const part = a.score / total, ecart = a.score - (b ? b.score : 0);
    let matiere;
    if (opts.matiere) { const dec = scores.find(x => norm(x.nom) === norm(opts.matiere) || norm(opts.matiere).includes(norm(x.nom).split(/[- ]/)[0]));
      matiere = {valeur: opts.matiere, statut: STATUT.CONFIRME, discipline: dec ? dec.id : null, pourquoi: "nom donné par l'élève"}; }
    if (!matiere || !matiere.discipline) {
      const sur = a.score >= 4 && part >= 0.3 && ecart >= 2;
      const calc = {valeur: sur ? a.nom : null, discipline: sur ? a.id : null, statut: sur ? STATUT.INFERE : "inconnu", confiance: round(Math.min(1, part * Math.min(1, a.score / 10))),
        pourquoi: sur ? "mots typiques : " + a.indices.join(", ") + (a.motifs ? " ; " + a.motifs + " motif(s) caractéristique(s)" : "") : "pas assez d'indices pour choisir une matière",
        candidats: scores.slice(0, 3).filter(x => x.score > 0).map(x => ({nom: x.nom, score: round(x.score, 1)}))};
      matiere = matiere ? Object.assign(matiere, {discipline: calc.discipline, disciplineStatut: calc.statut, candidats: calc.candidats}) : calc;
    }
    const disc = matiere.discipline ? DISCIPLINES[matiere.discipline] : null;
    // 2. Chapitre et sous-chapitres : le plan.
    const titres = blocs.filter(b => b.kind === "titre"), t1 = titres.find(t => t.niveau === 1) || titres[0];
    const chapitre = t1 ? {valeur: t1.texte.replace(/^(chapitre|partie|leçon|thème|séquence)\s*[\dIVX]*\s*[:.\-–]?\s*/i, "").trim() || t1.texte, statut: STATUT.CONFIRME, bloc: t1.id} : {valeur: null, statut: "inconnu"};
    const sousChapitres = titres.filter(t => t !== t1 && (!t1 || t.niveau > t1.niveau || t1.niveau > 1)).map(t => ({valeur: t.texte, niveau: t.niveau, bloc: t.id}));
    // 3. Niveau scolaire : seulement s'il est écrit. Sinon « inconnu » (jamais deviné).
    const niv = NIVEAUX.map(([r, nom]) => ({nom, m: texte.match(r)})).filter(x => x.m);
    const niveau = niv.length ? {valeur: niv[0].nom, statut: STATUT.INFERE, pourquoi: "le cours mentionne « " + niv[0].m[0] + " »"} : {valeur: null, statut: "inconnu", pourquoi: "le document ne le dit pas"};
    // 4. Type de cours.
    const ty = TYPES.find(([r]) => blocs.filter(b => b.kind === "titre").some(b => r.test(b.texte)) || r.test(texte.slice(0, 300)));
    const typeCours = ty ? {valeur: ty[1], statut: STATUT.INFERE} : {valeur: "cours", statut: STATUT.INFERE, pourquoi: "par défaut : texte de cours"};
    // 5. Objectifs et prérequis annoncés dans le cours (sections « Objectifs », « Prérequis »).
    const sousSection = r => { const out = []; blocs.forEach((b, i) => { if (!(r.test(b.texte) && (b.kind === "titre" || b.texte.length < 80))) return;
      const inline = b.texte.replace(r, "").replace(/^[\s:–-]+/, "").trim(); if (inline.length > 8 && b.kind !== "titre") out.push({texte: inline, bloc: b.id});
      const x = blocs[i + 1]; if (x && x.kind === "liste" && /:\s*$/.test(b.texte)) x.items.forEach(t => out.push({texte: t, bloc: x.id})); }); return out; };
    const objectifs = sousSection(R_OBJ).map(o => Object.assign(o, {statut: STATUT.CONFIRME}));
    const prerequis = sousSection(R_PRE).map(o => Object.assign(o, {statut: STATUT.CONFIRME}));
    return {matiere, discipline: disc ? {valeur: disc.nom, id: matiere.discipline, statut: matiere.disciplineStatut || matiere.statut} : {valeur: null, statut: "inconnu"},
      domaine: disc ? {valeur: disc.domaine, statut: STATUT.INFERE} : {valeur: null, statut: "inconnu"},
      chapitre, sousChapitres, theme: sousChapitres[0] ? {valeur: chapitre.valeur, statut: chapitre.statut} : chapitre,
      niveau, typeCours, objectifs, prerequis, scores: scores.slice(0, 5).map(x => ({id: x.id, score: round(x.score, 1)}))};
  }

  Object.assign(NM, {classifier, DISCIPLINES, ajouterDiscipline});
})(typeof window !== "undefined" ? window : globalThis);
