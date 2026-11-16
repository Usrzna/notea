// Tests automatiques du moteur de compréhension. Lancer : node --test tests/
const test = require("node:test"), assert = require("node:assert/strict");
const NM = require("./charger.js"), fs = require("fs"), path = require("path");
const cours = f => fs.readFileSync(path.join(__dirname, "corpus", f), "utf8");
const analyse = f => NM.analyserCours([{nom: f, type: "texte", texte: cours(f)}]);
const parNom = (g, nom) => g.noeuds.find(n => n.nom.toLowerCase() === nom.toLowerCase());
const JOUR = 864e5;

/* ---------- Lecture documentaire ---------- */
test("PDF propre : titres, listes, tableau, formule, légende et plan", () => {
  const s = NM.structurer(cours("svt-photosynthese.txt"));
  const k = t => s.blocs.filter(b => b.kind === t).length;
  assert.ok(k("titre") >= 4); assert.ok(k("liste") >= 2); assert.ok(k("formule") >= 1);
  assert.equal(s.plan.length, 1); assert.ok(s.plan[0].enfants.length >= 3);
  assert.ok(s.blocs.every(b => b.page && b.doc && b.ligne && typeof b.conf === "number"), "chaque bloc garde sa provenance");
});
test("Tableau : en-têtes et lignes séparés", () => {
  const s = NM.structurer("Les réactifs\n| Réactif | Produit |\n|---|---|\n| CO2 | glucose |\n| H2O | O2 |\n");
  const t = s.blocs.find(b => b.kind === "tableau");
  assert.deepEqual(t.entetes, ["Réactif", "Produit"]); assert.equal(t.lignes.length, 2); assert.equal(t.conf, 1);
});
test("Formules : chimie et physique, symboles reliés aux notions par la légende", () => {
  const a = analyse("physique-puissance.txt"), P = parNom(a.graphe, "puissance électrique"), U = parNom(a.graphe, "tension électrique");
  assert.equal(P.symbole, "P"); assert.equal(U.symbole, "U");
  assert.ok(a.graphe.aretes.some(r => r.type === "calcule" && r.de === U.id && r.vers === P.id));
});
test("Photo floue : les passages mal lus sont signalés, et aucune question n'est posée dessus", () => {
  const texte = "La photosynthèse est la réaction qui fabrique de la matière organique.\nLa chl0r0phy11e est un p1gm3nt qu1 c4pt3 la lum1ère ~~ |\nLa photosynthèse produit du dioxygène et la photosynthèse utilise la lumière.";
  const a = NM.analyserCours([{nom: "photo.jpg", type: "photo", texte, conf: 0.9}]);
  const douteux = a.structure.blocs.filter(b => b.statut === NM.STATUT.INCERTAIN);
  assert.ok(douteux.length >= 1); assert.ok(a.alertes.some(x => x.type === "lecture"));
  const unitesDouteuses = new Set(a.comprehension.unites.filter(u => u.statut === NM.STATUT.INCERTAIN).map(u => u.id));
  assert.ok(a.questions.every(q => !unitesDouteuses.has(q.source.unite)));
});
test("Plusieurs pages dans le désordre : remises dans l'ordre imprimé", () => {
  const t = "— page 1 —\nSuite du cours.\nPage 2\n— page 2 —\nDébut du cours.\nPage 1\n— page 3 —\nFin du cours.\nPage 3";
  const s = NM.structurer(t);
  assert.deepEqual(s.pages.map(p => p.numImprime), [1, 2, 3]); assert.ok(s.alertes.some(a => a.type === "ordre"));
  assert.equal(s.blocs[0].texte, "Début du cours.");
});
test("Document incomplet : fin coupée signalée", () => {
  const s = NM.structurer("La monnaie est un moyen d'échange.\nLa banque centrale contrôle la quantité de monnaie qui circule dans le pays et elle");
  assert.ok(s.alertes.some(a => a.type === "incomplet"));
});
test("Cours manuscrit : passe par le modèle de vision (fournisseur au choix), résultat validé", async () => {
  const fauxModele = async ({systeme, schema}) => { assert.match(systeme, /fidèlement/); assert.ok(schema.properties.pages);
    return {pages: [{numero: 1, texte: "Le fructus est le droit de percevoir les fruits.\nusus → fructus → abusus", manuscrit: true, confiance: 0.75}]}; };
  const a = await NM.analyserCoursAvecVision([{nom: "copie.jpg", images: ["data:image/jpeg;base64,AAA"]}], fauxModele);
  assert.ok(a.comprehension.notions.some(c => c.label === "fructus" && c.definitions.length));
  assert.ok(a.structure.blocs.every(b => b.conf <= 0.75));
  await assert.rejects(() => NM.lireVision(["x"], async () => ({rien: true})), /invalide/);
});

/* ---------- Compréhension pédagogique ---------- */
test("Matière reconnue dans 6 disciplines, niveau jamais deviné", () => {
  const attendu = {"droit-propriete.txt": "Droit", "svt-photosynthese.txt": "SVT", "histoire-ww1.txt": "Histoire", "maths-pythagore.txt": "Mathématiques", "eco-inflation.txt": "Économie", "physique-puissance.txt": "Physique-chimie"};
  Object.entries(attendu).forEach(([f, m]) => { const c = NM.classifier(NM.structurer(cours(f))); assert.equal(c.matiere.valeur, m, f); assert.equal(c.matiere.statut, NM.STATUT.INFERE); });
  assert.equal(NM.classifier(NM.structurer(cours("svt-photosynthese.txt"))).niveau.statut, "inconnu");
  assert.equal(NM.classifier(NM.structurer("Bonjour. Ceci parle de tout et de rien.")).matiere.statut, "inconnu");
  assert.equal(NM.classifier(NM.structurer("x"), {matiere: "Droit civil"}).matiere.statut, NM.STATUT.CONFIRME);
});
test("Objectifs et prérequis annoncés sont lus", () => {
  assert.equal(NM.classifier(NM.structurer(cours("svt-photosynthese.txt"))).objectifs.length, 2);
  assert.equal(NM.classifier(NM.structurer(cours("maths-pythagore.txt"))).prerequis.length, 2);
});
test("Définitions extraites (« est un », « désigne », « on appelle », « : »)", () => {
  const c = NM.comprendre(NM.structurer("On appelle hypoténuse le côté opposé à l'angle droit.\nL'usufruit désigne le droit d'utiliser un bien.\nMitose : division d'une cellule en deux cellules filles.\nUne enzyme est une protéine qui accélère une réaction."));
  ["hypoténuse", "usufruit", "mitose", "enzyme"].forEach(t => assert.ok(c.notions.some(n => n.label.toLowerCase() === t && n.definitions.length), t));
});
test("Relations : sens des causes, négation ignorée, oppositions", () => {
  const c = NM.comprendre(NM.structurer("La chaleur est une forme d'énergie.\nLa chaleur provoque la dilatation.\nLa dilatation résulte de la chaleur.\nLe froid ne provoque pas la dilatation.\nContrairement au froid, la chaleur dilate les métaux.\nLe froid est une sensation."));
  const id = l => c.notions.find(n => n.label === l).id, r = c.relations;
  assert.ok(r.some(x => x.type === "provoque" && x.de === id("chaleur") && x.vers === id("dilatation") && x.preuves >= 2));
  assert.ok(!r.some(x => x.type === "provoque" && x.de === id("froid")), "la phrase négative ne crée pas de lien");
  assert.ok(r.some(x => x.type === "oppose"));
  assert.ok(r.every(x => x.preuve && x.statut), "chaque lien garde sa phrase et son statut");
});
test("Contradiction : deux définitions différentes de la même notion", () => {
  const c = NM.comprendre(NM.structurer("— page 1 —\nLa rente est un revenu régulier tiré d'un capital.\n— page 2 —\nLa rente est une maladie des plantes tropicales."));
  assert.ok(c.alertes.some(a => a.type === "contradiction"));
});
test("Scores : la notion principale est en tête ; importance et difficulté séparées, avec justification", () => {
  [["droit-propriete.txt", "droit de propriété"], ["svt-photosynthese.txt", "photosynthèse"], ["maths-pythagore.txt", "théorème de pythagore"], ["eco-inflation.txt", "inflation"], ["physique-puissance.txt", "puissance électrique"]].forEach(([f, n]) => {
    const g = analyse(f).graphe, top = [...g.noeuds].sort((a, b) => b.importance - a.importance)[0]; assert.equal(top.nom.toLowerCase(), n, f); });
  const g = analyse("droit-propriete.txt").graphe, usus = parNom(g, "usus"), servitude = parNom(g, "servitude");
  assert.ok(usus.difficulte > servitude.difficulte, "usus se confond avec fructus et abusus");
  g.noeuds.forEach(n => { assert.ok(n.importance >= 0 && n.importance <= 100); assert.ok(n.pertinence.pourquoi.length > 5); assert.ok(n.difficulteDetail.pourquoi.length > 5); });
});
test("La fréquence seule ne rend pas important", () => {
  const t = "Le climat est l'ensemble des conditions météorologiques d'une région sur une longue durée.\nPar exemple il pleut. Il pleut souvent. Il pleut à Brest. Il pleut le lundi.\nLe climat dépend de la latitude.";
  const g = NM.analyserCours(t).graphe; assert.equal([...g.noeuds].sort((a, b) => b.importance - a.importance)[0].nom, "climat");
});
test("Calibrage des poids : l'erreur baisse", () => {
  const ex = [{facteurs: {conceptuelle: 1, dependances: 0.2}, cible: 80}, {facteurs: {conceptuelle: 0.2, dependances: 1}, cible: 30}, {facteurs: {conceptuelle: 0.5, dependances: 0.5}, cible: 55}];
  const avant = NM.calibrer(ex, NM.POIDS_PERTINENCE, 0).erreur, apres = NM.calibrer(ex).erreur;
  assert.ok(apres < avant, `${apres} < ${avant}`);
});

/* ---------- Graphe ---------- */
test("Graphe : prérequis, ordre d'apprentissage, centralité, fusion de deux cours", () => {
  const g = analyse("physique-puissance.txt").graphe, P = parNom(g, "puissance électrique"), U = parNom(g, "tension électrique");
  assert.ok(NM.prerequisEnChaine(g, P.id).some(x => x.id === U.id));
  const o = NM.ordreApprentissage(g).ordre; assert.ok(o.indexOf(U.id) < o.indexOf(P.id), "la tension avant la puissance");
  assert.equal(P.centralite, 1);
  const g2 = analyse("eco-inflation.txt").graphe, f = NM.fusionner([g, g2]);
  assert.equal(f.noeuds.length, g.noeuds.length + g2.noeuds.length - g.noeuds.filter(n => g2.byId.has(n.id)).length);
  const r = NM.importerGraphe(JSON.parse(JSON.stringify(NM.exporterGraphe(g)))); assert.equal(r.noeuds.length, g.noeuds.length);
});
test("Cycle de prérequis : cassé au lien le plus faible, signalé", () => {
  const g = NM.indexer({cours: ["x"], noeuds: ["a", "b"].map((id, i) => ({id, nom: id, ordre: i, importance: 50, sections: [], cours: ["x"]})),
    aretes: [{id: "r1", de: "a", vers: "b", type: "prerequis", confiance: 0.9}, {id: "r2", de: "b", vers: "a", type: "prerequis", confiance: 0.3}]});
  const o = NM.ordreApprentissage(g); assert.deepEqual(o.ordre, ["a", "b"]); assert.deepEqual(o.cyclesCasses, ["r2"]);
});

/* ---------- Génération ---------- */
test("Questions : toutes reliées à une phrase du cours, avec corrigé, critères et niveau de Bloom", () => {
  ["droit-propriete.txt", "svt-photosynthese.txt", "histoire-ww1.txt", "eco-inflation.txt"].forEach(f => { const a = analyse(f);
    assert.ok(a.questions.length >= 10, f);
    const brut = cours(f).replace(/\*\*|__|==/g, "").replace(/\s+/g, " ");
    a.questions.forEach(q => { assert.ok(q.source && q.source.texte && brut.includes(q.source.texte.slice(0, 20)), "source réelle : " + q.source.texte); assert.ok(q.reponseAttendue && q.corrige); assert.ok(q.bloom >= 1 && q.bloom <= 6); assert.ok(q.notions.length); }); });
});
test("Questions de mémorisation, compréhension, application et raisonnement présentes", () => {
  const a = analyse("physique-puissance.txt"), b = new Set(a.questions.map(q => q.bloom));
  [1, 2, 3].forEach(n => assert.ok(b.has(n), "Bloom " + n));
  assert.ok(analyse("svt-photosynthese.txt").questions.some(q => q.bloom >= 4), "raisonnement");
});
test("QCM : 4 choix au plus, la bonne réponse incluse, les pièges sont des phrases du même cours", () => {
  const a = analyse("droit-propriete.txt");
  a.questions.filter(q => q.choix).forEach(q => { assert.ok(q.choix.length >= 3 && q.choix.length <= 4); assert.ok(q.choix.includes(q.reponseAttendue));
    q.choix.forEach(c => assert.ok(cours("droit-propriete.txt").toLowerCase().includes(c.toLowerCase().slice(0, 15)), c)); });
});
test("Exercice de calcul : résultat juste", () => {
  const q = analyse("physique-puissance.txt").questions.find(x => x.type === "calcul"), [u, i] = q.enonce.match(/\d+/g).map(Number);
  assert.equal(Number(q.reponseAttendue), u * i); assert.equal(NM.calc("2*(3+4)-6/2"), 11); assert.equal(NM.calc("2+alert(1)"), null);
});
test("Pas de doublons, et explications sans rien inventer", () => {
  const a = analyse("svt-photosynthese.txt"), cles = a.questions.map(q => q.type + q.notions.join());
  assert.equal(new Set(cles).size, cles.length);
  const ch = parNom(a.graphe, "chlorophylle"), e = NM.expliquer(a.graphe, a.comprehension, a.pedagogie, ch.id);
  assert.ok(e.simple.includes("pigment")); assert.equal(e.exemple.texte, null); assert.match(e.exemple.message, /pas d'exemple/);
});
test("Schémas : bon type choisi, aucune notion inventée, chaque lien a sa source", () => {
  const h = analyse("histoire-ww1.txt").schemas, e = analyse("eco-inflation.txt").schemas;
  assert.equal(h.choix, "frise"); assert.equal(e.choix, "causalite");
  [h, e].forEach(s => { assert.ok(s.principal.controle.valide, JSON.stringify(s.principal.controle)); assert.ok(s.principal.mermaid.length > 10); assert.ok(s.carteMentale.plan.split("\n").length >= 3); });
  assert.ok(h.principal.etapes.map(x => x.date).join() === "1914,1916,1918,1919");
});
test("Objectifs : niveaux de Bloom et erreurs probables tirées du cours", () => {
  const a = analyse("eco-inflation.txt"), inf = parNom(a.graphe, "inflation"), p = a.pedagogie.parNotion[inf.id];
  assert.ok(p.objectifs.some(o => o.bloom === 1) && p.objectifs.some(o => o.bloom >= 3));
  assert.ok(p.erreursProbables.some(e => /sens/.test(e.texte)));
  assert.ok(a.pedagogie.erreursDiscipline.every(e => e.statut === "externe"), "les erreurs générales ne sont pas présentées comme venant du cours");
});

/* ---------- Personnalisation ---------- */
const g0 = () => analyse("physique-puissance.txt");
test("Élève débutant : on découvre d'abord, prérequis avant, rappel rapide à la fin", () => {
  const a = g0(), s = NM.prochaineSeance(a.graphe, a.questions, NM.nouveauProfil(), {minutes: 10});
  const dec = s.activites.filter(x => x.activite === "decouverte").map(x => x.nom);
  assert.ok(dec.indexOf("tension électrique") < dec.indexOf("puissance électrique")); assert.ok(dec.length <= 3);
  assert.equal(s.activites[s.activites.length - 1].activite, "flashcard");
});
test("Une seule bonne réponse ne prouve jamais la maîtrise", () => {
  const p = NM.nouveauProfil(), e = NM.enregistrer(p, {notion: "x", activite: "definition", correct: true});
  assert.ok(e.niveau <= 2);
  NM.enregistrer(p, {notion: "x", activite: "reformulation", correct: true}); assert.equal(p.notions.x.niveau, 4, "deux preuves de types différents");
});
test("Élève avancé : mémorisation durable seulement après une réussite espacée d'au moins 7 jours", () => {
  const p = NM.nouveauProfil(), t0 = Date.now() - 60 * JOUR, r = (act, j) => NM.enregistrer(p, {notion: "x", activite: act, correct: true, date: t0 + j * JOUR});
  r("definition", 0); r("reformulation", 1); r("application", 3); assert.equal(p.notions.x.niveau, 5);
  r("definition", 4); assert.ok(p.notions.x.niveau < 6, "pas encore d'écart de 7 jours");
  r("definition", 12); r("definition", 30); r("explication", 50);
  assert.ok(p.notions.x.niveau >= 6, "niveau " + p.notions.x.niveau + ", S " + p.notions.x.S);
  assert.ok(NM.prochaineRevision(p.notions.x) > t0 + 50 * JOUR);
});
test("Élève avec erreurs répétées : le niveau redescend, l'erreur est comptée, la priorité monte", () => {
  const a = g0(), P = parNom(a.graphe, "puissance électrique"), p = NM.nouveauProfil();
  ["definition", "reformulation"].forEach(act => NM.enregistrer(p, {notion: P.id, activite: act, correct: true}));
  const avant = NM.priorites(a.graphe, p).find(x => x.id === P.id).S;
  [1, 2].forEach(() => NM.enregistrer(p, {notion: P.id, activite: "definition", correct: false, erreur: "confusion"}));
  assert.ok(p.notions[P.id].niveau <= 3); assert.equal(p.notions[P.id].erreurs.confusion, 2);
  assert.ok(NM.priorites(a.graphe, p).find(x => x.id === P.id).S > avant);
  assert.ok(NM.carteMaitrise(p, a.graphe).difficultesPersistantes.includes(P.id));
});
test("Élève qui connaît une notion mais pas ses prérequis : le prérequis passe devant", () => {
  const a = g0(), P = parNom(a.graphe, "puissance électrique"), U = parNom(a.graphe, "tension électrique"), p = NM.nouveauProfil();
  NM.enregistrer(p, {notion: P.id, activite: "definition", correct: true}); NM.enregistrer(p, {notion: U.id, activite: "definition", correct: false});
  const pr = NM.priorites(a.graphe, p), lp = pr.find(x => x.id === P.id), lu = pr.find(x => x.id === U.id);
  assert.ok(lp.bloquePar.includes(U.id)); assert.ok(pr.indexOf(lu) < pr.indexOf(lp));
  assert.ok(NM.bloquants(a.graphe, {[U.id]: 0.1}).some(b => b.id === U.id));
});
test("Correction d'une réponse : fautes d'orthographe pardonnées, confusion repérée", () => {
  const q = {reponseAttendue: "le droit de percevoir les fruits de la chose", criteres: ["percevoir", "fruits"]};
  assert.equal(NM.evaluerReponse(q, "le droit de persevoir les fruis").correct, true);
  const r = NM.evaluerReponse(q, "le droit de vendre la chose", ["droit de vendre"]); assert.equal(r.correct, false); assert.ok(["confusion", "hors-sujet", "partielle"].includes(r.erreur));
  assert.equal(NM.evaluerReponse(q, "").erreur, "vide");
});
test("Priorité : formule configurable", () => {
  const a = g0(), p = NM.nouveauProfil(), seulI = NM.priorites(a.graphe, p, {poids: {I: 1, M: 0, D: 0, P: 0, O: 0, E: 0, V: 0}});
  assert.equal(seulI[0].nom, [...a.graphe.noeuds].sort((x, y) => y.importance - x.importance)[0].nom);
});
test("Long cours (≈ 4 000 mots) : traité en moins de 4 secondes", () => {
  const tout = fs.readdirSync(path.join(__dirname, "corpus")).filter(f => f.endsWith(".txt")).map(cours).join("\n\n");
  const t = Array.from({length: 5}, (_, i) => `— page ${i + 1} —\n` + tout).join("\n"), t0 = Date.now(), a = NM.analyserCours(t);
  assert.ok(Date.now() - t0 < 4000, (Date.now() - t0) + " ms"); assert.ok(a.graphe.noeuds.length > 50);
});
test("Mesures sur les cours inédits : seuils minimaux", () => {
  const {resF} = require("./mesures.js"), moy = f => resF.reduce((s, r) => s + f(r), 0) / resF.length;
  assert.ok(moy(r => r.defRappel) >= 0.9); assert.ok(moy(r => r.relRappelSouple) >= 0.8); assert.ok(moy(r => r.relPrecisionSouple) >= 0.8);
});
