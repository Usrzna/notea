// Notéa : emplacement pour Stripe. PAS ACTIVÉ, PAS DÉPLOYÉ.
//
// Pour l'activer plus tard :
// 1. Dans la table « paliers », mettre prix_eur et stripe_price_id pour essentiel, plus, max.
// 2. Mettre les secrets STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET dans Supabase (Simon, lui-même).
// 3. Écrire ici : vérifier la signature (stripe.webhooks.constructEventAsync), puis
//    - checkout.session.completed / customer.subscription.updated :
//        update profils set palier = <palier du price>, stripe_customer_id = ..., abonnement_jusquau = current_period_end,
//        credits = <crédits du palier>, recharge_le = now() + 7 jours
//    - customer.subscription.deleted : abonnement_jusquau = maintenant (retour au gratuit à la prochaine recharge).
// 4. Déployer avec verify_jwt = false (Stripe n'envoie pas de jeton Supabase).
import { rep } from "../_shared/commun.ts";

Deno.serve(() => rep(501, { erreur: "Les paiements ne sont pas encore ouverts." }));
