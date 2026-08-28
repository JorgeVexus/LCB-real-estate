import type { NextApiRequest, NextApiResponse } from "next";
import { renderFichaPdf } from "@/lib/pdf-render";
import { sanitizeFileName } from "@/lib/filename";
import type { FichaData } from "@/types/ficha";

// Ruta con el Pages Router (no App Router) a propósito: `renderFichaPdf` usa
// `react-dom/server` para convertir el componente de la ficha en HTML antes
// de imprimirlo con Playwright, y React bloquea ese import dentro del grafo
// de módulos "react-server" que usan los Route Handlers de app/. Las API
// Routes del Pages Router corren como Node.js plano, sin esa restricción.
export const config = {
  api: {
    responseLimit: false,
    // El default (1mb) se queda corto en cuanto la ficha trae una imagen de
    // mapa personalizada o planos adjuntos como data URLs.
    bodyParser: { sizeLimit: "30mb" },
  },
  // Nunca se había puesto explícito -- el default de Vercel puede ser
  // demasiado corto para Chromium (cold start + 9 fotos + impresión).
  maxDuration: 60,
};

function asciiFallback(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // El editor manda la ficha como un <form> normal (campo "ficha" con el
  // JSON como texto) en vez de fetch+JSON, porque Safari/iOS no maneja bien
  // la descarga vía blob: -- ver el comentario en la página del editor.
  const ficha = (
    typeof req.body?.ficha === "string" ? JSON.parse(req.body.ficha) : req.body
  ) as FichaData;
  const pdf = await renderFichaPdf(ficha);
  const filename = `${sanitizeFileName(ficha.fileName || ficha.publicId)}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  // filename= es el fallback ASCII para clientes viejos; filename*= (UTF-8,
  // percent-encoded) es lo que usan los navegadores modernos para respetar
  // acentos/espacios/comas tal cual, ej. "Bodega Tultitlán 7,439m2 LCB.pdf".
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiFallback(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.status(200).send(pdf);
}
