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
const SECOURS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.8-flash", "gemini-flash-lite-latest"];   // chaque modèle a son propre quota gratuit
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

type Demande = {
  model: string; system: string; messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number; schema?: Record<string, unknown>;
  reflexion?: "low" | "medium" | "high";   // profondeur de réflexion de Gemini
  secours?: string[];                       // modèles de secours (l'analyse refuse les modèles « lite », trop faibles)
  parModele?: number;                       // temps max pour un modèle avant de passer au suivant
  forcer?: "groq";                          // pour les tests : passer directement par Groq
  prefere?: "groq";                         // tâches courtes (corriger, prof) : Groq d'abord (2 s), Gemini en secours
};
const trop = () => new ErreurEleve("L'IA a mis trop de temps. Réessaie dans un moment, ou avec un cours plus court. Tes crédits sont rendus.");

/** Un appel à l'IA : Gemini d'abord ; si Google est saturé, lent ou à court de quota, Groq prend le relais (v2.4).
 *  Renvoie le texte et la taille (en jetons). */
export async function appelIA(cle: string, p: Demande) {
  const groq = Deno.env.get("GROQ_API_KEY"), fin = Date.now() + 135_000;   // une Edge Function gratuite est coupée à 150 s
  if (p.forcer === "groq" && groq) return await appelGroq(groq, p, fin);
  const relais = (e: unknown) => !(e instanceof ErreurEleve) || /très demandée|trop de temps/.test(e.message);   // panne ou saturation : l'autre IA essaie
  if (p.prefere === "groq" && groq) {
    try { return await appelGroq(groq, p, fin - 50_000); }
    catch (e) { if (!relais(e)) throw e; console.warn("groq en échec, Gemini prend le relais :", (e as Error).message); return await appelGemini(cle, p, fin); }
  }
  try {
    // S'il y a Groq, on garde 45 s pour lui au cas où Gemini ne répond pas.
    return await appelGemini(cle, p, groq ? fin - 45_000 : fin);
  } catch (e) {
    if (!groq || (e instanceof ErreurEleve && !/très demandée|trop de temps/.test(e.message))) throw e;   // refus, cours trop long… : Groq ne ferait pas mieux
    console.warn("gemini en échec, Groq prend le relais :", (e as Error).message);
    return await appelGroq(groq, p, fin);
  }
}

/* ---------- Groq (secours, offre gratuite) : API compatible OpenAI ---------- */
const GROQ_PREF = ["openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct", "llama-3.3-70b-versatile", "qwen/qwen3-32b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];
let groqModeles: string[] | null = null;
async function modelesGroq(cle: string) {
  if (groqModeles) return groqModeles;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: "Bearer " + cle }, signal: AbortSignal.timeout(8000) });
    // deno-lint-ignore no-explicit-any
    const ids: string[] = ((await r.json()).data || []).map((m: any) => m.id);
    groqModeles = GROQ_PREF.filter((m) => ids.includes(m));
    if (!groqModeles.length) groqModeles = ids.filter((id) => /gpt-oss|llama|qwen|kimi/i.test(id) && !/guard|whisper|tts|vision|prompt/i.test(id)).slice(0, 3);
  } catch { groqModeles = GROQ_PREF.slice(0, 3); }
  return groqModeles;
}
async function appelGroq(cle: string, p: Demande, fin: number) {
  const system = p.system + (p.schema ? "\n\nRéponds uniquement avec un objet JSON valide, qui suit exactement ce schéma JSON (tous les champs) :\n" + JSON.stringify(p.schema) : "");
  const messages = [{ role: "system", content: system }, ...p.messages];
  let derniere = "", sature = false;
  for (const model of await modelesGroq(cle)) {
    for (const forme of p.schema ? ["schema", "objet"] : ["texte"]) {
      const reste = fin - Date.now();
      if (reste < 5_000) throw trop();
      const body: Record<string, unknown> = { model, messages, max_completion_tokens: Math.min(p.maxTokens, 32_000), temperature: 0.3 };
      if (forme === "schema") body.response_format = { type: "json_schema", json_schema: { name: "reponse", schema: p.schema, strict: false } };
      if (forme === "objet") body.response_format = { type: "json_object" };
      let r: Response;
      try {
        r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + cle }, body: JSON.stringify(body), signal: AbortSignal.timeout(reste),
        });
      } catch (e) {
        if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) throw trop();
        throw e;
      }
      // deno-lint-ignore no-explicit-any
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) {
        derniere = `groq ${model} ${r.status} ${j?.error?.message || ""}`;
        console.warn(derniere);
        if (r.status === 400 && forme === "schema") continue;                        // ce modèle ne connaît pas json_schema : JSON simple
        if (r.status === 429 || r.status === 413 || r.status === 503) sature = true;
        if (r.status === 400 || r.status === 404 || r.status === 413 || r.status === 429 || r.status >= 500) break;   // modèle suivant
        throw new Error(derniere);
      }
      const c = j.choices?.[0];
      if (!c || !c.message) throw new ErreurEleve("L'IA a refusé cette demande. Tes crédits sont rendus.");
      if (c.finish_reason === "length") throw new ErreurEleve("Le cours est trop long pour une seule analyse. Coupe-le en deux cours. Tes crédits sont rendus.");
      const u = j.usage || {};
      return { text: String(c.message.content || ""), tIn: u.prompt_tokens || 0, tOut: u.completion_tokens || 0, modele: "groq:" + model };
    }
  }
  if (sature) throw new ErreurEleve("L'IA gratuite de Notéa est très demandée en ce moment. Réessaie dans quelques minutes. Tes crédits sont rendus.");
  throw new Error(derniere || "aucun modèle Groq");
}

/** Un appel à Gemini. */
async function appelGemini(cle: string, p: Demande, fin: number) {
  const modeles = [p.model, ...(p.secours || SECOURS).filter((m) => m !== p.model)];
  const reflexion = { thinkingConfig: { thinkingLevel: p.reflexion || "low" } }, parModele = p.parModele || PAR_MODELE;
  const contents = p.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  // Les formes essayées, de la meilleure à la plus simple : si Google refuse un réglage (erreur 400), on essaie le suivant.
  const formes: Record<string, unknown>[] = p.schema
    ? [{ responseMimeType: "application/json", responseJsonSchema: p.schema, ...reflexion },
       { responseMimeType: "application/json", responseJsonSchema: p.schema },
       { responseMimeType: "application/json", responseSchema: versSchemaGemini(p.schema) }]
    : [{ ...reflexion }, {}];
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
          signal: AbortSignal.timeout(Math.min(reste, parModele)),
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
