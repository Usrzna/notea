// Notéa : ce qui est commun aux fonctions d'IA.
// La clé Anthropic vient du secret ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets). Elle n'est jamais dans le code.
import Anthropic from "npm:@anthropic-ai/sdk@1.4.0";
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
 * appeler Claude, rendre les crédits si ça échoue.
 */
export function servir(opts: {
  fonction: string;
  maxParMinute: number;
  lire: (body: any) => { erreur: string } | { cout: number; faire: (client: Anthropic, modele: string) => Promise<Resultat> };
}) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return rep(405, { erreur: "Méthode refusée." });
    const cle = Deno.env.get("ANTHROPIC_API_KEY");
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

    // 135 s au plus : une Edge Function gratuite est coupée à 150 s. Pas de nouvel essai, pour ne pas dépasser.
    const client = new Anthropic({ apiKey: cle, timeout: 135_000, maxRetries: 0 });
    try {
      const r = await l.faire(client, d.modele);
      const credits = await sb.rpc("terminer_appel", { aid: d.appel, reussi: true, t_in: r.tIn, t_out: r.tOut, mod: r.modele });
      return rep(200, { ...r.corps, modele: r.modele, credits: credits.data, cout: l.cout });
    } catch (err) {
      console.error(opts.fonction, err);
      const credits = await sb.rpc("terminer_appel", { aid: d.appel, reussi: false, t_in: 0, t_out: 0, mod: null });
      return rep(err instanceof ErreurEleve ? 422 : 503, { erreur: messageErreur(err), credits: credits.data, rendu: true });
    }
  };
}

/** Une erreur à montrer telle quelle à l'élève. */
export class ErreurEleve extends Error {}

function messageErreur(err: unknown): string {
  if (err instanceof ErreurEleve) return err.message;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "L'IA a mis trop de temps. Essaie avec un cours plus court. Tes crédits sont rendus.";
  if (err instanceof Anthropic.RateLimitError) return "L'IA est très demandée. Réessaie dans une minute. Tes crédits sont rendus.";
  if (err instanceof Anthropic.APIError && err.status === 529) return "L'IA est surchargée. Réessaie dans une minute. Tes crédits sont rendus.";
  return "L'IA n'a pas pu répondre. Réessaie. Tes crédits sont rendus.";
}

/** Un appel à Claude, comme dans l'appli (iaCall), avec le repli côté serveur pour Opus et Sonnet. */
export async function appelClaude(client: Anthropic, p: {
  model: string; system: string; messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number; effort: "low" | "medium" | "high"; format?: Record<string, unknown>;
}) {
  const req: Record<string, unknown> = {
    model: p.model, max_tokens: p.maxTokens, system: p.system, messages: p.messages,
    output_config: p.format ? { effort: p.effort, format: p.format } : { effort: p.effort },
  };
  if (p.model !== "claude-haiku-5-5") { req.betas = ["server-side-fallback-2026-07-01"]; req.fallbacks = "default"; }
  // deno-lint-ignore no-explicit-any
  const msg = await client.beta.messages.stream(req as any).finalMessage();
  if (msg.stop_reason === "refusal") throw new ErreurEleve("L'IA a refusé cette demande. Tes crédits sont rendus.");
  if (msg.stop_reason === "max_tokens") throw new ErreurEleve("Le cours est trop long pour une seule analyse. Coupe-le en deux cours. Tes crédits sont rendus.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  return { text, tIn: (msg.usage.input_tokens || 0) + (msg.usage.cache_read_input_tokens || 0), tOut: msg.usage.output_tokens || 0, modele: msg.model };
}
