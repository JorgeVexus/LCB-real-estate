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
  },
};

function asciiFallback(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ficha = req.body as FichaData;
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
