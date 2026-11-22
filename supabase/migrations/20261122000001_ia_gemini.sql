-- Notéa v2.1 : l'IA du serveur passe à Gemini (Google, offre gratuite).
-- Tous les paliers prennent gemini-3.5-flash ; le serveur passe à un autre modèle gratuit si Google est saturé.
update public.paliers set modele = 'gemini-3.5-flash';
