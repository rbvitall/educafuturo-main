import { redirect } from "next/navigation"

// A listagem de quizzes fica em /review/questionarios
export default function QuizPage() {
  redirect("/review/questionarios")
}