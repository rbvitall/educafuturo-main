"use client"

import type React from "react"

import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/lib/authContext"
import { OfflineWarning } from "@/components/offline-warning"
import { Toaster } from "@/components/ui/toaster"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        {children}
        <OfflineWarning />
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  )
}
