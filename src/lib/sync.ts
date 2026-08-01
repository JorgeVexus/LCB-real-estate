import {
  fetchAllPublishedProperties,
  fetchPropertyDetailsConcurrently,
  EasyBrokerPropertyDetail,
} from "./easybroker";
import {
  getCollectionFieldMap,
  buildOptionLookup,
  listAllItems,
  createItemsBatched,
  updateItemsBatched,
  publishItemsBatched,
  unpublishItemsBatched,
  resolveOrCreateReferenceByName,
  WebflowItemSummary,
  ItemFieldData,
} from "./webflow";
import { slugify } from "./slugify";
import { buildAlgoliaRecord, buildNameLookups, upsertAlgoliaRecords, deleteAlgoliaRecords } from "./algolia";
import { parseDescriptionFields } from "./description-parser";

interface Env {
  propertiesCollectionId: string;
  propertyTypesCollectionId: string;
  agentesCollectionId: string;
  ubicacionesCollectionId: string;
}

function readEnv(): Env {
  const propertiesCollectionId = process.env.WEBFLOW_PROPERTIES_COLLECTION_ID;
  const propertyTypesCollectionId = process.env.WEBFLOW_PROPERTY_TYPES_COLLECTION_ID;
  const agentesCollectionId = process.env.WEBFLOW_AGENTES_COLLECTION_ID;
  const ubicacionesCollectionId = process.env.WEBFLOW_UBICACIONES_COLLECTION_ID;
  if (
    !propertiesCollectionId ||
    !propertyTypesCollectionId ||
    !agentesCollectionId ||
    !ubicacionesCollectionId
  ) {
    throw new Error("Missing one or more WEBFLOW_*_COLLECTION_ID env vars");
  }
  return { propertiesCollectionId, propertyTypesCollectionId, agentesCollectionId, ubicacionesCollectionId };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toParagraphHtml(text: string): string {
  const collapsed = text.replace(/\s*\n+\s*/g, " ").trim();
  return `<p>${escapeHtml(collapsed)}</p>`;
}

function mapsLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

function mapsEmbedHtml(lat: number, lng: number): string {
  return `<figure class="w-richtext-figure-type-video w-richtext-align-center" style="padding-bottom:" data-rt-type="video" data-rt-align="center" data-rt-max-width="" data-rt-max-height="" data-rt-dimensions="" data-page-url=""><div><iframe src="https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed" allowfullscreen=""></iframe></div></figure>`;
}

/** "Neighborhood, Municipality, State" -> [municipality, state], most specific first. */
function locationCandidates(locationName: string): string[] {
  const parts = locationName.split(",").map((p) => p.trim()).filter(Boolean);
  const candidates: string[] = [];
  if (parts.length >= 2) candidates.push(parts[parts.length - 2]);
  if (parts.length >= 1) candidates.push(parts[parts.length - 1]);
  return candidates;
}

export interface SyncResult {
  publishedInEasyBroker: number;
  created: number;
  updated: number;
  unpublished: number;
  createdReferences: { propertyTypes: string[]; agentes: string[]; ubicaciones: string[] };
  errors: { publicId: string; message: string }[];
  durationMs: number;
  dryRun: boolean;
}

export interface SyncOptions {
  /** When true, computes the full diff and resolves references read-only, without writing anything to Webflow. */
  dryRun?: boolean;
  /**
   * Limits processing to the first N published EasyBroker properties — for
   * testing create/update on a small sample against the live site. The
   * unpublish step is always skipped when a limit is set, since a partial
   * EasyBroker list would otherwise look like everything else was delisted.
   */
  limit?: number;
}

export async function runSync(options: SyncOptions = {}): Promise<SyncResult> {
  const { dryRun = false, limit } = options;
  const start = Date.now();
  const env = readEnv();
  const errors: SyncResult["errors"] = [];

  const [allListItems, existingPropertyItems, propertyTypeItems, agenteItems, ubicacionItems, fieldMap] =
    await Promise.all([
      fetchAllPublishedProperties(),
      listAllItems(env.propertiesCollectionId),
      listAllItems(env.propertyTypesCollectionId),
      listAllItems(env.agentesCollectionId),
      listAllItems(env.ubicacionesCollectionId),
      getCollectionFieldMap(env.propertiesCollectionId),
    ]);

  const listItems = limit ? allListItems.slice(0, limit) : allListItems;

  const currencyLookup = buildOptionLookup(fieldMap.get("currency"));
  const operationTypeLookup = buildOptionLookup(fieldMap.get("operation-type"));

  const details = await fetchPropertyDetailsConcurrently(listItems.map((p) => p.public_id));

  const wfByPropertyId = new Map<string, WebflowItemSummary>();
  for (const item of existingPropertyItems) {
    const key = String(item.fieldData["property-id"] ?? "").trim();
    if (key) wfByPropertyId.set(key, item);
  }

  const createdReferences = { propertyTypes: [] as string[], agentes: [] as string[], ubicaciones: [] as string[] };

  const toCreate: { publicId: string; fieldData: ItemFieldData }[] = [];
  const toUpdate: { publicId: string; id: string; fieldData: Record<string, unknown> }[] = [];

  for (const publicId of listItems.map((p) => p.public_id)) {
    const detail = details.get(publicId);
    if (!detail) {
      errors.push({ publicId, message: "No detail response from EasyBroker" });
      continue;
    }

    try {
      const fieldData = await buildFieldData(detail, env, {
        propertyTypeItems,
        agenteItems,
        ubicacionItems,
        currencyLookup,
        operationTypeLookup,
        createdReferences,
        dryRun,
      });

      const existing = wfByPropertyId.get(publicId);
      if (existing) {
        // Never touch slug on update — it's the item's live URL. Changing it
        // breaks bookmarks, shared links, and search-indexed pages. Also
        // never re-run the description parser here — it would clobber
        // whatever a human has already corrected in Webflow.
        const { slug: _slug, ...fieldDataWithoutSlug } = fieldData;
        toUpdate.push({ publicId, id: existing.id, fieldData: fieldDataWithoutSlug });
      } else {
        // New property: best-effort fill the spec fields EasyBroker doesn't
        // expose structurally (andenes, tipo de techo, etc.) by parsing its
        // free-text description. Formatting varies across listings, so this
        // is approximate — new properties should be spot-checked in Webflow.
        const parsedSpecs = detail.description ? parseDescriptionFields(detail.description) : {};
        toCreate.push({ publicId, fieldData: { ...fieldData, ...parsedSpecs } });
      }
    } catch (err) {
      errors.push({ publicId, message: (err as Error).message });
    }
  }

  const publishedPublicIds = new Set(allListItems.map((p) => p.public_id));
  const toUnpublish = limit
    ? []
    : existingPropertyItems.filter((item) => {
        const key = String(item.fieldData["property-id"] ?? "").trim();
        return key && !publishedPublicIds.has(key) && !item.isDraft && !item.isArchived;
      });

  let createdIds: string[] = [];
  if (!dryRun) {
    const createResult = await createItemsBatched(
      env.propertiesCollectionId,
      toCreate.map((c) => ({ fieldData: c.fieldData }))
    );
    createdIds = createResult.createdIds;
    for (const f of createResult.failures) {
      errors.push({ publicId: String(f.input.fieldData["property-id"]), message: f.message });
    }

    const updateResult = await updateItemsBatched(
      env.propertiesCollectionId,
      toUpdate.map((u) => ({ id: u.id, fieldData: u.fieldData }))
    );
    for (const f of updateResult.failures) {
      errors.push({ publicId: f.input.id, message: `Update failed: ${f.message}` });
    }

    const toPublishIds = [...createdIds, ...toUpdate.map((u) => u.id)];
    const publishResult = await publishItemsBatched(env.propertiesCollectionId, toPublishIds);
    for (const f of publishResult.failures) {
      errors.push({ publicId: f.input.join(","), message: `Publish batch failed: ${f.message}` });
    }

    const unpublishResult = await unpublishItemsBatched(
      env.propertiesCollectionId,
      toUnpublish.map((i) => i.id),
      "propiedades-similares"
    );
    for (const f of unpublishResult.failures) {
      errors.push({ publicId: f.input, message: `Unpublish failed: ${f.message}` });
    }

    // Keep the Algolia search index (used by the /propiedades listing page)
    // in step with Webflow: new/updated properties get upserted, unpublished
    // ones get removed outright so they can't linger as "zombie" cards. This
    // mirrors Webflow's own draft/live state rather than depending on it, so
    // a failure here is logged but never aborts the Webflow-side sync.
    try {
      const unpublishedFailedIds = new Set(unpublishResult.failures.map((f) => f.input));
      const algoliaDeleteIds = toUnpublish.map((i) => i.id).filter((id) => !unpublishedFailedIds.has(id));
      if (algoliaDeleteIds.length > 0) {
        await deleteAlgoliaRecords(algoliaDeleteIds);
      }

      const touchedIds = new Set([...createdIds, ...toUpdate.map((u) => u.id)]);
      if (touchedIds.size > 0) {
        const refreshedItems = await listAllItems(env.propertiesCollectionId);
        const lookups = buildNameLookups(fieldMap, propertyTypeItems, ubicacionItems);
        const records = refreshedItems
          .filter((item) => touchedIds.has(item.id))
          .map((item) => buildAlgoliaRecord(item, lookups));
        await upsertAlgoliaRecords(records);
      }
    } catch (err) {
      errors.push({ publicId: "algolia", message: `Algolia sync failed: ${(err as Error).message}` });
    }
  }

  return {
    publishedInEasyBroker: allListItems.length,
    created: dryRun ? toCreate.length : createdIds.length,
    updated: toUpdate.length,
    unpublished: toUnpublish.length,
    createdReferences,
    errors,
    durationMs: Date.now() - start,
    dryRun,
  };
}

async function buildFieldData(
  detail: EasyBrokerPropertyDetail,
  env: Env,
  ctx: {
    propertyTypeItems: WebflowItemSummary[];
    agenteItems: WebflowItemSummary[];
    ubicacionItems: WebflowItemSummary[];
    currencyLookup: Map<string, string>;
    operationTypeLookup: Map<string, string>;
    createdReferences: SyncResult["createdReferences"];
    dryRun: boolean;
  }
): Promise<ItemFieldData> {
  const operation = detail.operations?.[0];
  const idSuffix = detail.public_id.replace(/^EB-/i, "").toLowerCase();
  const titleSlug = slugify(detail.title);

  /** In dry-run mode, only reports what *would* be created — never writes. */
  async function resolveRef(
    collectionId: string,
    items: WebflowItemSummary[],
    name: string,
    extraFieldData: Record<string, unknown> | undefined,
    trackList: string[]
  ): Promise<string> {
    const normalized = name.trim().toLowerCase();
    const existing = items.find((i) => String(i.fieldData.name ?? "").trim().toLowerCase() === normalized);
    if (existing) return existing.id;

    if (!trackList.includes(name)) trackList.push(name);

    if (ctx.dryRun) {
      // Cache a local-only placeholder so later properties in this same dry
      // run see it as "existing" instead of reporting it as a new create again.
      const placeholderId = `dry-run-pending:${normalized}`;
      items.push({ id: placeholderId, isDraft: false, isArchived: false, fieldData: { name } });
      return placeholderId;
    }

    return resolveOrCreateReferenceByName(collectionId, items, name, extraFieldData);
  }

  const propertyTypeId = await resolveRef(
    env.propertyTypesCollectionId,
    ctx.propertyTypeItems,
    detail.property_type,
    undefined,
    ctx.createdReferences.propertyTypes
  );

  const cityCandidates = locationCandidates(detail.location.name);
  let cityId: string | undefined;
  for (const candidate of cityCandidates) {
    const match = ctx.ubicacionItems.find(
      (i) => String(i.fieldData.name ?? "").trim().toLowerCase() === candidate.trim().toLowerCase()
    );
    if (match) {
      cityId = match.id;
      break;
    }
  }
  if (!cityId) {
    const fallbackName = cityCandidates[cityCandidates.length - 1] ?? detail.location.name;
    cityId = await resolveRef(
      env.ubicacionesCollectionId,
      ctx.ubicacionItems,
      fallbackName,
      { city: fallbackName },
      ctx.createdReferences.ubicaciones
    );
  }

  const agentName = detail.agent?.full_name || detail.agent?.name || "Sin asignar";
  const agenteId = await resolveRef(
    env.agentesCollectionId,
    ctx.agenteItems,
    agentName,
    {
      phone: detail.agent?.mobile_phone ?? null,
      "foto-agente": detail.agent?.profile_image_url ? { url: detail.agent.profile_image_url } : null,
    },
    ctx.createdReferences.agentes
  );

  const images = detail.property_images ?? [];
  const featuredImage = images[0] ? { url: images[0].url } : undefined;

  const fieldData: ItemFieldData = {
    name: `${detail.public_id} - ${detail.title}`,
    slug: `${titleSlug}-${idSuffix}`,
    "nombre-publico": detail.title,
    "property-id": detail.public_id,
    descripcion: detail.description ? toParagraphHtml(detail.description) : "",
    "location-full": detail.location.name,
    "property-type": propertyTypeId,
    city: cityId,
    agente: agenteId,
    "metros-cuadrados": detail.construction_size != null ? String(detail.construction_size) : "",
    "lot-size": Math.trunc(detail.lot_size ?? 0),
    bedrooms: Math.trunc(detail.bedrooms ?? 0),
    bathrooms: Math.trunc(detail.bathrooms ?? 0),
    parking: Math.trunc(detail.parking_spaces ?? 0),
  };

  if (featuredImage) {
    fieldData["featured-image"] = featuredImage;
    fieldData.gallery = images.map((img) => ({ url: img.url }));
  }

  if (detail.location.latitude != null && detail.location.longitude != null) {
    const lat = detail.location.latitude;
    const lng = detail.location.longitude;
    fieldData.latitud = Math.trunc(lat);
    fieldData.longitud = Math.trunc(lng);
    fieldData["location-full-link"] = mapsLink(lat, lng);
    fieldData["code-link-map"] = mapsEmbedHtml(lat, lng);
  }

  if (operation) {
    const operationOptionName = operation.type === "sale" ? "venta" : operation.type === "rental" ? "renta" : operation.type;
    const operationTypeId = ctx.operationTypeLookup.get(operationOptionName.toLowerCase());
    if (operationTypeId) fieldData["operation-type"] = operationTypeId;

    const currencyId = ctx.currencyLookup.get(operation.currency.toLowerCase());
    if (currencyId) fieldData.currency = currencyId;

    fieldData["precio-de-propiedad"] = operation.formatted_amount ?? String(operation.amount);
  }

  return fieldData;
}
