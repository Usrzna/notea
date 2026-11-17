// Recopie la consigne et le schéma de l'IA (js/app.js) dans le serveur (supabase/functions/_shared/consignes.ts).
// À lancer après chaque changement de IA_SYSTEME, IA_SCHEMA, DC_BASE ou DC_MODES :  node scripts/consignes.js
const fs = require("fs"), path = require("path");
const racine = path.join(__dirname, "..");
const s = fs.readFileSync(path.join(racine, "js/app.js"), "utf8");
const grab = re => { const m = s.match(re); if (!m) throw new Error("introuvable : " + re); return m[1]; };
const sys = grab(/var IA_SYSTEME = (`[\s\S]*?`);/);
const sch = grab(/var IA_SCHEMA = (\{[\s\S]*?\}\}\}\}\};)/);
const base = grab(/const DC_BASE = ("[^\n]*");/);
const modes = grab(/const DC_MODES = (\{[\s\S]*?\n\});/);
const out = `// Copié de js/app.js (bloc Version 1.7 et prof particulier) par scripts/consignes.js. Ne pas modifier à la main.
// deno-lint-ignore-file
export const IA_SYSTEME = ${sys};
export const IA_SCHEMA: Record<string, unknown> = ${sch}
export const DC_BASE = ${base};
export const DC_MODES: Record<string, [string, string]> = ${modes};
`;
fs.writeFileSync(path.join(racine, "supabase/functions/_shared/consignes.ts"), out);
console.log("consignes.ts à jour (" + out.length + " caractères)");
