-- Endurece as permissões (RLS) que ainda deixavam usuários comuns escreverem
-- dados de outras pessoas ou dados compartilhados.
--
-- 1) Admin: "auth.users.role" é sempre 'authenticated' no Supabase, então o
--    check_is_admin() antigo nunca retornava true. Agora quem é admin fica na
--    tabela public.admins, que nenhum usuário consegue escrever pelo app.
--    Para promover alguém, rode no SQL Editor:
--      INSERT INTO public.admins (user_id) VALUES ('<uuid do usuário>');
-- 2) forum_posts / forum_comments: INSERT só checava "estar logado", então dava
--    para publicar com o user_id de outra pessoa.
-- 3) forum_attachments: dava para anexar arquivo no post/comentário de outra
--    pessoa; e no storage havia uma política que aceitava upload em qualquer pasta.
-- 4) quiz_questions: qualquer usuário logado podia inserir, alterar e apagar questões.
-- 5) project_submissions: o aluno podia inserir o próprio projeto já com
--    status 'approved'; e o admin não tinha permissão de ler projetos de outros.
--
-- As políticas antigas dessas tabelas foram criadas com nomes diferentes em
-- várias migrações. Para não depender de nomes, removemos TODAS as políticas
-- de cada tabela e recriamos o conjunto correto.

-- 1) Admins ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see if they are admin" ON public.admins;
CREATE POLICY "Users can see if they are admin"
ON public.admins FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
-- Sem políticas de INSERT/UPDATE/DELETE: só o SQL Editor (ou service_role) altera.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid());
$$;

-- Mantém o nome antigo funcionando para políticas que já o usam.
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin();
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Remove todas as políticas das tabelas que serão redefinidas -------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('forum_posts', 'forum_comments', 'forum_attachments', 'quiz_questions', 'project_submissions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 2) Fórum: posts e comentários -------------------------------------------
CREATE POLICY "Anyone can view forum posts"
ON public.forum_posts FOR SELECT
USING (true);

CREATE POLICY "Users can create their own forum posts"
ON public.forum_posts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own forum posts"
ON public.forum_posts FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users or admins can delete forum posts"
ON public.forum_posts FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Anyone can view forum comments"
ON public.forum_comments FOR SELECT
USING (true);

CREATE POLICY "Users can create their own forum comments"
ON public.forum_comments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own forum comments"
ON public.forum_comments FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users or admins can delete forum comments"
ON public.forum_comments FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

-- 3) Fórum: anexos --------------------------------------------------------
CREATE POLICY "Anyone can view forum attachments"
ON public.forum_attachments FOR SELECT
USING (true);

CREATE POLICY "Users can attach files to their own posts and comments"
ON public.forum_attachments FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    (post_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.forum_posts p WHERE p.id = post_id AND p.user_id = auth.uid()
    ))
    OR
    (comment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.forum_comments c WHERE c.id = comment_id AND c.user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can update their own forum attachments"
ON public.forum_attachments FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users or admins can delete forum attachments"
ON public.forum_attachments FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

-- Storage: a política de 20240903 aceitava upload em qualquer pasta do bucket.
-- A de 20240902 ("Allow authenticated users to upload forum attachments") já
-- exige a pasta do próprio usuário e continua valendo.
DROP POLICY IF EXISTS "Users can upload forum attachments" ON storage.objects;

-- 4) Banco de questões ----------------------------------------------------
CREATE POLICY "Anyone can view quiz questions"
ON public.quiz_questions FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert quiz questions"
ON public.quiz_questions FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update quiz questions"
ON public.quiz_questions FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can delete quiz questions"
ON public.quiz_questions FOR DELETE
TO authenticated
USING (public.is_admin());

-- 5) Entregas de projetos -------------------------------------------------
CREATE POLICY "Users can view their own submissions; admins view all"
ON public.project_submissions FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users can submit projects only as pending"
ON public.project_submissions FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND feedback IS NULL
  AND evaluated_at IS NULL
);

CREATE POLICY "Users can edit their own pending submissions"
ON public.project_submissions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND feedback IS NULL
  AND evaluated_at IS NULL
);

CREATE POLICY "Admins can review submissions"
ON public.project_submissions FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Status só pode ter os valores que o app conhece.
ALTER TABLE public.project_submissions
  DROP CONSTRAINT IF EXISTS project_submissions_status_check;
ALTER TABLE public.project_submissions
  ADD CONSTRAINT project_submissions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- 6) Resumos em PDF -------------------------------------------------------
-- A página de resumos agora gera o link assinado na hora (createSignedUrl),
-- o que exige permissão de leitura no bucket privado "summary-pdfs".
-- O conteúdo já era aberto a todos pelo link fixo; mantemos isso explícito.
DROP POLICY IF EXISTS "Anyone can read summary PDFs" ON storage.objects;
CREATE POLICY "Anyone can read summary PDFs"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'summary-pdfs');
