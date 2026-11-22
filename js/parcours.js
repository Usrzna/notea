/* Notéa — le parcours d'apprentissage (v2.0).
   Fonctions pures, sans page web : on peut les tester avec Node (tests/parcours.test.js).
   1. notionsDepuisAnalyse : l'analyse du moteur devient des notions prêtes à apprendre (source, pertinence, difficulté, prérequis, ordre).
   2. Le suivi d'une notion en 5 dimensions séparées : pertinence, compréhension, mémorisation, application, autonomie.
      Chaque réponse fait bouger la dimension qu'elle mesure (moyenne qui suit les derniers résultats, pas un simple compteur).
   3. Le diagnostic : quoi travailler (comprendre, mémoriser, appliquer, sans aide), les prérequis qui bloquent,
      les erreurs qui reviennent, les notions « acquises mais fragiles ».
   4. Le tableau du jour : à apprendre, à réviser, ce qui pose problème, la progression réelle. */
(function (root) {
  "use strict";
  const JOUR = 864e5, FACTOR = 19 / 81, DECAY = -0.5;
  const retrAt = (S, j) => Math.pow(1 + FACTOR * j / Math.max(S || 0.01, 0.01), DECAY);

  /* ---------- 1. De l'analyse du cours aux notions ---------- */
  const TYPE = {definition: "def", regle: "regle", loi: "regle", propriete: "regle", theoreme: "regle", formule: "form", date: "date", evenement: "date", methode: "concept", mecanisme: "concept"};
  function pertDepuisImportance(sc) { return sc == null ? 2 : sc >= 55 ? 3 : sc >= 25 ? 2 : 1; }
  /* a : résultat de NoteaMoteur.analyserCours. Renvoie des notions « brutes » : l'appli leur ajoute id, mat, dates. */
  function notionsDepuisAnalyse(a, opts = {}) {
    const g = a && a.graphe; if (!g || !g.noeuds) return [];
    const rang = new Map((a.ordre && a.ordre.ordre || []).map((id, i) => [id, i]));
    const max = opts.max || 80;
    const top = Math.max(1, ...g.noeuds.map(n => n.importance || 0));
    const rel = n => (n.importance || 0) / top;          // l'importance compte par rapport aux autres notions du même cours
    const sp = s => String(s || "").trim().replace(/\s+/g, " "), low = s => sp(s).toLowerCase();
    // une définition n'est gardée que si elle parle bien de ce mot dès le début (« L'inflation est… » n'est pas la définition de « prix »)
    const defDe = n => { const d = sp(n.definition); if (!d) return ""; const i = low(d).indexOf(low(n.nom)); return i >= 0 && i <= 25 ? d : ""; };
    const garde = g.noeuds.filter(n => n.nom && n.nom.length >= 3 && (n.definition || (n.sources && n.sources[0])) && (defDe(n) || rel(n) >= 0.25));
    garde.sort((x, y) => (y.importance || 0) - (x.importance || 0));
    // la même définition pour deux mots (« droit » et « droit de propriété ») : on garde le mot le plus précis
    const vu = new Map(); garde.forEach(n => { const d = low(defDe(n)); if (!d) return; const o = vu.get(d); if (!o || n.nom.length > o.nom.length) vu.set(d, n); });
    const choisis = garde.filter(n => { const d = low(defDe(n)); return !d || vu.get(d) === n; }).slice(0, max), ids = new Set(choisis.map(n => n.id));
    return choisis.map(n => {
      const src = (n.sources || [])[0] || {}, def = defDe(n);
      // pas de définition écrite dans le cours : on garde une phrase du cours telle quelle (le mot y sera caché), on n'invente rien
      const phrase = def ? "" : sp((n.sources || []).map(s => s.texte).find(x => x && low(x).includes(low(n.nom))) || "");
      return {
        cle: n.id, term: n.nom, def: def.length > 400 ? def.slice(0, 397) + "…" : def, phrase: phrase.slice(0, 400),
        kind: n.symbole ? "form" : def ? (TYPE[n.type] || "def") : "info",
        pert: n.importance == null ? 2 : rel(n) >= 0.6 ? 3 : rel(n) >= 0.3 ? 2 : 1, D: Math.round((3 + (n.difficulte || 30) / 100 * 5) * 10) / 10,
        pre: (n.prerequis || []).filter(id => ids.has(id)), chap: (n.chemin || []).filter(Boolean).slice(-1)[0] || "",
        rang: rang.has(n.id) ? rang.get(n.id) : 999, ex: (n.exemples || [])[0] ? String(n.exemples[0].texte || n.exemples[0]).slice(0, 300) : "",
        source: {page: src.page || null, texte: String(src.texte || "").slice(0, 300), unite: src.unite || null},
        sur: n.statut !== "incertain"                       // false : passage douteux (photo mal lue…) → on le signale
      };
    }).filter(x => x.def || x.phrase.split(" ").length >= 5).sort((x, y) => x.rang - y.rang);
  }

  /* ---------- 2. Les 5 dimensions ---------- */
  const DIMS = ["comp", "mem", "app", "auto"];
  const NOM = {pert: "Pertinence", comp: "Compréhension", mem: "Mémorisation", app: "Application", auto: "Autonomie"};
  const AIDE = {pert: "L'importance de la notion pour l'examen", comp: "Expliquer et comprendre la notion", mem: "Retrouver l'information sans aide, dans le temps",
    app: "Utiliser la notion dans un exercice", auto: "Réussir sans indice ni correction"};
  /* Quel genre de question mesure quoi. */
  const MESURE = {
    def: ["mem"], term: ["mem"], trou: ["mem"], carte: ["mem"], date: ["mem"], pairs: ["mem"], rappel: ["mem"],
    ex: ["comp", "app"], affirm: ["comp"], ia: ["comp"], explique: ["comp"], ouverte: ["comp"],
    exo: ["app"], moteur: ["comp"], situation: ["app"], calcul: ["app"], probleme: ["app"], examen: ["app", "auto"]
  };
  function dimsDe(type) { return MESURE[type] || ["mem"]; }
  /* r : 1 = juste, 0.6 = juste avec effort (hésitation), 0 = faux (oubli ou erreur). aide : l'élève a eu un indice ou la correction avant. */
  function enregistrer(n, type, r, o = {}) {
    n.dims = n.dims || {}; const now = o.now || Date.now();
    const maj = d => { const x = n.dims[d] || {s: 0, n: 0}; const a = Math.max(0.3, 1 / (x.n + 1)); x.s = Math.round((x.s + a * (r - x.s)) * 1000) / 1000; x.n++; x.last = now; n.dims[d] = x; };
    dimsDe(type).forEach(maj);
    if (!o.aide) maj("auto"); else { const x = n.dims.auto || {s: 0, n: 0}; x.s = Math.round(x.s * 0.85 * 1000) / 1000; x.n++; x.last = now; n.dims.auto = x; }
    if (r === 0 && o.choix) { n.confus = n.confus || {}; n.confus[o.choix] = (n.confus[o.choix] || 0) + 1; }   // pour repérer les confusions qui reviennent
    if (r === 0) { n.errs = (n.errs || 0) + 1; n.errLast = now; }
    return n;
  }
  /* La mémorisation tient compte de l'oubli dans le temps (FSRS) : une notion réussie il y a longtemps baisse. */
  function score(n, d, now = Date.now()) {
    if (d === "pert") return null;
    const x = n.dims && n.dims[d];
    if (d === "mem") {
      // « mémorisé » = je m'en souviendrai encore dans 3 semaines (FSRS), pas seulement aujourd'hui
      const R = n.last ? retrAt(n.S, (now - n.last) / JOUR + 21) : null;
      if (!x || !x.n) return R == null ? null : Math.round(R * 100) / 100;
      return Math.round((R == null ? x.s : 0.4 * x.s + 0.6 * R) * 100) / 100;
    }
    if (d === "comp" && (!x || !x.n) && n.cp && n.cp.n) return Math.round(n.cp.ok / n.cp.n * 100) / 100;   // les anciennes mesures (v1.15)
    return x && x.n ? x.s : null;
  }
  function niveau(v, nb) { if (v == null) return {k: "test", l: "Pas encore testée"}; if (v >= 0.8 && (nb == null || nb >= 2)) return {k: "ok", l: "Acquise"}; return v >= 0.5 ? {k: "cours", l: "En cours"} : {k: "revoir", l: "À revoir"}; }
  function profil(n, now = Date.now()) {
    const out = {};
    DIMS.forEach(d => { const v = score(n, d, now), nb = d === "mem" ? (n.reps || 0) : (n.dims && n.dims[d] && n.dims[d].n) || (d === "comp" && n.cp ? n.cp.n : 0); out[d] = Object.assign({v, nb}, niveau(v, nb)); });
    return out;
  }
  /* La maîtrise d'une notion : seulement les dimensions mesurées comptent, et une notion jamais vue vaut 0. */
  function maitrise(n, now = Date.now()) {
    if (!n.last && !n.dims) return 0;
    const w = {mem: 0.35, comp: 0.25, app: 0.2, auto: 0.2}; let s = 0, t = 0;
    DIMS.forEach(d => { const v = score(n, d, now); if (v != null) { s += w[d] * v; t += w[d]; } else { s += w[d] / 2 * 0.4; t += w[d] / 2; } });
    const m = t ? s / t : 0;
    return Math.round(((n.reps || 0) < 2 ? Math.min(m, 0.5) : m) * 100) / 100;   // vue une seule fois : à mi-chemin au mieux, pas « acquise »
  }

  /* ---------- 3. Le diagnostic ---------- */
  function besoin(n, now = Date.now()) {
    const p = profil(n, now), v = d => p[d].v;
    if (!n.last && !(n.dims && Object.keys(n.dims).length)) return {k: "decouvrir", l: "À découvrir", formats: ["def", "ex", "carte"]};
    if (v("comp") != null && v("comp") < 0.5) return {k: "comprendre", l: "À comprendre", formats: ["ex", "affirm", "ia", "moteur", "explique"]};
    if (v("mem") != null && v("mem") < 0.6) return {k: "memoriser", l: "À mémoriser", formats: ["term", "def", "trou", "carte", "pairs"]};
    if (v("app") == null || v("app") < 0.6) return {k: "appliquer", l: "À appliquer", formats: ["exo", "ex", "moteur", "situation"]};
    if (v("auto") == null || v("auto") < 0.7) return {k: "autonomie", l: "Sans aide", formats: ["term", "exo", "examen"]};
    return {k: "acquise", l: "Acquise", formats: ["term", "exo"]};
  }
  /* « Semble acquise mais fragile » : la mémoire va bien, mais comprendre ou appliquer ne suit pas (ou plus). */
  function fragile(n, now = Date.now()) {
    const p = profil(n, now);
    return p.mem.v != null && p.mem.v >= 0.7 && ((p.comp.v != null && p.comp.v < 0.5) || (p.app.v != null && p.app.v < 0.5) || (n.lapses || 0) >= 2);
  }
  /* Les prérequis pas encore maîtrisés, qui empêchent de comprendre la notion. byId : Map id → notion. */
  function prerequisBloquants(n, byId, now = Date.now()) {
    return (n.pre || []).map(id => byId.get(id)).filter(p => p && !p.off && maitrise(p, now) < 0.5);
  }
  function confusionFrequente(n) {
    const c = Object.entries(n.confus || {}).sort((a, b) => b[1] - a[1])[0];
    return c && c[1] >= 2 ? c[0] : null;
  }
  /* Ordre des nouvelles notions : jamais une notion avant ses prérequis (s'ils sont dans la liste). */
  function ordreAvecPrerequis(list) {
    const ids = new Set(list.map(n => n.id)), fait = new Set(), out = [], reste = list.slice();
    let garde = 0;
    while (reste.length && garde++ < list.length * list.length + 5) {
      const i = reste.findIndex(n => (n.pre || []).every(p => !ids.has(p) || fait.has(p)));
      const k = i < 0 ? 0 : i; const n = reste.splice(k, 1)[0]; out.push(n); fait.add(n.id);
    }
    return out.concat(reste);
  }
  /* Une notion nouvelle peut-elle être apprise aujourd'hui ? Pas si un de ses prérequis n'a jamais été vu. */
  function pretePourApprendre(n, byId) { return (n.pre || []).every(id => { const p = byId.get(id); return !p || p.off || !!p.last; }); }

  /* ---------- 4. Le tableau du jour ---------- */
  function tableau(notions, queue, now = Date.now(), pertOf = n => n.pert || 2) {
    const vivantes = notions.filter(n => !n.off), byId = new Map(notions.map(n => [n.id, n]));
    const apprendre = queue.filter(n => !n.last && !n.enonce).length, reviser = queue.filter(n => n.last || n.enonce).length;
    let s = 0, t = 0; vivantes.forEach(n => { const w = pertOf(n); s += w * maitrise(n, now); t += w; });
    const problemes = vivantes.filter(n => n.last || n.dims).map(n => {
      const m = maitrise(n, now), bl = prerequisBloquants(n, byId, now), conf = confusionFrequente(n), fr = fragile(n, now), b = besoin(n, now);
      let raison = "";
      if (bl.length) raison = "Il te manque d'abord : " + bl.map(p => p.term || "une notion").slice(0, 2).join(", ");
      else if (conf) raison = "Tu la confonds souvent avec « " + conf + " »";
      else if ((n.lapses || 0) >= 2) raison = "Oubliée " + n.lapses + " fois";
      else if (fr) raison = "Semble acquise, mais reste fragile";
      else if (m < 0.5) raison = b.l;
      const prio = (1 - m) * pertOf(n) + (bl.length ? 0.5 : 0) + (conf ? 0.4 : 0) + Math.min(1, (n.lapses || 0) * 0.3) + (fr ? 0.3 : 0);
      return {n, m, raison, prio, besoin: b, bloquants: bl};
    }).filter(x => x.raison).sort((a, b) => b.prio - a.prio);
    return {apprendre, reviser, problemes, progression: t ? Math.round(s / t * 100) : 0,
      acquises: vivantes.filter(n => maitrise(n, now) >= 0.8).length, total: vivantes.length};
  }

  root.NoteaParcours = {notionsDepuisAnalyse, pertDepuisImportance, enregistrer, dimsDe, score, profil, maitrise, niveau, besoin, fragile,
    prerequisBloquants, confusionFrequente, ordreAvecPrerequis, pretePourApprendre, tableau, DIMS, NOM, AIDE, MESURE};
})(typeof window !== "undefined" ? window : globalThis);
