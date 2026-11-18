/* Notéa — le moteur. Tout reste sur l'appareil de l'élève (localStorage). */
(() => {
const $ = id => document.getElementById(id);
const DAY = 864e5, KEY = "notea-v1";
const STOP = new Set("le la les un une des du de d l au aux et ou en est sont a à ce cette ces qui que quoi dont où se sa son ses leur leurs il elle ils elles on nous vous je tu pour par sur dans avec sans pas plus mais donc car ne y c s n qu lui être avoir fait faire comme tout tous très aussi".split(" "));

/* ---------- Données ---------- */
let db = {notions: [], exam: "", minutes: 10, day: "", newToday: 0, mats: {}, hz: "moyen", acts: [], win: {wk: ["17:00", "21:00"], we: ["10:00", "18:00"]}};
try { const o = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem("alto-apprendre-v1") || "null"); if (o) db = Object.assign(db, o); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
const today = () => new Date().toISOString().slice(0, 10);
if (db.day !== today()) { db.day = today(); db.newToday = 0; save(); }
const uid = () => Math.random().toString(36).slice(2, 10);
const tokens = text => text.split(/(\s+)/);                  // mots et espaces, dans l'ordre
const clean = w => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/^(l|d|qu|n|s|c|j)['’]/, "");
const VERBS = new Set(["est", "sont", "désigne", "désignent", "signifie", "correspond", "consiste", "représente", "définit"]);
function autoHoles(text, kwl) {
  const t = tokens(text), cand = [];
  const v = t.findIndex((w, i) => i > 0 && i < 20 && VERBS.has(clean(w)));
  if (v > 0) {                                     // « L'usus est le droit… » : on cache « usus »
    const term = []; for (let i = 0; i < v; i++) { const c = clean(t[i]); if (c.length >= 3 && !STOP.has(c)) term.push(i); }
    if (term.length >= 1 && term.length <= 3) return term;
  }
  t.forEach((w, i) => { const c = clean(w); if (c.length < 4 || STOP.has(c)) return;
    const lv = kwl ? (kwl.get(stem(norm(c))) || 0) : 0;        // un mot clé important du cours passe en premier
    if (i > 0 && c.length >= 5 || lv >= 1) cand.push([lv * 100 + c.length, i]); });
  cand.sort((a, b) => b[0] - a[0]);
  const n = text.split(/\s+/).length > 14 ? 2 : 1;
  return cand.slice(0, n).map(x => x[1]).sort((a, b) => a - b);
}
const START_D = {imp: 5, dif: 6.5, q: 6.5, rate: 7, manuel: 5};
function makeNotion(text, mark, src, kwl, role) {
  const n = {id: uid(), text: text.trim(), holes: autoHoles(text, kwl), mark: mark || "manuel", src: src || "", D: START_D[mark] || 5,
    S: 0, due: 0, last: 0, reps: 0, lapses: 0, created: Date.now()};
  if (role && role !== "info") n.role = role;
  return n;
}

/* ---------- L'algorithme de révision : FSRS-5 (celui d'Anki), avec ses réglages par défaut ----------
   Chaque notion a 3 valeurs :
     S = stabilité : le nombre de jours pour que la chance de s'en souvenir tombe à 90 % ;
     D = difficulté, de 1 à 10 ;
     R = chance de s'en souvenir maintenant : R = (1 + 19/81 × jours / S)^-0,5.
   La notion revient quand R descend au niveau visé : 90 % (85 % pour le très long terme, 95 % la semaine de l'examen).
   Se souvenir quand on était près d'oublier renforce plus le souvenir : c'est pour ça qu'on attend le bon moment.
   3 boutons au lieu de 4 : Raté = « Again », Avec effort = « Good », Facile = « Easy ».
   Choix de Notéa : « Facile » est plus prudent que dans Anki (5 jours la première fois, bonus de 1,6 au lieu de 3),
   car on se croit souvent plus sûr de soi qu'on ne l'est. Et jamais plus de 6 mois sans revoir une notion (1 an en très long terme).
   Un quiz réussi compte « Hard » : reconnaître une réponse est plus facile que la retrouver. */
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5, FACTOR = 19 / 81, EASY0 = 5, EASY_BONUS = 1.6;
const FG = {1: 1, 2: 3, 3: 4, h: 2};                 // nos boutons → les notes de FSRS
const MARK_D = {dif: 1, q: 1, rate: 1.5};            // un passage marqué « Difficile » part avec plus de difficulté
const clampD = d => Math.min(10, Math.max(1, d));
const D0 = g => W[4] - Math.exp(W[5] * (g - 1)) + 1;
const retrAt = (S, days) => Math.pow(1 + FACTOR * days / Math.max(S, 0.01), DECAY);
const retr = (n, now) => n.last ? retrAt(n.S, Math.max(0, now - n.last) / DAY) : 0;
const daysFor = (S, r) => S / FACTOR * (Math.pow(r, 1 / DECAY) - 1);
function examTime() { return db.exam ? Date.parse(db.exam + "T08:00:00") : 0; }

/* Chaque matière a : une échéance (quand avoir fini d'apprendre), un coefficient, un objectif (court, moyen, très long terme) */
const matOf = n => n.mat || (n.src ? n.src.split(" · ")[0] : "") || "Sans matière";
const matInfo = m => Object.assign({coef: 1, due: "", hz: db.hz || "moyen"}, db.mats[m] || {});
const dueTime = m => { const d = matInfo(m).due || db.exam; return d ? Date.parse(d + "T08:00:00") : 0; };
const finished = (n, now) => { const m = matOf(n), ex = dueTime(m); return matInfo(m).hz === "court" && ex && now > ex + DAY / 2; };   // court terme : après l'examen, on arrête
const urgency = (m, now) => { const ex = dueTime(m); if (!ex || ex < now) return 1; return 1 + 3 / (1 + (ex - now) / DAY); };
const weight = (m, now) => matInfo(m).coef * urgency(m, now);
const secFor = n => 10 + 3 * n.D;                  // une notion difficile prend plus de temps : de 13 à 40 secondes
function aim(n, now) {
  const m = matOf(n), hz = matInfo(m).hz, ex = dueTime(m);
  const base = hz === "long" ? 0.85 : 0.9;         // très long terme : révisions plus espacées, mais qui continuent
  if (!ex) return base; const d = (ex - now) / DAY; return d >= 0 && d <= 7 ? 0.95 : base;
}
function preview(n, g, now) {                 // ce que donnerait la réponse g, sans rien changer
  const c = Object.assign({}, n); schedule(c, g, now, true); return c;
}
function schedule(n, ui, now, dry) {
  const g = FG[ui] || 3;
  if (!n.last) {                                   // première fois
    n.S = g === 4 ? EASY0 : W[g - 1]; n.D = clampD(D0(g) + (MARK_D[n.mark] || 0));
  } else {
    const days = (now - n.last) / DAY, R = retrAt(n.S, days);
    if (g === 1) {                                 // oubli : le souvenir retombe, mais pas à zéro
      n.S = Math.max(0.1, Math.min(n.S, W[11] * Math.pow(n.D, -W[12]) * (Math.pow(n.S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)))); n.lapses = (n.lapses || 0) + 1;
    } else if (days < 0.5) {                       // revue le même jour : petit gain
      n.S = n.S * Math.exp(W[17] * (g - 3 + W[18]));
    } else {                                       // retrouvé : plus c'était près de l'oubli, plus le souvenir grandit
      n.S = n.S * (1 + Math.exp(W[8]) * (11 - n.D) * Math.pow(n.S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? EASY_BONUS : 1));
    }
    const d1 = n.D - W[6] * (g - 3) * (10 - n.D) / 9;
    n.D = clampD(W[7] * D0(4) + (1 - W[7]) * d1);
  }
  n.reps = (n.reps || 0) + 1; n.last = now;
  let days = g === 1 ? 0 : Math.min(matInfo(matOf(n)).hz === "long" ? 365 : 180, Math.max(1, Math.round(daysFor(n.S, aim(n, now)))));
  const ex = dueTime(matOf(n));
  if (ex && now < ex && now + days * DAY > ex - DAY / 2) days = Math.max(0.6, (ex - DAY - now) / DAY);   // revoir la veille du partiel
  n.due = g === 1 ? now : now + days * DAY;
  if (!dry) { db.log = db.log || []; db.log.push([now, g]); if (db.log.length > 3000) db.log.splice(0, db.log.length - 3000); }
}
const when = ms => { const d = (ms - Date.now()) / DAY;
  if (d < 0.02) return "tout de suite"; if (d < 1.5) return "demain"; if (d < 13.5) return `dans ${Math.round(d)} jours`;
  if (d < 60) return `dans ${Math.round(d / 7)} semaines`; return `dans ${Math.round(d / 30)} mois`; };

/* ---------- La révision du jour : ce qui s'oublie le plus, sans dépasser le temps choisi ---------- */
const NEW_MAX = 10;
/* Combien de nouvelles notions par jour pour une matière : assez pour tout avoir vu 2 jours avant l'échéance */
function newPerDay(m, now) {
  const fresh = db.notions.filter(n => !n.last && matOf(n) === m).length; if (!fresh) return 0;
  const ex = dueTime(m); if (!ex || ex < now) return Math.min(fresh, NEW_MAX);
  return Math.ceil(fresh / Math.max(1, (ex - now) / DAY - 2));
}
function newQuota(now) { let q = 0; new Set(db.notions.map(matOf)).forEach(m => { q += newPerDay(m, now); }); return Math.min(60, q); }   // une matière avec examen suit son plan ; les autres : 10 nouvelles par jour au plus
function todayQueue(now = Date.now()) {
  if (onVacation()) return [];
  const besoin = examBesoinAujourdhui(), budget = Math.max(60, (db.minutes || plannedToday()) * 60, besoin.min * 60), cap = dayCap();   // un examen approche : on prend le temps qu'il faut
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const live = db.notions.filter(n => !finished(n, now) && !n.off);
  // d'abord ce qui s'oublie le plus, dans les matières qui comptent le plus et dont l'examen approche
  const due = live.filter(n => n.last && n.due <= end.getTime()).sort((a, b) => (1 - retr(b, now)) * weight(matOf(b), now) - (1 - retr(a, now)) * weight(matOf(a), now));
  const fresh = live.filter(n => !n.last).sort((a, b) => weight(matOf(b), now) - weight(matOf(a), now) || (b.mark === "dif" || b.mark === "q") - (a.mark === "dif" || a.mark === "q") || a.created - b.created)
    .slice(0, Math.max(0, newQuota(now) - db.newToday));
  const out = []; let t = 0;
  for (const n of due.concat(fresh)) { if ((t + secFor(n) > budget && out.length >= 3) || out.length >= cap) break; out.push(n); t += secFor(n); }
  return mixMQ(interleave(out), now);
}
function renderToday() {
  const q = todayQueue(), n = q.length; homeStats(q); renderExamToday();
  $("bienvenue").hidden = !!db.notions.length; $("accueil").hidden = !db.notions.length && $("seance").hidden;
  const exs = [...new Set(db.notions.map(matOf))].map(m => [m, dueTime(m)]).filter(x => x[1] > Date.now()).sort((a, b) => a[1] - b[1]);
  if ($("tuile-plan")) $("tuile-plan").textContent = exs.length ? `Prochaine échéance : ${exs[0][0]}, ${when(exs[0][1])}.` : "Ajoute tes échéances et tes coefficients : le planning se fait tout seul.";
  $("vide").hidden = !!db.notions.length; $("jour-go").hidden = !db.notions.length;
  if (!db.notions.length) { $("jour-titre").textContent = "Rien à réviser pour l'instant"; $("jour-sous").textContent = "Importe un cours : une photo, un PDF, un Word, un PowerPoint ou un texte."; return; }
  if (onVacation()) { $("jour-titre").textContent = "Mode vacances"; $("jour-sous").textContent = "Repose-toi. Au retour, tes notions reviennent petit à petit, sans retard à rattraper d'un coup."; $("go").disabled = true; $("jour-suite").textContent = ""; return; }
  if (!n) { const next = Math.min(...db.notions.map(x => x.due || Infinity)); $("jour-titre").textContent = "Tout est à jour"; $("jour-sous").textContent = "Reviens " + when(next) + ". Ton cerveau a besoin de temps pour oublier un peu."; $("go").disabled = true; $("jour-suite").textContent = ""; return; }
  const min = Math.max(1, sessionMin(q));
  $("jour-titre").textContent = `${n} notion${n > 1 ? "s" : ""} · environ ${min} min`;
  $("jour-sous").textContent = "Arrête-toi quand tu veux. Ce que tu ne fais pas aujourd'hui revient demain.";
  $("jour-suite").textContent = exs.length ? `${exs[0][0]} : examen ${when(exs[0][1])}` : "";
  $("go").disabled = false;
}

/* ---------- Affichage d'une notion ---------- */
function holeHTML(n, show) {
  const t = tokens(n.text), set = new Set(n.holes);
  const box = document.createDocumentFragment();
  t.forEach((w, i) => {
    if (!set.has(i)) { box.append(w); return; }
    const m = w.match(/^([^\p{L}\p{N}]*(?:(?:[lLdDjJnNsScCmMtT]|[qQ]u)['’])?)(.*?)([^\p{L}\p{N}]*)$/u) || ["", "", w, ""];
    box.append(m[1]);
    const s = document.createElement("span");
    if (show) { s.className = "ans"; s.textContent = m[2]; }
    else { s.className = "hole"; s.textContent = m[2]; s.setAttribute("aria-label", "mot caché"); s.style.minWidth = Math.max(3, m[2].length * 0.55) + "em"; }
    box.append(s, m[3]);
  });
  return box;
}
const MARK = {imp: ["imp", "Important"], dif: ["dif", "Difficile"], q: ["q", "Question posée"], rate: ["rate", "Raté"], manuel: ["", "Ajoutée à la main"]};
function srcHTML(n) {
  const el = document.createDocumentFragment(); const [c, l] = MARK[n.mark] || MARK.manuel;
  const chip = document.createElement("span"); chip.className = "chip " + c; chip.textContent = l; el.append(chip);
  if (n.src) el.append(document.createTextNode(n.src));
  return el;
}

/* ---------- La séance ---------- */
let queue = [], idx = 0, done = 0, stats = {1: 0, 2: 0, 3: 0}, shown = false;
function startSession() {
  queue = todayQueue(); idx = 0; done = 0; stats = {1: 0, 2: 0, 3: 0}; snap = null; $("undo").hidden = true;
  if (!queue.length) return;
  $("accueil").hidden = true; $("tuiles").hidden = true; $("bilan").hidden = true; $("seance").hidden = false; showCard();
}
function showCard() {
  const n = queue[idx]; shown = false;
  $("pos").textContent = `${idx + 1} sur ${queue.length}`;
  $("prog").style.width = Math.round(idx / queue.length * 100) + "%";
  if (n.enonce) mqShow(n); else { $("q-src").replaceChildren(srcHTML(n)); $("q-text").replaceChildren(holeHTML(n, false)); }
  $("voir").hidden = false; $("noter").hidden = true; $("voir").focus(); cardExtras(n);
}
function reveal() {
  if (shown) return; shown = true; const n = queue[idx], now = Date.now();
  if (n.enonce) mqReveal(n); else $("q-text").replaceChildren(holeHTML(n, true));
  $("g2-when").firstChild.textContent = when(preview(n, 2, now).due) + " ";
  $("g3-when").firstChild.textContent = when(preview(n, 3, now).due) + " ";
  $("voir").hidden = true; $("noter").hidden = false; revealExtras(n);
}
function grade(g) {
  if (!shown) return; const n = queue[idx]; takeSnap(n);
  if (!n.last) { if (n.enonce) (db.mqNew = db.mqNew || {day: today(), n: 0}).n++; else db.newToday++; }
  schedule(n, g, Date.now()); if (n.enonce) { moteurNote(n, n._score != null ? n._score : g === 1 ? 0 : g === 2 ? 0.75 : 1); delete n._score; } stats[g]++; save();
  if (onceToday("n" + n.id)) gain(n.reps === 1 ? 3 : 2, "révision");
  if (g === 1 && queue.slice(idx + 1).filter(x => x === n).length === 0) queue.push(n);   // « Raté » : elle revient à la fin
  else done++;
  idx++;
  if (idx >= queue.length) endSession(); else showCard();
}
function endSession() {
  $("seance").hidden = true; $("bilan").hidden = false; $("prog").style.width = "100%";
  const tot = stats[1] + stats[2] + stats[3];
  if (tot && idx >= queue.length && onceToday("jour")) gain(10, "révision du jour finie");
  $("bilan-t").textContent = tot ? `${stats[3]} facile${stats[3] > 1 ? "s" : ""}, ${stats[2]} avec effort, ${stats[1]} raté${stats[1] > 1 ? "s" : ""}. Les notions difficiles reviendront plus tôt.` : "Tu reprendras plus tard.";
  renderToday(); renderList();
}
$("go").addEventListener("click", startSession);
$("voir").addEventListener("click", reveal);
document.querySelectorAll("#noter .grades button").forEach(b => b.addEventListener("click", () => grade(Number(b.dataset.g))));
$("quit").addEventListener("click", endSession);
$("bilan-ok").addEventListener("click", () => { $("bilan").hidden = true; $("accueil").hidden = false; $("tuiles").hidden = false; renderToday(); });
document.addEventListener("keydown", e => {
  if ($("seance").hidden || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === " " || e.key === "Enter") { if (!shown) { e.preventDefault(); reveal(); } }
  else if (["1", "2", "3"].includes(e.key)) grade(Number(e.key));
  else if (e.key === "l" || e.key === "L") $("lire").click();
});

/* ---------- Mes notions ---------- */
function renderListOld() {
  const box = $("nlist"); box.replaceChildren();
  $("ncount").textContent = `${db.notions.length} notion${db.notions.length > 1 ? "s" : ""}`;
  if (!db.notions.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "Aucune notion pour l'instant."; box.append(p); return; }
  [...db.notions].sort((a, b) => (a.due || 0) - (b.due || 0)).forEach(n => {
    const r = document.createElement("div"); r.className = "nrow";
    const l = document.createElement("div");
    const t = document.createElement("p"); t.className = "t"; t.append(holeHTML(n, true));
    const w = document.createElement("p"); w.className = "when src"; w.append(srcHTML(n), document.createTextNode(" · " + (n.last ? "revient " + when(n.due) : "nouvelle")));
    if ((n.lapses || 0) >= 4) { const c = document.createElement("span"); c.className = "chip rate"; c.textContent = "À retravailler"; w.append(" ", c); } l.append(t, w);
    const b = document.createElement("button"); b.textContent = "Modifier"; b.addEventListener("click", () => openEditor(n));
    r.append(l, b); box.append(r);
  });
}
let editing = null, editHoles = null;
function openEditor(n) {
  editing = n; editHoles = new Set(n.holes);
  const ed = $("editor"); ed.replaceChildren();
  tokens(n.text).forEach((w, i) => {
    if (/^\s+$/.test(w) || !w) { ed.append(w); return; }
    const s = document.createElement("span"); s.className = "w" + (editHoles.has(i) ? " on" : ""); s.textContent = w; s.tabIndex = 0; s.setAttribute("role", "button");
    const tog = () => { if (editHoles.has(i)) editHoles.delete(i); else editHoles.add(i); s.classList.toggle("on"); };
    s.addEventListener("click", tog); s.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } });
    ed.append(s);
  });
  edFill(n); $("edit-card").hidden = false; $("edit-card").scrollIntoView({block: "start", behavior: "smooth"});
}
$("edit-ok").addEventListener("click", () => {
  if (!editing) return;
  const rebuilt = edApply(editing);
  if (!rebuilt && !editHoles.size) { note("Choisis au moins un mot à cacher.", "warn"); return; }
  if (!rebuilt) editing.holes = [...editHoles].sort((a, b) => a - b); delete editing._rebuilt; save(); $("edit-card").hidden = true; editing = null; renderList(); renderToday(); note("Notion enregistrée.", "ok");
});
$("edit-del").addEventListener("click", () => { if (!editing) return; db.notions = db.notions.filter(x => x !== editing); save(); $("edit-card").hidden = true; const gone = editing; editing = null; renderList(); renderToday(); noteUndo("Notion supprimée.", () => { db.notions.push(gone); save(); renderList(); renderToday(); }); });
$("edit-x").addEventListener("click", () => { $("edit-card").hidden = true; editing = null; });
$("ajout-go").addEventListener("click", () => {
  const v = $("ajout").value.trim(); if (v.split(/\s+/).length < 3) { note("Écris une phrase d'au moins 3 mots.", "warn"); return; }
  const n = makeNotion(v, "manuel", ""); db.notions.push(n); save(); $("ajout").value = ""; renderList(); renderToday(); openEditor(n);
});
function importEcoute() {
  let ec = null; try { ec = JSON.parse(localStorage.getItem("ni-ecoute-v2") || "null"); } catch (e) {}
  if (!ec || !ec.segs || !ec.segs.length) return -1;
  db.seen = db.seen || [];   // une notion supprimée ne revient pas
  const have = new Set(db.notions.map(n => n.text).concat(db.seen));
  const src = (ec.matiere || "Cours") + " · " + new Date().toLocaleDateString("fr-FR");
  let added = 0;
  ec.segs.forEach(s => {
    const text = (s.fix || s.text || "").trim(); if (!text || text.split(/\s+/).length < 3 || have.has(text)) return;
    const mark = s.dif ? "dif" : s.q ? "q" : s.imp ? "imp" : null; if (!mark) return;
    db.notions.push(makeNotion(text, mark, src)); have.add(text); db.seen.push(text); added++;
  });
  save(); renderList(); renderToday();
  return added;
}

/* ---------- Importer un cours (Word, PDF, texte) ---------- */
const loadScript = src => new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.append(s); });
async function readFile(f) {
  const name = f.name.toLowerCase();
  if (name.endsWith(".docx")) {
    if (typeof mammoth === "undefined") await loadScript("lib/mammoth.browser.min.js");
    const buf = await f.arrayBuffer();
    try { return docxEnTexte((await mammoth.convertToHtml({arrayBuffer: buf})).value); }   // garde titres, gras, listes et tableaux
    catch (e) { return (await mammoth.extractRawText({arrayBuffer: buf})).value; }
  }
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("./lib/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({data: new Uint8Array(await f.arrayBuffer())}).promise;
    let out = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const c = await (await doc.getPage(p)).getTextContent();
      if (doc.numPages > 1) out += "— page " + p + " —\n";          // repère de page : le moteur garde la provenance
      c.items.forEach(it => { out += it.str + (it.hasEOL ? "\n" : ""); }); out += "\n\n";
    }
    return out;
  }
  if (name.endsWith(".pptx")) return readPptx(await f.arrayBuffer());
  if (name.endsWith(".ppt")) throw new Error("ancien format PowerPoint");
  if (/^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/.test(name)) return readPhoto(f);
  if (name.endsWith(".doc")) throw new Error("ancien format Word");
  return await f.text();
}
/* Word en HTML → texte structuré pour le moteur : « # titre », « **gras** », « - élément », « a | b » pour les tableaux. */
function docxEnTexte(html) {
  const d = new DOMParser().parseFromString(html, "text/html"), out = [];
  const txt = el => { let t = ""; el.childNodes.forEach(n => { t += n.nodeType === 3 ? n.textContent : /^(STRONG|B)$/.test(n.nodeName) && n.textContent.trim() ? "**" + n.textContent.trim() + "** " : txt(n); }); return t.replace(/\s+/g, " ").trim(); };
  d.body.childNodes.forEach(el => { if (el.nodeType !== 1) return; const n = el.nodeName;
    if (/^H[1-6]$/.test(n)) out.push("", "#".repeat(Math.min(3, Number(n[1]))) + " " + el.textContent.trim(), "");
    else if (n === "UL" || n === "OL") el.querySelectorAll(":scope > li").forEach((li, i) => out.push((n === "OL" ? (i + 1) + ". " : "- ") + txt(li)));
    else if (n === "TABLE") { out.push(""); el.querySelectorAll("tr").forEach(tr => out.push("| " + [...tr.children].map(td => td.textContent.trim().replace(/\|/g, "/")).join(" | ") + " |")); out.push(""); }
    else { const t = txt(el); if (t) out.push(t); } });
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
/* PowerPoint (.pptx) : c'est un fichier zip. On lit le texte de chaque diapositive, dans l'ordre. */
async function unzip(buf, keep) {
  const dv = new DataView(buf), td = new TextDecoder(), out = {};
  let e = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("zip");
  let p = dv.getUint32(e + 16, true); const count = dv.getUint16(e + 10, true);
  for (let k = 0; k < count; k++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nm = td.decode(new Uint8Array(buf, p + 46, nl)); p += 46 + nl + el + cl;
    if (!keep(nm)) continue;
    const data = new Uint8Array(buf, off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), size);
    const bytes = method === 0 ? data : new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    out[nm] = td.decode(bytes);
  }
  return out;
}
async function readPptx(buf) {
  const files = await unzip(buf, n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const ent = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return Object.keys(files).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/))).map((k, i) => "— diapo " + (i + 1) + " —\n" +
    files[k].split("</a:p>").map(par => (par.match(/<a:t>([^<]*)<\/a:t>/g) || []).map(t => ent(t.slice(5, -6))).join("")).filter(x => x.trim()).join("\n")
  ).join("\n\n");
}
/* Photo : la reconnaissance du texte se fait sur l'appareil (Tesseract). La première fois, l'outil se télécharge (quelques Mo). */
async function readPhoto(f) {
  if (typeof Tesseract === "undefined") await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
  const r = await Tesseract.recognize(f, "fra", {logger: m => { if (m.status === "recognizing text") $("imp-file-t").textContent = "Je lis la photo… " + Math.round(m.progress * 100) + " %"; }});
  return r.data.text;
}
let impPhoto = false;
// Texte pour la lecture à voix haute et l'ancien découpage : sans repères de page ni marques de gras.
const sansReperes = t => t.replace(/^\s*[—–-]{1,3}\s*(page|photo|diapo|diapositive|feuille)\s+\d+\s*[—–-]{0,3}\s*$/gim, "").replace(/\*\*|__|==/g, "").replace(/^#{1,6}\s+/gm, "").replace(/\n{3,}/g, "\n\n").trim();
async function takeFile(input) {
  const f = input.files[0]; if (!f) return;
  $("imp-file-t").textContent = "Lecture de « " + f.name + " »…";
  try {
    let t = await readFile(f);
    const prev = $("imp-text").value.trim();     // plusieurs photos à la suite : le texte s'ajoute
    if (/^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name)) { impPhoto = true; t = "— photo " + ((prev.match(/^— photo \d+ —$/gm) || []).length + 1) + " —\n" + t; }
    $("imp-text").value = (prev ? prev + "\n\n" : "") + t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!$("imp-mat").value && !/^image\//.test(f.type)) $("imp-mat").value = f.name.replace(/\.[^.]+$/, "");
    $("imp-file-t").textContent = /^image\//.test(f.type) ? "Photo lue. Vérifie le texte (la lecture d'une photo peut faire des erreurs), ajoute une autre photo ou appuie sur « Lire le cours »." : "« " + f.name + " » est lu. Vérifie le texte, puis appuie sur « Lire le cours ».";
  } catch (e) {
    $("imp-file-t").textContent = e.message === "ancien format Word" ? "Ce fichier Word est trop ancien (.doc). Enregistre-le en .docx dans Word, puis réessaie."
      : e.message === "ancien format PowerPoint" ? "Ce PowerPoint est trop ancien (.ppt). Enregistre-le en .pptx, puis réessaie."
      : "Ce fichier n'a pas pu être lu. Copie le texte du cours et colle-le dans la case.";
  }
  input.value = "";
}
["imp-file", "imp-photo"].forEach(id => {
  $(id).addEventListener("change", () => takeFile($(id)));
  $(id).previousElementSibling.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $(id).click(); } });
});
const DEF = /\b(est|sont|désigne|désignent|signifie|correspond|consiste|représente|on appelle|se définit|c'est)\b|\s:\s/i;
let picks = [];
function splitSentences(text) {
  return text.split(/\n\s*\n|\n(?=[-•*\d]+[.)]?\s)/).map(p => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean)
    .map(p => (p.match(/[^.!?…]+(?:[.!?…]+|$)/g) || [p]).map(x => x.trim()).filter(Boolean));
}
/* ---------- Comprendre le cours : l'algorithme de déstructuration ----------
   1. Découper : les titres (le plan), les paragraphes, les phrases.
   2. Donner un rôle à chaque phrase : définition, exemple, règle, formule, date, cause, question.
   3. Noter chaque mot clé : il gagne des points s'il revient souvent, s'il est dans un titre,
      s'il est le mot défini, ou dans une phrase « à retenir ». Un mot vu seulement dans les exemples perd des points.
      On range en 3 niveaux : très important, important, détail.
   4. L'essentiel = les définitions, règles, formules, phrases à retenir, et les phrases riches en mots clés.
      Les exemples aident à comprendre, mais ne sont pas à apprendre par cœur. */
const ROLES = {q: ["À quoi répondre", 3], ret: ["À retenir", 3], def: ["Définition", 3], form: ["Formule", 2.5], regle: ["Règle", 2.5],
  date: ["Date", 2], cause: ["Cause et conséquence", 2], ex: ["Exemple", 0.5], info: ["", 1]};
const KSTOP = new Set("peut peuvent doit doivent faut entre après avant cette celui celle ceux ainsi alors deux trois quatre cinq premier première second seconde exemple exemples définition retenir expliquez expliquer citez citer montrez justifiez décrivez comparez également autre autres chaque certain certains certaines plusieurs selon garde gardent avoir notamment manière moins quand lorsque leurs elle elles dont même mêmes toute toutes donne donnent permet".split(" "));
const R_Q = /\?\s*$|^(expliqu|définisse|définir|citez|citer|compare|montrez|justifie|analyse|décrive|calcule|démontre|résume)/i;
const R_RET = /^(à retenir|retenir|important|attention|essentiel|à savoir|notez)\b|\b(à retenir|retenez|il faut retenir)\b/i;
const R_EX0 = /^(par exemple|exemple|ex\s*[:.]|imaginons|prenons|cas pratique|illustration)/i;
const R_EX = /\b(par exemple|exemple\s*:|notamment|tels? que|telles? que|c'est le cas)/i;
const R_DEF = /\b(on appelle|se définit|désignent?|signifie|correspond à|consiste à|représente|c'est-à-dire|définition)\b|^[^,]{2,50}\s(est|sont)\s(un|une|le|la|les|l['’]|des|ce|celui|celle)\b|^[^:]{2,50}\s?:\s/i;
const R_FORM = /[=≈≤≥±√∑∫]|\d\s*[×x*/+−-]\s*\d|\b(formule|égale? à)\b/i;
const R_REGLE = /\b(doit|doivent|il faut|interdit|obligatoire|obligation|principe|règle|article\s+\d|loi|en vertu|toujours|jamais|ne peut pas|est tenu)\b/i;
const R_DATE = /\b(1[0-9]{3}|20[0-9]{2})\b|\bsiècle\b/;
const R_CAUSE = /\b(parce qu|car|donc|c'est pourquoi|entraîne|provoque|cause|conséquence|en raison|grâce à|permet(tent)? de|afin de|résulte)\b/i;
function roleOf(s) {
  if (R_Q.test(s)) return "q"; if (R_RET.test(s)) return "ret"; if (R_EX0.test(s)) return "ex";
  if (R_DEF.test(s)) return "def"; if (R_FORM.test(s)) return "form"; if (R_EX.test(s)) return "ex";
  if (R_REGLE.test(s)) return "regle"; if (R_DATE.test(s)) return "date"; if (R_CAUSE.test(s)) return "cause"; return "info";
}
function isTitle(line) {
  const l = line.trim(), w = l.split(/\s+/).length;
  if (l.length < 3 || w > 12 || /^[-•*–]/.test(l)) return 0;
  if (/^(chapitre|partie|section|titre|leçon|thème|séquence)\b/i.test(l) || /^[IVX]+\s?[.)\-–]\s/.test(l)) return 1;
  if (/^(\d+(\.\d+)*|[A-H])\s?[.)\-–]\s/.test(l) && !/[.!?;]$/.test(l) && w <= 10) return 2;
  if (w <= 8 && !/[.!?;,:]$/.test(l) && /^\p{Lu}/u.test(l) && !/\s:\s/.test(l)) return l === l.toUpperCase() && /\p{L}{3}/u.test(l) ? 1 : 2;
  return 0;
}
const isEss = (o, cut) => o.role !== "ex" && (["def", "ret", "q", "form", "regle"].includes(o.role) || o.score >= cut);
function analyse(text) {
  const secs = [{title: "", level: 0, blocks: []}]; let buf = [];
  const flush = () => { if (buf.length) { secs[secs.length - 1].blocks.push(buf.join("\n")); buf = []; } };
  text.replace(/\r/g, "").split("\n").forEach(l => { const lv = isTitle(l);
    if (lv) { flush(); secs.push({title: l.trim().replace(/[\s:]+$/, ""), level: lv, blocks: []}); } else if (!l.trim()) flush(); else buf.push(l); });
  flush();
  const all = [];
  secs.forEach((s, si) => { s.blocks = s.blocks.flatMap(b => splitSentences(b)).map(par => par.map(t => { const o = {text: t, role: roleOf(t), sec: si}; all.push(o); return o; })); });
  const freq = new Map(); all.forEach(o => o.text.split(/\s+/).forEach(w => { const c = clean(w); freq.set(c, (freq.get(c) || 0) + 1); }));
  const keywords = () => {
    const kw = new Map();
    const add = (w, bonus, ex) => { const c = clean(w); if (c.length < 4 || STOP.has(c) || KSTOP.has(c) || /^\d+$/.test(c)) return;
      const k = stem(norm(c)); let o = kw.get(k); if (!o) kw.set(k, o = {forms: new Map(), score: 0, ex: 0, other: 0});
      const f = core(w); o.forms.set(f, (o.forms.get(f) || 0) + 1); o.score += 1 + bonus; ex ? o.ex++ : o.other++; };
    secs.forEach(s => s.title && s.title.split(/\s+/).forEach(w => add(w, 3)));
    all.forEach(o => { const t = o.text.split(/\s+/);
      const v = o.role === "def" ? t.findIndex((w, i) => i > 0 && i < 8 && (VERBS.has(clean(w)) || w === ":")) : -1;
      t.forEach((w, i) => add(w, (i < v ? 4 : 0) + (o.role === "ret" || o.role === "q" ? 1.5 : 0) + (i > 0 && /^\p{Lu}\p{Ll}/u.test(w) ? 0.5 : 0), o.role === "ex")); });
    const list = [...kw.entries()].map(([k, o]) => ({k, score: o.other ? o.score : o.score * 0.4,
      label: [...o.forms.entries()].sort((a, b) => b[1] - a[1])[0][0]})).filter(x => x.score >= 2).sort((a, b) => b.score - a.score);
    const n3 = Math.max(3, Math.round(list.length * 0.12)), n2 = n3 + Math.round(list.length * 0.25), kwl = new Map();
    list.forEach((x, i) => { x.lv = i < n3 ? 3 : i < n2 ? 2 : 1; kwl.set(x.k, x.lv); });
    return {list, kwl};
  };
  let {list, kwl} = keywords();
  all.forEach(o => o.base = o.role);
  const defTerms = new Map();             // les notions clés définies dans le cours, et où elles sont définies
  all.forEach((o, idx) => { o.idx = idx; if (o.role !== "def") return; const t = o.text.split(/\s+/), v = t.findIndex((w, i) => i > 0 && i < 8 && (VERBS.has(clean(w)) || w === ":"));
    t.slice(0, Math.max(v, 0)).forEach(w => { const c = clean(w); if (c.length >= 4 && !STOP.has(c)) { const k = stem(norm(c)); if (!defTerms.has(k)) defTerms.set(k, {at: idx, label: core(w)}); } }); });
  secs.forEach(s => s.blocks.forEach(par => par.forEach((o, i) => {           // 2e passage : les exemples sans mot « exemple »
    if (!["info", "cause", "date", "regle", "ex"].includes(o.role)) return;
    const r = exampleScore(o, {kwl, freq, prev: par[i - 1], defTerms, idx: o.idx}); o.why = r.why;
    if (r.sc >= 3) o.role = "ex";
  })));
  ({list, kwl} = keywords());
  all.forEach(o => { const seen = new Set(); let sum = 0;
    o.text.split(/\s+/).forEach(w => { const k = stem(norm(clean(w))); if (kwl.has(k) && !seen.has(k)) { seen.add(k); sum += kwl.get(k); } });
    o.score = ROLES[o.role][1] + Math.min(3, sum / 3); });
  const sc = all.filter(o => o.role !== "ex").map(o => o.score).sort((a, b) => b - a), cut = sc[Math.floor(sc.length * 0.4)] || 0;
  all.forEach(o => { o.ess = isEss(o, cut); });
  const qs = all.filter(o => o.role === "q").map(o => o.text);           // les questions du cours
  all.filter(o => o.role === "def").forEach(o => { const t = o.text.split(/\s+/), v = t.findIndex((w, i) => i > 0 && i < 8 && VERBS.has(clean(w)));
    if (v > 0 && v <= 4) qs.push("Qu'est-ce que « " + t.slice(0, v).join(" ").replace(/^(l['’]|le |la |les |un |une )/i, "") + " » ?"); });
  return {secs, all, list, kwl, qs, cut};
}
/* Trouver les exemples sans IA : on additionne des indices.
   Un exemple parle d'un cas précis (une personne, une somme, un lieu, un âge), avec des mots qu'on ne revoit pas ailleurs dans le cours,
   peu de mots clés, des « un, une, des » plutôt que « le, la, les », et il suit souvent une définition ou une règle. */
const R_EXPLUS = /\b(supposons|imaginons|prenons|soit un|soit une|dans le cas où|au cas où|cas de figure|cf\.|e\.g\.|ex\.|comme lorsque|c'est ce qui se passe|on peut citer|à l'image de)\b/i;
const R_PERS = /\b(M\.|Mme|Mlle|Monsieur|Madame|Me)\s+\p{Lu}|\b(Paul|Pierre|Marie|Jean|Julie|Léa|Lucas|Emma|Hugo|Sophie|Thomas|Camille|Louis|Alice|Tom|Sarah|Nathan|Chloé|Max|Inès|Adam|Jules|Zoé|Léo|Anna|Paris|Lyon|Marseille)\b/u;
const R_QTE = /\d[\d\s.,]*\s?(€|euros?|\$|dollars?|ans|mois|jours|heures|km|kg|g|m²|m|cm|litres?|%|personnes|élèves|habitants)\b/i;
function exampleScore(o, ctx) {
  const why = []; let sc = 0;
  const add = (p, w) => { sc += p; why.push(w); };
  if (R_EX0.test(o.text) || R_EX.test(o.text) || R_EXPLUS.test(o.text)) add(3, "un mot d'exemple");
  if (R_PERS.test(o.text)) add(2, "une personne ou un lieu précis");
  else { const caps = o.text.split(/\s+/).slice(1).filter(w => /^\p{Lu}\p{Ll}{2,}/u.test(core(w)) && !ctx.kwl.has(stem(norm(clean(w)))) && (ctx.freq.get(clean(w)) || 0) === 1);
    if (caps.length) add(1.5, "un nom propre"); }
  if (R_QTE.test(o.text)) add(1.5, "une somme ou une quantité");
  if (/^si\s/i.test(o.text) || /\b(un jour|hier|l'an dernier|récemment)\b/i.test(o.text)) add(1, "une situation inventée");
  const words = o.text.split(/\s+/), cont = words.map(w => clean(w)).filter(c => c.length >= 4 && !STOP.has(c));
  if (words.length >= 8 && cont.length) {
    const kwShare = cont.filter(c => (ctx.kwl.get(stem(norm(c))) || 0) >= 2).length / cont.length;
    const uniq = cont.filter(c => (ctx.freq.get(c) || 0) === 1).length / cont.length;
    if (kwShare < 0.2 && ctx.prev && ["def", "regle", "form"].includes(ctx.prev.role)) add(1.5, "elle suit une définition ou une règle, avec peu de mots clés");
    if (uniq >= 0.6) add(1, "des mots qu'on ne revoit pas dans le cours");
    // Ton idée : la phrase reprend une notion clé déjà définie, mais avec des mots concrets à elle → elle l'illustre.
    const term = [...ctx.defTerms.entries()].find(([k, d]) => d.at < ctx.idx && cont.some(c => stem(norm(c)) === k));
    const concret = (o.text.match(/\b(un|une|des)\s/gi) || []).length >= 1 || R_PERS.test(o.text) || R_QTE.test(o.text);
    const autres = term ? cont.filter(c => stem(norm(c)) !== term[0]) : [];
    const autresCles = autres.length ? autres.filter(c => (ctx.kwl.get(stem(norm(c))) || 0) >= 2).length / autres.length : 1;
    if (term && concret && (uniq >= 0.4 || autresCles <= 0.25)) add(2, "elle illustre la notion « " + term[1].label + " » avec un cas concret");
    const ind = (o.text.match(/\b(un|une|des)\s/gi) || []).length, def = (o.text.match(/\b(le|la|les|l['’])/gi) || []).length;
    if (ind >= 2 && ind > def) add(1, "des « un, une, des » : un cas précis");
  }
  return {sc, why};
}
let ana = null;
function renderAna() {
  const box = $("reader"); box.replaceChildren(); picks = [];
  ana.secs.forEach((s, si) => {
    if (s.title) { const h = document.createElement(s.level === 1 ? "h3" : "h4"); h.className = "rt"; h.id = "sec-" + si; h.textContent = s.title; box.append(h); }
    s.blocks.forEach(par => { const p = document.createElement("p"); p.className = "rpar"; p.style.margin = "0";
      par.forEach(o => { const un = document.createElement("span"), sp = document.createElement("span"), tg = document.createElement("button");
        tg.type = "button"; tg.className = "rtag"; un.append(tg, sp); p.append(un);
        const paint = () => { un.className = "unit r-" + o.role + (o.ess ? " ess" : "");
          tg.hidden = !ROLES[o.role][0]; tg.textContent = ROLES[o.role][0] || "";
          tg.title = (o.role === "ex" && o.why && o.why.length ? "Exemple trouvé grâce à : " + o.why.join(", ") + ". " : "") + "Touche pour dire si c'est un exemple ou non.";
          tg.setAttribute("aria-label", (ROLES[o.role][0] || "") + ". Touche pour changer"); };
        tg.addEventListener("click", () => {               // l'élève corrige : exemple ou pas
          o.role = o.role === "ex" ? (o.base !== "ex" ? o.base : "info") : "ex"; o.ess = isEss(o, ana.cut); paint();
          const it = picks.find(x => x.o === o); if (it && it.on !== o.ess) { it.on = o.ess; it.el.classList.toggle("on", it.on); countPicks(); }
          const ne = ana.all.filter(x => x.ess).length; $("ana-n").textContent = `${ne} phrase${ne > 1 ? "s" : ""} essentielle${ne > 1 ? "s" : ""} sur ${ana.all.length}`; });
        paint();
        o.text.split(/(\s+)/).forEach(w => { const c = clean(w);
          if (c.length >= 4 && !STOP.has(c) && ana.kwl.get(stem(norm(c))) === 3) { const b = document.createElement("b"); b.textContent = w; sp.append(b); } else sp.append(w); });
        sp.append(" ");
        const words = o.text.split(/\s+/).length;
        if (words >= 4 && words <= 60) { const item = {text: o.text, el: sp, on: false, o}; picks.push(item);
          sp.classList.add("sent"); sp.tabIndex = 0; sp.setAttribute("role", "button");
          const tog = () => { item.on = !item.on; sp.classList.toggle("on", item.on); countPicks(); };
          sp.addEventListener("click", tog); sp.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } }); }
      });
      box.append(p); });
  });
  const plan = ana.secs.map((s, i) => [s, i]).filter(([s]) => s.title);
  $("ana-plan").replaceChildren(...plan.map(([s, i]) => { const li = document.createElement("li"); if (s.level > 1) li.style.marginLeft = "18px";
    const a = document.createElement("a"); a.href = "#sec-" + i; a.textContent = s.title;
    a.addEventListener("click", e => { e.preventDefault(); $("sec-" + i).scrollIntoView({block: "start", behavior: "smooth"}); }); li.append(a); return li; }));
  $("ana-plan-d").hidden = !plan.length; $("ana-plan-n").textContent = plan.length + " partie" + (plan.length > 1 ? "s" : "");
  const lab = {3: "Très important", 2: "Important", 1: "Détail"};
  $("ana-kw").replaceChildren(...[3, 2, 1].map(lv => { const row = document.createElement("div"); row.className = "kwrow";
    const items = ana.list.filter(x => x.lv === lv).slice(0, lv === 1 ? 10 : 12); if (!items.length) return row;
    const l = document.createElement("span"); l.className = "lab"; l.textContent = lab[lv]; row.append(l);
    items.forEach(x => { const c = document.createElement("span"); c.className = "chip kw" + lv; c.textContent = x.label; row.append(c); }); return row; }));
  $("ana-q").replaceChildren(...ana.qs.map(q => { const li = document.createElement("li"); li.textContent = q; return li; }));
  $("ana-q-d").hidden = !ana.qs.length; $("ana-q-n").textContent = ana.qs.length + " question" + (ana.qs.length > 1 ? "s" : "");
  const ne = ana.all.filter(o => o.ess).length; $("ana-n").textContent = `${ne} phrase${ne > 1 ? "s" : ""} essentielle${ne > 1 ? "s" : ""} sur ${ana.all.length}`;
  setView("tout");
}
function setView(v) { $("reader").dataset.view = v; $("v-tout").setAttribute("aria-pressed", v === "tout"); $("v-ess").setAttribute("aria-pressed", v === "ess"); }
$("v-tout").addEventListener("click", () => setView("tout"));
$("v-ess").addEventListener("click", () => setView("ess"));
$("imp-read").addEventListener("click", () => {
  const text = $("imp-text").value.trim();
  if (text.split(/\s+/).length < 5) { note("Colle un cours ou choisis un fichier d'abord.", "warn"); return; }
  ana = analyse(sansReperes(text)); renderAna();
  lancerMoteur(text, $("imp-mat").value.trim());
  autoPick(); $("pick-card").hidden = false; $("pick-card").scrollIntoView({block: "start", behavior: "smooth"});
});
function countPicks() { const n = picks.filter(x => x.on).length; $("pick-n").textContent = `${n} phrase${n > 1 ? "s" : ""} surlignée${n > 1 ? "s" : ""}`; $("pick-go").textContent = n ? `Créer ${n} notion${n > 1 ? "s" : ""}` : "Créer les notions"; }
function autoPick() { picks.forEach(x => { const w = x.text.split(/\s+/).length; x.on = (x.o ? x.o.ess : DEF.test(x.text)) && w <= 40; x.el.classList.toggle("on", x.on); }); countPicks(); }
$("pick-auto").addEventListener("click", autoPick);
$("pick-none").addEventListener("click", () => { picks.forEach(x => { x.on = false; x.el.classList.remove("on"); }); countPicks(); });
$("pick-x").addEventListener("click", () => { $("pick-card").hidden = true; });
$("pick-go").addEventListener("click", () => {
  const chosen = picks.filter(x => x.on); if (!chosen.length) { note("Surligne au moins une phrase.", "warn"); return; }
  const have = new Set(db.notions.map(n => n.text)); const src = ($("imp-mat").value.trim() || "Cours importé") + " · " + new Date().toLocaleDateString("fr-FR");
  const exOf = o => { if (!ana || !o) return ""; for (let k = o.idx + 1; k < ana.all.length && k <= o.idx + 3; k++) { const z = ana.all[k]; if (z.sec !== o.sec) break; if (z.role === "ex") return z.text; if (z.ess) break; } return ""; };
  let added = 0; chosen.forEach(x => { if (have.has(x.text)) return; const nn = makeNotion(x.text, "imp", src, ana && ana.kwl, x.o && x.o.role); nn.chap = ((x.o && ana && ana.secs[x.o.sec]) ? ana.secs[x.o.sec].title : "") || anaChap;
    const e = exOf(x.o); if (e) nn.ex = e; db.notions.push(nn); have.add(x.text); added++; });
  fixExamples(db.notions); saveCours($("imp-mat").value.trim() || "Cours importé", sansReperes($("imp-text").value.trim())); save(); useTool("notions"); renderList(); renderToday(); $("pick-card").hidden = true; $("imp-text").value = ""; impPhoto = false; impOpen = false; anaChap = ""; tab("jour");
  note(`${added} notion${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""}. Elles sont dans ta révision du jour.`, "ok");
});

/* ---------- Vérifier les mots de l'élève (algorithme de pertinence) ----------
   On compare les mots sans accents, au singulier, et on accepte une ou deux fautes de frappe :
   une faute d'orthographe ne doit pas compter comme une erreur de connaissance. */
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const stem = w => { w = w.replace(/[sx]$/, ""); return w.length > 5 ? w.replace(/(ement|ment|ee|e)$/, "") : w; };
const wordsOf = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 1).map(stem);
function lev(a, b) {
  const d = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return d[b.length];
}
function found(set, word) {
  return norm(word).split(/[^a-z0-9]+/).filter(w => w.length > 1).every(r => { const t = stem(r); if (set.has(t)) return true;
    const tol = r.length >= 8 ? 2 : r.length >= 4 ? 1 : 0; if (!tol) return false;
    for (const s of set) if (Math.abs(s.length - t.length) <= tol && lev(s, t) <= tol) return true; return false; });
}
const core = w => (w.match(/^[^\p{L}\p{N}]*(?:(?:[lLdDjJnNsScCmMtT]|[qQ]u)['’])?(.*?)[^\p{L}\p{N}]*$/u) || ["", w])[1];
const holeWords = n => { const t = tokens(n.text); return n.holes.map(i => core(t[i] || "")).filter(Boolean); };
const keyWords = n => { const t = tokens(n.text), h = new Set(n.holes), seen = new Set();
  return t.map((w, i) => h.has(i) ? "" : core(w)).filter(w => { const c = clean(w); if (c.length < 4 || STOP.has(c) || seen.has(c)) return false; seen.add(c); return true; }); };

/* ---------- Feuille blanche ---------- */
let fb = {mode: "tout", all: [], targets: [], miss: [], one: null};
const matsWithNotions = () => [...new Set(db.notions.map(matOf).concat((db.exos || []).map(matOf), (db.cards || []).map(matOf)))].sort();
function fbFill() {
  const s = $("fb-mat"), cur = s.value; s.replaceChildren();
  matsWithNotions().forEach(m => { const o = document.createElement("option"); o.value = o.textContent = m; s.append(o); });
  if (cur && [...s.options].some(o => o.value === cur)) s.value = cur;
}
function fbStart(targets) {
  fb.all = db.notions.filter(n => !n.off && matOf(n) === $("fb-mat").value);
  fb.targets = targets || fb.all; $("fb-text").value = ""; $("fb-intro").hidden = false; fb.help = false; $("fb-cours").hidden = true; $("fb-help").textContent = "Je bloque : voir le cours"; $("fb-res").hidden = true; const p = $("fb-prompt"); p.hidden = false;
  if (!fb.all.length) { p.textContent = "Ajoute d'abord un cours dans « Mes cours »."; $("fb-check").disabled = true; return; }
  $("fb-check").disabled = false;
  if (fb.mode === "une") {
    const pool = fb.targets.filter(n => keyWords(n).length >= 2); fb.one = pool[Math.floor(Math.random() * pool.length)] || fb.targets[0];
    p.textContent = `Explique avec tes mots : « ${holeWords(fb.one).join(" ")} »` + (db.niv === 3 ? ` — en ${maxWords(fb.one)} mots au maximum.` : "");
    $("fb-hint").hidden = db.niv !== 1; $("fb-hint").textContent = "Indices : " + keyWords(fb.one).map(firstLetters).join(", ");
    $("fb-count").hidden = db.niv !== 3; $("fb-count").textContent = `0 mot sur ${maxWords(fb.one)} au maximum`;
  } else {
    p.textContent = db.niv === 3 ? `Écris tout ce que tu sais en ${$("fb-mat").value}.` : `${fb.targets.length} notion${fb.targets.length > 1 ? "s" : ""} à retrouver en ${$("fb-mat").value}. Écris tout ce que tu sais, dans le désordre si tu veux.`;
    $("fb-hint").hidden = db.niv !== 1; $("fb-hint").textContent = "Indices : " + fb.targets.map(n => firstLetters(answerOf(n))).join(", "); $("fb-count").hidden = true;
  }
  $("fb-text").focus();
}
function fbCheck() {
  const said = new Set(wordsOf($("fb-text").value));
  if (!said.size) { note("Écris d'abord ce dont tu te souviens.", "warn"); return; }
  const box = $("fb-list"); box.replaceChildren(); fb.miss = [];
  if (fb.mode === "une") {
    const n = fb.one, kw = keyWords(n), ok = kw.filter(w => found(said, w));
    const nw = $("fb-text").value.trim().split(/\s+/).length;
    if (db.niv === 3 && nw > maxWords(n)) { note(`Trop long : ${nw} mots. Essaie en ${maxWords(n)} mots au maximum.`, "warn"); return; }
    const pc = kw.length ? ok.length / kw.length : 0;
    $("fb-score").textContent = pc >= 0.6 ? "Bien expliqué !" : pc >= 0.3 ? "C'est un début" : "Il manque l'essentiel";
    $("fb-sub").textContent = `Tu as utilisé ${ok.length} des ${kw.length} idées clés. Ce n'est pas la seule façon de bien dire : relis la phrase du cours et compare.`;
    const r = document.createElement("div"); r.className = "res " + (pc >= 0.6 ? "ok" : "no"); r.append(holeHTML(n, true));
    const k = document.createElement("div"); kw.forEach(w => { const s = document.createElement("span"); s.className = "kw " + (ok.includes(w) ? "ok" : "no"); s.textContent = w; k.append(s); });
    box.append(r, k); if (pc < 0.6) fb.miss = [n];
    if (onceToday("ex-" + n.id)) gainN(3, "explication");
    $("fb-miss").textContent = "Une autre notion"; $("fb-zero").textContent = "Réessayer celle-ci";
  } else {
    const res = fb.targets.map(n => [n, holeWords(n).every(w => found(said, w))]);
    const got = res.filter(x => x[1]).length; fb.miss = res.filter(x => !x[1]).map(x => x[0]);
    $("fb-score").textContent = `${got} sur ${res.length} retrouvée${got > 1 ? "s" : ""}`;
    if (onceToday("fb-" + $("fb-mat").value)) gainN(Math.round((5 + got) / (fb.help ? 2 : 1)), "feuille blanche");
    $("fb-sub").textContent = fb.miss.length ? "En rouge, ce qui manque. Relis-le, puis recommence : c'est en cherchant qu'on retient." : "Tout y est. Bravo !";
    res.sort((a, b) => a[1] - b[1]).forEach(([n, ok]) => { const r = document.createElement("div"); r.className = "res " + (ok ? "ok" : "no"); r.append(ok ? "✓ " : "✗ ", holeHTML(n, true)); box.append(r); });
    $("fb-miss").textContent = "Recommencer avec ce qui manque"; $("fb-zero").textContent = "Recommencer de zéro";
    $("fb-miss").hidden = !fb.miss.length;
  }
  $("fb-rev").hidden = !fb.miss.length; $("fb-res").hidden = false; $("fb-intro").hidden = true; $("fb-res").scrollIntoView({block: "start", behavior: "smooth"});
}
$("fb-check").addEventListener("click", fbCheck);
$("fb-mat").addEventListener("change", () => fbStart());
document.querySelectorAll("#fb-mode button").forEach(b => b.addEventListener("click", () => {
  fb.mode = b.dataset.m; document.querySelectorAll("#fb-mode button").forEach(x => x.classList.toggle("on", x === b)); $("fb-miss").hidden = false; fbStart();
}));
$("fb-miss").addEventListener("click", () => fb.mode === "une" ? fbStart() : fbStart(fb.miss));
$("fb-zero").addEventListener("click", () => { if (fb.mode === "une") { $("fb-text").value = ""; $("fb-res").hidden = true; $("fb-text").focus(); } else fbStart(); });
$("fb-rev").addEventListener("click", () => {
  fb.miss.forEach(n => { n.due = Date.now(); if (n.last) n.D = clampD(n.D + 0.5); }); save(); renderToday();
  note(`${fb.miss.length} notion${fb.miss.length > 1 ? "s" : ""} ajoutée${fb.miss.length > 1 ? "s" : ""} à la révision du jour.`, "ok"); $("fb-rev").hidden = true;
});
/* Dicter au lieu d'écrire (si le navigateur le permet) */
{ const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) { let rec = null; $("fb-voice").hidden = false;
    $("fb-voice").addEventListener("click", () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = "fr-FR"; rec.continuous = true;
      rec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) $("fb-text").value += (/\S$/.test($("fb-text").value) ? " " : "") + e.results[i][0].transcript.trim(); };
      rec.onend = () => { rec = null; $("fb-voice").textContent = "Dicter au lieu d'écrire"; $("fb-voice-t").textContent = ""; };
      rec.start(); $("fb-voice").textContent = "Arrêter la dictée"; $("fb-voice-t").textContent = "Je t'écoute…";
    }); } }

/* ---------- Mon planning ----------
   Pour chaque jour de la semaine : le temps libre (plage de révision moins les activités),
   puis le travail de chaque matière (notions à revoir × leur difficulté + nouvelles notions),
   rangé par importance (coefficient × proximité de l'échéance). */
const WD = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const COL = ["#1E7A45", "#FFC81F", "#5B34D6", "#F26A1F", "#1A5FD0", "#C8216A"];
const toMin = t => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
const hm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const colOf = m => COL[matsWithNotions().indexOf(m) % COL.length] || COL[0];
function setMat(m, k, v) { db.mats[m] = Object.assign(matInfo(m), {[k]: v}); save(); renderPlan(); renderToday(); }
function renderMats() {
  const box = $("mats"); box.replaceChildren(); const ms = matsWithNotions();
  if (!ms.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "Importe un cours : ses matières apparaîtront ici."; box.append(p); return; }
  const h = document.createElement("div"); h.className = "mrow head"; ["Matière", "Date de l'examen", "Coefficient", "Je veux retenir"].forEach(t => { const s = document.createElement("span"); s.textContent = t; h.append(s); }); box.append(h);
  ms.forEach(m => {
    const i = matInfo(m), r = document.createElement("div"); r.className = "mrow";
    const nm = document.createElement("b"); const d = document.createElement("span"); d.className = "dot"; d.style.background = colOf(m); nm.append(d, m);
    const cnt = db.notions.filter(n => matOf(n) === m), fr = cnt.filter(n => !n.last).length;
    const sub = document.createElement("div"); sub.className = "muted"; sub.textContent = `${cnt.length} notion${cnt.length > 1 ? "s" : ""}` + (fr ? `, ${fr} nouvelle${fr > 1 ? "s" : ""}` : ""); const c1 = document.createElement("div"); c1.append(nm, sub);
    const due = document.createElement("input"); due.type = "date"; due.value = i.due; due.setAttribute("aria-label", "Échéance " + m); due.addEventListener("change", () => setMat(m, "due", due.value));
    const co = document.createElement("input"); co.type = "number"; co.min = "0.5"; co.max = "20"; co.step = "0.5"; co.value = i.coef; co.style.width = "80px"; co.setAttribute("aria-label", "Coefficient " + m); co.addEventListener("change", () => setMat(m, "coef", Math.max(0.5, Number(co.value) || 1)));
    const hz = document.createElement("select"); hz.setAttribute("aria-label", "Objectif " + m);
    [["court", "À court terme"], ["moyen", "À moyen terme"], ["long", "À très long terme"]].forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; hz.append(o); });
    hz.value = i.hz; hz.addEventListener("change", () => setMat(m, "hz", hz.value));
    r.append(c1, due, co, hz); box.append(r);
  });
}
function renderActs() {
  const box = $("acts"); box.replaceChildren();
  [...db.acts].sort((a, b) => a.day - b.day || toMin(a.from) - toMin(b.from)).forEach(a => {
    const r = document.createElement("div"); r.className = "row";
    const t = document.createElement("span"); t.textContent = `${WD[a.day]} · ${a.from}–${a.to} · ${a.label}`;
    const x = document.createElement("button"); x.textContent = "Retirer"; x.addEventListener("click", () => { db.acts = db.acts.filter(y => y !== a); save(); renderActs(); renderPlan(); });
    r.append(t, x); box.append(r);
  });
}
function plan() {
  const now = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0); const days = [];
  const live = db.notions.filter(n => !finished(n, now) && !n.off), ms = matsWithNotions();
  for (let d = 0; d < 7; d++) {
    const date = new Date(d0); date.setDate(d0.getDate() + d); const nx = new Date(date); nx.setDate(date.getDate() + 1);   // pas « + 24 h » : changement d'heure
    const a0 = date.getTime(), a1 = nx.getTime(), wd = (date.getDay() + 6) % 7;
    let [ws, we] = (wd >= 5 ? db.win.we : db.win.wk).map(toMin);
    if (d === 0) { const nm = new Date(); ws = Math.max(ws, Math.ceil((nm.getHours() * 60 + nm.getMinutes()) / 5) * 5); }
    const busy = db.acts.filter(x => x.day === wd).map(x => [toMin(x.from), toMin(x.to), x.label]).sort((x, y) => x[0] - y[0]);
    const free = []; let c = ws; busy.forEach(([f, t]) => { if (f > c) free.push([c, Math.min(f, we)]); c = Math.max(c, t); }); if (c < we) free.push([c, we]);
    // le travail de chaque matière ce jour-là
    const work = ms.filter(m => !(matInfo(m).hz === "court" && dueTime(m) && dueTime(m) < a0)).map(m => {
      const rev = live.filter(n => matOf(n) === m && n.last && (d === 0 ? n.due < a1 : n.due >= a0 && n.due < a1));
      const ex = dueTime(m), left = ex ? (ex - a0) / DAY : 99;
      let sec = rev.reduce((s, n) => s + secFor(n), 0) + newPerDay(m, a0) * 45;
      const blank = left > 0 && left <= 3;                  // les 3 jours avant l'examen : une feuille blanche
      if (blank) sec += 600;
      return {m, min: Math.ceil(sec / 60), n: rev.length, blank, w: weight(m, a0), exam: ex >= a0 && ex < a1};
    }).filter(x => x.min > 0 || x.exam).sort((x, y) => y.w - x.w);
    // on range le travail dans le temps libre, avec une pause de 5 min toutes les 25 min
    const items = busy.map(([f, t, l]) => ({f, t, type: "busy", label: l}));
    let fi = 0, cur = free[0] ? free[0][0] : 0, run = 0, missing = 0;
    work.forEach(x => { let need = x.min;
      while (need > 0 && fi < free.length) {
        if (cur >= free[fi][1]) { fi++; cur = free[fi] ? free[fi][0] : 0; run = 0; continue; }
        if (run >= 25) { const p = Math.min(cur + 5, free[fi][1]); items.push({f: cur, t: p, type: "pause", label: "Pause"}); cur = p; run = 0; continue; }
        const len = Math.min(need, 25 - run, free[fi][1] - cur); if (len <= 0) { fi++; cur = free[fi] ? free[fi][0] : 0; continue; }
        items.push({f: cur, t: cur + len, type: "rev", m: x.m, label: x.m + (x.blank ? " · feuille blanche et révision" : x.n ? ` · ${x.n} notion${x.n > 1 ? "s" : ""} à revoir` : " · nouvelles notions")});
        cur += len; run += len; need -= len;
      }
      missing += need;
    });
    days.push({date, wd, items: items.sort((x, y) => x.f - y.f), missing, exams: work.filter(x => x.exam).map(x => x.m)});
  }
  return days;
}
function renderPlan() {
  const box = $("plan"); box.replaceChildren();
  if (!db.notions.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "Ton planning apparaîtra quand tu auras un cours à réviser."; box.append(p); return; }
  plan().forEach((d, k) => {
    const el = document.createElement("div"); el.className = "day";
    const h = document.createElement("h3"); h.textContent = (k === 0 ? "Aujourd'hui · " : k === 1 ? "Demain · " : "") + d.date.toLocaleDateString("fr-FR", {weekday: "long", day: "numeric", month: "long"}); el.append(h);
    d.exams.forEach(m => { const c = document.createElement("span"); c.className = "chip imp"; c.textContent = "Examen : " + m; el.append(c); });
    const revs = d.items.filter(x => x.type !== "busy");
    if (!revs.length && !d.missing) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "Rien à réviser. Profite !"; el.append(p); }
    d.items.forEach(x => {
      const s = document.createElement("div"); s.className = "slot " + x.type;
      const t = document.createElement("span"); t.className = "h"; t.textContent = hm(x.f) + "–" + hm(x.t);
      const l = document.createElement("span"); if (x.m) { const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = colOf(x.m); l.append(dot); } l.append(x.label);
      s.append(t, l); el.append(s);
    });
    if (k === 0 && !d.items.some(x => x.type !== "busy") && d.missing > 0) { const w = document.createElement("p"); w.className = "muted"; w.textContent = "Ta plage de révision est finie pour aujourd'hui : ce qui reste passe à demain."; el.append(w); }
    else if (d.missing > 0) { const w = document.createElement("p"); w.className = "msg warn"; w.textContent = `Il manque ${d.missing} min ce jour-là. Élargis ta plage de révision, ou baisse un coefficient.`; el.append(w); }
    box.append(el);
  });
}
{ const s = $("act-day"); WD.forEach((w, i) => { const o = document.createElement("option"); o.value = i; o.textContent = w; s.append(o); }); }
$("act-add").addEventListener("click", () => {
  const a = {day: Number($("act-day").value), from: $("act-from").value, to: $("act-to").value, label: $("act-label").value.trim() || "Activité"};
  if (toMin(a.to) <= toMin(a.from)) { note("L'heure de fin doit être après l'heure de début.", "warn"); return; }
  db.acts.push(a); save(); $("act-label").value = ""; renderActs(); renderPlan();
});
[["win-wk-a", "wk", 0], ["win-wk-b", "wk", 1], ["win-we-a", "we", 0], ["win-we-b", "we", 1]].forEach(([id, k, i]) => {
  $(id).value = db.win[k][i]; $(id).addEventListener("change", () => { db.win[k][i] = $(id).value; save(); renderPlan(); });
});
const setHz = v => { db.hz = v; save(); document.querySelectorAll("#hz-def button").forEach(b => b.classList.toggle("on", b.dataset.hz === v)); };
document.querySelectorAll("#hz-def button").forEach(b => b.addEventListener("click", () => {
  setHz(b.dataset.hz); matsWithNotions().forEach(m => { db.mats[m] = Object.assign(matInfo(m), {hz: b.dataset.hz}); }); save(); renderMats(); renderPlan(); renderToday();
}));
setHz(db.hz || "moyen");
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { tab(b.dataset.go); if (b.dataset.go === "notions") $("imp-card").scrollIntoView({block: "start"}); }));

/* ---------- Jauge d'XP et plumes ----------
   On gagne de l'XP en travaillant vraiment : réviser une notion (une fois par jour et par notion),
   une feuille blanche, un quiz ou un jeu fini, la révision du jour terminée, revenir après une pause.
   Jamais pour la vitesse. Chaque niveau donne 10 plumes (pour la mascotte) et 5 crédits bonus (20 au plus par semaine). */
db.xp = db.xp || 0; db.plumes = db.plumes || 0; db.xpDay = db.xpDay || {}; db.bonus = db.bonus || {week: "", n: 0};
const lvlOf = x => Math.floor(Math.sqrt(x / 40)) + 1;
const lvlStart = l => 40 * (l - 1) * (l - 1);
const weekId = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.toISOString().slice(0, 10); };
function renderXP() {
  const l = lvlOf(db.xp), a = lvlStart(l), b = lvlStart(l + 1);
  $("xp-lvl").textContent = "Niv. " + l; $("xp-n").textContent = db.xp + " XP"; $("xp-pl").textContent = "🪶 " + db.plumes;
  $("xp-bar").style.width = Math.round((db.xp - a) / (b - a) * 100) + "%";
  $("xp").title = `Encore ${b - db.xp} XP avant le niveau ${l + 1}`;
}
function gain(n, why) {
  if (!n) return; const before = lvlOf(db.xp); db.xp += n;
  const after = lvlOf(db.xp);
  if (after > before) {
    db.plumes += 10 * (after - before);
    if (db.bonus.week !== weekId()) db.bonus = {week: weekId(), n: 0};
    const add = Math.min(5 * (after - before), 20 - db.bonus.n); db.bonus.n += add;
    note(`Niveau ${after} ! +10 plumes` + (add ? ` et +${add} crédits bonus cette semaine.` : "."), "ok");
  }
  save(); renderXP();
}
const onceToday = key => { const t = today(); if (db.xpDay[key] === t) return false; db.xpDay[key] = t; return true; };
{ const last = db.lastSeen || 0, days = last ? (Date.now() - last) / DAY : 0; db.lastSeen = Date.now();
  for (const k in db.xpDay) if (db.xpDay[k] !== today()) delete db.xpDay[k];   // on ne garde que les clés du jour
  save(); if (days >= 2) { gain(10, "retour"); note("Content de te revoir ! +10 XP pour la reprise.", "ok"); } }

/* ---------- Lecture à voix haute ---------- */
let rate = 1; try { rate = Number(localStorage.getItem("alto-voix")) || 1; } catch (e) {}
function speak(text) {
  if (!("speechSynthesis" in window)) { note("La lecture à voix haute n'existe pas sur ce navigateur.", "warn"); return; }
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "fr-FR"; u.rate = rate; speechSynthesis.speak(u);
}
/* Le mot lu s'allume : on découpe le texte en mots, et la voix dit où elle en est (événement « boundary »).
   Si la voix ne le dit pas, on avance au rythme moyen de la lecture. Un mot caché est lu « blanc ». */
let kara = null;
function speakEl(el, done) {
  if (!("speechSynthesis" in window)) { note("La lecture à voix haute n'existe pas sur ce navigateur.", "warn"); return; }
  if (kara) kara.stop(); speechSynthesis.cancel();
  const parts = []; let said = "";
  const walk = node => [...node.childNodes].forEach(c => {
    if (c.nodeType === 3) { const fr = document.createDocumentFragment();
      c.textContent.split(/(\s+)/).forEach(w => { if (!w) return; if (/^\s+$/.test(w)) { fr.append(w); said += " "; return; }
        const sp = document.createElement("span"); sp.className = "w"; sp.textContent = w; fr.append(sp);
        parts.push({s: said.length, e: said.length + w.length, el: sp, len: w.length}); said += w; });
      c.replaceWith(fr);
    } else if (c.nodeType === 1) {
      if (c.classList.contains("hole")) { said += " "; parts.push({s: said.length, e: said.length + 5, el: c, len: 5}); said += "blanc "; }
      else if (c.classList.contains("w")) { parts.push({s: said.length, e: said.length + c.textContent.length, el: c, len: c.textContent.length}); said += c.textContent; }
      else walk(c);
    } });
  walk(el); if (!parts.length) return;
  let cur = -1, gotB = false, tm = null;
  const light = k => { if (k === cur || k < 0 || k >= parts.length) return; if (cur >= 0) parts[cur].el.classList.remove("speak"); cur = k; parts[k].el.classList.add("speak"); };
  const tick = k => { if (gotB || k >= parts.length) return; light(k); tm = setTimeout(() => tick(k + 1), (90 + 62 * parts[k].len) / rate); };
  const u = new SpeechSynthesisUtterance(said); u.lang = "fr-FR"; u.rate = rate;
  u.onboundary = e => { if (e.name && e.name !== "word") return; gotB = true; clearTimeout(tm); const k = parts.findIndex(x => e.charIndex < x.e); light(k < 0 ? parts.length - 1 : k); };
  u.onstart = () => tick(0);
  const end = () => { clearTimeout(tm); if (cur >= 0 && parts[cur]) parts[cur].el.classList.remove("speak"); cur = -1; kara = null; };
  u.onend = () => { end(); if (done) done(); }; u.onerror = end; kara = {stop: end};
  speechSynthesis.speak(u);
}
const sayNotion = (n, show) => { const t = tokens(n.text), h = new Set(n.holes); return t.map((w, i) => h.has(i) && !show ? " blanc " : w).join(""); };
$("lire").addEventListener("click", () => { if (queue[idx]) speakEl($("q-text")); });
document.querySelectorAll("#voix button").forEach(b => { b.classList.toggle("on", Number(b.dataset.v) === rate);
  b.addEventListener("click", () => { rate = Number(b.dataset.v); try { localStorage.setItem("alto-voix", rate); } catch (e) {} document.querySelectorAll("#voix button").forEach(x => x.classList.toggle("on", x === b)); speak("Voici la voix de lecture."); }); });

/* ---------- Espace entre les lettres (prouvé utile pour les dys) ---------- */
const ESP = [["0", "0"], [".06em", ".2em"], [".12em", ".4em"]];
function setEsp(i) { document.documentElement.style.setProperty("--ls", ESP[i][0]); document.documentElement.style.setProperty("--ws", ESP[i][1]);
  document.querySelectorAll("#esp button").forEach(b => b.classList.toggle("on", Number(b.dataset.e) === i)); try { localStorage.setItem("alto-esp", i); } catch (e) {} }
document.querySelectorAll("#esp button").forEach(b => b.addEventListener("click", () => setEsp(Number(b.dataset.e))));
try { setEsp(Number(localStorage.getItem("alto-esp")) || 0); } catch (e) { setEsp(0); }

/* ---------- Quiz ----------
   La bonne réponse = les mots cachés de la notion. Les 3 mauvaises = les mots cachés d'autres notions,
   de la même matière d'abord, et de longueur proche (pour que ce ne soit pas trop facile).
   Une notion à revoir ou nouvelle est notée dans l'algorithme : juste = « avec effort » (reconnaître est plus facile que retrouver), faux = « raté ». */
const answerOf = n => holeWords(n).join(" ");
function fillMats(sel) { const cur = sel.value; sel.replaceChildren(); const all = document.createElement("option"); all.value = ""; all.textContent = "Toutes les matières"; sel.append(all);
  matsWithNotions().forEach(m => { const o = document.createElement("option"); o.value = o.textContent = m; sel.append(o); }); if ([...sel.options].some(o => o.value === cur)) sel.value = cur; }
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function distractorsN(n, k = 3) {
  const ans = norm(answerOf(n)), L = ans.length, seen = new Set([ans]);
  return db.notions.filter(x => x !== n && answerOf(x)).map(x => ({a: answerOf(x), n: x, same: matOf(x) === matOf(n)}))
    .filter(x => { const k2 = norm(x.a); if (seen.has(k2)) return false; seen.add(k2); return true; })
    .sort((x, y) => (y.same - x.same) || ((chapOf(y.n) && chapOf(y.n) === chapOf(n)) - (chapOf(x.n) && chapOf(x.n) === chapOf(n))) || Math.abs(x.a.length - L) - Math.abs(y.a.length - L) || Math.random() - .5)
    .slice(0, k);
}
const distractors = (n, k = 3) => distractorsN(n, k).map(x => x.a);
/* Questions variées, sans IA. Elles viennent de la forme de la phrase :
   « X est … » → « Qu'est-ce que X ? » ; une phrase vraie ou rendue fausse (on échange le mot clé avec celui d'une autre notion) → « Vrai ou faux ? » ;
   un exemple trouvé dans le cours → « Quel exemple va avec X ? ». */
function defParts(n) {
  const t = n.text.trim().split(/\s+/), v = t.findIndex((w, i) => i > 0 && i < 6 && VERBS.has(clean(w)));
  if (v < 1) return null;
  const term = t.slice(0, v).join(" ").replace(/^(l['’]|le |la |les |un |une )/i, ""), def = t.slice(v + 1).join(" ").replace(/[.;:!]+$/, "");
  if (term.split(/\s+/).length > 4 || def.split(/\s+/).length < 3) return null;
  return {term, def};
}
const defOf = x => { const d = defParts(x); return d ? d.def : ""; };
const termOf = x => { const d = defParts(x); return d ? d.term : answerOf(x); };
function othersBy(n, f, k) {
  const seen = new Set([norm(f(n))]);
  return shuffle(db.notions.filter(x => x !== n && f(x))).map(x => ({a: f(x), n: x, same: matOf(x) === matOf(n)}))
    .filter(x => { const kk = norm(x.a); if (seen.has(kk)) return false; seen.add(kk); return true; })
    .sort((x, y) => y.same - x.same).slice(0, k);
}
const RXW = /^([^\p{L}\p{N}]*(?:(?:[lLdDjJnNsScCmMtT]|[qQ]u)['’])?)(.*?)([^\p{L}\p{N}]*)$/u;
function swapHoles(n, rep) { const t = tokens(n.text), h = [...n.holes].sort((a, b) => a - b);
  return t.map((w, i) => { if (!h.includes(i)) return w; if (i !== h[0]) return ""; const m = w.match(RXW) || ["", "", w, ""]; return m[1] + rep + m[3]; }).join("").replace(/\s{2,}/g, " "); }
function qTypes(n) {
  if (n.off || !n.holes.length || !answerOf(n)) return [];
  return db.niv === 3 || distractorsN(n, 2).length >= 2 ? ["trou"] : [];
}
let qz = {list: [], i: 0, ok: 0, last: "", cur: null};
function pool() { const m = $("tr-mat").value; return db.notions.filter(n => (!m || matOf(n) === m) && qTypes(n).length); }
function quizStart() {
  const now = Date.now(), p = pool().sort((a, b) => ((a.last ? a.due : 0) <= now ? 0 : 1) - ((b.last ? b.due : 0) <= now ? 0 : 1) || Math.random() - .5);
  if (p.length < 1 || db.notions.filter(n => answerOf(n)).length < 4) { note("Il faut au moins 4 notions pour les questions à trous.", "warn"); return; }
  qz = {list: p.slice(0, 10), i: 0, ok: 0, last: "", cur: null}; $("tr-end").hidden = true; $("qz").hidden = false; quizShow();
}
function quizShow() {
  const n = qz.list[qz.i], ty = qTypes(n); let t = ty[Math.floor(Math.random() * ty.length)];
  if (ty.length > 1 && t === qz.last) t = ty.find(x => x !== qz.last);          // on change de forme d'une question à l'autre
  qz.last = t; qz.cur = {t, n};
  $("qz-pos").textContent = `Question ${qz.i + 1} sur ${qz.list.length}`; $("qz-score").textContent = `${qz.ok} juste${qz.ok > 1 ? "s" : ""}`;
  $("qz-next").hidden = true; $("qz-why").hidden = true;
  const q = $("qz-q"), box = $("qz-c"); q.replaceChildren(); box.replaceChildren();
  const typed = db.niv === 3 && (t === "trou" || t === "def"); $("qz-type").hidden = !typed; box.hidden = typed;
  const k = db.niv === 1 ? 2 : 3, tag = txt => { const c = document.createElement("span"); c.className = "chip"; c.textContent = txt; return c; };
  let good = "", opts = [];
  if (t === "trou") { q.append(holeHTML(n, false)); good = answerOf(n); opts = distractorsN(n, k); }
  else if (t === "def") { q.append(tag("Définition"), " Qu'est-ce que « " + termOf(n) + " » ?"); good = defOf(n); opts = othersBy(n, defOf, k); }
  else if (t === "ex") { q.append(tag("Exemple"), " Quel exemple va avec « " + termOf(n) + " » ?"); good = n.ex; opts = othersBy(n, x => x.ex, k); }
  else {
    const d = distractorsN(n, 1)[0], vrai = Math.random() < .5 || !d;
    q.append(tag("Vrai ou faux ?"), " ", vrai ? n.text : swapHoles(n, d.a));
    qz.cur.good = vrai ? "Vrai" : "Faux"; qz.cur.other = vrai ? null : d.n;
    ["Vrai", "Faux"].forEach(a => { const b = document.createElement("button"); b.textContent = a; b.addEventListener("click", () => quizAnswer(b, a === qz.cur.good, a === "Vrai" ? qz.cur.other : null)); box.append(b); });
    return;
  }
  qz.cur.good = good;
  if (typed) { $("qz-in").value = ""; $("qz-in").disabled = false; $("qz-in").placeholder = t === "def" ? "Explique avec tes mots" : "Écris la réponse"; $("qz-in").focus(); return; }
  shuffle([{a: good, n: null}, ...opts]).forEach(o => { const b = document.createElement("button"); b.textContent = o.a; b.addEventListener("click", () => quizAnswer(b, o.a === good, o.n)); box.append(b); });
}
/* Expliquer l'erreur : on montre la phrase du cours. Si la réponse choisie appartient à une autre notion, on montre laquelle :
   c'est souvent là qu'est la confusion. */
function showWhy(n, good, other, typedAnswer) {
  const w = $("qz-why"); w.replaceChildren(); w.className = "why " + (good ? "ok" : "no");
  const h = document.createElement("b"); h.textContent = good ? "Juste ! Dans ton cours :" : "Pas tout à fait. Dans ton cours :"; w.append(h);
  const p = document.createElement("div"); p.append(holeHTML(n, true)); w.append(p);
  if (!good && typedAnswer) { const e = document.createElement("div"); e.textContent = "Réponse attendue : « " + typedAnswer + " »."; w.append(e); }
  if (!good && other) { const o = document.createElement("div"); o.className = "muted"; o.textContent = "Ce que tu as choisi vient d'une autre notion : « " + other.text + " »"; w.append(o); }
  if (n.ex && qz.cur.t !== "ex") { const e = document.createElement("div"); e.className = "muted"; e.textContent = "Exemple : " + n.ex; w.append(e); }
  const sr = document.createElement("div"); sr.className = "src"; sr.append(srcHTML(n)); w.append(sr);
  w.hidden = false;
}
function quizAnswer(btn, good, other) {
  if (!$("qz-next").hidden) return; const c = qz.cur, n = c.n, now = Date.now();
  [...$("qz-c").children].forEach(b => { if (b.textContent === c.good) b.classList.add("ok"); });
  if (btn) { if (!good) btn.classList.add("no"); } else $("qz-in").disabled = true;
  if (good) qz.ok++;
  if (c.t === "trou") $("qz-q").replaceChildren(holeHTML(n, true));
  showWhy(n, good, other, btn ? "" : c.good);
  if (!n.last || n.due <= now) { if (!n.last) db.newToday++; schedule(n, good ? "h" : 1, now); save(); }
  if (onceToday("n" + n.id)) gainN(1, "quiz");
  $("qz-next").hidden = false; $("qz-next").textContent = qz.i + 1 < qz.list.length ? "Suivante" : "Voir le score"; $("qz-next").focus();
}
$("qz-next").addEventListener("click", () => { qz.i++; if (qz.i < qz.list.length) quizShow(); else trFin(`${qz.ok} sur ${qz.list.length}`, qz.ok === qz.list.length ? "Parfait !" : "Les notions ratées reviendront plus tôt dans ta révision."); });
$("qz-ok").addEventListener("click", () => { const v = $("qz-in").value.trim(); if (!v) return; const c = qz.cur, said = new Set(wordsOf(v)); let good;
  if (c.t === "def") { const need = [...new Set(c.good.split(/\s+/).map(clean).filter(w => w.length >= 4 && !STOP.has(w)))]; good = need.length ? need.filter(w => found(said, w)).length / need.length >= 0.5 : found(said, c.good); }
  else good = found(said, c.good);
  quizAnswer(null, good, null); });
$("qz-in").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if ($("qz-next").hidden) $("qz-ok").click(); else $("qz-next").click(); } });
$("qz-lire").addEventListener("click", () => { if (qz.cur) speakEl($("qz-q")); });

/* ---------- Jeu « Associer » : 5 mots à relier à leur phrase. Pas de chrono. ---------- */
let mt = {sel: null, left: 0};
function matchStart() {
  const p = shuffle(db.notions.filter(n => !n.off && answerOf(n) && (!$("jx-mat").value || matOf(n) === $("jx-mat").value))).filter((n, i, a) => a.findIndex(x => norm(answerOf(x)) === norm(answerOf(n))) === i).slice(0, 5);
  if (p.length < 3) { note("Il faut au moins 3 notions dans cette matière pour jouer.", "warn"); return; }
  $("jx-end").hidden = true; $("qc").hidden = true; $("mt").hidden = false; mt = {sel: null, left: p.length};
  const L = $("mt-l"), R = $("mt-r"); L.replaceChildren(); R.replaceChildren();
  shuffle([...p]).forEach(n => { const b = document.createElement("button"); b.textContent = answerOf(n); b.dataset.id = n.id;
    b.addEventListener("click", () => { if (b.disabled) return; L.querySelectorAll("button").forEach(x => x.classList.remove("sel")); b.classList.add("sel"); mt.sel = b; }); L.append(b); });
  shuffle([...p]).forEach(n => { const b = document.createElement("button"); b.append(holeHTML(n, false)); b.dataset.id = n.id;
    b.addEventListener("click", () => {
      if (b.disabled || !mt.sel) { if (!mt.sel) note("Touche d'abord un mot à gauche.", "warn"); return; }
      if (mt.sel.dataset.id === b.dataset.id) { b.replaceChildren(holeHTML(n, true)); [b, mt.sel].forEach(x => { x.classList.remove("sel"); x.classList.add("ok"); x.disabled = true; }); mt.sel = null; mt.left--;
        if (!mt.left) setTimeout(() => jeuFin("Tout est relié !", "Bravo. Tu peux rejouer avec d'autres notions."), 500); }
      else { b.classList.add("no"); setTimeout(() => b.classList.remove("no"), 700); }
    }); R.append(b); });
}
function jeuFin(t, sub) {
  $("qc").hidden = true; $("mt").hidden = true; $("jx-end").hidden = false; $("jx-miss").hidden = true; $("jx-end-l").replaceChildren(); $("jx-end-t").textContent = t; $("jx-end-s").textContent = sub;
  if (onceToday("jeu-" + jx)) gainN(5, "jeu"); renderToday();
}
let jx = "quiz";
document.querySelectorAll("#jx-mode button").forEach(b => b.addEventListener("click", () => { jx = b.dataset.m; document.querySelectorAll("#jx-mode button").forEach(x => x.classList.toggle("on", x === b)); }));
$("jx-go").addEventListener("click", () => jx === "quiz" ? cqStart() : matchStart());
$("jx-again").addEventListener("click", () => jx === "quiz" ? cqStart() : matchStart());

/* ---------- Carte mentale faite par l'élève ----------
   L'élève écrit ses idées en liste (2 espaces ou un tiret = un niveau de plus).
   L'algorithme place la matière au centre, les idées principales en cercle, et leurs détails autour d'elles. */
db.maps = db.maps || {};
function parseOutline(text) {
  const root = {t: "", kids: []}, stack = [{lvl: -1, node: root}];
  text.split("\n").forEach(line => { if (!line.trim()) return;
    const m = line.match(/^(\s*)([-•*]\s*)?(.*)$/), lvl = Math.floor(m[1].replace(/\t/g, "  ").length / 2) + (m[2] && !m[1] ? 1 : 0);
    const node = {t: m[3].trim(), kids: []};
    while (stack.length > 1 && stack[stack.length - 1].lvl >= lvl) stack.pop();
    stack[stack.length - 1].node.kids.push(node); stack.push({lvl, node});
  });
  return root;
}
const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function wrapLines(t, max) { const out = []; let cur = ""; t.split(/\s+/).forEach(w => { if ((cur + " " + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }); if (cur) out.push(cur); return out.slice(0, 3); }
let BOX = [];
function bubble(x, y, t, kind, col) {
  const lines = wrapLines(t, kind === 0 ? 16 : kind === 1 ? 16 : 18), fs = kind === 0 ? 30 : kind === 1 ? 25 : 21, lh = fs * 1.25;
  const w = Math.max(...lines.map(l => l.length)) * fs * 0.56 + 28, h = lines.length * lh + 18;
  BOX.push([x - w / 2, y - h / 2, x + w / 2, y + h / 2]);
  const fill = kind === 0 ? ACCENT() : kind === 1 ? col : "#FFFFFF", fg = kind === 0 ? "#FFFFFF" : kind === 1 ? "#1E1A10" : "#251B33";
  return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${kind === 2 ? 12 : 18}" fill="${fill}" stroke="${kind === 2 ? col : "none"}" stroke-width="2"/>` +
    `<text x="${x}" y="${y - (lines.length - 1) * lh / 2 + fs * 0.35}" text-anchor="middle" font-family="Arial" font-size="${fs}" font-weight="${kind < 2 ? 700 : 400}" fill="${fg}">` +
    lines.map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join("") + `</text>`;
}
const CMC = ["#C9B6FF", "#FFD84D", "#A6E3BC", "#FFB08A", "#B8D4FF", "#F6B6D0"];
function drawMap() {
  const m = $("cm-mat").value, tree = parseOutline($("cm-text").value);
  let top = tree.kids; if (top.length === 1 && top[0].kids.length) { tree.t = top[0].t; top = top[0].kids; }
  const W = 1000, H = 760, cx = W / 2, cy = H / 2, k = Math.max(top.length, 1), R1 = 210, R2 = 340;
  let lines = "", nodes = ""; BOX = [];
  top.forEach((c, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / k, x = cx + Math.cos(a) * R1 * 1.25, y = cy + Math.sin(a) * R1, col = CMC[i % CMC.length];
    lines += `<path d="M${cx} ${cy} Q ${(cx + x) / 2} ${(cy + y) / 2 - 20} ${x} ${y}" stroke="${col}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    const n = c.kids.length, spread = Math.min(Math.PI / k * 1.6, 1.4);
    c.kids.forEach((g, j) => { const b = a + (n > 1 ? (j / (n - 1) - .5) * spread : 0), gx = cx + Math.cos(b) * R2 * 1.32, gy = cy + Math.sin(b) * R2;
      lines += `<path d="M${x} ${y} L ${gx} ${gy}" stroke="${col}" stroke-width="3" fill="none"/>`; nodes += bubble(gx, gy, g.t, 2, col); });
    nodes += bubble(x, y, c.t, 1, col);
  });
  nodes += bubble(cx, cy, tree.t || m || "Ma carte", 0);
  let x0 = Math.min(...BOX.map(b => b[0])) - 16, y0 = Math.min(...BOX.map(b => b[1])) - 16, x1 = Math.max(...BOX.map(b => b[2])) + 16, y1 = Math.max(...BOX.map(b => b[3])) + 16;
  if (x1 - x0 < 900) { const c = (x0 + x1) / 2; x0 = c - 450; x1 = c + 450; }      // jamais trop zoomé quand il y a peu d'idées
  if (y1 - y0 < 640) { const c = (y0 + y1) / 2; y0 = c - 320; y1 = c + 320; }
  $("cm-svg").innerHTML = `<svg viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" role="img" aria-label="Carte mentale">${lines}${nodes}</svg>`;
  db.maps[m || "_"] = $("cm-text").value; save();
}
let cmT; $("cm-text").addEventListener("input", () => { clearTimeout(cmT); cmT = setTimeout(() => { drawMap(); if ($("cm-text").value.split("\n").filter(x => x.trim()).length >= 5 && onceToday("carte-" + $("cm-mat").value)) gain(5, "carte"); }, 300); });
$("cm-mat").addEventListener("change", () => { $("cm-text").value = db.maps[$("cm-mat").value || "_"] || ""; drawMap(); });
$("cm-notions").addEventListener("click", () => {
  const m = $("cm-mat").value, ns = db.notions.filter(n => !m || matOf(n) === m);
  if (!ns.length) { note("Pas encore de notion dans cette matière.", "warn"); return; }
  const prev = $("cm-text").value.trim();
  if (db.niv === 3) { $("cm-text").value = (m || "Mes cours") + "\n"; drawMap(); $("cm-text").focus(); note("Difficile : seulement le sujet. Écris tout de mémoire, puis « Vérifier ma carte ».", "ok"); return; }
  $("cm-text").value = (prev ? prev + "\n" : (m || "Mes cours") + "\n") + ns.slice(0, 8).map(n => "  " + answerOf(n) + (db.niv === 1 && keyWords(n).length ? "\n    " + keyWords(n).slice(0, 3).join(", ") : "")).join("\n");
  drawMap(); note("Voilà une base. Réécris chaque idée avec tes mots : c'est ça qui fait retenir.", "ok");
});
$("cm-print").addEventListener("click", () => { const sh = $("sheet"); sh.innerHTML = `<h2>Notéa · Carte mentale · ${esc($("cm-mat").value || "")}</h2>` + $("cm-svg").innerHTML; window.print(); });

/* ---------- Niveau de difficulté (Facile, Moyen, Difficile) ----------
   Feuille blanche : Facile = des indices (premières lettres) ; Difficile = expliquer en peu de mots.
   Quiz : Facile = 2 choix ; Moyen = 4 choix ; Difficile = écrire la réponse soi-même.
   Carte mentale : Facile = les idées et des détails ; Moyen = les grandes idées ; Difficile = juste le sujet.
   Plus c'est difficile, plus on gagne d'XP (×1, ×1,5, ×2). */
db.niv = db.niv || 2;
const NIVX = {1: 1, 2: 1.5, 3: 2};
const gainN = (n, why) => gain(Math.round(n * NIVX[db.niv]), why);
function setNiv(v) { db.niv = v; save(); document.querySelectorAll(".niv button").forEach(b => b.classList.toggle("on", Number(b.dataset.n) === v));
  if (db.cmMode !== "mem") $("cm-help").textContent = v === 1 ? "Facile : tes notions et des mots-clés sont déjà là. Réécris-les avec tes mots." : v === 2 ? "Moyen : seulement les grandes idées. À toi d'écrire les détails." : "Difficile : juste le sujet. Écris tout de mémoire, puis appuie sur « Vérifier ma carte »."; }
document.querySelectorAll(".niv button").forEach(b => b.addEventListener("click", () => { setNiv(Number(b.dataset.n)); if (!$("tab-blanche").hidden) fbStart(); }));
setNiv(db.niv);
const firstLetters = w => w.split(/\s+/).map(x => x.slice(0, 2) + "…").join(" ");
const maxWords = n => Math.max(6, Math.round(keyWords(n).length * 1.5));
$("fb-text").addEventListener("input", () => { if (fb.mode !== "une" || db.niv !== 3 || !fb.one) return;
  const c = $("fb-text").value.trim().split(/\s+/).filter(Boolean).length, m = maxWords(fb.one);
  $("fb-count").textContent = `${c} mot${c > 1 ? "s" : ""} sur ${m} au maximum`; $("fb-count").style.color = c > m ? "var(--bad)" : ""; });
$("cm-check").addEventListener("click", () => {
  const m = $("cm-mat").value, ns = db.notions.filter(n => answerOf(n) && (!m || matOf(n) === m)), said = new Set(wordsOf($("cm-text").value));
  if (!ns.length) { note("Choisis une matière qui a des notions.", "warn"); return; }
  const res = ns.map(n => [n, found(said, answerOf(n))]), got = res.filter(x => x[1]).length, box = $("cm-res"); box.replaceChildren();
  const h = document.createElement("h3"); h.textContent = `${got} notion${got > 1 ? "s" : ""} sur ${ns.length} dans ta carte`; box.append(h);
  res.sort((a, b) => a[1] - b[1]).forEach(([n, ok]) => { const r = document.createElement("div"); r.className = "res " + (ok ? "ok" : "no"); r.append(ok ? "✓ " : "✗ ", holeHTML(n, true)); box.append(r); });
  const miss = res.filter(x => !x[1]).map(x => x[0]);
  if (miss.length) { const row = document.createElement("div"); row.className = "row";
    const b1 = document.createElement("button"); b1.textContent = "Ajouter les oublis à ma carte";
    b1.addEventListener("click", () => { $("cm-text").value = $("cm-text").value.replace(/\s*$/, "") + "\n" + miss.map(n => "  " + answerOf(n) + " (oublié)").join("\n"); drawMap(); b1.disabled = true; });
    const b2 = document.createElement("button"); b2.className = "primary"; b2.textContent = `Revoir ${miss.length > 1 ? "les " + miss.length + " oublis" : "l'oubli"} aujourd'hui`;
    b2.addEventListener("click", () => { const now = Date.now(); miss.forEach(n => { n.due = now; }); save(); renderToday(); b2.disabled = true; note("Les oublis sont dans ta révision du jour.", "ok"); });
    row.append(b1, b2); box.append(row); }
  box.hidden = false; if (onceToday("cmv-" + m)) gainN((db.cmMode === "mem" ? 5 : 3) + got, "carte vérifiée");
});
/* Carte de mémoire (conseillé) : faire la carte sans le cours, puis comparer. Se souvenir fait plus retenir que recopier. */
db.cmMode = db.cmMode || "mem";
function setCmMode(v) { db.cmMode = v; save(); document.querySelectorAll("#cm-mode button").forEach(b => b.classList.toggle("on", b.dataset.c === v));
  $("cm-notions").hidden = v === "mem"; document.querySelector("#tab-carte .niv").hidden = v === "mem"; $("cm-check").textContent = v === "mem" ? "Comparer avec le cours" : "Vérifier ma carte";
  if (v === "mem") $("cm-help").textContent = "De mémoire : écris tout ce que tu sais, sans regarder le cours. Puis appuie sur « Comparer avec le cours ». C'est ce qui fait le plus retenir."; else setNiv(db.niv); }
document.querySelectorAll("#cm-mode button").forEach(b => b.addEventListener("click", () => setCmMode(b.dataset.c)));
setCmMode(db.cmMode);

/* ---------- « Je bloque » : en mode Apprendre, on peut revoir le cours (on gagne alors moitié moins d'XP) ---------- */
$("fb-help").addEventListener("click", () => {
  const box = $("fb-cours"), show = box.hidden; box.hidden = !show; $("fb-help").textContent = show ? "Cacher le cours" : "Je bloque : voir le cours";
  if (show) { fb.help = true; box.replaceChildren(); (fb.mode === "une" && fb.one ? [fb.one] : fb.targets).forEach(n => { const p = document.createElement("p"); p.append(holeHTML(n, true)); box.append(p); }); }
});

/* ---------- Examen blanc ----------
   Questions tirées au hasard dans la matière, selon la forme du vrai examen :
   QCM (4 choix), texte à trous (on écrit le mot), question ouverte (on explique : il faut au moins la moitié des idées clés).
   Pas de correction pendant l'examen. Note sur 20 à la fin. Les erreurs reviennent dans la révision du jour. */
let ex = null, exTimer = null;
const exSel = id => document.querySelector(`#${id} button.on`);
["ex-form", "ex-nb", "ex-dur"].forEach(id => document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener("click", () => { document.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle("on", x === b)); })));
function exStart() {
  const m = $("ex-mat").value, form = exSel("ex-form").dataset.f, nb = Number(exSel("ex-nb").dataset.n);
  let dur = Number(exSel("ex-dur").dataset.d) * 60; if (dur && $("ex-tt").checked) dur = Math.round(dur * 4 / 3);
  const ns = shuffle(db.notions.filter(n => !n.off && answerOf(n) && (!m || matOf(n) === m)));
  if (ns.length < 4) { note("Il faut au moins 4 notions dans cette matière pour un examen.", "warn"); return; }
  const kinds = ["qcm", "trou", "ouv"];
  const qs = ns.slice(0, nb).map((n, i) => ({n, k: form === "mix" ? (keyWords(n).length >= 2 ? kinds[i % 3] : kinds[i % 2]) : (form === "ouv" && keyWords(n).length < 2 ? "trou" : form), a: null}));
  ex = {qs: mqExam(qs, m, form, nb), i: 0, end: dur ? Date.now() + dur * 1000 : 0};
  $("ex-conf").hidden = true; $("ex-res").hidden = true; $("ex-run").hidden = false; exShow();
  clearInterval(exTimer); exTimer = setInterval(exTick, 1000); exTick();
}
function exTick() {
  if (!ex) return; if (!ex.end) { $("ex-time").textContent = ""; return; }
  const left = Math.max(0, Math.round((ex.end - Date.now()) / 1000)); $("ex-time").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  if (!left) { exSave(); exFinish("Temps écoulé."); }
}
function exShow() {
  const q = ex.qs[ex.i], n = q.n; $("ex-pos").textContent = `Question ${ex.i + 1} sur ${ex.qs.length}`;
  if (q.k === "mq") { $("ex-kind").textContent = "Explique avec tes mots."; $("ex-c").hidden = true; $("ex-in").hidden = true; $("ex-ta").hidden = false; $("ex-q").textContent = q.mq.enonce; $("ex-ta").value = ""; $("ex-next").textContent = ex.i + 1 < ex.qs.length ? "Valider et continuer" : "Rendre ma copie"; $("ex-ta").focus(); return; }
  $("ex-kind").textContent = q.k === "qcm" ? "Choisis la bonne réponse." : q.k === "trou" ? "Écris le mot qui manque." : "Explique avec tes mots.";
  $("ex-c").hidden = q.k !== "qcm"; $("ex-in").hidden = q.k !== "trou"; $("ex-ta").hidden = q.k !== "ouv";
  if (q.k === "qcm" && q.g === undefined) { q.g = null; for (const ty of shuffle(qPlan(n).filter(t => t !== "affirm" || !factOf(n)))) { const z = makeQ(n, ty, 3); if (z) { q.g = z; break; } } }
  if (q.k === "ouv") { const f = factOf(n); $("ex-q").textContent = f ? `Explique avec tes mots : « ${f.term} »` + (n.ex ? ", et donne un exemple." : ".") : `Que sais-tu sur « ${answerOf(n)} » ?`; }
  else if (q.k === "qcm" && q.g) $("ex-q").textContent = q.g.text + (q.g.quote ? " « " + q.g.quote + " »" : "");
  else $("ex-q").replaceChildren(holeHTML(n, false));
  $("ex-in").value = ""; $("ex-ta").value = ""; const box = $("ex-c"); box.replaceChildren();
  if (q.k === "qcm") shuffle(q.g ? [q.g.good, ...q.g.opts.map(o => o.a)] : [answerOf(n), ...distractors(n)]).forEach(a => { const b = document.createElement("button"); b.textContent = a;
    b.addEventListener("click", () => { box.querySelectorAll("button").forEach(x => x.classList.toggle("sel", x === b)); q.a = a; }); box.append(b); });
  $("ex-next").textContent = ex.i + 1 < ex.qs.length ? "Valider et continuer" : "Rendre ma copie";
  (q.k === "trou" ? $("ex-in") : q.k === "ouv" ? $("ex-ta") : $("ex-next")).focus();
}
function exSave() { const q = ex.qs[ex.i]; if (q.k === "trou") q.a = $("ex-in").value.trim(); if (q.k === "ouv" || q.k === "mq") q.a = $("ex-ta").value.trim(); }
function exCorrect(q) {
  if (q.k === "mq") { if (!q.a) { moteurNote(q.mq, 0, "vide"); return false; } const r = NoteaMoteur.evaluerReponse(q.mq, q.a); moteurNote(q.mq, r.score, r.erreur); return r.correct; }
  if (!q.a) return false; const n = q.n;
  if (q.k === "qcm") return q.a === (q.g ? q.g.good : answerOf(n));
  if (q.k === "trou") return found(new Set(wordsOf(q.a)), answerOf(n));
  const kw = keyWords(n), said = new Set(wordsOf(q.a)); return kw.filter(w => found(said, w)).length >= Math.ceil(kw.length / 2);
}
function exFinish(why) {
  clearInterval(exTimer); $("ex-run").hidden = true; $("ex-res").hidden = false; $("ex-conf").hidden = false;
  const res = ex.qs.map(q => [q, exCorrect(q)]), ok = res.filter(x => x[1]).length, sur20 = Math.round(ok / res.length * 200) / 10;
  $("ex-note").textContent = `${String(sur20).replace(".", ",")} / 20`;
  $("ex-sub").textContent = (why ? why + " " : "") + `${ok} bonne${ok > 1 ? "s" : ""} réponse${ok > 1 ? "s" : ""} sur ${res.length}. Les erreurs reviennent dans ta révision du jour.`;
  const box = $("ex-list"); box.replaceChildren();
  res.forEach(([q, good]) => { const r = document.createElement("div"); r.className = "res " + (good ? "ok" : "no");
    r.append(good ? "✓ " : "✗ "); if (q.mq) r.append(q.mq.enonce + " → " + q.mq.reponseAttendue); else r.append(holeHTML(q.n, true)); if (!good && q.a) { const y = document.createElement("div"); y.className = "muted"; y.textContent = "Ta réponse : " + q.a; r.append(y); } box.append(r);
    if (!good && q.n) { q.n.due = Date.now(); if (q.n.last) q.n.D = clampD(q.n.D + 0.5); } });
  save(); renderToday(); if (onceToday("examen")) gainN(10 + ok, "examen blanc"); ex = null;
}
$("ex-go").addEventListener("click", exStart);
$("ex-again").addEventListener("click", () => { $("ex-res").hidden = true; $("ex-conf").scrollIntoView({block: "start"}); });
$("ex-next").addEventListener("click", () => { exSave(); if (ex.i + 1 < ex.qs.length) { ex.i++; exShow(); } else exFinish(""); });
$("ex-stop").addEventListener("click", () => { exSave(); exFinish("Examen arrêté."); });
$("ex-in").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("ex-next").click(); } });
$("ex-lire").addEventListener("click", () => { const q = ex && ex.qs[ex.i]; if (q) speak(q.k === "ouv" || q.k === "mq" ? $("ex-q").textContent : sayNotion(q.n, false)); });

/* ---------- Visite personnalisée : les outils que l'élève utilise le plus passent en premier ---------- */
db.use = db.use || {};
const TOOLS = {
  notions: ["Importer un cours", "Photo, PowerPoint, PDF, Word ou texte."],
  blanche: ["Feuille blanche", "Écris tout ce dont tu te souviens, puis vérifie."],
  discu: ["Discussion", "L'IA t'explique, te questionne, ou tu expliques à un enfant."],
  carte: ["Carte mentale", "Tes idées, avec tes mots, en carte."],
  jeux: ["Quiz", "Une carte qui se retourne, avec la correction expliquée."],
  trous: ["Questions à trous", "Retrouve le mot caché de ton cours."],
  cartes: ["Mes cartes", "Recto, verso : tes cartes de révision."],
  examen: ["Examen blanc", "Comme le jour J, avec une note sur 20."],
  planning: ["Mon planning", "Tes échéances et ta semaine."],
  lecture: ["Lire et écouter", "Ton cours lu à voix haute, mot par mot."],
  carnet: ["Carnet de mots", "Les mots difficiles, avec tes définitions."]
};
function useTool(k) { if (!TOOLS[k]) return; const u = db.use[k] || {n: 0, last: 0}; u.n++; u.last = Date.now(); db.use[k] = u; save(); }
function renderTiles() {
  const order = Object.keys(TOOLS).filter(k => !(k === "carte" && matchMedia("(max-width: 900px)").matches));
  const sc = k => (db.use[k] ? db.use[k].n : 0) + (db.use[k] && Date.now() - db.use[k].last < 3 * DAY ? 3 : 0);
  let ks = order.slice().sort((a, b) => sc(b) - sc(a) || order.indexOf(a) - order.indexOf(b));
  if (!db.notions.length) ks = ["notions", ...ks.filter(k => k !== "notions")];
  const box = $("tuiles"); box.replaceChildren();
  ks.slice(0, 4).forEach((k, i) => { const b = document.createElement("button"); b.className = "tile" + (i === 0 ? " hot" : ""); b.dataset.go = k;
    const t = document.createElement("b"); t.textContent = TOOLS[k][0]; const d = document.createElement("span"); d.textContent = TOOLS[k][1]; if (k === "planning") d.id = "tuile-plan";
    b.append(t, d); b.addEventListener("click", () => { if (k === "notions") impOpen = true; tab(k); if (k === "notions") $("imp-card").scrollIntoView({block: "start"}); }); box.append(b); });
  const fav = ks.find(k => db.use[k] && db.use[k].n >= 3);
  $("pref").hidden = !fav; if (fav) $("pref").textContent = "Tes outils préférés en premier. Celui que tu utilises le plus : " + TOOLS[fav][0] + ".";
}

/* ---------- Discussion d'apprentissage ----------
   3 modes : l'IA explique ; l'IA pose des questions ; l'élève explique à un « enfant » joué par l'IA (méthode Feynman).
   Moteurs, dans l'ordre : l'IA de Chrome sur l'appareil, Claude avec une clé, sinon on ouvre Claude.ai avec la demande prête. */
const MODEL = "claude-haiku-5-5";
const DC_BASE = "Tu aides un élève qui est peut-être dys ou TDAH. Français simple, phrases courtes, une idée par phrase, pas de Markdown. Appuie-toi seulement sur les notions données. Ne fais jamais de longs paragraphes. Encourage sans en faire trop.";
const DC_MODES = {
  exp: ["L'IA t'explique le cours, simplement, avec un exemple. Ensuite, elle te pose une petite question pour vérifier.", "Explique les notions une par une, en 3 à 4 phrases courtes, avec un exemple de la vie de tous les jours. Après chaque explication, pose une seule question simple pour vérifier que l'élève a compris, puis attends sa réponse."],
  qst: ["L'IA te pose une question à la fois. Tu réponds. Elle te dit ce qui est juste, ce qui manque, puis passe à la suivante.", "Pose une seule question à la fois sur les notions, de la plus facile à la plus difficile. Attends la réponse. Ensuite : dis en une phrase ce qui est juste, en une phrase ce qui manque, puis pose la question suivante. Ne donne pas la réponse avant que l'élève ait essayé."],
  enf: ["Tu expliques le cours à Léo, 10 ans, joué par l'IA. Il te demande « ça veut dire quoi ? » dès que tu utilises un mot compliqué. À la fin, il te dit ce qu'il a compris.", "Tu joues Léo, un enfant curieux de 10 ans. L'élève doit t'expliquer les notions. Réponds comme un enfant, en 1 ou 2 phrases. Si l'élève utilise un mot difficile ou un mot du cours sans l'expliquer, demande « ça veut dire quoi, … ? ». Si l'explication est fausse ou incomplète, pose une question naïve qui l'aide à corriger. Quand l'élève écrit « fini », sors du rôle et donne un bilan en 3 lignes : ce qui était clair, l'idée qui manquait, un mot à mieux expliquer."]
};
let dc = {mode: "exp", turns: [], sys: ""};
const dcKey = () => { try { return localStorage.getItem("notea-cle") || ""; } catch (e) { return ""; } };
async function dcEngine() {
  let lm = "unavailable"; try { if (typeof LanguageModel !== "undefined") lm = await LanguageModel.availability({expectedInputs: [{type: "text", languages: ["fr"]}], expectedOutputs: [{type: "text", languages: ["fr"]}]}); } catch (e) {}
  return iaVoie() ? "api" : lm !== "unavailable" ? "builtin" : "copy";   // avec un compte ou une clé, on prend Claude
}
function bubble2(role, text) { const d = document.createElement("div"); d.className = "bub " + (role === "user" ? "moi" : "ia");
  const w = document.createElement("b"); w.className = "who"; w.textContent = role === "user" ? "Toi" : dc.mode === "enf" ? "Léo" : "Notéa"; const t = document.createElement("span"); t.textContent = text; d.append(w, t); $("dc-thread").append(d); $("dc-thread").scrollTop = 1e9; return t; }
async function dcAsk() {
  const eng = await dcEngine(); $("dc-status").textContent = "…"; $("dc-send").disabled = true;
  try {
    if (eng === "builtin") {
      const o = {expectedInputs: [{type: "text", languages: ["fr"]}], expectedOutputs: [{type: "text", languages: ["fr"]}]};
      const sess = await LanguageModel.create({...o, initialPrompts: [{role: "system", content: dc.sys}, ...dc.turns.slice(0, -1)]});
      const t = bubble2("assistant", "…"); let out = "";
      for await (const ch of sess.promptStreaming(dc.turns[dc.turns.length - 1].content, o)) { out = ch.startsWith(out) ? ch : out + ch; t.textContent = out; }
      dc.turns.push({role: "assistant", content: out});
    } else if (eng === "api") {
      const r = await iaCall({system: dc.sys, messages: dc.turns, maxTokens: 4000, effort: "low", serveur: {fn: "discuter", body: {mode: dc.mode, contexte: dc.ctx, messages: dc.turns}}}), out = r.text.trim(); bubble2("assistant", out); dc.turns.push({role: "assistant", content: out});
    } else {
      const text = dc.sys + "\n\n" + dc.turns.map(t => (t.role === "user" ? "Élève : " : "Toi : ") + t.content).join("\n\n");
      try { await navigator.clipboard.writeText(text); } catch (e) {}
      const p = document.createElement("p"); p.className = "msg warn"; const a = document.createElement("a"); a.href = "https://claude.ai/new?q=" + encodeURIComponent(text.slice(0, 6000)); a.target = "_blank"; a.rel = "noopener"; a.textContent = "Continuer la discussion dans Claude";
      p.append("Pas d'IA sur cet appareil. ", a, " (la demande est copiée)."); $("dc-thread").append(p);
    }
    if (eng !== "copy" && onceToday("discu-" + dc.mode)) gain(5, "discussion");
  } catch (e) { $("dc-status").textContent = "La réponse n'a pas pu venir : " + iaErreur(e); $("dc-send").disabled = false; return; }
  $("dc-status").textContent = ""; $("dc-send").disabled = false; $("dc-in").focus();
}
function dcStart() {
  const m = $("dc-mat").value, ns = db.notions.filter(n => !m || matOf(n) === m).slice(0, 25);
  if (!ns.length) { note("Ajoute d'abord un cours dans « Mes cours ».", "warn"); return; }
  dc.turns = []; dc.notions = ns; $("dc-thread").replaceChildren(); $("dc-chat").hidden = false; $("dc-hard").hidden = true;
  dc.ctx = ((m ? "Matière : " + m + "\n" : "") + ns.map(n => "- " + n.text).join("\n") + iaContexte(m) + moteurContexte(m)).slice(0, 20000);   // pour le serveur (il refuse au-delà)
  dc.sys = DC_BASE + " " + DC_MODES[dc.mode][1] + "\n\nLes notions du cours" + (m ? " de " + m : "") + " :\n" + ns.map(n => "- " + n.text).join("\n") + iaContexte(m) + moteurContexte(m);
  const first = dc.mode === "enf" ? "Bonjour ! Je suis prêt à t'expliquer mon cours." : dc.mode === "qst" ? "Pose-moi la première question." : "Explique-moi la première notion.";
  dc.turns.push({role: "user", content: first}); bubble2("user", first); dcAsk(); useTool("discu");
}
/* Mots difficiles : en mode « enfant », on signale les mots longs recopiés du cours sans être expliqués */
function hardWords(text) {
  const course = new Set(dc.notions.flatMap(n => wordsOf(n.text)).filter(w => w.length >= 7));
  return [...new Set(norm(text).split(/[^a-z]+/).filter(w => w.length >= 8 && course.has(stem(w))))].slice(0, 4);
}
$("dc-send").addEventListener("click", () => {
  const v = $("dc-in").value.trim(); if (!v) return; $("dc-in").value = "";
  if (dc.mode === "enf") { const h = hardWords(v); $("dc-hard").hidden = !h.length; if (h.length) $("dc-hard").textContent = "Mots peut-être trop difficiles pour un enfant : " + h.join(", ") + ". Essaie de les dire autrement."; }
  dc.turns.push({role: "user", content: v}); bubble2("user", v); dcAsk();
});
$("dc-in").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("dc-send").click(); } });
$("dc-new").addEventListener("click", dcStart);
$("dc-go").addEventListener("click", dcStart);
function dcHelp() { $("dc-help").textContent = DC_MODES[dc.mode][0]; $("dc-in").placeholder = dc.mode === "enf" ? "Explique à Léo… (écris « fini » pour avoir ton bilan)" : "Écris ta réponse…"; }
document.querySelectorAll("#dc-mode button").forEach(b => b.addEventListener("click", () => { dc.mode = b.dataset.m; document.querySelectorAll("#dc-mode button").forEach(x => x.classList.toggle("on", x === b)); dcHelp(); }));
dcHelp();
{ const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) $("dc-voice").hidden = true; else { let r = null;
  $("dc-voice").addEventListener("click", () => { if (r) { r.stop(); return; } r = new SR(); r.lang = "fr-FR"; r.continuous = true;
    r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) $("dc-in").value += (/\S$/.test($("dc-in").value) ? " " : "") + e.results[i][0].transcript.trim(); };
    r.onend = () => { r = null; $("dc-voice").textContent = "Parler au micro"; }; r.start(); $("dc-voice").textContent = "Arrêter la dictée"; }); } }

/* ---------- Imprimer ---------- */
document.querySelectorAll("[data-print]").forEach(b => b.addEventListener("click", () => {
  const list = b.dataset.print === "jour" ? todayQueue().filter(n => n.text) : db.notions;
  if (!list.length) { note("Il n'y a rien à imprimer pour l'instant.", "warn"); return; }
  const sh = $("sheet"); sh.replaceChildren();
  const h = document.createElement("h2"); h.textContent = "Notéa · Texte à trous · " + new Date().toLocaleDateString("fr-FR");
  const ol = document.createElement("ol"); list.forEach(n => { const li = document.createElement("li"); li.append(holeHTML(n, false)); ol.append(li); });
  const ans = document.createElement("div"); ans.className = "answers";
  const h2 = document.createElement("h2"); h2.textContent = "Les réponses";
  const ol2 = document.createElement("ol"); list.forEach(n => { const li = document.createElement("li"); li.append(holeHTML(n, true)); ol2.append(li); });
  ans.append(h2, ol2); sh.append(h, ol, ans); window.print();
}));

/* ---------- Onglets, réglages ---------- */
/* Chaque écran : son titre et son groupe. Sur téléphone, la barre du bas montre les groupes. */
const TABS = {
  jour: ["Accueil", "accueil"],
  planning: ["Agenda & planning", "agenda"], progres: ["Mes progrès", "agenda"], imprimer: ["Imprimer", "agenda"],
  notions: ["Mes cours", "cours"], comprendre: ["Comprendre", "cours"], lecture: ["Lire et écouter", "cours"],
  notes: ["Mon carnet", "carnet"], cartes: ["Mes cartes", "carnet"], jeux: ["Quiz", "carnet"], trous: ["Questions à trous", "carnet"], blanche: ["Feuille blanche", "carnet"], carte: ["Carte mentale", "carnet"], examen: ["Examen blanc", "carnet"], carnet: ["Carnet de mots", "carnet"],
  discu: ["Prof particulier", "prof"],
  acces: ["Accessibilité", "reglages"], reglages: ["Paramètres", "reglages"], mesdonnees: ["Mes données", "reglages"]
};
const lastIn = {};
function tab(name, fromNav) {
  if (!TABS[name]) return;
  if (!fromNav && location.hash.slice(1) !== name) { try { history.pushState(null, "", "#" + name); } catch (e) {} }
  const g = TABS[name][1]; lastIn[g] = name;
  const mark = (b, on) => { if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); };
  const sub = $("subnav"), sib = Object.keys(TABS).filter(k => TABS[k][1] === g); sub.replaceChildren();
  sib.forEach(k => { const b = document.createElement("button"); b.type = "button"; b.dataset.tab = k; b.textContent = TABS[k][0]; sub.append(b); });
  sub.dataset.n = sib.length;
  document.querySelectorAll("[data-tab]").forEach(b => mark(b, b.dataset.tab === name));
  document.querySelectorAll("[data-group]").forEach(b => mark(b, b.dataset.group === g));
  $("page-t").textContent = TABS[name][0]; pageHead(name); document.title = TABS[name][0] + " · Notéa"; window.scrollTo(0, 0);
  Object.keys(TABS).forEach(t => { $("tab-" + t).hidden = t !== name; });
  if (name !== "lecture") lecStop();
  if (name === "notes") { renderList(); renderExams(); }
  if (name === "notions") { renderFolders(); const dl = $("mat-list"); dl.replaceChildren(); matsWithNotions().forEach(m => { const o = document.createElement("option"); o.value = m; dl.append(o); }); }
  if (name === "jour") { renderTiles(); renderToday(); }
  if (name === "discu") { fillMats($("dc-mat")); dcEngine().then(e => { $("dc-chip").textContent = e === "builtin" ? "IA sur l'appareil" : e === "api" ? (iaVoie() === "compte" ? "IA : mon compte Notéa" : "IA : Claude (clé)") : "IA : via Claude.ai"; }); }
  if (["blanche", "jeux", "trous", "cartes", "examen", "carte", "planning", "lecture", "carnet"].includes(name)) useTool(name);
  if (name === "blanche") { fbFill(); fbStart(); }
  if (name === "jeux") { fillMats($("jx-mat")); fillChapSel($("jx-chap"), $("jx-mat").value); }
  if (name === "trous") fillMats($("tr-mat"));
  if (name === "cartes") renderCartes();
  fillDL();
  if (name === "examen") fillMats($("ex-mat"));
  if (name === "carte") { fillMats($("cm-mat")); $("cm-mat").options[0].textContent = "Choisis une matière"; $("cm-text").value = db.maps[$("cm-mat").value || "_"] || ""; drawMap(); }
  if (name === "planning") { renderMats(); renderActs(); renderPlan(); }
  if (name === "lecture") renderLecture();
  if (name === "carnet") renderCarnet();
  if (name === "progres") renderProgres();
  if (name === "comprendre") renderComprendre();
  if (name === "reglages") { renderIAReglages(); compteCharger(); }
  if (name === "mesdonnees") renderMesDonnees();
  if (name === "discu") renderProf();
  if (name === "reglages") renderVac();
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-tab]"); if (b) { tab(b.dataset.tab); return; }
  const g = e.target.closest("[data-group]"); if (g) tab(Object.keys(TABS).find(k => TABS[k][1] === g.dataset.group));
});
function note(t, k) { const n = $("note"); if (!t) { n.hidden = true; return; } n.className = "msg " + (k || "ok"); n.textContent = t; n.hidden = false; clearTimeout(note.t); note.t = setTimeout(() => n.hidden = true, 5000); }
$("exam").value = db.exam || "";
$("exam").addEventListener("change", () => { db.exam = $("exam").value; save(); renderToday(); });
function plannedToday() { try { const d = plan()[0]; return Math.max(10, d.items.filter(x => x.type === "rev").reduce((s, x) => s + x.t - x.f, 0)); } catch (e) { return 10; } }
const setMin = m => { db.minutes = m; save(); document.querySelectorAll("#minutes button").forEach(b => b.classList.toggle("on", Number(b.dataset.m) === m)); renderToday(); };
document.querySelectorAll("#minutes button").forEach(b => b.addEventListener("click", () => setMin(Number(b.dataset.m))));
setMin(db.minutes === 0 ? 0 : (db.minutes || 10));
let size = 20; try { size = Number(localStorage.getItem("alto-taille")) || 20; } catch (e) {}
const setSize = v => { size = Math.min(40, Math.max(16, v)); document.documentElement.style.setProperty("--size", size + "px"); try { localStorage.setItem("alto-taille", size); } catch (e) {} };
$("moins").addEventListener("click", () => setSize(size - 2)); $("plus").addEventListener("click", () => setSize(size + 2)); setSize(size);
const LH = {"lh-n": 1.6, "lh-l": 2, "lh-xl": 2.5};
function setLh(id) { document.documentElement.style.setProperty("--lh", LH[id] || 1.6); Object.keys(LH).forEach(k => $(k).classList.toggle("on", k === id)); try { localStorage.setItem("alto-interligne", id); } catch (e) {} }
Object.keys(LH).forEach(k => $(k).addEventListener("click", () => setLh(k)));
try { setLh(localStorage.getItem("alto-interligne") || "lh-n"); } catch (e) { setLh("lh-n"); }

/* ---------- Dictée partout : un bouton « Dicter » à côté de chaque case où l'on écrit ---------- */
const SRC = window.SpeechRecognition || window.webkitSpeechRecognition;
function addMic(id, where) {
  const el = $(id); if (!SRC || !el) return;
  const b = document.createElement("button"); b.type = "button"; b.className = "mic"; b.textContent = "Dicter"; b.setAttribute("aria-label", "Dicter au lieu d'écrire"); let rec = null;
  b.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new SRC(); rec.lang = "fr-FR"; rec.continuous = true;
    rec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { const v = el.value; el.value = v + (/\S$/.test(v) ? " " : "") + e.results[i][0].transcript.trim(); el.dispatchEvent(new Event("input", {bubbles: true})); } };
    rec.onend = () => { rec = null; b.textContent = "Dicter"; b.classList.remove("on"); }; rec.onerror = rec.onend;
    try { rec.start(); b.textContent = "Arrêter la dictée"; b.classList.add("on"); el.focus(); } catch (e) { rec = null; }
  });
  (where ? $(where) : null) ? $(where).append(b) : el.insertAdjacentElement("afterend", b);
}
addMic("qz-in"); addMic("ex-in"); addMic("ex-ta"); addMic("ajout"); addMic("imp-text"); addMic("cm-text", "cm-check-row");

/* ---------- Règle de lecture : une bande claire suit le doigt ou la souris, le reste de la page est assombri ---------- */
let regle = false; try { regle = localStorage.getItem("alto-regle") === "1"; } catch (e) {}
function placeRuler(y) {
  const lh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lh")) || 1.6, band = Math.max(56, size * lh * 1.9), top = Math.max(0, y - band / 2);
  $("ruler-t").style.top = "0"; $("ruler-t").style.height = top + "px"; $("ruler-b").style.top = (top + band) + "px"; $("ruler-b").style.bottom = "0";
}
function setRegle(v) { regle = v; $("ruler-t").hidden = $("ruler-b").hidden = !v; document.querySelectorAll("#regle button").forEach(b => b.classList.toggle("on", (b.dataset.r === "1") === v));
  try { localStorage.setItem("alto-regle", v ? "1" : "0"); } catch (e) {} if (v) placeRuler(innerHeight / 2); }
document.querySelectorAll("#regle button").forEach(b => b.addEventListener("click", () => setRegle(b.dataset.r === "1")));
document.addEventListener("pointermove", e => { if (regle) placeRuler(e.clientY); }, {passive: true});
document.addEventListener("touchmove", e => { if (regle && e.touches[0]) placeRuler(e.touches[0].clientY); }, {passive: true});
document.addEventListener("focusin", e => { if (regle && e.target.getBoundingClientRect) { const r = e.target.getBoundingClientRect(); placeRuler(r.top + r.height / 2); } });
setRegle(regle);

/* Premier passage : on prend tout seul les passages marqués dans Écoute */
/* À chaque ouverture : les nouveaux passages marqués dans Écoute arrivent tout seuls */
$("vide-imp").addEventListener("click", () => { impOpen = true; tab("notions"); $("imp-card").scrollIntoView({block: "start"}); });
renderTiles(); renderToday(); renderXP();
$("top-date").textContent = new Date().toLocaleDateString("fr-FR", {weekday: "long", day: "numeric", month: "long"});

/* =====================================================================
   Les nouveaux outils de Notéa : lire avec la voix, « Je ne comprends pas »,
   carnet de mots, familles de mots. Puis les réglages d'affichage.
   ===================================================================== */
function ACCENT() { return "#5B3E8C"; }
db.cours = db.cours || []; db.mots = db.mots || []; db.moteur = db.moteur || {};
/* Le texte d'un cours importé est gardé, pour pouvoir le relire et l'écouter. */
function saveCours(mat, text) {
  if (!text || db.cours.some(c => c.text === text)) return;
  const id = uid(); db.cours.push({id, mat, text, created: Date.now(), marks: []});
  if (mot) { db.moteur = db.moteur || {}; db.moteur[id] = compacterMoteur(mot); }      // ce que le moteur a compris, pour la suite (révisions, quiz)
}

/* ---------- Moteur de compréhension (js/moteur/) : ce que Notéa a compris du cours ---------- */
let mot = null;
function lancerMoteur(text, mat) {
  mot = null; $("mot-d").hidden = true;
  if (typeof NoteaMoteur === "undefined") return;
  try { mot = NoteaMoteur.analyserCours([{nom: mat || "Cours", type: impPhoto ? "photo" : "texte", texte: text}], {matiere: mat || undefined}); renderMoteur(); }
  catch (e) { console.error("moteur", e); mot = null; }
}
function compacterMoteur(a) {
  const g = a.graphe;
  return {v: a.version, date: a.date, matiere: a.classification.matiere.valeur, chapitre: a.classification.chapitre.valeur, ordre: a.ordre.ordre, carte: a.schemas.carteMentale.plan,
    noeuds: g.noeuds.map(n => ({id: n.id, cle: n.cle, nom: n.nom, importance: n.importance, difficulte: n.difficulte, definition: n.definition, prerequis: n.prerequis, page: n.pages[0], statut: n.statut})),
    aretes: g.aretes.map(r => ({de: r.de, vers: r.vers, type: r.type, statut: r.statut, effet: r.effet, page: r.page, preuve: String(r.preuve || "").slice(0, 200)})),
    questions: a.questions.slice(0, 40)};
}
function renderMoteur() {
  const a = mot, box = $("mot"), g = a.graphe, nom = id => g.byId.get(id).nom, M = NoteaMoteur;
  const p = (t, cls) => el("p", cls, t), h = t => el("h3", "mot-h", t);
  const cl = a.classification, m = cl.matiere;
  const lignes = [p("Matière : " + (m.valeur || "je ne sais pas") + (m.statut === "confirme" ? " (tu l'as écrite)" : m.statut === "infere" ? " (devinée d'après : " + (m.pourquoi || "").replace(/^mots typiques : /, "") + ")" : " (pas assez d'indices)"), "muted")];
  if (cl.chapitre.valeur) lignes.push(p("Chapitre : " + cl.chapitre.valeur, "muted"));
  if (cl.niveau.valeur) lignes.push(p("Niveau : " + cl.niveau.valeur + " (" + cl.niveau.pourquoi + ")", "muted"));
  a.alertes.slice(0, 3).forEach(x => lignes.push(p(x.message, "msg warn")));
  // Notions clés : importance et difficulté sont deux notes différentes.
  const top = [...g.noeuds].sort((x, y) => y.importance - x.importance).slice(0, 6);
  const liste = el("ol", "mot-list"); top.forEach(n => { const li = el("li"), b = el("b", null, n.nom), s = el("span", "muted", ` · importance ${n.importance}/100 · difficulté ${n.difficulte}/100`);
    li.append(b, s, el("div", "mot-why", "Pourquoi : " + n.pertinence.pourquoi + (n.difficulte >= 30 ? ". Difficile : " + n.difficulteDetail.pourquoi : ""))); liste.append(li); });
  const ordre = el("ol", "mot-list"); a.ordre.ordre.map(id => g.byId.get(id)).filter(n => n.importance >= 15).slice(0, 10).forEach(n => ordre.append(el("li", null, n.nom + (n.prerequis.length ? " (après : " + n.prerequis.map(nom).join(", ") + ")" : ""))));
  const liens = el("ul", "mot-list"); g.aretes.filter(r => r.statut === M.STATUT.CONFIRME && r.type !== "associe").slice(0, 10).forEach(r => liens.append(el("li", null,
    `« ${nom(r.de)} » ${r.effet ? (r.type === "provoque" ? "entraîne une " + r.effet + " de" : M.NOMS_REL[r.type]) : M.NOMS_REL[r.type]} « ${nom(r.vers)} »` + (r.page ? " (page " + r.page + ")" : ""))));
  const bCarte = el("button", null, "Voir en carte mentale");
  bCarte.addEventListener("click", () => { tab("carte"); $("cm-text").value = a.schemas.carteMentale.plan; drawMap(); note("Voilà la carte que Notéa a construite. Réécris-la avec tes mots : c'est ça qui fait retenir.", "ok"); });
  box.replaceChildren(...lignes, h("Les notions les plus importantes"), liste, h("Dans quel ordre les apprendre"), ordre, ...(liens.children.length ? [h("Les liens écrits dans le cours"), liens] : []), el("div", "row", null));
  box.lastChild.append(bCarte);
  $("mot-n").textContent = ` · ${a.resume.notions} notions, ${a.resume.relationsConfirmees} liens, ${a.resume.questions} questions prêtes`;
  $("mot-d").hidden = false;
}

/* ---------- Lire et écouter ----------
   Le cours est découpé en phrases. La voix lit, le mot lu s'allume.
   Une phrase touchée ouvre une petite barre : l'écouter, dire « Je ne comprends pas », ou garder un mot. */
let lec = {c: null, items: [], sel: null, playing: false, tk: 0};
function lecStop() {
  lec.playing = false; lec.tk++;
  if (kara) kara.stop(); if ("speechSynthesis" in window) speechSynthesis.cancel();
  const b = $("lec-play"); if (b) b.textContent = "Lire tout le cours";
}
function lecPlay(i) {
  if (!lec.playing || i >= lec.items.length) { lecStop(); return; }
  const it = lec.items[i], tk = ++lec.tk;
  it.el.scrollIntoView({block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  speakEl(it.el, () => { if (lec.playing && tk === lec.tk) lecPlay(i + 1); });
}
function lecSelect(it) {
  lec.items.forEach(x => x.el.classList.toggle("sel", x === it)); lec.sel = it;
  $("lec-bar").hidden = !it; $("lec-words").hidden = true;
  if (it) { const on = lec.c.marks.includes(it.text); $("lec-nc").setAttribute("aria-pressed", on); $("lec-nc").textContent = on ? "✓ Marquée « Je ne comprends pas »" : "Je ne comprends pas"; }
}
function lecShow() {
  lecStop();
  const c = db.cours.find(x => x.id === $("lec-cours").value) || db.cours[db.cours.length - 1]; lec.c = c; lec.items = [];
  const box = $("lec-text"); box.replaceChildren();
  splitSentences(c.text).forEach(par => { const p = document.createElement("p");
    par.forEach(t => { const sp = document.createElement("span"); sp.className = "lsent" + (c.marks.includes(t) ? " nc" : ""); sp.textContent = t; sp.tabIndex = 0; sp.setAttribute("role", "button");
      const it = {text: t, el: sp}; lec.items.push(it);
      const pick = () => lecSelect(lec.sel === it ? null : it);
      sp.addEventListener("click", pick); sp.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      p.append(sp, " "); });
    box.append(p); });
  lecSelect(null);
}
function renderMarks() {
  const box = $("nc-list"); box.replaceChildren(); let n = 0;
  db.cours.forEach(c => c.marks.forEach(t => { n++;
    const r = document.createElement("div"); r.className = "nrow";
    const l = document.createElement("div"), p = document.createElement("p"), w = document.createElement("p"); p.className = "t"; p.textContent = t; w.className = "when"; w.textContent = c.mat; l.append(p, w);
    const a = document.createElement("div"); a.className = "row";
    const b1 = document.createElement("button"); b1.textContent = "Demander une explication"; b1.addEventListener("click", () => dcExplain(t, c.mat));
    const b2 = document.createElement("button"); b2.textContent = "J'ai compris"; b2.addEventListener("click", () => { c.marks = c.marks.filter(x => x !== t); save(); if (onceToday("compris-" + t.slice(0, 20))) gain(2, "compris"); renderLecture(); });
    a.append(b1, b2); r.append(l, a); box.append(r); }));
  $("nc-card").hidden = !n; $("nc-n").textContent = n + " phrase" + (n > 1 ? "s" : "");
}
function renderLecture() {
  const s = $("lec-cours"), cur = s.value; s.replaceChildren();
  db.cours.slice().reverse().forEach(c => { const o = document.createElement("option"); o.value = c.id; o.textContent = c.mat + " · " + new Date(c.created).toLocaleDateString("fr-FR"); s.append(o); });
  if ([...s.options].some(o => o.value === cur)) s.value = cur;
  $("lec-vide").hidden = !!db.cours.length; $("lec-card").hidden = !db.cours.length;
  if (db.cours.length) lecShow();
  renderMarks();
}
$("lec-cours").addEventListener("change", lecShow);
$("lec-play").addEventListener("click", () => {
  if (lec.playing) { lecStop(); return; }
  if (!("speechSynthesis" in window)) { note("La lecture à voix haute n'existe pas sur ce navigateur.", "warn"); return; }
  lec.playing = true; $("lec-play").textContent = "Arrêter la lecture"; lecPlay(lec.sel ? lec.items.indexOf(lec.sel) : 0);
});
$("lec-say").addEventListener("click", () => { if (!lec.sel) return; lecStop(); speakEl(lec.sel.el); });
$("lec-nc").addEventListener("click", () => {
  const it = lec.sel; if (!it) return; const on = lec.c.marks.includes(it.text);
  lec.c.marks = on ? lec.c.marks.filter(x => x !== it.text) : lec.c.marks.concat(it.text); save();
  it.el.classList.toggle("nc", !on); lecSelect(it); renderMarks();
  if (!on) note("C'est noté. Tu retrouves cette phrase plus bas, dans « Ce que je ne comprends pas ».", "ok");
});
$("lec-mot").addEventListener("click", () => {
  const it = lec.sel, box = $("lec-words"); if (!it) return; box.replaceChildren(); const seen = new Set();
  it.text.split(/\s+/).forEach(w => { const c = core(w), k = norm(c); if (c.length < 3 || STOP.has(clean(w)) || seen.has(k)) return; seen.add(k);
    const b = document.createElement("button"); b.className = "chipbtn"; b.textContent = c; b.addEventListener("click", () => { addMot(c, lec.c.mat, it.text); b.disabled = true; }); box.append(b); });
  box.hidden = false;
});
$("lec-del").addEventListener("click", () => {
  if (!lec.c || !confirm("Enlever ce cours de la lecture ? Tes notions restent dans ta révision.")) return;
  if (db.moteur && lec.c) delete db.moteur[lec.c.id];        // l'analyse du cours part avec lui
  db.cours = db.cours.filter(c => c !== lec.c); save(); renderLecture();
});
$("lec-imp").addEventListener("click", () => { impOpen = true; tab("notions"); $("imp-card").scrollIntoView({block: "start"}); });

/* Demander une explication : la discussion s'ouvre sur la phrase qui bloque. */
function dcExplain(text, mat) {
  lecStop(); tab("discu");
  if ([...$("dc-mat").options].some(o => o.value === mat)) $("dc-mat").value = mat;
  dc.mode = "exp"; document.querySelectorAll("#dc-mode button").forEach(x => x.classList.toggle("on", x.dataset.m === "exp")); dcHelp();
  const ns = db.notions.filter(n => matOf(n) === mat).slice(0, 25);
  dc.turns = []; dc.notions = ns; $("dc-thread").replaceChildren(); $("dc-chat").hidden = false; $("dc-hard").hidden = true;
  dc.sys = DC_BASE + " L'élève ne comprend pas une phrase de son cours. Explique-la en 3 ou 4 phrases courtes, avec des mots simples et un exemple de la vie de tous les jours. Explique chaque mot difficile. Puis pose une seule question simple pour vérifier qu'il a compris."
    + (ns.length ? "\n\nLes notions du cours de " + mat + " :\n" + ns.map(n => "- " + n.text).join("\n") : "") + iaContexte(mat) + moteurContexte(mat);
  const first = "Je ne comprends pas cette phrase : « " + text + " »";
  dc.turns.push({role: "user", content: first}); bubble2("user", first); dcAsk(); useTool("discu");
}

/* ---------- Carnet de mots ----------
   L'élève garde les mots difficiles et écrit la définition avec ses mots.
   Famille de mots : les mots de ses cours qui commencent par la même racine (à vérifier par l'élève). */
function addMot(w, mat, src) {
  w = core(w).trim(); if (!w) return;
  if (db.mots.some(m => norm(m.w) === norm(w))) { note("« " + w + " » est déjà dans ton carnet.", "warn"); return; }
  db.mots.push({id: uid(), w, def: "", mat: mat || "", src: src || "", created: Date.now()}); save();
  if (onceToday("mot-" + norm(w))) gain(1, "mot");
  note("« " + w + " » est dans ton carnet de mots.", "ok");
}
function famille(w) {
  const k = stem(norm(w)); if (k.length < 5) return [];
  const root = k.slice(0, Math.max(4, Math.min(6, k.length - 2))), seen = new Set([norm(w)]), out = [];
  db.cours.forEach(c => c.text.split(/\s+/).forEach(x => { const cw = core(x), n2 = norm(cw);
    if (n2.length >= 4 && n2.startsWith(root) && !seen.has(n2)) { seen.add(n2); out.push(cw.toLowerCase()); } }));
  return out.slice(0, 6);
}
function renderCarnet() {
  const box = $("mots"); box.replaceChildren();
  $("mots-n").textContent = db.mots.length + " mot" + (db.mots.length > 1 ? "s" : "");
  if (!db.mots.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "Ton carnet est vide. Ajoute un mot ici, ou touche une phrase dans « Lire et écouter »."; box.append(p); return; }
  db.mots.slice().reverse().forEach(m => {
    const r = document.createElement("div"); r.className = "mot";
    const head = document.createElement("div"); head.className = "row";
    const b = document.createElement("b"); b.className = "motw"; b.textContent = m.w;
    const say = document.createElement("button"); say.textContent = "🔊 Écouter"; say.setAttribute("aria-label", "Écouter le mot " + m.w); say.addEventListener("click", () => speak(m.w + (m.def ? ". " + m.def : "")));
    head.append(b, say); if (m.mat) { const c = document.createElement("span"); c.className = "chip"; c.textContent = m.mat; head.append(c); }
    r.append(head);
    if (m.src) { const s = document.createElement("p"); s.className = "muted"; s.textContent = "Dans ton cours : « " + m.src + " »"; r.append(s); }
    const fam = famille(m.w);
    if (fam.length) { const f = document.createElement("div"); f.className = "kwrow"; const l = document.createElement("span"); l.className = "lab"; l.textContent = "Même famille ?"; f.append(l);
      fam.forEach(x => { const c = document.createElement("span"); c.className = "chip kw2"; c.textContent = x; f.append(c); }); r.append(f); }
    const lab = document.createElement("label"); lab.htmlFor = "mot-" + m.id; lab.className = "muted"; lab.textContent = "Ma définition, avec mes mots";
    const ta = document.createElement("textarea"); ta.id = "mot-" + m.id; ta.value = m.def; ta.placeholder = "Ça veut dire…";
    ta.addEventListener("input", () => { m.def = ta.value; save(); });
    const acts = document.createElement("div"); acts.className = "row";
    const rev = document.createElement("button"); rev.textContent = m.rev ? "✓ Dans ma révision" : "Mettre en révision"; rev.disabled = !!m.rev;
    rev.addEventListener("click", () => {
      if (m.def.trim().split(/\s+/).length < 2) { note("Écris d'abord ta définition (au moins 2 mots).", "warn"); ta.focus(); return; }
      const n = makeNotion(m.w + " : " + m.def.trim(), "manuel", (m.mat || "Carnet de mots") + " · carnet");
      n.holes = m.w.split(/\s+/).map((_, i) => i * 2); db.notions.push(n); m.rev = true; save(); renderToday(); renderCarnet();
      note("« " + m.w + " » est dans ta révision du jour.", "ok");
    });
    const del = document.createElement("button"); del.textContent = "Supprimer"; del.addEventListener("click", () => { db.mots = db.mots.filter(x => x !== m); save(); renderCarnet(); noteUndo("« " + m.w + " » est supprimé.", () => { db.mots.push(m); save(); renderCarnet(); }); });
    acts.append(rev, del); r.append(lab, ta, acts); box.append(r); addMic("mot-" + m.id);
  });
}
$("mot-add").addEventListener("click", () => { const v = $("mot-new").value.trim(); if (!v) return; addMot(v, "", ""); $("mot-new").value = ""; renderCarnet(); });
$("mot-new").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("mot-add").click(); } });

/* ---------- Réglages d'affichage : thème, police ---------- */
const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
function setTheme(v) { if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
  document.querySelectorAll("#theme button").forEach(b => b.classList.toggle("on", b.dataset.t === v)); lsSet("notea-theme", v); }
document.querySelectorAll("#theme button").forEach(b => b.addEventListener("click", () => setTheme(b.dataset.t)));
setTheme(lsGet("notea-theme", "auto"));
function setPolice(v) { document.documentElement.dataset.font = v;
  document.querySelectorAll("#police button").forEach(b => b.classList.toggle("on", b.dataset.f === v)); lsSet("notea-police", v); }
document.querySelectorAll("#police button").forEach(b => b.addEventListener("click", () => setPolice(b.dataset.f)));
setPolice(lsGet("notea-police", "systeme"));

/* ---------- Clé pour la discussion (facultatif) : elle reste sur cet appareil ---------- */
$("cle").value = dcKey() ? "••••••••" : "";
$("cle-ok").addEventListener("click", () => { const v = $("cle").value.trim(); if (v.startsWith("•")) return;
  if (v) lsSet("notea-cle", v); else { try { localStorage.removeItem("notea-cle"); } catch (e) {} }
  $("cle").value = v ? "••••••••" : ""; note(v ? "Clé enregistrée sur cet appareil." : "Clé enlevée.", "ok"); });

/* ---------- Mes données : tout est sur cet appareil. On peut sauvegarder, reprendre ou tout effacer. ---------- */
$("data-out").addEventListener("click", () => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], {type: "application/json"}));
  a.download = "notea-sauvegarde-" + today() + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$("data-in").addEventListener("change", async () => {
  const f = $("data-in").files[0]; if (!f) return;
  try { const o = JSON.parse(await f.text()); if (!o || !Array.isArray(o.notions)) throw new Error("format");
    if (!confirm("Remplacer les données de cet appareil par cette sauvegarde ?")) return;
    localStorage.setItem(KEY, JSON.stringify(o)); location.reload();
  } catch (e) { note("Ce fichier n'est pas une sauvegarde Notéa.", "err"); }
  $("data-in").value = "";
});
$("data-in").previousElementSibling.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("data-in").click(); } });
$("data-del").addEventListener("click", () => {
  if (!confirm("Effacer tous tes cours, tes notions et ta progression sur cet appareil ? C'est définitif.")) return;
  try { localStorage.removeItem(KEY); } catch (e) {} location.reload();
});

/* =====================================================================
   Moins de friction, plus de rappel actif.
   ===================================================================== */
const VERSION = "1.11";

/* ---------- Un message avec « Annuler » : on peut se tromper sans risque ---------- */
function noteUndo(t, fn) {
  note(t, "ok"); const b = document.createElement("button"); b.textContent = "Annuler"; b.style.marginLeft = "12px";
  b.addEventListener("click", () => { fn(); note("C'est annulé.", "ok"); }); $("note").append(b);
  clearTimeout(note.t); note.t = setTimeout(() => { $("note").hidden = true; }, 9000);
}

/* ---------- La file du jour : on mélange les matières (ça fait mieux retenir que tout faire d'un bloc) ---------- */
var DAY_MAX = 20;                                  // jamais plus de 20 notions par jour : le retard s'étale sur plusieurs jours
function interleave(list) {
  const by = new Map(); list.forEach(n => { const m = matOf(n); if (!by.has(m)) by.set(m, []); by.get(m).push(n); });
  const cols = [...by.values()], out = [];
  for (let i = 0; out.length < list.length; i++) cols.forEach(c => { if (c[i]) out.push(c[i]); });
  return out;
}
function onVacation() { return !!db.vac && today() <= db.vac; }

/* ---------- Rappel actif : écrire ou dicter la réponse avant de la voir (facultatif) ---------- */
db.recall = db.recall || "tete";
function setRecall(v) { db.recall = v; save(); document.querySelectorAll("#rappel button").forEach(b => b.classList.toggle("on", b.dataset.r === v)); }
document.querySelectorAll("#rappel button").forEach(b => b.addEventListener("click", () => setRecall(b.dataset.r)));
setRecall(db.recall);
function cardExtras(n) {
  const ec = !!n.enonce || (db.recall === "ecrit" && n.holes.length > 0); if (!n.enonce) $("q-in").placeholder = "Écris ou dicte le mot caché, puis Entrée";
  $("q-type").hidden = !ec; $("q-in").value = ""; $("q-fb").hidden = true;
  $("leech").hidden = !((n.lapses || 0) >= 4);
  if (ec) $("q-in").focus();
}
function revealExtras(n) {
  const v = $("q-in").value.trim(); $("q-type").hidden = true;
  if (n.enonce) { mqFeedback(n, v); return; }
  if (db.recall !== "ecrit" || !v) return;
  const ok = found(new Set(wordsOf(v)), answerOf(n)), fb = $("q-fb");
  fb.className = "msg " + (ok ? "ok" : "warn"); fb.hidden = false;
  fb.textContent = ok ? "✓ Tu avais juste. À toi de dire si c'était facile ou avec effort." : "✗ Pas tout à fait : tu as écrit « " + v + " ». Compare avec la réponse surlignée.";
  document.querySelector(ok ? ".g2" : ".g1").focus();
}
$("q-in").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); reveal(); } });
addMic("q-in");
$("leech-go").addEventListener("click", () => { const n = queue[idx]; if (!n) return; endSession(); dcExplain(n.text, matOf(n)); });

/* ---------- Annuler la dernière note (comme dans Anki) ---------- */
let snap = null;
function takeSnap(n) { snap = {n, copy: JSON.parse(JSON.stringify(n)), idx, done, stats: Object.assign({}, stats), qlen: queue.length, newToday: db.newToday, log: (db.log || []).length}; $("undo").hidden = false; }
$("undo").addEventListener("click", () => {
  if (!snap || $("seance").hidden) return;
  Object.keys(snap.n).forEach(k => { delete snap.n[k]; }); Object.assign(snap.n, snap.copy);
  queue.length = snap.qlen; idx = snap.idx; done = snap.done; stats = snap.stats; db.newToday = snap.newToday; if (db.log) db.log.length = snap.log;
  snap = null; $("undo").hidden = true; save(); showCard();
});

/* ---------- Premier pas : un cours d'exemple, pour comprendre l'appli en 1 minute ---------- */
const DEMO = `LE DROIT DE PROPRIÉTÉ

Le droit de propriété est le droit de jouir et de disposer des choses de la manière la plus absolue. L'usus est le droit d'utiliser la chose. Le fructus est le droit de percevoir les fruits de la chose. L'abusus est le droit de vendre ou de détruire la chose.
Par exemple, Paul loue son appartement à Marie pour 600 euros par mois : il exerce son fructus.

L'usufruit

L'usufruit désigne le droit d'utiliser un bien et d'en percevoir les revenus sans en être propriétaire. Le nu-propriétaire conserve seulement l'abusus. À retenir : l'usufruitier doit conserver la substance de la chose. La servitude est une charge imposée à un immeuble au profit d'un autre immeuble.`;
$("demo").addEventListener("click", () => {
  impOpen = true; tab("notions"); $("imp-mat").value = "Droit civil (exemple)"; $("imp-text").value = DEMO; $("imp-read").click();
  note("Voilà un cours d'exemple. Notéa a surligné l'essentiel. Appuie sur « Créer les notions », en bas.", "ok");
});
$("bv-imp").addEventListener("click", () => { impOpen = true; tab("notions"); $("imp-card").scrollIntoView({block: "start"}); });

/* ---------- Mes progrès : ce que je retiens, ce qui arrive. Jamais de reproche, jamais de « série perdue ». ---------- */
function statTile(big, label) { const d = document.createElement("div"); d.className = "stat"; const b = document.createElement("b"); b.textContent = big; const s = document.createElement("span"); s.textContent = label; d.append(b, s); return d; }
function renderProgres() {
  const now = Date.now(), live = db.notions.filter(n => !finished(n, now) && !n.off), seen = live.filter(n => n.last), fresh = live.length - seen.length;
  const solid = seen.filter(n => n.S >= 21).length, mem = seen.length ? Math.round(seen.reduce((s, n) => s + retr(n, now), 0) / seen.length * 100) : 0;
  const box = $("pg-stats"); box.replaceChildren();
  $("pg-vide").hidden = !!live.length; $("pg-card").hidden = $("pg-week-card").hidden = $("pg-mat-card").hidden = !live.length;
  if (!live.length) return;
  box.append(statTile(seen.length ? mem + " %" : "–", "de tes notions revues, tu t'en souviens aujourd'hui (estimation)"),
    statTile(String(solid), "notion" + (solid > 1 ? "s" : "") + " bien ancrée" + (solid > 1 ? "s" : "") + " (souvenir de plus de 3 semaines)"),
    statTile(String(seen.length - solid), "en cours d'apprentissage"), statTile(String(fresh), "pas encore vue" + (fresh > 1 ? "s" : "")));
  const log = (db.log || []).filter(x => x[0] > now - 30 * DAY);
  $("pg-ok").textContent = log.length >= 5 ? `Sur tes ${log.length} dernières réponses (30 jours), tu as retrouvé la réponse ${Math.round(log.filter(x => x[1] > 1).length / log.length * 100)} fois sur 100. Le but est autour de 90 : en dessous, ce n'est pas grave, les notions reviennent juste plus tôt.` : "Fais quelques révisions : tes résultats apparaîtront ici.";
  // les 7 prochains jours
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const wk = $("pg-week"); wk.replaceChildren(); const counts = [];
  for (let d = 0; d < 7; d++) { const a = new Date(d0); a.setDate(d0.getDate() + d); const b = new Date(a); b.setDate(a.getDate() + 1);
    counts.push([a, seen.filter(n => d === 0 ? n.due < b.getTime() : n.due >= a.getTime() && n.due < b.getTime()).length]); }
  const max = Math.max(1, ...counts.map(c => c[1]));
  counts.forEach(([a, c], d) => { const r = document.createElement("div"); r.className = "pbar";
    const l = document.createElement("span"); l.textContent = d === 0 ? "Aujourd'hui" : d === 1 ? "Demain" : a.toLocaleDateString("fr-FR", {weekday: "long"});
    const t = document.createElement("span"); t.className = "track"; const i = document.createElement("i"); i.style.width = Math.round(Math.min(c, DAY_MAX) / Math.max(max, 1) * 100) + "%"; t.append(i);
    const v = document.createElement("b"); v.textContent = c + " notion" + (c > 1 ? "s" : ""); r.append(l, t, v); wk.append(r); });
  // par matière
  const mb = $("pg-mats"); mb.replaceChildren();
  matsWithNotions().forEach(m => { const ns = live.filter(n => matOf(n) === m), sn = ns.filter(n => n.last); if (!ns.length) return;
    const r = document.createElement("div"); r.className = "pbar"; const l = document.createElement("span"); l.textContent = m;
    const pc = sn.length ? Math.round(sn.reduce((s, n) => s + retr(n, now), 0) / sn.length * 100) : 0;
    const t = document.createElement("span"); t.className = "track"; const i = document.createElement("i"); i.style.width = pc + "%"; t.append(i);
    const v = document.createElement("b"); v.textContent = sn.length ? pc + " %" : "à commencer"; r.append(l, t, v); mb.append(r); });
  const hard = live.filter(n => (n.lapses || 0) >= 4).length;
  $("pg-hard").hidden = !hard; $("pg-hard").textContent = `${hard} notion${hard > 1 ? "s résistent" : " résiste"} (ratée${hard > 1 ? "s" : ""} 4 fois ou plus). Essaie de ${hard > 1 ? "les" : "la"} reformuler avec tes mots dans « Mes cours », ou demande une explication.`;
}

/* ---------- Mode vacances : pas de révision, pas de retard à rattraper d'un coup ---------- */
function renderVac() { $("vac").value = db.vac || ""; $("vac-off").hidden = !onVacation(); $("vac-t").textContent = onVacation() ? "Mode vacances jusqu'au " + new Date(db.vac + "T12:00:00").toLocaleDateString("fr-FR", {day: "numeric", month: "long"}) + "." : "Choisis ta date de retour. Au retour, les notions reviennent petit à petit."; }
$("vac").addEventListener("change", () => { db.vac = $("vac").value; save(); renderVac(); renderToday(); });
$("vac-off").addEventListener("click", () => { db.vac = ""; save(); renderVac(); renderToday(); });
renderVac();

/* ---------- Thème clair ou sombre, en un geste, depuis le haut de la page ---------- */
const isDark = () => (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
const nextTheme = () => isDark() ? "light" : document.documentElement.dataset.theme === "blanc" ? "dark" : "blanc";
function paintThemeBtn() { const l = {light: "Mode clair", blanc: "Mode blanc", dark: "Mode sombre"}[nextTheme()]; $("theme-quick-t").textContent = l; $("theme-quick").setAttribute("aria-label", "Passer en " + l.toLowerCase()); }
$("theme-quick").addEventListener("click", () => { setTheme(nextTheme()); paintThemeBtn(); });
document.querySelectorAll("#theme button").forEach(b => b.addEventListener("click", paintThemeBtn));
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintThemeBtn);
paintThemeBtn();
$("version").textContent = "Version " + VERSION;


/* =====================================================================
   Version 1.2 : les écrans de la maquette.
   Accueil, dossiers de cours, carnet de notions, prof particulier, emploi du temps.
   ===================================================================== */
var impOpen = false;
function svgIc(n) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "ic"); s.setAttribute("aria-hidden", "true"); const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#i-" + n); s.append(u); return s; }
function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
function mastery(ns, now) { return ns.length ? Math.round(ns.reduce((s, n) => s + retr(n, now), 0) / ns.length * 100) : 0; }

/* ---------- L'en-tête de chaque page : un retour clair, un titre, une phrase ---------- */
const SUBS = {jour: "Aujourd'hui : un petit moment, rien de plus.", planning: "Tes cours, tes activités, et tes révisions placées toutes seules.", notions: "", notes: "Chaque notion avance toute seule quand tu la réussis.",
  blanche: "Cahier fermé. Ce qui manque revient plus tard.", discu: "Il te pose les questions, tu réponds avec tes mots.", acces: "Ces réglages sont gratuits, pour toujours.", mesdonnees: "Ce que Notéa garde, et comment tout effacer.", progres: "Ce que tu retiens. Jamais de reproche."};
function pageHead(name) {
  const g = TABS[name][1], first = Object.keys(TABS).find(k => TABS[k][1] === g), b = $("back");
  b.hidden = name === "jour";
  if (name === "jour") $("page-t").textContent = "Bonjour" + (db.nom ? " " + db.nom : "") + " 👋";
  else { const to = name === first ? "jour" : first; b.dataset.tab = to; $("back-t").textContent = TABS[to][0]; }
  $("page-s").textContent = SUBS[name] || ""; $("page-s").hidden = !SUBS[name];
}

/* ---------- Accueil : 3 chiffres et la prochaine session ---------- */
function homeStats(q) {
  const now = Date.now(), live = db.notions.filter(n => !finished(n, now) && !n.off);
  $("st-min").textContent = q.length ? Math.max(1, sessionMin(q)) : 0;
  $("st-n").textContent = q.length; $("st-pc").textContent = mastery(live, now) + " %";
  let h = "–"; try { if (q.length) { const it = plan()[0].items.find(x => x.type === "rev"); h = it ? hm(it.f) : "Libre"; } } catch (e) {}
  $("st-heure").textContent = h;
}

/* ---------- Mon prénom ---------- */
function paintNom() { $("av").textContent = (db.nom || "N").trim().charAt(0).toUpperCase() || "N"; $("av-nom").textContent = db.nom || "Mon profil"; }
$("nom").value = db.nom || "";
$("nom").addEventListener("input", () => { db.nom = $("nom").value.trim().slice(0, 30); save(); paintNom(); });
paintNom();

/* ---------- Mes cours : un dossier par matière ---------- */
function renderFolders() {
  const box = $("dossiers"), ms = matsWithNotions(), now = Date.now(); box.replaceChildren();
  $("dossiers-vide").hidden = !!ms.length;
  ms.forEach((m, i) => { const ns = db.notions.filter(n => matOf(n) === m), nc = db.cours.filter(c => c.mat === m).length, pc = mastery(ns, now);
    const b = el("button", "folder f" + (i % 4)); b.setAttribute("aria-label", `${m}, ${ns.length} notions, maîtrise ${pc} %. Ouvrir dans mon carnet`);
    const tr = el("span", "track"), bar = document.createElement("i"); bar.style.width = Math.max(4, pc) + "%"; tr.append(bar);
    b.append(svgIc("folder"), el("b", "", m), el("span", "sub", (chN(m) ? chN(m) + " chapitre" + (chN(m) > 1 ? "s" : "") + " · " : nc ? nc + " cours · " : "") + ns.length + " notion" + (ns.length > 1 ? "s" : "")), tr, el("span", "sub", "Maîtrise " + pc + " %" + (dueTime(m) && joursAvant(dueTime(m), Date.now()) >= 0 ? " · examen " + dansJ(joursAvant(dueTime(m), Date.now())) : "")));
    b.addEventListener("click", () => { nMat = m; nFilter = "tout"; tab("notes"); }); brancherMenu(b, m); box.append(b); });
  $("imp-card").hidden = ms.length > 0 && !impOpen && $("pick-card").hidden;
}
$("imp-open").addEventListener("click", () => { impOpen = true; $("imp-card").hidden = false; $("imp-card").scrollIntoView({block: "start", behavior: "smooth"}); $("imp-mat").focus(); });

/* ---------- Mon carnet de notions : des filtres simples, rangé par matière puis par cours ---------- */
var nFilter = "tout", nMat = "";
const catOf = n => n.off ? "off" : (n.lapses || 0) >= 2 || n.mark === "rate" ? "retr" : !n.last ? "new" : n.S >= 7 ? "ok" : "peu";
const CATS = [["tout", "Toutes"], ["retr", "À retravailler"], ["peu", "Peu compris"], ["ok", "Réussies"], ["off", "Mises de côté"]];
function renderList() {
  const now = Date.now(), base = db.notions.filter(n => !nMat || matOf(n) === nMat);
  const nf = $("nf"); nf.replaceChildren();
  CATS.forEach(([k, l]) => { const c = k === "tout" ? base.length : base.filter(n => catOf(n) === k).length;
    const b = el("button", "", l + " · " + c); b.setAttribute("aria-pressed", nFilter === k); b.addEventListener("click", () => { nFilter = k; renderList(); }); nf.append(b); });
  const nm = $("nmat"); nm.hidden = !nMat; nm.replaceChildren();
  if (nMat) { const x = el("button", "", "Voir toutes les matières"); x.addEventListener("click", () => { nMat = ""; renderList(); }); nm.append("Matière : " + nMat + " ", x); }
  const list = base.filter(n => nFilter === "tout" || catOf(n) === nFilter), box = $("nlist"); box.replaceChildren();
  $("ncount").textContent = `${list.length} notion${list.length > 1 ? "s" : ""}`;
  if (!list.length) { box.append(el("p", "muted", db.notions.length ? "Aucune notion ici pour l'instant." : "Ton carnet est vide. Importe un cours dans « Mes cours ».")); return; }
  [...new Set(list.map(matOf))].sort().forEach(m => {
    const all = db.notions.filter(n => matOf(n) === m), mine = list.filter(n => matOf(n) === m), pc = mastery(all, now);
    const head = el("div", "mhead"), dot = el("span", "dot"); dot.style.background = colOf(m);
    const tr = el("span", "track"), bar = document.createElement("i"); bar.style.width = Math.max(3, pc) + "%"; tr.append(bar);
    const line = el("div", "row"); line.append(dot, el("b", "", m), el("span", "muted", `· ${all.length} notion${all.length > 1 ? "s" : ""} · Maîtrise ${pc} %`)); head.append(line, tr); box.append(head);
    const groups = new Map(); mine.forEach(n => { const k = chapOf(n) ? "§" + chapOf(n) : (n.src || m); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
    [...groups.entries()].forEach(([src, ns], gi) => {
      const d = el("details", "chap"); d.open = groups.size === 1 || nFilter !== "tout"; const s = document.createElement("summary");
      const part = src.startsWith("§") ? "" : src.includes(" · ") ? src.split(" · ").slice(1).join(" · ") : "";
      s.append(el("b", "", src.startsWith("§") ? src.slice(1) : /^\d/.test(part) ? "Cours du " + part : part === "carnet" ? "Mes mots du carnet" : part || "Notions ajoutées à la main"), el("span", "muted", ns.length + " notion" + (ns.length > 1 ? "s" : ""))); d.append(s);
      ns.sort((a, b) => (a.due || 0) - (b.due || 0)).forEach(n => {
        const r = el("div", "nrow"), l = document.createElement("div"), t = el("p", "t"); t.append(holeHTML(n, true));
        const w = el("p", "when src"); w.append(srcHTML(n), document.createTextNode(" · " + (n.last ? "revient " + when(n.due) : "nouvelle")));
        const c = catOf(n); if (c === "retr") w.append(" ", el("span", "chip rate", "À retravailler")); else if (c === "ok") w.append(" ", el("span", "chip ok", "✓ Réussie"));
        l.append(t, w); const b = el("button", "", "Modifier"); b.addEventListener("click", () => openEditor(n));
        const tg = el("label", "toggle"), cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !n.off; cb.addEventListener("change", () => { n.off = !cb.checked; save(); renderList(); renderToday(); }); tg.append(cb, "À travailler");
        if (n.off) r.classList.add("off"); const a = el("div", "row"); a.append(tg, b); r.append(l, a); d.append(r); });
      box.append(d); });
  });
}

/* ---------- Prof particulier : une matière, un bouton ---------- */
function renderProf() {
  const box = $("prof-list"), ms = matsWithNotions(); box.replaceChildren();
  if (!ms.length) { box.append(el("p", "muted", "Importe d'abord un cours : le prof s'appuie sur tes notions.")); return; }
  ms.forEach(m => { const n = db.notions.filter(x => matOf(x) === m).length, r = el("div", "nrow"), l = document.createElement("div");
    const t = el("p", "t"), dot = el("span", "dot"); dot.style.background = colOf(m); t.append(dot, el("b", "", m)); l.append(t, el("p", "when", n + " notion" + (n > 1 ? "s" : "")));
    const b = el("button", "primary", "Commencer →"); b.setAttribute("aria-label", "Commencer avec le prof : " + m);
    b.addEventListener("click", () => { $("dc-mat").value = m; dc.mode = "qst"; document.querySelectorAll("#dc-mode button").forEach(x => x.classList.toggle("on", x.dataset.m === "qst")); dcHelp(); dcStart(); $("dc-chat").scrollIntoView({block: "start", behavior: "smooth"}); });
    r.append(l, b); box.append(r); });
}
const dcSay = t => { if ($("dc-chat").hidden || $("dc-send").disabled) return; $("dc-in").value = t; $("dc-send").click(); };
$("dc-hint").addEventListener("click", () => dcSay("Donne-moi un indice, sans me donner la réponse."));
$("dc-exp").addEventListener("click", () => dcSay("Je ne sais pas. Explique-moi simplement, puis repose-moi la question."));

/* ---------- Emploi du temps : une photo ou un fichier, Notéa propose les horaires, l'élève valide ----------
   La lecture se fait sur l'appareil. On cherche les jours (lundi…) et les horaires (8h-10h, 14:00 à 15:30). */
const DAY3 = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
function parseEdt(text) {
  let day = -1; const out = [];
  const rxT = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:-|–|—|à|a|>)\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?/gi, rxD = /\b(lun|mar|mer|jeu|ven|sam|dim)(?:di|credi|redi|edi|anche)?\b\.?/i;
  text.split(/\n/).forEach(line => { let l = line.trim(); if (!l) return;
    const d = l.match(rxD); if (d) { day = DAY3.indexOf(d[1].toLowerCase()); l = l.replace(rxD, " "); }
    const ms = [...l.matchAll(rxT)]; if (day < 0 || !ms.length) return;
    const label = l.replace(rxT, " ").replace(/[|•·:;,_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "Cours";
    ms.forEach(m => { const f = Number(m[1]) * 60 + Number(m[2] || 0), t = Number(m[3]) * 60 + Number(m[4] || 0);
      if (Number(m[1]) < 24 && Number(m[3]) < 24 && t > f && !out.some(x => x.day === day && x.from === hm(f))) out.push({day, from: hm(f), to: hm(t), label}); }); });
  return out;
}
async function takeEdt(input) {
  const f = input.files[0]; if (!f) return; const box = $("edt-res"); box.hidden = true; $("edt-t").textContent = "Je lis ton emploi du temps… (ça peut prendre une minute)";
  let found = [];
  try { found = parseEdt(await readFile(f)); } catch (e) { found = []; }
  input.value = ""; box.replaceChildren();
  if (!found.length) { $("edt-t").textContent = "Je n'ai pas réussi à lire les horaires. Écris-les à la main, juste en dessous."; $("acts-t").scrollIntoView({block: "start", behavior: "smooth"}); return; }
  $("edt-t").textContent = `J'ai trouvé ${found.length} horaire${found.length > 1 ? "s" : ""}. La lecture peut faire des erreurs : décoche ce qui est faux.`;
  found.sort((a, b) => a.day - b.day || toMin(a.from) - toMin(b.from)).forEach((a, i) => { const lab = el("label", "row"), c = document.createElement("input"); c.type = "checkbox"; c.checked = true; c.dataset.i = i;
    lab.append(c, `${WD[a.day]} · ${a.from}–${a.to} · ${a.label}`); box.append(lab); });
  const ok = el("button", "primary", "Ajouter à mon agenda");
  ok.addEventListener("click", () => { let n = 0; box.querySelectorAll("input:checked").forEach(c => { const a = found[Number(c.dataset.i)];
      if (!db.acts.some(x => x.day === a.day && x.from === a.from)) { db.acts.push(a); n++; } });
    save(); renderActs(); renderPlan(); box.hidden = true; $("edt-t").textContent = ""; note(`${n} horaire${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""}. Tes révisions se placent autour.`, "ok"); });
  const row = el("div", "row"); row.append(ok); box.append(row); box.hidden = false;
}
["edt-file", "edt-photo"].forEach(id => { $(id).addEventListener("change", () => takeEdt($(id)));
  $(id).previousElementSibling.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $(id).click(); } }); });
$("edt-main").addEventListener("click", () => { $("acts-t").scrollIntoView({block: "start", behavior: "smooth"}); $("act-label").focus(); });


/* =====================================================================
   Version 1.3 : des questions plus justes, le vrai Quiz en cartes qui se retournent,
   les questions à trous à part, et la création à la main (notions, exercices, cartes).
   ===================================================================== */
db.exos = db.exos || []; db.cards = db.cards || [];
var KINDS = [["def", "Définition"], ["concept", "Concept"], ["form", "Formule"], ["date", "Date"], ["info", "À retenir"], ["regle", "Règle"]];
var KLAB = {def: "Définition", concept: "Concept", form: "Formule", date: "Date", info: "À retenir", regle: "Règle"};
var KFIELDS = {def: ["Le mot", "Sa définition"], concept: ["Le concept", "Ce qu'il faut comprendre"], form: ["Le nom de la formule", "La formule"],
  date: ["La date", "Ce qui s'est passé"], info: ["Le sujet", "Ce qu'il faut retenir"], regle: ["Le sujet de la règle", "La règle"]};
var DEFQ = {def: t => `Que signifie « ${t} » ?`, concept: t => `Qu'est-ce que « ${t} » ?`, form: t => `Quelle est la formule de « ${t} » ?`,
  date: t => `Que s'est-il passé : « ${t} » ?`, info: t => `Que faut-il retenir sur « ${t} » ?`, regle: t => `Que dit la règle sur « ${t} » ?`};
var TERMQ = {def: "Quel mot correspond à cette définition ?", concept: "Quel concept est décrit ici ?", form: "De quelle formule s'agit-il ?",
  date: "Quand cela s'est-il passé ?", info: "De quoi parle cette idée ?", regle: "De quelle règle s'agit-il ?"};

/* ---------- Ce qu'on sait d'une notion : son terme, son contenu, son type, son chapitre ---------- */
function chapOf(x) { return ((x && x.chap) || "").trim(); }
function kindOf(n) { return n.kind || {def: "def", form: "form", date: "date", regle: "regle", ret: "info", cause: "info", q: "info"}[n.role] || "info"; }
function factOf(n) {
  if (!n || !n.text) return null;
  if (n.term && n.def) return {term: n.term, def: n.def};
  const d = defParts(n); if (d) return d;
  const t = n.text.trim(); let m = t.match(/^(?:on appelle|on nomme)\s+(.{2,50}?)\s+(l['’]|le |la |les |un |une |ce |cette |celui |celle )(.{6,})$/i);
  if (m) return {term: m[1].replace(/^(l['’]|le |la |les )/i, ""), def: (m[2] + m[3]).replace(/[.;!]+$/, "")};
  m = t.match(/^([^:]{2,60}?)\s*:\s+(.{6,})$/);
  if (m && /^(à retenir|retenir|attention|important|remarque|exemple|note|nb|rappel|définition|conclusion)$/i.test(m[1].trim())) return null;
  if (m && m[1].trim().split(/\s+/).length <= 6) return {term: m[1].trim().replace(/^(l['’]|le |la |les )/i, ""), def: m[2].replace(/[.;!]+$/, "")};
  return null;
}
var RX_Y = /(?:\b(?:en|depuis|dès|vers|année|an)|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(1[0-9]{3}|20[0-9]{2})\b/i;
function yearOf(n) {
  if (!n || !n.text) return ""; const m = n.text.match(RX_Y); if (m) return m[1];
  if (kindOf(n) === "date") { const z = n.text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/); return z ? z[1] : ""; } return "";
}
function dateVariants(s) {
  const m = String(s).match(/\b(1[0-9]{3}|20[0-9]{2})\b/); if (!m) return []; const y = Number(m[1]), top = new Date().getFullYear() + 1;
  return [1, -1, 2, -2, 5, -5, 10, -10, 3].map(d => y + d).filter(v => v <= top).map(v => String(s).replace(m[1], String(v)));
}
function meta(x) { return {mat: matOf(x), chap: chapOf(x), kind: x.q !== undefined ? "exo" : x.front !== undefined ? "carte" : kindOf(x)}; }
function maskIn(text, word) { if (!text || !word || word.length < 3) return text; const w = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return text.replace(new RegExp(w, "gi"), "____"); }
function hasWord(text, w) { return (" " + nk(text) + " ").includes(" " + nk(w) + " "); }
function cardA(c) { return (c.back || "").split("\n")[0].trim(); }
/* Un exemple doit aller avec la notion dont il parle. À l'import, il était rattaché à la phrase d'avant :
   s'il cite le nom d'une autre notion, on le déplace vers elle. */
function fixExamples(ns) {
  const facts = ns.map(n => [n, factOf(n)]).filter(z => z[1]);
  ns.forEach(n => { if (!n.ex) return; const f = factOf(n); if (f && hasWord(n.ex, f.term)) return;
    const hit = facts.find(([y, g]) => y !== n && matOf(y) === matOf(n) && g.term.length >= 3 && hasWord(n.ex, g.term));
    if (hit) { if (!hit[0].ex) hit[0].ex = n.ex; delete n.ex; } });
}
function chN(m) { return new Set(db.notions.filter(n => matOf(n) === m).map(chapOf).filter(Boolean)).size; }

/* ---------- Les mauvaises réponses : crédibles, tirées du même cours ----------
   On préfère : la même matière, le même chapitre, le même type de notion, une longueur proche.
   On écarte : une réponse identique, une réponse contenue dans la bonne, un mot qui apparaît déjà dans la question.
   Facile : des choix plus faciles à distinguer. Difficile : les plus proches de la bonne réponse. */
function nk(a) { return norm(String(a)).replace(/^(un|une|le|la|les|des|du|de)\s+|^(l|d)['’]/, "").replace(/[^a-z0-9]+/g, " ").trim(); }
var KG = {def: "d", concept: "d", info: "r", regle: "r", form: "f", date: "t", exo: "e", carte: "c"};
function pickD(x, good, list, k, avoid) {
  const g = nk(good), seen = new Set([g]), L = String(good).length, mx = meta(x), av = avoid ? nk(avoid) : "", gx = KG[mx.kind] || "d";
  const ok = list.filter(c => { const a = nk(c.a || ""), gc = KG[c.kind] || "d"; if (!a || seen.has(a)) return false;
    if ((gx === "t" || gx === "f") && gc !== gx) return false; if (gx !== "t" && gc === "t") return false; if (gx !== "f" && gc === "f") return false;
    if (a.length > 3 && (g.includes(a) || a.includes(g))) return false; if (av && a.length > 3 && av.includes(a)) return false; seen.add(a); return true; });
  ok.forEach(c => { c.s = (KG[c.kind] === gx ? 3 : 0) + (c.mat === mx.mat ? 4 : 0) + (mx.chap && c.chap === mx.chap ? 2.5 : 0) + (c.kind && c.kind === mx.kind ? 1.5 : 0)
    - Math.abs(Math.log((String(c.a).length + 6) / (L + 6))) * 2.5 + Math.random() * 0.8; });
  ok.sort((a, b) => b.s - a.s);
  if (db.niv === 1) return shuffle(ok.slice(0, Math.max(k * 3, 6))).slice(0, k);
  if (db.niv === 2) return shuffle(ok.slice(0, k + 2)).slice(0, k);
  return ok.slice(0, k);
}
function dedupeOpts(good, opts) { const seen = new Set([nk(good)]); return opts.filter(o => { const a = nk(o.a || ""); if (!a || seen.has(a)) return false; seen.add(a); return true; }); }
var NEG = [[/\bne peut pas\b/i, "peut"], [/\bne doit pas\b/i, "doit"], [/\bdoit\b/i, "ne doit pas"], [/\bdoivent\b/i, "ne doivent pas"], [/\bpeut\b/i, "ne peut pas"],
  [/\btoujours\b/i, "jamais"], [/\bobligatoire\b/i, "facultatif"], [/\binterdit\b/i, "autorisé"], [/\baugmente\b/i, "diminue"], [/\bdiminue\b/i, "augmente"]];
function negate(t) { for (const [r, s] of NEG) if (r.test(t)) return t.replace(r, s); return ""; }
function fixElision(s) { return s.replace(/\b([lLdD])['’](?=[bcdfgjklmnpqrstvwxzBCDFGJKLMNPQRSTVWXZ])/g, (m, a) => ({l: "le ", L: "Le ", d: "de ", D: "De "})[a]); }

/* ---------- Les formes de questions ----------
   def    : « Que signifie X ? » → la définition (vérifie qu'on sait ce que veut dire le mot)
   term   : la définition → quel mot ? (le sens inverse)
   ex     : un exemple du cours → quelle notion il illustre ? (vérifie la compréhension, pas le par cœur)
   pairs  : 3 ou 4 affirmations « mot : définition », une seule juste (vérifie qu'on ne confond pas)
   date   : quelle date manque ?
   affirm : la phrase du cours, et des versions fausses (mot échangé, sens inversé)
   exo    : les exercices écrits par l'élève
   carte  : les cartes de l'élève */
function qPlan(x) {
  if (x.iq) return ["ia"];
  if (x.mq) return ["moteur"];
  if (x.q !== undefined && x.a !== undefined) return ["exo"]; if (x.front !== undefined) return ["carte"];
  const t = [], f = factOf(x);
  if (f) t.push("def", "term", "pairs"); if (x.ex) t.push("ex"); if (yearOf(x)) t.push("date"); if (!f && x.holes && x.holes.length && answerOf(x)) t.push("affirm");
  return t;
}
var PREF = {1: ["term", "def", "date", "exo", "carte", "ex", "affirm", "pairs"], 2: ["def", "ex", "term", "exo", "carte", "date", "pairs", "affirm"], 3: ["ex", "pairs", "affirm", "def", "exo", "carte", "term", "date"]};
function makeQ(x, t, k) {
  if (t === "ia") return makeIA(x, k);
  if (t === "moteur") return makeMQ(x, k);
  const q = {t, x, quote: "", tag: "", text: "", good: "", opts: []};
  if (t === "exo") {
    const user = (x.wrong || []).filter(Boolean).map(a => ({a, user: true}));
    const more = pickD(x, x.a, db.exos.filter(e => e !== x).map(e => ({a: e.a, from: e, ...meta(e)})), k);
    q.tag = "Exercice"; q.text = x.q; q.good = x.a; q.opts = dedupeOpts(x.a, user.concat(more)).slice(0, Math.max(k, user.length));
  } else if (t === "carte") {
    const ga = cardA(x); if (!ga || ga.length > 160) return null;
    q.tag = "Ma carte"; q.text = x.front; q.good = ga;
    q.opts = pickD(x, ga, db.cards.filter(c => c !== x && !c.nid && !c.eid && cardA(c) && cardA(c).length <= 160).map(c => ({a: cardA(c), from: c, ...meta(c)})), k);
  } else {
    const n = x, f = factOf(n), kd = kindOf(n);
    const facts = db.notions.filter(y => y !== n).map(y => [y, factOf(y)]).filter(z => z[1]);
    const termC = () => facts.map(([y, g]) => ({a: g.term, from: y, ...meta(y)}))
      .concat(db.notions.filter(y => y !== n && !factOf(y) && answerOf(y)).map(y => ({a: answerOf(y), from: y, ...meta(y)})));
    if (t === "def") { if (!f) return null; q.tag = KLAB[kd] || "Définition"; q.text = (DEFQ[kd] || DEFQ.def)(f.term); q.good = f.def;
      q.opts = pickD(n, f.def, facts.filter(([y, g]) => nk(g.term) !== nk(f.term)).map(([y, g]) => ({a: g.def, from: y, ...meta(y)})).filter(o => !norm(o.a).includes(norm(f.term))), k); }
    else if (t === "term") { if (!f) return null; q.tag = KLAB[kd] || "Définition"; q.text = TERMQ[kd] || TERMQ.def; q.quote = maskIn(f.def, f.term); q.good = f.term;
      let c = termC(); if (kd === "date") c = c.concat(dateVariants(f.term).map(a => ({a, ...meta(n)})));
      q.opts = pickD(n, f.term, c, k, f.def); }
    else if (t === "ex") { if (!n.ex) return null; const good = f ? f.term : answerOf(n); if (!good) return null;
      if (facts.some(([y, g]) => matOf(y) === matOf(n) && nk(g.term) !== nk(good) && g.term.length >= 3 && hasWord(n.ex, g.term))) return null;
      q.tag = "Exemple"; q.text = "Quelle notion cet exemple illustre-t-il ?"; q.quote = maskIn(n.ex, good); q.good = good; q.opts = pickD(n, good, termC(), k); }
    else if (t === "pairs") { if (!f) return null;
      const near = pickD(n, f.term, facts.map(([y, g]) => ({a: g.term, from: y, g, ...meta(y)})), Math.max(2, k));
      if (near.length < 2) return null; const defs = [f.def, ...near.map(o => o.g.def)];
      q.tag = "Vrai ou faux"; q.text = "Laquelle de ces affirmations est juste ?"; q.good = `${f.term} : ${f.def}`;
      q.opts = near.map((o, j) => ({a: `${o.a} : ${defs[(j + 2) % defs.length]}`, from: o.from, real: `« ${o.a} », c'est : ${o.g.def}`})); }
    else if (t === "date") { const y = yearOf(n); if (!y) return null;
      q.tag = "Date"; q.text = "Quelle date manque ?"; q.quote = n.text.replace(y, "____"); q.good = y;
      const ys = db.notions.filter(z => z !== n && matOf(z) === matOf(n)).map(yearOf).filter(Boolean);
      q.opts = pickD(n, y, ys.map(a => ({a, ...meta(n)})).concat(dateVariants(y).map(a => ({a, ...meta(n)}))), k); }
    else if (t === "affirm") { const ans = answerOf(n); if (!n.holes.length || !ans || f) return null;
      q.tag = "Vrai ou faux"; q.text = "Laquelle de ces phrases est juste ?"; q.good = n.text;
      const neg = negate(n.text), isTerm = facts.some(([y, g]) => nk(g.term) === nk(ans));
      const sw = isTerm ? pickD(n, ans, facts.map(([y, g]) => ({a: g.term, from: y, ...meta(y), kind: "info"})), k).map(o => ({a: fixElision(swapHoles(n, o.a)), from: o.from})) : [];
      q.opts = (neg ? [{a: neg, neg: true}] : []).concat(sw).slice(0, k); }
  }
  q.opts = dedupeOpts(q.good, q.opts);
  return q.opts.length >= 2 ? q : null;
}
/* Construire un quiz : toutes les notions sont couvertes à tour de rôle (un chapitre après l'autre),
   d'abord celles jamais vues en quiz, puis celles ratées, puis les plus anciennes. Les formes de questions changent. */
function cqBuild(items, nb) {
  const k = db.niv === 1 ? 2 : db.niv === 3 ? 4 : 3;
  const pr = x => { const z = x.qz || {n: 0, ok: 0, last: 0}; return (z.n === 0 ? 0 : 2e13) + (z.n > z.ok ? 0 : 1e13) + z.last + Math.random() * 1e5 - (x.mq ? (x.mq.pertinence || 0) * 5e4 : 0); };
  const by = new Map(); items.slice().sort((a, b) => pr(a) - pr(b)).forEach(x => { const c = chapOf(x); if (!by.has(c)) by.set(c, []); by.get(c).push(x); });
  const cols = [...by.values()], order = []; for (let i = 0; order.length < items.length; i++) cols.forEach(c => { if (c[i]) order.push(c[i]); });
  const out = [], cnt = {}, seenG = new Set(), famN = {}, later = [], cap = Math.max(2, Math.ceil(nb / 4)); let last = "";
  for (const x of order) { if (out.length >= nb) break;
    const sc = t => (cnt[t] || 0) * 2 + PREF[db.niv].indexOf(t) * 0.5 + (t === last ? 5 : 0) + Math.random() * 0.3;
    for (const t of qPlan(x).sort((a, b) => sc(a) - sc(b))) { const q = makeQ(x, t, k); if (!q || seenG.has(famKey(q))) continue; const fk = famKey(q).split("|")[0];
      if ((famN[fk] || 0) >= cap) { later.push(q); break; }   // pas plus de 3 questions du même genre : on varie
      seenG.add(famKey(q)); famN[fk] = (famN[fk] || 0) + 1; out.push(q); cnt[t] = (cnt[t] || 0) + 1; last = t; break; } }
  for (const q of later) { if (out.length >= nb) break; if (!seenG.has(famKey(q))) { seenG.add(famKey(q)); out.push(q); } }
  return out;
}

/* ---------- Le Quiz : une carte qui se retourne ---------- */
var cq = null;
function cqItemsBase(m, ch) { return moteurItems(m, ch).concat([...db.notions.filter(n => !n.off), ...db.exos, ...db.cards.filter(c => !c.nid && !c.eid)].filter(x => (!m || matOf(x) === m) && (!ch || chapOf(x) === ch))); }
function cqStart(items) {
  const list = cqBuild(items || cqItems($("jx-mat").value, $("jx-chap").value), 10);
  if (!list.length) { note("Pas assez de matière pour un quiz. Ajoute des notions avec leur définition, des exercices ou des cartes (« Mes cours » → « Créer à la main »).", "warn"); return; }
  if (list.length < 3) note("Petit quiz : ajoute des notions ou des exercices pour avoir plus de questions.", "warn");
  cq = {list, i: 0, ok: 0, miss: []}; $("jx-end").hidden = true; $("mt").hidden = true; $("qc").hidden = false; cqShow();
}
function flipTo(id, back) {
  const f = $(id), fr = f.querySelector(".front"), bk = f.querySelector(".back"); f.classList.toggle("turned", back);
  fr.inert = back; bk.inert = !back; fr.setAttribute("aria-hidden", back); bk.setAttribute("aria-hidden", !back);
}
function cqShow() {
  const q = cq.list[cq.i]; cq.answered = false; flipTo("qc-flip", false); $("qc-turn").hidden = true;
  $("qc-pos").textContent = `Question ${cq.i + 1} sur ${cq.list.length}`; $("qc-score").textContent = `${cq.ok} juste${cq.ok > 1 ? "s" : ""}`;
  $("qc-prog").style.width = Math.round(cq.i / cq.list.length * 100) + "%";
  const tg = $("qc-tag"); tg.replaceChildren(el("span", "chip q", q.tag), document.createTextNode([matOf(q.x), chapOf(q.x)].filter(Boolean).join(" · ")));
  $("qc-q").textContent = q.text; $("qc-quote").hidden = !q.quote; $("qc-quote").textContent = q.quote ? "« " + q.quote + " »" : "";
  q.choices = shuffle([{a: q.good, good: true}, ...q.opts]);
  const box = $("qc-c"); box.replaceChildren();
  q.choices.forEach((c, i) => { const b = el("button"); b.append(el("span", "lt", "ABCDE"[i]), el("span", "", c.a)); b.setAttribute("aria-label", "Réponse " + "ABCDE"[i] + " : " + c.a);
    b.addEventListener("click", () => cqAnswer(i)); box.append(b); });
  box.firstChild.focus();
}
function cqAnswer(i) {
  if (cq.answered) return; cq.answered = true; const q = cq.list[cq.i], c = q.choices[i], good = !!c.good, x = q.x, now = Date.now();
  [...$("qc-c").children].forEach((b, j) => { b.disabled = true; if (q.choices[j].good) b.classList.add("ok"); else if (j === i) b.classList.add("no"); });
  if (good) cq.ok++; else if (!cq.miss.includes(x)) cq.miss.push(x);
  x.qz = x.qz || {n: 0, ok: 0, last: 0}; x.qz.n++; if (good) x.qz.ok++; x.qz.last = now; if (x.mq) moteurNote(x.mq, good ? 1 : 0, !good && (c.why || c.node) ? "confusion" : null);
  if (x.text && x.holes && (!x.last || x.due <= now)) { if (!x.last) db.newToday++; schedule(x, good ? "h" : 1, now); }
  save(); if (onceToday("cq" + (x.id || q.text))) gainN(1, "quiz");
  cqBack(q, c, good); $("qc-turn").hidden = false;
  setTimeout(() => { flipTo("qc-flip", true); $("qc-next").focus(); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350);
}
function cqBack(q, c, good) {
  const bk = $("qc-back"), x = q.x; bk.classList.toggle("ok", good); bk.classList.toggle("no", !good);
  $("qc-verdict").textContent = good ? "✓ Bonne réponse !" : "✗ Ce n'est pas ça";
  const line = (lab, txt, cls) => { const d = el("div", "ansline " + cls); d.append(el("small", "", lab), el("b", "", txt)); return d; };
  const box = $("qc-ans"); box.replaceChildren(); if (!good) box.append(line("Ta réponse", c.a, "mine")); box.append(line("La bonne réponse", q.good, "good"));
  const w = $("qc-why"); w.replaceChildren(el("b", "", "Pourquoi ?")); const p = t => w.append(el("div", "", t));
  if (x.iq) iaPourquoi(q, c, good, p);
  else if (x.mq) moteurPourquoi(x, c, good, p);
  else if (x.text) {
    const f = factOf(x);
    if (x.why) p(x.why);
    if (q.t === "ex") p(`Cet exemple montre « ${q.good} »` + (f ? ` : ${f.def}.` : "."));
    else if (q.t === "pairs" || q.t === "term") p(`« ${f.term} », c'est : ${f.def}.`);
    if (!good && c.neg) p("Attention au sens : la phrase que tu as choisie dit le contraire du cours.");
    else if (!good && c.real) p("Dans ta réponse, les idées sont mélangées. En réalité, " + c.real + ".");
    else if (!good && c.from && c.from.text) { const fo = factOf(c.from); p(fo ? `Ce que tu as choisi, c'est autre chose : « ${fo.term} », c'est ${fo.def}.` : `Ce que tu as choisi vient d'une autre phrase du cours : « ${c.from.text} »`); }
    const src = el("div", "muted"); src.append("Dans ton cours : "); if (x.holes && x.holes.length) src.append(holeHTML(x, true)); else src.append(x.text); w.append(src);
    if (x.ex && q.t !== "ex") p("Exemple : " + x.ex);
  } else if (x.q !== undefined) { if (x.why) p(x.why); else p("Relis l'énoncé, puis compare ta réponse avec la bonne."); if (!good && c.user) p("C'est un piège que tu avais prévu toi-même : bien vu de l'avoir écrit, reste attentif."); }
  else { if (x.back !== q.good) p(x.back); if (!good && c.from && c.from.front) p(`Ce que tu as choisi répond à une autre carte : « ${c.from.front} »`); }
  const s = [matOf(x), chapOf(x)].filter(Boolean).join(" · "); if (s) w.append(el("div", "src", s));
  $("qc-next").textContent = cq.i + 1 < cq.list.length ? "Question suivante →" : "Voir mon score";
}
function cqEnd() {
  $("qc").hidden = true; $("jx-end").hidden = false; const n = cq.list.length;
  $("jx-end-t").textContent = `${cq.ok} sur ${n}`;
  $("jx-end-s").textContent = cq.ok === n ? "Parfait ! Tout est juste." : "Les notions ratées reviennent plus tôt dans ta révision. Tu peux aussi les revoir tout de suite.";
  const l = $("jx-end-l"); l.replaceChildren(); cq.miss.forEach(x => { const r = el("div", "res no"); if (x.holes) r.append("✗ ", holeHTML(x, true)); else r.append("✗ " + (x.q || x.front || (x.mq && x.mq.enonce) || (x.iq && x.iq.question)) + " → " + (x.a || x.back || (x.mq && x.mq.reponseAttendue) || (x.iq && (x.iq.choix.find(c => c.juste) || {}).texte))); l.append(r); });
  $("jx-miss").hidden = !cq.miss.length; $("jx-miss").textContent = `Revoir mes erreurs (${cq.miss.length})`;
  if (onceToday("jeu-quiz")) gainN(5, "quiz"); renderToday();
}
$("qc-next").addEventListener("click", () => { cq.i++; if (cq.i < cq.list.length) cqShow(); else cqEnd(); });
$("qc-again").addEventListener("click", () => { flipTo("qc-flip", false); $("qc-turn").focus(); });
$("qc-turn").addEventListener("click", () => { flipTo("qc-flip", true); $("qc-next").focus(); });
$("qc-quit").addEventListener("click", () => { if (cq) cqEnd(); });
$("qc-lire").addEventListener("click", () => { const q = cq && cq.list[cq.i]; if (q) speak(q.text + (q.quote ? ". " + q.quote : "") + ". " + q.choices.map((c, i) => "Réponse " + "ABCDE"[i] + " : " + c.a).join(". ")); });
$("qc-lire2").addEventListener("click", () => speak($("qc-verdict").textContent.replace(/[✓✗]/g, "") + ". " + $("qc-ans").textContent + ". " + $("qc-why").textContent));
$("jx-miss").addEventListener("click", () => { if (cq && cq.miss.length) cqStart(cq.miss.slice()); });
$("jx-mat").addEventListener("change", () => fillChapSel($("jx-chap"), $("jx-mat").value));
document.addEventListener("keydown", e => {
  if ($("tab-jeux").hidden || $("qc").hidden || !cq || cq.answered || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const i = Number(e.key) - 1; if (i >= 0 && i < cq.list[cq.i].choices.length) { e.preventDefault(); cqAnswer(i); }
});

/* ---------- Questions à trous : leur propre écran ---------- */
function trFin(t, sub) {
  $("qz").hidden = true; $("tr-end").hidden = false; $("tr-end-t").textContent = t; $("tr-end-s").textContent = sub;
  if (onceToday("jeu-trous")) gainN(5, "trous"); renderToday();
}
$("tr-go").addEventListener("click", quizStart); $("tr-again").addEventListener("click", quizStart);

/* ---------- Les listes de matières et de chapitres ---------- */
function chapsOf(m) { return [...new Set([...db.notions, ...db.exos, ...db.cards].filter(x => !m || matOf(x) === m).map(chapOf).concat(iaAnalyses(m).flatMap(a => (a.data.questions || []).map(q => q.partie))).filter(Boolean))].sort(); }
function fillChapSel(sel, m) { const cur = sel.value; sel.replaceChildren(new Option("Tous les chapitres", "")); chapsOf(m).forEach(c => sel.append(new Option(c, c))); if ([...sel.options].some(o => o.value === cur)) sel.value = cur; }
function fillDL() {
  const a = $("mat-list"), b = $("chap-list"); a.replaceChildren(); b.replaceChildren();
  matsWithNotions().forEach(m => a.append(new Option(m))); chapsOf("").forEach(c => b.append(new Option(c)));
}

/* ---------- Une notion écrite à la main ---------- */
function termHoles(text, term) { const t = tokens(text), nw = term.trim().split(/\s+/).length, h = []; for (let i = 0, c = 0; i < t.length && c < nw; i++) if (!/^\s*$/.test(t[i])) { h.push(i); c++; } return h; }
function manualNotion(o) {
  const text = `${o.term} : ${o.def}`, n = makeNotion(text, "manuel", o.mat + " · " + new Date().toLocaleDateString("fr-FR"));
  Object.assign(n, {mat: o.mat, chap: o.chap || "", term: o.term, def: o.def, kind: o.kind, holes: termHoles(text, o.term)});
  if (o.ex) n.ex = o.ex; if (o.why) n.why = o.why; return n;
}
function newCard(o) { return Object.assign({id: uid(), front: "", back: "", mat: "", chap: "", created: Date.now(), D: 5, S: 0, due: 0, last: 0, reps: 0, lapses: 0, mark: "manuel"}, o); }
function notionCard(n) {
  const f = factOf(n), kd = kindOf(n); let front, back;
  if (f) { front = (DEFQ[kd] || DEFQ.def)(f.term); back = f.def; }
  else { front = tokens(n.text).map((w, i) => n.holes.includes(i) ? "____" : w).join(""); back = answerOf(n) + "\n" + n.text; }
  if (n.ex) back += "\nExemple : " + n.ex; if (n.why) back += "\n" + n.why;
  return newCard({nid: n.id, front, back, mat: matOf(n), chap: chapOf(n)});
}

/* ---------- Mes cours : créer à la main ---------- */
let manKind = "def", exoEdit = null;
function setManKind(k) {
  manKind = k; document.querySelectorAll("#man-kind button").forEach(b => b.classList.toggle("on", b.dataset.k === k));
  $("man-term-l").textContent = KFIELDS[k][0]; $("man-def-l").textContent = KFIELDS[k][1];
}
document.querySelectorAll("#man-kind button").forEach(b => b.addEventListener("click", () => setManKind(b.dataset.k)));
setManKind("def");
const manMat = () => $("man-mat").value.trim() || "Mes cours";
function manDone(t) { $("man-done").textContent = t; }
$("man-open").addEventListener("click", () => { fillDL(); $("man-card").hidden = false; $("man-card").scrollIntoView({block: "start", behavior: "smooth"}); $("man-mat").focus(); renderExos(); });
$("man-close").addEventListener("click", () => { $("man-card").hidden = true; renderFolders(); });
$("man-mat").addEventListener("change", renderExos);
$("man-add").addEventListener("click", () => {
  const term = $("man-term").value.trim(), def = $("man-def").value.trim();
  if (!term || def.split(/\s+/).length < 2) { note("Écris « " + KFIELDS[manKind][0].toLowerCase() + " » et « " + KFIELDS[manKind][1].toLowerCase() + " » (au moins 2 mots).", "warn"); (term ? $("man-def") : $("man-term")).focus(); return; }
  const n = manualNotion({term, def, kind: manKind, ex: $("man-ex").value.trim(), why: $("man-why").value.trim(), mat: manMat(), chap: $("man-chap").value.trim()});
  db.notions.push(n); let c = null; if ($("man-card-too").checked) { c = notionCard(n); db.cards.push(c); }
  save(); renderToday(); fillDL(); ["man-term", "man-def", "man-ex", "man-why"].forEach(id => { $(id).value = ""; }); $("man-term").focus();
  manDone(`« ${term} » est ajouté${c ? ", avec sa carte" : ""}. Il arrive dans ta révision du jour.`);
  noteUndo(`Notion « ${term} » ajoutée.`, () => { db.notions = db.notions.filter(x => x !== n); if (c) db.cards = db.cards.filter(x => x !== c); save(); renderToday(); manDone(""); });
});
$("man-text-save").addEventListener("click", () => {
  const t = $("man-text").value.trim(); if (t.split(/\s+/).length < 5) { note("Écris ou colle ton cours d'abord.", "warn"); return; }
  saveCours(manMat(), t); const c = db.cours[db.cours.length - 1]; if (c && c.text === t) c.chap = $("man-chap").value.trim(); save();
  manDone("Cours enregistré. Tu peux l'écouter dans « Lire et écouter ».");
});
var anaChap = "";
$("man-text-ana").addEventListener("click", () => {
  const t = $("man-text").value.trim(); if (t.split(/\s+/).length < 5) { note("Écris ou colle ton cours d'abord.", "warn"); return; }
  anaChap = $("man-chap").value.trim(); $("imp-mat").value = manMat(); $("imp-text").value = t; impOpen = true; $("imp-card").hidden = false; $("imp-read").click();
});
function renderExos() {
  const box = $("exo-list"), m = manMat(), list = db.exos.filter(e => matOf(e) === m); box.replaceChildren();
  if (!list.length) return; box.append(el("p", "muted", `${list.length} exercice${list.length > 1 ? "s" : ""} en ${m} :`));
  list.forEach(e => { const r = el("div", "crow"); r.append(el("p", "pre", e.q), el("p", "pre muted", "→ " + e.a + (e.wrong && e.wrong.length ? "\n✗ " + e.wrong.join(" · ") : "")));
    const a = el("div", "row"), b1 = el("button", "", "Modifier"), b2 = el("button", "", "Supprimer");
    b1.addEventListener("click", () => { exoEdit = e; $("exo-q").value = e.q; $("exo-a").value = e.a; $("exo-w").value = (e.wrong || []).join("\n"); $("exo-why").value = e.why || ""; $("man-chap").value = e.chap || ""; $("exo-add").textContent = "Enregistrer l'exercice"; $("exo-q").focus(); });
    b2.addEventListener("click", () => { db.exos = db.exos.filter(x => x !== e); save(); renderExos(); noteUndo("Exercice supprimé.", () => { db.exos.push(e); save(); renderExos(); }); });
    a.append(b1, b2); r.append(a); box.append(r); });
}
$("exo-add").addEventListener("click", () => {
  const q = $("exo-q").value.trim(), a = $("exo-a").value.trim();
  if (!q || !a) { note("Écris la question et la bonne réponse.", "warn"); (q ? $("exo-a") : $("exo-q")).focus(); return; }
  const o = {q, a, wrong: $("exo-w").value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 6), why: $("exo-why").value.trim(), mat: manMat(), chap: $("man-chap").value.trim()};
  if (exoEdit) Object.assign(exoEdit, o); else { const e = Object.assign({id: uid(), created: Date.now()}, o); db.exos.push(e); if ($("man-card-too").checked) db.cards.push(newCard({eid: e.id, front: q, back: a + (o.why ? "\n" + o.why : ""), mat: o.mat, chap: o.chap})); }
  manDone(exoEdit ? "Exercice modifié." : "Exercice ajouté. Il sera dans tes quiz."); exoEdit = null; $("exo-add").textContent = "Ajouter l'exercice";
  save(); fillDL(); ["exo-q", "exo-a", "exo-w", "exo-why"].forEach(id => { $(id).value = ""; }); $("exo-q").focus(); renderExos();
});

/* ---------- Modifier une notion : son type, son terme, son contenu, son exemple, son chapitre, et si on la travaille ---------- */
let edKind = "def";
function setEdKind(k) { edKind = k; document.querySelectorAll("#ed-kind button").forEach(b => b.classList.toggle("on", b.dataset.k === k)); }
document.querySelectorAll("#ed-kind button").forEach(b => b.addEventListener("click", () => setEdKind(b.dataset.k)));
function edFill(n) {
  const f = factOf(n); setEdKind(kindOf(n)); $("ed-term").value = f ? f.term : ""; $("ed-def").value = f ? f.def : "";
  $("ed-ex").value = n.ex || ""; $("ed-why").value = n.why || ""; $("ed-chap").value = chapOf(n); $("ed-on").checked = !n.off; fillDL();
}
function edApply(n) {
  const f0 = factOf(n), term = $("ed-term").value.trim(), def = $("ed-def").value.trim();
  n.kind = edKind; n.chap = $("ed-chap").value.trim(); n.off = !$("ed-on").checked;
  const ex = $("ed-ex").value.trim(), why = $("ed-why").value.trim(); if (ex) n.ex = ex; else delete n.ex; if (why) n.why = why; else delete n.why;
  if (term && def && (!f0 || term !== f0.term || def !== f0.def)) { n.text = `${term} : ${def}`; n.term = term; n.def = def; n.holes = termHoles(n.text, term); n._rebuilt = true; return true; }
  if (term && def) { n.term = term; n.def = def; }
  return false;
}

/* ---------- Mes cartes : recto, verso, rangées par chapitre, révisées avec le même algorithme ---------- */
let caEdit = null, cr = null;
const caSel = () => db.cards.filter(c => (!$("ca-mat").value || matOf(c) === $("ca-mat").value) && (!$("ca-chap").value || chapOf(c) === $("ca-chap").value));
function caDue(list) { const end = new Date(); end.setHours(23, 59, 59, 999); return list.filter(c => !c.last || c.due <= end.getTime()); }
function renderCartes() {
  fillMats($("ca-mat")); fillChapSel($("ca-chap"), $("ca-mat").value); fillDL();
  const list = caSel(), due = caDue(list), box = $("ca-list"); box.replaceChildren();
  $("ca-n").textContent = list.length ? `${list.length} carte${list.length > 1 ? "s" : ""} · ${due.length} à revoir aujourd'hui` : "Pas encore de carte ici. Écris ta première carte, ou fais-les à partir de tes notions.";
  $("ca-go").disabled = !due.length;
  if (!list.length) return;
  const by = new Map(); list.forEach(c => { const k = matOf(c) + (chapOf(c) ? " · " + chapOf(c) : ""); if (!by.has(k)) by.set(k, []); by.get(k).push(c); });
  [...by.entries()].sort().forEach(([k, cs]) => { const d = el("details", "chap"); d.open = by.size <= 2; const s = document.createElement("summary");
    s.append(el("b", "", k), el("span", "muted", cs.length + " carte" + (cs.length > 1 ? "s" : ""))); d.append(s);
    cs.forEach(c => { const r = el("div", "crow"); r.append(el("p", "pre", c.front), el("p", "pre muted", c.back));
      const a = el("div", "row"), b1 = el("button", "", "Modifier"), b2 = el("button", "", "Supprimer");
      b1.addEventListener("click", () => caOpen(c)); b2.addEventListener("click", () => { db.cards = db.cards.filter(x => x !== c); save(); renderCartes(); noteUndo("Carte supprimée.", () => { db.cards.push(c); save(); renderCartes(); }); });
      a.append(b1, b2); r.append(a); d.append(r); });
    box.append(d); });
}
function caOpen(c, pre) {
  caEdit = c || null; const o = c || pre || {}; $("ca-form").hidden = false; $("ca-form-t").textContent = c ? "Modifier la carte" : "Nouvelle carte";
  $("ca-front").value = o.front || ""; $("ca-back").value = o.back || ""; $("ca-f-mat").value = o.mat || $("ca-mat").value || ""; $("ca-f-chap").value = o.chap || $("ca-chap").value || "";
  $("ca-save").textContent = c ? "Enregistrer" : "Ajouter la carte"; $("ca-saved").textContent = "";
  $("ca-form").scrollIntoView({block: "start", behavior: "smooth"}); (o.back && !o.front ? $("ca-front") : $("ca-front")).focus();
}
$("ca-new").addEventListener("click", () => caOpen(null));
$("ca-cancel").addEventListener("click", () => { $("ca-form").hidden = true; caEdit = null; });
$("ca-save").addEventListener("click", () => {
  const front = $("ca-front").value.trim(), back = $("ca-back").value.trim();
  if (!front || !back) { note("Écris le recto et le verso.", "warn"); (front ? $("ca-back") : $("ca-front")).focus(); return; }
  const o = {front, back, mat: $("ca-f-mat").value.trim() || "Mes cartes", chap: $("ca-f-chap").value.trim()};
  if (caEdit) { Object.assign(caEdit, o); $("ca-form").hidden = true; caEdit = null; note("Carte modifiée.", "ok"); }
  else { db.cards.push(newCard(o)); $("ca-front").value = ""; $("ca-back").value = ""; $("ca-front").focus(); $("ca-saved").textContent = "Carte ajoutée. Tu peux en écrire une autre."; }
  save(); renderCartes();
});
function caMake(list, what) {
  if (!list.length) { note("Rien de nouveau : tout a déjà sa carte.", "ok"); return; }
  db.cards.push(...list); save(); renderCartes();
  noteUndo(`${list.length} carte${list.length > 1 ? "s" : ""} créée${list.length > 1 ? "s" : ""} depuis ${what}.`, () => { db.cards = db.cards.filter(c => !list.includes(c)); save(); renderCartes(); });
}
$("ca-from").addEventListener("click", () => { const m = $("ca-mat").value, ch = $("ca-chap").value;
  caMake(db.notions.filter(n => !n.off && (!m || matOf(n) === m) && (!ch || chapOf(n) === ch) && !db.cards.some(c => c.nid === n.id)).map(notionCard), "tes notions"); });
$("ca-from-exo").addEventListener("click", () => { const m = $("ca-mat").value, ch = $("ca-chap").value;
  caMake(db.exos.filter(e => (!m || matOf(e) === m) && (!ch || chapOf(e) === ch) && !db.cards.some(c => c.eid === e.id)).map(e => newCard({eid: e.id, front: e.q, back: e.a + (e.why ? "\n" + e.why : ""), mat: matOf(e), chap: chapOf(e)})), "tes exercices"); });
$("ca-mat").addEventListener("change", () => { fillChapSel($("ca-chap"), $("ca-mat").value); renderCartes(); });
$("ca-chap").addEventListener("change", renderCartes);
$("lec-carte").addEventListener("click", () => { const it = lec.sel; if (!it) return; lecStop(); tab("cartes"); caOpen(null, {front: "", back: it.text, mat: lec.c.mat, chap: lec.c.chap || ""}); });

/* La révision des cartes : recto, on retourne, on dit si on s'en souvenait */
function crStart() {
  const due = interleave(caDue(caSel())).slice(0, DAY_MAX); if (!due.length) { note("Aucune carte à revoir aujourd'hui.", "ok"); return; }
  cr = {list: due, i: 0, n: {1: 0, 2: 0, 3: 0}}; $("ca-run").hidden = false; $("ca-list-card").hidden = true; $("ca-form").hidden = true; $("ca-top").hidden = true; crShow();
}
function crShow() {
  const c = cr.list[cr.i]; cr.turned = false; flipTo("cr-flip", false);
  $("cr-pos").textContent = `Carte ${cr.i + 1} sur ${cr.list.length}`; $("cr-prog").style.width = Math.round(cr.i / cr.list.length * 100) + "%";
  $("cr-src").textContent = [matOf(c), chapOf(c)].filter(Boolean).join(" · "); $("cr-front").textContent = c.front; $("cr-back").textContent = c.back;
  const now = Date.now(); $("cr-w2").textContent = when(preview(c, 2, now).due); $("cr-w3").textContent = when(preview(c, 3, now).due);
  $("cr-turn").focus();
}
function crTurn() { cr.turned = true; flipTo("cr-flip", true); document.querySelector("#cr-b .g2").focus(); }
function crGrade(g) {
  if (!cr || !cr.turned) return; const c = cr.list[cr.i]; schedule(c, g, Date.now()); cr.n[g]++;
  if (g === 1 && cr.list.filter(x => x === c).length < 3 && !cr.list.slice(cr.i + 1).includes(c)) cr.list.push(c);
  save(); if (onceToday("ca" + c.id)) gain(2, "carte"); cr.i++;
  if (cr.i >= cr.list.length) crEnd(); else crShow();
}
function crEnd() {
  $("ca-run").hidden = true; $("ca-list-card").hidden = false; $("ca-top").hidden = false;
  if (cr && cr.i) note(`Fini ! ${cr.n[3]} facile${cr.n[3] > 1 ? "s" : ""}, ${cr.n[2]} avec effort, ${cr.n[1]} raté${cr.n[1] > 1 ? "s" : ""}.`, "ok");
  cr = null; renderCartes(); renderToday();
}
$("ca-go").addEventListener("click", crStart);
$("cr-turn").addEventListener("click", crTurn);
$("cr-unturn").addEventListener("click", () => { cr.turned = false; flipTo("cr-flip", false); $("cr-turn").focus(); });
document.querySelectorAll("#cr-b [data-cg]").forEach(b => b.addEventListener("click", () => crGrade(Number(b.dataset.cg))));
$("cr-quit").addEventListener("click", crEnd);
$("cr-lire").addEventListener("click", () => { if (cr) speak(cr.list[cr.i].front); });
$("cr-lire2").addEventListener("click", () => { if (cr) speak(cr.list[cr.i].back); });
document.addEventListener("keydown", e => {
  if (!cr || $("ca-run").hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (!cr.turned && (e.key === " " || e.key === "Enter")) { e.preventDefault(); crTurn(); }
  else if (cr.turned && ["1", "2", "3"].includes(e.key)) { e.preventDefault(); crGrade(Number(e.key)); }
});

fixExamples(db.notions); save();
Object.assign(SUBS, {jeux: "Choisis ta réponse : la carte se retourne et t'explique la correction.", trous: "Retrouve le mot caché de ton cours.",
  cartes: "Tes cartes recto verso. Écris-les, puis révise-les.", notions: "Importe ton cours, ou écris-le toi-même."});


/* =====================================================================
   Version 1.5 : les questions du moteur de compréhension sont utilisées partout.
   Quiz : les QCM du moteur et ses questions dont la réponse est une notion (situation, cause, catégorie…).
   Révision du jour : jusqu'à 3 questions de compréhension, à expliquer avec ses mots, corrigées sans IA.
   Examen blanc : les questions ouvertes du moteur. Prof particulier : les liens et l'ordre du cours, et ce que l'élève maîtrise mal.
   Chaque réponse est enregistrée dans le profil de l'élève (niveaux de maîtrise du moteur).
   ===================================================================== */
var MQ_NOM = ["directe", "situation", "categorie", "lieu", "condition", "calcule-quoi", "causalite"];
var MQ_REV = ["reformulation", "situation", "causalite", "comparaison", "condition", "dependance", "partie", "categorie", "lieu", "calcule-quoi", "calcul", "synthese"];
var MQ_TAG = {qcm: "Définition", "qcm-notion": "Définition", directe: "Vocabulaire", situation: "Situation", categorie: "Classer", lieu: "Où ?", condition: "Condition",
  "calcule-quoi": "Formule", causalite: "Cause et effet", calcul: "Calcul", reformulation: "Avec tes mots", comparaison: "Comparer", dependance: "Dépend de",
  partie: "Les éléments", synthese: "Relier les idées", definition: "Définition", chronologie: "Ordre"};
function moteurOK() { return typeof NoteaMoteur !== "undefined"; }
function profil() { if (!db.profil && moteurOK()) db.profil = NoteaMoteur.nouveauProfil(); return db.profil; }
function moteurNote(mq, score, err) {
  const p = profil(); if (!p || !mq.notions || !mq.notions.length) return;
  try { NoteaMoteur.enregistrer(p, {notion: mq.notions[0], activite: mq.type, score, erreur: err || undefined}); } catch (e) {}
}
/* Les questions du moteur, avec la matière et le chapitre de leur cours. */
function moteurBanque(m, ch) {
  const out = []; (db.cours || []).forEach(c => { const a = db.moteur && db.moteur[c.id]; if (!a || !a.questions) return;
    const mat = c.mat || a.matiere || "Cours", chap = c.chap || a.chapitre || "";
    if ((m && mat !== m) || (ch && chap !== ch)) return;
    a.questions.forEach(q => { q.mat = mat; q.chap = chap; q.cid = c.id; out.push(q); }); });
  return out;
}
function moteurNoeud(cid, id) { const a = db.moteur && db.moteur[cid]; return a && a.noeuds ? a.noeuds.find(n => n.id === id) : null; }
function numVariants(v) { const s = new Set([v]), out = []; [v * 2, v / 2, v + 1, v - 1, v * 10, v + 10, v / 10].forEach(x => { x = Math.round(x * 1000) / 1000; if (x > 0 && !s.has(x)) { s.add(x); out.push(String(x).replace(".", ",")); } }); return out; }

/* ---------- Quiz : une question du moteur devient une carte à retourner ---------- */
function mqQuizable(q) { return (q.choix && q.choix.length >= 3) || MQ_NOM.includes(q.type) || (q.type === "calcul" && q.numerique != null); }
function moteurItems(m, ch) { return moteurBanque(m, ch).filter(mqQuizable).map(q => ({mq: q, id: q.id, mat: q.mat, chap: q.chap, kind: "def", qz: q.qz || (q.qz = {n: 0, ok: 0, last: 0})})); }
function makeMQ(x, k) {
  const mq = x.mq, nodes = (db.moteur[mq.cid] || {}).noeuds || [], q = {t: "moteur", x, quote: "", tag: MQ_TAG[mq.type] || "Compréhension", text: mq.enonce, good: elide(String(mq.reponseAttendue)), opts: []};
  if (mq.choix && mq.choix.length >= 3) {
    q.opts = mq.choix.filter(c => nk(c) !== nk(q.good)).map(c => { const pg = (mq.pieges || []).find(p => nk(p.texte) === nk(c));
      return {a: c, why: pg ? pg.pourquoi : "", node: pg ? moteurNoeud(mq.cid, pg.notion) : null}; });
    if (db.niv === 1) q.opts = q.opts.slice(0, 2);
  } else if (mq.type === "calcul") {
    if (mq.indice) q.quote = mq.indice; q.good = String(mq.numerique).replace(".", ",");
    q.opts = numVariants(mq.numerique).slice(0, k).map(a => ({a}));
  } else {
    const pre = (q.good.match(/^(une (?:hausse|baisse) de )/i) || ["", ""])[1], core = q.good.slice(pre.length);
    const inQ = new Set(mq.notions.slice(1).map(id => { const n = moteurNoeud(mq.cid, id); return n ? nk(n.nom) : ""; }));
    const cands = nodes.filter(n => nk(n.nom) !== nk(core) && !inQ.has(nk(n.nom)) && n.statut !== "incertain").map(n => ({a: elide(pre + n.nom), node: n, mat: mq.mat, chap: mq.chap, kind: "def"}));
    q.opts = (pre ? [{a: elide((/hausse/i.test(pre) ? "une baisse de " : "une hausse de ") + core), why: "c'est l'effet inverse de ce que dit le cours"}] : [])
      .concat(pickD(x, q.good, cands, k, mq.enonce)).slice(0, k);
  }
  q.opts = dedupeOpts(q.good, q.opts);
  return q.opts.length >= 2 ? q : null;
}
function famKey(q) {
  const t = q.t === "moteur" ? q.x.mq.type : q.t === "ia" ? "ia-" + q.x.iq.objectif + "-" + nk(q.x.iq.partie || "") : q.t;
  const f = {def: "D", qcm: "D", term: "T", directe: "T", "qcm-notion": "T", ex: "E", situation: "E"}[t] || t;
  return f + "|" + nk(q.good);
}
function elide(s) { return s.replace(/(^|\s)(de|le|la) (?=[aeiouyhâàéèêîôûAEIOUYH])/g, (m, s0, a) => s0 + (a === "de" ? "d'" : "l'")); }
/* Une définition du moteur est parfois la phrase entière du cours : on la cite telle quelle. */
function defPhrase(n) { const d = String(n.definition).trim().replace(/\.+$/, ""); return nk(d).includes(nk(n.nom)) ? `Le cours dit : « ${d}. »` : `« ${n.nom} », c'est ${d}.`; }
function moteurPourquoi(x, c, good, p) {
  const mq = x.mq;
  if (!good && c.why) p("Ce que tu as choisi : " + c.why + ".");
  else if (!good && c.node && c.node.definition) p(`Ce que tu as choisi, « ${c.node.nom} », c'est autre chose. ` + defPhrase(c.node));
  const src = (mq.corrige || (mq.source && mq.source.texte) || "").trim();
  if (src) p("Dans ton cours" + (mq.source && mq.source.page ? " (page " + mq.source.page + ")" : "") + " : « " + src + " »");
  const n = moteurNoeud(mq.cid, mq.notions[0]); if (n && n.definition && !nk(src).includes(nk(n.definition))) p(defPhrase(n));
}

/* ---------- Révision du jour : des questions de compréhension, en plus des notions ---------- */
function mqPrep(q) { if (q.D == null) { q.D = clampD(2 + (q.difficulte || 30) / 12); q.S = 0; q.last = 0; q.due = 0; q.reps = 0; q.lapses = 0; q.mark = "moteur"; } return q; }
function mqRevision(now) {
  if (!MQ_REV || !moteurOK() || onVacation()) return [];   // au tout début du chargement, ces listes ne sont pas encore prêtes
  db.mqNew = db.mqNew && db.mqNew.day === today() ? db.mqNew : {day: today(), n: 0};
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const bank = moteurBanque("", "").filter(q => MQ_REV.includes(q.type));
  const due = bank.filter(q => q.last && q.due <= end.getTime()).sort((a, b) => a.due - b.due);
  const fresh = Math.max(0, 2 - db.mqNew.n) ? NoteaMoteur.choisirQuestions(bank.filter(q => !q.last), profil(), 2 - db.mqNew.n, now) : [];
  return due.concat(fresh).slice(0, 3).map(mqPrep);
}
function mixMQ(list, now) {
  const mq = mqRevision(now); if (!mq.length) return list;
  const out = list.slice(), step = Math.max(2, Math.floor(out.length / (mq.length + 1)));
  mq.forEach((q, i) => out.splice(Math.min(out.length, (i + 1) * step + i), 0, q));
  return out;
}
function mqShow(n) {
  const s = document.createDocumentFragment(), c = el("span", "chip q", MQ_TAG[n.type] || "Compréhension"); s.append(c, document.createTextNode([n.niveau, n.mat, n.chap].filter(Boolean).join(" · ")));
  $("q-src").replaceChildren(s); $("q-text").replaceChildren(document.createTextNode(n.enonce)); if (n.indice) $("q-text").append(el("div", "muted", n.indice));
  $("q-in").placeholder = "Réponds avec tes mots (tu peux aussi répondre dans ta tête)";
}
function mqReveal(n) {
  const box = $("q-text"); box.replaceChildren(document.createTextNode(n.enonce));
  const r = el("div", "ansline good"); r.append(el("small", "", "Réponse du cours"), el("b", "", String(n.reponseAttendue))); box.append(r);
  const src = (n.corrige || (n.source && n.source.texte) || "").trim(); if (src) box.append(el("div", "muted", "Dans ton cours" + (n.source && n.source.page ? " (page " + n.source.page + ")" : "") + " : « " + src + " »"));
}
function motsEntiers(n, stems) {
  const ws = String(n.reponseAttendue || "").split(/\s+/).map(w => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ""));
  return [...new Set(stems.map(s => ws.find(w => norm(w).startsWith(norm(s))) || s))];
}
function mqFeedback(n, v) {
  n._score = null; if (!v) return; const r = NoteaMoteur.evaluerReponse(n, v), fb = $("q-fb"); n._score = r.score; fb.hidden = false;
  if (r.correct) { fb.className = "msg ok"; fb.textContent = "✓ Ta réponse contient l'essentiel." + (r.orthographeIgnoree ? " (Les fautes d'orthographe ne comptent pas.)" : ""); document.querySelector(".g3").focus(); }
  else { fb.className = "msg warn"; fb.textContent = r.erreur === "confusion" && r.confondAvec ? "Attention, tu sembles confondre avec : « " + r.confondAvec + " »." : r.manquants && r.manquants.length ? "Il manque : " + motsEntiers(n, r.manquants).join(", ") + ". Compare avec la réponse du cours." : "Compare avec la réponse du cours.";
    document.querySelector(r.score > 0 ? ".g2" : ".g1").focus(); }
}

/* ---------- Examen blanc : les questions ouvertes du moteur ---------- */
function mqExam(qs, m, form, nb) {
  if (!moteurOK() || (form !== "ouv" && form !== "mix")) return qs;
  const bank = shuffle(moteurBanque(m, "").filter(q => MQ_REV.includes(q.type) && q.type !== "calcul"));
  const want = form === "ouv" ? Math.ceil(nb / 2) : Math.ceil(nb / 3);
  const nomDe = x => { const f = x.n && factOf(x.n); return nk(f ? f.term : x.n ? answerOf(x.n) : ""); }, pris = new Set();
  bank.filter(q => { const nd = moteurNoeud(q.cid, q.notions[0]), k = nd ? nk(nd.nom) : q.id; if (pris.has(k)) return false; pris.add(k); return true; }).slice(0, want).forEach((q, i) => {
    const item = {mq: q, k: "mq", a: null}, nd = moteurNoeud(q.cid, q.notions[0]);
    let j = nd ? qs.findIndex(x => x.k !== "mq" && nomDe(x) === nk(nd.nom)) : -1;
    if (j < 0 && qs.length >= nb) j = qs.findIndex((x, k) => k >= i * 2 && x.k !== "mq");
    if (j >= 0) qs[j] = item; else qs.push(item); });
  bank.filter(q => !qs.some(x => x.mq === q)).forEach(q => { if (qs.length < nb && !qs.some(x => x.mq && x.mq.type === q.type && x.mq.notions[0] === q.notions[0])) qs.push({mq: q, k: "mq", a: null}); });   // compléter avec d'autres questions du cours
  return shuffle(qs).slice(0, nb);
}

/* ---------- Prof particulier : ce que Notéa a compris du cours, et ce que l'élève maîtrise mal ---------- */
function moteurContexte(m) {
  if (!moteurOK()) return ""; const p = profil(), lines = [], NR = NoteaMoteur.NOMS_REL || {};
  (db.cours || []).forEach(c => { const a = db.moteur && db.moteur[c.id]; if (!a || !a.noeuds || (m && (c.mat || a.matiere) !== m)) return;
    const byId = new Map(a.noeuds.map(n => [n.id, n]));
    lines.push(`\n\nCe que Notéa a compris du cours « ${a.chapitre || c.mat} » :`);
    a.noeuds.slice().sort((x, y) => (y.importance || 0) - (x.importance || 0)).slice(0, 8).forEach(n => lines.push(`- ${n.nom} (importance ${n.importance}/100)` + (n.definition ? " : " + n.definition : "")));
    const liens = (a.aretes || []).filter(r => r.statut === "confirme" && r.type !== "associe" && byId.has(r.de) && byId.has(r.vers)).slice(0, 12);
    if (liens.length) { lines.push("Liens écrits dans le cours :"); liens.forEach(r => lines.push(`- « ${byId.get(r.de).nom} » ${NR[r.type] || r.type} « ${byId.get(r.vers).nom} »`)); }
    const ord = (a.ordre || []).map(id => byId.get(id)).filter(Boolean).map(n => n.nom); if (ord.length > 1) lines.push("Ordre conseillé pour apprendre : " + ord.slice(0, 10).join(" → "));
    const faibles = p ? a.noeuds.filter(n => { const e = p.notions[n.id]; return e && e.preuves && e.preuves.length && NoteaMoteur.niveauMaitrise(e) < 3; }).map(n => n.nom) : [];
    if (faibles.length) lines.push("L'élève maîtrise encore mal : " + faibles.slice(0, 6).join(", ") + ". Commence par ces notions, en respectant l'ordre conseillé.");
  });
  return lines.length ? lines.join("\n") + "\nAppuie-toi seulement sur ces informations et sur les notions données. N'invente rien." : "";
}


/* =====================================================================
   Version 1.6 : la date de l'examen crée le plan de révision.
   L'élève met la date du contrôle d'une matière. Notéa simule, jour par jour, avec le vrai algorithme (FSRS) :
   - les nouvelles notions sont étalées pour avoir tout vu 3 jours avant (J-3) ;
   - chaque notion revient juste avant d'être oubliée, puis une dernière fois la veille ;
   - J-3 : feuille blanche ; J-2 : examen blanc ; J-1 : révision finale et quiz ; chaque semaine : un quiz.
   La révision du jour suit ce plan : elle prend le temps qu'il faut, pas seulement les minutes choisies.
   ===================================================================== */
/* Minutes d'une séance : une nouvelle notion prend 45 s de plus (la découvrir), et on compte 15 % de marge. Le plan et l'accueil utilisent le même calcul. */
function sessionMin(q) { return Math.max(1, Math.round(q.reduce((s, x) => s + secFor(x) + (x.last ? 0 : 45), 0) * 1.15 / 60)); }
function jour0(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function joursAvant(ex, now) { return Math.round((jour0(ex) - jour0(now)) / DAY); }
function examsAVenir(now = Date.now()) { return matsWithNotions().map(m => [m, dueTime(m)]).filter(([, ex]) => ex && joursAvant(ex, now) >= 0).sort((a, b) => a[1] - b[1]); }
var ACT = {
  blanche: ["📝", "Feuille blanche", "Écris tout ce dont tu te souviens, sans le cours.", 10],
  examen: ["🎯", "Examen blanc", "Comme le jour J, avec une note sur 20.", 20],
  quiz: ["🃏", "Quiz", "Un quiz sur les notions apprises.", 8],
  finale: ["⭐", "Révision finale", "Un dernier quiz sur tes notions fragiles.", 10]
};
function examPlan(m, now = Date.now()) {
  const ex = dueTime(m); if (!ex) return null; const D = joursAvant(ex, now); if (D < 0) return null;
  const sim = db.notions.filter(n => matOf(n) === m && !n.off).map(n => Object.assign({}, n));
  const fresh = sim.filter(n => !n.last).sort((a, b) => (b.mark === "dif" || b.mark === "q") - (a.mark === "dif" || a.mark === "q") || a.created - b.created);
  const per = Math.max(1, newPerDay(m, now)), dernier = Math.max(0, D - 3);   // le même calcul que la révision du jour
  const deja = db.day === today() ? Math.min(per, db.newToday || 0) : 0;   // les nouvelles déjà vues aujourd'hui comptent pour aujourd'hui
  fresh.forEach((n, k) => { n._learn = Math.min(dernier, Math.floor((k + deja) / per)); });
  const d0 = jour0(now), days = [];
  for (let i = 0; i <= D; i++) {
    const day = {i, date: new Date(d0 + i * DAY + 3 * 3600e3), nouvelles: 0, revisions: 0, sec: 0, acts: [], jourJ: i === D};
    if (i < D) { const t = Math.max(now, d0 + i * DAY + 18 * 3600e3), fin = d0 + (i + 1) * DAY;
      sim.forEach(n => {
        if (!n.last) { if (n._learn === i) { schedule(n, 2, t, true); day.nouvelles++; day.sec += 45 + secFor(n); } }
        else if (n.due < fin) { schedule(n, 2, t, true); day.revisions++; day.sec += secFor(n); } });
      const avant = D - i;
      if (D >= 4 && avant === 3 || D === 3 && avant === 2) day.acts.push("blanche");
      if (D >= 3 && avant === 2 || D === 2 && avant === 1 || D === 1 && avant === 1) day.acts.push("examen");
      if (avant === 1 && D >= 3) day.acts.push("finale");
      if (avant > 3 && i > 0 && i % 7 === 0) day.acts.push("quiz");
    }
    day.min = day.sec ? Math.max(1, Math.round(day.sec * 1.15 / 60)) : 0;     // +15 % : on ne réussit pas tout du premier coup
    day.total = day.min + day.acts.reduce((s, a) => s + ACT[a][3], 0);
    days.push(day);
  }
  const travail = days.filter(d => !d.jourJ), moy = travail.length ? Math.round(travail.reduce((s, d) => s + d.total, 0) / travail.length) : 0;
  const pic = travail.reduce((a, d) => d.total > a.total ? d : a, {total: 0});
  const vues = sim.map(n => n.reps || 0);
  return {m, ex, D, days, notions: sim.length, nouvelles: fresh.length, dejaVues: sim.length - fresh.length, moy, pic,
    minRevues: vues.length ? Math.min(...vues) : 0, max: (db.mats[m] || {}).minutes || 0};
}
/* Ce que la révision du jour doit contenir pour tenir les plans (temps et nombre de notions). */
function examBesoinAujourdhui() {
  if (!ACT) return {min: 0, n: 0};   // au tout début du chargement
  let min = 0, n = 0; examsAVenir().forEach(([m]) => { const p = examPlan(m); if (p && p.days[0]) { min += p.days[0].min; n += p.days[0].nouvelles + p.days[0].revisions; } });
  return {min, n};
}
function dayCap() { return Math.max(DAY_MAX || 20, Math.min(60, examBesoinAujourdhui().n)); }

/* ---------- Mon carnet : « Mes examens » ---------- */
const fmtJour = d => new Date(d).toLocaleDateString("fr-FR", {weekday: "long", day: "numeric", month: "long"});
const dansJ = n => n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`;
let examOuvert = "";
function renderExams() {
  const box = $("exam-list"); box.replaceChildren(); const now = Date.now(), list = examsAVenir(now);
  if (!list.length) box.append(el("p", "muted", "Ajoute la date de ton prochain contrôle : Notéa prépare toutes tes séances jusqu'au jour J."));
  list.forEach(([m, ex]) => { const D = joursAvant(ex, now), n = db.notions.filter(x => matOf(x) === m && !x.off).length;
    const r = el("div", "nrow exrow"), l = document.createElement("div"); const t = el("p", "t"), dot = el("span", "dot"); dot.style.background = colOf(m);
    t.append(dot, el("b", "", m)); l.append(t, el("p", "when", `${fmtJour(ex)} · ${dansJ(D)} · ${n} notion${n > 1 ? "s" : ""}`));
    const a = el("div", "row"), b1 = el("button", "primary", examOuvert === m ? "Cacher le plan" : "Voir mon plan"), b2 = el("button", "", "Modifier"), b3 = el("button", "", "Enlever");
    b1.addEventListener("click", () => { examOuvert = examOuvert === m ? "" : m; renderExams(); });
    b2.addEventListener("click", () => examForm(m));
    b3.addEventListener("click", () => { const old = matInfo(m).due; setMat(m, "due", ""); if (examOuvert === m) examOuvert = ""; renderExams(); renderToday(); noteUndo(`Examen de ${m} enlevé.`, () => { setMat(m, "due", old); renderExams(); renderToday(); }); });
    a.append(b1, b2, b3); r.append(l, a); box.append(r);
    if (examOuvert === m) box.append(renderPlan2(examPlan(m))); });
}
function examForm(m) {
  const f = $("exam-form"); f.hidden = false; const s = $("exam-mat"); s.replaceChildren();
  matsWithNotions().forEach(x => s.append(new Option(x, x)));
  if (m || nMat) s.value = m || nMat; $("exam-date").value = matInfo(s.value).due || ""; $("exam-date").min = today();
  const mx = matInfo(s.value).minutes || 0; document.querySelectorAll("#exam-min button").forEach(b => b.classList.toggle("on", Number(b.dataset.min) === mx));
  f.scrollIntoView({block: "nearest", behavior: "smooth"}); $("exam-date").focus();
}
$("exam-add").addEventListener("click", () => examForm(""));
$("exam-mat").addEventListener("change", () => examForm($("exam-mat").value));
document.querySelectorAll("#exam-min button").forEach(b => b.addEventListener("click", () => document.querySelectorAll("#exam-min button").forEach(x => x.classList.toggle("on", x === b))));
$("exam-cancel").addEventListener("click", () => { $("exam-form").hidden = true; });
$("exam-ok").addEventListener("click", () => {
  const m = $("exam-mat").value, d = $("exam-date").value;
  if (!m) { note("Importe d'abord un cours : il faut une matière.", "warn"); return; }
  if (!d || d < today()) { note("Choisis une date d'examen à venir.", "warn"); $("exam-date").focus(); return; }
  const on = document.querySelector("#exam-min button.on");
  db.mats[m] = Object.assign(matInfo(m), {due: d, minutes: on ? Number(on.dataset.min) : 0}); save();
  $("exam-form").hidden = true; examOuvert = m; renderExams(); renderToday();
  const p = examPlan(m); note(p ? `Ton plan pour ${m} est prêt : ${p.D} jour${p.D > 1 ? "s" : ""}, environ ${p.moy} min par jour.` : "Examen enregistré.", "ok");
});
function renderPlan2(p) {
  const box = el("div", "plan2"); if (!p) return box;
  const r = el("div", "stats");
  r.append(statTile(String(p.D), p.D > 1 ? "jours avant l'examen" : "jour avant l'examen"), statTile(String(p.nouvelles), "notions à découvrir"),
    statTile(p.moy + " min", "par jour en moyenne"), statTile(p.minRevues >= 2 ? "≥ " + p.minRevues : String(p.minRevues), "fois chaque notion revue avant J"));
  box.append(r);
  const msgs = [];
  if (p.D <= 2) msgs.push(["warn", "L'examen est très proche : Notéa met tout ce qui compte en premier. Garde un peu de temps pour te reposer la veille."]);
  if (p.max && p.pic.total > p.max) msgs.push(["warn", `Le jour le plus chargé (${fmtJour(p.pic.date)}) demande ${p.pic.total} min, plus que tes ${p.max} min. Avance quelques séances ou monte un peu ton temps ce jour-là.`]);
  if (p.minRevues < 2 && p.notions && p.D >= 3) msgs.push(["warn", "Certaines notions ne seront revues qu'une fois : ajoute un peu de temps chaque jour si tu peux."]);
  msgs.push(["ok", "Le plan se met à jour tout seul : si tu rates une notion, elle revient plus tôt. Si tu sautes un jour, le reste se répartit."]);
  msgs.forEach(([k, t]) => box.append(el("p", "msg " + k, t)));
  const list = el("ol", "plandays");
  p.days.forEach(d => { const li = el("li", "pday" + (d.i === 0 ? " today" : "") + (d.jourJ ? " jj" : ""));
    const h = el("div", "pd-h"); h.append(el("b", "", d.i === 0 ? "Aujourd'hui" : d.i === 1 ? "Demain" : fmtJour(d.date)), el("span", "muted", d.jourJ ? "Jour J" : `J-${p.D - d.i} · ${d.total} min`));
    const c = el("div", "row");
    if (d.jourJ) c.append(el("span", "", "C'est le jour de l'examen. Pas de nouvelle notion. Relis tes cartes 5 minutes si tu veux, puis fais-toi confiance. Bonne chance !"));
    else {
      if (d.nouvelles) c.append(el("span", "chip q", `🆕 ${d.nouvelles} nouvelle${d.nouvelles > 1 ? "s" : ""}`));
      if (d.revisions) c.append(el("span", "chip", `🔁 ${d.revisions} révision${d.revisions > 1 ? "s" : ""}`));
      d.acts.forEach(a => c.append(el("span", "chip imp", ACT[a][0] + " " + ACT[a][1])));
      if (!d.nouvelles && !d.revisions && !d.acts.length) c.append(el("span", "muted", d.i === 0 && (db.log || []).some(x => x[0] >= jour0(Date.now())) ? "✓ C'est fait pour aujourd'hui. Bravo !" : "Repos : ton cerveau consolide."));
      if (d.i === 0 && (d.nouvelles || d.revisions)) { const b = el("button", "primary", "Commencer ma séance"); b.addEventListener("click", () => { tab("jour"); startSession(); }); c.append(b); }
    }
    li.append(h, c); list.append(li); });
  box.append(list);
  return box;
}

/* ---------- Accueil : ce qu'il faut faire aujourd'hui pour les examens ---------- */
function goAct(a, m) {
  if (a === "blanche") { tab("blanche"); if ([...$("fb-mat").options].some(o => o.value === m)) { $("fb-mat").value = m; fbStart(); } }
  else if (a === "examen") { tab("examen"); $("ex-mat").value = m; }
  else { tab("jeux"); $("jx-mat").value = m; fillChapSel($("jx-chap"), m); }
}
function renderExamToday() {
  if (!ACT) return;
  const box = $("exam-today"); if (!box) return; box.replaceChildren(); const now = Date.now(), list = examsAVenir(now).filter(([, ex]) => joursAvant(ex, now) <= 30);
  box.hidden = !list.length; if (!list.length) return;
  box.append(el("h2", "", "Mes examens"));
  list.forEach(([m, ex]) => { const p = examPlan(m, now), d = p && p.days[0], D = joursAvant(ex, now);
    const r = el("div", "nrow"), l = document.createElement("div"); l.append(el("p", "t", `${m} · ${dansJ(D)}`));
    l.append(el("p", "when", d && d.jourJ ? "C'est aujourd'hui. Bonne chance !" : d ? `Aujourd'hui : ${d.nouvelles} nouvelle${d.nouvelles > 1 ? "s" : ""}, ${d.revisions} révision${d.revisions > 1 ? "s" : ""}` + (d.acts.length ? " + " + d.acts.map(a => ACT[a][1].toLowerCase()).join(", ") : "") + ` · environ ${d.total} min` : ""));
    const a = el("div", "row"); (d ? d.acts : []).forEach(x => { const b = el("button", "", ACT[x][0] + " " + ACT[x][1]); b.addEventListener("click", () => goAct(x, m)); a.append(b); });
    const v = el("button", "", "Mon plan"); v.addEventListener("click", () => { examOuvert = m; nMat = m; tab("notes"); }); a.append(v);
    r.append(l, a); box.append(r); });
}


/* =====================================================================
   Version 1.7 : l'IA comprend le cours (clé Claude de l'élève).
   Un seul appel par cours, gardé sur l'appareil : le plan (grand I, A, B…), les notions expliquées simplement,
   et des questions de compréhension qui se comprennent seules. Le quiz les utilise à la place des questions automatiques.
   La clé reste sur l'appareil (localStorage) ; elle n'est envoyée qu'à Anthropic.
   ===================================================================== */
var IA_SDK = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.4.0/+esm";
var IA_MODELES = {"claude-opus-5-5": ["Claude Opus 5.5", "le plus intelligent", 4, 20], "claude-sonnet-5-5": ["Claude Sonnet 5.5", "très bon, 2 fois moins cher", 2, 10], "claude-haiku-5-5": ["Claude Haiku 5.5", "le moins cher, moins fin", 0.1, 0.5]};
var iaMod = null;
function iaModel() { const m = lsGet("notea-modele", "claude-opus-5-5"); return IA_MODELES[m] ? m : "claude-opus-5-5"; }
async function iaClient() {
  const key = dcKey(); if (!key) throw new Error("Ajoute d'abord ta clé dans Paramètres → L'IA de Notéa.");
  if (!iaMod) iaMod = await import(IA_SDK);
  return new iaMod.Anthropic({apiKey: key, dangerouslyAllowBrowser: true});   // la clé de l'élève, sur son appareil
}
function iaErreur(e) {
  const M = iaMod || {};
  if (M.AuthenticationError && e instanceof M.AuthenticationError) return "Ta clé est refusée. Vérifie-la dans Paramètres.";
  if (M.PermissionDeniedError && e instanceof M.PermissionDeniedError) return "Ta clé n'a pas accès à ce modèle. Choisis-en un autre dans Paramètres.";
  if (M.RateLimitError && e instanceof M.RateLimitError) return "Trop de demandes, ou plus de crédit sur ton compte. Réessaie dans une minute, ou vérifie ton crédit.";
  if (M.APIConnectionError && e instanceof M.APIConnectionError) return "Pas de connexion à internet.";
  return e && e.message ? e.message : "Erreur inconnue.";
}
/* Un appel. Opus et Sonnet : si un filtre de sécurité refuse à tort, un autre modèle reprend (replis côté serveur). */
async function iaCall({system, messages, maxTokens, format, effort, onText, serveur}) {
  if (iaVoie() === "compte") {   // v1.8 : l'élève connecté passe par le serveur de Notéa, sans clé
    if (!serveur) throw new Error("Cette fonction n'existe pas encore avec un compte Notéa.");
    const j = await iaServeur(serveur.fn, serveur.body);
    return {text: j.text || "", usage: null, model: j.modele, cout: j.cout, credits: j.credits};
  }
  const client = await iaClient(), model = iaModel();
  const req = {model, max_tokens: maxTokens, system, messages, output_config: Object.assign({effort}, format ? {format} : {})};
  if (model !== "claude-haiku-5-5") { req.betas = ["server-side-fallback-2026-07-01"]; req.fallbacks = "default"; }
  const stream = client.beta.messages.stream(req);
  if (onText) stream.on("text", onText);
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("L'IA a refusé cette demande. Essaie avec un autre modèle.");
  if (msg.stop_reason === "max_tokens") throw new Error("Le cours est trop long pour une seule analyse. Coupe-le en deux cours.");
  return {text: msg.content.filter(b => b.type === "text").map(b => b.text).join(""), usage: msg.usage, model: msg.model};
}
function iaPrix(model, inTok, outTok) { const p = IA_MODELES[model]; return (inTok * p[2] + outTok * p[3]) / 1e6; }
const fmtPrix = d => d < 0.01 ? "moins d'1 centime" : d < 1 ? "environ " + Math.max(1, Math.round(d * 100)) + " centimes" : "environ " + d.toFixed(2).replace(".", ",") + " $";

/* ---------- La consigne donnée à l'IA ---------- */
var IA_SYSTEME = `Tu aides un étudiant du supérieur qui est dys ou TDAH à comprendre et réviser son cours.
Ses notes peuvent être très abrégées, en vrac, avec des mots-clés, des flèches ou des fautes. Ton travail : comprendre ce que le cours enseigne vraiment, puis le rendre clair.

1. Le plan. Retrouve la structure logique du cours : les grandes parties (I, II…) et leurs sous-parties (A, B…). Garde les titres du cours quand il y en a ; sinon, donne des titres clairs. Pour chaque partie, dis en une phrase de quoi elle parle et à quoi elle sert.
2. Les notions. Pour chaque notion importante : une définition simple avec des mots de tous les jours (25 mots au plus), une explication (pourquoi c'est important, comment ça marche, 1 ou 2 phrases), un exemple concret. Prends l'exemple du cours s'il y en a un ; sinon, invente un exemple simple et mets ajout_hors_notes à true. N'invente aucun fait : si tu complètes une note trop abrégée avec une connaissance générale sûre de la matière, mets ajout_hors_notes à true.
3. Les questions de quiz (2 à 4 par partie, 30 au plus). Elles vérifient que l'étudiant a COMPRIS, pas qu'il reconnaît un mot recopié.
   - Chaque question se comprend seule, sans voir les notes : une phrase complète qui pose le contexte (par exemple « Dans une étude de marché, à quoi sert… »). Jamais de fragment de notes recopié, jamais de liste de mots-clés.
   - Varie : pourquoi, comment, que faire dans telle situation, quelle différence entre deux notions, quel exemple illustre une notion. Peu de questions de définition pure.
   - 4 choix courts et de même longueur, un seul juste. Les mauvais choix sont crédibles : des confusions qu'un étudiant ferait vraiment.
   - Pour chaque choix, « pourquoi » explique en une phrase pourquoi il est juste ou faux.
   - « explication » redit l'idée à retenir, simplement, en 1 à 3 phrases.
Écris en français simple, phrases courtes, une idée par phrase. Le champ « partie » reprend exactement le titre d'une partie ou sous-partie du plan.`;
var IA_SCHEMA = {type: "object", additionalProperties: false, required: ["titre", "resume", "plan", "notions", "questions"], properties: {
  titre: {type: "string"}, resume: {type: "string"},
  plan: {type: "array", items: {type: "object", additionalProperties: false, required: ["titre", "idee", "sous_parties"], properties: {
    titre: {type: "string"}, idee: {type: "string"},
    sous_parties: {type: "array", items: {type: "object", additionalProperties: false, required: ["titre", "idee"], properties: {titre: {type: "string"}, idee: {type: "string"}}}}}}},
  notions: {type: "array", items: {type: "object", additionalProperties: false, required: ["terme", "partie", "type", "importance", "definition", "explication", "exemple", "ajout_hors_notes"], properties: {
    terme: {type: "string"}, partie: {type: "string"}, type: {type: "string", enum: ["definition", "concept", "methode", "formule", "date", "acteur", "regle", "a_retenir"]},
    importance: {type: "string", enum: ["essentielle", "importante", "detail"]}, definition: {type: "string"}, explication: {type: "string"}, exemple: {type: "string"}, ajout_hors_notes: {type: "boolean"}}}},
  questions: {type: "array", items: {type: "object", additionalProperties: false, required: ["partie", "notion", "objectif", "question", "choix", "explication"], properties: {
    partie: {type: "string"}, notion: {type: "string"}, objectif: {type: "string", enum: ["comprendre", "appliquer", "distinguer", "retenir"]}, question: {type: "string"},
    choix: {type: "array", items: {type: "object", additionalProperties: false, required: ["texte", "juste", "pourquoi"], properties: {texte: {type: "string"}, juste: {type: "boolean"}, pourquoi: {type: "string"}}}},
    explication: {type: "string"}}}}}};

/* ---------- Les sources : les cours gardés, ou les notions d'une matière ---------- */
db.ia = db.ia || {};
function iaSources() {
  const out = (db.cours || []).map(c => ({key: c.id, mat: c.mat || "Cours", label: (c.mat || "Cours") + " · cours du " + new Date(c.created).toLocaleDateString("fr-FR"), text: c.text}));
  matsWithNotions().forEach(m => { const ns = db.notions.filter(n => matOf(n) === m && !n.off); if (!ns.length || out.some(s => s.mat === m)) return;
    out.push({key: "notions:" + m, mat: m, label: m + " · mes notions", text: ns.map(n => n.text + (n.ex ? "\n" + n.ex : "")).join("\n")}); });
  return out;
}
function iaEstimation(text) { const inTok = Math.round(text.length / 3.5) + 1400, outTok = Math.min(16000, 2500 + Math.round(text.length / 6)); return {inTok, outTok, prix: iaPrix(iaModel(), inTok, outTok)}; }
async function iaAnalyser(src, onProgress) {
  const t0 = Date.now(); let n = 0;
  const r = await iaCall({serveur: {fn: "comprendre", body: {mat: src.mat, texte: src.text}}, system: IA_SYSTEME, maxTokens: 32000, effort: "medium", format: {type: "json_schema", schema: IA_SCHEMA},
    messages: [{role: "user", content: `Matière : ${src.mat}\n\nVoici mes notes de cours :\n<cours>\n${src.text}\n</cours>`}],
    onText: d => { n += d.length; if (onProgress) onProgress(Math.round((Date.now() - t0) / 1000), n); }});
  let data; try { data = JSON.parse(r.text); } catch (e) { throw new Error("La réponse de l'IA est incomplète. Réessaie."); }
  data.questions = (data.questions || []).filter(q => q.choix && q.choix.length >= 3 && q.choix.filter(c => c.juste).length === 1)
    .map(q => Object.assign(q, {id: "ia" + uid()}));
  const u = r.usage || {}, prix = r.cout ? 0 : iaPrix(iaModel(), (u.input_tokens || 0) + (u.cache_read_input_tokens || 0), u.output_tokens || 0);
  db.ia[src.key] = Object.assign({mat: src.mat, label: src.label, date: Date.now(), model: r.model, prix, data}, r.cout ? {cout: r.cout} : {});
  iaRanger(src.mat, data); save();
  return db.ia[src.key];
}
/* Les notions sans chapitre prennent la partie du plan qui parle d'elles. */
function iaRanger(m, data) {
  db.notions.filter(n => matOf(n) === m && !chapOf(n)).forEach(n => { const hit = (data.notions || []).find(x => x.terme && hasWord(n.text, x.terme)); if (hit && hit.partie) n.chap = hit.partie; });
}
function iaAnalyses(m) { return Object.values(db.ia || {}).filter(a => !m || a.mat === m); }

/* ---------- Le Quiz : les questions de l'IA remplacent les questions automatiques de la matière ---------- */
function iaItems(m, ch) {
  const out = []; iaAnalyses(m).forEach(a => (a.data.questions || []).forEach(q => {
    if (ch && q.partie !== ch) return; out.push({iq: q, ia: a, id: q.id, mat: a.mat, chap: q.partie, kind: "def", qz: q.qz || (q.qz = {n: 0, ok: 0, last: 0})}); }));
  return out;
}
var IA_OBJ = {comprendre: "Comprendre", appliquer: "Mise en situation", distinguer: "Ne pas confondre", retenir: "À retenir"};
function makeIA(x, k) {
  const iq = x.iq, juste = iq.choix.find(c => c.juste), faux = shuffle(iq.choix.filter(c => !c.juste));
  return {t: "ia", x, quote: "", tag: IA_OBJ[iq.objectif] || "Comprendre", text: iq.question, good: juste.texte,
    opts: faux.slice(0, db.niv === 1 ? 2 : faux.length).map(c => ({a: c.texte, why: c.pourquoi})), juste};
}
function iaPourquoi(q, c, good, p) {
  const iq = q.x.iq;
  if (!good && c.why) p("Ce que tu as choisi : " + c.why);
  if (q.juste && q.juste.pourquoi) p("La bonne réponse : " + q.juste.pourquoi);
  if (iq.explication) p("À retenir : " + iq.explication);
  const n = (q.x.ia.data.notions || []).find(z => z.terme === iq.notion); if (n && n.exemple) p("Exemple : " + n.exemple);
}

/* ---------- Comprendre mon cours : le plan, les notions expliquées ---------- */
let cpSel = "";
function renderComprendre() {
  const srcs = iaSources(), s = $("cp-src"); s.replaceChildren(); srcs.forEach(x => s.append(new Option(x.label + (db.ia[x.key] ? " ✓" : ""), x.key)));
  if (!srcs.length) { $("cp-vide").hidden = false; $("cp-card").hidden = true; $("cp-res").replaceChildren(); return; }
  $("cp-vide").hidden = true; $("cp-card").hidden = false;
  if (!cpSel || !srcs.some(x => x.key === cpSel)) cpSel = (srcs.find(x => db.ia[x.key]) || srcs[0]).key; s.value = cpSel;
  const src = srcs.find(x => x.key === cpSel), a = db.ia[cpSel], est = iaEstimation(src.text), voie = iaVoie();
  const p = compte && compte.profil, bloque = voie === "compte" && p && !p.consentement_le;
  $("cp-go").textContent = a ? "Refaire l'analyse" : "✨ Comprendre ce cours avec l'IA";
  $("cp-go").disabled = !voie || bloque;
  const deja = a ? `Analysé le ${new Date(a.date).toLocaleDateString("fr-FR")} avec ${(IA_MODELES[a.model] || [a.model])[0]} (${a.cout ? a.cout + " crédits" : fmtPrix(a.prix || 0)}). ` : "";
  $("cp-info").textContent = !voie ? "Pour utiliser l'IA, connecte-toi dans Paramètres → Mon compte Notéa. C'est gratuit." :
    bloque ? "Avant la première analyse, donne ton accord dans Paramètres → Mon compte Notéa." :
    voie === "compte" ? deja + `Une analyse coûte ${COUT_ANALYSE} crédits${p ? `. Il t'en reste ${p.credits}` : ""}. Elle est faite une seule fois, puis gardée sur ton appareil.` :
    deja + `Une analyse avec ${IA_MODELES[iaModel()][0]} coûte ${fmtPrix(est.prix)}. Elle est faite une seule fois, puis gardée sur ton appareil.`;
  $("cp-res").replaceChildren(a ? renderIA(a) : el("p", "muted", "Ce cours n'est pas encore analysé."));
}
function renderIA(a) {
  const d = a.data, box = el("div", "stack"), notions = d.notions || [];
  const top = el("div", "card hero-soft"); top.append(el("h2", "", d.titre || a.mat), el("p", "", d.resume || ""));
  const b = el("button", "", "🔊 Écouter le résumé"); b.addEventListener("click", () => speak((d.titre || "") + ". " + (d.resume || ""))); top.append(b); box.append(top);
  const parties = []; (d.plan || []).forEach(p => { parties.push([p, 1]); (p.sous_parties || []).forEach(sp => parties.push([sp, 2])); });
  const vus = new Set();
  parties.forEach(([p, lv]) => {
    const c = el("details", "chap partie lv" + lv); c.open = lv === 1 && parties.length <= 8; const s = document.createElement("summary");
    const ns = notions.filter(n => n.partie === p.titre); ns.forEach(n => vus.add(n));
    s.append(el("b", "", p.titre), el("span", "muted", ns.length ? ns.length + " notion" + (ns.length > 1 ? "s" : "") : "")); c.append(s, el("p", "idee", p.idee || ""));
    ns.forEach(n => c.append(notionIA(n)));
    const nq = (d.questions || []).filter(q => q.partie === p.titre).length;
    const r = el("div", "row"), l = el("button", "", "🔊 Écouter cette partie"); l.addEventListener("click", () => speak(p.titre + ". " + (p.idee || "") + " " + ns.map(n => n.terme + " : " + n.definition + ". " + n.explication).join(" ")));
    r.append(l); if (nq) { const qb = el("button", "primary", `Quiz sur cette partie (${nq})`); qb.addEventListener("click", () => { tab("jeux"); $("jx-mat").value = a.mat; fillChapSel($("jx-chap"), a.mat); $("jx-chap").value = p.titre; cqStart(); }); r.append(qb); }
    c.append(r); box.append(c); });
  const reste = notions.filter(n => !vus.has(n)); if (reste.length) { const c = el("details", "chap partie"); const s = document.createElement("summary"); s.append(el("b", "", "Autres notions")); c.append(s); reste.forEach(n => c.append(notionIA(n))); box.append(c); }
  return box;
}
function notionIA(n) {
  const d = el("div", "nia" + (n.importance === "essentielle" ? " ess" : ""));
  const h = el("div", "row"); h.append(el("b", "", n.terme)); if (n.importance === "essentielle") h.append(el("span", "chip imp", "Essentiel")); if (n.ajout_hors_notes) h.append(el("span", "chip", "Complété par l'IA"));
  d.append(h, el("p", "", n.definition)); if (n.explication) d.append(el("p", "muted", n.explication)); if (n.exemple) d.append(el("p", "ex", "Exemple : " + n.exemple));
  return d;
}
$("cp-src").addEventListener("change", () => { cpSel = $("cp-src").value; renderComprendre(); });
$("cp-go").addEventListener("click", async () => {
  const src = iaSources().find(x => x.key === cpSel); if (!src) return;
  if (src.text.length > (iaVoie() === "compte" ? TEXTE_MAX_COMPTE : 400000)) { note("Ce cours est très long. Coupe-le en plusieurs cours avant de l'analyser.", "warn"); return; }
  const b = $("cp-go"); b.disabled = true; $("cp-info").textContent = "L'IA lit ton cours… (de 20 secondes à 2 minutes)";
  const t0 = Date.now(), tic = setInterval(() => { $("cp-info").textContent = `L'IA lit et organise ton cours… ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
  try { const a = await iaAnalyser(src);
    note(`Cours compris : ${a.data.plan.length} parties, ${a.data.notions.length} notions, ${a.data.questions.length} questions de quiz (${a.cout ? a.cout + " crédits" : fmtPrix(a.prix)}).`, "ok"); }
  catch (e) { note(iaErreur(e), "err"); }
  clearInterval(tic); b.disabled = false; renderComprendre();
});

/* ---------- Paramètres : la clé et le modèle ---------- */
function renderIAReglages() {
  document.querySelectorAll("#ia-modele button").forEach(b => b.classList.toggle("on", b.dataset.m === iaModel()));
  const n = Object.keys(db.ia || {}).length, total = Object.values(db.ia || {}).reduce((s, a) => s + (a.prix || 0), 0);
  $("ia-etat").textContent = (dcKey() ? "Clé enregistrée sur cet appareil." : "Pas encore de clé.") + (n ? ` ${n} cours analysé${n > 1 ? "s" : ""} (${fmtPrix(total)} au total).` : "");
}
document.querySelectorAll("#ia-modele button").forEach(b => b.addEventListener("click", () => { lsSet("notea-modele", b.dataset.m); renderIAReglages(); }));
$("ia-test").addEventListener("click", async () => {
  $("ia-etat").textContent = "Je vérifie ta clé…";
  try { const c = await iaClient(); const m = await c.models.retrieve(iaModel()); $("ia-etat").textContent = "✓ Ta clé marche. Modèle disponible : " + (m.display_name || m.id) + "."; }
  catch (e) { $("ia-etat").textContent = "✗ " + iaErreur(e); }
});
$("cle-ok").addEventListener("click", () => setTimeout(renderIAReglages, 0));
renderIAReglages();

/* Le quiz : les questions de l'IA d'abord ; pour une matière analysée, plus de questions automatiques sur ses notions. */
function cqItems(m, ch) {
  const iaMats = new Set(iaAnalyses("").map(a => a.mat));
  return iaItems(m, ch).concat(cqItemsBase(m, ch).filter(x => !(x.mq || x.text) || x.fiche || !iaMats.has(matOf(x))));   // les fiches de l'élève restent toujours
}
/* Le prof particulier connaît le plan et les notions expliquées. */
function iaContexte(m) {
  const as = iaAnalyses(m); if (!as.length) return "";
  return as.map(a => `\n\nLe cours « ${a.data.titre || a.mat} » compris par Notéa :\nRésumé : ${a.data.resume}\nPlan : ${(a.data.plan || []).map(p => p.titre + (p.sous_parties || []).map(s => " / " + s.titre).join("")).join(" ; ")}\nNotions :\n` +
    (a.data.notions || []).slice(0, 30).map(n => `- ${n.terme} (${n.partie}) : ${n.definition}`).join("\n")).join("");
}
Object.assign(SUBS, {comprendre: "Le plan de ton cours et ses notions, expliqués simplement."});

/* =====================================================================
   Version 1.8 : le compte Notéa. L'IA marche sans clé : le serveur de Notéa (Supabase) la garde.
   - Connexion par lien magique envoyé par e-mail (Supabase Auth).
   - Les crédits sont comptés sur le serveur (table profils) ; chaque élève ne lit que sa ligne.
   - Les cours passent par le serveur le temps de la réponse, ils ne sont pas gardés.
   - La clé publique ci-dessous est faite pour être dans l'appli : la sécurité vient de la RLS.
     La clé Anthropic, elle, n'est jamais ici : c'est un secret du serveur.
   ===================================================================== */
var SB_URL = "https://eqqglkglcegtxqaawfee.supabase.co";
var SB_CLE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxcWdsa2dsY2VndHhxYWF3ZmVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5Mjc3ODcsImV4cCI6MjExMDUwMzc4N30.wryWxS-e2kDGwAXYaUouVo-YHw_YADkXnwk4fKZUbCg";
var SB_SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
var SB_STOCK = "sb-eqqglkglcegtxqaawfee-auth-token";
var COUT_ANALYSE = 5, COUT_MESSAGE = 1, TEXTE_MAX_COMPTE = 120000;   // les mêmes que sur le serveur
var sbC = null, compte = null;   // compte = {email, profil} quand l'élève est connecté

async function sbClient() {
  if (sbC) return sbC;
  const M = await import(SB_SDK);
  sbC = M.createClient(SB_URL, SB_CLE, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit"}});
  sbC.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") setTimeout(() => { compte = null; renderCompte(); }, 0); });
  return sbC;
}
const aUneSession = () => { try { return !!localStorage.getItem(SB_STOCK); } catch (e) { return false; } };

/** La voie de l'IA : "compte" (serveur de Notéa), "cle" (clé de l'élève) ou "" (rien). */
function iaVoie() {
  const v = lsGet("notea-voie", "compte");
  if (compte && (v === "compte" || !dcKey())) return "compte";
  return dcKey() ? "cle" : "";
}

async function compteCharger() {
  if (!sbC && !aUneSession()) { renderCompte(); return; }
  try {
    const c = await sbClient(), {data: {session}} = await c.auth.getSession();
    if (!session) { compte = null; renderCompte(); return; }
    const {data, error} = await c.rpc("mon_profil");
    compte = {email: session.user.email, profil: error ? null : data};
  } catch (e) { /* hors ligne : on garde ce qu'on sait */ }
  renderCompte();
}

/** Un appel au serveur de Notéa. Le jeton de l'élève prouve qui il est. */
async function iaServeur(fn, body) {
  const c = await sbClient(), {data: {session}} = await c.auth.getSession();
  if (!session) throw new Error("Connecte-toi d'abord (Paramètres → Mon compte Notéa).");
  let r; try { r = await fetch(SB_URL + "/functions/v1/" + fn, {method: "POST", headers: {"Content-Type": "application/json", "Authorization": "Bearer " + session.access_token, "apikey": SB_CLE}, body: JSON.stringify(body)}); }
  catch (e) { throw new Error("Pas de connexion à internet."); }
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (compte && compte.profil && typeof j.credits === "number") { compte.profil.credits = j.credits; renderCompte(); }
  if (!r.ok) {
    if (j.statut === "plus_de_credits") throw new Error("Tu n'as plus assez de crédits. Ils reviennent le " + jourFr(j.recharge_le) + ".");
    throw new Error(j.erreur || j.message || "Le serveur de Notéa n'a pas répondu. Réessaie.");
  }
  return j;
}
const jourFr = d => d ? new Date(d).toLocaleDateString("fr-FR", {day: "numeric", month: "long"}) : "bientôt";

function renderCompte() {
  const on = !!compte, p = on && compte.profil;
  $("cpt-off").hidden = on; $("cpt-on").hidden = !on;
  if (on) {
    $("cpt-qui").textContent = "Connecté avec " + compte.email + ".";
    $("cpt-credits").textContent = p ? `🪙 ${p.credits} crédit${p.credits > 1 ? "s" : ""} sur ${p.credits_palier} · offre ${p.palier_nom} · recharge le ${jourFr(p.recharge_le)}. Une analyse de cours = ${COUT_ANALYSE} crédits, une réponse du prof = ${COUT_MESSAGE} crédit.` : "Je n'arrive pas à lire tes crédits. Réessaie plus tard.";
    $("cpt-accord").hidden = !p || !!p.consentement_le;
  }
  $("ia-voie-g").hidden = !(on && dcKey());
  document.querySelectorAll("#ia-voie button").forEach(b => b.classList.toggle("on", b.dataset.v === iaVoie()));
  if (!$("tab-comprendre").hidden) renderComprendre();
  if (!$("tab-mesdonnees").hidden) renderMesDonnees();
}

$("cpt-lien").addEventListener("click", async () => {
  const mail = $("cpt-mail").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { note("Cette adresse e-mail ne semble pas complète.", "warn"); return; }
  const b = $("cpt-lien"); b.disabled = true;
  try {
    const c = await sbClient();
    const {error} = await c.auth.signInWithOtp({email: mail, options: {emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true}});
    if (error) throw error;
    note("C'est envoyé ! Ouvre l'e-mail de Notéa et clique sur le lien.", "ok");
  } catch (e) { note(/rate|seconds/i.test(e.message || "") ? "Attends une minute avant de redemander un lien." : "Le lien n'a pas pu partir. Réessaie.", "err"); }
  b.disabled = false;
});
$("cpt-ok").addEventListener("click", async () => {
  try { const c = await sbClient(), {error} = await c.rpc("donner_consentement", {oui: true}); if (error) throw error; note("Merci. L'IA est prête.", "ok"); }
  catch (e) { note("Ton accord n'a pas pu être enregistré. Réessaie.", "err"); }
  compteCharger();
});
$("cpt-sortir").addEventListener("click", async () => { try { await (await sbClient()).auth.signOut(); } catch (e) {} compte = null; renderCompte(); note("Tu es déconnecté.", "ok"); });
document.querySelectorAll("#ia-voie button").forEach(b => b.addEventListener("click", () => { lsSet("notea-voie", b.dataset.v); renderCompte(); }));

/* ---------- Mes données ---------- */
async function renderMesDonnees() {
  const on = !!compte, p = on && compte.profil;
  $("md-off").hidden = on; $("md-on").hidden = !on; if (!on) return;
  const li = t => el("li", "", t);
  $("md-liste").replaceChildren(li("Ton e-mail : " + compte.email + " (pour te connecter)."),
    li(p ? `Tes crédits : ${p.credits}, offre ${p.palier_nom}.` : "Tes crédits."),
    li(p && p.consentement_le ? "Ton accord pour l'IA, donné le " + new Date(p.consentement_le).toLocaleDateString("fr-FR") + "." : "Tu n'as pas donné ton accord pour l'IA."),
    li("Pour chaque demande à l'IA : la date, le type (cours ou prof), le modèle, les crédits et la taille (en jetons). Pas le texte."));
  const box = $("md-appels"); box.replaceChildren(el("p", "muted", "Chargement…"));
  try {
    const c = await sbClient(), {data, error} = await c.from("appels").select("le, fonction, modele, credits, ok").order("le", {ascending: false}).limit(20);
    if (error) throw error;
    box.replaceChildren(data.length ? el("ul", "") : el("p", "muted", "Aucune demande pour l'instant."));
    data.forEach(a => box.firstChild.append(li(`${new Date(a.le).toLocaleString("fr-FR", {dateStyle: "short", timeStyle: "short"})} · ${a.fonction === "comprendre" ? "Comprendre un cours" : "Prof particulier"} · ${a.ok === false ? "échec, crédits rendus" : a.credits + " crédit" + (a.credits > 1 ? "s" : "")}`)));
  } catch (e) { box.replaceChildren(el("p", "muted", "Je n'arrive pas à lire tes demandes. Réessaie plus tard.")); }
}
$("md-export").addEventListener("click", async () => {
  try {
    const c = await sbClient(), {data: profil} = await c.rpc("mon_profil"), {data: appels} = await c.from("appels").select("*").order("le", {ascending: false});
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({email: compte.email, profil, appels}, null, 2)], {type: "application/json"}));
    a.download = "notea-mes-donnees-en-ligne-" + today() + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { note("Le téléchargement n'a pas marché. Réessaie.", "err"); }
});
$("md-retirer").addEventListener("click", async () => {
  if (!confirm("Retirer ton accord ? L'IA de ton compte ne marchera plus jusqu'à ce que tu le redonnes.")) return;
  try { const c = await sbClient(), {error} = await c.rpc("donner_consentement", {oui: false}); if (error) throw error; note("Accord retiré.", "ok"); } catch (e) { note("Ça n'a pas marché. Réessaie.", "err"); }
  compteCharger();
});
$("md-suppr").addEventListener("click", async () => {
  if (!confirm("Supprimer ton compte Notéa ? Ton e-mail, tes crédits et ton journal seront effacés. C'est définitif. Tes cours sur cet appareil restent.")) return;
  try { await iaServeur("supprimer-compte", {}); try { await sbC.auth.signOut(); } catch (e) {} compte = null; renderCompte(); note("Ton compte est supprimé.", "ok"); }
  catch (e) { note(e.message || "La suppression n'a pas marché. Réessaie.", "err"); }
});

/* Au démarrage : retour du lien magique, ou session déjà ouverte. */
if (/error_description=/.test(location.hash)) { note("Ce lien ne marche plus. Demande un nouveau lien dans Paramètres.", "err"); try { history.replaceState(null, "", location.pathname + "#reglages"); } catch (e) {} }
if (/access_token=/.test(location.hash)) compteCharger().then(() => { if (compte) { note("Tu es connecté. Bienvenue !", "ok"); tab("reglages"); } });
else if (aUneSession()) compteCharger(); else renderCompte();


/* ---------- Version 1.9 : créer mes fiches (recto, verso), elles vont dans tous les outils ---------- */
Object.assign(KLAB, {q: "Question"});
Object.assign(KFIELDS, {q: ["La question", "La réponse"]});
Object.assign(DEFQ, {q: t => t});
Object.assign(TERMQ, {q: "À quelle question répond cette réponse ?"});
Object.assign(KG, {q: "q"});
if (!KINDS.some(k => k[0] === "q")) KINDS.push(["q", "Question"]);

/* Le recto finit par « ? » : c'est une question. Sinon c'est un mot et sa définition. */
function ficheKind(recto) { return /\?\s*$/.test(recto) ? "q" : "def"; }
/* Une fiche = une notion écrite par l'élève. Pour une question, les trous sont dans la réponse. */
function ficheNotion(o) {
  const kind = o.kind || ficheKind(o.term);
  if (kind !== "q") { const n = manualNotion(Object.assign({}, o, {kind})); n.fiche = true; return n; }
  const head = o.term + " — ", text = head + o.def, n = makeNotion(text, "manuel", o.mat + " · " + new Date().toLocaleDateString("fr-FR"));
  const at = s => { const p = []; let c = 0; tokens(s).forEach(w => { p.push(c); c += w.length; }); return p; };
  const pt = at(text), pd = at(o.def), tt = tokens(text);
  let holes = autoHoles(o.def).map(i => pt.indexOf(head.length + pd[i])).filter(i => i >= 0);
  if (!holes.length) { const i = tt.findIndex((w, j) => pt[j] >= head.length && clean(w).length >= 3 && !STOP.has(clean(w))); if (i >= 0) holes = [i]; }
  Object.assign(n, {mat: o.mat, chap: o.chap || "", term: o.term, def: o.def, kind, holes, fiche: true});
  if (o.ex) n.ex = o.ex; if (o.why) n.why = o.why; return n;
}
/* La carte dans l'autre sens : on montre la réponse, on retrouve le mot ou la question. */
function ficheCarteInverse(n) {
  let back = n.term; if (n.why) back += "\n" + n.why;
  return newCard({nid: n.id, inv: true, front: n.def + "\n\n" + (TERMQ[kindOf(n)] || TERMQ.def), back, mat: matOf(n), chap: chapOf(n)});
}
function ficheCartes(n, inv) { const c = [notionCard(n)]; if (inv) c.push(ficheCarteInverse(n)); return c; }

/* Coller plusieurs fiches : une par ligne, recto et verso séparés par une tabulation, « ; », « = », « : » ou un tiret. */
function ficheLignes(txt) {
  return txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    let m = l.split("\t"); if (m.length >= 2) return [m[0], m.slice(1).join(" ")];
    for (const sep of [/\s*;\s*/, /\s+=\s+/, /\s+[-–—]\s+/, /\s*:\s+/]) { const i = l.search(sep); if (i > 0) { const s = l.match(sep)[0]; return [l.slice(0, i), l.slice(i + s.length)]; } }
    if (/\?/.test(l)) { const i = l.indexOf("?") + 1; if (l.slice(i).trim()) return [l.slice(0, i), l.slice(i)]; }
    return null;
  }).filter(p => p && p[0].trim() && p[1].trim()).map(p => [p[0].trim(), p[1].trim().replace(/^[:;=\-–—]\s*/, "")]);
}

let fcEdit = null;
const fcMat = () => $("fc-mat").value.trim() || "Mes cours";
const fcChap = () => $("fc-chap").value.trim();
function fcDone(t) { $("fc-done").textContent = t; }
function fcAjouter(recto, verso, ex, why) {
  const n = ficheNotion({term: recto, def: verso, ex, why, mat: fcMat(), chap: fcChap()});
  const cs = ficheCartes(n, $("fc-inv").checked); db.notions.push(n); db.cards.push(...cs); return [n, cs];
}
function fcVider() { ["fc-recto", "fc-verso", "fc-ex", "fc-why"].forEach(id => { $(id).value = ""; }); fcEdit = null; $("fc-add").textContent = "Ajouter la fiche"; $("fc-recto").focus(); }
function fcEnregistrer() {
  const recto = $("fc-recto").value.trim(), verso = $("fc-verso").value.trim();
  if (!recto || !verso) { note("Écris le recto (le mot ou la question) et le verso (la réponse).", "warn"); (recto ? $("fc-verso") : $("fc-recto")).focus(); return; }
  const ex = $("fc-ex").value.trim(), why = $("fc-why").value.trim();
  if (fcEdit) {
    const n = fcEdit, m = ficheNotion({term: recto, def: verso, ex, why, mat: fcMat(), chap: fcChap()});
    Object.assign(n, {text: m.text, term: m.term, def: m.def, kind: m.kind, holes: m.holes, mat: m.mat, chap: m.chap, fiche: true});
    if (ex) n.ex = ex; else delete n.ex; if (why) n.why = why; else delete n.why;
    const old = db.cards.filter(c => c.nid === n.id), inv = $("fc-inv").checked, neuf = ficheCartes(n, inv);
    neuf.forEach(c => { const o = old.find(x => !!x.inv === !!c.inv); if (o) Object.assign(o, {front: c.front, back: c.back, mat: c.mat, chap: c.chap}); else db.cards.push(c); });
    if (!inv) db.cards = db.cards.filter(c => !(c.nid === n.id && c.inv));
    save(); renderToday(); fillDL(); fcDone(`Fiche « ${recto} » modifiée.`); fcVider(); renderFiches(); return;
  }
  const [n, cs] = fcAjouter(recto, verso, ex, why);
  save(); renderToday(); fillDL(); fcVider(); renderFiches();
  fcDone(`Fiche « ${recto} » ajoutée. Elle arrive dans ta révision du jour, tes quiz, tes trous et tes cartes.`);
  noteUndo(`Fiche « ${recto} » ajoutée.`, () => { db.notions = db.notions.filter(x => x !== n); db.cards = db.cards.filter(c => !cs.includes(c)); save(); renderToday(); renderFiches(); fcDone(""); });
}
function renderFiches() {
  const box = $("fc-list"), m = fcMat(), ch = fcChap();
  const list = db.notions.filter(n => n.fiche && matOf(n) === m && (!ch || chapOf(n) === ch)).sort((a, b) => b.created - a.created);
  box.replaceChildren(); $("fc-rev").hidden = !list.length;
  if (!list.length) { box.append(el("p", "muted", `Pas encore de fiche en ${m}${ch ? " · " + ch : ""}.`)); return; }
  box.append(el("p", "muted", `${list.length} fiche${list.length > 1 ? "s" : ""} en ${m}${ch ? " · " + ch : ""} :`));
  list.forEach(n => {
    const r = el("div", "fc-row"), t = el("div", "fc-txt");
    t.append(el("p", "fc-r", n.term), el("p", "fc-v", n.def));
    const tag = el("span", "chip", (KLAB[kindOf(n)] || "Fiche") + (chapOf(n) && !ch ? " · " + chapOf(n) : "")); t.append(tag);
    const a = el("div", "row"), b1 = el("button", "", "Modifier"), b2 = el("button", "", "Supprimer");
    b1.addEventListener("click", () => {
      fcEdit = n; $("fc-recto").value = n.term; $("fc-verso").value = n.def; $("fc-ex").value = n.ex || ""; $("fc-why").value = n.why || "";
      $("fc-chap").value = chapOf(n); $("fc-inv").checked = db.cards.some(c => c.nid === n.id && c.inv); if (n.ex || n.why) $("fc-plus").open = true;
      $("fc-add").textContent = "Enregistrer la fiche"; $("fc-recto").focus(); $("fc-recto").scrollIntoView({block: "center", behavior: "smooth"});
    });
    b2.addEventListener("click", () => {
      const cs = db.cards.filter(c => c.nid === n.id); db.notions = db.notions.filter(x => x !== n); db.cards = db.cards.filter(c => !cs.includes(c));
      save(); renderToday(); renderFiches(); noteUndo(`Fiche « ${n.term} » supprimée.`, () => { db.notions.push(n); db.cards.push(...cs); save(); renderToday(); renderFiches(); });
    });
    a.append(b1, b2); r.append(t, a); box.append(r);
  });
}
$("fc-open").addEventListener("click", () => {
  fillDL(); $("man-card").hidden = true; $("fc-card").hidden = false; renderFiches();
  $("fc-card").scrollIntoView({block: "start", behavior: "smooth"}); ($("fc-mat").value ? $("fc-recto") : $("fc-mat")).focus();
});
$("fc-close").addEventListener("click", () => { $("fc-card").hidden = true; fcEdit = null; renderFolders(); });
$("fc-add").addEventListener("click", fcEnregistrer);
["fc-recto", "fc-verso"].forEach(id => $(id).addEventListener("keydown", e => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fcEnregistrer(); }
  else if (e.key === "Enter" && !e.shiftKey && id === "fc-recto") { e.preventDefault(); $("fc-verso").focus(); }
}));
["fc-mat", "fc-chap"].forEach(id => $(id).addEventListener("change", renderFiches));
$("fc-bulk-go").addEventListener("click", () => {
  const p = ficheLignes($("fc-bulk").value);
  if (!p.length) { note("Écris une fiche par ligne, par exemple : qualitative ; petit échantillon, on recherche le pourquoi", "warn"); $("fc-bulk").focus(); return; }
  const added = p.map(([r, v]) => fcAjouter(r, v, "", ""));
  save(); renderToday(); fillDL(); $("fc-bulk").value = ""; renderFiches();
  fcDone(`${added.length} fiche${added.length > 1 ? "s" : ""} ajoutée${added.length > 1 ? "s" : ""}.`);
  noteUndo(`${added.length} fiches ajoutées.`, () => { const ns = added.map(a => a[0]), cs = added.flatMap(a => a[1]); db.notions = db.notions.filter(x => !ns.includes(x)); db.cards = db.cards.filter(c => !cs.includes(c)); save(); renderToday(); renderFiches(); fcDone(""); });
});
$("fc-rev").addEventListener("click", () => { const m = fcMat(), ch = fcChap(); tab("cartes"); $("ca-mat").value = m; fillChapSel($("ca-chap"), m); $("ca-chap").value = ch; renderCartes(); });


/* ---------- Version 1.10 : faire ses fiches à l'oral ---------- */
["fc-recto", "fc-verso", "fc-ex", "fc-why", "fc-bulk"].forEach(id => addMic(id));
/* Le mode oral : on dit le recto, Notéa passe seul au verso ; « fiche suivante » ajoute la fiche et repart au recto. */
{
  let oral = null, phase = "recto";
  const nk2 = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const FIN = /(?:^|\s)(fiche suivante|suivante|ajoute la fiche|ajouter la fiche|valide|valider)$/;
  const etat = () => {
    const box = $("fc-oral-t");
    box.textContent = !oral ? "" : phase === "recto" ? "🎤 Dis le recto : le mot ou la question." : "🎤 Explique le verso. Dis « fiche suivante » pour l'ajouter, ou « recto » pour corriger le recto.";
    $("fc-recto").classList.toggle("fc-ecoute", !!oral && phase === "recto"); $("fc-verso").classList.toggle("fc-ecoute", !!oral && phase === "verso");
  };
  const ajoute = (id, txt) => { const f = $(id), v = f.value; if (!txt) return; f.value = v + (/\S$/.test(v) ? " " : "") + txt; };
  const aPhase = p => { phase = p; $(p === "recto" ? "fc-recto" : "fc-verso").focus(); etat(); };
  function entendu(brut) {
    const t = brut.trim(), k = nk2(t); if (!k) return;
    if (/^(stop|arrete|arreter|termine|fin de la dictee)$/.test(k)) { arreter(); return; }
    if (k === "recto") { $("fc-recto").value = ""; aPhase("recto"); return; }
    if (k === "verso" || k === "reponse") { aPhase("verso"); return; }
    if (phase === "recto") { ajoute("fc-recto", t.replace(/[.]$/, "")); aPhase("verso"); return; }
    const m = k.match(FIN);
    if (m) {
      const n = m[1].split(" ").length, mots = t.split(/\s+/); ajoute("fc-verso", mots.slice(0, Math.max(0, mots.length - n)).join(" ").replace(/[,.]$/, ""));
      if ($("fc-recto").value.trim() && $("fc-verso").value.trim()) { fcEnregistrer(); aPhase("recto"); } else note("Il manque le recto ou le verso.", "warn");
      return;
    }
    ajoute("fc-verso", t);
  }
  function lancer() {
    oral = new SRC(); oral.lang = "fr-FR"; oral.continuous = true; oral.interimResults = false;
    oral.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) entendu(e.results[i][0].transcript); };
    oral.onend = () => { if (oral) { try { oral.start(); } catch (e) { arreter(); } } };   // le navigateur coupe après un silence : on relance
    oral.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { note("Autorise le micro pour dicter tes fiches.", "warn"); arreter(); } };
    try { oral.start(); } catch (e) { oral = null; return; }
    $("fc-oral").textContent = "Arrêter le mode oral"; $("fc-oral").classList.add("on");
    aPhase($("fc-recto").value.trim() && !$("fc-verso").value.trim() ? "verso" : "recto");
  }
  function arreter() { const r = oral; oral = null; if (r) try { r.stop(); } catch (e) {} $("fc-oral").textContent = "🎤 Faire mes fiches à l'oral"; $("fc-oral").classList.remove("on"); etat(); }
  if (!SRC) $("fc-oral-row").hidden = true;
  else {
    $("fc-oral").addEventListener("click", () => oral ? arreter() : lancer());
    $("fc-close").addEventListener("click", arreter);
    $("fc-recto").addEventListener("focus", () => { if (oral && phase !== "recto") { phase = "recto"; etat(); } });
    $("fc-verso").addEventListener("focus", () => { if (oral && phase !== "verso") { phase = "verso"; etat(); } });
  }
}


/* ---------- Version 1.11 : supprimer un cours terminé (clic droit, ou appui long sur téléphone) ---------- */
function supprimerMatiere(m) {
  const avant = JSON.stringify(db), ids = new Set(db.cours.filter(c => c.mat === m).map(c => c.id)), n = db.notions.filter(x => matOf(x) === m).length;
  db.notions = db.notions.filter(x => matOf(x) !== m); db.cards = (db.cards || []).filter(x => matOf(x) !== m); db.exos = (db.exos || []).filter(x => matOf(x) !== m);
  db.cours = db.cours.filter(c => c.mat !== m); ids.forEach(id => { if (db.moteur) delete db.moteur[id]; });
  if (db.ia) Object.keys(db.ia).forEach(k => { if (db.ia[k].mat === m || ids.has(k)) delete db.ia[k]; });
  if (db.mats) delete db.mats[m];
  save(); renderFolders(); renderToday();
  noteUndo(`« ${m} » est supprimé (${n} notion${n > 1 ? "s" : ""}).`, () => { db = Object.assign(db, JSON.parse(avant)); save(); renderFolders(); renderToday(); });
}
function menuDossier(m, x, y) {
  fermerMenu(); const box = el("div", "ctx"); box.id = "ctx"; box.setAttribute("role", "menu");
  const b1 = el("button", "", "Ouvrir"), b2 = el("button", "danger", "🗑 Supprimer ce cours");
  [b1, b2].forEach(b => b.setAttribute("role", "menuitem"));
  b1.addEventListener("click", () => { fermerMenu(); nMat = m; nFilter = "tout"; tab("notes"); });
  b2.addEventListener("click", () => {
    fermerMenu(); const n = db.notions.filter(z => matOf(z) === m).length;
    if (confirm(`Supprimer « ${m} » ?\n\n${n} notion${n > 1 ? "s" : ""}, les fiches, les cartes et les cours de cette matière seront supprimés.`)) supprimerMatiere(m);
  });
  box.append(el("p", "ctx-t", m), b1, b2); document.body.append(box);
  const w = box.offsetWidth, h = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + "px"; box.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + "px"; b2.focus();
}
function fermerMenu() { const c = $("ctx"); if (c) c.remove(); }
document.addEventListener("click", e => { if (!e.target.closest("#ctx")) fermerMenu(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") fermerMenu(); });
addEventListener("scroll", fermerMenu, true);
function brancherMenu(b, m) {
  b.addEventListener("contextmenu", e => { e.preventDefault(); menuDossier(m, e.clientX, e.clientY); });
  let t = null; const stop = () => clearTimeout(t);
  b.addEventListener("touchstart", e => { const p = e.touches[0]; t = setTimeout(() => { b.dataset.long = "1"; menuDossier(m, p.clientX, p.clientY); }, 600); }, {passive: true});
  ["touchend", "touchmove", "touchcancel"].forEach(k => b.addEventListener(k, stop));
  b.addEventListener("click", e => { if (b.dataset.long) { e.stopImmediatePropagation(); delete b.dataset.long; } }, true);
  b.addEventListener("keydown", e => { if (e.key === "Delete" || (e.shiftKey && e.key === "F10") || e.key === "ContextMenu") { e.preventDefault(); const r = b.getBoundingClientRect(); menuDossier(m, r.left + 20, r.top + 20); } });
}

/* ---------- Le bouton « retour » du navigateur marche, et la page ouverte est gardée ---------- */
window.addEventListener("popstate", () => tab(TABS[location.hash.slice(1)] ? location.hash.slice(1) : "jour", true));
tab(TABS[location.hash.slice(1)] ? location.hash.slice(1) : "jour", true);

})();
