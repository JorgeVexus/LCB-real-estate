export interface DescriptionBullet {
  label: string;
  value: string;
}

export interface DescriptionSection {
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

/** Which section each known EasyBroker description label belongs to, matching the Figma layout. */
function sectionFor(label: string): SectionTitle {
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
    l.includes("área de mezanine") ||
    l.includes("area de mezanine") ||
    l.includes("área de oficinas") ||
    l.includes("area de oficinas") ||
    l === "fondo" ||
    l === "frente" ||
    l.includes("altura máxima") ||
    l.includes("altura maxima") ||
    l.includes("altura libre") ||
    l.includes("altura mínima") ||
    l.includes("altura minima") ||
    l.includes("resistencia de piso")
  ) {
    return "MEDIDAS";
  }

  if (
    l.includes("andenes") ||
    l.includes("rampas vehiculares") ||
    l.includes("rampa o acceso") ||
    l.includes("estacionamientos") ||
    l.includes("patio de maniobras")
  ) {
    return "CARGA Y DESCARGA";
  }

  if (l.includes("tipo de techo") || l.includes("tipo de muro") || l.includes("luz natural")) {
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

  if (l.includes("disponible a partir de") || l.includes("antigüedad") || l.includes("antiguedad")) {
    return "FECHAS";
  }

  // Plazo mínimo de renta, fiador, y cualquier bullet no reconocido caen aquí
  // para no perder información del texto original de EasyBroker.
  return "REQUISITOS";
}

/**
 * Convierte el campo `description` de EasyBroker (bullets "· Label: Value" en
 * texto libre) en las 7 secciones editables que muestra el diseño de Figma.
 * Best-effort: el formato varía entre listados, así que el asesor debe
 * revisar y puede editar/agregar/quitar cualquier bullet en el editor.
 */
export function parseDescriptionSections(description: string): DescriptionSection[] {
  const sections = new Map<SectionTitle, DescriptionBullet[]>(
    SECTION_TITLES.map((title) => [title, []])
  );

  const bullets = description.split("·").slice(1);

  for (const raw of bullets) {
    const idx = raw.indexOf(":");
    if (idx === -1) continue;
    const label = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).split("\n")[0].trim();
    if (!label || !value) continue;

    sections.get(sectionFor(label))!.push({ label, value });
  }

  return SECTION_TITLES.map((title) => ({ title, bullets: sections.get(title)! }));
}
