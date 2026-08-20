/** Opciones fijas de "Garantía" en REQUISITOS -- ya no es texto libre. */
export const GARANTIA_OPTIONS = [
  "Corporativa",
  "Aval con Bien Inmueble libre de gravamen en CDMX o área Metropolitana con valor de un año de contrato",
  "Aval con Bien Inmueble libre de gravamen en Guadalajara con valor de un año de contrato",
  "Aval con Bien Inmueble libre de gravamen en Monterrey con valor de un año de contrato",
  "Aval con Bien Inmueble libre de gravamen en Querétaro con valor de un año de contrato",
  "Aval con Bien Inmueble libre de gravamen en Puebla con valor de un año de contrato",
  "Obligado Solidario",
] as const;

/** Intenta emparejar el texto libre que traía EasyBroker con una opción fija. */
export function matchGarantiaOption(text: string | null): string | null {
  if (!text) return null;
  const normalized = text.trim().toLowerCase();
  const exact = GARANTIA_OPTIONS.find((opt) => opt.toLowerCase() === normalized);
  if (exact) return exact;

  if (normalized.includes("corporativa")) return "Corporativa";
  if (normalized.includes("solidario")) return "Obligado Solidario";
  if (normalized.includes("cdmx") || normalized.includes("metropolitana")) {
    return "Aval con Bien Inmueble libre de gravamen en CDMX o área Metropolitana con valor de un año de contrato";
  }
  if (normalized.includes("guadalajara")) {
    return "Aval con Bien Inmueble libre de gravamen en Guadalajara con valor de un año de contrato";
  }
  if (normalized.includes("monterrey")) {
    return "Aval con Bien Inmueble libre de gravamen en Monterrey con valor de un año de contrato";
  }
  if (normalized.includes("querétaro") || normalized.includes("queretaro")) {
    return "Aval con Bien Inmueble libre de gravamen en Querétaro con valor de un año de contrato";
  }
  if (normalized.includes("puebla")) {
    return "Aval con Bien Inmueble libre de gravamen en Puebla con valor de un año de contrato";
  }
  return null;
}
