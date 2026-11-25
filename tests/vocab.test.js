// Le vocabulaire du cours (js/vocabulaire.js) : un mot, sa définition, rangés par partie.
const test = require("node:test"), assert = require("node:assert");
const V = require("../js/vocabulaire.js");
const COURS = `Thème 3 : la formation du contrat
Vocabulaire à connaître
- Contrat : accord de volontés destiné à créer des obligations.
- Dol : manœuvres ou mensonges d'un cocontractant pour tromper l'autre.
- Violence : contrainte physique ou morale exercée sur une partie.
Exemple : un contrat conclu par un mineur peut être annulé.
Thème 4 : la nullité
**Nullité relative** : sanction qui protège un intérêt privé.
**Nullité absolue** : sanction qui protège l'intérêt général.
| Terme | Définition |
| Tutelle | Régime de protection d'un majeur qui doit être représenté |`;

test("trouve les mots, leurs définitions et leur partie", () => {
  const L = V.extraire(COURS), mots = L.map(v => v.mot);
  assert.deepStrictEqual(mots, ["Contrat", "Dol", "Violence", "Nullité relative", "Nullité absolue", "Tutelle"]);
  assert.ok(!mots.includes("Exemple"), "« Exemple : » n'est pas un mot");
  assert.strictEqual(L[0].partie, "Thème 3 : la formation du contrat");
  assert.strictEqual(L[5].partie, "Thème 4 : la nullité");
});

test("chaque question a une seule bonne réponse et des mauvais choix de la même partie", () => {
  const L = V.extraire(COURS), p3 = L.filter(v => v.partie.startsWith("Thème 3"));
  V.questions(p3, L).forEach(q => {
    assert.ok(q.mauvaises.length >= 2);
    assert.ok(!q.mauvaises.some(m => m.a === q.bonne));
  });
});

test("« quel mot ? » : le mot est caché dans la définition", () => {
  assert.strictEqual(V.masquer("La nullité relative protège un intérêt privé", "Nullité relative"), "La … protège un intérêt privé");
});
