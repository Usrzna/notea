/* Notéa — moteur 5 : graphe de connaissances.
   Nœuds = notions, arêtes = relations typées. Index par listes d'adjacence (Map) : parcours en O(arêtes).
   Le graphe sert à : notions centrales (PageRank), prérequis (directs et en chaîne), ordre d'apprentissage
   (tri topologique, cycles cassés au lien le plus faible), notions transversales, liens manquants ou douteux,
   notions qui bloquent les autres. Plusieurs cours se fusionnent : une notion garde le même identifiant partout. */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {STATUT, round, finirDifficulte, finirPertinence, AVANT} = NM;

  function construire(comp, structure, classif, coursId = "cours") {
    const uById = new Map(comp.unites.map(u => [u.id, u])), bloc = new Map(structure.blocs.map(b => [b.id, b]));
    const premiere = c => { const us = c.unites.map(id => uById.get(id)).filter(u => u && !u.meta); return us.length ? Math.min(...us.map(u => Number(u.id.slice(1)))) : 1e9; };
    const noeuds = comp.notions.map(c => {
      const us = c.unites.map(id => uById.get(id)).filter(Boolean), d = c.definitions[0];
      return {id: c.id, cle: c.cle, nom: c.label, definition: d ? d.texte : null, type: d ? "definition" : (us[0] ? us[0].principal : "concept"),
        importance: c.pertinence ? c.pertinence.score : null, difficulte: c.difficulte ? c.difficulte.score : null,
        confiance: c.statut === STATUT.CONFIRME ? 0.9 : 0.6, statut: c.statut, symbole: c.symbole || null,
        sources: us.map(u => ({unite: u.id, doc: u.doc, page: u.page, texte: u.texte})).slice(0, 8), pages: [...new Set(us.map(u => u.page))],
        sections: [...new Set(us.map(u => u.section).filter(Boolean))], chemin: us[0] ? us[0].chemin : [], cours: [coursId], ordre: premiere(c),
        exemples: c.exemples || [], confusions: c.confusions || [], pertinence: c.pertinence, difficulteDetail: c.difficulte,
        objectifs: [], prerequis: [], associees: [], competences: []};
    });
    const g = indexer({cours: [coursId], noeuds, aretes: comp.relations.map(r => Object.assign({cours: coursId}, r))});
    // Prérequis directs et profondeur → facteur « prérequis » de la difficulté.
    g.noeuds.forEach(n => { n.prerequis = prerequisDirects(g, n.id).map(x => x.id); n.associees = voisins(g, n.id).map(x => x.id).filter(id => !n.prerequis.includes(id));
      const prof = prerequisEnChaine(g, n.id).length, c = comp.notions.find(x => x.id === n.id);
      if (c && c.difficulte) { c.difficulte.facteurs.prerequis = Math.min(1, prof / 4); finirDifficulte(c); n.difficulte = c.difficulte.score; n.difficulteDetail = c.difficulte; } });
    centralite(g);
    // L'importance conceptuelle intègre la place de la notion dans le graphe (centralité).
    comp.notions.forEach(c => { const n = g.byId.get(c.id); if (c.pertinence && n) { finirPertinence(c, undefined, n.centralite); n.importance = c.pertinence.score; n.pertinence = c.pertinence; } });
    return g;
  }
  function indexer(g) {
    g.byId = new Map(g.noeuds.map(n => [n.id, n])); g.sortants = new Map(); g.entrants = new Map();
    g.noeuds.forEach(n => { g.sortants.set(n.id, []); g.entrants.set(n.id, []); });
    g.aretes.forEach(a => { if (!g.byId.has(a.de) || !g.byId.has(a.vers)) return; g.sortants.get(a.de).push(a); g.entrants.get(a.vers).push(a); });
    return g;
  }
  // Arêtes « à connaître avant » : renvoie [avant, apres, poids, arête].
  function avantApres(a) { const av = AVANT[a.type]; if (!av) return null; return av[1] === "de" ? [a.de, a.vers, av[0], a] : [a.vers, a.de, av[0], a]; }
  function prerequisDirects(g, id) {
    const out = [];
    [...(g.entrants.get(id) || []), ...(g.sortants.get(id) || [])].forEach(a => { const p = avantApres(a); if (p && p[1] === id && p[2] >= 1) out.push({id: p[0], arete: a}); });
    return out;
  }
  function prerequisEnChaine(g, id, max = 6) {
    const vus = new Set([id]), out = []; let front = [id];
    for (let d = 1; d <= max && front.length; d++) { const nx = [];
      front.forEach(x => prerequisDirects(g, x).forEach(p => { if (!vus.has(p.id)) { vus.add(p.id); out.push({id: p.id, profondeur: d}); nx.push(p.id); } })); front = nx; }
    return out;
  }
  function dependants(g, id) {   // notions qui ont besoin de celle-ci (en chaîne)
    const out = new Set(); let front = [id];
    while (front.length) { const nx = []; front.forEach(x => g.noeuds.forEach(n => { if (!out.has(n.id) && n.id !== id && prerequisDirects(g, n.id).some(p => p.id === x)) { out.add(n.id); nx.push(n.id); } })); front = nx; }
    return [...out];
  }
  const voisins = (g, id) => [...(g.sortants.get(id) || []).map(a => ({id: a.vers, a})), ...(g.entrants.get(id) || []).map(a => ({id: a.de, a}))];

  // PageRank sur le graphe non orienté, pondéré par la force du lien.
  function centralite(g, d = 0.85, tours = 40) {
    const N = g.noeuds.length; if (!N) return g; const w = a => (a.type === "associe" ? 0.3 : 1) * (a.confiance || 0.6);
    let pr = new Map(g.noeuds.map(n => [n.id, 1 / N]));
    const somme = new Map(g.noeuds.map(n => [n.id, voisins(g, n.id).reduce((s, v) => s + w(v.a), 0)]));
    for (let t = 0; t < tours; t++) { const nx = new Map(g.noeuds.map(n => [n.id, (1 - d) / N]));
      g.noeuds.forEach(n => { const s = somme.get(n.id); if (!s) { g.noeuds.forEach(m => nx.set(m.id, nx.get(m.id) + d * pr.get(n.id) / N)); return; }
        voisins(g, n.id).forEach(v => nx.set(v.id, nx.get(v.id) + d * pr.get(n.id) * w(v.a) / s)); }); pr = nx; }
    const max = Math.max(...pr.values()); g.noeuds.forEach(n => { n.centralite = round(pr.get(n.id) / max); });
    return g;
  }
  const centrales = (g, k = 5) => [...g.noeuds].sort((a, b) => (b.centralite + (b.importance || 0) / 100) - (a.centralite + (a.importance || 0) / 100)).slice(0, k);

  /* Ordre d'apprentissage : une notion vient après ses prérequis. À égalité, l'ordre du cours, puis l'importance.
     S'il y a un cycle, on retire le lien le moins sûr du cycle et on continue (signalé dans « cyclesCasses »). */
  function ordreApprentissage(g) {
    const ids = g.noeuds.map(n => n.id), arcs = [];
    g.aretes.forEach(a => { const p = avantApres(a); if (p && p[2] >= 1 && g.byId.has(p[0]) && g.byId.has(p[1])) arcs.push({de: p[0], vers: p[1], a}); });
    const actifs = new Set(arcs), cyclesCasses = [], ordre = [], fait = new Set();
    const cle = id => { const n = g.byId.get(id); return [n.ordre, -(n.importance || 0)]; };
    while (ordre.length < ids.length) {
      const prets = ids.filter(id => !fait.has(id) && ![...actifs].some(x => x.vers === id && !fait.has(x.de)));
      if (!prets.length) {     // cycle : retirer l'arc le plus faible entre notions restantes
        const reste = [...actifs].filter(x => !fait.has(x.de) && !fait.has(x.vers)).sort((x, y) => (x.a.confiance || 0) - (y.a.confiance || 0) || (x.a.statut === STATUT.CONFIRME) - (y.a.statut === STATUT.CONFIRME));
        if (!reste.length) break; actifs.delete(reste[0]); cyclesCasses.push(reste[0].a.id); continue; }
      prets.sort((a, b) => { const [oa, ia] = cle(a), [ob, ib] = cle(b); return oa - ob || ia - ib; });
      fait.add(prets[0]); ordre.push(prets[0]);
    }
    return {ordre, cyclesCasses};
  }
  const transversales = g => g.noeuds.filter(n => n.sections.length >= 2 || n.cours.length >= 2).map(n => n.id);
  function verification(g) {
    const isoles = g.noeuds.filter(n => !voisins(g, n.id).some(v => v.a.type !== "associe")).map(n => n.id);
    const incertaines = g.aretes.filter(a => a.statut !== STATUT.CONFIRME).map(a => a.id);
    const sansDefinition = g.noeuds.filter(n => !n.definition && (n.importance || 0) >= 50).map(n => n.id);
    return {isoles, incertaines, sansDefinition};
  }
  // Notions qui bloquent : beaucoup d'autres en dépendent et l'élève ne les maîtrise pas (maitrise : id → 0..1).
  function bloquants(g, maitrise = {}, seuil = 0.5) {
    return g.noeuds.map(n => ({id: n.id, nom: n.nom, dependants: dependants(g, n.id).length, maitrise: maitrise[n.id] != null ? maitrise[n.id] : null}))
      .filter(x => x.dependants >= 1 && (x.maitrise == null || x.maitrise < seuil)).sort((a, b) => b.dependants - a.dependants);
  }
  // Fusion de plusieurs cours : mêmes notions (même clé) → un seul nœud, relié aux deux cours.
  function fusionner(graphes) {
    const nm = new Map(), am = new Map();
    graphes.forEach(g => { g.noeuds.forEach(n => { const o = nm.get(n.id); if (!o) nm.set(n.id, Object.assign({}, n, {cours: [...n.cours], sections: [...n.sections], sources: [...n.sources]}));
      else { o.cours = [...new Set(o.cours.concat(n.cours))]; o.sections = [...new Set(o.sections.concat(n.sections))]; o.sources = o.sources.concat(n.sources).slice(0, 12); o.importance = Math.max(o.importance || 0, n.importance || 0); o.definition = o.definition || n.definition; } });
      g.aretes.forEach(a => { const k = a.de + ">" + a.type + ">" + a.vers; if (!am.has(k)) am.set(k, Object.assign({}, a)); else am.get(k).preuves += a.preuves || 1; }); });
    const g = indexer({cours: graphes.flatMap(x => x.cours), noeuds: [...nm.values()], aretes: [...am.values()]}); centralite(g); return g;
  }
  // Pour enregistrer : un graphe sans ses index (Map).
  const exporter = g => ({cours: g.cours, noeuds: g.noeuds, aretes: g.aretes});
  const importer = o => centralite(indexer({cours: o.cours, noeuds: o.noeuds, aretes: o.aretes}));

  Object.assign(NM, {construireGraphe: construire, indexer, prerequisDirects, prerequisEnChaine, dependants, voisins, centralite, centrales, ordreApprentissage, transversales, verification, bloquants, fusionner, exporterGraphe: exporter, importerGraphe: importer, avantApres});
})(typeof window !== "undefined" ? window : globalThis);
