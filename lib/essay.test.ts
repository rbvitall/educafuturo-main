import { describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
import { toEssayEvaluation } from "./essay"

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) } }),
}))

const RESPOSTA_DO_MODELO = {
  nota_total: 760,
  competencias: {
    "1": { nota: 160, justificativa: "a" },
    "2": { nota: 120, justificativa: "b" },
    "3": { nota: 160, justificativa: "c" },
    "4": { nota: 160, justificativa: "d" },
    "5": { nota: 160, justificativa: "e" },
  },
  pontos_positivos: "p",
  pontos_a_melhorar: "m",
  sugestao_de_reescrita: "r",
}

describe("toEssayEvaluation", () => {
  it("converte a resposta real da rota para o formato da tela (score/justification)", async () => {
    // Passa pela rota de verdade para garantir que o contrato rota → tela não se desencontre
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(RESPOSTA_DO_MODELO) } }] }))),
    )
    const { POST } = await import("@/app/api/correct-essay/route")
    const essay = Array.from({ length: 60 }, (_, i) => `p${i}`).join(" ")
    const res = await POST(
      new NextRequest("http://localhost/api/correct-essay", {
        method: "POST",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify({ textoRedacao: essay }),
      }),
    )
    const { avaliacao } = await res.json()

    const result = toEssayEvaluation(avaliacao)
    expect(result.total_score).toBe(760)
    expect(result.competencies["2"]).toEqual({ score: 120, justification: "b" })
    for (const c of Object.values(result.competencies)) {
      expect(typeof c.score).toBe("number")
    }
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
})
