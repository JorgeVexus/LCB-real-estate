const SI_NO: Record<string, { si: string; no: string }> = {
  "patio-de-maniobras": { si: "50ceab92a699d9d65598c30a143a6840", no: "239ea6ed6baecab00fb51d75dc6e0893" },
  "dentro-de-parque": { si: "c676bdbddc2dbce9ff27e452a24f23f9", no: "7d38b7b1cbe52ca457d2e49bddb7a678" },
  "vigilancia-24-7": { si: "00d3691453e2b70ebc49ac67ac8334de", no: "06ceb335bceacbea6cf634bd5398a3de" },
  "rampa-o-acceso-vehicular": { si: "18121123f0070307e7b995c71af12008", no: "9181f1514db6894a97dfa8133044ea54" },
  luminarias: { si: "018de6bb4704306ed4f7e511bef3743b", no: "3b3ea75befe4c4a4fee90067782cc7e9" },
  banos: { si: "920a7b19d457b1826de2467eb24519da", no: "9c87523ed43559e7a10220209cf72938" },
};

function siNoId(field: string, value: string): string | null {
  const v = value.trim().toLowerCase();
  const opts = SI_NO[field];
  if (v.startsWith("sí") || v.startsWith("si")) return opts.si;
  if (v.startsWith("no")) return opts.no;
  return null; // ambiguous (e.g. "A solicitud del cliente") -> leave unset
}

/**
 * Best-effort extraction of the "· Label: Value" spec bullets EasyBroker
 * packs into its free-text description (andenes, tipo de techo, resistencia
 * de piso, etc.) — none of these are exposed as structured API fields.
 * Only used when CREATING a new property, never on updates, so it can never
 * overwrite a value a human already curated in Webflow. Formatting varies
 * across listings, so this is a best effort — spot-check new properties.
 */
export function parseDescriptionFields(description: string): Record<string, unknown> {
  const fieldData: Record<string, unknown> = {};
  const bullets = description.split("·").slice(1); // first chunk is prose before the first bullet

  let alturaMaxima: string | null = null;
  let alturaLibre: string | null = null;

  for (const raw of bullets) {
    const idx = raw.indexOf(":");
    if (idx === -1) continue;
    const label = raw.slice(0, idx).trim().toLowerCase();
    const value = raw.slice(idx + 1).split("\n")[0].trim();
    if (!value) continue;

    if (label === "andenes" || label.includes("andenes")) {
      const n = parseInt(value, 10);
      if (!Number.isNaN(n)) fieldData.andenes = n;
    } else if (label.includes("rampas vehiculares")) {
      const n = parseInt(value, 10);
      if (!Number.isNaN(n)) fieldData["rampas-vehiculares"] = n;
    } else if (label.includes("rampa o acceso")) {
      const id = siNoId("rampa-o-acceso-vehicular", value);
      if (id) fieldData["rampa-o-acceso-vehicular"] = id;
    } else if (label.includes("patio de maniobras")) {
      const id = siNoId("patio-de-maniobras", value);
      if (id) fieldData["patio-de-maniobras"] = id;
    } else if (label.includes("tipo de techo")) {
      fieldData["tipo-de-techo"] = value;
    } else if (label.includes("tipo de muro")) {
      fieldData["tipo-de-muro"] = value;
    } else if (label.includes("luz natural")) {
      fieldData["luz-natural"] = value;
    } else if (label.includes("dentro de parque")) {
      const id = siNoId("dentro-de-parque", value);
      if (id) fieldData["dentro-de-parque"] = id;
    } else if (label.includes("vigilancia")) {
      const id = siNoId("vigilancia-24-7", value);
      if (id) fieldData["vigilancia-24-7"] = id;
    } else if (label.includes("sistema contra incendios")) {
      fieldData["sistema-contra-incendios"] = value;
    } else if (label.includes("luminarias")) {
      const id = siNoId("luminarias", value);
      if (id) fieldData.luminarias = id;
    } else if (label === "baños" || label.includes("baños")) {
      const id = siNoId("banos", value);
      if (id) fieldData.banos = id;
    } else if (label.includes("subestación") || label.includes("subestacion")) {
      fieldData["subestacion-electrica"] = value;
    } else if (label.includes("resistencia de piso")) {
      fieldData["resistencia-de-piso"] = value;
    } else if (label.includes("altura máxima") || label.includes("altura maxima")) {
      alturaMaxima = value;
    } else if (label.includes("altura libre") || label.includes("altura mínima")) {
      alturaLibre = value;
    } else if (label.includes("área de oficinas") || label.includes("area de oficinas")) {
      fieldData["area-de-oficinas"] = value;
    } else if (label.includes("disponible a partir de")) {
      fieldData["disponible-desde"] = value;
    } else if (label.includes("antigüedad") || label.includes("antiguedad")) {
      fieldData["ano-de-construccion"] = value;
    } else if (label.includes("plazo mínimo de renta") || label.includes("plazo minimo de renta")) {
      fieldData["plazo-minimo-de-renta"] = value;
    } else if (label.includes("cuota de mantenimiento") || label.includes("cuota del nnn")) {
      fieldData["precio-de-mantenimiento-2"] = value;
    } else if (label.includes("mensualidad total")) {
      fieldData["mensualidad-total"] = value;
    } else if (/^(precio|renta|venta) de/.test(label) && !label.includes("mantenimiento")) {
      // Price-per-m2 isn't its own bullet — it's a "($X/m2)" aside on the
      // main price/rent/sale line. Truncated to match existing data (e.g. 213.68 -> 213).
      const m = value.match(/\(\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:usd|mxn)?\s*\/\s*m2\s*\)/i);
      if (m) fieldData["precio-por-m2"] = Math.trunc(parseFloat(m[1].replace(/,/g, "")));
    }
  }

  if (alturaMaxima) fieldData["altura-libre"] = alturaMaxima;
  else if (alturaLibre) fieldData["altura-libre"] = alturaLibre;

  return fieldData;
}
