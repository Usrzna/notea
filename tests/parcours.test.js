// Tests du parcours d'apprentissage (js/parcours.js). Lancer : node --test tests/
const test = require("node:test"), assert = require("node:assert/strict");
const NM = require("./charger.js"), fs = require("fs"), path = require("path");
require("../js/parcours.js"); const P = globalThis.NoteaParcours;
const cours = f => fs.readFileSync(path.join(__dirname, "corpus", f), "utf8");
const analyse = f => NM.analyserCours([{nom: f, type: "texte", texte: cours(f)}]);
const JOUR = 864e5, T0 = Date.UTC(2026, 10, 1, 9);
const notion = o => Object.assign({id: o.id || o.term, term: o.term || "x", D: 5, S: 0, last: 0, reps: 0, lapses: 0}, o);

/* ---------- Analyse → notions ---------- */
test("Import : les définitions du cours deviennent des notions, sans rien inventer", () => {
  const a = analyse("droit-propriete.txt"), ns = P.notionsDepuisAnalyse(a), texte = cours("droit-propriete.txt").replace(/\s+/g, " ");
  const usus = ns.find(n => n.term === "usus");
  assert.ok(usus && /utiliser la chose/.test(usus.def));
  ns.forEach(n => { const t = (n.def || n.phrase).replace(/…$/, ""); assert.ok(texte.includes(t.slice(0, 60)), "le texte vient du cours : " + n.term); });
  ns.forEach(n => assert.ok(n.source && n.source.page, "chaque notion garde sa page : " + n.term));
});
test("Import : une définition qui parle d'un autre mot n'est pas gardée comme définition", () => {
  const ns = P.notionsDepuisAnalyse(analyse("eco-inflation.txt")), prix = ns.find(n => n.term === "prix");
  if (prix) { assert.equal(prix.def, ""); assert.match(prix.phrase, /prix/); }
  assert.ok(/hausse générale/.test(ns.find(n => n.term === "inflation").def));
});
test("Import : deux mots avec la même définition → on garde le plus précis", () => {
  const ns = P.notionsDepuisAnalyse(analyse("droit-propriete.txt"));
  assert.ok(ns.some(n => n.term === "droit de propriété" && n.def));
  assert.ok(!ns.some(n => n.term === "droit" && n.def));
});
test("Import : pertinence 1 à 3, prérequis entre notions gardées, ordre d'apprentissage", () => {
  const ns = P.notionsDepuisAnalyse(analyse("svt-photosynthese.txt")), keys = new Set(ns.map(n => n.cle));
  ns.forEach(n => { assert.ok([1, 2, 3].includes(n.pert)); n.pre.forEach(p => assert.ok(keys.has(p))); });
  assert.ok(ns.some(n => n.pert === 3));
  for (let i = 1; i < ns.length; i++) assert.ok(ns[i - 1].rang <= ns[i].rang);
});

/* ---------- Les 5 dimensions ---------- */
test("Les dimensions sont séparées : une bonne réponse de mémoire ne rend pas « compris »", () => {
  const n = notion({term: "usus"});
  P.enregistrer(n, "term", 1, {now: T0}); P.enregistrer(n, "def", 1, {now: T0});
  const p = P.profil(n, T0);
  assert.equal(p.comp.v, null); assert.equal(p.app.v, null); assert.ok(p.auto.v > 0.5);
  P.enregistrer(n, "ex", 0, {now: T0});
  assert.ok(P.profil(n, T0).comp.v < 0.5, "comprendre baisse"); assert.equal(P.profil(n, T0).comp.k, "revoir");
});
test("La maîtrise suit les derniers résultats, pas le nombre de réussites", () => {
  const n = notion({term: "a"});
  for (let i = 0; i < 6; i++) P.enregistrer(n, "exo", 1, {now: T0});
  const avant = P.score(n, "app", T0);
  P.enregistrer(n, "exo", 0, {now: T0}); P.enregistrer(n, "exo", 0, {now: T0});
  const apres = P.score(n, "app", T0);
  assert.ok(avant > 0.95 && apres < 0.6, `6 réussites puis 2 échecs : ${avant} → ${apres}`);
});
test("Hésitation et oubli ne comptent pas pareil", () => {
  const a = notion({id: "a"}), b = notion({id: "b"});
  P.enregistrer(a, "term", 0.6, {now: T0}); P.enregistrer(b, "term", 0, {now: T0});
  assert.ok(P.score(a, "mem", T0) > P.score(b, "mem", T0));
  assert.equal(b.errs, 1); assert.ok(!a.errs);
});
test("Autonomie : réussir avec la correction ou un indice ne compte pas comme réussir seul", () => {
  const a = notion({id: "a"}), b = notion({id: "b"});
  P.enregistrer(a, "exo", 1, {now: T0}); P.enregistrer(b, "exo", 1, {now: T0, aide: true});
  assert.ok(P.score(a, "auto", T0) > 0.9); assert.ok(P.score(b, "auto", T0) < 0.1);
});
test("La mémorisation baisse avec le temps (oubli FSRS)", () => {
  const n = notion({term: "m", last: T0, S: 3, reps: 2});
  assert.ok(P.score(n, "mem", T0 + JOUR) > P.score(n, "mem", T0 + 30 * JOUR));
});
test("Diagnostic : on travaille ce qui manque (comprendre, mémoriser, appliquer, sans aide)", () => {
  const c = notion({id: "c", last: T0, S: 30}); P.enregistrer(c, "ex", 0, {now: T0});
  assert.equal(P.besoin(c, T0).k, "comprendre");
  const m = notion({id: "m", last: T0 - 40 * JOUR, S: 2}); P.enregistrer(m, "ex", 1, {now: T0}); P.enregistrer(m, "ex", 1, {now: T0});
  assert.equal(P.besoin(m, T0).k, "memoriser");
  const a = notion({id: "a", last: T0, S: 30}); ["affirm", "affirm", "term", "term"].forEach(t => P.enregistrer(a, t, 1, {now: T0})); P.enregistrer(a, "exo", 0, {now: T0});
  assert.equal(P.besoin(a, T0).k, "appliquer");
  assert.equal(P.besoin(notion({id: "n"}), T0).k, "decouvrir");
});
test("« Semble acquise mais fragile » : mémoire bonne, application ratée", () => {
  const n = notion({id: "f", last: T0, S: 30, reps: 4}); P.enregistrer(n, "term", 1, {now: T0}); P.enregistrer(n, "exo", 0, {now: T0});
  assert.ok(P.fragile(n, T0));
});

/* ---------- Prérequis et parcours ---------- */
test("Prérequis : jamais une notion avant ce qu'il faut savoir pour la comprendre", () => {
  const a = notion({id: "a"}), b = notion({id: "b", pre: ["a"]}), c = notion({id: "c", pre: ["b"]});
  assert.deepEqual(P.ordreAvecPrerequis([c, b, a]).map(n => n.id), ["a", "b", "c"]);
  const byId = new Map([a, b, c].map(n => [n.id, n]));
  assert.equal(P.pretePourApprendre(b, byId), false); a.last = T0; assert.equal(P.pretePourApprendre(b, byId), true);
});
test("Lacune : un prérequis mal maîtrisé est signalé comme cause", () => {
  const a = notion({id: "a", term: "droit", last: T0, S: 1}); P.enregistrer(a, "ex", 0, {now: T0}); P.enregistrer(a, "term", 0, {now: T0});
  const b = notion({id: "b", term: "usus", pre: ["a"], last: T0, S: 1, lapses: 2}); P.enregistrer(b, "term", 0, {now: T0});
  const t = P.tableau([a, b], [], T0);
  const pb = t.problemes.find(x => x.n === b); assert.ok(pb && /droit/.test(pb.raison));
});
test("Confusion qui revient : repérée", () => {
  const n = notion({id: "usus"}); P.enregistrer(n, "def", 0, {now: T0, choix: "fructus"}); P.enregistrer(n, "def", 0, {now: T0, choix: "fructus"});
  assert.equal(P.confusionFrequente(n), "fructus");
});
test("Tableau du jour : à apprendre, à réviser, progression pondérée par la pertinence", () => {
  const vue = notion({id: "v", last: T0, S: 40, pert: 3}); ["ex", "term", "exo"].forEach(t => P.enregistrer(vue, t, 1, {now: T0}));
  const neuve = notion({id: "n", pert: 1}), due = notion({id: "d", last: T0 - 10 * JOUR, S: 3, pert: 2});
  const t = P.tableau([vue, neuve, due], [neuve, due], T0);
  assert.equal(t.apprendre, 1); assert.equal(t.reviser, 1);
  assert.ok(t.progression > 30 && t.progression < 100, "progression " + t.progression);
  assert.equal(t.total, 3);
});
test("Une seule séance réussie ne suffit pas pour dire « acquise »", () => {
  const n = notion({id: "u", last: T0, S: 3.2, reps: 1}); P.enregistrer(n, "rappel", 1, {now: T0});
  assert.ok(P.maitrise(n, T0) < 0.8, "maîtrise " + P.maitrise(n, T0));
  // plusieurs révisions espacées réussies + compréhension et application : acquise
  Object.assign(n, {S: 40, reps: 5}); ["rappel", "ex", "exo", "rappel", "ex", "exo"].forEach(t => P.enregistrer(n, t, 1, {now: T0}));
  assert.ok(P.maitrise(n, T0) >= 0.8, "maîtrise " + P.maitrise(n, T0));
});
