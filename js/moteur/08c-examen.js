/* Notéa — moteur 8 ter : des questions qui pourraient tomber en contrôle.
   1. Questions « de contrôle » fabriquées à partir du cours, avec les consignes des profs :
      Définis… · Distingue A, B et C · Cite les deux phases de… · Quelles sont les causes de… · Explique le lien…
      · Énonce le théorème… · Donne la formule… · En quelle année… · Cas pratique… Justifie · les questions posées par le cours
      lui-même · une question par partie du plan (« I. Les causes » → « Quelles sont les causes de la Première Guerre mondiale ? »).
   2. Une note « examen » sur 100 pour CHAQUE question (celles-ci et toutes les autres) :
      examen = poids du type de question dans la matière × (0,4 + 0,6 × poids de la notion pour le contrôle).
      Une notion compte pour le contrôle si le cours la met en avant : définie, dans un titre, en gras, « à retenir »,
      dans les objectifs, formule, théorème. Un mot seulement cité (« droit », « phase », « prix ») compte peu.
   3. Les questions sous 30 sont retirées ; les autres sont rangées de la plus probable à la moins probable.
      Tous les outils (quiz, révision du jour, examen blanc, prof) prennent les questions dans cet ordre. */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {STATUT, norm, hid, round, contentStems, jaccard} = NM;

  // Probabilité qu'une sorte de question tombe en contrôle (sur 100), puis réglages par matière.
  const TYPES = {"question-cours": 100, cours: 90, distinguer: 88, definition: 85, causes: 86, consequences: 86, enonce: 85, citer: 82, cas: 80, calcul: 80, expliquer: 76,
    comparaison: 75, "qcm-juste": 72, "qcm-situation": 72, dependance: 70, partie: 68, dater: 65, reformulation: 50, causalite: 62, "qcm-cause": 62, condition: 62,
    synthese: 60, chronologie: 60, situation: 62, "qcm-date": 58, "qcm-ordre": 55, "calcule-quoi": 50, flashcard: 45, directe: 40, lieu: 40, "qcm-intrus": 35, categorie: 30};
  const MATIERES = {
    droit: {cas: 98, "qcm-situation": 85, distinguer: 92, condition: 80, enonce: 70},
    histoire: {dater: 88, chronologie: 84, "qcm-date": 78, "qcm-ordre": 72, causes: 92, consequences: 92, cas: 55},
    geographie: {lieu: 72, causes: 88, consequences: 88, cas: 60},
    mathematiques: {enonce: 95, calcul: 95, cas: 55, dater: 20},
    physique_chimie: {enonce: 92, calcul: 95, "calcule-quoi": 72, dater: 20},
    svt: {lieu: 62, cours: 92, citer: 86, causes: 86},
    economie: {causes: 90, consequences: 90, "qcm-cause": 74, dependance: 80, calcul: 85},
    gestion: {calcul: 92, citer: 86, cas: 85},
    francais: {"qcm-situation": 85, cas: 88, distinguer: 90},
    philosophie: {distinguer: 95, definition: 90, enonce: 75, cas: 50},
    informatique: {cas: 75, enonce: 70},
    langues: {cas: 70}
  };
  const POURQUOI = {"question-cours": "Ton cours pose lui-même cette question.", cours: "C'est une partie du plan du cours : une question de cours classique.",
    distinguer: "Distinguer des notions proches : très fréquent en contrôle.", definition: "Définir une notion clé : très souvent demandé.",
    causes: "Les causes d'un phénomène : question classique.", consequences: "Les conséquences d'un phénomène : question classique.",
    enonce: "Savoir énoncer la règle ou la formule : indispensable.", citer: "Le cours donne une liste : on demande souvent de la citer.",
    cas: "Appliquer le cours à une situation : c'est ce que demandent les exercices.", calcul: "Un calcul avec la formule du cours.",
    expliquer: "Expliquer un lien de cause à effet.", dater: "Une date importante du cours."};

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const nettoyerTitre = t => String(t || "").replace(/^(chapitre|partie|section|leçon|thème|séquence)\s*[\dIVX]*\s*[:.\-–]?\s*/i, "").replace(/^[\dIVX]+(\.\d+)*\s*[.)\-–]?\s*|^[A-H][.)]\s*/, "")
    .replace(/\s*\([^)]*\d{3,4}[^)]*\)\s*$/, "").trim().replace(/^(.)(.*)$/, (m, a, b) => m === m.toUpperCase() && m.length > 3 ? a + b.toLowerCase() : m);
  // « La photosynthèse » → « de la photosynthèse » ; « Le bilan » → « du bilan ».
  const deDe = s => { s = s.trim(); if (/^le\s/i.test(s)) return "du " + s.slice(3); if (/^les\s/i.test(s)) return "des " + s.slice(4); if (/^la\s/i.test(s)) return "de la " + s.slice(3);
    if (/^l['’]/i.test(s)) return "de l'" + s.slice(2); return (/^[aeiouyhàâéèêîôû]/i.test(s) ? "d'" : "de ") + s; };
  const minus = s => /^L['’]/.test(s) ? "l" + s.slice(1) : /^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) && !/^[A-ZÀ-Ý][a-zà-ÿ]+[A-Z-]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const sansArt = s => norm(s).replace(/^(l['’ ]\s*|le |la |les )/, "");
  const RUBRIQUES = /^(m[ée]thode|d[ée]finitions?|exemples?|remarques?|r[ée]sum[ée]|introduction|conclusion|exercices?|rappels?|objectifs?|à retenir|vocabulaire|notions?)$/i;
  const NOMBRES = {deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8};

  function examen(questions, g, comp, classif, structure, ped) {
    const disc = classif && classif.matiere && classif.matiere.discipline, T = Object.assign({}, TYPES, MATIERES[disc] || {});
    const uById = new Map(comp.unites.map(u => [u.id, u])), cById = new Map(comp.notions.map(c => [c.id, c]));
    const sur = u => u && u.statut !== STATUT.INCERTAIN && !u.meta, nom = id => g.byId.get(id).nom;
    const src = u => u ? {unite: u.id, page: u.page, doc: u.doc, texte: u.texte} : null;
    const chap = classif && classif.chapitre && classif.chapitre.valeur ? nettoyerTitre(classif.chapitre.valeur) : "";
    const objectifs = ((classif && classif.objectifs) || []).map(o => norm(o.texte)).join(" ");

    /* Poids d'une notion pour le contrôle (0 à 1). */
    const poids = new Map(), maxImp = Math.max(1, ...g.noeuds.map(n => n.importance || 0));
    g.noeuds.forEach(n => { const c = cById.get(n.id), us = c ? c.unites.map(id => uById.get(id)).filter(Boolean) : [];
      const misEnAvant = c && (c.definitions.length || c.evidence || c.origines.includes("titre") || objectifs.includes(norm(n.nom)) || n.symbole || us.some(u => ["retenir", "theoreme", "loi", "principe", "question"].includes(u.principal)));
      const imp = (n.importance || 0) / maxImp, titre = chap && (norm(chap).includes(norm(n.nom)) || norm(n.nom).includes(norm(chap)));
      poids.set(n.id, titre ? 1 : misEnAvant ? 0.5 + 0.5 * imp : Math.min(0.45, 0.7 * imp)); });
    const W = ids => { const v = ids.map(id => poids.get(id) || 0).sort((a, b) => b - a); return v.length ? (v[0] + (v[1] != null ? v[1] : v[0])) / 2 : 0.3; };
    const cles = new Set(), nouvelles = [];
    const Q = (type, bloom, notions, o) => { if (!o.source || !o.reponseAttendue) return; nouvelles.push(Object.assign({id: "q" + hid(type + notions.join() + o.enonce), type, bloom, niveau: NM.BLOOM[bloom], notions,
      objectif: null, difficulte: bloom * 12, statut: STATUT.CONFIRME, erreursADetecter: [], seuil: 0.45}, o)); };
    const crit = (t, ex, k) => NM.criteresDe(t, ex || "", k);

    /* a. Les questions écrites dans le cours (« Expliquez… », « Citez… »). */
    comp.unites.filter(u => u.principal === "question" && sur(u)).forEach(u => {
      const rep = comp.unites.filter(x => x.section === u.section && x.id !== u.id && x.principal !== "question" && sur(x)).slice(0, 3), ms = NM.mentions(u.texte + " " + rep.map(x => x.texte).join(" "), comp.notions);
      if (!rep.length) return;
      Q("question-cours", 4, [...new Set(ms.map(m => m.c.id))].slice(0, 4).concat(ms.length ? [] : [g.noeuds[0] && g.noeuds[0].id]).filter(Boolean), {enonce: u.texte.trim(), reponseAttendue: rep.map(x => x.texte).join(" "),
        corrige: rep.map(x => x.texte).join(" "), criteres: [...new Set(ms.map(m => m.c.label))].slice(0, 5).flatMap(l => crit(l, "", 2)), source: src(u)}); });

    /* b. Une question par partie du plan. */
    const blocChap = classif && classif.chapitre && classif.chapitre.bloc;
    const R = (mot) => new RegExp("(^|[^\\p{L}])(" + mot + ")($|[^\\p{L}])", "iu");
    structure.blocs.filter(b => b.kind === "titre" && b.id !== blocChap).forEach(b => {
      const us = comp.unites.filter(u => u.section === b.id && sur(u) && u.principal !== "question"); if (!us.length) return;
      const ms = new Map(); us.forEach(u => NM.mentions(u.texte, comp.notions).forEach(m => ms.set(m.c.id, (ms.get(m.c.id) || 0) + 1)));
      const ids = [...ms.keys()].filter(id => g.byId.has(id)).sort((a, b) => (poids.get(b) || 0) - (poids.get(a) || 0)); if (!ids.length) return;
      const t = nettoyerTitre(b.texte), sujetChap = chap ? minus(chap) : nom(ids[0]);
      // De quoi parle la partie : ce qui suit « de » dans le titre (« Les causes de la crise »), sinon le chapitre.
      const md = t.match(/\s(de la|de l['’]|du|des|de|d['’])\s*(.+)$/i), sujet = md ? (md[1].toLowerCase().replace("’", "'") + (/'$/.test(md[1]) ? "" : " ") + md[2]) : deDe(sujetChap);
      const sujetNu = md ? md[2] : sujetChap, motTitre = minus(t.replace(/\s(de la|de l['’]|du|des|de|d['’])\s*.+$/i, ""));
      const notionTitre = g.noeuds.find(n => norm(t).replace(/^(l['’ ]\s*|le |la |les |une? |des )/, "") === norm(n.nom));
      let enonce;
      if (R("définitions?|définir").test(t)) enonce = `Définis ${/^définir\s+/i.test(t) ? minus(t.replace(/^définir\s+/i, "")) : "« " + nom(ids[0]) + " »"}.`;
      else if (R("causes?|origines?").test(t)) enonce = `Quelles sont ${motTitre.replace(/^(une?|des)\s/i, "les ")} ${sujet} ?`;
      else if (R("conséquences?|effets?").test(t)) enonce = `Quelles sont ${motTitre.replace(/^(une?|des)\s/i, "les ")} ${sujet} ?`;
      else if (R("facteurs?").test(t)) enonce = `De quels facteurs dépend ${md ? minus(md[2]) : sujetChap} ?`;
      else if (R("étapes?|phases?|déroulement|fonctionnement|mécanismes?").test(t)) enonce = `Décris ${/^(le|la|les|l')/i.test(motTitre) ? motTitre : "les étapes"} ${sujet}.`;
      else if (R("caractéristiques?|types?|formes?|catégories?|acteurs?|moteurs?|rôles?|enjeux|limites?|avantages?|inconvénients?|conditions?|principes?|propriétés?").test(t))
        enonce = `${/^les\s/i.test(motTitre) ? "Quels sont" : "Présente"} ${/^(le|la|les|l')/i.test(motTitre) ? motTitre : "les " + motTitre} ${sujet} ?`.replace(/^Présente (.*) \?$/, "Présente $1.");
      else if (notionTitre) enonce = `Présente ${/^(le|la|les|l['’])/i.test(t) ? minus(t) : article(notionTitre.nom)}.`;
      else enonce = `Explique : « ${t} »${chap && !norm(t).includes(norm(chap)) ? " (" + sujetChap + ")" : ""}.`;
      enonce = enonce.replace(/\s+/g, " ").replace(/^Quelles sont (les (?:effets|facteurs|moteurs|acteurs|types|rôles|enjeux|principes))/i, "Quels sont $1").replace(/ de (le|les) /g, (m, a) => a === "le" ? " du " : " des ");
      void sujetNu;
      const cles = us.filter(u => NM.mentions(u.texte, comp.notions).some(m => ids.slice(0, 4).includes(m.c.id))).slice(0, 4);
      Q("cours", 4, ids.slice(0, 4), {enonce, reponseAttendue: cles.map(u => u.texte).join(" "), corrige: cles.map(u => u.texte).join(" "),
        criteres: ids.slice(0, 5).flatMap(id => crit(nom(id), "", 2)).slice(0, 8), seuil: 0.4, source: src(cles[0] || us[0])}); });

    /* c. Distinguer des notions proches (même famille, opposées, ou faciles à confondre). */
    const def = id => { const c = cById.get(id), d = c && c.definitions.find(x => sur(uById.get(x.unite))); return d || null; };
    const groupes = new Map();
    g.aretes.filter(a => a.type === "categorie" && a.statut !== STATUT.INCERTAIN && def(a.de)).forEach(a => { if (!groupes.has(a.vers)) groupes.set(a.vers, new Set()); groupes.get(a.vers).add(a.de); });
    const ensembles = [...groupes.values()].map(s => [...s]).filter(l => l.length >= 2);
    g.aretes.filter(a => a.type === "oppose" && def(a.de) && def(a.vers)).forEach(a => ensembles.push([a.de, a.vers]));
    g.noeuds.forEach(n => (n.confusions || []).forEach(c => { if (def(n.id) && def(c.avec)) ensembles.push([n.id, c.avec]); }));
    const vus = new Set(), dejaEnsemble = [], hier = new Set(g.aretes.filter(a => ["categorie", "partie_de"].includes(a.type)).map(a => a.vers));
    ensembles.map(l => [...new Set(l)].filter(id => !(hier.has(id) && l.some(x => x !== id && g.aretes.some(a => a.de === x && a.vers === id && ["categorie", "partie_de"].includes(a.type))))))
      .map(l => { const sansChap = l.filter(id => !(chap && sansArt(chap) === sansArt(nom(id)))); return sansChap.length >= 3 ? sansChap : l; })
      .sort((a, b) => b.length - a.length).forEach(l => { const estChap = id => chap && sansArt(chap) === sansArt(nom(id));
        if (l.length < 2 || dejaEnsemble.some(e => l.every(id => e.includes(id)) || (l.some(estChap) && l.filter(id => !estChap(id)).every(id => e.includes(id))))) return; dejaEnsemble.push(l); const pos = id => { const c = cById.get(id); return c && c.unites.length ? Math.min(...c.unites.map(u => Number(String(u).slice(1)) || 0)) : 1e9; };
      l = [...new Set(l)].sort((a, b) => (poids.get(b) || 0) - (poids.get(a) || 0)).slice(0, 4).sort((a, b) => pos(a) - pos(b)); const k = [...l].sort().join(); if (vus.has(k) || l.length < 2) return; vus.add(k);
      const noms = l.map(id => "« " + nom(id) + " »"), liste = noms.length === 2 ? noms.join(" et ") : noms.slice(0, -1).join(", ") + " et " + noms[noms.length - 1];
      Q("distinguer", 4, l, {enonce: `Distingue ${liste}.`, reponseAttendue: l.map(id => nom(id) + " : " + def(id).definiens).join(" ; "), corrige: l.map(id => def(id).texte).join(" "),
        criteres: l.flatMap(id => crit(def(id).definiens, nom(id), 2)), seuil: 0.5, source: src(uById.get(def(l[0]).unite))}); });

    /* d. Citer une liste annoncée par le cours (« La photosynthèse comprend deux phases : … »). */
    const R_LISTE = /^(.*?)\s+(comprend|comprennent|se compose(?:nt)? de|se décompose(?:nt)? en|est composée? de|sont composée?s? de|regroupe(?:nt)?|réunit|présente|a|possède|on distingue|il existe|distingue)\s+(deux|trois|quatre|cinq|six|sept|huit|\d+|plusieurs|des|les)?\s*([^:]*?)\s*:\s*(.*)$/i;
    comp.unites.filter(u => sur(u) && u.texte.includes(":") && !/^(objectifs?|prérequis|rappels?)/i.test(u.texte)).forEach(u => {
      const m = u.texte.match(R_LISTE); if (!m) return;
      let items = m[5].trim() ? m[5].replace(/\.$/, "").split(/\s*(?:,|;|\set\s)\s*/).map(x => x.trim()).filter(Boolean) : comp.unites.filter(x => x.intro === u.id).map(x => x.texte.split(/,/)[0].trim());
      if (items.length < 2 || items.some(x => x.split(/\s+/).length > 10)) return;
      let sujet = m[1].trim(); if (/^(on|il|elle|ils|elles)$/i.test(sujet) || !sujet) sujet = chap || "ce chapitre";
      const quoi = (m[4] || "éléments").trim(), n = NOMBRES[norm(m[3] || "")] || (/^\d+$/.test(m[3] || "") ? Number(m[3]) : items.length);
      const ms = NM.mentions(u.texte + " " + items.join(" "), comp.notions).map(x => x.c.id).filter(id => g.byId.has(id));
      if (!ms.length) return;
      Q("citer", 1, [...new Set(ms)].slice(0, 4), {enonce: `Cite les ${n > 1 ? (Object.keys(NOMBRES).find(k => NOMBRES[k] === n) || n) + " " : ""}${quoi || "éléments"} ${deDe(minus(sujet))}.`,
        reponseAttendue: items.join(", "), corrige: u.texte + (m[5].trim() ? "" : " " + items.join(" ; ")), criteres: items.flatMap(x => crit(x, "", 1)), seuil: 0.6, source: src(u)}); });

    /* e. Causes et conséquences (plusieurs causes d'un même effet, plusieurs effets d'une même cause), et liens importants. */
    const causales = g.aretes.filter(a => a.type === "provoque" && a.statut === STATUT.CONFIRME && sur(uById.get(a.unite)));
    const par = (k) => { const m = new Map(); causales.forEach(a => { if (!m.has(a[k])) m.set(a[k], []); m.get(a[k]).push(a); }); return m; };
    par("vers").forEach((as, y) => { if (as.length < 2) return; Q("causes", 4, [y, ...as.map(a => a.de)], {enonce: `Quelles sont les causes de « ${nom(y)} » ?`, reponseAttendue: as.map(a => nom(a.de)).join(", "),
      corrige: [...new Set(as.map(a => a.preuve))].join(" "), criteres: as.flatMap(a => crit(nom(a.de), "", 2)), seuil: 0.5, source: src(uById.get(as[0].unite))}); });
    par("de").forEach((as, x) => { if (as.length < 2) return; Q("consequences", 4, [x, ...as.map(a => a.vers)], {enonce: `Quelles sont les conséquences de « ${nom(x)} » ?`, reponseAttendue: as.map(a => nom(a.vers)).join(", "),
      corrige: [...new Set(as.map(a => a.preuve))].join(" "), criteres: as.flatMap(a => crit(nom(a.vers), "", 2)), seuil: 0.5, source: src(uById.get(as[0].unite))}); });
    causales.forEach(a => { const u = uById.get(a.unite);
      Q("expliquer", 4, [a.de, a.vers], {enonce: `Explique le lien entre « ${nom(a.de)} » et « ${nom(a.vers)} ».`, reponseAttendue: a.preuve, corrige: a.preuve,
        criteres: [...crit(nom(a.de), "", 2), ...crit(nom(a.vers), "", 2), ...(a.effet ? [a.effet] : [])], seuil: 0.5, source: src(u)}); });

    /* f. Énoncer un théorème, une loi, une règle ; donner une formule. */
    comp.unites.filter(u => sur(u) && ["theoreme", "loi", "principe", "propriete"].includes(u.principal)).forEach(u => {
      const m = u.texte.match(/^(.{3,60}?)\s*:\s*/), ms = NM.mentions(u.texte, comp.notions); if (!ms.length) return;
      const nomRegle = m ? m[1].trim() : ms[0].c.label;
      Q("enonce", 2, [ms[0].c.id], {enonce: `Énonce ${/^(le|la|les|l['’])/i.test(nomRegle) ? minus(nomRegle) : (/^th[ée]or|^princip/i.test(nomRegle) ? "le " : /^loi|^règle|^propriét/i.test(nomRegle) ? "la " : "") + minus(nomRegle)}.`,
        reponseAttendue: m ? u.texte.slice(m[0].length) : u.texte, corrige: u.texte, criteres: crit(m ? u.texte.slice(m[0].length) : u.texte, nomRegle, 5), seuil: 0.5, source: src(u)}); });
    comp.unites.filter(u => sur(u) && u.principal === "formule").forEach((u, i, all) => { const f = u.texte.match(/^\s*([\p{L}Δ][\p{L}\d_']{0,3})\s*=\s*(.+)$/u); if (!f) return;
      const y = g.noeuds.find(n => n.symbole === f[1]); if (!y) return; const leg = comp.unites.find(x => /^(où|avec)\s/i.test(x.texte) && Number(x.id.slice(1)) > Number(u.id.slice(1)) && Number(x.id.slice(1)) <= Number(u.id.slice(1)) + 2);
      const vars = g.noeuds.filter(n => n.symbole && n.symbole !== f[1] && f[2].includes(n.symbole));
      Q("enonce", 2, [y.id, ...vars.map(n => n.id)], {enonce: `Donne la formule ${deDe(article(y.nom))} et dis ce que représente chaque lettre.`, reponseAttendue: u.texte.trim() + (leg ? " " + leg.texte : ""),
        corrige: u.texte.trim() + (leg ? " " + leg.texte : ""), criteres: [f[1], ...vars.map(n => n.symbole), ...vars.flatMap(n => crit(n.nom, "", 1))], seuil: 0.6, source: src(u)}); });
    function article(label) { const c = comp.unites.map(u => u.texte.match(new RegExp("(?:^|[\\s'’])(le|la|l['’])\\s*" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"))).find(Boolean); return c ? c[1].toLowerCase().replace("’", "'") + (/['’]$/.test(c[1]) ? "" : " ") + label : label; }

    /* g. Dates importantes (surtout en histoire). */
    comp.unites.filter(u => sur(u) && /\b(1[0-9]{3}|20[0-2][0-9])\b/.test(u.texte) && u.texte.split(/\s+/).length >= 5).forEach(u => {
      const an = u.texte.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/)[1], ms = NM.mentions(u.texte, comp.notions).filter(m => g.byId.has(m.c.id)); if (!ms.length) return;
      Q("dater", 1, [ms[0].c.id], {enonce: `En quelle année ? « ${u.texte.replace(an, "……").trim()} »`, reponseAttendue: an, corrige: u.texte, criteres: [an], seuil: 1, source: src(u)}); });

    /* h. Cas pratique : un exemple du cours, à relier à la bonne notion, en justifiant. */
    g.noeuds.forEach(n => { const d = def(n.id); if (!d) return; (n.exemples || []).slice(0, 2).forEach(ex => { const u = uById.get(ex.unite); if (!sur(u)) return;
      const re = new RegExp(n.nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/e?s?$/, "\\p{L}*"), "giu"), cache = ex.texte.replace(re, "……").replace(/^(par exemple|exemple|ex)\s*[:,.]?\s*/i, "");
      Q("cas", 3, [n.id], {enonce: `Cas pratique : « ${cap(cache.trim())} » Quelle notion du cours s'applique ici ? Justifie avec sa définition.`, reponseAttendue: n.nom + " : " + d.definiens,
        corrige: d.texte + " " + ex.texte, criteres: [...crit(n.nom, "", 2), ...crit(d.definiens, n.nom, 2)], seuil: 0.5, source: src(u)}); }); });

    /* Définitions : consigne de contrôle, avec l'exemple du cours s'il y en a un. */
    questions.forEach(q => { if (q.type !== "definition") return; const n = g.byId.get(q.notions[0]); if (!n) return; const ex = (n.exemples || [])[0];
      q.enonce = `Définis « ${n.nom} »${ex ? " et donne un exemple" : ""}.`; if (ex) { q.corrige = q.corrige + " Exemple du cours : " + ex.texte; } });

    /* Note « examen » pour toutes les questions, tri, et retrait de ce qui ne tombera pas. */
    const toutes = [...nouvelles, ...questions];
    toutes.forEach(q => { const tw = T[q.type] != null ? T[q.type] : 55, w = ["cours", "question-cours", "causes", "consequences"].includes(q.type) ? Math.max(0.75, W(q.notions || [])) : W(q.notions || []);
      q.examen = Math.round(tw * (0.4 + 0.6 * w)); q.pertinence = round(q.examen / 100); q.pourquoiExamen = POURQUOI[q.type] || null; });
    const rubrique = new Set(g.noeuds.filter(n => RUBRIQUES.test(n.nom.trim())).map(n => n.id));
    const avecEnonce = new Set(toutes.filter(q => q.type === "enonce").map(q => q.notions[0]));
    const garde = [];
    toutes.filter(q => q.examen >= 30 && !(q.notions || []).slice(0, 1).some(id => rubrique.has(id)) && !(["definition", "reformulation"].includes(q.type) && avecEnonce.has(q.notions[0]))).sort((a, b) => b.examen - a.examen).forEach(q => { const k = q.type + "|" + (q.notions || []).join(","); if (cles.has(k)) return;
      const ws = contentStems(q.enonce); if (garde.some(x => jaccard(ws, contentStems(x.enonce)) > 0.8)) return; cles.add(k); garde.push(q); });
    return garde;
  }

  Object.assign(NM, {examen, TYPES_EXAMEN: TYPES, MATIERES_EXAMEN: MATIERES});
})(typeof window !== "undefined" ? window : globalThis);
