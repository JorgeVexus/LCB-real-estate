import { WebflowItemSummary } from "./webflow";

function env(): { appId: string; adminKey: string; index: string } {
  const appId = process.env.ALGOLIA_APP_ID;
  const adminKey = process.env.ALGOLIA_ADMIN_API_KEY;
  const index = process.env.ALGOLIA_INDEX_NAME;
  if (!appId || !adminKey || !index) {
    throw new Error("Missing ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY / ALGOLIA_INDEX_NAME env vars");
  }
  return { appId, adminKey, index };
}

export interface AlgoliaNameLookups {
  currency: Map<string, string>;
  operationType: Map<string, string>;
  propertyType: Map<string, string>;
  city: Map<string, string>;
}

export interface AlgoliaRecord {
  objectID: string;
  name: string;
  slug: string;
  featuredImageUrl: string | null;
  galleryImages: string[];
  precioDisplay: string;
  precioNumerico: number;
  locationFull: string;
  metrosDisplay: string;
  metrosNumerico: number;
  currency: string;
  operationType: string;
  propertyType: string;
  city: string;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  andenes: number;
  destacada: boolean;
  pageUrl: string;
  createdOn: number;
  lastPublished: number;
  cmsOrder: number;
}

/**
 * Builds an Algolia search-index record from a live Webflow item, matching
 * the exact field shape the site's /propiedades listing page expects
 * (see the inline Algolia script in the site's custom code).
 */
export function buildAlgoliaRecord(
  item: { id: string; createdOn?: string; lastPublished?: string | null; fieldData: Record<string, unknown> },
  lookups: AlgoliaNameLookups
): AlgoliaRecord {
  const fd = item.fieldData;
  const metros = parseFloat(String(fd["metros-cuadrados"] ?? "")) || 0;
  const precio = parseFloat(String(fd["precio-de-propiedad"] ?? "").replace(/[^0-9.]/g, "")) || 0;
  const slug = String(fd.slug ?? "");

  const idOrName = (map: Map<string, string>, value: unknown): string => {
    const key = String(value ?? "");
    return map.get(key) ?? key;
  };

  const featured = fd["featured-image"] as { url?: string } | undefined;
  const gallery = (fd.gallery as { url?: string }[] | undefined) ?? [];

  return {
    objectID: item.id,
    name: String(fd["nombre-publico"] ?? fd.name ?? ""),
    slug,
    featuredImageUrl: featured?.url ?? null,
    galleryImages: gallery.map((g) => g.url).filter((u): u is string => Boolean(u)),
    precioDisplay: String(fd["precio-de-propiedad"] ?? ""),
    precioNumerico: precio,
    locationFull: String(fd["location-full"] ?? ""),
    metrosDisplay: metros.toLocaleString("es-MX"),
    metrosNumerico: metros,
    currency: idOrName(lookups.currency, fd.currency),
    operationType: idOrName(lookups.operationType, fd["operation-type"]),
    propertyType: idOrName(lookups.propertyType, fd["property-type"]),
    city: idOrName(lookups.city, fd.city),
    bedrooms: Number(fd.bedrooms ?? 0),
    bathrooms: Number(fd.bathrooms ?? 0),
    parking: Number(fd.parking ?? 0),
    andenes: Number(fd.andenes ?? 0),
    destacada: Boolean(fd.destacada ?? false),
    pageUrl: `/propiedades/${slug}`,
    createdOn: item.createdOn ? new Date(item.createdOn).getTime() : Date.now(),
    lastPublished: item.lastPublished ? new Date(item.lastPublished).getTime() : Date.now(),
    cmsOrder: 0,
  };
}

export function buildNameLookups(
  fieldMap: Map<string, { options?: { id: string; name: string }[] }>,
  propertyTypeItems: WebflowItemSummary[],
  ubicacionItems: WebflowItemSummary[]
): AlgoliaNameLookups {
  const optionMap = (field: { options?: { id: string; name: string }[] } | undefined) => {
    const m = new Map<string, string>();
    for (const opt of field?.options ?? []) m.set(opt.id, opt.name);
    return m;
  };

  return {
    currency: optionMap(fieldMap.get("currency")),
    operationType: optionMap(fieldMap.get("operation-type")),
    propertyType: new Map(propertyTypeItems.map((i) => [i.id, String(i.fieldData.name ?? "")])),
    city: new Map(ubicacionItems.map((i) => [i.id, String(i.fieldData.name ?? "")])),
  };
}

interface BatchRequest {
  action: "updateObject" | "deleteObject";
  body: { objectID: string } & Record<string, unknown>;
}

async function algoliaBatch(requests: BatchRequest[]): Promise<void> {
  if (requests.length === 0) return;
  const { appId, adminKey, index } = env();

  const chunkSize = 200;
  for (let i = 0; i < requests.length; i += chunkSize) {
    const chunk = requests.slice(i, i + chunkSize);
    const res = await fetch(`https://${appId}.algolia.net/1/indexes/${index}/batch`, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": appId,
        "X-Algolia-API-Key": adminKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests: chunk }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Algolia batch error ${res.status}: ${body}`);
    }
  }
}

/** Upserts (create or full replace) records in the Algolia index. */
export async function upsertAlgoliaRecords(records: AlgoliaRecord[]): Promise<void> {
  await algoliaBatch(records.map((r) => ({ action: "updateObject", body: r as unknown as Record<string, unknown> & { objectID: string } })));
}

/** Removes records from the Algolia index (used when a property is unpublished). */
export async function deleteAlgoliaRecords(objectIds: string[]): Promise<void> {
  await algoliaBatch(objectIds.map((id) => ({ action: "deleteObject", body: { objectID: id } })));
}
