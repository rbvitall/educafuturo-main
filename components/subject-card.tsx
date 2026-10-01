"use client"

import { Card } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface SubjectCardProps {
  icon: LucideIcon
  title: string
  progress: number
  total: number
  className?: string
  onClick?: () => void
}

export function SubjectCard({
  icon: Icon,
  title,
  progress,
  total,
  className,
  onClick,
}: SubjectCardProps) {
  const progressPercentage = total > 0 ? Math.min(100, (progress / total) * 100) : 0

  return (
    <Card
      className={`p-4 hover:shadow-md transition-all dark:border-gray-800 ${className ?? ""}`}
      onClick={onClick}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="h-6 w-6 shrink-0 text-white" aria-hidden="true" />
          <h3 className="font-medium text-white">{title}</h3>
        </div>

        <span className="shrink-0 text-sm tabular-nums text-white" aria-label={`${progress} de ${total} concluídos`}>
          {progress}/{total}
        </span>
      </div>

      <Progress
        value={progressPercentage}
        className="bg-white/20 dark:bg-white/10"
      />
    </Card>
  )
}