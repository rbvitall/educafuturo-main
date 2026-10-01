"use client"

import { useState, useEffect, useCallback } from "react"
import { TopNav } from "@/components/top-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/lib/authContext"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"

interface ProjectSubmission {
  id: string
  user_id: string
  project_id: string
  file_url: string
  status: "pending" | "approved" | "rejected"
  feedback?: string
  created_at: string
}

const STATUS_LABEL: Record<ProjectSubmission["status"], string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
}

export default function AdminProjectsPage() {
  const [submissions, setSubmissions] = useState<ProjectSubmission[]>([])
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [feedback, setFeedback] = useState<{ [key: string]: string }>({})

  const fetchSubmissions = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_submissions")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Erro ao buscar entregas:", error)
      toast({ title: "Erro", description: "Não foi possível carregar as entregas.", variant: "destructive" })
    } else {
      setSubmissions(data ?? [])
    }
  }, [toast])

  // Quem é admin fica na tabela "admins" (ver migração 20261001000000_harden_rls.sql).
  // A RLS do banco é quem realmente protege os dados; esta checagem só decide o que mostrar.
  useEffect(() => {
    if (isLoading) return
    if (!user) {
      router.push("/login")
      return
    }

    let cancelled = false
    supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        const admin = !error && !!data
        setIsAdmin(admin)
        if (admin) {
          fetchSubmissions()
        } else {
          router.push("/")
        }
      })

    return () => {
      cancelled = true
    }
  }, [user, isLoading, router, fetchSubmissions])

  const handleFeedbackChange = (submissionId: string, value: string) => {
    setFeedback((prev) => ({
      ...prev,
      [submissionId]: value,
    }))
  }

  const review = async (submissionId: string, status: "approved" | "rejected", text: string) => {
    const { error } = await supabase
      .from("project_submissions")
      .update({
        status,
        feedback: text,
        evaluated_at: new Date().toISOString(),
      })
      .eq("id", submissionId)

    if (error) {
      console.error("Erro ao avaliar entrega:", error)
      toast({ title: "Erro", description: "Não foi possível salvar a avaliação.", variant: "destructive" })
    } else {
      fetchSubmissions()
    }
  }

  const handleApprove = (submissionId: string) =>
    review(submissionId, "approved", feedback[submissionId] || "Projeto aprovado! Parabéns!")

  const handleReject = (submissionId: string) => {
    if (!feedback[submissionId]) {
      toast({
        title: "Erro",
        description: "Por favor, forneça um feedback para rejeição",
        variant: "destructive",
      })
      return
    }
    review(submissionId, "rejected", feedback[submissionId])
  }

  if (isLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 pb-16">
        <TopNav />
        <main className="container mx-auto px-4 py-6">
          <p className="text-muted-foreground">Verificando permissões...</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <TopNav />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">Admin: entregas de projetos</h1>

        {submissions.length === 0 && <p className="text-muted-foreground">Nenhuma entrega até agora.</p>}

        <div className="grid gap-6">
          {submissions.map((submission) => (
            <Card key={submission.id}>
              <CardHeader>
                <CardTitle>Projeto: {submission.project_id}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Aluno (ID): {submission.user_id}</p>
                <p>Status: {STATUS_LABEL[submission.status] ?? submission.status}</p>
                <p>Enviado em: {new Date(submission.created_at).toLocaleString("pt-BR")}</p>
                <a
                  href={submission.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  Ver entrega
                </a>

                {submission.status === "pending" && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-2">Feedback para o aluno:</label>
                    <Textarea
                      value={feedback[submission.id] || ""}
                      onChange={(e) => handleFeedbackChange(submission.id, e.target.value)}
                      placeholder="Forneça um feedback detalhado, especialmente em caso de rejeição"
                      className="w-full mb-2"
                    />
                  </div>
                )}

                {submission.feedback && submission.status !== "pending" && (
                  <div className="mt-2 p-3 bg-gray-50 border rounded-md">
                    <p className="font-medium">Feedback:</p>
                    <p>{submission.feedback}</p>
                  </div>
                )}

                <div className="mt-4 space-x-2">
                  <Button onClick={() => handleApprove(submission.id)} disabled={submission.status !== "pending"}>
                    Aprovar
                  </Button>
                  <Button
                    onClick={() => handleReject(submission.id)}
                    disabled={submission.status !== "pending" || !feedback[submission.id]}
                    variant="destructive"
                  >
                    Rejeitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
