import { FichaPage1 } from "./FichaPage1";
import { FichaPage2Gallery } from "./FichaPage2Gallery";
import type { FichaData } from "@/types/ficha";

/**
 * Fuente única de verdad del documento: el preview en pantalla y el HTML que
 * se imprime a PDF renderizan exactamente este mismo componente.
 *
 * `logoSrc` se pasa explícito (en vez de que cada header resuelva su propio
 * default) porque el render a PDF necesita un data: URI del logo -- ver
 * src/lib/pdf-render.ts -- mientras que el preview en pantalla usa la ruta
 * estática normal servida por Next.
 */
export function FichaDocument({ ficha, logoSrc }: { ficha: FichaData; logoSrc?: string }) {
  return (
    <>
      <FichaPage1 ficha={ficha} logoSrc={logoSrc} />
      <FichaPage2Gallery ficha={ficha} logoSrc={logoSrc} />
    </>
  );
}
