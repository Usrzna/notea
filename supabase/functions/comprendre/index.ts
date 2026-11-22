// Notéa : l'IA comprend un cours (même consigne et même schéma que iaAnalyser dans js/app.js ; l'IA est Gemini).
// Le cours n'est pas gardé : il est envoyé à l'IA puis oublié.
import { appelIA, ErreurEleve, servir } from "../_shared/commun.ts";
import { IA_SCHEMA, IA_SYSTEME } from "../_shared/consignes.ts";

export const COUT = 5;              // crédits par analyse
export const TEXTE_MAX = 120_000;   // caractères (environ 35 000 jetons)

Deno.serve(servir({
  fonction: "comprendre",
  maxParMinute: 3,
  lire: (b) => {
    const mat = typeof b?.mat === "string" ? b.mat.trim().slice(0, 100) : "";
    const texte = typeof b?.texte === "string" ? b.texte.trim() : "";
    if (texte.length < 20) return { erreur: "Ce cours est vide ou trop court." };
    if (texte.length > TEXTE_MAX) return { erreur: `Ce cours est trop long (plus de ${TEXTE_MAX / 1000} 000 caractères). Coupe-le en plusieurs cours.` };
    return {
      cout: COUT,
      faire: async (cle, model) => {
        const r = await appelIA(cle, {
          model, system: IA_SYSTEME, maxTokens: 32000, schema: IA_SCHEMA,
          messages: [{ role: "user", content: `Matière : ${mat || "Cours"}\n\nVoici mes notes de cours :\n<cours>\n${texte}\n</cours>` }],
        });
        try { JSON.parse(r.text); } catch { throw new ErreurEleve("La réponse de l'IA est incomplète. Réessaie. Tes crédits sont rendus."); }
        return { corps: { text: r.text }, tIn: r.tIn, tOut: r.tOut, modele: r.modele };
      },
    };
  },
}));
