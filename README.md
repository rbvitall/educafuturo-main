# EducaFuturo

Plataforma web de estudos gamificada, com foco em eletrônica e engenharia elétrica e ferramentas de apoio à preparação para ENEM e PAS. Um produto **SolveHub**.

> Projeto em desenvolvimento. Algumas funcionalidades ainda estão em construção.

## Funcionalidades

- **Conta e login** com cadastro, login e redefinição de senha (Supabase Auth)
- **Matérias e conteúdos** organizados por ano, com busca, favoritos, tutoriais, vídeos, resumos e mapas mentais
- **Flashcards** com modos de estudo e acompanhamento de progresso
- **Quizzes e simulados** (Simula Pro)
- **Jogos e simuladores:** portas lógicas, montagem de circuitos, jogo da memória e associação de componentes
- **Banco de componentes eletrônicos** com imagens e detalhes
- **Planejamento:** agenda, cronograma, Pomodoro, desafios diários e sequência de estudos (streak)
- **Painel de desempenho** com métricas, revisão de erros e relatório exportável em PDF
- **Correção de redação com IA**, seguindo as 5 competências do ENEM
- **Calculadoras:** notas do ENEM (com pesos por universidade), PAS e escolar, conversor de unidades e fórmulas
- **Fórum** de dúvidas com curtidas, comentários e anexos

## Tecnologias

| Área | Ferramentas |
| --- | --- |
| Framework      | [Next.js 15](https://nextjs.org/) (App Router) e React 19   |
| Linguagem      | TypeScript                                                  |
| Interface      | Tailwind CSS, shadcn/ui (Radix UI), Framer Motion, Lucide   |
| Backend        | [Supabase](https://supabase.com/) (Auth, Postgres, Storage) |
| IA             | API da OpenAI (`gpt-4o-mini`) na correção de redações       |
| Gráficos e PDF | Recharts, jsPDF                                             |

## Como rodar localmente

### Pré-requisitos

- [Node.js](https://nodejs.org/) 20 ou superior
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- Um projeto no [Supabase](https://supabase.com/) (o plano gratuito serve)

### Passo a passo

```bash
# 1. Instale as dependências
pnpm install

# 2. Crie o arquivo .env.local na raiz (veja a seção abaixo)

# 3. Inicie o servidor de desenvolvimento
pnpm dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

### Variáveis de ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_publica
OPENAI_API_KEY=sua_chave_da_openai
```

| Variável | Obrigatória | Para que serve |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`              | Sim                        | URL do projeto Supabase                                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`         | Sim                        | Chave pública (anon) do Supabase                                                         |
| `OPENAI_API_KEY`                        | Para a correção de redação | Chave da OpenAI, usada só no servidor. A conta precisa ter saldo                         |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Não                        | Redirecionamento dos e-mails de confirmação e de redefinição de senha em desenvolvimento |
| `SUPABASE_SERVICE_ROLE_KEY`             | Só para scripts            | Usada apenas em `scripts/upload-pdfs.ts`. Nunca exponha no front-end                     |

> **Nunca** coloque chaves diretamente no código nem envie o `.env.local` para o Git. O `.gitignore` já ignora arquivos `.env*`.

### Banco de dados

As migrações SQL ficam em `supabase/migrations/`. Para montar o banco em um projeto novo, execute os arquivos em ordem cronológica (pelo SQL Editor do Supabase ou pela [CLI do Supabase](https://supabase.com/docs/guides/cli)). A tabela usada na correção de redações está em `scripts/create-essay-evaluations-table.sql`.

A migração `20261001000000_harden_rls.sql` corrige as permissões do fórum, do banco de questões e das entregas de projetos. Rode-a também em bancos que já existem.

#### Administradores

Quem é admin fica na tabela `public.admins`, que o app não consegue alterar. Para promover alguém, rode no SQL Editor do Supabase:

```sql
INSERT INTO public.admins (user_id) VALUES ('<uuid do usuário>');
```

O admin acessa `/admin/projects` para avaliar as entregas de projetos e também pode apagar posts e comentários do fórum.

#### Resumos em PDF

Os resumos ficam no bucket privado `summary-pdfs` (arquivos `1.pdf`, `2.pdf`, `3.pdf`). A página gera um link temporário a cada clique.

Projetos gratuitos do Supabase são pausados após alguns dias sem atividade. Se o app parar de responder, confira o painel e clique em **Resume project**.

## Scripts

| Comando | O que faz |
| --- | --- |
| `pnpm dev`   | Servidor de desenvolvimento    |
| `pnpm build` | Build de produção              |
| `pnpm start` | Roda o build de produção       |
| `pnpm lint`  | Verifica o código com o linter |
| `pnpm test`  | Roda os testes (Vitest)        |
| `pnpm typecheck` | Verifica os tipos do TypeScript |

### Testes

- `app/api/correct-essay/route.test.ts`: login obrigatório, limite de uso, validação da redação e formato da resposta da correção.
- `supabase/tests/harden-rls.test.ts`: aplica a migração de segurança num Postgres em memória (PGlite) e confere, com dois alunos e um admin, quem pode ler e escrever o quê.

## Estrutura do projeto

```
app/          Páginas e rotas (App Router) e a API de correção de redação
components/   Componentes de interface, jogos e ferramentas
ui/           Componentes base (shadcn/ui)
data/         Conteúdo estático: flashcards, quizzes, matérias, cursos
hooks/        Hooks React (autenticação, localStorage, estudo)
lib/          Clientes do Supabase e funções de apoio
public/       Imagens, ícones e PDFs
scripts/      Scripts utilitários
supabase/     Migrações do banco de dados
types/        Tipos TypeScript
utils/        Utilitários (exportação de PDF)
```

## Deploy

O projeto está pronto para hospedagem na [Vercel](https://vercel.com/):

1. Suba o código para um repositório no GitHub (de preferência privado).
2. Na Vercel, importe o repositório (**Add New → Project**).
3. Cadastre as variáveis de ambiente acima em **Settings → Environment Variables**.
4. Clique em **Deploy**.

O plano gratuito da Vercel (Hobby) é limitado a uso não comercial.

## Próximos passos

- Trocar o limite de uso da correção de redação, que hoje fica em memória, por um armazenamento compartilhado (ex.: Upstash Redis) se o tráfego crescer
- Consolidar as migrações num schema base para instalações novas
- Dividir as páginas maiores (`performance`, `enem-calculator`, `account`, `rec`)

## Sobre

Desenvolvido como parte do SolveHub.