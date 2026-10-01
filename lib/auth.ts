"use client"

import { supabase } from "./supabaseClient"

export interface User {
  id: string
  email: string
  name?: string
  avatar_url?: string
  created_at: string
}

export interface AuthResponse {
  user: User | null
  error: string | null
}

function traduzirErroCadastro(mensagem: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes("database error")) {
    return "Não foi possível criar sua conta agora. Tente novamente em instantes."
  }
  if (m.includes("not authorized")) {
    return "Não foi possível enviar o e-mail de confirmação para este endereço. Tente novamente mais tarde."
  }
  if (m.includes("rate limit") || m.includes("security purposes")) {
    return "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente."
  }
  if (m.includes("already registered")) {
    return "Este e-mail já está cadastrado. Tente entrar ou recuperar a senha."
  }
  if (m.includes("password")) {
    return "A senha não atende aos requisitos. Use pelo menos 6 caracteres."
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "E-mail inválido. Confira o endereço digitado."
  }
  return mensagem
}

export async function signUp(email: string, password: string, name?: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/`,
        data: {
          name: name || "",
        },
      },
    })

   if (error) {
      console.error("Erro no cadastro (Supabase):", error.message)
      return { user: null, error: traduzirErroCadastro(error.message) }
    }

    // Com confirmação de e-mail ligada, um e-mail que já existe volta "sem erro", mas sem identidades
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { user: null, error: "Este e-mail já está cadastrado. Tente entrar ou recuperar a senha." }
    }

    if (data.user) {
      return {
        user: {
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.name || name,
          avatar_url: data.user.user_metadata?.avatar_url,
          created_at: data.user.created_at,
        },
        error: null,
      }
    }

    return { user: null, error: "Erro desconhecido durante o cadastro" }
  } catch (err) {
    return { user: null, error: "Erro de conexão. Tente novamente." }
  }
}

export async function signIn(email: string, password: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return { user: null, error: error.message }
    }

    if (data.user) {
      return {
        user: {
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.name,
          avatar_url: data.user.user_metadata?.avatar_url,
          created_at: data.user.created_at,
        },
        error: null,
      }
    }

    return { user: null, error: "Erro desconhecido durante o login" }
  } catch (err) {
    return { user: null, error: "Erro de conexão. Tente novamente." }
  }
}

export async function signOut(): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      return { error: error.message }
    }

    return { error: null }
  } catch (err) {
    return { error: "Erro ao fazer logout. Tente novamente." }
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    return {
      id: user.id,
      email: user.email!,
      name: user.user_metadata?.name,
      avatar_url: user.user_metadata?.avatar_url,
      created_at: user.created_at,
    }
  } catch (err) {
    return null
  }
}

export async function resetPassword(email: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/reset-password`,
    })

    if (error) {
      return { error: error.message }
    }

    return { error: null }
  } catch (err) {
    return { error: "Erro ao enviar email de recuperação. Tente novamente." }
  }
}

export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      return { error: error.message }
    }

    return { error: null }
  } catch (err) {
    return { error: "Erro ao atualizar senha. Tente novamente." }
  }
}

export async function updateProfile(updates: { name?: string; avatar_url?: string }): Promise<{
  error: string | null
}> {
  try {
    const { error } = await supabase.auth.updateUser({
      data: updates,
    })

    if (error) {
      return { error: error.message }
    }

    return { error: null }
  } catch (err) {
    return { error: "Erro ao atualizar perfil. Tente novamente." }
  }
}

// Hook para verificar se o usuário está autenticado
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar usuário atual
    getCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false))

    // Escutar mudanças de autenticação
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata?.name,
          avatar_url: session.user.user_metadata?.avatar_url,
          created_at: session.user.created_at,
        })
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}

// Importações necessárias para o hook
import { useState, useEffect } from "react"
