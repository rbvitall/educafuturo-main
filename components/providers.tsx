"use client"

import type React from "react"

import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/lib/authContext"
import { OfflineWarning } from "@/components/offline-warning"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        {children}
        <OfflineWarning />
      </AuthProvider>
    </ThemeProvider>
  )
}
