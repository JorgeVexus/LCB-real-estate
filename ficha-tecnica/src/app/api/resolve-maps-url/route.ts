import { NextResponse } from "next/server";

const ALLOWED_HOST_RE = /(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$/i;

/**
 * Sigue redirecciones de un link de Google Maps (típicamente un share link
 * corto de la app móvil, "maps.app.goo.gl/...") server-side, sin que el
 * navegador del asesor tenga que lidiar con CORS. El link corto no trae
 * coordenadas en el texto -- hay que resolver la redirección para llegar a
 * la URL larga que sí las trae.
 */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Falta el parámetro url" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  if (!ALLOWED_HOST_RE.test(parsed.hostname)) {
    return NextResponse.json({ error: "Solo se aceptan links de Google Maps" }, { status: 400 });
  }

  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    return NextResponse.json({ finalUrl: res.url });
  } catch {
    return NextResponse.json({ error: "No se pudo resolver el link" }, { status: 502 });
  }
}
