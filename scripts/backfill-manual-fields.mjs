import fs from "node:fs";
import { wf, COLLECTION_ID, callWithRetry, sleep } from "./algolia-sync-lib.mjs";

const SI_NO = {
  "patio-de-maniobras": { si: "50ceab92a699d9d65598c30a143a6840", no: "239ea6ed6baecab00fb51d75dc6e0893" },
  "dentro-de-parque": { si: "c676bdbddc2dbce9ff27e452a24f23f9", no: "7d38b7b1cbe52ca457d2e49bddb7a678" },
  "vigilancia-24-7": { si: "00d3691453e2b70ebc49ac67ac8334de", no: "06ceb335bceacbea6cf634bd5398a3de" },
  "rampa-o-acceso-vehicular": { si: "18121123f0070307e7b995c71af12008", no: "9181f1514db6894a97dfa8133044ea54" },
  luminarias: { si: "018de6bb4704306ed4f7e511bef3743b", no: "3b3ea75befe4c4a4fee90067782cc7e9" },
  banos: { si: "920a7b19d457b1826de2467eb24519da", no: "9c87523ed43559e7a10220209cf72938" },
};

function siNoId(field, value) {
  const v = value.trim().toLowerCase();
  const opts = SI_NO[field];
  if (v.startsWith("sí") || v.startsWith("si")) return opts.si;
  if (v.startsWith("no")) return opts.no;
  return null; // ambiguous (e.g. "A solicitud del cliente") -> leave unset
}

/** Parses "· Label: Value" bullets out of an EasyBroker free-text description. */
function parseDescriptionFields(description) {
  const fieldData = {};
  const bullets = description.split("·").slice(1); // first chunk is prose before first bullet

  let alturaMaxima = null;
  let alturaLibre = null;

  for (const raw of bullets) {
    const idx = raw.indexOf(":");
    if (idx === -1) continue;
    const label = raw.slice(0, idx).trim().toLowerCase();
    // Value runs until the next section header or end; take first line only.
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
    }
  }

  if (alturaMaxima) fieldData["altura-libre"] = alturaMaxima;
  else if (alturaLibre) fieldData["altura-libre"] = alturaLibre;

  return fieldData;
}

async function ebFetch(url, retries = 5) {
  const res = await fetch(url, {
    headers: { accept: "application/json", "X-Authorization": process.env.EASYBROKER_API_KEY },
  });
  if ((res.status === 429 || res.status >= 500) && retries > 0) {
    await sleep(2000);
    return ebFetch(url, retries - 1);
  }
  if (!res.ok) throw new Error(`EasyBroker ${res.status} on ${url}`);
  return res.json();
}

const newProps = JSON.parse(fs.readFileSync("scripts/new-properties-full.json", "utf8"));
const apply = process.argv.includes("--apply");

const results = [];
for (const prop of newProps) {
  const detail = await ebFetch(`https://api.easybroker.com/v1/properties/${prop.propertyId}`);
  const fieldData = parseDescriptionFields(detail.description ?? "");
  results.push({ propertyId: prop.propertyId, id: prop.id, fieldCount: Object.keys(fieldData).length, fieldData });
}

console.log(`Parsed ${results.length} properties.`);
console.log(
  "Fields found per property (sample):",
  JSON.stringify(results.slice(0, 3).map((r) => ({ propertyId: r.propertyId, fieldData: r.fieldData })), null, 2)
);
const avgFields = results.reduce((s, r) => s + r.fieldCount, 0) / results.length;
console.log("Average fields recognized per property:", avgFields.toFixed(1));

if (!apply) {
  console.log("\nDRY RUN — pass --apply to write these fields to Webflow.");
  fs.writeFileSync("scripts/backfill-preview.json", JSON.stringify(results, null, 2));
  process.exit(0);
}

let ok = 0;
let failed = 0;
for (const r of results) {
  if (r.fieldCount === 0) continue;
  try {
    await callWithRetry(() => wf.collections.items.updateItem(COLLECTION_ID, r.id, { fieldData: r.fieldData }));
    await callWithRetry(() => wf.collections.items.publishItem(COLLECTION_ID, { itemIds: [r.id] }));
    ok++;
    console.log(r.propertyId, "-> updated,", r.fieldCount, "fields");
  } catch (err) {
    failed++;
    console.log(r.propertyId, "-> ERROR:", err.message);
  }
}
console.log(`\nDone. Updated: ${ok}, failed: ${failed}`);
