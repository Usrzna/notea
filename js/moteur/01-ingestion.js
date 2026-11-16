/* Notéa — moteur 1 : ingestion et structure du document.
   Entrée : une ou plusieurs sources {nom, type, texte, conf?}. Le texte peut contenir des repères
   « — page 3 — », « — photo 2 — », « — diapo 4 — » (posés par l'import de l'appli).
   Sortie : documents, pages (ordre rétabli si besoin), blocs typés avec leur provenance
   (document, page, ligne, confiance), plan du cours et alertes de lecture.
   Ce que ce moteur ne fait PAS seul : lire un schéma, un graphique ou une écriture manuscrite dans une image.
   Pour cela il faut un modèle de vision : voir NM.promptVision / NM.lireVision (fournisseur au choix). */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur;
  const {U, STATUT, words, norm, hid} = NM;

  const R_REPERE = /^\s*[—–-]{1,3}\s*(page|photo|diapo|diapositive|feuille)\s+(\d+)\s*[—–-]{0,3}\s*$/i;
  const R_NUMPAGE = [/^\s*(?:page|p\.)\s*(\d{1,3})\s*(?:\/\s*\d{1,3})?\s*$/i, /^\s*[-–—]\s*(\d{1,3})\s*[-–—]\s*$/, /^\s*(\d{1,3})\s*\/\s*\d{1,3}\s*$/];
  const R_PUCE = /^\s*(?:[-•*–▪◦➢►]|\d{1,2}[.)]|[a-h][.)])\s+/;
  const R_LEGENDE = U(/^\s*(figure|fig\.|schéma|document|doc\.|source\s*:|légende|graphique|tableau\s+\d|carte\s+\d|photo\s+\d)\b/i);
  const R_FLECHE = /\s*(→|->|=>|⇒|⟶|➜|➔)\s*/;
  const R_MATH = U(/[=≈≠≤≥±√∑∫∆Δπ∞×÷^]|\b\d+\s*[x×*\/+\-−]\s*\d+\b|\p{Lu}\p{Ll}?\d+\s*[+→]/u);

  function niveauTitre(l) {
    const t = l.trim(), n = t.split(/\s+/).length;
    if (/^#{1,6}\s/.test(t)) return Math.min(3, t.match(/^#+/)[0].length);
    if (t.length < 3 || n > 14 || R_PUCE.test(t) && !/^\d{1,2}[.)]\s+\p{Lu}/u.test(t) || /[.;,]$/.test(t)) return 0;
    if (U(/^(chapitre|partie|section|titre|leçon|thème|séquence|module|unité)\b/i).test(t) || /^[IVX]{1,5}\s?[.)\-–]\s/.test(t)) return 1;
    if (/^(\d+(\.\d+)*|[A-H])\s?[.)\-–]\s+\p{Lu}/u.test(t) && n <= 12 && !/[.!?;]$/.test(t)) return (t.match(/^\d+(\.\d+)+/) ? 3 : 2);
    if (/^\*\*[^*]+\*\*$/.test(t) && n <= 10) return 2;
    if (n <= 9 && !/[.!?;,:]$/.test(t) && /^\p{Lu}/u.test(t) && !/\s:\s/.test(t) && !/[=≈≠≤≥±√∑∫∆π∞×÷^]/.test(t)) return t === t.toUpperCase() && /\p{L}{3}/u.test(t) ? 1 : 2;
    return 0;
  }

  // Mise en évidence typographique : **gras**, __souligné__, ==surligné==, MOTS EN CAPITALES, « À retenir ».
  function evidences(texte) {
    const out = [];
    texte.replace(/\*\*([^*]+)\*\*|__([^_]+)__|==([^=]+)==/g, (m, a, b, c) => { out.push({texte: a || b || c, type: a ? "gras" : b ? "souligne" : "surligne"}); return m; });
    (texte.match(U(/\b\p{Lu}{2,}(?:\s+\p{Lu}{2,})*\b/gu)) || []).forEach(m => { if (m.length >= 2 && texte !== texte.toUpperCase()) out.push({texte: m, type: "capitales"}); });
    if (U(/^(à retenir|important|attention|essentiel|à savoir|définition)\b/i).test(texte.trim())) out.push({texte: texte.trim(), type: "encadre"});
    return out;
  }
  const sansMarques = t => t.replace(/\*\*([^*]+)\*\*|__([^_]+)__|==([^=]+)==/g, (m, a, b, c) => a || b || c).replace(/^#{1,6}\s+/, "");

  // Qualité de lecture d'une ligne : part des « mots » qui ressemblent à une erreur d'OCR.
  function qualite(texte) {
    const ws = words(texte); if (!ws.length) return {conf: 1, suspects: []};
    const suspects = ws.filter(w => {
      if (/^(\p{Lu}\p{Ll}?\d{0,3}){1,8}[+\-]?$/u.test(w) || /^(m|km|cm|mm|dm)[23]$/.test(w) || /^\p{L}{1,3}\d{1,2}$/u.test(w)) return false;  // CO2, H2O, C6H12O6, m2, x2
      const c = norm(w);
      if (/^\d+([.,]\d+)?$/.test(c) || /^[ivxlcdm]+$/.test(c)) return false;
      if (/\d/.test(c) && /\p{L}/u.test(c) && !/^\d+(e|er|ere|eme|nd|nde|°)$/.test(c) && !/^[a-z]{1,3}\d{1,3}$/.test(c)) return true;  // l3s, c0urs
      if (c.length >= 5 && !/[aeiouy]/.test(c)) return true;                                                                 // rnnrtt
      if (/(.)\1\1/.test(c) && !/^(\.)+$/.test(c)) return true;                                                               // aaa
      return false;
    });
    const bizarres = (texte.match(/[|~^{}<>¤§¦¬]|[^\s\p{L}\p{N}.,;:!?'’"«»()\[\]\-–—\/%€$=+*×÷≤≥≈≠±√∑∫∆πΔ°&@#→⇒⟶➜➔•▪◦➢►…_]/gu) || []).length;
    const r = (suspects.length + bizarres * 0.5) / ws.length;
    return {conf: Math.max(0, 1 - r * 1.6), suspects};
  }

  // Tableaux : lignes avec « | », tabulations, ou au moins 3 colonnes séparées par 2 espaces, de même largeur.
  function cellules(l) {
    if (l.includes("|")) return l.replace(/^\s*\||\|\s*$/g, "").split("|").map(c => c.trim());
    if (l.includes("\t")) return l.split("\t").map(c => c.trim()).filter(Boolean);
    const c = l.trim().split(/\s{2,}/); return c.length >= 3 ? c : null;
  }
  const debutTableau = (L, i) => { const c = cellules(L[i]); return !!(c && c.length >= 2 && L[i + 1] != null && (cellules(L[i + 1]) || estSeparateur(L[i + 1]))); };
  function estFormule(txt) {
    if (!R_MATH.test(txt)) return false;
    const r = (txt.match(/[=≈≠≤≥±√∑∫∆Δπ×÷^+\-−*/\d()→]/g) || []).length / Math.max(1, txt.replace(/\s/g, "").length);
    return r > 0.3 || (/^[\p{L}\p{N}_ ()']{1,30}\s*[:=]/u.test(txt) && /=|→/.test(txt) && txt.length < 90);
  }
  const estSeparateur = l => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);

  // Découpe un texte en pages à partir des repères ; sans repère, une seule page.
  function decouperPages(texte) {
    const pages = []; let cur = {n: null, lignes: []};
    texte.replace(/\r/g, "").replace(/\f/g, "\n— page ? —\n").split("\n").forEach(l => {
      const m = l.match(R_REPERE);
      if (m || /^\s*—\s*page\s*\?\s*—\s*$/.test(l)) { if (cur.lignes.some(x => x.trim())) pages.push(cur); cur = {n: m ? Number(m[2]) : null, genre: m ? m[1].toLowerCase() : "page", lignes: []}; }
      else cur.lignes.push(l);
    });
    if (cur.lignes.some(x => x.trim()) || !pages.length) pages.push(cur);
    pages.forEach((p, i) => { if (p.n == null) p.n = i + 1; });
    return pages;
  }

  // Ordre des pages : si chaque page porte un numéro imprimé (« page 3 », « - 3 - », « 3/10 »)
  // et que ces numéros ne suivent pas l'ordre d'import, on remet les pages dans l'ordre imprimé.
  function ordonnerPages(pages, alertes) {
    const nums = pages.map(p => { const bords = [p.lignes.find(l => l.trim()), [...p.lignes].reverse().find(l => l.trim())];
      for (const l of bords) for (const r of R_NUMPAGE) { const m = l && l.match(r); if (m) return Number(m[1]); } return null; });
    pages.forEach((p, i) => { p.numImprime = nums[i]; });
    if (pages.length > 1 && nums.every(x => x != null) && new Set(nums).size === nums.length && nums.some((x, i) => i && x < nums[i - 1])) {
      pages.sort((a, b) => a.numImprime - b.numImprime);
      alertes.push({type: "ordre", statut: STATUT.INFERE, message: "Les pages n'étaient pas dans l'ordre. Je les ai rangées selon leurs numéros : " + pages.map(p => p.numImprime).join(", ") + "."});
    }
    return pages;
  }

  function structurer(sources, opts = {}) {
    if (typeof sources === "string") sources = [{nom: "Cours", type: "texte", texte: sources}];
    const documents = [], pages = [], blocs = [], alertes = [];
    sources.forEach((src, di) => {
      const doc = {id: "d" + (di + 1), nom: src.nom || "Document " + (di + 1), type: src.type || "texte", confSource: src.conf != null ? src.conf : (src.type === "photo" ? 0.85 : 1)};
      documents.push(doc);
      const pgs = ordonnerPages(decouperPages(String(src.texte || "")), alertes);
      pgs.forEach((pg, pi) => {
        const page = {doc: doc.id, n: pg.n, ordre: pi + 1, genre: pg.genre || "page", numImprime: pg.numImprime, nbBlocs: 0};
        pages.push(page);
        const L = pg.lignes; let i = 0;
        const pousser = b => { b.id = "b" + (blocs.length + 1); b.doc = doc.id; b.page = page.n; b.ordrePage = page.ordre;
          const q = qualite(b.kind === "tableau" ? b.texte.replace(/\|/g, " ") : b.texte); b.conf = Math.round(Math.min(q.conf, 1) * doc.confSource * 100) / 100;
          b.statut = b.conf < 0.6 ? STATUT.INCERTAIN : STATUT.CONFIRME;
          if (q.suspects.length && b.conf < 0.8) b.alertes = ["lecture douteuse : " + q.suspects.slice(0, 4).join(", ")];
          blocs.push(b); page.nbBlocs++; };
        while (i < L.length) {
          const brut = L[i], l = brut.trim();
          if (!l || R_NUMPAGE.some(r => r.test(l))) { i++; continue; }
          // tableau
          if (debutTableau(L, i)) {
            const rows = [], debut = i;
            while (i < L.length && L[i].trim() && (estSeparateur(L[i]) || (cellules(L[i]) || []).length >= 2)) { if (!estSeparateur(L[i])) rows.push(cellules(L[i]).map(sansMarques)); i++; }
            const w = Math.max(...rows.map(r => r.length));
            pousser({kind: "tableau", ligne: debut + 1, entetes: rows[0], lignes: rows.slice(1).map(r => r.concat(Array(w - r.length).fill(""))), texte: rows.map(r => r.join(" | ")).join("\n"), evid: []});
            continue;
          }
          // « 1. La phase… » suivi de « 2. … » : c'est une liste numérotée, pas un titre.
          const suiteNum = () => { const m = l.match(/^(\d{1,2})[.)]\s/), nx = L.slice(i + 1).find(x => x.trim()); return m && nx && new RegExp("^\\s*" + (Number(m[1]) + 1) + "[.)]\\s").test(nx); };
          const nt = suiteNum() ? 0 : niveauTitre(l);
          if (nt) { pousser({kind: "titre", niveau: nt, ligne: i + 1, texte: sansMarques(l).replace(/[\s:]+$/, ""), evid: evidences(l)}); i++; continue; }
          if (R_LEGENDE.test(l)) { pousser({kind: "legende", ligne: i + 1, texte: sansMarques(l), evid: []}); i++; continue; }
          if (R_PUCE.test(l)) {
            const items = [], debut = i, sorte = l => /^\s*\d/.test(l) ? "num" : /^\s*[a-h][.)]/.test(l) ? "lettre" : "puce";
            while (i < L.length && R_PUCE.test(L[i]) && sorte(L[i]) === sorte(L[debut]) && !(sorte(L[i]) === "num" && i > debut && niveauTitre(L[i].trim()) && !/^\s*\d/.test(L[i - 1]))) { let it = L[i].replace(R_PUCE, "").trim(); i++;
              while (i < L.length && L[i].trim() && !R_PUCE.test(L[i]) && /^\s{2,}/.test(L[i]) ) { it += " " + L[i].trim(); i++; }
              items.push(it); }
            const ord = /^\s*\d/.test(L[debut]);
            pousser({kind: "liste", ordonnee: ord, ligne: debut + 1, items: items.map(sansMarques), texte: items.map(sansMarques).join("\n"), evid: items.flatMap(evidences)});
            continue;
          }
          // paragraphe : lignes jusqu'à une ligne vide, un titre, une puce ou un tableau
          const debut = i, buf = [];
          // Une ligne très mal lue (photo floue) forme son propre bloc : sa mauvaise note ne se mélange pas aux lignes saines.
          const malLue = k => qualite(L[k]).conf < 0.6;
          const coupe = k => niveauTitre(L[k]) || R_PUCE.test(L[k]) || R_LEGENDE.test(L[k].trim()) || debutTableau(L, k) || estFormule(L[k].trim()) || malLue(k) || malLue(k - 1);
          if (estFormule(l)) { buf.push(l); i++; }
          else while (i < L.length && L[i].trim() && !(buf.length && coupe(i))) { buf.push(L[i].trim()); i++; }
          let txt = buf.join(" ").replace(/(\p{L})-\s+(\p{Ll})/gu, "$1$2");   // mots coupés en fin de ligne
          const kind = estFormule(txt) ? "formule" : "para";
          const b = {kind, ligne: debut + 1, texte: sansMarques(txt), evid: evidences(txt)};
          if (R_FLECHE.test(txt)) {      // flèches : A → B → C
            const parts = txt.split(/\s*(?:→|->|=>|⇒|⟶|➜|➔)\s*/).map(s => sansMarques(s).replace(/[.;]$/, "").trim()).filter(Boolean);
            if (parts.length >= 2 && parts.every(p => p.split(/\s+/).length <= 12)) b.fleches = parts;
          }
          pousser(b);
        }
        if (!page.nbBlocs) alertes.push({type: "page-vide", statut: STATUT.INCERTAIN, message: `${page.genre} ${page.n} : rien n'a pu être lu (page vide ou trop floue ?).`});
      });
    });
    // Document incomplet : dernier paragraphe coupé.
    const dernier = [...blocs].reverse().find(b => b.kind === "para");
    if (dernier && !/[.!?…:»)"\]]$/.test(dernier.texte) && dernier.texte.split(/\s+/).length > 6)
      alertes.push({type: "incomplet", statut: STATUT.INCERTAIN, bloc: dernier.id, message: "Le cours semble coupé à la fin (dernière phrase sans point). Il manque peut-être une page."});
    const douteux = blocs.filter(b => b.statut === STATUT.INCERTAIN);
    if (douteux.length) alertes.push({type: "lecture", statut: STATUT.INCERTAIN, blocs: douteux.map(b => b.id), message: `${douteux.length} passage${douteux.length > 1 ? "s" : ""} mal lu${douteux.length > 1 ? "s" : ""} : vérifie-les. Notéa ne pose pas de question dessus.`});
    // Plan : arbre des titres.
    const plan = [], pile = [];
    blocs.forEach(b => { if (b.kind !== "titre") return; const noeud = {bloc: b.id, titre: b.texte, niveau: b.niveau, enfants: []};
      while (pile.length && pile[pile.length - 1].niveau >= b.niveau) pile.pop();
      (pile.length ? pile[pile.length - 1].enfants : plan).push(noeud); pile.push(noeud); });
    // Section de chaque bloc (titre le plus proche au-dessus) et chemin dans le plan.
    let chemin = [];
    blocs.forEach(b => { if (b.kind === "titre") { chemin = chemin.filter(t => t.niveau < b.niveau).concat({niveau: b.niveau, titre: b.texte, id: b.id}); }
      b.section = chemin.length ? chemin[chemin.length - 1].id : null; b.chemin = chemin.map(t => t.titre); });
    return {id: hid(sources.map(s => s.texte).join("\n")), documents, pages, blocs, plan, alertes};
  }

  /* Lecture d'images par un modèle de vision (schémas, graphiques, manuscrit).
     Le moteur ne dépend d'aucun fournisseur : on lui passe une fonction appelerModele({systeme, contenu, schema}) → JSON.
     Le résultat est validé, puis traité comme une source « photo » avec la confiance renvoyée par le modèle. */
  const SCHEMA_VISION = {type: "object", required: ["pages"], properties: {pages: {type: "array", items: {type: "object", required: ["texte"], properties: {
    numero: {type: "integer"}, texte: {type: "string"}, manuscrit: {type: "boolean"}, confiance: {type: "number"},
    elements: {type: "array", items: {type: "object", required: ["type"], properties: {type: {enum: ["schema", "graphique", "tableau", "formule", "fleche", "legende"]}, description: {type: "string"}, liens: {type: "array", items: {type: "array", items: {type: "string"}}}}}}}}}}};
  const promptVision = () => ({
    systeme: "Tu transcris fidèlement des pages de cours photographiées. Recopie le texte exact, dans l'ordre de lecture, sans rien ajouter ni corriger. " +
      "Garde les titres sur leur propre ligne, les listes avec « - », les tableaux avec « | », les formules telles quelles, le gras entre ** **. " +
      "Pour un schéma ou une flèche, écris les liens sous la forme « A → B ». Si un passage est illisible, écris [illisible]. " +
      "Donne pour chaque page une confiance entre 0 et 1. Réponds seulement en JSON selon le schéma.",
    schema: SCHEMA_VISION});
  function validerVision(r) {
    if (!r || !Array.isArray(r.pages)) throw new Error("réponse de vision invalide");
    return r.pages.map((p, i) => ({n: Number.isInteger(p.numero) ? p.numero : i + 1, texte: String(p.texte || ""), conf: typeof p.confiance === "number" ? Math.max(0, Math.min(1, p.confiance)) : 0.7,
      liens: (p.elements || []).flatMap(e => (e.liens || []).filter(l => Array.isArray(l) && l.length === 2).map(l => l.map(String).join(" → ")))}));
  }
  async function lireVision(images, appelerModele, nom = "Photo") {
    const p = promptVision(), r = validerVision(await appelerModele({systeme: p.systeme, images, schema: p.schema}));
    const conf = r.reduce((s, x) => s + x.conf, 0) / Math.max(1, r.length);
    return {nom, type: "photo", conf, texte: r.map(x => `— page ${x.n} —\n` + x.texte + (x.liens.length ? "\n" + x.liens.join("\n") : "")).join("\n")};
  }

  Object.assign(NM, {structurer, niveauTitre, evidences, qualite, decouperPages, promptVision, validerVision, lireVision, SCHEMA_VISION});
})(typeof window !== "undefined" ? window : globalThis);
