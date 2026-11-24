// Tests des consignes de l'IA (v2.2) : schémas valides, serveur à jour, garde-fous présents.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const C = require("../js/ia-consignes.js");

function objets(s, out = []) {
  if (!s || typeof s !== "object") return out;
  if (s.type === "object") out.push(s);
  Object.values(s.properties || {}).forEach(v => objets(v, out)); if (s.items) objets(s.items, out);
  return out;
}

test("chaque objet des schémas est strict (tous les champs requis, rien en plus)", () => {
  for (const nom of ["ANALYSE_SCHEMA", "QUESTIONS_SCHEMA", "CORRIGER_SCHEMA"]) {
    const os = objets(C[nom]); assert.ok(os.length > 0, nom);
    os.forEach(o => { assert.strictEqual(o.additionalProperties, false, nom); assert.deepStrictEqual([...o.required].sort(), Object.keys(o.properties).sort(), nom); });
  }
});

test("les méthodes, types et causes sont tous nommés pour l'élève", () => {
  C.METHODES.forEach(m => assert.ok(C.NOMS_METHODE[m], m));
  C.TYPES_Q.forEach(t => assert.ok(C.NOMS_TYPE[t], t));
  C.CAUSES.filter(c => c !== "aucune").forEach(c => assert.ok(C.NOMS_CAUSE[c], c));
});

test("les consignes interdisent les questions « phrase recopiée » et la notation de l'orthographe", () => {
  assert.match(C.QUESTIONS_SYSTEME, /Jamais de phrase du cours recopiée/);
  assert.match(C.ANALYSE_SYSTEME, /Une notion n'est pas une phrase/);
  assert.match(C.CORRIGER_SYSTEME, /orthographe.*ne comptent jamais/);
  assert.match(C.PROF_METHODE, /CHANGE de méthode/);
});

test("le serveur a la même version des consignes (node scripts/consignes.js)", () => {
  const ts = fs.readFileSync(path.join(__dirname, "../supabase/functions/_shared/ia.ts"), "utf8").replace(/\r\n/g, "\n");
  const js = fs.readFileSync(path.join(__dirname, "../js/ia-consignes.js"), "utf8").replace(/\r\n/g, "\n");
  const corps = s => s.slice(s.indexOf("const METHODES"), s.indexOf("return {METHODES"));
  assert.strictEqual(corps(ts), corps(js), "Lance : node scripts/consignes.js");
});
