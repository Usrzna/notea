/* Notéa — moteur 9 : schémas et représentations visuelles, construits depuis le graphe (jamais d'image inventée).
   Le type de schéma est choisi selon la nature des liens : causes → diagramme de causalité ; dates → frise ;
   « sorte de / partie de » → arbre de classification ; oppositions entre notions définies → tableau comparatif ;
   étapes → diagramme de processus ; formules → schéma mathématique ; sinon carte conceptuelle. La carte mentale
   suit le plan du cours. Sorties : données structurées + texte Mermaid (modifiable, vérifiable) + plan pour la carte
   mentale de Notéa. Chaque élément garde sa source. Cartes géographiques et schémas anatomiques : impossibles
   sans image fournie ; le moteur le dit au lieu d'inventer. */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {STATUT} = NM;
  const MAX = 12;   // au-delà, un schéma devient illisible : on garde les notions les plus importantes

  const FAMILLES = {causalite: ["provoque", "mene_a", "consequence_de", "explique"], frise: ["precede"], arbre: ["categorie", "partie_de"], comparatif: ["oppose"], maths: ["calcule"], dependances: ["depend_de", "condition", "prerequis"]};
  function choisirType(g) {
    const n = t => g.aretes.filter(a => FAMILLES[t].includes(a.type) && a.statut !== STATUT.INCERTAIN).length;
    const dates = g.aretes.filter(a => a.type === "precede" && /\d{4}/.test(a.preuve || "")).length;
    const scores = {causalite: n("causalite") * 1.2, frise: dates * 1.5 + n("frise") * 0.5, arbre: n("arbre"), comparatif: n("comparatif") * 1.5, maths: n("maths") * 1.3, concept: 1};
    const ranges = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return {type: ranges[0][1] >= 2 ? ranges[0][0] : "concept", scores};
  }
  const esc = s => String(s).replace(/"/g, "'").replace(/[\[\]{}()<>|]/g, " ").replace(/\s+/g, " ").trim();
  const garder = (g, ids) => [...ids].map(id => g.byId.get(id)).filter(Boolean).sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, MAX);

  function schema(g, type, comp) {
    type = type || choisirType(g).type;
    const ok = a => a.statut !== STATUT.INCERTAIN && g.byId.has(a.de) && g.byId.has(a.vers);
    let aretes, noeuds, mermaid, extra = {};
    const sel = types => { aretes = g.aretes.filter(a => ok(a) && types.includes(a.type)); noeuds = garder(g, new Set(aretes.flatMap(a => [a.de, a.vers]))); const ids = new Set(noeuds.map(x => x.id)); aretes = aretes.filter(a => ids.has(a.de) && ids.has(a.vers)); };
    const lbl = n => esc(n.nom), lignes = (dir, f) => [`flowchart ${dir}`, ...noeuds.map(n => `  ${n.id}["${lbl(n)}"]`), ...aretes.map(f)].join("\n");
    if (type === "causalite") { sel(FAMILLES.causalite); mermaid = lignes("LR", a => `  ${a.de} -->|${a.effet ? (a.effet === "hausse" ? "hausse de" : "baisse de") : esc(NM.NOMS_REL[a.type])}| ${a.vers}`); }
    else if (type === "frise") { sel(["precede"]); const o = NM.ordreApprentissage({noeuds, aretes, byId: new Map(noeuds.map(n => [n.id, n]))}).ordre;
      const an = id => { const s = (g.byId.get(id).sources || []).map(x => (x.texte.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/) || [])[1]).find(Boolean); return s || ""; };
      extra.etapes = o.map(id => ({id, nom: g.byId.get(id).nom, date: an(id)}));
      mermaid = ["timeline", ...extra.etapes.map(e => `  ${e.date || "étape"} : ${esc(e.nom)}`)].join("\n"); }
    else if (type === "arbre") { sel(FAMILLES.arbre); mermaid = lignes("TD", a => `  ${a.vers} --> ${a.de}`); }
    else if (type === "comparatif") { sel(["oppose"]); const ids = noeuds.map(n => n.id), defs = new Map(comp ? comp.notions.map(c => [c.id, c.definitions[0]]) : []);
      extra.tableau = {colonnes: ["Notion", "Ce que dit le cours"], lignes: ids.map(id => [g.byId.get(id).nom, defs.get(id) ? defs.get(id).definiens : (g.byId.get(id).sources[0] || {}).texte || ""])};
      mermaid = lignes("LR", a => `  ${a.de} <-->|s'oppose à| ${a.vers}`); }
    else if (type === "maths") { sel(["calcule"]); mermaid = lignes("LR", a => `  ${a.de} -->|sert à calculer| ${a.vers}`); }
    else if (type === "processus") { aretes = g.aretes.filter(a => ok(a) && a.type === "precede" && !/\d{4}/.test(a.preuve || "")); noeuds = garder(g, new Set(aretes.flatMap(a => [a.de, a.vers]))); mermaid = lignes("LR", a => `  ${a.de} --> ${a.vers}`); }
    else { type = "concept"; aretes = g.aretes.filter(a => ok(a) && a.type !== "associe"); noeuds = garder(g, new Set(aretes.flatMap(a => [a.de, a.vers]).concat(NM.centrales(g, 6).map(n => n.id))));
      const ids = new Set(noeuds.map(n => n.id)); aretes = aretes.filter(a => ids.has(a.de) && ids.has(a.vers)); mermaid = lignes("LR", a => `  ${a.de} -->|${esc(NM.NOMS_REL[a.type])}| ${a.vers}`); }
    const res = {type, titre: TITRES[type], noeuds: noeuds.map(n => ({id: n.id, nom: n.nom, importance: n.importance, source: n.sources[0] || null})),
      liens: aretes.map(a => ({de: a.de, vers: a.vers, type: a.type, texte: NM.NOMS_REL[a.type], effet: a.effet || null, source: {unite: a.unite, page: a.page, texte: a.preuve}, statut: a.statut})), mermaid};
    return Object.assign(res, extra, {controle: controler(res, g)});
  }
  const TITRES = {causalite: "Causes et effets", frise: "Frise chronologique", arbre: "Classification", comparatif: "Tableau comparatif", maths: "Ce qui sert à calculer quoi", processus: "Les étapes", concept: "Carte des notions", mentale: "Carte mentale"};

  /* Contrôle qualité : exactitude (chaque lien a une phrase source), fidélité (aucune notion hors du graphe),
     lisibilité (≤ 12 notions), présence des notions essentielles (les 3 plus importantes en lien avec le type). */
  function controler(s, g) {
    const pb = [];
    s.liens.forEach(l => { if (!l.source || !l.source.texte) pb.push("lien sans phrase source : " + l.de + " → " + l.vers); });
    s.noeuds.forEach(n => { if (!g.byId.has(n.id)) pb.push("notion inventée : " + n.nom); });
    if (s.noeuds.length > MAX) pb.push("trop de notions pour être lisible");
    if (s.noeuds.length < 2) pb.push("pas assez de liens pour ce type de schéma");
    return {valide: !pb.length, problemes: pb};
  }

  // Carte mentale : le plan du cours (titres), puis les notions de chaque partie avec leur définition courte.
  function carteMentale(g, structure, comp) {
    const parSection = new Map(); g.noeuds.forEach(n => (n.sections.length ? n.sections : ["_"]).slice(0, 1).forEach(s => { if (!parSection.has(s)) parSection.set(s, []); parSection.get(s).push(n); }));
    const def = id => { const c = comp && comp.notions.find(x => x.id === id), d = c && c.definitions[0]; return d ? d.definiens.split(/\s+/).slice(0, 4).join(" ") + (d.definiens.split(/\s+/).length > 4 ? "…" : "") : ""; };   // court : une bulle lisible
    // Seulement le nom de la notion : des bulles courtes restent lisibles. (opts.definitions = true pour ajouter un début de définition.)
    const ligne = (n, ind) => "  ".repeat(ind) + n.nom + (carteMentale.definitions && def(n.id) ? " : " + def(n.id) : "");
    const titres = structure.blocs.filter(b => b.kind === "titre"), racine = titres.find(t => t.niveau === 1) || titres[0];
    const out = [racine ? racine.texte.replace(/^(chapitre|partie|leçon)\s*[\dIVX]*\s*[:.\-–]?\s*/i, "") : (NM.centrales(g, 1)[0] || {}).nom || "Mon cours"];
    const vus = new Set();
    titres.filter(t => t !== racine).forEach(t => { const ns = (parSection.get(t.id) || []).sort((a, b) => b.importance - a.importance).slice(0, 4); if (!ns.length) return;
      out.push("  " + t.texte.replace(/^[\dIVX]+(\.\d+)*\s*[.)\-–]?\s*|^[A-H][.)]\s*/, "")); ns.forEach(n => { vus.add(n.id); out.push(ligne(n, 2)); }); });
    [...(parSection.get(racine && racine.id) || []), ...(parSection.get("_") || [])].filter(n => !vus.has(n.id)).sort((a, b) => b.importance - a.importance).slice(0, 4).forEach(n => out.push(ligne(n, 1)));
    return {type: "mentale", titre: TITRES.mentale, plan: out.join("\n")};
  }

  function schemas(g, structure, comp) {
    const choix = choisirType(g), principal = schema(g, choix.type, comp), autres = Object.keys(choix.scores).filter(t => t !== choix.type && choix.scores[t] >= 2 && t !== "concept").map(t => schema(g, t, comp)).filter(s => s.controle.valide);
    return {choix: choix.type, scores: choix.scores, principal, autres, carteMentale: carteMentale(g, structure, comp),
      nonDisponibles: ["carte géographique", "schéma anatomique"].map(t => ({type: t, raison: "il faut une image du cours (photo) et un modèle de vision : Notéa ne dessine pas ce qui n'est pas dans le cours"}))};
  }

  Object.assign(NM, {schemas, schema, choisirTypeSchema: choisirType, carteMentale, controlerSchema: controler});
})(typeof window !== "undefined" ? window : globalThis);
