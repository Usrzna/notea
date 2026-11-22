// Notéa : ce qui est commun aux fonctions d'IA.
// L'IA du serveur est Gemini (Google), offre gratuite. La clé vient du secret GEMINI_API_KEY
// (Supabase → Edge Functions → Secrets). Elle n'est jamais dans le code.
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const rep = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

/** L'élève qui appelle, d'après son jeton de connexion. */
export async function eleve(req: Request, sb: SupabaseClient): Promise<User | null> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await sb.auth.getUser(jwt);
  return error || !data.user ? null : data.user;
}

const REFUS: Record<string, [number, string]> = {
  pas_d_accord: [403, "Donne d'abord ton accord dans Paramètres → Mon compte."],
  trop_vite: [429, "Trop de demandes d'un coup. Attends une minute."],
  plus_de_credits: [402, "Tu n'as plus assez de crédits."],
  pas_de_profil: [403, "Compte introuvable. Reconnecte-toi."],
};

export type Resultat = { corps: Record<string, unknown>; tIn: number; tOut: number; modele: string };

/**
 * Le chemin de chaque appel : vérifier l'élève, lire la demande, débiter les crédits,
 * appeler l'IA, rendre les crédits si ça échoue.
 */
export function servir(opts: {
  fonction: string;
  maxParMinute: number;
  // deno-lint-ignore no-explicit-any
  lire: (body: any) => { erreur: string } | { cout: number; faire: (cle: string, modele: string) => Promise<Resultat> };
}) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return rep(405, { erreur: "Méthode refusée." });
    const cle = Deno.env.get("GEMINI_API_KEY");
    if (!cle) return rep(503, { erreur: "L'IA de Notéa n'est pas encore branchée. Réessaie plus tard." });
    const sb = admin();
    const u = await eleve(req, sb);
    if (!u) return rep(401, { erreur: "Connecte-toi d'abord (Paramètres → Mon compte)." });
    let body: unknown;
    try { body = await req.json(); } catch { return rep(400, { erreur: "Demande illisible." }); }
    const l = opts.lire(body);
    if ("erreur" in l) return rep(400, { erreur: l.erreur });

    const { data: d, error: e } = await sb.rpc("debiter", { uid: u.id, n: l.cout, fn: opts.fonction, max_minute: opts.maxParMinute });
    if (e) { console.error("debiter", e); return rep(500, { erreur: "Le serveur a un souci. Réessaie." }); }
    if (d.statut !== "ok") { const [s, m] = REFUS[d.statut] || [500, "Refusé."]; return rep(s, { erreur: m, statut: d.statut, credits: d.credits, recharge_le: d.recharge_le }); }

    try {
      const r = await l.faire(cle, d.modele);
      const credits = await sb.rpc("terminer_appel", { aid: d.appel, reussi: true, t_in: r.tIn, t_out: r.tOut, mod: r.modele });
      return rep(200, { ...r.corps, modele: r.modele, credits: credits.data, cout: l.cout });
    } catch (err) {
      console.error(opts.fonction, err);
      const credits = await sb.rpc("terminer_appel", { aid: d.appel, reussi: false, t_in: 0, t_out: 0, mod: null });
      const msg = err instanceof ErreurEleve ? err.message : "L'IA n'a pas pu répondre. Réessaie. Tes crédits sont rendus.";
      return rep(err instanceof ErreurEleve ? 422 : 503, { erreur: msg, credits: credits.data, rendu: true });
    }
  };
}

/** Une erreur à montrer telle quelle à l'élève. */
export class ErreurEleve extends Error {}

// Si le modèle choisi est saturé, lent ou absent, on essaie le suivant (tous dans l'offre gratuite).
// Mesuré le 22/11/2026 : gemini-3.5-flash répond en 10 s ; 3.1-flash-lite en 16 s ; les autres étaient souvent saturés.
const SECOURS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-lite-latest"];
const PAR_MODELE = 60_000;   // un modèle trop lent ne mange pas tout le temps : on passe au suivant

/** Le schéma JSON standard, traduit pour l'ancien format de Gemini (sans additionalProperties, types en majuscules). */
// deno-lint-ignore no-explicit-any
function versSchemaGemini(s: any): any {
  if (Array.isArray(s)) return s.map(versSchemaGemini);
  if (!s || typeof s !== "object") return s;
  // deno-lint-ignore no-explicit-any
  const o: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "additionalProperties") continue;
    if (k === "type" && typeof v === "string") o.type = v.toUpperCase();
    else if (k === "properties") o.properties = Object.fromEntries(Object.entries(v as object).map(([p, x]) => [p, versSchemaGemini(x)]));
    else o[k] = versSchemaGemini(v);
  }
  return o;
}

/** Un appel à Gemini. Renvoie le texte et la taille (en jetons). */
export async function appelIA(cle: string, p: {
  model: string; system: string; messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number; schema?: Record<string, unknown>;
}) {
  const modeles = [p.model, ...SECOURS.filter((m) => m !== p.model)];
  const contents = p.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const fin = Date.now() + 135_000;   // une Edge Function gratuite est coupée à 150 s
  const trop = () => new ErreurEleve("L'IA a mis trop de temps. Réessaie dans un moment, ou avec un cours plus court. Tes crédits sont rendus.");
  // Les formes essayées, de la meilleure à la plus simple : si Google refuse un réglage (erreur 400), on essaie le suivant.
  const formes: Record<string, unknown>[] = p.schema
    ? [{ responseMimeType: "application/json", responseJsonSchema: p.schema, thinkingConfig: { thinkingLevel: "low" } },
       { responseMimeType: "application/json", responseJsonSchema: p.schema },
       { responseMimeType: "application/json", responseSchema: versSchemaGemini(p.schema) }]
    : [{ thinkingConfig: { thinkingLevel: "low" } }, {}];
  let derniere = "", sature = false;
  for (const model of modeles) {
    for (const forme of formes) {
      const reste = fin - Date.now();
      if (reste < 8_000) throw trop();
      let r: Response;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": cle },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: p.system }] }, contents, generationConfig: { maxOutputTokens: p.maxTokens, ...forme } }),
          signal: AbortSignal.timeout(Math.min(reste, PAR_MODELE)),
        });
      } catch (e) {
        if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) { derniere = model + " trop lent"; console.warn("gemini", derniere); break; }
        throw e;
      }
      // deno-lint-ignore no-explicit-any
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) {
        derniere = `${model} ${r.status} ${j?.error?.message || ""}`;
        console.warn("gemini", derniere);
        if (r.status === 400) continue;                                    // réglage refusé : forme suivante
        if (r.status === 429 || r.status === 503) sature = true;
        if (r.status === 429 || r.status === 404 || r.status >= 500) break; // modèle saturé ou absent : modèle suivant
        throw new Error(derniere);
      }
      const c = j.candidates?.[0];
      if (!c) throw new ErreurEleve("L'IA a refusé cette demande. Tes crédits sont rendus.");
      if (c.finishReason === "MAX_TOKENS") throw new ErreurEleve("Le cours est trop long pour une seule analyse. Coupe-le en deux cours. Tes crédits sont rendus.");
      if (c.finishReason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(c.finishReason)) throw new ErreurEleve("L'IA a refusé cette demande. Tes crédits sont rendus.");
      // deno-lint-ignore no-explicit-any
      const text = (c.content?.parts || []).filter((x: any) => x.text && !x.thought).map((x: any) => x.text).join("");
      const u = j.usageMetadata || {};
      return { text, tIn: u.promptTokenCount || 0, tOut: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), modele: j.modelVersion || model };
    }
  }
  if (sature) throw new ErreurEleve("L'IA gratuite de Notéa est très demandée en ce moment. Réessaie dans quelques minutes. Tes crédits sont rendus.");
  if (/trop lent/.test(derniere)) throw trop();
  throw new Error(derniere || "aucun modèle");
}
