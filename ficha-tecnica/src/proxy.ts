import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSession(session)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Deja pasar sin sesión: /login, /api/login, los internos de Next, y
  // cualquier archivo estático servido tal cual desde public/ (logo, íconos,
  // etc.) -- si no, el <img> del logo carga el HTML de /login en vez de la
  // imagen.
  matcher: ["/((?!login|api/login|_next/static|_next/image|.*\\.[\\w]+$).*)"],
};
