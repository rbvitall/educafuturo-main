import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY. Defina no .env.local (local) ou nas Environment Variables da Vercel.",
  )
}

export const supabaseUrl: string = url
export const supabaseAnonKey: string = anonKey

// Cliente único do app: todas as telas devem importar daqui
export const supabase = createClient(supabaseUrl, supabaseAnonKey)