/* Notéa — moteur de compréhension pédagogique.
   00 · Outils communs : texte, racines, similarité, statuts.
   Chaque fichier ajoute ses fonctions à l'espace NoteaMoteur (navigateur : window, Node : globalThis).
   Aucune dépendance. Tout est déterministe : même cours en entrée, même résultat. */
(function (root) {
  "use strict";
  const NM = root.NoteaMoteur = root.NoteaMoteur || {};

  // Statut de chaque information (exigence de fiabilité) :
  //  confirme  = écrit tel quel dans le cours (motif explicite) ;
  //  infere    = déduit par un calcul à partir du cours (cooccurrence, dépendance de définition) ;
  //  incertain = indice faible, ou lecture douteuse (OCR) : on ne génère pas de question dessus.
  const STATUT = {CONFIRME: "confirme", INFERE: "infere", INCERTAIN: "incertain"};

  const STOP = new Set(String("le la les un une des du de d l au aux et ou en est sont a à ce cet cette ces qui que quoi dont où " +
    "il elle ils elles on se sa son ses leur leurs lui y ne pas plus par pour sur dans avec sans sous entre vers chez " +
    "mais donc or ni car si comme être avoir fait faire été ont avait sont peut peuvent doit doivent tout tous toute toutes " +
    "même mêmes aussi très bien ainsi alors lorsque quand c qu s n j m t nous vous je tu me te notre votre nos vos " +
    "cela ceci celui celle ceux celles deux trois autre autres chaque certains certaines plusieurs non oui puis après avant " +
    "était étaient sera seront soit sont ici là encore déjà toujours jamais souvent parfois selon via afin").split(/\s+/).map(w => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  // Mots trop généraux pour être une notion du cours.
  const GENERIQUES = new Set(String("exemple exemples définition définitions chapitre partie section cours leçon notion notions " +
    "chose choses fait faits manière façon cas type types forme formes ensemble élément éléments question questions " +
    "réponse retenir important essentiel attention rappel objectif objectifs page figure document schéma tableau " +
    "premier première second seconde dernier dernière nombre point points terme termes mot mots idée idées " +
    "expliquer expliquez citer citez montrer montrez justifier justifiez décrire décrivez comparer comparez " +
    "permet permettent consiste désigne désignent signifie correspond représente appelle appelée appelé " +
    "grand grande petit petite nouveau nouvelle général générale particulier particulière principal principale " +
    "étape étapes facteur facteurs cause causes conséquence conséquences fin début introduction conclusion origine origines caractéristique caractéristiques " +
    "présentation généralités bilan synthèse résumé méthode méthodes application applications rappels prérequis objectif remarque remarques " +
    "hausse baisse augmentation diminution forte fort faible").split(/\s+/).map(w => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));

  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'");
  // Racine simple pour le français : regroupe pluriels et dérivés courants (propriétaire/propriétaires).
  function stem(w) {
    w = norm(w).replace(/^(l|d|qu|n|s|c|j|m|t)'/, "");
    if (w.length <= 3) return w;
    w = w.replace(/(aux)$/, "al").replace(/(s|x)$/, "");
    if (w.length > 6) w = w.replace(/(issement|ements|ement|ations|ation|ateurs|ateur|atrices|atrice|ités|ité|ismes|isme|istes|iste|euses|euse|eurs|eur|ives|ive|ifs|if|ables|able|iques|ique|ments|ment)$/, "");
    if (w.length > 5) w = w.replace(/(ées|ée|és|é|es|e)$/, "");
    return w;
  }
  const words = s => (String(s || "").match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) || []);
  const clean = w => norm(w).replace(/^(l|d|qu|n|s|c|j|m|t)'/, "").replace(/^-+|-+$/g, "");
  const isContent = w => { const c = clean(w); return c.length >= 3 && !STOP.has(c) && !/^\d+$/.test(c); };
  const contentStems = s => words(s).filter(isContent).map(stem);
  // Distance d'édition bornée (pour les mots proches et les confusions entre notions).
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let prev = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size && !B.size) return 0; let n = 0; A.forEach(x => { if (B.has(x)) n++; }); return n / (A.size + B.size - n); };
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const round = (x, d = 2) => Math.round(x * Math.pow(10, d)) / Math.pow(10, d);
  // Identifiant stable tiré du texte : le même cours donne les mêmes identifiants (FNV-1a).
  function hid(s) { let h = 0x811c9dc5; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
  // Normalisation min-max d'une liste de valeurs (0 si toutes égales).
  function minmax(vals) { const lo = Math.min(...vals), hi = Math.max(...vals); return vals.map(v => hi > lo ? (v - lo) / (hi - lo) : (hi > 0 ? 1 : 0)); }
  // Découpe en phrases sans casser « M. Dupont », « art. 544 », « 3,5 », « etc. ».
  function sentences(par) {
    const safe = par.replace(/\b(M|Mme|Mlle|Dr|art|Art|cf|etc|ex|p|vol|n°|av|J\.-C|apr)\./g, "$1․");
    return (safe.match(/[^.!?…]+(?:[.!?…]+["»”)]*|$)/g) || [safe]).map(s => s.replace(/․/g, ".").trim()).filter(s => s.length > 1);
  }

  // \b de JavaScript ignore les lettres accentuées (« à », « é ») : U() remplace \b par une frontière Unicode.
  const BND = "(?:(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}])|(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}]))";
  const U = r => new RegExp(r.source.replace(/\\b/g, BND), r.flags.includes("u") ? r.flags : r.flags + "u");
  // Verbes conjugués fréquents dans les cours : ils coupent un groupe nominal (« l'entreprise possède »).
  const VERBES = new Set(String("a ont est sont était étaient sera fut possède possèdent produit produisent reste restent joue jouent concentre concentrent permet permettent rend rendent " +
    "présente présentent apporte apportent laisse laissent fait font met mettent prend prennent donne donnent utilise utilisent capte captent absorbe absorbent consomme consomment " +
    "conserve conservent exerce exercent loue louent contient contiennent comprend comprennent regroupe regroupent forme forment devient deviennent existe existent dépend dépendent " +
    "change changent augmente augmentent diminue diminuent varie varient touche touchent signe signé met mène mènent crée créent fabrique fabriquent transforme transforment " +
    "assure assurent garantit garantissent protège protègent impose imposent oblige obligent interdit interdisent autorise autorisent repose reposent dure durent " +
    "se déroule déroulent agit agissent sert servent vient viennent part partent arrive arrivent passe passent devient reçoit reçoivent envoie envoient " +
    "montre montrent indique indiquent représente représentent définit définissent désigne désignent signifie signifient correspond correspondent consiste consistent " +
    "rapproche rapprochent attribue attribuent exprime exprime expriment mesure mesurent calcule calculent explique expliquent illustre illustrent provoque provoquent " +
    "entraîne entraînent favorise favorisent limite limitent réduit réduisent accroît accroissent influence influencent détermine déterminent").split(/\s+/).map(w => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  const gen = c => GENERIQUES.has(c) || GENERIQUES.has(c.replace(/[sx]$/, ""));   // pluriels compris
  Object.assign(NM, {gen, VERBES, U, STATUT, STOP, GENERIQUES, norm, stem, words, clean, isContent, contentStems, lev, jaccard, clamp01, round, hid, minmax, sentences});
})(typeof window !== "undefined" ? window : globalThis);
