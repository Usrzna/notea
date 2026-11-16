/* Notéa — moteur 4 : pertinence (importance) et difficulté, deux scores séparés sur 100.
   Une notion peut être importante sans être difficile, et l'inverse.
   La fréquence ne pèse que 5 % : répéter un mot ne le rend pas important.
   Chaque score est rendu avec ses facteurs (0 à 1) et une justification en phrases simples.
   Les poids sont réglables (NM.POIDS_PERTINENCE, NM.POIDS_DIFFICULTE) et peuvent être calibrés (NM.calibrer). */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {U, STATUT, norm, stem, words, isContent, lev, round, clamp01} = NM;

  const POIDS_PERTINENCE = {conceptuelle: 0.20, dependances: 0.15, utilite: 0.15, objectifs: 0.15, explicative: 0.10, methodologique: 0.10, exemples: 0.05, evidence: 0.05, repetition: 0.05};
  const POIDS_DIFFICULTE = {abstraction: 0.20, vocabulaire: 0.15, longueur: 0.10, prerequis: 0.20, calcul: 0.10, confusion: 0.15, causalite: 0.05, exceptions: 0.05};
  const LIBELLES = {conceptuelle: "notion centrale du cours", dependances: "d'autres notions en dépendent", utilite: "utile pour répondre aux questions du cours",
    objectifs: "fait partie des objectifs ou du plan", explicative: "elle explique d'autres notions", methodologique: "sert dans une méthode ou une formule",
    exemples: "illustrée par des exemples", evidence: "mise en évidence (gras, encadré, à retenir)", repetition: "revient souvent",
    abstraction: "notion abstraite", vocabulaire: "vocabulaire technique", longueur: "définition longue", prerequis: "demande d'autres notions avant",
    calcul: "demande un calcul", confusion: "facile à confondre avec une autre", causalite: "chaîne de causes et d'effets", exceptions: "a des conditions ou des exceptions"};
  // Relations où la source est nécessaire pour comprendre la cible (sens « à connaître avant »).
  const AVANT = {prerequis: [1, "de"], condition: [1, "de"], calcule: [1, "de"], depend_de: [1, "vers"], categorie: [1, "vers"], partie_de: [0.5, "de"]};
  // Pour l'importance, une catégorie mère (« droit » dans « l'usus est le droit de… ») compte moins qu'un vrai prérequis.
  const POIDS_DEP = {prerequis: 1, condition: 1, calcule: 1, depend_de: 1, categorie: 0.35, partie_de: 0.5};
  const EXPLICATIVES = new Set(["explique", "provoque", "calcule", "condition", "prerequis", "mene_a"]);

  function noter(comp, classif, opts = {}) {
    const {unites, notions, relations} = comp, uById = new Map(unites.map(u => [u.id, u]));
    const W = Object.assign({}, POIDS_PERTINENCE, opts.poids || {}), WD = Object.assign({}, POIDS_DIFFICULTE, opts.poidsDifficulte || {});
    const titreStems = new Set(), objStems = new Set(), titreCles = new Map();
    [classif && classif.chapitre && classif.chapitre.valeur].concat((classif && classif.sousChapitres || []).map(s => s.valeur)).filter(Boolean).forEach((t, i) => { const ss = words(t).filter(isContent).map(stem).filter(x => !/^\d+$/.test(x));
      ss.forEach(w => titreStems.add(w)); titreCles.set(ss.join(" "), i === 0 ? 1 : 0.8); });
    (classif && classif.objectifs || []).forEach(o => words(o.texte).filter(isContent).forEach(w => objStems.add(stem(w))));
    const deg = new Map(notions.map(c => [c.id, {dependants: 0, explique: 0, liens: 0, causal: 0, cond: 0}]));
    relations.forEach(r => { const a = deg.get(r.de), b = deg.get(r.vers); if (!a || !b) return; const w = r.type === "associe" ? 0.3 : 1;
      a.liens += w; b.liens += w;
      const av = AVANT[r.type]; if (av) { const avant = av[1] === "de" ? a : b; avant.dependants += POIDS_DEP[r.type] * (r.statut === STATUT.CONFIRME ? 1 : 0.7); }
      if (EXPLICATIVES.has(r.type)) a.explique += r.statut === STATUT.CONFIRME ? 1 : 0.6;
      if (r.type === "provoque" || r.type === "mene_a") { a.causal++; b.causal++; }
      if (r.type === "condition") b.cond++; });
    const maxDep = Math.max(1, ...[...deg.values()].map(d => d.dependants)), maxExp = Math.max(1, ...[...deg.values()].map(d => d.explique)), maxU = Math.max(1, ...notions.map(c => c.unites.length));
    const deps = NM.prerequisTransitifs ? null : null;
    notions.forEach(c => {
      const us = c.unites.map(id => uById.get(id)).filter(Boolean), d = deg.get(c.id), kw = c.cle.split(" ");
      const types = us.map(u => u.principal), has = t => types.includes(t) || us.some(u => u.secondaires.includes(t));
      const f = {};
      // Base : ce que le cours enseigne explicitement (une définition) compte plus qu'un mot seulement cité.
      c._base = c.definitions.length ? 1 : c.evidence || c.origines.includes("titre") ? 0.7 : c.statut === STATUT.CONFIRME ? 0.5 : 0.2;
      f.conceptuelle = clamp01(c._base * 0.5 + Math.min(0.5, d.liens / 10));      // remplacé par base + centralité dans le graphe (moteur 5)
      const sature = x => 1 - Math.exp(-x / 2);                                      // échelle absolue : 2 dépendants ≈ 0,63
      f.dependances = sature(d.dependants);
      f.utilite = clamp01((has("question") ? 0.5 : 0) + (has("retenir") ? 0.3 : 0) + (c.definitions.length ? 0.4 : 0) + (us.some(u => u.principal === "theoreme" || u.principal === "loi" || u.principal === "principe") ? 0.3 : 0));
      f.objectifs = Math.max(titreCles.get(c.cle) || 0, kw.every(s => objStems.has(s)) ? 0.9 : kw.some(s => objStems.has(s)) ? 0.4 : 0, kw.every(s => titreStems.has(s)) ? ([...titreCles.keys()].some(k => k !== c.cle && (" " + k + " ").includes(" " + c.cle + " ")) ? 0.3 : 0.5) : kw.some(s => titreStems.has(s)) ? 0.2 : 0);
      f.explicative = sature(d.explique);
      f.methodologique = clamp01(us.filter(u => ["methode", "formule", "processus", "theoreme", "loi"].includes(u.principal)).length / 2 + (c.symbole ? 0.5 : 0));
      f.exemples = Math.min(1, (c.exemples || []).length / 2);
      f.evidence = clamp01((c.evidence ? 0.6 : 0) + (us.some(u => u.principal === "retenir" || (u.evid || []).length) ? 0.4 : 0));
      f.repetition = Math.log(1 + c.unites.length) / Math.log(1 + maxU);
      c.pertinence = {facteurs: f}; finirPertinence(c, W);
      // Difficulté.
      const def = c.definitions[0], defMots = def ? words(def.definiens).filter(isContent) : [];
      const g = {};
      g.abstraction = clamp01(c.label.split(/\s+/).filter(w => /(isme|ité|tion|sion|ance|ence|ure|ment|abilité)s?$/i.test(w)).length * 0.5 + (!(c.exemples || []).length ? 0.1 : 0) + (us.some(u => u.principal === "principe" || u.principal === "loi" || u.principal === "theoreme") ? 0.3 : 0));
      g.vocabulaire = clamp01(defMots.filter(w => w.length >= 10).length / 3 + (c.label.length >= 12 ? 0.2 : 0) + (/(us|um|a)$/.test(norm(c.label)) && c.label.length <= 8 ? 0.3 : 0));
      g.longueur = clamp01((defMots.length - 6) / 18);
      g.prerequis = 0;      // rempli par le graphe (profondeur des prérequis)
      g.calcul = clamp01((c.symbole ? 0.6 : 0) + (has("formule") ? 0.4 : 0) + (us.some(u => /\d\s*[×x*\/+\-−=]\s*\d/.test(u.texte)) ? 0.2 : 0));
      g.confusion = 0;       // rempli plus bas (notions proches)
      g.causalite = clamp01(d.causal / 3);
      g.exceptions = clamp01(d.cond / 2 + (has("exception") ? 0.5 : 0) + (has("condition") ? 0.3 : 0));
      c.difficulte = {facteurs: g};
    });
    // Notions faciles à confondre : même racine, mots proches, ou même catégorie mère.
    const cat = new Map(); relations.filter(r => r.type === "categorie").forEach(r => { if (!cat.has(r.vers)) cat.set(r.vers, []); cat.get(r.vers).push(r.de); });
    notions.forEach(c => { c.confusions = []; });
    for (let i = 0; i < notions.length; i++) for (let j = i + 1; j < notions.length; j++) {
      const a = notions[i], b = notions[j], la = norm(a.label), lb = norm(b.label);
      if ((" " + a.cle + " ").includes(" " + b.cle + " ") || (" " + b.cle + " ").includes(" " + a.cle + " ")) continue;     // l'une contient l'autre : pas une confusion
      const d = lev(la, lb) / Math.max(la.length, lb.length), memeCat = [...cat.values()].some(l => l.includes(a.id) && l.includes(b.id));
      const pourquoiC = d <= 0.35 ? "les mots se ressemblent" : memeCat ? "ce sont deux sortes de la même chose" : null;
      if (pourquoiC) { a.confusions.push({avec: b.id, pourquoi: pourquoiC}); b.confusions.push({avec: a.id, pourquoi: pourquoiC}); }
    }
    notions.forEach(c => { c.difficulte.facteurs.confusion = clamp01(c.confusions.length * 0.5); finirDifficulte(c, WD); });
    return comp;
  }
  // Score de pertinence ; centralite (0..1, moteur 5) entre dans l'importance conceptuelle quand elle est connue.
  function finirPertinence(c, W = POIDS_PERTINENCE, centralite) {
    const f = c.pertinence.facteurs;
    if (centralite != null) f.conceptuelle = clamp01((c._base != null ? c._base : 0.4) * 0.5 + centralite * 0.5);
    c.pertinence.score = Math.round(100 * Object.keys(W).reduce((s, k) => s + W[k] * (f[k] || 0), 0) / Object.values(W).reduce((a, b) => a + b, 0));
    c.pertinence.facteurs = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, round(v)])); c.pertinence.pourquoi = pourquoi(f, W);
  }
  function finirDifficulte(c, WD = POIDS_DIFFICULTE) {
    const g = c.difficulte.facteurs;
    c.difficulte.score = Math.round(100 * Object.keys(WD).reduce((s, k) => s + WD[k] * (g[k] || 0), 0) / Object.values(WD).reduce((a, b) => a + b, 0));
    c.difficulte.facteurs = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, round(v)]));
    c.difficulte.pourquoi = pourquoi(g, WD);
  }
  function pourquoi(f, W) {
    const parts = Object.keys(W).map(k => ({k, v: W[k] * (f[k] || 0)})).filter(x => x.v > 0.02).sort((a, b) => b.v - a.v).slice(0, 3);
    return parts.length ? parts.map(x => LIBELLES[x.k]).join(" ; ") : "peu d'indices dans le cours";
  }

  /* Calibrage : à partir de notions notées par un enseignant (0 à 100), on cherche les poids qui collent le mieux
     (descente de gradient simple sur l'erreur quadratique, poids gardés positifs et de somme 1). */
  function calibrer(exemples, poids = POIDS_PERTINENCE, tours = 400, pas = 0.05) {
    const K = Object.keys(poids); let w = K.map(k => poids[k]);
    const err = w2 => exemples.reduce((s, e) => { const p = K.reduce((a, k, i) => a + w2[i] * (e.facteurs[k] || 0), 0) * 100; return s + (p - e.cible) ** 2; }, 0) / exemples.length;
    for (let t = 0; t < tours; t++) {
      const grad = K.map((k, i) => exemples.reduce((s, e) => { const p = K.reduce((a, kk, j) => a + w[j] * (e.facteurs[kk] || 0), 0) * 100; return s + 2 * (p - e.cible) * 100 * (e.facteurs[k] || 0); }, 0) / exemples.length);
      w = w.map((x, i) => Math.max(0.001, x - pas * grad[i] / 10000)); const sum = w.reduce((a, b) => a + b, 0); w = w.map(x => x / sum);
    }
    return {poids: Object.fromEntries(K.map((k, i) => [k, round(w[i], 3)])), erreur: round(Math.sqrt(err(w)), 1)};
  }

  Object.assign(NM, {noter, finirDifficulte, finirPertinence, POIDS_DEP, calibrer, POIDS_PERTINENCE, POIDS_DIFFICULTE, LIBELLES_FACTEURS: LIBELLES, AVANT});
})(typeof window !== "undefined" ? window : globalThis);
