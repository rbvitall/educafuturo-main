-- Corrige 3 brechas de segurança encontradas na revisão de RLS:
-- 1) profiles: qualquer pessoa com a chave anon conseguia ler a tabela inteira
--    (inclusive study_preferences e notification_preferences de todo mundo).
-- 2) notifications: qualquer usuário logado podia inserir notificação para
--    qualquer outro usuário (WITH CHECK (true)).
-- 3) storage "avatars": qualquer usuário logado podia enviar arquivo para a
--    pasta de qualquer outro usuário, por causa de um "OR auth.uid() IS NOT NULL".

-- 1) profiles -----------------------------------------------------------
DROP POLICY IF EXISTS "Perfis públicos são visíveis para todos" ON profiles;

-- View somente com os campos que o app realmente usa para mostrar outros
-- usuários (posts do fórum, comentários, avatar). Sem username, website,
-- study_preferences nem notification_preferences.
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT id, full_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- 2) notifications --------------------------------------------------------
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

CREATE POLICY "Users can insert their own notifications"
    ON public.notifications
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 3) storage: bucket "avatars" ------------------------------------------
DROP POLICY IF EXISTS "Usuários autenticados podem fazer upload de seus próprios avatares" ON storage.objects;

CREATE POLICY "Usuários autenticados podem fazer upload de seus próprios avatares"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' AND
  auth.uid() = owner
);