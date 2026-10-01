"use client"

import { useState, useEffect } from "react"
import { TopNav } from "@/components/top-nav"
import { BottomNav } from "@/components/bottom-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { useAuth } from "@/lib/authContext"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toEssayEvaluation } from "@/lib/essay"
import { motion } from "framer-motion"
import {
  PenTool,
  Send,
  FileText,
  BarChart3,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Calendar,
  ArrowLeft,
  BookOpen,
  Eye,
  Play,
} from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import jsPDF from "jspdf"

interface EssayEvaluation {
  id?: string
  user_id?: string
  original_text: string
  total_score: number
  competencies: {
    [key: string]: {
      score: number
      justification: string
    }
  }
  positive_points: string
  improvement_points: string
  rewrite_suggestion: string
  created_at?: string
  theme?: string
}

// Mesmos limites da rota /api/correct-essay
const MIN_WORDS = 50
const MAX_CHARS = 8000

const essayThemes = [
  {
    id: 1,
    title: "Democratização do acesso ao cinema no Brasil",
    description: "Discuta os desafios e possibilidades para tornar o cinema mais acessível à população brasileira.",
    motivationalText: `O cinema é uma das mais importantes formas de arte e entretenimento da sociedade contemporânea. No Brasil, apesar da rica produção cinematográfica nacional e do crescente interesse do público, ainda existem barreiras significativas que limitam o acesso democrático a essa forma de expressão cultural.

Segundo dados da Agência Nacional do Cinema (ANCINE), o país possui cerca de 3.300 salas de cinema, concentradas principalmente nas regiões Sul e Sudeste e nos grandes centros urbanos. Essa distribuição desigual reflete as disparidades socioeconômicas do país e evidencia a necessidade de políticas públicas que promovam a democratização do acesso ao cinema.

A questão vai além da simples disponibilidade de salas. Os altos preços dos ingressos, a falta de diversidade na programação e a concentração de cinemas em shopping centers são fatores que contribuem para a exclusão de parcelas significativas da população. Além disso, a predominância de filmes estrangeiros, especialmente hollywoodianos, limita o contato do público com a produção nacional e com cinematografias de outros países.

Por outro lado, iniciativas como o programa "Cinema Perto de Você", projetos de cinema itinerante e a criação de cineclubes em escolas e universidades demonstram que é possível ampliar o acesso ao cinema. A tecnologia também oferece novas possibilidades, com plataformas de streaming e exibições ao ar livre ganhando popularidade.`,
  },
  {
    id: 2,
    title: "Os desafios da mobilidade urbana sustentável no Brasil",
    description: "Analise os problemas de mobilidade nas cidades brasileiras e proponha soluções sustentáveis.",
    motivationalText: `As cidades brasileiras enfrentam uma crise de mobilidade urbana que afeta milhões de pessoas diariamente. O crescimento desordenado das metrópoles, aliado ao modelo de desenvolvimento centrado no transporte individual motorizado, criou um cenário de congestionamentos crônicos, poluição atmosférica e exclusão social.

Dados do Instituto Brasileiro de Geografia e Estatística (IBGE) revelam que mais de 84% da população brasileira vive em áreas urbanas, e a tendência é de crescimento contínuo. Nas grandes cidades, o tempo médio de deslocamento casa-trabalho pode ultrapassar duas horas diárias, impactando negativamente a qualidade de vida e a produtividade econômica.

O transporte público, que deveria ser a espinha dorsal da mobilidade urbana, enfrenta problemas estruturais: superlotação, falta de integração entre modais, infraestrutura deficiente e tarifas elevadas. Paralelamente, o incentivo histórico ao uso do automóvel particular, através de políticas como a redução do IPI, contribuiu para o agravamento dos problemas de trânsito e poluição.

Contudo, experiências exitosas em cidades como Curitiba, com seu sistema de Bus Rapid Transit (BRT), e Fortaleza, com a integração de diferentes modais de transporte, demonstram que soluções sustentáveis são possíveis. O investimento em transporte público de qualidade, ciclovias, calçadas acessíveis e tecnologias inteligentes de gestão de tráfego pode transformar a realidade da mobilidade urbana brasileira.`,
  },
  {
    id: 3,
    title: "A importância da educação financeira na formação dos jovens brasileiros",
    description:
      "Discuta a necessidade de incluir educação financeira no currículo escolar e seus impactos na sociedade.",
    motivationalText: `A educação financeira tornou-se uma competência essencial no mundo contemporâneo, especialmente em um país como o Brasil, onde questões relacionadas ao endividamento e à falta de planejamento financeiro afetam milhões de famílias. Segundo pesquisa da Confederação Nacional do Comércio (CNC), mais de 60% das famílias brasileiras estão endividadas, evidenciando a urgência de se promover a educação financeira desde cedo.

A Base Nacional Comum Curricular (BNCC), implementada em 2020, incluiu a educação financeira como tema transversal, reconhecendo sua importância para a formação cidadã. No entanto, a efetiva implementação dessa diretriz ainda enfrenta desafios, como a capacitação de professores e a criação de materiais didáticos adequados.

A falta de conhecimento sobre conceitos básicos como juros, inflação, investimentos e planejamento orçamentário contribui para decisões financeiras inadequadas, que podem comprometer o futuro dos jovens. Além disso, a sociedade de consumo e a facilidade de acesso ao crédito, muitas vezes sem a devida orientação, podem levar ao superendividamento.

Por outro lado, países que investiram na educação financeira de seus jovens, como Austrália e Reino Unido, observaram melhorias significativas nos índices de poupança e redução do endividamento familiar. No Brasil, iniciativas como o programa "Aprender Valor", do Banco Central, e projetos desenvolvidos por organizações não governamentais mostram resultados promissores na formação de uma geração mais consciente financeiramente.`,
  },
]

export default function EssayReviewPage() {
  const [essayText, setEssayText] = useState("")
  const [wordCount, setWordCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  // Erro da última tentativa de correção, mostrado abaixo do editor (no lugar de alert)
  const [correctionError, setCorrectionError] = useState<{ message: string; needsLogin?: boolean } | null>(null)
  const [evaluation, setEvaluation] = useState<EssayEvaluation | null>(null)
  const [essayHistory, setEssayHistory] = useState<EssayEvaluation[]>([])
  const [activeTab, setActiveTab] = useState("editor")
  const [selectedTheme, setSelectedTheme] = useState<(typeof essayThemes)[0] | null>(null)
  const [showThemeText, setShowThemeText] = useState(false)
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (authLoading) return // espera o Supabase restaurar a sessão
    if (!user) {
      router.push("/login")
      return
    }
    loadEssayHistory()
  }, [user, authLoading, router])

  useEffect(() => {
    const words = essayText
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0)
    setWordCount(words.length)
  }, [essayText])

  const loadEssayHistory = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from("essay_evaluations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)

      if (error) {
        if (error.message.includes('relation "public.essay_evaluations" does not exist')) {
          console.log("[EducaFuturo] Tabela essay_evaluations não existe ainda. Criando array vazio.")
          setEssayHistory([])
          return
        }
        throw error
      }
      setEssayHistory(data || [])
    } catch (error) {
      console.error("Erro ao carregar histórico:", error)
      setEssayHistory([])
    }
  }

  const correctEssay = async () => {
    setCorrectionError(null)
    if (!essayText.trim() || wordCount < MIN_WORDS) {
      setCorrectionError({ message: `Escreva pelo menos ${MIN_WORDS} palavras para enviar a redação.` })
      return
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setCorrectionError({ message: "Você está sem internet. Seu texto continua aqui; tente de novo quando a conexão voltar." })
      return
    }

    setIsLoading(true)
    try {
      const requestBody = {
        textoRedacao: essayText,
        tema: selectedTheme?.title || null,
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setCorrectionError({ message: "Sua sessão expirou. Entre de novo para corrigir a redação.", needsLogin: true })
        return
      }

      const response = await fetch("/api/correct-essay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setCorrectionError({
          message: data.error || "Não foi possível corrigir a redação agora. Tente novamente em alguns minutos.",
          needsLogin: response.status === 401,
        })
        return
      }

      // A rota devolve os campos em português; a tela usa score/justification
      const newEvaluation: EssayEvaluation = {
        original_text: essayText,
        ...toEssayEvaluation(data.avaliacao),
        theme: selectedTheme?.title || undefined,
      }

      setEvaluation(newEvaluation)
      setActiveTab("results")

      if (user) {
        try {
          const { error } = await supabase.from("essay_evaluations").insert([
            {
              user_id: user.id,
              ...newEvaluation,
            },
          ])

          if (!error) {
            loadEssayHistory()
          } else {
            console.log("[EducaFuturo] Erro ao salvar no banco:", error.message)
          }
        } catch (saveError) {
          console.log("[EducaFuturo] Tabela não existe ainda, avaliação salva apenas localmente")
        }
      }
    } catch (error) {
      console.error("Erro na correção:", error)
      setCorrectionError({
        message: "A conexão com o corretor falhou. Seu texto continua aqui; tente novamente em alguns minutos.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const exportToPDF = () => {
    if (!evaluation) return

    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Correção de Redação - EducaFuturo", 20, 20)

    doc.setFontSize(12)
    doc.text(`Nota Total: ${evaluation.total_score}/1000`, 20, 40)

    let yPosition = 60
    Object.entries(evaluation.competencies).forEach(([comp, data]) => {
      doc.text(`Competência ${comp}: ${data.score}/200`, 20, yPosition)
      yPosition += 10
    })

    doc.save("redacao-corrigida.pdf")
  }

  const getScoreColor = (score: number, max = 200) => {
    const percentage = (score / max) * 100
    if (percentage >= 80) return "text-green-600"
    if (percentage >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const evolutionData = essayHistory
    .slice(0, 5)
    .reverse()
    .map((essay, index) => ({
      name: `Redação ${index + 1}`,
      score: essay.total_score,
    }))

  const startEssayWithTheme = (theme: (typeof essayThemes)[0]) => {
    setSelectedTheme(theme)
    setEssayText(`Tema: ${theme.title}\n\n`)
    setActiveTab("editor")
    setShowThemeText(false)
  }

  if (!user) {
    return <div>Carregando...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <TopNav />

      <main className="container mx-auto px-4 py-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => router.push("/study")} className="mr-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="p-3 rounded-lg bg-purple-100">
              <PenTool className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Revisão de Redações</h1>
              <p className="text-muted-foreground">Corrija suas redações com IA baseada nas 5 competências do ENEM</p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="themes">Temas</TabsTrigger>
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="results">Resultados</TabsTrigger>
              <TabsTrigger value="history">Histórico</TabsTrigger>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            </TabsList>

            <TabsContent value="themes" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Temas de Redação
                  </CardTitle>
                  <CardDescription>Escolha um tema e acesse textos motivadores para sua redação</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {essayThemes.map((theme) => (
                      <Card key={theme.id} className="cursor-pointer hover:bg-gray-50">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold mb-2">{theme.title}</h3>
                              <p className="text-sm text-muted-foreground mb-3">{theme.description}</p>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedTheme(theme)
                                    setShowThemeText(true)
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Visualizar Texto
                                </Button>
                                <Button size="sm" onClick={() => startEssayWithTheme(theme)}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Iniciar Redação
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {showThemeText && selectedTheme && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                      <Card className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <CardHeader>
                          <CardTitle>{selectedTheme.title}</CardTitle>
                          <CardDescription>Texto Motivador</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="prose max-w-none">
                            <p className="whitespace-pre-line text-sm leading-relaxed">
                              {selectedTheme.motivationalText}
                            </p>
                          </div>
                          <div className="flex gap-2 mt-6">
                            <Button onClick={() => startEssayWithTheme(selectedTheme)}>
                              <Play className="h-4 w-4 mr-2" />
                              Iniciar Redação
                            </Button>
                            <Button variant="outline" onClick={() => setShowThemeText(false)}>
                              Fechar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="editor" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Editor de Redação
                    {selectedTheme && (
                      <Badge variant="secondary" className="ml-2">
                        {selectedTheme.title}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Escreva ou cole sua redação abaixo. Mínimo de 50 palavras para correção.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Digite sua redação aqui..."
                    value={essayText}
                    onChange={(e) => {
                      setEssayText(e.target.value)
                      if (correctionError) setCorrectionError(null)
                    }}
                    maxLength={MAX_CHARS}
                    aria-label="Texto da redação"
                    aria-describedby="essay-limits"
                    className="min-h-[400px] resize-none"
                  />

                  {correctionError && (
                    <Alert variant="destructive" role="alert">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>{correctionError.message}</span>
                        {correctionError.needsLogin && (
                          <Link href="/login" className="font-medium underline underline-offset-4">
                            Entrar
                          </Link>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Badge variant={wordCount >= MIN_WORDS ? "default" : "secondary"}>{wordCount} palavras</Badge>
                      <span id="essay-limits" className="text-sm tabular-nums text-muted-foreground">
                        {wordCount < MIN_WORDS ? `Mínimo: ${MIN_WORDS} palavras · ` : ""}
                        {essayText.length.toLocaleString("pt-BR")}/{MAX_CHARS.toLocaleString("pt-BR")} caracteres
                      </span>
                    </div>

                    <Button onClick={correctEssay} disabled={isLoading || wordCount < MIN_WORDS} className="gap-2">
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Corrigindo...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Corrigir com IA
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="results" className="mt-6">
              {evaluation ? (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Resultado da Correção</span>
                        <Button onClick={exportToPDF} variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Exportar PDF
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center mb-6">
                        <div className="text-4xl font-bold text-primary mb-2">{evaluation.total_score}/1000</div>
                        <Badge variant="secondary">Nota Total</Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                        {Object.entries(evaluation.competencies).map(([comp, data]) => (
                          <Card key={comp}>
                            <CardContent className="p-4 text-center">
                              <div className={`text-2xl font-bold ${getScoreColor(data.score)}`}>{data.score}/200</div>
                              <div className="text-sm text-muted-foreground">Competência {comp}</div>
                              <Progress value={(data.score / 200) * 100} className="mt-2 h-2" />
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-green-600">
                              <CheckCircle className="h-5 w-5" />
                              Pontos Positivos
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm">{evaluation.positive_points}</p>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-orange-600">
                              <AlertCircle className="h-5 w-5" />
                              Pontos a Melhorar
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm">{evaluation.improvement_points}</p>
                          </CardContent>
                        </Card>
                      </div>

                      <Card className="mt-6">
                        <CardHeader>
                          <CardTitle>Sugestão de Reescrita</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm whitespace-pre-wrap">{evaluation.rewrite_suggestion}</p>
                        </CardContent>
                      </Card>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Nenhuma correção disponível. Escreva uma redação e clique em “Corrigir com IA”.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Histórico de Redações
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {essayHistory.length > 0 ? (
                    <div className="space-y-4">
                      {essayHistory.map((essay, index) => (
                        <Card key={essay.id || index} className="cursor-pointer hover:bg-gray-50">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">Redação {essayHistory.length - index}</div>
                                <div className="text-sm text-muted-foreground">
                                  {essay.created_at
                                    ? new Date(essay.created_at).toLocaleDateString("pt-BR")
                                    : "Data não disponível"}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-lg font-bold ${getScoreColor(essay.total_score, 1000)}`}>
                                  {essay.total_score}/1000
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {Math.round((essay.total_score / 1000) * 100)}%
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">
                        Nenhuma redação corrigida ainda. Comece escrevendo sua primeira redação!
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dashboard" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Evolução das Notas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {evolutionData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={evolutionData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis domain={[0, 1000]} />
                          <Tooltip />
                          <Line type="monotone" dataKey="score" stroke="#8884d8" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48">
                        <p className="text-muted-foreground">Dados insuficientes para gráfico</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Estatísticas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between">
                      <span>Total de Redações:</span>
                      <Badge>{essayHistory.length}</Badge>
                    </div>
                    {essayHistory.length > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span>Maior Nota:</span>
                          <Badge variant="default">{Math.max(...essayHistory.map((e) => e.total_score))}/1000</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Média Geral:</span>
                          <Badge variant="secondary">
                            {Math.round(essayHistory.reduce((acc, e) => acc + e.total_score, 0) / essayHistory.length)}
                            /1000
                          </Badge>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>

      <BottomNav active="study" />
    </div>
  )
}
