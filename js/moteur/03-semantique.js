/* Notéa — moteur 3 : compréhension sémantique et conceptuelle (le cœur).
   1. Unités : chaque phrase, élément de liste, ligne de tableau ou formule devient une unité, avec sa provenance.
   2. Types de connaissance : chaque unité reçoit un type principal et des types secondaires (24 types).
   3. Notions (concepts) : termes définis, termes mis en évidence, titres, groupes nominaux qui reviennent.
   4. Relations typées entre notions, trouvées par des motifs explicites (statut confirme) ou déduites
      (dépendance de définition, cooccurrence : statut infere). Chaque relation garde la phrase qui la prouve.
   5. Contrôles : définitions contradictoires, notions citées mais jamais expliquées. */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {gen, VERBES, U, STATUT, STOP, GENERIQUES, norm, stem, words, clean, isContent, sentences, hid, round} = NM;

  /* ---------- 2. Types de connaissance ---------- */
  const T = {
    definition: [U(/\b(on appelle|on nomme|se définit|est défini[e]?s? comme|désigne(?:nt)?|signifie(?:nt)?|correspond(ent)? à|consiste(?:nt)? (à|en)|c'est-à-dire|autrement dit)\b/i), U(/^[^,;:]{2,60}?\s(est|sont)\s(un|une|le|la|les|l['’]|des|ce|celui|celle|ceux|tout|toute)\b/i), /^[\p{L}][^:]{1,50}\s?:\s+(\p{Ll}|un|une|le|la|les)/iu],
    theoreme: [U(/\b(théorème|lemme|corollaire)\b/i)], loi: [U(/\bloi (de|d['’]|des)\b/i), U(/\bloi\s+\p{Lu}/u)],
    principe: [U(/\bprincipe\b/i)], regle: [U(/\b(règle|il faut toujours|ne (doit|doivent) jamais|est interdit|obligatoire|est tenu|article\s+\d+)\b/i), U(/\b(doit|doivent|il faut)\b/i)],
    formule: [/[=≈]\s*[\p{L}\d(√]/u, U(/\bformule\b/i)], propriete: [U(/\bpropriété\s*:/i), U(/\b(pour tout|quel que soit)\b/i)],
    mecanisme: [U(/\b(mécanisme|fonctionne|fonctionnement)\b/i)], processus: [U(/\b(étapes?|d['’]abord|ensuite|puis|enfin|se déroule en|phase|cycle)\b/i)],
    classification: [U(/\b(on distingue|il existe (deux|trois|quatre|cinq|plusieurs|\d+) (types?|sortes?|catégories?|formes?|familles?)|se divise(?:nt)? en|se décompose(?:nt)? en|se classe(?:nt)?|catégories?)\b/i)],
    comparaison: [U(/\b(contrairement (?:à|aux|au)|à la différence de|alors que|tandis que|par rapport à|de même que|comparé à|à l['’]inverse|plus\s+\p{L}+\s+que|moins\s+\p{L}+\s+que)\b/iu)],
    cause: [U(/\b(parce qu|car|en raison d|à cause d|grâce à|provoque|entraîne|cause|engendre|est dû|est due|résulte|découle|s'explique par|est à l['’]origine)\b/i)],
    consequence: [U(/\b(donc|par conséquent|c['’]est pourquoi|si bien que|de sorte que|en conséquence|conséquence|aboutit à|conduit à|il en résulte)\b/i)],
    chronologie: [U(/\b(1[0-9]{3}|20[0-2][0-9])\b/), U(/\b[IVX]{1,4}e\s+siècle\b/i), U(/\b(en|depuis|jusqu['’]en|à partir de)\s+(1[0-9]{3}|20[0-2][0-9])\b/i)],
    methode: [U(/\b(méthode|pour (calculer|résoudre|déterminer|trouver|rédiger|analyser|démontrer|identifier))\b/i), U(/^(pour|afin de)\s+\p{Ll}+er\b.*,\s*(il faut|on|il suffit)/iu)],
    exemple: [/^(par exemple|exemple|ex\s*[:.]|imaginons|prenons|supposons qu|cas pratique|illustration)/i, U(/\b(par exemple|notamment|tels? que|telles? que|c'est le cas d|comme lorsque|à l['’]image de)\b/i)],
    application: [U(/\b(s['’]applique|application|appliqu(er|é))\b/i)],
    condition: [/^si\s/i, U(/\b(à condition qu|à condition de|il faut que|nécessite|suppose que|exige|n['’]est possible que si|seulement si|si et seulement si|pourvu qu)\b/i)],
    exception: [U(/\b(sauf|excepté|à l['’]exception|hormis|hors|ne s['’]applique pas|exception)\b/i)],
    hypothese: [U(/\b(hypothèse|supposons|on suppose|admettons)\b/i)],
    conclusion: [U(/^(en conclusion|en résumé|pour conclure|finalement|ainsi|on en déduit|il en découle)\b/i)],
    argument: [U(/\b(en effet|puisque|d['’]une part|d['’]autre part|or\b|certes|néanmoins|cependant)\b/i)],
    demonstration: [U(/\b(démonstration|démontrons|montrons que|preuve|prouvons|cqfd)\b/i)],
    question: [/\?\s*$/, U(/^(expliquez|définissez|citez|comparez|montrez|justifiez|analysez|décrivez|calculez|démontrez|résumez)\b/i)],
    retenir: [U(/^(à retenir|retenir|important|attention|essentiel|à savoir|notez|retenez)\b/i)]
  };
  const PRIORITE = ["question", "retenir", "demonstration", "theoreme", "loi", "formule", "definition", "exemple", "classification", "methode", "principe", "propriete",
    "condition", "exception", "hypothese", "comparaison", "consequence", "cause", "processus", "mecanisme", "chronologie", "conclusion", "application", "regle", "argument"];
  const NOMS_TYPES = {definition: "Définition", concept: "Concept", principe: "Principe", regle: "Règle", loi: "Loi", theoreme: "Théorème", formule: "Formule", propriete: "Propriété",
    mecanisme: "Mécanisme", processus: "Processus", classification: "Classification", comparaison: "Comparaison", cause: "Cause", consequence: "Conséquence", chronologie: "Chronologie",
    methode: "Méthode", exemple: "Exemple", application: "Application", condition: "Condition", exception: "Exception", hypothese: "Hypothèse", conclusion: "Conclusion",
    argument: "Argument", demonstration: "Démonstration", question: "Question du cours", retenir: "À retenir", legende: "Légende"};

  function typer(u) {
    const t = u.texte, hits = PRIORITE.filter(k => T[k].some(r => r.test(t)));
    if (u.kind === "formule") hits.unshift("formule");
    if (u.kind === "legende" || /^(où|avec)\s+\p{L}{1,3}\s/u.test(t)) hits.unshift("legende");
    if (u.kind === "item" && u.ordonnee) hits.push("processus");
    // « Si … alors » écrit dans un exemple chiffré reste un exemple.
    let principal = hits[0] || "concept";
    if (principal === "regle" && hits.includes("definition")) principal = "definition";
    if (principal === "exemple" && U(/^[^,;:]{2,60}?\s(est|sont)\s(un|une)\b/i).test(t) && !/^(par exemple|exemple)/i.test(t)) principal = hits.includes("definition") ? "definition" : principal;
    return {principal, secondaires: [...new Set(hits.filter(h => h !== principal))]};
  }

  /* ---------- 1. Unités ---------- */
  function unites(structure) {
    const out = [];
    const add = (b, texte, kind, extra = {}) => { texte = texte.trim(); if (texte.length < 2) return;
      const q = NM.qualite(texte), conf = Math.round(Math.min(b.conf, q.conf) * 100) / 100;
      out.push(Object.assign({id: "u" + (out.length + 1), bloc: b.id, page: b.page, doc: b.doc, section: b.section, chemin: b.chemin, kind, texte, conf, statut: conf < 0.6 ? STATUT.INCERTAIN : b.statut,
        evid: (b.evid || []).filter(e => texte.includes(e.texte) || e.type === "encadre")}, extra)); };
    structure.blocs.forEach((b, i) => {
      if (b.kind === "titre") return;
      if (b.kind === "para") sentences(b.texte).forEach(s => add(b, s, "phrase", b.fleches ? {fleches: b.fleches} : {}));
      else if (b.kind === "liste") { const prev = out[out.length - 1], intro = prev && prev.bloc === structure.blocs[i - 1]?.id && /:\s*$/.test(prev.texte) ? prev.id : null;
        b.items.forEach((it, k) => add(b, it, "item", {intro, rang: k + 1, ordonnee: b.ordonnee})); }
      else if (b.kind === "tableau") b.lignes.forEach((r, k) => add(b, r.map((c, j) => (b.entetes[j] ? b.entetes[j] + " : " : "") + c).filter(x => !/:\s*$/.test(x)).join(" ; "), "ligne", {rang: k + 1, cellules: r, entetes: b.entetes}));
      else add(b, b.texte, b.kind, b.fleches && b.kind !== "formule" ? {fleches: b.fleches} : {});
    });
    out.forEach(u => Object.assign(u, typer(u)));
    // Listes d'objectifs ou de prérequis annoncés : unités « méta » (elles parlent du cours, elles ne l'enseignent pas).
    out.forEach(u => { const intro = u.intro && out.find(x => x.id === u.intro);
      if (intro && /^(objectifs?|prérequis|pré-requis|rappels?|à la fin|vous (devez|serez)|compétences?)/i.test(intro.texte)) { u.meta = true; intro.meta = true; } });
    return out;
  }

  /* ---------- Repérage des mots dans une phrase (avec positions) ---------- */
  function jetons(texte) { const out = []; const re = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu; let m;
    while ((m = re.exec(texte))) { const w = m[0], c = clean(w), prev = out[out.length - 1];
      out.push({w, i: m.index, j: m.index + w.length, c, s: stem(w), p: !!prev && /[,;:.!?()«»"\[\]=+×÷*\/−–—<>≤≥]/.test(texte.slice(prev.j, m.index)), verbe: VERBES.has(c) && !/^à$/i.test(w),
        contenu: c.length >= 2 && !STOP.has(c) && !/^\d+$/.test(c) && !/^[sn]['’]/i.test(w)}); } return out; }

  /* ---------- 3. Notions ---------- */
  const R_TERME_DEF = [
    {r: U(/^(?:l['’]|le |la |les |un |une |des )?([^,;:()]{2,60}?)\s+(?:est|sont)\s+(?:un|une|le|la|les|l['’]|des|ce|celui|celle|ceux|tout|toute)\b\s*(.*)$/i), g: 1},
    {r: U(/\bon (?:appelle|nomme)\s+(?:l['’]|le |la |les |un |une |des )?([^,;:]{2,60}?)\s*(?:,|:|\s(?=(?:le|la|les|l['’]|un|une|des|ce|cette|tout|toute|ces)\s))\s*(.*)$/i), g: 1},
    {r: /^(?:l['’]|le |la |les |un |une |des )?([^,;:()]{2,60}?)\s+(?:désigne(?:nt)?|signifie(?:nt)?|correspond(?:ent)? à|consiste(?:nt)? (?:à|en)|se définit (?:comme|par)|est défini[e]?s? comme)\s+(.*)$/i, g: 1},
    {r: /^(?:l['’]|le |la |les )?([\p{L}][\p{L}'’\-]*(?: [\p{L}][\p{L}'’\-]*){0,3})\s?:\s+(.{8,})$/iu, g: 1}
  ];
  function termeDefini(u) {
    if (u.principal === "legende" || !["definition"].includes(u.principal) && !u.secondaires.includes("definition")) return null;
    const tx = u.texte.replace(/^(à retenir|important|attention|essentiel|à savoir|notez|retenez|définition|rappel)\s*:\s*/i, "");
    for (const {r} of R_TERME_DEF) { const m = tx.match(r); if (!m) continue;
      let terme = m[1].trim().replace(/^(?:en (?:droit|économie|biologie|physique|chimie|mathématiques|histoire)|ainsi|donc|alors|par exemple)\s*,?\s*/i, "").replace(/^(l['’]|le |la |les |un |une |des )/i, "").trim();
      const nw = terme.split(/\s+/).length;
      if (nw > 6 || terme.length < 2 || /^(à retenir|retenir|important|attention|remarque|rappel|note|exemple|définition)$/i.test(terme) || /^(il|elle|ils|elles|ce|cela|ceci|c|on|cette|cet|celui|celle)$/i.test(terme) || jetons(terme).some(x => x.verbe)) continue;
      if (!terme.split(/\s+/).some(isContent)) continue;
      return {terme, definiens: (m[2] || "").trim().replace(/\.$/, "")};
    }
    return null;
  }
  // Groupes nominaux : suites de mots porteurs, reliés par de/du/des/d'/à/en (« droit de propriété », « taux d'intérêt »).
  const LIENS = new Set(["de", "du", "des", "d", "à", "a", "en", "la", "l", "aux", "au"]);
  function groupes(js, max = 4) {
    const out = [];
    for (let i = 0; i < js.length; i++) { const debutGen = js[i].contenu && gen(js[i].c);
      if (!js[i].contenu || js[i].verbe || /^\p{Ll}+(er|ir)$/u.test(js[i].c) && js[i].c.length > 6 && i === 0) continue;
      if (i >= 2 && /^(et|ou)$/.test(js[i - 1].c) && js[i - 2].contenu) continue;   // « générale et durable des prix » : adjectifs coordonnés
      let k = i, n = 0, liens = 0, suite = 0;
      while (k < js.length && n < max) {
        if (k > i && js[k].p) break;                                  // jamais à travers une virgule ou un point
        if (js[k].verbe) break;
        if (js[k].contenu) { n++; suite = k > i && js[k - 1].contenu ? suite + 1 : 1; if (suite > 3) break;
          const apresLien = k > i && (!js[k - 1].contenu || /^(d|l)['’]/i.test(js[k].w)), suivant = js[k + 1] ? js[k + 1].c : "";
          if (apresLien && /^\p{Ll}{3,}(er|ir|oir|re)$/u.test(js[k].c) && /^(le|la|les|l|un|une|des|du|d|ses|son|sa|leur|leurs|ou|et|en|sans|ce|cet|cette|ces)$/.test(suivant)) break;  // « droit d'utiliser la chose » : verbe
          if ((!gen(js[k].c) || k === i) && !(debutGen && n < 2)) out.push({i, k, js: js.slice(i, k + 1)}); }
        else if (LIENS.has(js[k].c) && liens < 2 && k > i && k + 1 < js.length && js[k + 1].contenu) liens++;
        else if (LIENS.has(js[k].c) && liens < 2 && k > i && k + 2 < js.length && /^(de|à|a|en)$/.test(js[k].c) && /^(la|l|les)$/.test(js[k + 1].c) && js[k + 2].contenu) { liens++; k++; }
        else break;
        k++; }
    }
    return out;
  }
  const ARTICLES = /^(le|la|les|l|un|une|des|du|de|d|ses|son|sa|leur|leurs|au|aux|ce|cet|cette|ces|deux|trois|plusieurs)$/;
  const NEGATION = /\b(ne|n['’])\s+\S+\s+(pas|jamais|plus|aucun|aucune|guère)\b|\b(ne|n['’])\s+(pas|jamais|plus)\b|\bn['’]\S+\s+(pas|jamais|plus)\b|\bne\s+\S+\s+\S+\s+(pas|jamais)\b/i;
  const VARIATION = /^(hausses?|baisses?|augmentations?|diminutions?|réductions?|progressions?|chutes?|accroissements?|forte|fort|faible)$/i;
  function nettoyerLabel(l) {
    l = String(l).replace(/\s*\((?:[^()]*\d{3,4}[^()]*)\)\s*$/, "").replace(/^(l['’]|le |la |les |un |une |des |d['’]|du |de |une? )/i, "").trim();
    if (l.length > 3 && l === l.toUpperCase()) l = l.charAt(0) + l.slice(1).toLowerCase();
    return l;
  }
  const cleDe = js => js.filter(x => x.contenu).map(x => x.s).join(" ");
  const labelDe = (texte, js) => texte.slice(js[0].i, js[js.length - 1].j);

  function notions(us, structure) {
    const C = new Map();       // clé (racines) → notion
    const get = (cle, label, origine, u) => { label = nettoyerLabel(label); let c = C.get(cle);
      if (!c) C.set(cle, c = {id: "c" + hid(cle), cle, label, labels: new Map(), origines: new Set(), unites: new Set(), definitions: [], statut: STATUT.INFERE, evidence: 0});
      c.labels.set(label, (c.labels.get(label) || 0) + 1); c.origines.add(origine); if (u) c.unites.add(u.id); return c; };
    // a. Termes définis : notions sûres.
    us.forEach(u => { const d = termeDefini(u); if (!d) return; const js = jetons(d.terme); if (!js.some(x => x.contenu)) return;
      const c = get(cleDe(js), d.terme, "definition", u); c.definitions.push({texte: u.texte, definiens: d.definiens, unite: u.id, page: u.page, statut: u.statut}); c.statut = STATUT.CONFIRME; u.definit = c.id; });
    // b. Termes mis en évidence (gras, souligné…), et titres.
    us.forEach(u => (u.evid || []).forEach(e => { if (e.type === "encadre" || e.type === "capitales" && e.texte.length <= 3) return; const js = jetons(e.texte).filter(x => x.contenu);
      if (js.length && js.length <= 5) { const c = get(cleDe(js), e.texte.trim(), "evidence", u); c.evidence++; } }));
    structure.blocs.filter(b => b.kind === "titre").forEach(b => { const t = b.texte.replace(/^(chapitre|partie|section|leçon|thème|séquence)\s*[\dIVX]*\s*[:.\-–]?\s*|^[\dIVX]+(\.\d+)*\s*[.)\-–]?\s*|^[A-H][.)]\s*/i, "").trim();
      const js = jetons(t).filter(x => x.contenu && !/^\d+$/.test(x.c)); if (js.length && js.length <= 5 && !js.every(x => gen(x.c))) get(js.map(x => x.s).join(" "), t.replace(/^(l['’]|le |la |les |un |une |des )/i, ""), "titre"); });
    // c. Groupes nominaux qui reviennent dans au moins 2 unités (hors exemples).
    const compte = new Map();
    us.forEach(u => { if (u.statut === STATUT.INCERTAIN) return; const js = jetons(u.texte), vus = new Set();
      groupes(js).forEach(g => { const cle = cleDe(g.js); if (vus.has(cle)) return; vus.add(cle);
        let o = compte.get(cle); if (!o) compte.set(cle, o = {n: 0, ex: 0, labels: new Map(), us: new Set()});
        o.n++; if (u.principal === "exemple") o.ex++; o.us.add(u.id); const lb = labelDe(u.texte, g.js); o.labels.set(lb, (o.labels.get(lb) || 0) + 1); }); });
    compte.forEach((o, cle) => { const nw = cle.split(" ").length;
      if (o.n - o.ex >= 2 && (nw > 1 ? o.n >= 2 : o.n >= 3) || C.has(cle)) { const lb = [...o.labels.entries()].sort((a, b) => b[1] - a[1])[0][0];
        if (!C.has(cle) && nw === 1 && /^\p{Ll}+(er|ir|re)$/u.test(norm(lb)) && lb.length > 4) return;   // verbe à l'infinitif
        const c = get(cle, lb.replace(/^(l['’]|le |la |les |un |une |des |d['’]|du |de )/i, ""), "frequence"); o.us.forEach(id => c.unites.add(id)); } });
    // c2. Noms propres (« traité de Versailles », « Triple-Entente ») et sujets / compléments d'une relation explicite.
    const debutGroupe = (js, k) => { while (k < js.length && (VARIATION.test(js[k].c) || ARTICLES.test(js[k].c))) k++; return k; };
    us.forEach(u => { if (u.statut === STATUT.INCERTAIN || u.principal === "exemple") return; const js = jetons(u.texte);
      if (u.principal !== "formule") groupes(js).forEach(g => { const last = g.js[g.js.length - 1];
        if (g.js.some((x, k) => (k > 0 || x.i > 0) && x.contenu && /^\p{Lu}\p{Ll}/u.test(x.w)) && /^\p{Lu}/u.test(last.w) && g.js.length <= 4 && !g.js.some(x => /^\p{Ll}+(er|ir)$/u.test(x.c) && x.c.length > 4)) {
          const lb = labelDe(u.texte, g.js); if (lb.length >= 4 && /\p{Ll}/u.test(lb)) get(cleDe(g.js), lb, "nom-propre", u); } });
      REL.forEach(({r}) => { const m = u.texte.match(r); if (!m) return; const avant = js.filter(x => x.j <= m.index), apres = js.filter(x => x.i >= m.index + m[0].length);
        const sujet = groupes(avant).filter(g => g.js[g.js.length - 1] === avant[avant.length - 1]).sort((a, b) => b.js.length - a.js.length)[0];
        const art = debutGroupe(apres, 0), obj = art < apres.length && art <= 3 && apres[art].contenu ? groupes(apres.slice(art)).filter(g => g.i === 0).sort((a, b) => b.js.length - a.js.length)[0] : null;
        if (NEGATION.test(u.texte.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12))) return;
        // « une condition toujours vraie provoque… » : un mot seul après un adverbe est un adjectif, pas le sujet.
        const adjSeul = g => g && g.js.length === 1 && g.js[0] === avant[avant.length - 1] && avant.length >= 2 && /^(toujours|jamais|tres|plus|moins|souvent|bien|trop|si|assez|parfois)$/.test(avant[avant.length - 2].c);
        [adjSeul(sujet) ? null : sujet, obj].forEach(g => { if (!g) return; while (g.js.length > 1 && VARIATION.test(g.js[0].c)) { g = {js: g.js.slice(1)}; while (g.js.length && !g.js[0].contenu) g.js = g.js.slice(1); } if (!g.js.length) return; const cs = g.js.filter(x => x.contenu); if (!cs.length || cs.length > 4 || cs.every(x => gen(x.c)) || gen(cs[cs.length - 1].c) && cs.length === 1) return;
          const lb = labelDe(u.texte, g.js); if (/^(il|elle|ils|elles|on|cela|ceci)$/i.test(lb)) return; get(cleDe(g.js), lb.replace(/^(l['’]|le |la |les |un |une |des |d['’]|du |de )/i, ""), "relation", u); }); }); });
    // c3. Événements datés (sujet d'une phrase avec une date) et sujet après « Contrairement à X, … ».
    us.forEach(u => { if (u.statut === STATUT.INCERTAIN) return; const js = jetons(u.texte);
      const prendre = (deb, origine) => { const g = groupes(js.slice(deb)).filter(x => x.i === 0).sort((a, b) => b.js.length - a.js.length)[0]; if (!g) return;
        const cs2 = g.js.filter(x => x.contenu); if (!cs2.length || cs2.length > 4 || cs2.every(x => gen(x.c))) return; get(cleDe(g.js), labelDe(u.texte, g.js), origine, u); };
      if (u.principal === "chronologie" || u.secondaires.includes("chronologie")) { const k = js.findIndex(x => x.contenu); if (k >= 0 && k <= 2) prendre(k, "evenement"); }
      const mc = u.texte.match(/^(contrairement (?:à|aux|au)|à la différence d[eu]s?|par opposition (?:à|aux|au))\s+[^,]+,\s*/i);
      if (mc) { const k = js.findIndex(x => x.i >= mc[0].length && x.contenu); if (k >= 0) prendre(k, "comparaison"); const k0 = debutGroupe(js, js.findIndex(x => x.i >= mc[1].length)); if (k0 >= 0 && k0 < js.length) prendre(k0, "comparaison"); }
      // Genre d'une définition : « L'hyperbole est une exagération… » → « exagération » est une notion (la famille).
      if (u.definit || termeDefini(u)) { const mg = u.texte.match(/\s(est|sont)\s+(une|un|des|les|le|la|l['’])(?:\s+|(?<=['’]))/i);
        if (mg) { const k = js.findIndex(x => x.i >= mg.index + mg[0].length); if (k >= 0 && js[k].contenu && !gen(js[k].c)) { const g = groupes(js.slice(k), 2).filter(x => x.i === 0 && (x.js.length === 1 || !x.js[1].contenu || /^(d|l)['’]/i.test(x.js[1].w))).sort((a, b) => b.js.length - a.js.length)[0];   // « mise en relation », pas « côté opposé »
          if (g) get(cleDe(g.js), labelDe(u.texte, g.js), "genre", u); } } } });
    // d. Un groupe plus long absorbe le plus court s'il le contient presque toujours (« droit » dans « droit de propriété »).
    const liste = [...C.values()];
    liste.filter(c => c.cle.includes(" ")).forEach(long => { long.cle.split(" ").forEach((_, a, parts) => {
      for (let b = a + 1; b <= parts.length; b++) { const sous = parts.slice(a, b).join(" "); if (sous === long.cle) continue; const court = C.get(sous); if (!court || court.statut === STATUT.CONFIRME || court.origines.has("evidence")) continue;
        const nCourt = (compte.get(sous) || {n: 0}).n, nLong = (compte.get(long.cle) || {n: 0}).n;
        // Le mot court reste une notion s'il apparaît aussi seul (« la comparaison » à côté de « outil de comparaison »).
        const seul = us.some(u => u.principal !== "exemple" && mentions(u.texte, [long, court]).some(m => m.c === court));
        if (nLong >= 0.7 * nCourt && !seul) { C.delete(sous); } } }); });
    // e. Rattacher chaque notion à toutes les unités qui la mentionnent.
    const res = [...C.values()];
    us.forEach(u => mentions(u.texte, res).forEach(m => m.c.unites.add(u.id)));
    res.forEach(c => { c.label = c.definitions[0] ? c.definitions[0].texte.match(R_TERME_DEF.map(x => x.r).find(r => r.test(c.definitions[0].texte)))?.[1]?.replace(/^(l['’]|le |la |les |un |une |des )/i, "").trim() || c.label : [...c.labels.entries()].sort((a, b) => b[1] - a[1])[0][0];
      c.unites = [...c.unites]; c.origines = [...c.origines]; delete c.labels; if (c.origines.includes("evidence") || c.origines.includes("titre")) c.statut = c.statut === STATUT.CONFIRME ? c.statut : STATUT.CONFIRME; });
    return res.filter(c => c.unites.length);     // une notion jamais reprise dans le texte (titre seul) n'est pas gardée
  }
  // Positions des notions dans une phrase : plus longues d'abord, sans chevauchement.
  const TRI = new WeakMap();
  function mentions(texte, cs) {
    let tri = TRI.get(cs); if (!tri || tri.n !== cs.length) { tri = {n: cs.length, l: [...cs].sort((a, b) => b.cle.split(" ").length - a.cle.split(" ").length).map(c => ({c, k: c.cle.split(" ")}))}; TRI.set(cs, tri); }
    const js = jetons(texte), cont = js.map((x, k) => ({x, k})).filter(o => o.x.contenu), seq = cont.map(o => o.x.s), out = [], pris = new Set();
    // Deux mots d'une notion ne peuvent être séparés que par de, du, des, d', la, l', à, en (jamais par « et », une virgule ou un signe).
    const colle = (a, b) => !cont[b].x.p && js.slice(cont[a].k + 1, cont[b].k).every(t => LIENS.has(t.c) && !t.p);
    const present = new Set(seq);
    tri.l.forEach(({c, k}) => { if (!present.has(k[0])) return;
      for (let a = 0; a + k.length <= seq.length; a++) { if (k.every((s, d) => seq[a + d] === s && (d === 0 || colle(a + d - 1, a + d))) && !k.some((_, d) => pris.has(a + d))) {
        k.forEach((_, d) => pris.add(a + d)); out.push({c, i: cont[a].x.i, j: cont[a + k.length - 1].x.j}); } } });
    return out.sort((a, b) => a.i - b.i);
  }

  /* ---------- 4. Relations ---------- */
  // sens : 1 = gauche → droite ; -1 = droite → gauche. type selon la liste de l'énoncé.
  const REL = [
    {r: U(/\b(augmente(?:nt)?|diminue(?:nt)?|réduit|réduisent|accroît|accroissent|fait (baisser|monter|augmenter|diminuer)|font (baisser|monter|augmenter|diminuer))\b/i), type: "provoque", sens: 1},
    {r: U(/\b(entraîne(?:nt)?|provoque(?:nt)?|cause(?:nt)?|engendre(?:nt)?|(conduit|conduisent) à|(aboutit|aboutissent) à|est à l['’]origine d[eu]s?|sont à l['’]origine d[eu]s?|déclenche(?:nt)?|favorise(?:nt)?)\b/i), type: "provoque", sens: 1},
    {r: U(/\b(résulte(?:nt)? d[eu]s?|découle(?:nt)? d[eu]s?|(est|sont) dus? à|(est|sont) dues? à|(est|sont) causée?s? par|s['’]explique(?:nt)? par|(est|sont) la conséquence d[eu]s?|(est|sont) provoquée?s? par|grâce à|provien(?:nen)?t d[eu]s?|vien(?:nen)?t d[eu]s?|naî(?:t|ssent) d[eu]s?)\b/i), type: "provoque", sens: -1},
    {r: U(/\b(est une conséquence d[eu]s?|est un effet d[eu]s?)\b/i), type: "consequence_de", sens: 1},
    {r: U(/\b(dépend(ent)? d[eu]s?|(est|sont) fonction d[eu]s?|varie(?:nt)? (selon|avec|en fonction d[eu]s?)|repose(?:nt)? sur)\b/i), type: "depend_de", sens: 1},
    {r: U(/\b(explique(?:nt)?|permet(tent)? de comprendre|rend(ent)? compte d[eu]s?)\b/i), type: "explique", sens: 1},
    {r: U(/\b(est|sont) (un|une|des) exemples? d[eu]s?|illustre(?:nt)?\b/i), type: "exemple_de", sens: 1},
    {r: U(/\b(fait|font) partie d[eu]s?|(est|sont) (une|des) parties? d[eu]s?|(est|sont) (un|des) éléments? d[eu]s?|appartien(nen)?t à|(est|sont) inclus dans\b/i), type: "partie_de", sens: 1},
    {r: U(/\b(comprend|comprennent|se compose(?:nt)? d[eu]s?|(est|sont) composée?s? d[eu]s?|contien(nen)?t|regroupe(?:nt)?|réunit|réunissent|se divise(?:nt)? en|se décompose(?:nt)? en|on y trouve)\b/i), type: "partie_de", sens: -1},
    {r: U(/\b(s['’]oppose(?:nt)? (?:à|aux|au)|contrairement (?:à|aux|au)|à la différence d[eu]s?|par opposition (?:à|aux|au)|à l['’]inverse d[eu]s?|alors que|tandis que|(est|sont) le contraire d[eu]s?|≠)\b/i), type: "oppose", sens: 1},
    {r: U(/\b(permet(tent)? de calculer|sert à calculer|servent à calculer|permet(tent)? de mesurer|permet(tent)? d['’]obtenir|permet(tent)? de déterminer)\b/i), type: "calcule", sens: 1},
    {r: U(/\b(nécessite(?:nt)?|exige(?:nt)?|suppose(?:nt)?|(requiert|requièrent)|n['’]est possible que si|ne sont possibles que si|à condition d[eu]s?|ne peut exister sans|a besoin d[eu]s?|ont besoin d[eu]s?)\b/i), type: "condition", sens: -1},
    {r: U(/\b(est|sont) (un|une|des) (types?|sortes?|formes?|catégories?|espèces?|variétés?) d[eu]s?\b/i), type: "categorie", sens: 1},
    {r: U(/\b(précède(?:nt)?|(est|sont) suivie?s? par|avant)\b/i), type: "precede", sens: 1},
    {r: U(/\b(succède(?:nt)? à|suivent|suit|après)\b/i), type: "precede", sens: -1},
    {r: U(/\b(se déroule(?:nt)? dans|a lieu dans|ont lieu dans|se situe(?:nt)? dans|se trouve(?:nt)? dans|(est|sont) située?s? dans|(est|sont) présente?s? dans|(est|sont) localisée?s? dans)\b/i), type: "lieu", sens: 1},
    {r: U(/\b(s['’]applique(?:nt)? à|(est|sont) une application d[eu]s?|(est|sont) des applications d[eu]s?)\b/i), type: "application_de", sens: 1}
  ];
  // Entre deux éléments d'une énumération : « , de la », « et du », « ou des »…
  const SEP_ENUM = /^\s*(,\s*(et|ou)?|et|ou|ainsi que)\s*((de|du|des|d['’]|à|au|aux|en)\s*)?((la|le|les|l['’]|un|une)\s*)?$/i;
  const SYMETRIQUES = new Set(["oppose", "associe"]);
  const NOMS_REL = {provoque: "provoque", consequence_de: "est une conséquence de", depend_de: "dépend de", explique: "explique", exemple_de: "est un exemple de", partie_de: "fait partie de",
    oppose: "s'oppose à", calcule: "permet de calculer", condition: "est une condition de", categorie: "est une sorte de", precede: "vient avant", application_de: "est une application de",
    prerequis: "est un prérequis de", associe: "est lié à", mene_a: "mène à", lieu: "se passe dans"};

  function relations(us, cs) {
    const R = new Map(), add = (de, vers, type, statut, u, preuve, conf) => { if (!de || !vers || de === vers) return;
      let [a, b] = SYMETRIQUES.has(type) && de > vers ? [vers, de] : [de, vers]; const k = a + ">" + type + ">" + b, old = R.get(k);
      if (old) { old.preuves = (old.preuves || 1) + 1; if (rang(statut) > rang(old.statut)) Object.assign(old, {statut, unite: u && u.id, preuve, confiance: conf}); return old; }
      const r = {id: "r" + hid(k), de: a, vers: b, type, statut, unite: u ? u.id : null, page: u ? u.page : null, preuve, confiance: conf, preuves: 1}; R.set(k, r); return r; };
    const rang = s => s === STATUT.CONFIRME ? 2 : s === STATUT.INFERE ? 1 : 0;
    const byId = new Map(cs.map(c => [c.id, c])), memo = new Map(), M = u => { if (!memo.has(u.id)) memo.set(u.id, mentions(u.texte, cs)); return memo.get(u.id); };
    us.forEach(u => {
      const ms = M(u), sur = u.statut !== STATUT.INCERTAIN, st = sur ? STATUT.CONFIRME : STATUT.INCERTAIN;
      // a. Motifs explicites autour d'un déclencheur.
      if (ms.length >= 2) REL.forEach(({r, type, sens}) => { const re = new RegExp(r.source, "gi" + (r.unicode ? "u" : "")); let m;
        while ((m = re.exec(u.texte))) { const g = ms.filter(x => x.j <= m.index && !/[.;]/.test(u.texte.slice(x.j, m.index))), d = ms.filter(x => x.i >= m.index + m[0].length && !/[.;]/.test(u.texte.slice(m.index + m[0].length, x.i)));
          if (!g.length || !d.length) continue;
          const zone = u.texte.slice(Math.max(0, m.index - 14), Math.min(u.texte.length, m.index + m[0].length + 14));
          if (U(NEGATION).test(zone)) continue;                                                     // « ne contient pas » : pas de lien
          if (U(/\b(ce que|ce qui|qui|que|dont|où|lorsqu|quand)\b/i).test(u.texte.slice(m.index + m[0].length, d[0].i))) continue;   // « regroupe ce que… » : pas un nom
          // « Contrairement à A, B … » : le déclencheur est en tête, les deux notions à droite.
          const gauche = g[g.length - 1], droite = d.filter((x, k) => k === 0 || SEP_ENUM.test(u.texte.slice(d[k - 1].j, x.i)));
          if (!droite.length) continue;
          const eff = s => /\b(hausse|augment|accro|monter|progress|forte)/i.test(s) ? "hausse" : U(/\b(baisse|diminu|rédu|chute|faible)/i).test(s) ? "baisse" : null;
          const effD = eff(m[0] + " " + u.texte.slice(m.index + m[0].length, droite[0].i)), effG = eff(u.texte.slice(Math.max(0, gauche.i - 25), gauche.i));
          droite.forEach(x => { const r = sens > 0 ? add(gauche.c.id, x.c.id, type, st, u, u.texte, sur ? 0.9 : 0.4) : add(x.c.id, gauche.c.id, type, st, u, u.texte, sur ? 0.9 : 0.4);
            if (r && type === "provoque") { const [ec, ee] = sens > 0 ? [effG, effD] : [effD, effG]; if (ec) r.effetCause = ec; if (ee) r.effet = ee; } }); } });
      // « Contrairement à A, B … » en début de phrase.
      const mc = u.texte.match(/^(contrairement (?:à|aux|au)|à la différence d[eu]s?|par opposition (?:à|aux|au))\s+([^,]+),/i);
      if (mc) { const a = ms.filter(x => x.j <= mc[0].length), b = ms.filter(x => x.i >= mc[0].length && /^\s*((la|le|les|l['’]|un|une|des)\s*)?$/i.test(u.texte.slice(mc[0].length, x.i)));
        if (a.length && b.length) add(a[0].c.id, b[0].c.id, "oppose", st, u, u.texte, 0.9); }
      // « Pour que A, il faut B » / « Pour A, il faut B ».
      const mp = u.texte.match(U(/^pour (qu['’]il y ait |que |qu['’])?(.+?),\s*il (faut|est nécessaire)\b/i));
      if (mp) { const lim = mp[0].length, a = ms.filter(x => x.j <= lim - 10), b = ms.filter(x => x.i >= lim); if (a.length && b.length) b.forEach(x => add(x.c.id, a[a.length - 1].c.id, "condition", st, u, u.texte, 0.85)); }
      // b. Définition « A est un B … » : A est une sorte de B ; et toute notion dans la définition est un prérequis de A (déduit).
      if (u.definit) { const d = byId.get(u.definit), apres = ms.filter(x => x.c.id !== d.id);
        const mis = u.texte.match(/\s(est|sont)\s+(une|un|des|les|le|la|l['’])(?:\s+|(?<=['’]))/i);
        if (mis) { const tete = apres.find(x => x.i >= mis.index); if (tete && /^\s*$/.test(u.texte.slice(mis.index + mis[0].length, tete.i))) add(d.id, tete.c.id, "categorie", st, u, u.texte, sur ? 0.85 : 0.4); }
        const dansTerme = x => (" " + d.cle + " ").includes(" " + x.c.cle + " ");
        apres.filter(x => !dansTerme(x) && !(mis && x.i >= mis.index && /^\s*$/.test(u.texte.slice(mis.index + mis[0].length, x.i)))).forEach(x => add(x.c.id, d.id, "prerequis", sur ? STATUT.INFERE : STATUT.INCERTAIN, u, u.texte, 0.6)); }
      // c. Flèches dessinées « A → B ».
      if (u.fleches) { const parts = u.fleches.map(p => mentions(p, cs)[0]); for (let k = 0; k + 1 < parts.length; k++) if (parts[k] && parts[k + 1]) add(parts[k].c.id, parts[k + 1].c.id, "mene_a", st, u, u.texte, 0.8); }
      // d. Élément de liste introduit par « A comprend : » / « on distingue : » → partie ou sorte de A.
      if (u.kind === "item" && u.intro) { const intro = us.find(x => x.id === u.intro), mi = intro ? M(intro) : [], mx = ms[0];
        const trig = REL.find(x => x.type === "partie_de" && x.sens < 0 && x.r.test(intro ? intro.texte : "")), mt = trig && intro.texte.match(trig.r);
        const tete = mt ? (mi.filter(x => x.j <= mt.index).pop() || mi[mi.length - 1]) : mi[mi.length - 1];
        if (mi.length && mx && tete.c.id !== mx.c.id) { const type = /distingue|types?|sortes?|catégories?|formes?/i.test(intro.texte) ? "categorie" : /étapes?|d['’]abord/i.test(intro.texte) ? "partie_de" : "partie_de";
          add(mx.c.id, tete.c.id, type, STATUT.INFERE, u, intro.texte + " … " + u.texte, 0.7); } }
      // e. Exemple : une unité exemple qui cite une notion l'illustre.
      if (u.principal === "exemple" && ms.length) { const cible = ms.find(x => x.c.statut === STATUT.CONFIRME) || ms[0]; (cible.c.exemples = cible.c.exemples || []).push({texte: u.texte, unite: u.id, page: u.page}); }
    });
    // f. Étapes ordonnées d'une liste numérotée : chaque étape vient avant la suivante.
    const parBloc = new Map(); us.filter(u => u.kind === "item" && u.ordonnee).forEach(u => { if (!parBloc.has(u.bloc)) parBloc.set(u.bloc, []); parBloc.get(u.bloc).push(u); });
    parBloc.forEach(items => { for (let k = 0; k + 1 < items.length; k++) { const a = M(items[k])[0], b = M(items[k + 1])[0]; if (a && b) add(a.c.id, b.c.id, "precede", STATUT.INFERE, items[k], items[k].texte + " → " + items[k + 1].texte, 0.6); } });
    // g. Formules. Légende « où P est la puissance, U la tension et I l'intensité » : chaque symbole devient une notion.
    const symboles = new Map();
    us.forEach((u, k) => { if (!/^(où|avec)\s/i.test(u.texte) || !us[k - 1] || us[k - 1].principal !== "formule" && !(us[k - 2] && us[k - 2].principal === "formule")) return;
      u.texte.replace(/^(où|avec)\s+/i, "").replace(/\.$/, "").split(/\s*(?:,|;|\set\s)\s*/).forEach(part => {
        const m = part.match(/^([\p{L}Δ][\p{L}\d_']{0,3})\s+(?:est|désigne|représente|correspond à|:|=)?\s*(.+)$/u); if (!m) return;
        const c = mentions(m[2], cs)[0]; if (c) { symboles.set(m[1], c.c); c.c.symbole = c.c.symbole || m[1]; } }); });
    us.filter(u => u.principal === "formule").forEach(u => { const f = u.texte.match(/^\s*([\p{L}Δ][\p{L}\d_']{0,3})\s*=\s*(.+)$/u);
      if (f && symboles.has(f[1])) { const vars = (f[2].match(/[\p{L}Δ][\p{L}\d_']{0,3}/gu) || []).filter(v => symboles.has(v)); vars.forEach(v => add(symboles.get(v).id, symboles.get(f[1]).id, "calcule", STATUT.CONFIRME, u, u.texte, 0.9)); } });
    us.filter(u => u.principal === "formule").forEach(u => { const m = u.texte.match(/([\p{L}][\p{L}\d_]*(?:\s[\p{L}][\p{L}\d_']*){0,3})\s*=\s*(.+)$/u); if (!m) return;
      const gauche = mentions(m[1], cs)[0], droite = mentions(m[2], cs); if (gauche) droite.forEach(x => add(x.c.id, gauche.c.id, "calcule", STATUT.CONFIRME, u, u.texte, 0.85)); });
    // h. Chronologie : deux notions de phrases datées → l'ordre des dates.
    const datees = us.map(u => ({u, an: (u.texte.match(U(/\b(1[0-9]{3}|20[0-2][0-9])\b/)) || [])[1]})).filter(x => x.an).map(x => ({an: Number(x.an), u: x.u, c: M(x.u)[0]})).filter(x => x.c).sort((a, b) => a.an - b.an);
    for (let k = 0; k + 1 < datees.length; k++) if (datees[k].an < datees[k + 1].an && datees[k].c.c.id !== datees[k + 1].c.c.id) add(datees[k].c.c.id, datees[k + 1].c.c.id, "precede", STATUT.INFERE, datees[k + 1].u, datees[k].an + " puis " + datees[k + 1].an, 0.65);
    // i. Cooccurrence répétée (≥ 2 phrases) sans autre lien : relation faible « est lié à ».
    const co = new Map();
    us.forEach(u => { if (u.principal === "exemple") return; const ids = [...new Set(M(u).map(m => m.c.id))].sort();
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) { const k = ids[a] + "|" + ids[b]; co.set(k, (co.get(k) || []).concat(u)); } });
    const lies = new Set([...R.values()].map(r => [r.de, r.vers].sort().join("|")));
    co.forEach((list, k) => { if (list.length >= 2 && !lies.has(k)) { const [a, b] = k.split("|"); add(a, b, "associe", STATUT.INFERE, list[0], list.map(x => x.texte).join(" / "), Math.min(0.6, 0.25 + 0.1 * list.length)); } });
    // Un prérequis déduit qui double une relation « est une sorte de » entre les mêmes notions est retiré.
    const cat = new Set([...R.values()].filter(r => r.type === "categorie").map(r => r.vers + ">" + r.de));
    return [...R.values()].filter(r => !(r.type === "prerequis" && cat.has(r.de + ">" + r.vers)));
  }

  /* ---------- 5. Contrôles de cohérence ---------- */
  function controles(us, cs, rs) {
    const out = [], douteuses = us.filter(u => u.statut === STATUT.INCERTAIN);
    if (douteuses.length) out.push({type: "lecture", statut: STATUT.INCERTAIN, unites: douteuses.map(u => u.id), message: `${douteuses.length} phrase${douteuses.length > 1 ? "s" : ""} mal lue${douteuses.length > 1 ? "s" : ""} : vérifie-les. Notéa ne pose pas de question dessus.`});
    cs.forEach(c => { if (c.definitions.length >= 2) { const [a, b] = c.definitions, sa = new Set(words(a.definiens).filter(isContent).map(stem)), sb = new Set(words(b.definiens).filter(isContent).map(stem));
      let n = 0; sa.forEach(x => { if (sb.has(x)) n++; }); const sim = n / Math.max(1, Math.min(sa.size, sb.size));
      if (sim < 0.3) out.push({type: "contradiction", statut: STATUT.INCERTAIN, notion: c.id, message: `« ${c.label} » a deux définitions différentes (page ${a.page} et page ${b.page}). Vérifie laquelle est juste.`, unites: [a.unite, b.unite]}); } });
    // Une même relation et son inverse direct (« A provoque B » et « B provoque A ») : à vérifier.
    const k = new Set(rs.filter(r => r.statut === STATUT.CONFIRME).map(r => r.de + ">" + r.type + ">" + r.vers));
    rs.forEach(r => { if (["provoque", "categorie", "partie_de"].includes(r.type) && r.statut === STATUT.CONFIRME && r.de < r.vers && k.has(r.vers + ">" + r.type + ">" + r.de))
      out.push({type: "circulaire", statut: STATUT.INCERTAIN, message: `Le cours dit que les deux notions ${NOMS_REL[r.type]} l'une l'autre. Vérifie le sens.`, relations: [r.id]}); });
    // Notion importante citée plusieurs fois mais jamais définie ni expliquée.
    cs.filter(c => !c.definitions.length && c.unites.length >= 3 && !rs.some(r => (r.de === c.id || r.vers === c.id) && r.type !== "associe"))
      .forEach(c => out.push({type: "sans-explication", statut: STATUT.INFERE, notion: c.id, message: `« ${c.label} » revient souvent, mais le cours ne la définit pas.`}));
    return out;
  }

  function comprendre(structure) {
    const us = unites(structure), cs = notions(us, structure), rs = relations(us, cs), al = controles(us, cs, rs);
    return {unites: us, notions: cs, relations: rs, alertes: al};
  }

  Object.assign(NM, {comprendre, unites, typer, notions, mentions, relations, controles, termeDefini, jetons, NOMS_TYPES, NOMS_REL, TYPES_MOTIFS: T});
})(typeof window !== "undefined" ? window : globalThis);
