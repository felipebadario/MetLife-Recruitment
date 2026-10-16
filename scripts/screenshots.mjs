// Captura telas do sistema rodando localmente com dados FICTÍCIOS (usado no CI para revisão visual).
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8000";
const OUT = process.env.OUT_DIR ?? "screenshots";

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function shot(page, name, path, wait = 1200) {
  if (path) await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

const browser = await chromium.launch();
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
const page = await desktop.newPage();
await page.goto(`${BASE}/login`);
await shot(page, "01-login", null, 500);
await login(page, "admin@demo.local", "DemoAdmin2026");
await shot(page, "02-performance", "/performance");
await shot(page, "03-candidatos", "/candidatos");
await page.locator("tbody tr").first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/04-candidato-painel.png` });
await page.getByRole("tab", { name: "Histórico" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/05-candidato-historico.png` });
await page.keyboard.press("Escape");
await shot(page, "06-importacoes", "/administracao/importacoes");
await shot(page, "07-catalogos", "/administracao/catalogos");
await shot(page, "08-performance-filtrada", "/performance?regional=SUD");

const viewer = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
const vpage = await viewer.newPage();
await login(vpage, "viewer@demo.local", "DemoViewer2026");
await shot(vpage, "09-viewer-candidatos", "/candidatos");

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR", deviceScaleFactor: 2 });
const mpage = await mobile.newPage();
await login(mpage, "admin@demo.local", "DemoAdmin2026");
await shot(mpage, "10-mobile-performance", "/performance");

await browser.close();
