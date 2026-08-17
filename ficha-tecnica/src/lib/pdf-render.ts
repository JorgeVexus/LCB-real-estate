import fs from "node:fs";
import path from "node:path";
import ReactDOMServer from "react-dom/server.node";
import type { Browser } from "playwright-core";
import { FichaDocument } from "@/components/ficha/FichaDocument";
import type { FichaData } from "@/types/ficha";

/** Alto/ancho del lienzo de la ficha (px), igual al frame de Figma — ver Ficha.css. */
const PAGE_WIDTH = "1049px";
const PAGE_HEIGHT = "1546px";

function logoDataUri(): string {
  const bytes = fs.readFileSync(path.join(process.cwd(), "public/logo-lcb.png"));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function buildHtml(ficha: FichaData): string {
  const css = fs.readFileSync(
    path.join(process.cwd(), "src/components/ficha/Ficha.css"),
    "utf-8"
  );
  // page.setContent() no tiene un documento base, así que una ruta relativa
  // como "/logo-lcb.png" no resuelve a nada — se incrusta el logo como
  // data: URI leyéndolo directo de public/, igual que el CSS.
  const markup = ReactDOMServer.renderToStaticMarkup(
    FichaDocument({ ficha, logoSrc: logoDataUri() })
  );

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>${css}</style>
  </head>
  <body>${markup}</body>
</html>`;
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");

  if (process.env.VERCEL) {
    const sparticuzChromium = (await import("@sparticuz/chromium")).default;
    return chromium.launch({
      args: sparticuzChromium.args,
      executablePath: await sparticuzChromium.executablePath(),
      headless: true,
    });
  }

  // Desarrollo local: usa el Chromium completo instalado por `playwright install`.
  return chromium.launch({ headless: true });
}

export async function renderFichaPdf(ficha: FichaData): Promise<Buffer> {
  const html = buildHtml(ficha);
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      printBackground: true,
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
