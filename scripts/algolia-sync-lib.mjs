import { WebflowClient } from "webflow-api";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

export const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
export const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_API_KEY;
export const ALGOLIA_INDEX = process.env.ALGOLIA_INDEX_NAME;
export const COLLECTION_ID = process.env.WEBFLOW_PROPERTIES_COLLECTION_ID;
export const PROPERTY_TYPES_COLLECTION_ID = process.env.WEBFLOW_PROPERTY_TYPES_COLLECTION_ID;
export const UBICACIONES_COLLECTION_ID = process.env.WEBFLOW_UBICACIONES_COLLECTION_ID;

export const wf = new WebflowClient({ accessToken: process.env.WEBFLOW_API_TOKEN });

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callWithRetry(fn, retries = 6) {
  try {
    return await fn();
  } catch (err) {
    const status = err?.statusCode ?? err?.status;
    if (status && [429, 500, 502, 503, 504].includes(status) && retries > 0) {
      await sleep(2500);
      return callWithRetry(fn, retries - 1);
    }
    throw err;
  }
}

export async function listAllItems(collectionId) {
  const items = [];
  let offset = 0;
  while (true) {
    const page = await callWithRetry(() => wf.collections.items.listItems(collectionId, { limit: 100, offset }));
    items.push(...(page.items ?? []));
    if ((page.items ?? []).length < 100) break;
    offset += 100;
  }
  return items;
}

export async function getCollectionFieldMap(collectionId) {
  const collection = await callWithRetry(() => wf.collections.get(collectionId));
  const map = new Map();
  for (const field of collection.fields ?? []) {
    map.set(field.slug, field);
  }
  return map;
}

export function buildOptionNameMap(field) {
  const map = new Map();
  for (const opt of field?.validations?.options ?? []) {
    map.set(opt.id, opt.name);
  }
  return map;
}

/** Builds an Algolia record from a Webflow item's current fieldData. */
export function buildAlgoliaRecord(item, lookups) {
  const fd = item.fieldData;
  const metros = parseFloat(fd["metros-cuadrados"]) || 0;
  const precio = parseFloat(String(fd["precio-de-propiedad"] ?? "").replace(/[^0-9.]/g, "")) || 0;

  return {
    objectID: item.id,
    name: fd["nombre-publico"] ?? fd.name,
    slug: fd.slug,
    featuredImageUrl: fd["featured-image"]?.url ?? null,
    galleryImages: (fd.gallery ?? []).map((g) => g.url),
    precioDisplay: fd["precio-de-propiedad"] ?? "",
    precioNumerico: precio,
    locationFull: fd["location-full"] ?? "",
    metrosDisplay: metros.toLocaleString("es-MX"),
    metrosNumerico: metros,
    currency: lookups.currency.get(fd.currency) ?? fd.currency ?? "",
    operationType: lookups.operationType.get(fd["operation-type"]) ?? fd["operation-type"] ?? "",
    propertyType: lookups.propertyType.get(fd["property-type"]) ?? fd["property-type"] ?? "",
    city: lookups.city.get(fd.city) ?? fd.city ?? "",
    bedrooms: fd.bedrooms ?? 0,
    bathrooms: fd.bathrooms ?? 0,
    parking: fd.parking ?? 0,
    andenes: fd.andenes ?? 0,
    destacada: fd.destacada ?? false,
    pageUrl: `/propiedades/${fd.slug}`,
    createdOn: item.createdOn ? new Date(item.createdOn).getTime() : Date.now(),
    lastPublished: item.lastPublished ? new Date(item.lastPublished).getTime() : Date.now(),
    cmsOrder: 0,
  };
}

export async function algoliaBatch(requests) {
  const res = await fetch(`https://${ALGOLIA_APP_ID}.algolia.net/1/indexes/${ALGOLIA_INDEX}/batch`, {
    method: "POST",
    headers: {
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "X-Algolia-API-Key": ALGOLIA_ADMIN_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Algolia batch error ${res.status}: ${JSON.stringify(body)}`);
  return body;
}
