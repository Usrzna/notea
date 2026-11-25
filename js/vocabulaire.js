/* Notéa v2.5 : le vocabulaire du cours, pour un quiz « mot → définition » simple, partie par partie.
   Pas d'IA : on lit ce que le cours écrit déjà.
   - tableaux « Terme | Définition » (ou « Question | Réponse », « Notion | Ce que c'est »…)
   - lignes « **Mot** : définition », « - Mot : définition », « Mot = définition »
   Chaque mot garde sa partie (le dernier grand titre au-dessus). */
var NoteaVocab = (function () {
  const sp = s => String(s || "").replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim();
  const norm = s => sp(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Titres qui ne sont pas des parties (sous-titres de rubrique)
  const RUBRIQUE = /^(d[ée]finitions?( à apprendre)?|explications?|exemples?|à retenir|a retenir|à savoir|question probable|questions? probables?|à ne pas confondre|attention|remarques?|nb|méthode|résumé|vocabulaire|les questions probables)/i;
  // Débuts de ligne qui ne sont pas des mots à définir
  const PAS_UN_MOT = /^(exemples?|ex|attention|remarques?|nb|n\.b\.|question|questions|réponse|source|chapitre|thème|partie|but|objectif|explication|à retenir|a retenir|à savoir|sanction|conclusion|introduction|rappel|astuce|piège|méthode|étape|cause|conséquence|date|lien|voir|page|semestre)$/i;
  const COL_MOT = /^(termes?|mots?|notions?|concepts?|vocabulaire|expressions?|questions?( probables?)?|nom|type|catégorie|sigle|acteur|rôle|élément)$/i;
  const COL_DEF = /^(définitions?|sens|signification|ce que c['’]est|ce que ça veut dire|réponses?( courtes?)?|explications?|rôle|description|à retenir)$/i;

  function estTitre(l) {
    const t = l.trim(); if (!t || t.startsWith("|")) return null;
    let m = t.match(/^#{1,6}\s+(.+)$/); if (m) return sp(m[1]);
    m = t.match(/^\*\*(.{3,90})\*\*\s*:?\s*$/); if (m && !RUBRIQUE.test(sp(m[1]))) return sp(m[1]);
    m = t.match(/^((?:[IVX]+|\d+|[A-H])[.)]\s+.{3,80}|(?:Chapitre|Thème|Partie|Section)\s+\S+.{0,80})$/i); if (m && !/[.;]$/.test(t) && t.split(/\s+/).length <= 14) return sp(m[1]);
    return null;
  }
  // Débuts de ligne qui annoncent une rubrique, pas un mot (« Question probable : … », « À retenir : … »)
  const RUBRIQUE_DEBUT = /^(questions?\b|à retenir|a retenir|à savoir|à ne pas confondre|définitions?\b|exemples?\b|attention|remarques?|rappel|astuce|piège)/i;
  const bonMot = m => { const w = m.split(/\s+/).length; return m.length >= 2 && m.length <= 70 && w <= 8 && !PAS_UN_MOT.test(m) && !RUBRIQUE_DEBUT.test(m) && !/^\d+([.,]\d+)?$/.test(m); };
  const bonneDef = (d, qa) => d.length >= 6 && d.split(/\s+/).length >= 2 && (qa || !/\?\s*$/.test(d));   // une question n'est pas une définition

  function extraire(texte) {
    const out = [], vus = new Set(); let partie = "", tete = null;
    const ajoute = (mot, def, qa) => { mot = sp(mot).replace(/[:\s]+$/, ""); def = sp(def).replace(/^[:=–—-]\s*/, "");
      if (!bonMot(mot) && !qa) return; if (!bonneDef(def, qa) || norm(mot) === norm(def)) return;
      const k = norm(mot); if (vus.has(k)) return; vus.add(k); out.push({mot, def, partie, qa: !!qa}); };
    String(texte || "").split(/\r?\n/).forEach(ligne => {
      const l = ligne.trim();
      if (l.startsWith("|")) {   // une ligne de tableau
        const cells = l.replace(/^\||\|$/g, "").split("|").map(sp);
        if (!tete) { tete = cells; return; }   // 1re ligne = en-têtes
        if (cells.every(c => /^:?-{2,}:?$/.test(c))) return;   // ligne de séparation markdown
        const iM = tete.findIndex(c => COL_MOT.test(c)), iD = tete.findIndex((c, i) => i !== iM && COL_DEF.test(c));
        if (iM >= 0 && iD >= 0 && cells[iM] && cells[iD]) ajoute(cells[iM], cells[iD], /^questions?/i.test(tete[iM]));
        else if (tete.length === 2 && cells.length === 2 && COL_DEF.test(tete[1])) ajoute(cells[0], cells[1]);
        return;
      }
      tete = null;
      const t = estTitre(l); if (t) { partie = t; return; }
      let m = l.match(/^[-•*–]?\s*\*\*([^*]{2,70})\*\*\s*[:=]\s*(.+)$/);   // **Mot** : définition
      if (m) return ajoute(m[1], m[2]);
      m = l.match(/^[-•*–]\s*([^:=]{2,60}?)\s*[:=]\s*(.{6,})$/);           // - Mot : définition
      if (m) return ajoute(m[1], m[2]);
      m = l.match(/^([A-ZÀ-Ý][^:=.!?]{1,50}?)\s*(?::|=)\s*(.{10,})$/);       // Mot : définition (ligne seule)
      if (m && !/\s(est|sont|a|ont)\s/.test(m[1])) return ajoute(m[1], m[2]);
    });
    return out;
  }

  // Cacher le mot dans sa définition (sinon la réponse se voit).
  function masquer(def, mot) {
    let d = def; const mots = sp(mot).split(/\s+/).filter(w => w.length >= 4);
    [sp(mot), ...mots].forEach(w => { const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"); d = d.replace(re, "…"); });
    return d;
  }
  const melange = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* Les questions d'un quiz : chaque mot une fois, dans un sens ou dans l'autre. Les mauvais choix viennent de la même partie. */
  function questions(liste, tous, sens) {
    tous = tous || liste;
    return liste.map((v, i) => {
      const voisins = melange(tous.filter(x => x !== v && x.qa === v.qa && (x.partie === v.partie || tous.filter(y => y.partie === v.partie).length < 4)));
      const autres = (voisins.length >= 3 ? voisins : melange(tous.filter(x => x !== v))).slice(0, 3);
      const versMot = !v.qa && (sens === "mot" || (sens !== "def" && i % 2 === 1));
      if (versMot) return {v, sens: "mot", texte: "Quel mot correspond à cette définition ?", citation: masquer(v.def, v.mot), bonne: v.mot,
        mauvaises: autres.map(x => ({a: x.mot, pourquoi: `« ${x.mot} », c'est : ${x.def}`}))};
      return {v, sens: "def", texte: v.qa ? v.mot.replace(/\s*\?*$/, " ?") : `Que veut dire « ${v.mot} » ?`, citation: "", bonne: v.def,
        mauvaises: autres.map(x => ({a: x.def, pourquoi: v.qa ? "" : `Ça, c'est « ${x.mot} ».`}))};
    });
  }
  // Les parties, dans l'ordre du cours, avec leur nombre de mots.
  function parties(liste) { const m = new Map(); liste.forEach(v => m.set(v.partie || "Début du cours", (m.get(v.partie || "Début du cours") || 0) + 1)); return [...m.entries()]; }

  return {extraire, questions, parties, masquer};
})();
if (typeof module !== "undefined") module.exports = NoteaVocab;
