import { describe, it, expect, vi, beforeEach } from "vitest"

// Banco falso em memória: cada consulta encadeada (from().select().in()...) filtra estas tabelas
const tables: Record<string, Record<string, unknown>[]> = {}
const queries: string[] = []
const signedUrlCalls: string[][] = []

function makeQuery(table: string) {
  const filters: ((row: Record<string, unknown>) => boolean)[] = []
  let range: [number, number] | null = null
  let wantCount = false
  const q = {
    select: (_cols?: string, opts?: { count?: string }) => {
      wantCount = opts?.count === "exact"
      return q
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val)
      return q
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]))
      return q
    },
    order: () => q,
    range: (from: number, to: number) => {
      range = [from, to]
      return q
    },
    // Igual ao cliente real: then() devolve uma Promise com o resultado do callback
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      queries.push(table)
      const all = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      // Como o PostgREST: nunca devolve mais que 1000 linhas por resposta
      const data = (range ? all.slice(range[0], range[1] + 1) : all).slice(0, 1000)
      return Promise.resolve({ data, error: null, count: wantCount ? all.length : null }).then(resolve, reject)
    },
  }
  return q
}

vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    from: (table: string) => makeQuery(table),
    storage: {
      from: () => ({
        createSignedUrl: async (p: string) => {
          signedUrlCalls.push([p])
          return { data: { signedUrl: `https://signed/${p}` }, error: null }
        },
        createSignedUrls: async (paths: string[]) => {
          signedUrlCalls.push(paths)
          return { data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })), error: null }
        },
      }),
    },
  },
}))

import { getForumPosts } from "./forum"

function seed(postCount: number) {
  tables.forum_posts = Array.from({ length: postCount }, (_, i) => ({
    id: `p${i}`,
    user_id: i % 2 ? "ana" : "bia",
    title: `Post ${i}`,
    resolved: false,
  }))
  tables.forum_posts.push({ id: "resolvido", user_id: "ana", title: "x", resolved: true })
  tables.forum_comments = tables.forum_posts.flatMap((p) => [
    { id: `${p.id}-c1`, post_id: p.id, user_id: "caio", content: "oi" },
    { id: `${p.id}-c2`, post_id: p.id, user_id: "ana", content: "olá" },
  ])
  tables.post_likes = [
    { post_id: "p0", user_id: "ana" },
    { post_id: "p0", user_id: "caio" },
    { post_id: "p1", user_id: "caio" },
  ]
  tables.forum_attachments = [
    { id: "a1", post_id: "p0", comment_id: null, file_path: "bia/p0/f.pdf" },
    { id: "a2", post_id: null, comment_id: "p1-c1", file_path: "caio/p1/c1/g.png" },
  ]
  tables.profiles_public = [
    { id: "ana", full_name: "Ana" },
    { id: "bia", full_name: "Bia" },
    { id: "caio", full_name: "Caio" },
  ]
}

beforeEach(() => {
  queries.length = 0
  signedUrlCalls.length = 0
})

describe("getForumPosts", () => {
  it("monta autor, comentários, anexos e curtidas de cada post", async () => {
    seed(3)
    const { posts, total } = await getForumPosts(20, "ana")

    expect(total).toBe(3) // o post resolvido fica de fora
    const p0 = posts.find((p) => p.id === "p0")!
    expect(p0.user?.full_name).toBe("Bia")
    expect(p0.likes).toBe(2)
    expect(p0.user_has_liked).toBe(true)
    expect(p0.attachments?.[0].url).toBe("https://signed/bia/p0/f.pdf")
    expect(p0.comments?.map((c) => c.user?.full_name)).toEqual(["Caio", "Ana"])

    const p1 = posts.find((p) => p.id === "p1")!
    expect(p1.user_has_liked).toBe(false)
    expect(p1.comments?.[0].attachments?.[0].url).toBe("https://signed/caio/p1/c1/g.png")
  })

  it("respeita o limite e informa o total para o botão 'Carregar mais'", async () => {
    seed(45)
    const { posts, total } = await getForumPosts(20)
    expect(posts).toHaveLength(20)
    expect(total).toBe(45)
  })

  it("usa o mesmo número de consultas com 3 ou 40 posts", async () => {
    seed(3)
    await getForumPosts(50)
    const few = queries.length

    queries.length = 0
    seed(40)
    await getForumPosts(50)

    expect(queries.length).toBe(few)
    expect(few).toBeLessThanOrEqual(6)
    expect(signedUrlCalls).toHaveLength(2) // uma chamada de links por carregamento
  })

  it("não perde curtidas quando passam de 1000 linhas", async () => {
    seed(3)
    tables.post_likes = Array.from({ length: 2500 }, (_, i) => ({ post_id: "p0", user_id: `u${i}` }))
    tables.post_likes.push({ post_id: "p1", user_id: "ana" })
    const { posts } = await getForumPosts(20, "ana")
    expect(posts.find((p) => p.id === "p0")!.likes).toBe(2500)
    expect(posts.find((p) => p.id === "p1")!.user_has_liked).toBe(true)
  })

  it("divide listas grandes de ids em blocos", async () => {
    seed(250)
    const { posts } = await getForumPosts(250)
    expect(posts).toHaveLength(250)
    expect(posts.every((p) => p.comments?.length === 2)).toBe(true)
  })

  it("devolve lista vazia sem consultas extras quando não há posts", async () => {
    tables.forum_posts = []
    const { posts, total } = await getForumPosts()
    expect(posts).toEqual([])
    expect(total).toBe(0)
    expect(queries).toEqual(["forum_posts"])
  })
})
