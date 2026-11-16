/* Notéa — moteur 7 : profil de compréhension de l'élève.
   Pour chaque notion, on garde des PREUVES (réponses datées, de types différents) et on en déduit un niveau :
   0 Non évalué · 1 Découverte · 2 Reconnaissance · 3 Compréhension partielle · 4 Compréhension correcte ·
   5 Application maîtrisée · 6 Mémorisation durable · 7 Maîtrise avancée.
   Règle clé : une seule bonne réponse ne prouve jamais la maîtrise. Au-delà du niveau 2, il faut plusieurs
   preuves de types différents. La mémoire suit le modèle FSRS (comme le reste de Notéa) : stabilité, oubli. */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {norm, stem, words, isContent, lev, round, clamp01} = NM;
  const JOUR = 864e5, FACTOR = 19 / 81, DECAY = -0.5;
  const NIVEAUX = ["Non évalué", "Découverte", "Reconnaissance", "Compréhension partielle", "Compréhension correcte", "Application maîtrisée", "Mémorisation durable", "Maîtrise avancée"];
  // Type de preuve selon l'activité. reconnaissance < rappel < reformulation / explication < application < transfert.
  const PREUVE = {decouverte: "decouverte", qcm: "reconnaissance", association: "reconnaissance", flashcard: "rappel", trou: "rappel", definition: "rappel", directe: "rappel", chronologie: "rappel",
    reformulation: "reformulation", explication: "explication", causalite: "explication", comparaison: "explication", situation: "application", application: "application", calcul: "application",
    synthese: "transfert", transfert: "transfert", probleme: "transfert", feuille: "rappel"};

  const nouveauProfil = (eleveId = "moi") => ({eleve: eleveId, v: 1, notions: {}});
  const etat = (p, id) => p.notions[id] || (p.notions[id] = {preuves: [], ok: 0, ko: 0, erreurs: {}, S: 0, last: 0, niveau: 0});
  const retention = (S, jours) => S > 0 ? Math.pow(1 + FACTOR * jours / S, DECAY) : 0;
  const intervalle = (S, r = 0.9) => S / FACTOR * (Math.pow(r, 1 / DECAY) - 1);

  /* Enregistre une réponse. r = {notion, activite, correct (bool) ou score 0..1, temps (s), confiance (1..3 déclarée), erreur, date} */
  function enregistrer(p, r) {
    const e = etat(p, r.notion), now = r.date || Date.now(), type = PREUVE[r.activite] || "rappel", score = r.score != null ? r.score : r.correct ? 1 : 0, ok = score >= 0.7;
    const jours = e.last ? (now - e.last) / JOUR : 0, R = retention(e.S, jours);
    e.preuves.push({date: now, activite: r.activite, type, score: round(score), ok, temps: r.temps || null, confiance: r.confiance || null, erreur: r.erreur || null, ecartJours: round(jours, 1), retention: round(R)});
    if (e.preuves.length > 60) e.preuves.shift();
    ok ? e.ok++ : e.ko++; if (!ok && r.erreur) e.erreurs[r.erreur] = (e.erreurs[r.erreur] || 0) + 1;
    // Stabilité (jours) façon FSRS simplifiée : grandit après un succès espacé, rétrécit après un échec.
    if (type !== "decouverte" && type !== "reconnaissance") {
      if (!e.S) e.S = ok ? 2.5 : 0.6;
      else if (ok) e.S = e.S * (1.3 + 2.5 * (1 - R)) * (score >= 0.95 ? 1.15 : 1);   // révision tardive (R bas) = gain plus grand
      else e.S = Math.max(0.3, e.S * 0.35);
      e.last = now;
    } else if (!e.last) e.last = now;
    e.niveau = niveau(e, now); e.maitrise = maitrise(e, now);
    return e;
  }

  function niveau(e, now = Date.now()) {
    const P = e.preuves; if (!P.length) return 0;
    const reussi = t => P.filter(x => x.ok && x.type === t), types = new Set(P.filter(x => x.ok && x.type !== "decouverte").map(x => x.type));
    const recent = P.slice(-3), dernier = P[P.length - 1], erreursRecentes = recent.filter(x => !x.ok && x.type !== "decouverte").length;
    const comprehension = ["rappel", "reformulation", "explication"].filter(t => reussi(t).length).length, nbCompr = P.filter(x => x.ok && ["rappel", "reformulation", "explication"].includes(x.type)).length;
    let n = 1;                                                                                   // découverte
    if (reussi("reconnaissance").length || nbCompr) n = 2;                                      // reconnaissance (une bonne réponse : pas plus)
    if (nbCompr >= 1 && P.filter(x => x.ok && x.type !== "decouverte").length >= 2) n = 3;     // compréhension partielle
    if (comprehension >= 2 && nbCompr >= 2 && dernier.ok && erreursRecentes <= 1) n = 4;        // compréhension correcte : 2 preuves de types différents
    const derniereApp = P.filter(x => x.type === "application").slice(-1)[0];
    if (n >= 4 && derniereApp && derniereApp.ok) n = 5;
    const espace = P.some(x => x.ok && x.type !== "reconnaissance" && x.type !== "decouverte" && x.ecartJours >= 7);
    if (n >= 4 && espace && e.S >= 14) n = Math.max(n, 6);                                      // mémorisation durable : réussi après ≥ 7 jours
    if (n >= 6 && reussi("application").length && (reussi("transfert").length || reussi("explication").length >= 2)) n = 7;
    if (erreursRecentes >= 2) n = Math.min(n, 3);                                               // deux erreurs récentes : on redescend
    if (P.every(x => !x.ok || x.type === "decouverte")) n = 1;
    return n;
  }
  // Maîtrise 0..1 : niveau, abaissé par le risque d'oubli.
  function maitrise(e, now = Date.now()) {
    if (!e || !e.preuves.length) return 0;
    const R = e.S ? retention(e.S, (now - e.last) / JOUR) : 0.5;
    return round(clamp01((e.niveau / 7) * (0.5 + 0.5 * R)));
  }
  const risqueOubli = (e, now = Date.now()) => !e || !e.S ? 1 : round(1 - retention(e.S, (now - e.last) / JOUR));
  const prochaineRevision = (e, cible = 0.9) => !e || !e.S ? Date.now() : e.last + Math.max(0.5, intervalle(e.S, cible)) * JOUR;

  /* Corrige une réponse écrite, sans IA. Les fautes d'orthographe ne comptent pas (élèves dys) :
     un mot clé est trouvé s'il est très proche. Types d'erreur : vide, confusion (réponse = autre notion), partielle, hors-sujet. */
  function evaluerReponse(q, reponse, autres = []) {
    const rep = String(reponse || "").trim();
    if (!rep) return {correct: false, score: 0, erreur: "vide", trouves: [], manquants: q.criteres || []};
    if (q.choix) { const ok = norm(rep) === norm(q.reponseAttendue); return {correct: ok, score: ok ? 1 : 0, erreur: ok ? null : (autres.some(a => norm(a) === norm(rep)) ? "confusion" : "mauvais-choix"), trouves: [], manquants: []}; }
    const rs = words(rep).filter(isContent).map(w => stem(w)), proche = (k, list) => list.some(w => w === k || (k.length >= 5 && lev(w, k) <= (k.length >= 8 ? 2 : 1)));
    const crit = (q.criteres && q.criteres.length ? q.criteres : words(q.reponseAttendue).filter(isContent)).map(w => stem(w));
    const trouves = crit.filter(k => proche(k, rs)), manquants = crit.filter(k => !proche(k, rs));
    const score = crit.length ? trouves.length / crit.length : 0;
    const ortho = trouves.some(k => !rs.includes(k));
    const confond = autres.find(a => { const ks = words(a).filter(isContent).map(stem); return ks.length && ks.every(k => proche(k, rs)) && !crit.every(k => ks.includes(k)); });
    const erreur = score >= 0.7 ? null : confond ? "confusion" : score > 0 ? "partielle" : "hors-sujet";
    return {correct: score >= 0.7, score: round(score), erreur, confondAvec: confond || null, trouves, manquants, orthographeIgnoree: ortho};
  }

  // Carte de maîtrise d'un cours : niveau et maîtrise par notion, moyenne pondérée par l'importance.
  function carteMaitrise(p, g, now = Date.now()) {
    const lignes = g.noeuds.map(n => { const e = p.notions[n.id]; return {id: n.id, nom: n.nom, importance: n.importance || 0, niveau: e ? niveau(e, now) : 0,
      nomNiveau: NIVEAUX[e ? niveau(e, now) : 0], maitrise: e ? maitrise(e, now) : 0, risqueOubli: risqueOubli(e, now), erreurs: e ? e.erreurs : {}, prochaine: e ? prochaineRevision(e) : null}; });
    const W = lignes.reduce((s, l) => s + Math.max(1, l.importance), 0);
    return {lignes, global: round(lignes.reduce((s, l) => s + l.maitrise * Math.max(1, l.importance), 0) / W), nonEvaluees: lignes.filter(l => !l.niveau).length,
      difficultesPersistantes: lignes.filter(l => Object.values(l.erreurs).some(v => v >= 2)).map(l => l.id)};
  }

  Object.assign(NM, {nouveauProfil, enregistrer, niveauMaitrise: niveau, maitrise, risqueOubli, prochaineRevision, evaluerReponse, carteMaitrise, NIVEAUX_MAITRISE: NIVEAUX, TYPE_PREUVE: PREUVE, retention});
})(typeof window !== "undefined" ? window : globalThis);
