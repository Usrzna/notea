/* Notéa — moteur 8 : génération pédagogique (sans IA, à partir du graphe et des phrases du cours).
   Chaque question porte : notions, objectif, source (phrase et page), niveau de Bloom, difficulté, réponse attendue,
   corrigé, critères d'évaluation (mots clés), erreurs à détecter, score de pertinence.
   Les QCM utilisent les mots exacts du cours (les mauvaises réponses sont d'autres phrases du même cours).
   On ne fabrique jamais de question sur une information incertaine (lecture douteuse, lien seulement deviné). */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {gen, STATUT, GENERIQUES, norm, stem, words, isContent, jaccard, hid, round} = NM;
  const POIDS_TYPE = {definition: 1, directe: 0.8, qcm: 0.9, "qcm-notion": 0.8, reformulation: 1, situation: 0.9, causalite: 1, partie: 0.8, categorie: 0.6, comparaison: 0.9,
    dependance: 0.8, condition: 0.8, chronologie: 0.8, calcul: 1, synthese: 0.7, lieu: 0.6, "calcule-quoi": 0.7, flashcard: 0.6};

  // Mélange déterministe (même cours → même ordre).
  function melanger(a, graine) { a = a.slice(); let h = parseInt(hid(graine), 36) || 1; for (let i = a.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // Mots clés d'une réponse : mots porteurs, les plus longs d'abord, sans les mots de la notion elle-même.
  function criteres(texte, exclure = "", k = 4) {
    const ex = new Set(words(exclure).map(stem)), vus = new Set();
    return words(texte).filter(w => isContent(w) && !gen(norm(w)) && !ex.has(stem(w))).filter(w => { const s = stem(w); if (vus.has(s)) return false; vus.add(s); return true; })
      .sort((a, b) => b.length - a.length).slice(0, k).map(w => w.replace(/^(l|d|qu|n|s|c|j)['’]/i, ""));
  }
  const cacher = (texte, label) => { const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/e?s?$/, "\\p{L}*"), "giu"); return texte.replace(re, "……"); };

  function generer(g, comp, ped, opts = {}) {
    const uById = new Map(comp.unites.map(u => [u.id, u])), cById = new Map(comp.notions.map(c => [c.id, c]));
    const sur = u => u && u.statut !== STATUT.INCERTAIN, out = [];
    const def = id => { const c = cById.get(id), d = c && c.definitions.find(x => sur(uById.get(x.unite))); return d && d.definiens.split(/\s+/).length >= 3 ? d : null; };
    const nom = id => g.byId.get(id).nom, imp = id => (g.byId.get(id).importance || 0) / 100, dif = id => g.byId.get(id).difficulte || 0;
    const erreurs = id => ((ped && ped.parNotion[id] || {}).erreursProbables || []).map(e => e.texte);
    const objectif = (id, bloom) => { const o = ((ped && ped.parNotion[id] || {}).objectifs || []); return (o.find(x => x.bloom === bloom) || o[0] || {}).texte || null; };
    const src = u => u ? {unite: u.id, page: u.page, doc: u.doc, texte: u.texte} : null;
    const Q = (type, bloom, notions, o) => { const q = Object.assign({id: "q" + hid(type + notions.join() + (o.enonce || "")), type, bloom, niveau: NM.BLOOM[bloom], notions,
      objectif: objectif(notions[0], bloom), difficulte: Math.round(notions.reduce((s, id) => s + dif(id), 0) / notions.length * 0.6 + bloom * 7),
      erreursADetecter: notions.flatMap(erreurs).slice(0, 3), statut: STATUT.CONFIRME}, o);
      q.pertinence = round((notions.reduce((s, id) => s + imp(id), 0) / notions.length) * (POIDS_TYPE[type] || 0.7) * (q.statut === STATUT.CONFIRME ? 1 : 0.7));
      if (q.source && q.reponseAttendue) out.push(q); };
    const defs = g.noeuds.map(n => ({n, d: def(n.id)})).filter(x => x.d);
    defs.forEach(({n, d}) => { const u = uById.get(d.unite), crit = criteres(d.definiens, n.nom);
      Q("definition", 1, [n.id], {enonce: `Qu'est-ce que « ${n.nom} » ?`, reponseAttendue: d.definiens, corrige: d.texte, criteres: crit, source: src(u)});
      Q("directe", 1, [n.id], {enonce: `Quel mot du cours veut dire : « ${cacher(d.definiens, n.nom)} » ?`, reponseAttendue: n.nom, corrige: d.texte, criteres: criteres(n.nom, "", 3), source: src(u)});
      Q("reformulation", 2, [n.id], {enonce: `Explique « ${n.nom} » avec tes propres mots, sans recopier le cours.`, reponseAttendue: d.definiens, corrige: d.texte, criteres: crit, seuil: 0.5, source: src(u)});
      Q("flashcard", 1, [n.id], {enonce: n.nom, recto: n.nom, verso: d.definiens, reponseAttendue: d.definiens, corrige: d.texte, criteres: crit, source: src(u)});
    });
    // Questions sur les relations (seulement les liens écrits dans le cours).
    const parType = t => g.aretes.filter(a => a.type === t && a.statut === STATUT.CONFIRME && g.byId.has(a.de) && g.byId.has(a.vers));
    parType("provoque").forEach(a => { const u = uById.get(a.unite); if (!sur(u)) return; const eff = a.effet ? (a.effet === "hausse" ? "une hausse de " : "une baisse de ") : "";
      Q("causalite", 2, [a.de, a.vers], {enonce: `D'après le cours, qu'entraîne « ${nom(a.de)} » ?`, reponseAttendue: eff + nom(a.vers), corrige: a.preuve, criteres: criteres(nom(a.vers) + (a.effet ? " " + (a.effet === "hausse" ? "hausse" : "baisse") : ""), "", 4), source: src(u)});
      Q("causalite", 4, [a.vers, a.de], {enonce: `Qu'est-ce qui provoque « ${nom(a.vers)} » ? Explique le lien.`, reponseAttendue: nom(a.de), corrige: a.preuve, criteres: criteres(nom(a.de), "", 3), source: src(u)}); });
    const groupe = (t, cle) => { const m = new Map(); parType(t).forEach(a => { const k = a[cle]; if (!m.has(k)) m.set(k, []); m.get(k).push(a); }); return m; };
    groupe("partie_de", "vers").forEach((as, tout) => { const u = uById.get(as[0].unite); if (!sur(u)) return;
      Q("partie", 1, [tout, ...as.map(a => a.de)], {enonce: `Cite ${as.length > 1 ? "les " + as.length + " éléments" : "un élément"} de « ${nom(tout)} ».`, reponseAttendue: as.map(a => nom(a.de)).join(", "), corrige: [...new Set(as.map(a => a.preuve))].join(" "), criteres: as.flatMap(a => criteres(nom(a.de), "", 2)), source: src(u)}); });
    groupe("depend_de", "de").forEach((as, x) => { const u = uById.get(as[0].unite); if (!sur(u)) return;
      Q("dependance", 2, [x, ...as.map(a => a.vers)], {enonce: `De quoi dépend « ${nom(x)} » ?`, reponseAttendue: as.map(a => nom(a.vers)).join(", "), corrige: [...new Set(as.map(a => a.preuve))].join(" "), criteres: as.flatMap(a => criteres(nom(a.vers), "", 2)), source: src(u)}); });
    parType("categorie").forEach(a => { const u = uById.get(a.unite); if (!sur(u)) return; Q("categorie", 2, [a.de, a.vers], {enonce: `« ${nom(a.de)} » est une sorte de quoi ?`, reponseAttendue: nom(a.vers), corrige: a.preuve, criteres: criteres(nom(a.vers), "", 3), source: src(u)}); });
    parType("oppose").forEach(a => { const u = uById.get(a.unite); if (!sur(u)) return; const da = def(a.de), db = def(a.vers);
      Q("comparaison", 4, [a.de, a.vers], {enonce: `Quelle est la différence entre « ${nom(a.de)} » et « ${nom(a.vers)} » ?`, reponseAttendue: da && db ? `${nom(a.de)} : ${da.definiens} ; ${nom(a.vers)} : ${db.definiens}` : a.preuve,
        corrige: [da && da.texte, db && db.texte, a.preuve].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join(" "), criteres: [...criteres(da ? da.definiens : nom(a.de), nom(a.de), 2), ...criteres(db ? db.definiens : nom(a.vers), nom(a.vers), 2)], source: src(u)}); });
    parType("condition").forEach(a => { const u = uById.get(a.unite); if (!sur(u)) return; Q("condition", 2, [a.vers, a.de], {enonce: `Que faut-il pour « ${nom(a.vers)} » ?`, reponseAttendue: nom(a.de), corrige: a.preuve, criteres: criteres(nom(a.de), "", 3), source: src(u)}); });
    parType("lieu").forEach(a => { const u = uById.get(a.unite); if (!sur(u)) return; Q("lieu", 1, [a.de, a.vers], {enonce: `Où se passe « ${nom(a.de)} » ?`, reponseAttendue: nom(a.vers), corrige: a.preuve, criteres: criteres(nom(a.vers), "", 3), source: src(u)}); });
    parType("calcule").forEach(a => { const u = uById.get(a.unite); if (!sur(u)) return; Q("calcule-quoi", 2, [a.de, a.vers], {enonce: `Que permet de calculer « ${nom(a.de)} » ?`, reponseAttendue: nom(a.vers), corrige: a.preuve, criteres: criteres(nom(a.vers), "", 3), source: src(u)}); });
    // Chronologie : une chaîne d'au moins 3 étapes (dates ou étapes numérotées).
    const prec = g.aretes.filter(a => a.type === "precede" && a.statut !== STATUT.INCERTAIN), suiv = new Map(prec.map(a => [a.de, a])), entrees = new Set(prec.map(a => a.vers));
    prec.filter(a => !entrees.has(a.de)).forEach(a0 => { const ch = [a0.de]; let a = a0, garde = 0; while (a && garde++ < 8) { ch.push(a.vers); a = suiv.get(a.vers); }
      if (ch.length >= 3) Q("chronologie", 1, ch, {enonce: `Range dans l'ordre : ${melanger(ch.map(nom), ch.join()).join(" ; ")}.`, reponseAttendue: ch.map(nom).join(" → "), corrige: ch.map(nom).join(" → "), criteres: ch.map(nom), ordre: ch, source: src(uById.get(a0.unite))}); });
    // Calcul : formule « Y = X × Z » dont les symboles sont des notions du cours. Valeurs entières choisies par le programme.
    comp.unites.filter(u => u.principal === "formule" && sur(u)).forEach(u => { const f = u.texte.match(/^\s*([\p{L}Δ][\p{L}\d_']{0,3})\s*=\s*(.+)$/u); if (!f) return;
      const sym = new Map(g.noeuds.filter(n => n.symbole).map(n => [n.symbole, n])), y = sym.get(f[1]), vars = (f[2].match(/[\p{L}Δ][\p{L}\d_']{0,3}/gu) || []);
      if (!y || !vars.length || !vars.every(v => sym.has(v)) || !/^[\p{L}\d_'\s×x*\/+\-−().,]+$/u.test(f[2])) return;
      const graine = parseInt(hid(u.id + u.texte), 36), vals = {}; vars.forEach((v, i) => { vals[v] = 2 + ((graine >> (i * 4)) % 9) * (i ? 1 : 3); });
      const expr = f[2].replace(/[×x*]/g, "*").replace(/−/g, "-").replace(/,/g, ".").replace(/[\p{L}Δ][\p{L}\d_']{0,3}/gu, v => "(" + vals[v] + ")");
      if (!/^[\d\s()+\-*/.]+$/.test(expr)) return; const res = calc(expr); if (res == null || !isFinite(res)) return;
      Q("calcul", 3, [y.id, ...vars.map(v => sym.get(v).id)], {enonce: `${vars.map(v => `${v} = ${vals[v]}`).join(" et ")}. Calcule ${f[1]} (${sym.get(f[1]).nom}).`, indice: `Formule du cours : ${u.texte.trim()}`,
        reponseAttendue: String(round(res, 3)), corrige: `${u.texte.trim()} → ${f[1]} = ${f[2].replace(/[\p{L}Δ][\p{L}\d_']{0,3}/gu, v => vals[v])} = ${round(res, 3)}`, criteres: [String(round(res, 3))], numerique: round(res, 3), source: src(u)}); });
    // Synthèse : une notion centrale et ses liens écrits.
    g.noeuds.filter(n => (n.importance || 0) >= 30).forEach(n => { const as = NM.voisins(g, n.id).map(v => v.a).filter(a => a.statut === STATUT.CONFIRME && a.type !== "associe"); if (as.length < 2) return;
      const autres = [...new Set(as.map(a => a.de === n.id ? a.vers : a.de))].slice(0, 3);
      Q("synthese", 6, [n.id, ...autres], {enonce: `Explique comment « ${n.nom} » est relié à ${autres.map(id => "« " + nom(id) + " »").join(", ")}.`, reponseAttendue: as.slice(0, 3).map(a => a.preuve).join(" "),
        corrige: as.slice(0, 4).map(a => `« ${nom(a.de)} » ${NM.NOMS_REL[a.type]} « ${nom(a.vers)} ».`).join(" "), criteres: autres.flatMap(id => criteres(nom(id), "", 2)), seuil: 0.5, source: src(uById.get(as[0].unite))}); });
    // QCM de compréhension (08b-qcm.js) : les mauvaises réponses sont des erreurs plausibles, avec leur explication.
    if (NM.qcm) NM.qcm(g, comp, ped).forEach(q => out.push(q));
    // Pas de doublons : même type et mêmes notions, ou énoncés presque identiques.
    const garde = [], cles = new Set();
    out.sort((a, b) => b.pertinence - a.pertinence).forEach(q => { const k = q.type + "|" + q.notions.join(","); if (cles.has(k)) return;
      const ws = words(q.enonce).map(stem); if (garde.some(x => x.type === q.type && jaccard(ws, words(x.enonce).map(stem)) > 0.85)) return; cles.add(k); garde.push(q); });
    return garde;
  }
  // Calcul sûr d'une expression (chiffres, + - * / et parenthèses seulement).
  function calc(e) {
    let i = 0; const s = e.replace(/\s+/g, ""), num = () => { const m = s.slice(i).match(/^\d+(\.\d+)?/); if (!m) return null; i += m[0].length; return Number(m[0]); };
    const fac = () => { if (s[i] === "(") { i++; const v = add(); i++; return v; } if (s[i] === "-") { i++; const v = fac(); return v == null ? null : -v; } return num(); };
    const mul = () => { let v = fac(); while (v != null && (s[i] === "*" || s[i] === "/")) { const op = s[i++], w = fac(); if (w == null) return null; v = op === "*" ? v * w : v / w; } return v; };
    const add = () => { let v = mul(); while (v != null && (s[i] === "+" || s[i] === "-")) { const op = s[i++], w = mul(); if (w == null) return null; v = op === "+" ? v + w : v - w; } return v; };
    const v = add(); return i === s.length ? v : null;
  }

  /* Exercices : guidé (avec indice), autonome, progressif (même notion, Bloom croissant), étude de cas. */
  function exercices(banque, id) {
    const qs = banque.filter(q => q.notions.includes(id) && q.type !== "flashcard").sort((a, b) => a.bloom - b.bloom);
    const etude = banque.find(q => q.type === "situation" && q.notions.includes(id));
    return {progressif: qs.slice(0, 5), guide: qs.filter(q => q.bloom >= 2)[0] ? Object.assign({}, qs.filter(q => q.bloom >= 2)[0], {indice: qs.filter(q => q.bloom >= 2)[0].indice || "Relis la phrase du cours page " + qs.filter(q => q.bloom >= 2)[0].source.page + "."}) : null,
      autonome: qs.filter(q => q.bloom >= 3)[0] || null, etudeDeCas: etude ? Object.assign({}, etude, {enonce: etude.enonce + " Justifie avec la définition du cours.", bloom: 4}) : null};
  }

  /* Explications d'une notion, toutes tirées du cours (rien d'inventé). Si le cours n'a pas d'exemple, on le dit. */
  function expliquer(g, comp, ped, id) {
    const n = g.byId.get(id), c = comp.notions.find(x => x.id === id), d = c && c.definitions[0], nom = x => g.byId.get(x).nom;
    const liens = NM.voisins(g, id).map(v => v.a).filter(a => a.statut === STATUT.CONFIRME && a.type !== "associe");
    const pre = NM.prerequisEnChaine(g, id).sort((a, b) => b.profondeur - a.profondeur).map(p => g.byId.get(p.id));
    const voisinCat = g.aretes.filter(a => a.type === "categorie").find(a => a.de === id) ? g.aretes.filter(a => a.type === "categorie" && a.vers === g.aretes.find(x => x.type === "categorie" && x.de === id).vers && a.de !== id).map(a => g.byId.get(a.de))[0] : null;
    const contraire = liens.find(a => a.type === "oppose"), contre = contraire ? g.byId.get(contraire.de === id ? contraire.vers : contraire.de) : voisinCat;
    return {
      simple: d ? `« ${n.nom} », c'est ${d.definiens}.` : n.sources[0] ? n.sources[0].texte : null,
      approfondie: [d && d.texte, ...liens.map(a => a.preuve)].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).slice(0, 5),
      etapes: [...pre.map(p => `D'abord : « ${p.nom} »${p.definition ? " — " + p.definition : ""}`), d ? `Ensuite : ${d.texte}` : `Ensuite : « ${n.nom} »`, n.exemples[0] ? `Exemple : ${n.exemples[0].texte}` : null].filter(Boolean),
      exemple: n.exemples[0] ? {texte: n.exemples[0].texte, page: n.exemples[0].page, source: "cours"} : {texte: null, message: "Le cours ne donne pas d'exemple pour cette notion."},
      contreExemple: contre ? {texte: `« ${contre.nom} » n'est pas « ${n.nom} »${contre.definition ? " : " + contre.definition : "."}`, notion: contre.id} : null,
      reformulation: d ? `Pour dire « ${n.nom} », on peut dire : ${d.definiens}.` : null,
      erreurs: ((ped && ped.parNotion[id]) || {}).erreursProbables || [],
      sources: n.sources.slice(0, 3)
    };
  }

  /* Choisir les questions pour un élève : pertinence × besoin, niveau de Bloom adapté à la maîtrise, sans répéter. */
  function choisirQuestions(banque, profil, n = 8, now = Date.now()) {
    const cible = lvl => lvl <= 1 ? 1 : lvl <= 2 ? 2 : lvl <= 4 ? 3 : lvl <= 5 ? 4 : 5;
    const lvl = id => { const e = profil && profil.notions[id]; return e ? NM.niveauMaitrise(e, now) : 0; }, m = id => { const e = profil && profil.notions[id]; return e ? NM.maitrise(e, now) : 0; };
    const notes = banque.filter(q => q.type !== "flashcard").map(q => { const id = q.notions[0], fit = 1 - 0.25 * Math.abs(q.bloom - cible(lvl(id)));
      return {q, s: q.pertinence * (1.1 - m(id)) * Math.max(0.1, fit)}; }).sort((a, b) => b.s - a.s);
    const pris = [], notions = new Map();
    for (const x of notes) { if (pris.length >= n) break; const id = x.q.notions[0];
      if ((notions.get(id) || 0) >= 2 || pris.length && pris[pris.length - 1].type === x.q.type && notes.length > n * 2) continue;
      pris.push(x.q); notions.set(id, (notions.get(id) || 0) + 1); }
    return pris;
  }

  Object.assign(NM, {generer, exercices, expliquer, choisirQuestions, criteresDe: criteres, calc, melanger});
})(typeof window !== "undefined" ? window : globalThis);
