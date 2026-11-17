-- Notéa v1.8 : comptes élèves et crédits d'IA.
-- Aucune clé ici. La clé Anthropic est un secret de l'Edge Function (ANTHROPIC_API_KEY).
-- Les cours ne sont jamais stockés : la table « appels » garde seulement la date, la fonction, les crédits et les jetons.

-- ---------- Les paliers (offres) ----------
create table public.paliers (
  id text primary key,
  nom text not null,
  credits int not null check (credits >= 0),           -- crédits donnés à chaque recharge
  periode text not null check (periode in ('semaine', 'mois')),
  modele text not null,                                -- modèle Claude utilisé pour ce palier
  prix_eur numeric(6,2),                               -- pour Stripe, plus tard
  stripe_price_id text,                                -- pour Stripe, plus tard (vide = pas en vente)
  ordre int not null default 0
);
insert into public.paliers (id, nom, credits, periode, modele, prix_eur, ordre) values
  ('gratuit',   'Gratuit',   25,  'mois',    'claude-haiku-5-5',  0,    0),
  ('essentiel', 'Essentiel', 40,  'semaine', 'claude-sonnet-5-5', null, 1),
  ('plus',      'Plus',      100, 'semaine', 'claude-sonnet-5-5', null, 2),
  ('max',       'Max',       250, 'semaine', 'claude-opus-5-5',   null, 3);

-- ---------- Le profil de chaque élève ----------
create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  credits int not null default 0 check (credits >= 0),
  palier text not null default 'gratuit' references public.paliers (id),
  recharge_le timestamptz not null default now(),      -- prochaine recharge
  consentement_le timestamptz,                         -- accord pour envoyer les cours à l'IA (null = pas d'accord)
  stripe_customer_id text,                             -- Stripe, plus tard
  abonnement_jusquau timestamptz,                      -- Stripe, plus tard
  cree_le timestamptz not null default now()
);

-- ---------- Le journal des appels (sans le contenu des cours) ----------
create table public.appels (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  fonction text not null,
  modele text,
  credits int not null,
  tokens_entree int,
  tokens_sortie int,
  ok boolean,                                          -- null = en cours
  le timestamptz not null default now()
);
create index appels_user_le on public.appels (user_id, le desc);

-- ---------- RLS : chaque élève ne lit que sa ligne ; personne n'écrit directement ----------
alter table public.paliers enable row level security;
alter table public.profils enable row level security;
alter table public.appels  enable row level security;

create policy "paliers lisibles par tous" on public.paliers for select to anon, authenticated using (true);
create policy "je lis mon profil"         on public.profils for select to authenticated using ((select auth.uid()) = id);
create policy "je lis mes appels"         on public.appels  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------- Intervalle d'un palier ----------
create or replace function public.periode_intervalle(p text) returns interval
language sql immutable set search_path = '' as $$
  select case p when 'semaine' then interval '7 days' else interval '1 month' end
$$;

-- ---------- Un profil est créé pour chaque nouveau compte ----------
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.paliers;
begin
  select * into p from public.paliers where id = 'gratuit';
  insert into public.profils (id, credits, palier, recharge_le)
  values (new.id, p.credits, 'gratuit', now() + public.periode_intervalle(p.periode));
  return new;
end $$;
create trigger nouveau_compte after insert on auth.users
  for each row execute function public.creer_profil();

-- ---------- Recharge : quand la date est passée, les crédits reviennent au niveau du palier ----------
create or replace function public.recharger(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pr public.profils; p public.paliers;
begin
  select * into pr from public.profils where id = uid for update;
  if not found or pr.recharge_le > now() then return; end if;
  -- Abonnement payant terminé : retour au gratuit (Stripe, plus tard).
  if pr.palier <> 'gratuit' and pr.abonnement_jusquau is not null and pr.abonnement_jusquau < now() then
    pr.palier := 'gratuit';
  end if;
  select * into p from public.paliers where id = pr.palier;
  update public.profils set palier = pr.palier, credits = p.credits,
    recharge_le = now() + public.periode_intervalle(p.periode) where id = uid;
end $$;

-- ---------- Ce que l'appli lit : mon profil (après recharge) ----------
create or replace function public.mon_profil() returns json
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r json;
begin
  if uid is null then raise exception 'non connecté'; end if;
  perform public.recharger(uid);
  select json_build_object('credits', pr.credits, 'palier', pr.palier, 'palier_nom', p.nom, 'credits_palier', p.credits,
    'periode', p.periode, 'modele', p.modele, 'recharge_le', pr.recharge_le, 'consentement_le', pr.consentement_le, 'cree_le', pr.cree_le)
  into r from public.profils pr join public.paliers p on p.id = pr.palier where pr.id = uid;
  return r;
end $$;

-- ---------- Donner ou retirer son accord ----------
create or replace function public.donner_consentement(oui boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  update public.profils set consentement_le = case when oui then now() else null end where id = auth.uid();
end $$;

-- ---------- Débiter (appelé seulement par l'Edge Function, avec la clé service) ----------
create or replace function public.debiter(uid uuid, n int, fn text, max_minute int) returns json
language plpgsql security definer set search_path = '' as $$
declare pr public.profils; p public.paliers; nb int; aid bigint;
begin
  perform public.recharger(uid);
  select * into pr from public.profils where id = uid for update;
  if not found then return json_build_object('statut', 'pas_de_profil'); end if;
  if pr.consentement_le is null then return json_build_object('statut', 'pas_d_accord'); end if;
  select count(*) into nb from public.appels where user_id = uid and le > now() - interval '1 minute';
  if nb >= max_minute then return json_build_object('statut', 'trop_vite'); end if;
  if pr.credits < n then return json_build_object('statut', 'plus_de_credits', 'credits', pr.credits, 'recharge_le', pr.recharge_le); end if;
  select * into p from public.paliers where id = pr.palier;
  update public.profils set credits = credits - n where id = uid;
  insert into public.appels (user_id, fonction, modele, credits) values (uid, fn, p.modele, n) returning id into aid;
  return json_build_object('statut', 'ok', 'appel', aid, 'modele', p.modele, 'credits', pr.credits - n);
end $$;

-- ---------- Terminer un appel : en cas d'échec, les crédits sont rendus ----------
create or replace function public.terminer_appel(aid bigint, reussi boolean, t_in int, t_out int, mod text) returns int
language plpgsql security definer set search_path = '' as $$
declare a public.appels; c int;
begin
  update public.appels set ok = reussi, tokens_entree = t_in, tokens_sortie = t_out, modele = coalesce(mod, modele)
    where id = aid and ok is null returning * into a;
  if not found then return null; end if;
  if not reussi then
    update public.profils set credits = credits + a.credits where id = a.user_id returning credits into c;
    update public.appels set credits = 0 where id = aid;
  else
    select credits into c from public.profils where id = a.user_id;
  end if;
  return c;
end $$;

-- ---------- Droits : l'appli ne peut appeler que mon_profil et donner_consentement ----------
revoke all on function public.periode_intervalle(text), public.creer_profil(), public.recharger(uuid),
  public.debiter(uuid, int, text, int), public.terminer_appel(bigint, boolean, int, int, text),
  public.mon_profil(), public.donner_consentement(boolean) from public, anon, authenticated;
grant execute on function public.mon_profil(), public.donner_consentement(boolean) to authenticated;
grant execute on function public.debiter(uuid, int, text, int), public.terminer_appel(bigint, boolean, int, int, text) to service_role;
grant execute on function public.periode_intervalle(text) to authenticated, service_role;
