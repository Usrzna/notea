/* Notéa — chaîne complète (étapes 1 à 21 de l'énoncé).
   analyserCours(sources, opts) : importation → structure → matière et chapitre → connaissances → types → relations
   → graphe → pertinence et difficulté → objectifs → questions et exercices → schémas → contrôle qualité.
   Le diagnostic de l'élève, la mise à jour de la maîtrise, les révisions et l'adaptation se font ensuite avec
   NM.enregistrer, NM.prochaineSeance et NM.choisirQuestions, à chaque réponse.
   analyserCoursAvecVision : même chose, mais les photos passent d'abord par un modèle de vision (fournisseur au choix). */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const VERSION = "1.0";

  function analyserCours(sources, opts = {}) {
    const t0 = Date.now(), etapes = {};
    const mesure = (nom, f) => { const a = Date.now(), r = f(); etapes[nom] = Date.now() - a; return r; };
    const structure = mesure("structure", () => NM.structurer(sources, opts));
    const classification = mesure("classification", () => NM.classifier(structure, opts));
    const comprehension = mesure("comprehension", () => NM.comprendre(structure));
    mesure("pertinence", () => NM.noter(comprehension, classification, opts));
    const graphe = mesure("graphe", () => NM.construireGraphe(comprehension, structure, classification, opts.coursId || structure.id));
    const pedagogie = mesure("pedagogie", () => NM.pedagogie(graphe, classification));
    const questions = mesure("questions", () => NM.generer(graphe, comprehension, pedagogie, opts));
    const schemas = mesure("schemas", () => NM.schemas(graphe, structure, comprehension));
    const ordre = NM.ordreApprentissage(graphe), verification = NM.verification(graphe);
    // Contrôle qualité final : aucune question sans source, aucune question sur un passage douteux.
    const uById = new Map(comprehension.unites.map(u => [u.id, u]));
    const rejetees = questions.filter(q => !q.source || !uById.get(q.source.unite) || uById.get(q.source.unite).statut === NM.STATUT.INCERTAIN);
    const sures = questions.filter(q => !rejetees.includes(q));
    return {version: VERSION, id: structure.id, date: new Date().toISOString(), duree: Date.now() - t0, etapes,
      structure, classification, comprehension, graphe, pedagogie, questions: sures, schemas, ordre, verification,
      alertes: [...structure.alertes, ...comprehension.alertes, ...(ordre.cyclesCasses.length ? [{type: "cycle", statut: NM.STATUT.INCERTAIN, message: "Des notions dépendent l'une de l'autre en boucle : j'ai choisi un ordre, vérifie-le."}] : [])],
      resume: {notions: graphe.noeuds.length, definitions: comprehension.notions.filter(c => c.definitions.length).length, relations: graphe.aretes.length,
        relationsConfirmees: graphe.aretes.filter(a => a.statut === NM.STATUT.CONFIRME).length, questions: sures.length, questionsRejetees: rejetees.length}};
  }
  async function analyserCoursAvecVision(sources, appelerModele, opts = {}) {
    const lues = [];
    for (const s of sources) lues.push(s.images ? await NM.lireVision(s.images, appelerModele, s.nom) : s);
    return analyserCours(lues, opts);
  }
  // Ce qu'on garde dans le stockage : sans les index ni les textes en double.
  function resumePourStockage(a) {
    return {version: a.version, id: a.id, date: a.date, matiere: a.classification.matiere, chapitre: a.classification.chapitre, niveau: a.classification.niveau,
      graphe: NM.exporterGraphe(a.graphe), questions: a.questions, ordre: a.ordre.ordre, alertes: a.alertes, carteMentale: a.schemas.carteMentale.plan, schema: {type: a.schemas.principal.type, mermaid: a.schemas.principal.mermaid}};
  }

  Object.assign(NM, {analyserCours, analyserCoursAvecVision, resumePourStockage, VERSION_MOTEUR: VERSION});
})(typeof window !== "undefined" ? window : globalThis);
