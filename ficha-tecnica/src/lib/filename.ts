const BUILDING_TYPES = ["Bodega", "Nave Industrial", "Nave", "Terreno", "Edificio", "Local", "Oficina"];

/**
 * Arma "Bodega Tultitlán 7,439m2 LCB" a partir del título de EasyBroker
 * ("Bodega en Renta Tultitlán en Parque Industrial | Ocupación Inmediata")
 * y el área. Best-effort -- por eso el nombre queda editable en el editor,
 * por si el título no sigue el patrón usual.
 */
export function buildDefaultFileName(title: string, areaLabel: string): string {
  const tipo = BUILDING_TYPES.find((t) => title.toLowerCase().startsWith(t.toLowerCase())) ?? title.split(" ")[0];

  let resto = title.slice(tipo.length).trim();
  resto = resto.replace(/^en\s+(renta|venta)\s+/i, "");
  resto = resto.split("|")[0].trim();
  resto = resto.replace(/\s+en\s+parque\s+industrial\s*$/i, "").trim();

  const areaMatch = areaLabel.match(/^([\d,.]+)/);
  const areaNum = areaMatch ? areaMatch[1] : "";

  return [tipo, resto, areaNum ? `${areaNum}m2` : null, "LCB"].filter(Boolean).join(" ");
}

/** Quita caracteres inválidos en nombres de archivo, sin tocar acentos/comas/espacios. */
export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || "ficha";
}
