// Notéa v2.2 : l'IA corrige une réponse écrite et dit POURQUOI c'est juste ou faux (la cause de l'erreur).
// Gratuit en crédits (0), limité à 20 par minute. Rien n'est gardé.
import { appelIA, ErreurEleve, servir } from "../_shared/commun.ts";
import { IA } from "../_shared/ia.ts";

const t = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const liste = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, n).map((x) => x.slice(0, max)) : []);

Deno.serve(servir({
  fonction: "corriger",
  maxParMinute: 20,
  lire: (b) => {
    const reponse = t(b?.reponse, 4000).trim();
    const question = t(b?.question, 1500);
    if (!question) return { erreur: "Question manquante." };
    const n = b?.notion || {};
    const demande = {
      question, type: t(b?.type, 30), format: t(b?.format, 20), reponse_attendue: t(b?.reponse_attendue, 2000), points_cles: liste(b?.points_cles, 8, 300),
      notion: { terme: t(n.terme, 200), a_retenir: t(n.a_retenir, 800), confusions: liste(n.confusions, 6, 300), erreurs_frequentes: liste(n.erreurs_frequentes, 6, 300) },
      deja_reussie: !!b?.deja_reussie,
      reponse_etudiant: reponse || "(vide : l'étudiant n'a rien écrit ou a dit qu'il ne savait pas)",
    };
    return {
      cout: 0,
      faire: async (cle, model) => {
        const r = await appelIA(cle, {
          model, system: IA.CORRIGER_SYSTEME, maxTokens: 3000, schema: IA.CORRIGER_SCHEMA, reflexion: "low", parModele: 40_000, prefere: "groq", forcer: b?.fournisseur === "groq" ? "groq" : undefined,
          messages: [{ role: "user", content: JSON.stringify(demande) }],
        });
        let d: Record<string, unknown>;
        try { d = JSON.parse(r.text); } catch { throw new ErreurEleve("La correction n'a pas marché. Réessaie."); }
        d.score = Math.max(0, Math.min(1, Number(d.score) || 0));
        return { corps: { correction: d }, tIn: r.tIn, tOut: r.tOut, modele: r.modele };
      },
    };
  },
}));
