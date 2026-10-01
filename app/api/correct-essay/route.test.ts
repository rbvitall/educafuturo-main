import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

// O Supabase é simulado: o token "valid-token-<id>" vira o usuário <id>
const getUser = vi.fn()
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } }),
}))

const VALID_EVALUATION = {
  nota_total: 800,
  competencias: {
    "1": { nota: 160, justificativa: "Boa norma culta" },
    "2": { nota: 160, justificativa: "Compreendeu a proposta" },
    "3": { nota: 160, justificativa: "Argumentos organizados" },
    "4": { nota: 160, justificativa: "Boa coesão" },
    "5": { nota: 160, justificativa: "Proposta presente" },
  },
  pontos_positivos: "Texto estruturado",
  pontos_a_melhorar: "Aprofundar argumentos",
  sugestao_de_reescrita: "Reescreva a conclusão",
}

const ESSAY = Array.from({ length: 60 }, (_, i) => `palavra${i}`).join(" ")

function openAiReply(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })
}

function makeRequest(body: unknown, token?: string) {
  return new NextRequest("http://localhost/api/correct-essay", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

let fetchMock: ReturnType<typeof vi.fn>

async function loadRoute() {
  // A rota lê variáveis de ambiente e guarda o limite de uso em memória no
  // carregamento do módulo; cada teste usa um módulo novo.
  vi.resetModules()
  return import("./route")
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
  getUser.mockReset()
  getUser.mockImplementation(async (token: string) =>
    token.startsWith("valid-token-")
      ? { data: { user: { id: token.replace("valid-token-", "") } }, error: null }
      : { data: { user: null }, error: new Error("invalid JWT") },
  )
  fetchMock = vi.fn(async () => openAiReply(JSON.stringify(VALID_EVALUATION)))
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("POST /api/correct-essay — autenticação e custo", () => {
  it("recusa com 401 quando não há token e não chama a OpenAI", async () => {
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ textoRedacao: ESSAY }))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("recusa com 401 quando o token é inválido", async () => {
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ textoRedacao: ESSAY }, "token-falso"))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("responde 503 quando a chave da OpenAI não está configurada", async () => {
    vi.stubEnv("OPENAI_API_KEY", "")
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ textoRedacao: ESSAY }, "valid-token-u1"))
    expect(res.status).toBe(503)
  })

  it("limita a 5 correções por hora por usuário (429 na 6ª)", async () => {
    const { POST } = await loadRoute()
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeRequest({ textoRedacao: ESSAY }, "valid-token-u1"))
      expect(ok.status).toBe(200)
    }
    const blocked = await POST(makeRequest({ textoRedacao: ESSAY }, "valid-token-u1"))
    expect(blocked.status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(5)

    // Outro usuário não é afetado pelo limite do primeiro
    const other = await POST(makeRequest({ textoRedacao: ESSAY }, "valid-token-u2"))
    expect(other.status).toBe(200)
  })
})

describe("POST /api/correct-essay — cota", () => {
  it("correções que falham não gastam a cota do usuário", async () => {
    fetchMock.mockImplementation(async () => openAiReply("resposta quebrada"))
    const { POST } = await loadRoute()
    for (let i = 0; i < 6; i++) {
      const res = await POST(makeRequest({ textoRedacao: ESSAY }, "valid-token-u1"))
      expect(res.status).toBe(502)
    }
    fetchMock.mockImplementation(async () => openAiReply(JSON.stringify(VALID_EVALUATION)))
    const ok = await POST(makeRequest({ textoRedacao: ESSAY }, "valid-token-u1"))
    expect(ok.status).toBe(200)
  })
})

describe("POST /api/correct-essay — validação da entrada", () => {
  it("recusa com 400 quando textoRedacao não é texto", async () => {
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ textoRedacao: 123 }, "valid-token-u1"))
    expect(res.status).toBe(400)
  })

  it("recusa com 400 quando o corpo não é JSON", async () => {
    const { POST } = await loadRoute()
    const res = await POST(makeRequest("isto não é json", "valid-token-u1"))
    expect(res.status).toBe(400)
  })

  it("recusa com 400 redações com menos de 50 palavras", async () => {
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ textoRedacao: "curta demais" }, "valid-token-u1"))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("recusa com 400 redações acima de 8.000 caracteres", async () => {
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ textoRedacao: "a ".repeat(4001) + ESSAY }, "valid-token-u1"))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/correct-essay — contrato com a tela", () => {
  it("devolve a avaliação como objeto, pronta para a tela usar sem JSON.parse", async () => {
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ textoRedacao: ESSAY }, "valid-token-u1"))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.avaliacao).toEqual(VALID_EVALUATION)
    expect(typeof data.avaliacao).toBe("object")
  })

  it("envia a redação delimitada e o tema escolhido ao modelo", async () => {
    const { POST } = await loadRoute()
    await POST(makeRequest({ textoRedacao: ESSAY, tema: "Mobilidade urbana" }, "valid-token-u1"))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user").content
    expect(body.messages[0].role).toBe("system")
    expect(userMessage).toContain("<redacao>")
    expect(userMessage).toContain(ESSAY)
    expect(userMessage).toContain("Mobilidade urbana")
  })

  it("responde 502 quando o modelo devolve algo que não é JSON", async () => {
    fetchMock.mockImplementation(async () => openAiReply("desculpe, não consigo"))
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ textoRedacao: ESSAY }, "valid-token-u1"))
    expect(res.status).toBe(502)
  })

  it("responde 502 quando o JSON do modelo está fora do formato", async () => {
    fetchMock.mockImplementation(async () => openAiReply(JSON.stringify({ nota_total: "oitocentos" })))
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ textoRedacao: ESSAY }, "valid-token-u1"))
    expect(res.status).toBe(502)
  })

  it("responde 502 sem vazar detalhes quando a OpenAI falha", async () => {
    fetchMock.mockImplementation(async () => new Response("quota exceeded", { status: 429 }))
    const { POST } = await loadRoute()
    const res = await POST(makeRequest({ textoRedacao: ESSAY }, "valid-token-u1"))
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(JSON.stringify(data)).not.toContain("quota")
  })
})
