// Converte a resposta da rota /api/correct-essay (campos em português, como o
// modelo devolve) para o formato que a tela, o PDF e o histórico usam.

export interface ApiCompetencia {
  nota: number
  justificativa: string
}

export interface ApiAvaliacao {
  nota_total: number
  competencias: Record<string, ApiCompetencia>
  pontos_positivos: string
  pontos_a_melhorar: string
  sugestao_de_reescrita: string
}

export interface EssayCompetency {
  score: number
  justification: string
}

export interface EssayEvaluationResult {
  total_score: number
  competencies: Record<string, EssayCompetency>
  positive_points: string
  improvement_points: string
  rewrite_suggestion: string
}

export function toEssayEvaluation(avaliacao: ApiAvaliacao): EssayEvaluationResult {
  return {
    total_score: avaliacao.nota_total,
    competencies: Object.fromEntries(
      Object.entries(avaliacao.competencias).map(([key, c]) => [key, { score: c.nota, justification: c.justificativa }]),
    ),
    positive_points: avaliacao.pontos_positivos,
    improvement_points: avaliacao.pontos_a_melhorar,
    rewrite_suggestion: avaliacao.sugestao_de_reescrita,
  }
}
