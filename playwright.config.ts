import { defineConfig, devices } from "@playwright/test"

const PORT = 3100

// Localmente usa o Chrome instalado (sem baixar navegadores); no CI usa o Chromium do Playwright
const chromeChannel = process.env.CI ? {} : { channel: "chrome" as const }

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // O servidor de dev compila cada página na primeira visita; poucos workers evitam timeouts
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...chromeChannel } },
    { name: "mobile", use: { ...devices["Pixel 5"], ...chromeChannel } },
  ],
  webServer: {
    // Supabase falso: os testes cobrem o que funciona sem backend (visitante, navegação, validações)
    // Testa o build de produção: mais estável e igual ao que o usuário recebe
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-placeholder",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
})
