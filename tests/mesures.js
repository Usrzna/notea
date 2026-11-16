// Mesures de qualité du moteur sur les cours de référence (tests/corpus).
// Lancer : node tests/mesures.js  → affiche un tableau et l'écrit dans docs/MOTEUR-MESURES.md
const NM = require("./charger.js"), fs = require("fs"), path = require("path");
const lire = f => JSON.parse(fs.readFileSync(path.join(__dirname, "corpus", f), "utf8"));
const REF = lire("reference.json"), INEDITS = lire("inedits/reference.json"), INEDITS2 = lire("inedits2/reference.json");
const cle = l => NM.jetons(l).filter(x => x.contenu).map(x => x.s).join(" ");
const sym = new Set(["oppose", "associe"]);
// Mesure souple : même type de lien, et de chaque côté le même mot principal (« globules » pour « globules blancs »).
const proche = (x, y) => x === y || x.split(" ")[0] === y.split(" ")[0] || (" " + x + " ").includes(" " + y + " ") || (" " + y + " ").includes(" " + x + " ");
const lienSouple = (r, [a, t, b]) => r.type === t && ((proche(r.a, cle(a)) && proche(r.b, cle(b))) || (sym.has(t) && proche(r.a, cle(b)) && proche(r.b, cle(a))));
const memeLien = (r, [a, t, b]) => r.type === t && ((r.a === cle(a) && r.b === cle(b)) || (sym.has(t) && r.a === cle(b) && r.b === cle(a)));

function mesurer(fichier, ref) {
  const a = NM.analyserCours([{nom: fichier, type: "texte", texte: fs.readFileSync(path.join(__dirname, "corpus", fichier), "utf8")}]);
  const g = a.graphe, k = id => g.byId.get(id).cle;
  const defs = new Set(a.comprehension.notions.filter(c => c.definitions.length).map(c => c.cle));
  const defTrouvees = ref.definitions.filter(d => defs.has(cle(d))).length;
  const rels = g.aretes.filter(r => r.type !== "associe").map(r => ({type: r.type, a: k(r.de), b: k(r.vers), statut: r.statut}));
  const trouvees = ref.relations.filter(x => rels.some(r => memeLien(r, x))), trouveesSouple = ref.relations.filter(x => rels.some(r => lienSouple(r, x)));
  const confirmees = rels.filter(r => r.statut === NM.STATUT.CONFIRME);
  const toutes = [...ref.relations, ...ref.acceptables, ...(ref.ajoutes_apres_mesure || [])];
  const justes = confirmees.filter(r => toutes.some(x => memeLien(r, x))), justesSouple = confirmees.filter(r => toutes.some(x => lienSouple(r, x)));
  const top = [...g.noeuds].sort((x, y) => y.importance - x.importance), rangPrincipale = top.findIndex(n => n.cle === cle(ref.principale)) + 1;
  const sansSource = a.questions.filter(q => !q.source || !q.source.texte).length;
  return {fichier, matiere: a.classification.matiere.valeur, matiereOk: a.classification.matiere.valeur === ref.matiere,
    defRappel: defTrouvees / ref.definitions.length, relRappel: trouvees.length / ref.relations.length, relPrecision: confirmees.length ? justes.length / confirmees.length : 1,
    relRappelSouple: trouveesSouple.length / ref.relations.length, relPrecisionSouple: confirmees.length ? justesSouple.length / confirmees.length : 1,
    manquees: ref.relations.filter(x => !trouvees.includes(x)), fausses: confirmees.filter(r => !justes.includes(r)).map(r => `${r.a} ${r.type} ${r.b}`),
    rangPrincipale, questions: a.questions.length, sansSource, duree: a.duree};
}
const res = Object.entries(REF).filter(([f]) => !f.startsWith("_")).map(([f, r]) => mesurer(f, r));
const resF = Object.entries(INEDITS2).filter(([f]) => !f.startsWith("_")).map(([f, r]) => mesurer(f, r));
const resI = Object.entries(INEDITS).filter(([f]) => !f.startsWith("_")).map(([f, r]) => mesurer(f, r));
const pc = x => Math.round(x * 100) + " %";
const tableau = (res, nom) => { const moy = f => res.reduce((s, r) => s + f(r), 0) / res.length; return ["| Cours | Matière | Définitions trouvées | Relations trouvées (strict / souple) | Relations justes (strict / souple) | Rang de la notion principale | Questions |", "|---|---|---|---|---|---|---|",
  ...res.map(r => `| ${r.fichier} | ${r.matiere}${r.matiereOk ? "" : " ✗"} | ${pc(r.defRappel)} | ${pc(r.relRappel)} / ${pc(r.relRappelSouple)} | ${pc(r.relPrecision)} / ${pc(r.relPrecisionSouple)} | ${r.rangPrincipale || "absente"} | ${r.questions} |`),
  `| **Moyenne ${nom}** | ${res.filter(r => r.matiereOk).length}/${res.length} | ${pc(moy(r => r.defRappel))} | ${pc(moy(r => r.relRappel))} / ${pc(moy(r => r.relRappelSouple))} | ${pc(moy(r => r.relPrecision))} / ${pc(moy(r => r.relPrecisionSouple))} | | ${res.reduce((s, r) => s + r.questions, 0)} |`]; };
const lignes = ["### Mesure finale : 2e lot inédit (écrit après la fin des réglages ; seulement 3 bugs généraux corrigés ensuite)", "", ...tableau(resF, "finale"), "",
  "### 1er lot inédit (a servi à trouver des défauts généraux, puis corrigé)", "", ...tableau(resI, "inédits"), "", "### Cours de réglage (le moteur a été ajusté dessus : chiffres optimistes)", "", ...tableau(res, "réglage")];
if (require.main === module) {
  console.log(lignes.join("\n"));
  [...resF, ...resI, ...res].forEach(r => { if (r.manquees.length) console.log(`  ${r.fichier} — manquées : ${r.manquees.map(x => x.join(" ")).join(" ; ")}`); if (r.fausses.length) console.log(`  ${r.fichier} — en trop : ${r.fausses.join(" ; ")}`); });
  const md = ["# Mesures du moteur de compréhension", "", "Cours de référence : `tests/corpus/`. Annotations : `tests/corpus/reference.json` (écrites par Claude, **à faire valider par des enseignants**).", "",
    "- Rappel = part des éléments attendus que le moteur trouve. Précision = part des relations « confirmées » du moteur qui sont justes.",
    "- Strict = la notion doit avoir exactement les mêmes mots. Souple = même type de lien et même mot principal de chaque côté (« globules » pour « globules blancs »).",
    "- **Premier passage du 2e lot inédit, avant toute correction : rappel 40 %, précision 56 % (strict).** Trois bugs généraux corrigés ensuite (« s'oppose au », « provient de », groupes commençant par un mot courant) ; aucun autre réglage sur ce lot.", "", ...lignes, "",
    ...[...resF, ...resI, ...res].flatMap(r => [r.manquees.length ? `- ${r.fichier} — relations manquées : ${r.manquees.map(x => x.join(" ")).join(" ; ")}` : null, r.fausses.length ? `- ${r.fichier} — relations en trop : ${r.fausses.join(" ; ")}` : null].filter(Boolean)), "",
    `_Mesuré le ${new Date().toISOString().slice(0, 10)}, moteur ${NM.VERSION_MOTEUR}._`];
  fs.writeFileSync(path.join(__dirname, "..", "docs", "MOTEUR-MESURES.md"), md.join("\n") + "\n");
}
module.exports = {mesurer, res, resI, resF};
