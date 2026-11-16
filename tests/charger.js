// Charge le moteur dans Node (mêmes fichiers que le navigateur, dans l'ordre).
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "js", "moteur");
fs.readdirSync(dir).filter(f => f.endsWith(".js")).sort().forEach(f => require(path.join(dir, f)));
module.exports = globalThis.NoteaMoteur;
