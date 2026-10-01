// Testa as políticas de RLS da migração 20261001000000_harden_rls.sql num
// Postgres em memória (PGlite), com stubs mínimos de auth/storage do Supabase.
// Não substitui um teste no projeto real, mas garante que a migração roda
// (duas vezes, para checar idempotência) e que as regras fazem o que prometem.
import { describe, it, expect, beforeAll } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import fs from "fs"
import path from "path"

// RLS_MIGRATION permite rodar os mesmos testes contra outro arquivo (ex.: vazio, para ver o estado antigo falhar)
const MIGRATION =
  process.env.RLS_MIGRATION ?? path.join(__dirname, "..", "migrations", "20261001000000_harden_rls.sql")

const A = "00000000-0000-0000-0000-00000000000a"
const B = "00000000-0000-0000-0000-00000000000b"
const ADM = "00000000-0000-0000-0000-0000000000ad"

let db: PGlite
let postA: string

// Estado "antigo": tabelas e políticas permissivas como nas migrações originais
const SETUP = `
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users (id uuid primary key, role text default 'authenticated');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role', true) $$;
CREATE TABLE storage.buckets (id text primary key, name text, public bool);
CREATE TABLE storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can upload forum attachments" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'forum_attachments' AND auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to upload forum attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'forum_attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

INSERT INTO auth.users (id) VALUES ('${A}'), ('${B}'), ('${ADM}');

CREATE TABLE forum_posts (id uuid default gen_random_uuid() primary key, user_id uuid references auth.users(id), title text, content text, resolved bool default false, likes int default 0);
CREATE TABLE forum_comments (id uuid default gen_random_uuid() primary key, post_id uuid references forum_posts(id) on delete cascade, user_id uuid references auth.users(id), content text);
CREATE TABLE forum_attachments (id uuid default gen_random_uuid() primary key, post_id uuid references forum_posts(id) on delete cascade,
  comment_id uuid references forum_comments(id) on delete cascade, user_id uuid not null, file_name text, file_path text, file_type text, file_size int);
CREATE TABLE quiz_questions (id serial primary key, question text);
CREATE TABLE project_submissions (id uuid default gen_random_uuid() primary key, user_id uuid, project_id text not null, file_url text not null,
  status text not null default 'pending', feedback text, submitted_at timestamptz default now(), evaluated_at timestamptz, created_at timestamptz default now());

ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY; ALTER TABLE forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_attachments ENABLE ROW LEVEL SECURITY; ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can create forum posts" ON forum_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to create forum posts" ON forum_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Anyone can view forum posts" ON forum_posts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create forum comments" ON forum_comments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Permitir inserção para usuários autenticados" ON quiz_questions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Permitir exclusão para usuários autenticados" ON quiz_questions FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert their own submissions" ON project_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own submissions" ON project_submissions FOR SELECT USING (auth.uid() = user_id);

GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, storage TO anon, authenticated;
INSERT INTO quiz_questions (question) VALUES ('Q1');
`

// Roda a consulta como um usuário (ou anônimo, com uid null) sob RLS
async function as(uid: string | null, sql: string) {
  await db.exec(
    `RESET ROLE; SELECT set_config('test.uid', '${uid ?? ""}', false), set_config('test.role', '${uid ? "authenticated" : "anon"}', false); SET ROLE ${uid ? "authenticated" : "anon"};`,
  )
  try {
    return await db.query<Record<string, unknown>>(sql)
  } finally {
    await db.exec("RESET ROLE")
  }
}

// Linhas afetadas (INSERT/UPDATE/DELETE) ou retornadas (SELECT); -1 quando a RLS barra com erro
async function count(uid: string | null, sql: string) {
  try {
    const r = await as(uid, sql)
    return r.affectedRows || r.rows.length
  } catch {
    return -1
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SETUP)
  const migration = fs.readFileSync(MIGRATION, "utf8")
  await db.exec(migration)
  await db.exec(migration)
  await db.exec(`GRANT ALL ON public.admins TO anon, authenticated; INSERT INTO public.admins (user_id) VALUES ('${ADM}');`)
  const r = await as(A, `INSERT INTO forum_posts (user_id, title) VALUES ('${A}', 'post A') RETURNING id`)
  postA = r.rows[0].id as string
}, 60_000)

describe("fórum", () => {
  it("não deixa publicar post em nome de outra pessoa", async () => {
    expect(await count(A, `INSERT INTO forum_posts (user_id, title) VALUES ('${B}', 'falso')`)).toBe(-1)
  })

  it("não deixa comentar em nome de outra pessoa, mas aceita o próprio", async () => {
    expect(await count(B, `INSERT INTO forum_comments (post_id, user_id, content) VALUES ('${postA}', '${A}', 'x')`)).toBe(-1)
    expect(await count(B, `INSERT INTO forum_comments (post_id, user_id, content) VALUES ('${postA}', '${B}', 'oi')`)).toBe(1)
  })

  it("anônimo lê, mas não publica", async () => {
    expect(await count(null, `SELECT * FROM forum_posts`)).toBeGreaterThan(0)
    expect(await count(null, `INSERT INTO forum_posts (user_id, title) VALUES ('${A}', 'anon')`)).toBe(-1)
  })

  it("só o autor edita o post, e não pode transferir a autoria", async () => {
    expect(await count(B, `UPDATE forum_posts SET title = 'hack' WHERE id = '${postA}'`)).toBe(0)
    expect(await count(A, `UPDATE forum_posts SET title = 'novo' WHERE id = '${postA}'`)).toBe(1)
    expect(await count(A, `UPDATE forum_posts SET user_id = '${B}' WHERE id = '${postA}'`)).toBe(-1)
  })

  it("só anexa arquivo no próprio post", async () => {
    const insert = (uid: string) =>
      `INSERT INTO forum_attachments (post_id, user_id, file_name, file_path, file_type, file_size) VALUES ('${postA}', '${uid}', 'f', '${uid}/x', 'pdf', 1)`
    expect(await count(A, insert(A))).toBe(1)
    expect(await count(B, insert(B))).toBe(-1)
  })

  it("storage: upload só na pasta do próprio usuário", async () => {
    expect(await count(A, `INSERT INTO storage.objects (bucket_id, name) VALUES ('forum_attachments', '${A}/p/f.pdf')`)).toBe(1)
    expect(await count(A, `INSERT INTO storage.objects (bucket_id, name) VALUES ('forum_attachments', '${B}/p/f.pdf')`)).toBe(-1)
  })
})

describe("banco de questões", () => {
  it("usuário comum não insere nem apaga questões", async () => {
    expect(await count(A, `INSERT INTO quiz_questions (question) VALUES ('hack')`)).toBe(-1)
    expect(await count(A, `DELETE FROM quiz_questions`)).toBe(0)
    expect(await count(null, `SELECT * FROM quiz_questions`)).toBe(1)
  })

  it("admin insere questões", async () => {
    expect(await count(ADM, `INSERT INTO quiz_questions (question) VALUES ('Q2')`)).toBe(1)
  })
})

describe("entregas de projetos", () => {
  it("aluno só envia projeto como pendente e sem feedback", async () => {
    expect(await count(A, `INSERT INTO project_submissions (user_id, project_id, file_url) VALUES ('${A}', 'p1', 'u')`)).toBe(1)
    expect(
      await count(A, `INSERT INTO project_submissions (user_id, project_id, file_url, status) VALUES ('${A}', 'p2', 'u', 'approved')`),
    ).toBe(-1)
    expect(
      await count(A, `INSERT INTO project_submissions (user_id, project_id, file_url, feedback) VALUES ('${A}', 'p3', 'u', 'nota 10')`),
    ).toBe(-1)
  })

  it("aluno não se autoaprova", async () => {
    expect(await count(A, `UPDATE project_submissions SET status = 'approved' WHERE user_id = '${A}'`)).toBe(-1)
  })

  it("outro aluno não vê a entrega; o admin vê e avalia", async () => {
    expect(await count(B, `SELECT * FROM project_submissions WHERE user_id = '${A}'`)).toBe(0)
    expect(await count(ADM, `SELECT * FROM project_submissions WHERE user_id = '${A}'`)).toBe(1)
    expect(
      await count(ADM, `UPDATE project_submissions SET status = 'approved', feedback = 'ok', evaluated_at = now() WHERE user_id = '${A}'`),
    ).toBe(1)
  })

  it("status fora da lista é recusado", async () => {
    expect(await count(ADM, `UPDATE project_submissions SET status = 'xyz' WHERE user_id = '${A}'`)).toBe(-1)
  })
})

describe("admins", () => {
  it("usuário não se promove a admin", async () => {
    expect(await count(A, `INSERT INTO public.admins (user_id) VALUES ('${A}')`)).toBe(-1)
    const r = await as(A, `SELECT public.is_admin() AS v`)
    expect(r.rows[0].v).toBe(false)
  })

  it("admin pode moderar o fórum", async () => {
    expect(await count(ADM, `DELETE FROM forum_posts WHERE id = '${postA}'`)).toBe(1)
  })
})
