/* Notéa — moteur 6 : intelligence pédagogique.
   Pour chaque notion : objectifs mesurables rangés selon les 6 niveaux de Bloom, ce que l'élève doit
   savoir / comprendre / expliquer / comparer / reconnaître / appliquer / calculer / démontrer / interpréter / relier,
   difficultés probables, et erreurs de raisonnement probables (confusions).
   Les erreurs tirées du cours ont le statut « infere ». Les erreurs typiques d'une discipline viennent de la
   base Notéa (statut « externe ») : elles ne sont jamais présentées comme écrites dans le cours. */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {STATUT} = NM;

  const BLOOM = {1: "Mémoriser", 2: "Comprendre", 3: "Appliquer", 4: "Analyser", 5: "Évaluer", 6: "Créer"};
  // Base d'erreurs fréquentes par discipline (connaissances générales en didactique, pas tirées du cours).
  const CONFUSIONS_DISCIPLINE = {
    mathematiques: ["Appliquer un théorème sans vérifier ses conditions (par exemple un triangle qui n'est pas rectangle).", "Confondre un théorème et sa réciproque.", "Se tromper dans l'ordre des opérations ou oublier un carré."],
    physique_chimie: ["Oublier ou confondre les unités.", "Confondre deux grandeurs proches (par exemple énergie et puissance).", "Utiliser une formule sans convertir les unités avant."],
    svt: ["Confondre les échelles (organe, cellule, molécule).", "Inverser la cause et la conséquence.", "Croire que deux phénomènes liés sont forcément cause l'un de l'autre."],
    histoire: ["Mélanger l'ordre des événements.", "Confondre une cause et une conséquence.", "Juger le passé avec les idées d'aujourd'hui (anachronisme)."],
    geographie: ["Confondre les échelles (locale, nationale, mondiale).", "Lire une carte sans regarder la légende ou l'échelle."],
    francais: ["Confondre deux figures de style proches (comparaison et métaphore).", "Résumer l'histoire au lieu d'analyser le texte."],
    philosophie: ["Donner une opinion au lieu d'un argument.", "Confondre deux notions voisines sans les définir."],
    economie: ["Inverser le sens d'une relation entre deux variables.", "Confondre un stock et un flux.", "Confondre une hausse en valeur et une hausse en volume."],
    gestion: ["Confondre une charge et une dépense, un produit et une recette.", "Oublier la différence entre HT et TTC."],
    droit: ["Confondre deux droits ou régimes voisins.", "Oublier une condition ou une exception de la règle.", "Citer la règle sans l'appliquer au cas."],
    informatique: ["Confondre l'affectation et la comparaison.", "Se tromper d'une unité dans les bornes d'une boucle."],
    langues: ["Traduire mot à mot.", "Oublier l'accord ou la terminaison du temps."]
  };

  function objectifsNotion(n, g, classif) {
    const out = [], add = (bloom, verbe, texte, mesure, preuve) => out.push({bloom, niveau: BLOOM[bloom], verbe, texte, mesure, preuve: preuve || null});
    const nom = id => (g.byId.get(id) || {}).nom, ar = NM.voisins(g, n.id).map(v => v.a);
    if (n.definition) { add(1, "savoir", `Donner la définition de « ${n.nom} ».`, "réponse avec les mots clés de la définition", n.sources[0]);
      add(2, "comprendre", `Expliquer « ${n.nom} » avec ses propres mots.`, "reformulation qui garde le sens, sans recopier", n.sources[0]); }
    else add(1, "reconnaitre", `Reconnaître « ${n.nom} » dans le cours.`, "choisir la bonne notion parmi plusieurs", n.sources[0]);
    if (n.exemples.length) add(2, "reconnaitre", `Reconnaître « ${n.nom} » dans un exemple.`, "nommer la notion à partir d'une situation", n.exemples[0]);
    ar.forEach(a => { const autre = a.de === n.id ? a.vers : a.de, src = {unite: a.unite, page: a.page, texte: a.preuve};
      if (a.statut === STATUT.INCERTAIN) return;
      if (a.type === "provoque" && a.de === n.id) add(4, "expliquer", `Expliquer pourquoi « ${n.nom} » entraîne « ${nom(a.vers)} ».`, "cause et effet dans le bon sens", src);
      if (a.type === "oppose") add(4, "comparer", `Comparer « ${n.nom} » et « ${nom(autre)} ».`, "une ressemblance ou une différence juste", src);
      if (a.type === "calcule" && a.vers === n.id) add(3, "calculer", `Calculer « ${n.nom} » à partir de « ${nom(a.de)} ».`, "résultat juste avec l'unité", src);
      if (a.type === "partie_de" && a.vers === n.id) add(2, "savoir", `Citer les éléments de « ${n.nom} ».`, "tous les éléments cités", src);
      if (a.type === "categorie" && a.de === n.id) add(2, "relier", `Dire de quelle famille « ${n.nom} » fait partie (« ${nom(a.vers)} »).`, "bonne catégorie", src);
      if (a.type === "condition" && a.vers === n.id) add(5, "interpreter", `Dire si « ${n.nom} » est possible dans une situation (condition : « ${nom(a.de)} »).`, "vérifie la condition avant de conclure", src);
      if (a.type === "precede" && a.de === n.id) add(1, "savoir", `Situer « ${n.nom} » avant « ${nom(a.vers)} ».`, "ordre juste", src);
      if (a.type === "depend_de" && a.de === n.id) add(4, "expliquer", `Expliquer de quoi dépend « ${n.nom} ».`, "les facteurs du cours", src); });
    const types = n.sources.map(s => s.texte);
    if (n.symbole || types.some(t => NM.U(/=/).test(t) && t.includes(n.nom))) add(3, "appliquer", `Utiliser la formule où intervient « ${n.nom} ».`, "calcul juste", n.sources[0]);
    if (n.sources.some(s => /\b(démontr|preuve|montrer que)/i.test(s.texte))) add(5, "demontrer", `Démontrer un résultat avec « ${n.nom} ».`, "raisonnement complet et justifié", n.sources[0]);
    if (ar.filter(a => a.type !== "associe").length >= 3) add(6, "relier", `Relier « ${n.nom} » aux autres notions dans une carte ou un texte.`, "au moins 3 liens justes", null);
    // Objectifs annoncés par le cours qui parlent de cette notion.
    (classif && classif.objectifs || []).forEach(o => { if (NM.mentions(o.texte, [{cle: n.cle, id: n.id}]).length) add(2, "objectif-du-cours", o.texte, "objectif écrit dans le cours", {bloc: o.bloc, texte: o.texte}); });
    const dims = {}; out.forEach(o => { (dims[o.verbe] = dims[o.verbe] || []).push(o.texte); });
    return {objectifs: out.sort((a, b) => a.bloom - b.bloom), dimensions: dims, bloomMax: Math.max(1, ...out.map(o => o.bloom))};
  }

  const NOMS_DIFF = {abstraction: "abstraction", vocabulaire: "vocabulaire technique", longueur: "mémorisation (définition longue)", prerequis: "prérequis à maîtriser", calcul: "calcul",
    confusion: "ressemblance avec une autre notion", causalite: "chaîne de causes", exceptions: "conditions et exceptions"};
  function difficultesNotion(n, g) {
    const f = (n.difficulteDetail && n.difficulteDetail.facteurs) || {}, out = Object.keys(f).filter(k => f[k] >= 0.4).map(k => ({type: k, nom: NOMS_DIFF[k] || k, niveau: f[k]}));
    if (n.symbole) out.push({type: "symboles", nom: "symboles", niveau: 0.6});
    if (NM.prerequisEnChaine(g, n.id).length >= 3) out.push({type: "raisonnement", nom: "raisonnement en plusieurs étapes", niveau: 0.6});
    return out;
  }
  function confusionsNotion(n, g, disc) {
    const nom = id => (g.byId.get(id) || {}).nom, out = [];
    (n.confusions || []).forEach(c => out.push({statut: STATUT.INFERE, texte: `Confondre « ${n.nom} » et « ${nom(c.avec)} » (${c.pourquoi}).`, avec: c.avec}));
    NM.voisins(g, n.id).forEach(({a}) => {
      if (a.type === "provoque" && a.de === n.id) out.push({statut: STATUT.INFERE, texte: `Inverser le sens : c'est « ${n.nom} » qui entraîne « ${nom(a.vers)} », pas l'inverse.`, relation: a.id});
      if (a.type === "precede" && a.de === n.id) out.push({statut: STATUT.INFERE, texte: `Mettre « ${nom(a.vers)} » avant « ${n.nom} ».`, relation: a.id});
      if (a.type === "partie_de" && a.de === n.id) out.push({statut: STATUT.INFERE, texte: `Prendre la partie (« ${n.nom} ») pour le tout (« ${nom(a.vers)} »).`, relation: a.id}); });
    return out;
  }

  function pedagogie(g, classif) {
    const disc = classif && classif.matiere && classif.matiere.discipline;
    const parNotion = {};
    g.noeuds.forEach(n => { const o = objectifsNotion(n, g, classif);
      n.objectifs = o.objectifs.map(x => x.texte); n.competences = [...new Set(o.objectifs.map(x => x.niveau))];
      parNotion[n.id] = Object.assign(o, {difficultes: difficultesNotion(n, g), erreursProbables: confusionsNotion(n, g, disc)}); });
    return {parNotion, erreursDiscipline: (CONFUSIONS_DISCIPLINE[disc] || []).map(t => ({statut: "externe", source: "base Notéa", texte: t}))};
  }

  Object.assign(NM, {pedagogie, objectifsNotion, BLOOM, CONFUSIONS_DISCIPLINE});
})(typeof window !== "undefined" ? window : globalThis);
