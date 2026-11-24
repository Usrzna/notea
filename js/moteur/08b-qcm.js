/* Notéa — moteur 8 bis : des QCM qui vérifient la compréhension (pas la reconnaissance d'une phrase).
   Principe : chaque mauvaise réponse est une ERREUR PLAUSIBLE, tirée du cours, avec son explication.
   On ne peut pas trouver la bonne réponse sans comprendre : toutes les options ont la même forme et une longueur proche.

   1. « Laquelle est juste ? » sur une notion : la vraie définition contre celles des notions VOISINES
      (même famille, même partie du cours, ou faciles à confondre), écrites avec le même sujet.
      Ex. « Le fructus est le droit d'utiliser la chose. » (faux : c'est l'usus).
   2. Cause et effet : la vraie phrase contre la même phrase avec l'effet inversé (hausse ↔ baisse),
      le sens inversé (l'effet devient la cause) ou l'effet d'une autre cause du cours.
   3. Date : la vraie phrase contre la même phrase avec une autre date du cours.
   4. Application : un exemple du cours, la notion cachée, à choisir parmi les notions voisines.
   5. Ordre : « Qu'est-ce qui vient en premier ? » sur une chaîne d'au moins 3 étapes.
   6. Intrus : « Lequel ne fait pas partie de X ? » sur un groupe d'au moins 3 éléments.
   Pas assez de voisins plausibles → pas de QCM (mieux vaut aucune question qu'une question qui ne sert à rien). */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {STATUT, norm, hid, round, melanger} = NM;

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // Phrase propre : élision juste (« l'diminution » → « la diminution », « la augmentation » → « l'augmentation »), un seul point final.
  const fin = s => s.trim().replace(/\s+/g, " ").replace(/[.;:!]+$/, "").replace(/(^|[\s(])([lL])['’](?=[bcdfgjkmnpqrstvwxzç])/g, (m, p, l) => p + l + "a ")
    .replace(/(^|[\s(])([lL])(a|e) (?=[aeiouyàâéèêîôûh])/g, (m, p, l) => p + l + "'") + ".";
  const echapRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Indice de longueur : une option bien plus longue (ou courte) que les autres trahit la réponse.
  function sansIndiceLongueur(bonne, pieges, k) {
    const L = bonne.length, ok = pieges.filter(p => p.texte.length >= L * 0.55 && p.texte.length <= L * 1.8);
    return ok.slice(0, k);
  }
  // Genre d'une notion, lu dans le cours (« la photosynthèse », « le fructus », « une guerre »).
  function genre(comp, label) {
    const re = new RegExp("(?:^|[\\s'’(])(le|la|un|une|du|au|ce|cette)\\s+" + echapRe(label) + "(?![\\p{L}])", "iu");
    for (const u of comp.unites) { const m = u.texte.match(re); if (m) return /^(la|une|cette)$/i.test(m[1]) ? "f" : "m"; }
    return null;
  }
  const debutVoyelle = s => /^[aeiouyhàâéèêëîïôûœæ]/i.test(norm(s).charAt(0)) || /^[aeiouyàâéèêëîïôûh]/i.test(s);
  const article = (g, label, maj) => { const a = debutVoyelle(label) ? "l'" : g === "f" ? "la " : "le "; return (maj ? cap(a) : a) + label; };

  function qcm(g, comp, ped) {
    const uById = new Map(comp.unites.map(u => [u.id, u])), cById = new Map(comp.notions.map(c => [c.id, c]));
    const sur = u => u && u.statut !== STATUT.INCERTAIN, nom = id => g.byId.get(id).nom, imp = id => (g.byId.get(id).importance || 0) / 100, dif = id => g.byId.get(id).difficulte || 0;
    const src = u => u ? {unite: u.id, page: u.page, doc: u.doc, texte: u.texte} : null, out = [];
    const objectif = (id, b) => { const o = ((ped && ped.parNotion[id]) || {}).objectifs || []; return (o.find(x => x.bloom === b) || o[0] || {}).texte || null; };
    const Q = (type, bloom, notions, o) => {
      const choix = melanger([o.reponseAttendue, ...o.pieges.map(p => p.texte)], type + notions.join() + o.enonce);
      out.push(Object.assign({id: "q" + hid(type + notions.join() + o.enonce), type, bloom, niveau: NM.BLOOM[bloom], notions, objectif: objectif(notions[0], bloom),
        difficulte: Math.round(notions.reduce((s, id) => s + dif(id), 0) / notions.length * 0.6 + bloom * 7), statut: STATUT.CONFIRME, criteres: [], choix,
        erreursADetecter: o.pieges.map(p => p.pourquoi), pertinence: round((notions.reduce((s, id) => s + imp(id), 0) / notions.length) * (o.poids || 1))}, o)); };

    // Voisins d'une notion : ce avec quoi un élève peut vraiment la confondre.
    const famille = new Map(); g.aretes.filter(a => (a.type === "categorie" || a.type === "partie_de") && a.statut !== STATUT.INCERTAIN).forEach(a => { if (!famille.has(a.vers)) famille.set(a.vers, new Set()); famille.get(a.vers).add(a.de); });
    function voisins(id) {
      const n = g.byId.get(id), v = new Map();
      (n.confusions || []).forEach(c => v.set(c.avec, 3));
      famille.forEach(s => { if (s.has(id)) s.forEach(x => { if (x !== id) v.set(x, Math.max(v.get(x) || 0, 3)); }); });
      g.aretes.filter(a => a.type === "oppose" && (a.de === id || a.vers === id)).forEach(a => { const x = a.de === id ? a.vers : a.de; v.set(x, Math.max(v.get(x) || 0, 3)); });
      g.noeuds.filter(m => m.id !== id && m.sections.some(s => n.sections.includes(s))).forEach(m => v.set(m.id, Math.max(v.get(m.id) || 0, 1)));
      return [...v.entries()].sort((a, b) => b[1] - a[1] || (g.byId.get(b[0]).importance || 0) - (g.byId.get(a[0]).importance || 0)).map(x => x[0]);
    }

    /* 1. Laquelle est juste ? (définitions écrites « Sujet est … »). */
    const defs = new Map();
    comp.notions.forEach(c => { const d = c.definitions.find(x => sur(uById.get(x.unite))); if (!d) return; const u = uById.get(d.unite), t = u.texte.trim();
      const m = t.match(new RegExp("^(.{0,12}?" + echapRe(c.label) + ")\\s+(est|sont|désigne|désignent|correspond à|consiste à|consiste en)\\s+(.+)$", "iu"));
      if (m) defs.set(c.id, {sujet: m[1], verbe: m[2], reste: m[3], u, d}); });
    defs.forEach((D, id) => {
      const groupe = v => /^(sont|désignent)$/i.test(v) ? "pluriel" : /^consiste/i.test(v) ? "action" : "nom";
      const pieges = voisins(id).filter(x => defs.has(x) && groupe(defs.get(x).verbe) === groupe(D.verbe) && (groupe(D.verbe) !== "action" || defs.get(x).verbe === D.verbe) && norm(defs.get(x).reste) !== norm(D.reste))
        .map(x => ({texte: fin(D.sujet + " " + D.verbe + " " + defs.get(x).reste), notion: x, pourquoi: `Faux : c'est la définition de « ${nom(x)} », pas de « ${nom(id)} ».`}));
      const p = sansIndiceLongueur(D.u.texte, pieges, 3); if (p.length < 2) return;
      Q("qcm-juste", 2, [id], {enonce: `« ${nom(id)} » : laquelle de ces phrases est juste ?`, reponseAttendue: fin(D.u.texte), corrige: D.u.texte, pieges: p, source: src(D.u), poids: 1.1}); });

    /* 2. Cause et effet. On garde les mots du cours et on fabrique les erreurs typiques. */
    const INV = [["hausse", "baisse"], ["augmentation", "diminution"], ["augmente", "diminue"], ["accroissement", "réduction"], ["favorise", "freine"], ["forte", "faible"], ["plus", "moins"]];
    // Toutes les versions où UN SEUL mot de variation est inversé (« forte → faible », ou « augmentation → diminution »). Jamais deux : ce serait vrai.
    const inversions = t => { const out = []; INV.forEach(([a, b]) => { const r = new RegExp("(^|[^\\p{L}])(" + a + "|" + b + ")(s?)(?![\\p{L}])", "giu"); let m;
      while ((m = r.exec(t))) { const w = m[2], deb = m.index + m[1].length, rem = (norm(w) === norm(a) ? b : a); out.push(fin(t.slice(0, deb) + (w[0] === w[0].toUpperCase() ? cap(rem) : rem) + m[3] + t.slice(deb + w.length + m[3].length))); } }); return out; };
    // Ce qui varie dans le cours (« hausse des prix », « baisse du crédit ») : seuls candidats crédibles pour un mauvais effet.
    const variables = new Set(); comp.unites.forEach(u => NM.mentions(u.texte, comp.notions).forEach(m => { if (/(hausse|baisse|augmentation|diminution|réduction|accroissement)\s+(du|de la|de l['’]|des|de)\s*$/i.test(u.texte.slice(Math.max(0, m.i - 30), m.i))) variables.add(m.c.id); }));
    const enAval = id => { const vu = new Set([id]); let f = [id]; while (f.length) { const nx = []; f.forEach(x => g.aretes.filter(a => a.de === x && ["provoque", "mene_a", "lieu", "partie_de"].includes(a.type)).forEach(a => { if (!vu.has(a.vers)) { vu.add(a.vers); nx.push(a.vers); } })); f = nx; } return vu; };
    const causales = g.aretes.filter(a => a.type === "provoque" && a.statut === STATUT.CONFIRME && sur(uById.get(a.unite)));
    causales.forEach(a => {
      const u = uById.get(a.unite), t = fin(u.texte), A = nom(a.de), B = nom(a.vers), pieges = [];
      inversions(t).filter(x => norm(x) !== norm(t)).slice(0, 2).forEach(x => pieges.push({texte: x, pourquoi: "Faux : le cours dit l'inverse. Relis le sens de la variation (hausse ou baisse, fort ou faible)."}));
      // L'effet porté sur une AUTRE notion du cours, avec le bon article (« du crédit » → « de la demande »).
      const ib = t.toLowerCase().lastIndexOf(B.toLowerCase()), avant = t.slice(0, ib), mdet = avant.match(/(du|de la|de l['’]|des|le|la|l['’]|les)\s*$/i);
      const ia = t.toLowerCase().indexOf(A.toLowerCase());
      if (mdet && ib >= 0 && ia >= 0 && ib > ia) {
        const aval = enAval(a.de), effetsAilleurs = new Set(causales.filter(x => x.de !== a.de).map(x => x.vers));
        const autres = g.noeuds.filter(n => !aval.has(n.id) && n.id !== a.de && (variables.has(n.id) || effetsAilleurs.has(n.id)) && n.nom.split(/\s+/).length <= 4 && genre(comp, n.nom) && !t.toLowerCase().includes(n.nom.toLowerCase()))
          .sort((x, y) => (variables.has(y.id) - variables.has(x.id)) || (y.importance - x.importance)).slice(0, 2);
        autres.forEach(n => { const G = genre(comp, n.nom), v = debutVoyelle(n.nom), d = /^d/i.test(mdet[1]) ? (v ? "de l'" : G === "f" ? "de la " : "du ") : (v ? "l'" : G === "f" ? "la " : "le ");
          pieges.push({texte: fin(avant.slice(0, avant.length - mdet[0].length) + d + n.nom + t.slice(ib + B.length).replace(/\.$/, "")),
            pourquoi: `Faux : d'après le cours, « ${A} » agit sur « ${B} », pas sur « ${n.nom} ».`}); });
      }
      const vus = new Set([norm(t)]), uniques = pieges.filter(x => { x.texte = cap(x.texte); const k = norm(x.texte); if (vus.has(k)) return false; vus.add(k); return true; });
      const p = sansIndiceLongueur(t, uniques, 3); if (p.length < 2) return;
      Q("qcm-cause", 4, [a.de, a.vers], {enonce: `Que dit le cours sur l'effet de « ${A} » ?`, reponseAttendue: t, corrige: u.texte, pieges: p, source: src(u), poids: 1.2}); });

    /* 3. Dates. */
    const ans = [...new Set(comp.unites.flatMap(u => u.texte.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/g) || []))];
    comp.unites.filter(u => sur(u) && /\b(1[0-9]{3}|20[0-2][0-9])\b/.test(u.texte) && u.texte.split(/\s+/).length >= 5).forEach(u => {
      const an = u.texte.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/)[1], ms = NM.mentions(u.texte, comp.notions); if (!ms.length) return;
      const autres = ans.filter(x => x !== an).sort((x, y) => Math.abs(x - an) - Math.abs(y - an)).slice(0, 3);
      // Compléter avec des années voisines. On avance dans les décalages (+1, -1, +2, -2, +3…) : avant, le même décalage était réessayé sans fin quand l'année existait déjà (cours avec 2020 et 2022 → le navigateur plantait).
      for (let k = 1; autres.length < 3 && k <= 20; k++) for (const d of [k, -k]) { const v = String(Number(an) + d); if (autres.length < 3 && !autres.includes(v) && v !== an) autres.push(v); }
      const pieges = autres.map(x => ({texte: fin(u.texte.replace(an, x)), pourquoi: `Faux : le cours dit ${an}, pas ${x}.`}));
      Q("qcm-date", 1, [ms[0].c.id], {enonce: `Quelle phrase donne la bonne date ?`, reponseAttendue: fin(u.texte), corrige: u.texte, pieges: pieges.slice(0, 3), source: src(u), poids: 0.8}); });

    /* 4. Application : un exemple, la notion cachée, parmi ses voisines. */
    const proches = id => { const n = g.byId.get(id), v = new Set((n.confusions || []).map(c => c.avec)); famille.forEach(s => { if (s.has(id)) s.forEach(x => x !== id && v.add(x)); }); return [...v]; };
    g.noeuds.forEach(n => (n.exemples || []).forEach(ex => { const u = uById.get(ex.unite); if (!sur(u) || !n.definition) return;
      const re = new RegExp(echapRe(n.nom).replace(/e?s?$/, "\\p{L}*"), "giu"); if (!re.test(ex.texte)) return;
      const cache = ex.texte.replace(re, "……").replace(/^(par exemple|exemple|ex)\s*[:,.]?\s*/i, "");
      const v = proches(n.id).filter(x => g.byId.get(x).definition && g.byId.get(x).nom.split(/\s+/).length <= 4).slice(0, 3);
      if (v.length < 2) return;
      Q("qcm-situation", 3, [n.id], {enonce: `Dans cette situation, quel est le mot qui manque ? « ${cap(cache)} »`, reponseAttendue: n.nom, corrige: ex.texte,
        pieges: v.map(x => ({texte: nom(x), notion: x, pourquoi: `Non. ${g.byId.get(x).definition}`})), source: src(u), poids: 1.2}); }));

    /* 5. Ordre (dates ou étapes). */
    const prec = g.aretes.filter(a => a.type === "precede" && a.statut !== STATUT.INCERTAIN), suiv = new Map(prec.map(a => [a.de, a])), entrees = new Set(prec.map(a => a.vers));
    prec.filter(a => !entrees.has(a.de)).forEach(a0 => { const ch = [a0.de]; let a = a0, n = 0; while (a && n++ < 8) { ch.push(a.vers); a = suiv.get(a.vers); }
      if (ch.length < 3) return; const u = uById.get(a0.unite);
      Q("qcm-ordre", 2, ch, {enonce: `Dans ce cours, qu'est-ce qui vient en premier ?`, reponseAttendue: cap(nom(ch[0])), corrige: ch.map(nom).join(" → "),
        pieges: ch.slice(1, 4).map((id, i) => ({texte: cap(nom(id)), pourquoi: `Non : « ${nom(id)} » vient en ${i + 2}e (ordre : ${ch.map(nom).join(" → ")}).`})), source: src(u), poids: 0.9}); });

    /* 6. Intrus. */
    const sortes = new Map(); g.aretes.filter(a => a.type === "categorie" && a.statut === STATUT.CONFIRME).forEach(a => { if (!sortes.has(a.vers)) sortes.set(a.vers, new Set()); sortes.get(a.vers).add(a.de); });
    sortes.forEach((membres, parent) => { const P = norm(nom(parent)), m = [...membres].filter(x => ![...membres].some(y => y !== x && norm(nom(y)).startsWith(norm(nom(x)) + " "))); if (m.length < 3) return;
      const lie = id => g.aretes.some(a => (a.de === id && a.vers === parent) || (a.vers === id && a.de === parent));
      const dehors = g.noeuds.filter(n => n.id !== parent && !membres.has(n.id) && !lie(n.id) && n.definition && !norm(n.definition).includes(P) && n.nom.split(/\s+/).length <= 4).sort((a, b) => (b.importance || 0) - (a.importance || 0))[0];
      if (!dehors) return; const a = g.aretes.find(x => x.type === "categorie" && x.vers === parent && membres.has(x.de)), u = uById.get(a.unite);
      const sorte = a.type === "categorie" ? "n'est pas une sorte de" : "ne fait pas partie de";
      Q("qcm-intrus", 4, [parent, ...m.slice(0, 3)], {enonce: `Lequel ${sorte} « ${nom(parent)} » ?`, reponseAttendue: cap(dehors.nom), corrige: m.map(x => "« " + nom(x) + " »").join(", ") + (a.type === "categorie" ? " sont des sortes de « " : " font partie de « ") + nom(parent) + " ».",
        pieges: m.slice(0, 3).map(x => ({texte: cap(nom(x)), notion: x, pourquoi: `Si : le cours dit que « ${nom(x)} » ${NM.NOMS_REL[a.type]} « ${nom(parent)} ».`})), source: src(u), poids: 1}); });

    return out;
  }

  Object.assign(NM, {qcm});
})(typeof window !== "undefined" ? window : globalThis);
