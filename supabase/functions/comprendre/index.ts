// Notéa v2.2 : l'IA comprend un cours, en 2 étapes (consignes dans js/ia-consignes.js, copiées dans _shared/ia.ts).
//   etape "analyse"   : comprendre le cours (notions, attendus, méthodes, confusions…). 3 crédits.
//   etape "questions" : écrire les questions à partir de l'analyse. 2 crédits.
// Le cours n'est pas gardé : il est envoyé à l'IA puis oublié.
import { appelIA, ErreurEleve, servir } from "../_shared/commun.ts";
import { IA } from "../_shared/ia.ts";

export const TEXTE_MAX = 120_000;   // caractères (environ 35 000 jetons)
const ANALYSE_MAX = 80_000;
// Chaque modèle a son propre quota gratuit : on en essaie plusieurs. « lite » seulement en dernier recours (moins fin).
const FLASH = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];

Deno.serve(servir({
  fonction: "comprendre",
  maxParMinute: 4,
  lire: (b) => {
    const etape = b?.etape === "questions" ? "questions" : "analyse";
    const mat = typeof b?.mat === "string" ? b.mat.trim().slice(0, 100) : "";
    const texte = typeof b?.texte === "string" ? b.texte.trim() : "";
    if (texte.length < 20) return { erreur: "Ce cours est vide ou trop court." };
    if (texte.length > TEXTE_MAX) return { erreur: `Ce cours est trop long (plus de ${TEXTE_MAX / 1000} 000 caractères). Coupe-le en plusieurs cours.` };
    const cours = `Matière : ${mat || "Cours"}\n\n<cours>\n${texte}\n</cours>`;
    if (etape === "analyse") return {
      cout: 3,
      faire: async (cle, model) => {
        const r = await appelIA(cle, {
          model, system: IA.ANALYSE_SYSTEME, maxTokens: 40000, schema: IA.ANALYSE_SCHEMA, reflexion: "medium", secours: FLASH, parModele: 75_000, forcer: b?.fournisseur === "groq" ? "groq" : undefined,
          messages: [{ role: "user", content: cours + "\n\nAnalyse ce cours en suivant la procédure." }],
        });
        verifierJSON(r.text, "notions");
        return { corps: { text: r.text }, tIn: r.tIn, tOut: r.tOut, modele: r.modele };
      },
    };
    const analyse = typeof b?.analyse === "string" ? b.analyse : "";
    if (!analyse || analyse.length > ANALYSE_MAX) return { erreur: "Il faut d'abord l'analyse du cours." };
    return {
      cout: 2,
      faire: async (cle, model) => {
        const r = await appelIA(cle, {
          model, system: IA.QUESTIONS_SYSTEME, maxTokens: 40000, schema: IA.QUESTIONS_SCHEMA, reflexion: "medium", secours: FLASH, parModele: 75_000, forcer: b?.fournisseur === "groq" ? "groq" : undefined,
          messages: [{ role: "user", content: `L'analyse du cours :\n<analyse>\n${analyse}\n</analyse>\n\n${cours}\n\nÉcris les questions d'entraînement.` }],
        });
        verifierJSON(r.text, "questions");
        return { corps: { text: r.text }, tIn: r.tIn, tOut: r.tOut, modele: r.modele };
      },
    };
  },
}));

function verifierJSON(text: string, champ: string) {
  let d: Record<string, unknown>;
  try { d = JSON.parse(text); } catch { throw new ErreurEleve("La réponse de l'IA est incomplète. Réessaie. Tes crédits sont rendus."); }
  if (!Array.isArray(d[champ]) || !(d[champ] as unknown[]).length) throw new ErreurEleve("L'IA n'a rien trouvé dans ce cours. Vérifie le texte, puis réessaie. Tes crédits sont rendus.");
}
