// One-off backfill: fills the "disponible-desde" PlainText field (ligado al
// texto "Fecha de ocupación" en la página individual de propiedad) para
// propiedades existentes. src/lib/description-parser.ts ya sabe extraer este
// valor del bullet "Disponible a partir de" de la descripción, pero ese
// parser solo corre al CREAR una propiedad, nunca al actualizarla — así que
// toda propiedad sincronizada antes de que existiera ese campo (o cuya
// descripción no traía el bullet en ese momento) se quedó con el campo
// vacío. Esto es lo que causaba que "Fecha de ocupación" no se mostrara en
// la ficha individual: el binding en Webflow está bien configurado, solo
// falta el dato.
//
// Re-parsea el campo "descripcion" que ya está sincronizado en Webflow (misma
// lógica de bullets que description-parser.ts) en vez de volver a golpear la
// API de EasyBroker. Solo escribe el campo "disponible-desde", y solo en los
// items donde el valor recién parseado difiere del que ya está guardado —
// ningún otro campo se toca.
import fs from "node:fs";
import path from "node:path";
import { WebflowClient } from "webflow-api";

for (const line of fs.readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const wf = new WebflowClient({ accessToken: process.env.WEBFLOW_API_TOKEN });
const COLLECTION_ID = process.env.WEBFLOW_PROPERTIES_COLLECTION_ID;
const APPLY = process.argv.includes("--apply");

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
async function callWithRetry(fn, retries = 6) {
  try {
    return await fn();
  } catch (err) {
    const status = err?.statusCode ?? err?.status;
    if (status !== undefined && RETRYABLE.has(status) && retries > 0) {
      await new Promise((r) => setTimeout(r, 2000 * (7 - retries)));
      return callWithRetry(fn, retries - 1);
    }
    throw err;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripHtml(html) {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Mirrors the "disponible a partir de" bullet logic in description-parser.ts.
function extractDisponibleDesde(descriptionHtml) {
  const text = stripHtml(descriptionHtml);
  const bullets = text.split("·").slice(1);

  for (const raw of bullets) {
    const idx = raw.indexOf(":");
    if (idx === -1) continue;
    const label = raw.slice(0, idx).trim().toLowerCase();
    const value = raw.slice(idx + 1).split("\n")[0].trim();
    if (!value) continue;
    if (label.includes("disponible a partir de") || label.includes("fecha de entrega")) return value;
  }
  return null;
}

async function listAllItems() {
  const results = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const page = await callWithRetry(() =>
      wf.collections.items.listItems(COLLECTION_ID, { limit, offset })
    );
    const items = page.items ?? [];
    results.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return results;
}

const items = await listAllItems();
console.log(`${items.length} properties total.\n`);

const results = [];
for (const [idx, item] of items.entries()) {
  const propertyId = item.fieldData?.["property-id"] ?? item.id;
  const label = `[${idx + 1}/${items.length}] ${propertyId}`;
  const current = item.fieldData?.["disponible-desde"] ?? null;
  const correct = extractDisponibleDesde(item.fieldData?.descripcion);

  if (correct == null) {
    results.push({ id: item.id, propertyId, current, correct: null, status: "no-match" });
    continue;
  }
  if (correct === current) {
    results.push({ id: item.id, propertyId, current, correct, status: "already-correct" });
    continue;
  }

  console.log(`${label} — disponible-desde: "${current}" -> "${correct}"`);
  results.push({ id: item.id, propertyId, current, correct, status: "mismatch" });

  if (APPLY) {
    try {
      await callWithRetry(() =>
        wf.collections.items.updateItem(COLLECTION_ID, item.id, {
          fieldData: { "disponible-desde": correct },
        })
      );
      await callWithRetry(() =>
        wf.collections.items.publishItem(COLLECTION_ID, { itemIds: [item.id] })
      );
      // Gentle pacing — this collection is also touched by the daily cron
      // sync and by the Designer/CMS API elsewhere, so avoid bursting.
      await sleep(300);
    } catch (err) {
      console.log(`${label} — ERROR: ${err.message}`);
      results.push({ id: item.id, propertyId, current, correct, status: "error", error: err.message });
    }
  }
}

fs.writeFileSync(
  "scripts/backfill-disponible-desde-results.json",
  JSON.stringify(results, null, 2)
);

const mismatch = results.filter((r) => r.status === "mismatch").length;
const alreadyOk = results.filter((r) => r.status === "already-correct").length;
const noMatch = results.filter((r) => r.status === "no-match").length;
const errored = results.filter((r) => r.status === "error").length;
console.log(
  `\nDone. mismatch=${mismatch} already-correct=${alreadyOk} no-bullet-in-description=${noMatch} errors=${errored}${
    APPLY ? " (applied + published)" : " (DRY RUN — pass --apply to write)"
  }`
);
