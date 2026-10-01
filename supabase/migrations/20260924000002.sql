-- Cria automaticamente uma linha em "profiles" sempre que alguém se cadastra,
-- usando o nome informado no cadastro (guardado em auth.users.raw_user_meta_data).
-- Sem isso, a conta só ganhava um perfil quando a pessoa visitava /account e
-- salvava algo manualmente, e até lá aparecia como "Usuário sem nome" no fórum.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Preenche também quem já se cadastrou antes deste gatilho existir
-- e ainda não tem linha em profiles.
INSERT INTO public.profiles (id, full_name)
SELECT u.id, NULLIF(TRIM(u.raw_user_meta_data ->> 'name'), '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;