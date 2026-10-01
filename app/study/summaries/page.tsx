"use client"

import { useState } from "react"
import { TopNav } from "@/components/top-nav"
import { BottomNav } from "@/components/bottom-nav"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Search, BookOpen } from "lucide-react"
import Link from "next/link"
import { useStudyTracker } from "@/hooks/use-study-tracker"
import { supabase } from "@/lib/supabaseClient"

// PDFs ficam no bucket privado "summary-pdfs". O link assinado é gerado na hora
// do clique (validade de 1 hora), em vez de um token fixo no código que expira.
const SUMMARY_BUCKET = "summary-pdfs"
const SIGNED_URL_TTL_SECONDS = 60 * 60

async function openSummaryPdf(path: string) {
  // Abre a aba antes do await para o navegador não bloquear como pop-up
  const tab = window.open("", "_blank")
  const { data, error } = await supabase.storage.from(SUMMARY_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    tab?.close()
    alert("Não foi possível abrir o resumo agora. Tente novamente mais tarde.")
    return
  }
  if (tab) {
    tab.opener = null
    tab.location.href = data.signedUrl
  } else {
    window.location.href = data.signedUrl
  }
}

const summaries = [
  {
    id: "digital-basics",
    title: "Fundamentos de Eletrônica Digital",
    category: "digital",
    content:
      "A eletrônica digital é baseada em sinais discretos, geralmente representados por 0s e 1s. Os principais componentes incluem portas lógicas, flip-flops e circuitos integrados...",
    pdfPath: "1.pdf",
  },
  {
    id: "analog-circuits",
    title: "Circuitos Analógicos Básicos",
    category: "analog",
    content:
      "Circuitos analógicos trabalham com sinais contínuos. Componentes fundamentais incluem resistores, capacitores, indutores e amplificadores operacionais...",
    pdfPath: "2.pdf",
  },
  {
    id: "power-electronics",
    title: "Introdução à Eletrônica de Potência",
    category: "power",
    content:
      "A eletrônica de potência lida com o controle e conversão de energia elétrica. Dispositivos comuns incluem tiristores, MOSFETs de potência e IGBTs...",
    pdfPath: "3.pdf",
  },
  // Adicione mais resumos conforme necessário
]

export default function SummariesPage() {
  const [activeCategory, setActiveCategory] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const studyTracker = useStudyTracker("summaries")

  const filteredSummaries = summaries.filter(
    (summary) =>
      (activeCategory === "all" || summary.category === activeCategory) &&
      summary.title.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <TopNav />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar para Estudos">
            <Link href="/study"><ArrowLeft className="h-6 w-6" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Resumos</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            type="search"
            placeholder="Pesquisar resumos..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Tabs defaultValue="all" onValueChange={setActiveCategory}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="digital">Digital</TabsTrigger>
            <TabsTrigger value="analog">Analógica</TabsTrigger>
            <TabsTrigger value="power">Potência</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSummaries.map((summary) => (
            <Card key={summary.id} className="overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  {summary.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 line-clamp-3">{summary.content}</p>
                <Button className="mt-4" onClick={() => openSummaryPdf(summary.pdfPath)}>
                  Ler Mais
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <BottomNav active="study" />
    </div>
  )
}
