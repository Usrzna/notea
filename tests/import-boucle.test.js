// L'import ne doit jamais se figer : un cours avec plusieurs années proches (2020, 2022, 2026…) bouclait sans fin
// dans la fabrication des QCM de dates (08b-qcm.js). On lance l'analyse dans un autre processus avec une limite de temps :
// si elle se remet à boucler, le test échoue au lieu de bloquer.
const test = require("node:test"), assert = require("node:assert"), path = require("path");
const { spawnSync } = require("child_process");

const COURS = {
  "années 2020, 2022 et 2026": `Communication responsable
La saturation publicitaire est mesurée en 2020 : 55 % des internautes trouvent la publicité rébarbative.
L'ARCOM est née en 2022 de la fusion du CSA et de l'Hadopi. Elle peut sanctionner les annonceurs.
En 2026, 31 % des cyberacheteurs utilisent l'IA pour acheter en ligne.
Le goodwashing est le fait de donner une image responsable sans que les engagements suivent.`,
  "années qui se suivent": `La crise de la dette
En 1929 la bourse de New York s'effondre. En 1930 les faillites bancaires se multiplient. En 1931 la crise gagne l'Europe.
En 1932 le chômage atteint son maximum. En 1933 le New Deal est annoncé. La relance doit réduire le chômage.`,
  "même année partout": `Le traité fondateur est signé en 2005. Le traité prévoit une union monétaire. En 2005 la règle est appliquée.
En 2005 le conseil approuve le budget. L'union monétaire réduit les coûts de change.`,
};

for (const [nom, texte] of Object.entries(COURS)) {
  test("l'analyse se termine vite : " + nom, () => {
    const code = `const M = require(${JSON.stringify(path.join(__dirname, "charger.js"))}); const a = M.analyserCours([{nom: "Test", type: "texte", texte: ${JSON.stringify(texte)}}], {}); console.log("OK " + a.questions.length);`;
    const r = spawnSync(process.execPath, ["-e", code], { timeout: 20000, encoding: "utf8" });
    assert.ok(!r.error, "L'analyse ne se termine pas (boucle infinie ?) : " + (r.error && r.error.message));
    assert.match(r.stdout, /^OK \d+/);
  });
}
