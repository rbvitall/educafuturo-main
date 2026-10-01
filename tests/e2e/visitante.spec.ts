import { test, expect } from "@playwright/test"

test.describe("home do visitante", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Olá, Visitante!" })).toBeVisible()
  })

  test("a busca filtra as matérias e avisa quando não encontra nada", async ({ page }) => {
    const busca = page.getByPlaceholder("Pesquisar matérias...")
    await busca.fill("Circuitos")
    await expect(page.getByRole("heading", { name: /Circuitos - 1º Ano/ })).toBeVisible()
    await expect(page.getByRole("heading", { name: /Matemática/ })).toHaveCount(0)

    await busca.fill("zzz-nao-existe")
    await expect(page.getByText("Nenhuma matéria encontrada")).toBeVisible()
  })

  test("a página não rola na horizontal", async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test("a navegação inferior mostra os 6 destinos e marca a página atual", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Navegação principal" })
    const links = nav.getByRole("link")
    await expect(links).toHaveCount(6)
    for (const label of ["Início", "Revisão", "Estudo", "Fórum", "Calculadora", "Desempenho"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible()
    }
    await expect(nav.getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page")
  })

  test("não há botões dentro de links", async ({ page }) => {
    await expect(page.locator("a button, button a")).toHaveCount(0)
  })

  test("o botão Entrar leva ao login", async ({ page }) => {
    await page.getByRole("main").getByRole("link", { name: "Entrar" }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe("rotas protegidas", () => {
  for (const rota of ["/forum", "/study/essay-review"]) {
    test(`${rota} manda o visitante para o login`, async ({ page }) => {
      await page.goto(rota)
      await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 })
    })
  }
})

test("login: o botão de mostrar senha tem rótulo e alterna", async ({ page }) => {
  await page.goto("/login")
  const senha = page.locator('input[type="password"]')
  await expect(senha).toBeVisible()

  await page.getByRole("button", { name: "Mostrar senha" }).click()
  await expect(page.getByRole("button", { name: "Ocultar senha" })).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
})

test("a rota de correção de redação recusa chamadas sem login", async ({ request }) => {
  const res = await request.post("/api/correct-essay", { data: { textoRedacao: "texto qualquer" } })
  // 401 sem login; 503 quando o ambiente de teste não tem chave da OpenAI (checada antes)
  expect([401, 503]).toContain(res.status())
})
