// Notéa : « Supprimer mon compte » (RGPD). Efface le compte, le profil et le journal des appels.
import { admin, cors, eleve, rep } from "../_shared/commun.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return rep(405, { erreur: "Méthode refusée." });
  const sb = admin();
  const u = await eleve(req, sb);
  if (!u) return rep(401, { erreur: "Connecte-toi d'abord." });
  const { error } = await sb.auth.admin.deleteUser(u.id);   // profils et appels partent avec (on delete cascade)
  if (error) { console.error("supprimer", error); return rep(500, { erreur: "La suppression n'a pas marché. Réessaie." }); }
  return rep(200, { ok: true });
});
