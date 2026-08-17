import type { NextApiRequest, NextApiResponse } from "next";
import { renderFichaPdf } from "@/lib/pdf-render";
import { slugifyFileName } from "@/lib/slugify-filename";
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ficha = req.body as FichaData;
  const pdf = await renderFichaPdf(ficha);
  const filename = `${slugifyFileName(ficha.title)}-${ficha.publicId}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(pdf);
}
