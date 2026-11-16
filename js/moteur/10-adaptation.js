/* Notéa — moteur 10 : adaptation, évaluation, mémorisation.
   Score de priorité (réglable) : S = 0,25 I + 0,20 (1 − M) + 0,15 D + 0,15 P + 0,10 O + 0,10 E + 0,05 V
   I importance · M maîtrise · D difficulté · P poids comme prérequis · O risque d'oubli · E erreurs récentes · V valeur de transfert,
   tous ramenés entre 0 et 1. Une notion dont un prérequis n'est pas compris est mise en attente : on travaille le prérequis d'abord.
   L'activité dépend du niveau de maîtrise (découvrir → reconnaître → rappeler → reformuler → appliquer → réviser plus tard → transférer),
   on varie les activités, et on remplit le temps disponible. */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {round, clamp01} = NM;
  const POIDS_PRIORITE = {I: 0.25, M: 0.20, D: 0.15, P: 0.15, O: 0.10, E: 0.10, V: 0.05};
  // Activité par niveau, avec sa durée estimée (minutes) et le type de question à poser.
  const ACTIVITES = {
    0: [{activite: "decouverte", nom: "Découvrir la notion (explication + exemple)", min: 2, questions: []}],
    1: [{activite: "flashcard", nom: "Carte mémo", min: 1, questions: ["flashcard"]}, {activite: "qcm", nom: "QCM", min: 1, questions: ["qcm", "qcm-notion"]}],
    2: [{activite: "definition", nom: "Rappel actif (écrire la réponse)", min: 2, questions: ["definition", "directe", "partie", "categorie", "lieu", "chronologie"]}, {activite: "qcm", nom: "QCM", min: 1, questions: ["qcm"]}],
    3: [{activite: "reformulation", nom: "Redire avec ses mots (auto-explication)", min: 3, questions: ["reformulation"]}, {activite: "causalite", nom: "Expliquer un lien", min: 3, questions: ["causalite", "dependance", "condition"]}],
    4: [{activite: "application", nom: "Appliquer (situation, calcul)", min: 4, questions: ["situation", "calcul", "calcule-quoi"]}, {activite: "comparaison", nom: "Comparer", min: 3, questions: ["comparaison"]}],
    5: [{activite: "definition", nom: "Révision espacée (rappel sans aide)", min: 2, questions: ["definition", "directe"]}],
    6: [{activite: "synthese", nom: "Transfert : relier les notions", min: 5, questions: ["synthese"]}, {activite: "probleme", nom: "Étude de cas", min: 5, questions: ["situation"]}],
    7: [{activite: "synthese", nom: "Entretien de la mémoire", min: 2, questions: ["synthese", "definition"]}]
  };

  function priorites(g, profil, opts = {}) {
    const W = Object.assign({}, POIDS_PRIORITE, opts.poids || {}), now = opts.now || Date.now(), seuilPrerequis = opts.seuilPrerequis || 3;
    const etat = id => profil && profil.notions[id], niv = id => etat(id) ? NM.niveauMaitrise(etat(id), now) : 0;
    const dep = new Map(g.noeuds.map(n => [n.id, NM.dependants(g, n.id).length])), maxDep = Math.max(1, ...dep.values());
    const lignes = g.noeuds.map(n => {
      const e = etat(n.id), recentes = e ? e.preuves.slice(-5) : [], err = recentes.length ? recentes.filter(p => !p.ok && p.type !== "decouverte").length / recentes.length : 0;
      const f = {I: (n.importance || 0) / 100, M: e ? NM.maitrise(e, now) : 0, D: (n.difficulte || 0) / 100, P: dep.get(n.id) / maxDep,
        O: e && e.S ? NM.risqueOubli(e, now) : (e ? 0.5 : 0), E: err, V: clamp01(((n.sections || []).length - 1) * 0.5 + ((n.cours || []).length - 1) * 0.5 + (n.centralite || 0) * 0.5)};
      const S = W.I * f.I + W.M * (1 - f.M) + W.D * f.D + W.P * f.P + W.O * f.O + W.E * f.E + W.V * f.V;
      // Prérequis pas compris → la notion attend, et le prérequis passe devant.
      const bloquePar = NM.prerequisDirects(g, n.id).map(p => p.id).filter(p => niv(p) < seuilPrerequis && niv(n.id) >= 1 && etat(p));
      return {id: n.id, nom: n.nom, S: round(S, 3), facteurs: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, round(v)])), niveau: niv(n.id), bloquePar,
        aReviser: e && e.S ? NM.prochaineRevision(e) <= now : false};
    });
    lignes.forEach(l => { if (l.bloquePar.length) { l.S = round(l.S * 0.5, 3); l.bloquePar.forEach(p => { const x = lignes.find(y => y.id === p); if (x) x.S = round(x.S + 0.1, 3); }); } });
    return lignes.sort((a, b) => b.S - a.S);
  }

  /* Prochaine séance : on prend les notions par priorité, on choisit l'activité selon le niveau, on varie les types,
     et on s'arrête quand le temps est rempli. Pas de nouvelle notion tant qu'un prérequis bloque. */
  function prochaineSeance(g, banque, profil, opts = {}) {
    const minutes = opts.minutes || 10, nouvellesMax = opts.nouvelles != null ? opts.nouvelles : 3, ps = priorites(g, profil, opts), plan = [];
    const rang = new Map(NM.ordreApprentissage(g).ordre.map((id, i) => [id, i]));
    let t = 0, dernier = null;
    const ajouter = (p, a, q, extra = {}) => { plan.push(Object.assign({notion: p.id, nom: p.nom, niveau: p.niveau, nomNiveau: NM.NIVEAUX_MAITRISE[p.niveau], activite: a.activite, nomActivite: a.nom,
      minutes: a.min, question: q ? q.id : null, pourquoi: raison(p)}, extra)); t += a.min; dernier = a.activite; };
    const essayer = p => { const choix = (ACTIVITES[p.niveau] || ACTIVITES[0]).slice().sort((a, b) => (a.activite === dernier) - (b.activite === dernier));
      for (const a of choix) { const q = a.questions.length ? banque.filter(x => x.notions[0] === p.id && a.questions.includes(x.type)).sort((x, y) => y.pertinence - x.pertinence)[0] : null;
        if (a.questions.length && !q) continue; if (t + a.min > minutes + 1 && plan.length) return false; ajouter(p, a, q); return true; } return false; };
    // 1. Les révisions dues d'abord (le bon moment pour ne pas oublier), 2. les nouvelles notions dans l'ordre logique,
    // 3. les autres notions en cours, 4. un rappel rapide de chaque nouvelle notion à la fin (rappel actif espacé dans la séance).
    const dues = ps.filter(p => p.niveau > 0 && p.aReviser), nouvelles = ps.filter(p => p.niveau === 0 && !p.bloquePar.length).slice(0, nouvellesMax).sort((a, b) => rang.get(a.id) - rang.get(b.id));
    const autres = ps.filter(p => p.niveau > 0 && !p.aReviser);
    for (const p of [...dues.slice(0, 3), ...nouvelles, ...dues.slice(3), ...autres]) { if (t >= minutes) break; essayer(p); }
    plan.filter(x => x.activite === "decouverte").forEach(x => { const q = banque.filter(y => y.notions[0] === x.notion && ["flashcard", "qcm-notion", "directe"].includes(y.type)).sort((a, b) => b.pertinence - a.pertinence)[0];
      if (q) { plan.push({notion: x.notion, nom: x.nom, niveau: 0, nomNiveau: NM.NIVEAUX_MAITRISE[0], activite: "flashcard", nomActivite: "Rappel rapide de ce que tu viens de voir", minutes: 1, question: q.id, pourquoi: "se rappeler tout de suite aide à retenir"}); t += 1; } });
    return {minutes: t, activites: plan};
  }
  function raison(p) {
    const f = p.facteurs, r = [];
    if (p.bloquePar.length) r.push("un prérequis est à revoir d'abord");
    if (p.aReviser) r.push("c'est le bon moment pour la revoir");
    if (f.I >= 0.5) r.push("notion importante du cours");
    if (f.E >= 0.4) r.push("des erreurs récentes");
    if (f.M <= 0.2 && !p.niveau) r.push("pas encore vue");
    if (f.P >= 0.5) r.push("d'autres notions en dépendent");
    if (f.O >= 0.5) r.push("risque d'oubli");
    return r.length ? r.join(", ") : "pour garder le rythme";
  }

  Object.assign(NM, {priorites, prochaineSeance, POIDS_PRIORITE, ACTIVITES});
})(typeof window !== "undefined" ? window : globalThis);
