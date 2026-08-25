export interface DescriptionBullet {
  label: string;
  value: string;
}

export interface DescriptionSection {
  /** Identidad fija (PRECIO, MEDIDAS, ...) -- de esto dependen el mapeo de
   * columnas y el bullet de Garantía. Nunca se edita. */
  key: SectionTitle;
  /** Rótulo visible en la ficha; editable por el asesor, empieza igual a `key`. */
  title: string;
  bullets: DescriptionBullet[];
}

const SECTION_TITLES = [
  "PRECIO",
  "MEDIDAS",
  "CARGA Y DESCARGA",
  "MATERIALES",
  "SERVICIOS",
  "FECHAS",
  "REQUISITOS",
] as const;

export type SectionTitle = (typeof SECTION_TITLES)[number];

/** "· Garantía: ..." se extrae aparte (dropdown de opciones fijas), nunca como bullet libre. */
export const GARANTIA_LABEL_RE = /garant[ií]a/i;

function looksLikeMeasurement(value: string): boolean {
  return /\d\s*(m2|m²|m\b|mts?\b|tons?\/m2)/i.test(value) && !/\$/.test(value);
}

/** Which section each known EasyBroker description label belongs to, matching the Figma layout. */
function sectionFor(label: string, value: string): SectionTitle {
  const l = label.toLowerCase();

  if (
    /^(precio|renta|venta) de/.test(l) ||
    l.includes("cuota de mantenimiento") ||
    l.includes("cuota del nnn") ||
    l.includes("mensualidad total")
  ) {
    return "PRECIO";
  }

  if (
    l.includes("área total construida") ||
    l.includes("area total construida") ||
    l.includes("área de bodega") ||
    l.includes("area de bodega") ||
    l.includes("área de mezzanine") ||
    l.includes("area de mezzanine") ||
    l.includes("área de mezanine") ||
    l.includes("area de mezanine") ||
    l.includes("área de oficinas") ||
    l.includes("area de oficinas") ||
    l.includes("área de patio") ||
    l.includes("area de patio") ||
    l.includes("área de terreno") ||
    l.includes("area de terreno") ||
    l === "fondo" ||
    l === "frente" ||
    l === "largo" ||
    l === "ancho" ||
    l.includes("profundidad") ||
    l.includes("claro entre columnas") ||
    l.includes("separación entre columnas") ||
    l.includes("separacion entre columnas") ||
    l.includes("número de columnas") ||
    l.includes("numero de columnas") ||
    l.includes("altura máxima") ||
    l.includes("altura maxima") ||
    l.includes("altura libre") ||
    l.includes("altura mínima") ||
    l.includes("altura minima") ||
    l.includes("resistencia de piso") ||
    l.includes("resistencia del piso")
  ) {
    return "MEDIDAS";
  }

  if (
    l.includes("andenes") ||
    l.includes("rampas vehiculares") ||
    l.includes("rampa o acceso") ||
    l.includes("estacionamientos") ||
    l.includes("cajones de estacionamiento") ||
    l.includes("patio de maniobras")
  ) {
    return "CARGA Y DESCARGA";
  }

  if (
    l.includes("tipo de techo") ||
    l.includes("tipo de muro") ||
    l.includes("luz natural") ||
    l.includes("knock-out") ||
    l.includes("knock out")
  ) {
    return "MATERIALES";
  }

  if (
    l.includes("dentro de parque") ||
    l.includes("vigilancia") ||
    l.includes("sistema contra incendios") ||
    l.includes("luminarias") ||
    l === "baños" ||
    l.includes("baños") ||
    l.includes("subestación") ||
    l.includes("subestacion")
  ) {
    return "SERVICIOS";
  }

  if (
    l.includes("disponible a partir de") ||
    l.includes("antigüedad") ||
    l.includes("antiguedad") ||
    l.includes("año de construcción") ||
    l.includes("ano de construccion")
  ) {
    return "FECHAS";
  }

  // Última red de seguridad antes de caer en REQUISITOS: cualquier bullet
  // con unidades de medida (m, m2, m², tons/m2) que no haya calzado con
  // ninguna etiqueta conocida de arriba es casi siempre una medida, no un
  // requisito -- evita que "Largo", "Knock-Outs", etc. (variantes que
  // EasyBroker no siempre nombra igual) se cuelen en la sección equivocada.
  if (looksLikeMeasurement(value)) {
    return "MEDIDAS";
  }

  // Plazo mínimo de renta, fiador y cualquier bullet realmente no
  // reconocido caen aquí para no perder información del texto original.
  return "REQUISITOS";
}

/**
 * Convierte el campo `description` de EasyBroker (bullets "· Label: Value" en
 * texto libre) en las 7 secciones editables que muestra el diseño de Figma,
 * más el valor de "Garantía" por separado (se muestra como dropdown de
 * opciones fijas, no como bullet libre).
 * Best-effort: el formato varía entre listados, así que el asesor debe
 * revisar y puede editar/agregar/quitar cualquier bullet en el editor.
 */
export function parseDescriptionSections(description: string): {
  sections: DescriptionSection[];
  garantiaText: string | null;
} {
  const sections = new Map<SectionTitle, DescriptionBullet[]>(
    SECTION_TITLES.map((title) => [title, []])
  );

  const bullets = description.split("·").slice(1);
  let garantiaText: string | null = null;

  for (const raw of bullets) {
    const idx = raw.indexOf(":");
    if (idx === -1) continue;
    const label = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).split("\n")[0].trim();
    if (!label || !value) continue;

    if (GARANTIA_LABEL_RE.test(label)) {
      garantiaText = value;
      continue;
    }

    sections.get(sectionFor(label, value))!.push({ label, value });
  }

  return {
    sections: SECTION_TITLES.map((key) => ({ key, title: key, bullets: sections.get(key)! })),
    garantiaText,
  };
}
