-- Corrige a view profiles_public criada na migração anterior
-- (20260924000000_fix_rls_security.sql).
--
-- Erro: ela tinha "security_invoker = true", o que faz a view herdar a
-- política de RLS de "profiles" (só ver o próprio perfil). Resultado: cada
-- usuário só conseguia ver o PRÓPRIO nome/avatar através da view, e o perfil
-- de qualquer outra pessoa aparecia como "não encontrado" no fórum.
--
-- Correção: recriar a view SEM security_invoker (usa o padrão, que executa
-- com o dono da view e por isso ignora a RLS de "profiles"). A view continua
-- limitada a id, full_name e avatar_url, então nenhum dado sensível volta
-- a ficar exposto.

DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public AS
SELECT id, full_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;