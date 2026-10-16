// Teste rápido da pré-visualização sem servidor: login, importação de uma planilha fictícia
// pelo navegador, classificação de status e dashboard. Gera capturas para revisão.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4173/";
const OUT = process.env.OUT_DIR ?? "preview-shots";
const FILE = process.env.XLSX_FILE;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(BASE);
await page.getByRole("button", { name: /Administrador/ }).click();
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL(/#\/performance/);

await page.goto(`${BASE}#/administracao/importacoes`);
await page.locator("#import-file").setInputFiles(FILE);
await page.getByText("Concluída").first().waitFor({ timeout: 15000 });
await page.getByRole("button", { name: "Importar planilha fictícia de teste" }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-importacoes.png`, fullPage: true });

await page.goto(`${BASE}#/administracao/catalogos`);
await page.getByLabel("Classificação de PAGA").selectOption("hired");
await page.waitForTimeout(500);
await page.getByLabel("Classificação de REPRC").selectOption("rejected");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/02-catalogos.png`, fullPage: true });

await page.goto(`${BASE}#/performance`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/03-performance.png`, fullPage: true });

await page.goto(`${BASE}#/candidatos`);
await page.waitForTimeout(1200);
await page.locator("tbody tr").first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/04-candidatos.png` });

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
