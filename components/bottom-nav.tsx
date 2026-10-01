import Link from "next/link"
import { Home, BookOpen, GraduationCap, MessageSquare, Calculator, LineChart } from "lucide-react"
import { cn } from "@/lib/utils"

interface BottomNavProps {
  active: "home" | "review" | "study" | "forum" | "calculator" | "performance"
}

const ITEMS = [
  { key: "home", href: "/", label: "Início", icon: Home },
  { key: "review", href: "/review", label: "Revisão", icon: BookOpen },
  { key: "study", href: "/study", label: "Estudo", icon: GraduationCap },
  { key: "forum", href: "/forum", label: "Fórum", icon: MessageSquare },
  { key: "calculator", href: "/calculator", label: "Calculadora", icon: Calculator },
  { key: "performance", href: "/performance", label: "Desempenho", icon: LineChart },
] as const

export function BottomNav({ active }: BottomNavProps) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] dark:border-gray-800"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-6">
        {ITEMS.map(({ key, href, label, icon: Icon }) => {
          const isActive = active === key
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-0 text-muted-foreground transition-colors",
                  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive && "bg-primary/10 text-primary",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="max-w-full truncate text-[10px] font-medium leading-none tracking-tight">{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
