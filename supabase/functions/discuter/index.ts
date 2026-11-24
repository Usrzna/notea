// Notéa : le prof particulier. La consigne vient du serveur (DC_BASE + DC_MODES + IA.PROF_METHODE).
// L'appli envoie les notions (avec méthode conseillée et difficultés de l'élève) et la discussion.
// L'IA est Gemini. v2.2 : il commence par ce qui bloque et change de méthode si l'élève ne comprend pas. Rien n'est gardé.
import { appelIA, servir } from "../_shared/commun.ts";
import { DC_BASE, DC_MODES } from "../_shared/consignes.ts";
import { IA } from "../_shared/ia.ts";

export const COUT = 1;               // crédit par réponse
const CONTEXTE_MAX = 30_000, TOUR_MAX = 4_000, TOURS_MAX = 40, TOTAL_MAX = 40_000;

Deno.serve(servir({
  fonction: "discuter",
  maxParMinute: 10,
  lire: (b) => {
    const mode = typeof b?.mode === "string" && DC_MODES[b.mode] ? b.mode : "";
    if (!mode) return { erreur: "Mode de discussion inconnu." };
    const contexte = typeof b?.contexte === "string" ? b.contexte : "";
    if (contexte.length > CONTEXTE_MAX) return { erreur: "Trop de notions d'un coup. Choisis une seule matière." };
    const m = Array.isArray(b?.messages) ? b.messages : [];
    if (!m.length || m.length > TOURS_MAX) return { erreur: "La discussion est trop longue. Recommence-la." };
    let total = 0;
    for (let i = 0; i < m.length; i++) {
      const t = m[i];
      if (!t || typeof t.content !== "string" || t.role !== (i % 2 === 0 ? "user" : "assistant")) return { erreur: "Discussion illisible." };
      if (t.content.length > TOUR_MAX) return { erreur: "Ton message est trop long." };
      total += t.content.length;
    }
    if (total > TOTAL_MAX || m[m.length - 1].role !== "user") return { erreur: "La discussion est trop longue. Recommence-la." };
    const messages = m.map((t: { role: "user" | "assistant"; content: string }) => ({ role: t.role, content: t.content }));
    return {
      cout: COUT,
      faire: async (cle, model) => {
        const r = await appelIA(cle, {
          model, maxTokens: 4000, messages, reflexion: "low",
          system: DC_BASE + " " + DC_MODES[mode][1] + "\n\n" + IA.PROF_METHODE + "\n\nLes notions du cours et les difficultés de l'élève :\n" + contexte,
        });
        return { corps: { text: r.text.trim() }, tIn: r.tIn, tOut: r.tOut, modele: r.modele };
      },
    };
  },
}));
