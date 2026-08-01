import { WebflowClient } from "webflow-api";
import { slugify } from "./slugify";

let client: WebflowClient | null = null;

export function getWebflowClient(): WebflowClient {
  if (client) return client;
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) throw new Error("Missing WEBFLOW_API_TOKEN env var");
  client = new WebflowClient({ accessToken: token });
  return client;
}

export interface WebflowFieldOption {
  id: string;
  name: string;
}

export interface WebflowFieldSchema {
  id: string;
  slug: string;
  type: string;
  options?: WebflowFieldOption[];
}

/** Fetches a collection's field schema, keyed by field slug. */
export async function getCollectionFieldMap(
  collectionId: string
): Promise<Map<string, WebflowFieldSchema>> {
  const wf = getWebflowClient();
  const collection = await callWithRetry(() => wf.collections.get(collectionId));
  const map = new Map<string, WebflowFieldSchema>();
  for (const field of collection.fields ?? []) {
    const anyField = field as unknown as {
      id: string;
      slug: string;
      type: string;
      validations?: { options?: WebflowFieldOption[] };
    };
    map.set(anyField.slug, {
      id: anyField.id,
      slug: anyField.slug,
      type: anyField.type,
      options: anyField.validations?.options,
    });
  }
  return map;
}

/** Builds a case-insensitive, trimmed name -> Option ID lookup for an Option field. */
export function buildOptionLookup(field: WebflowFieldSchema | undefined): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const opt of field?.options ?? []) {
    lookup.set(opt.name.trim().toLowerCase(), opt.id);
  }
  return lookup;
}

export interface WebflowItemSummary {
  id: string;
  isDraft: boolean;
  isArchived: boolean;
  fieldData: Record<string, unknown>;
  createdOn?: string;
  lastPublished?: string | null;
}

/** Lists every item in a collection, following offset-based pagination. */
export async function listAllItems(collectionId: string): Promise<WebflowItemSummary[]> {
  const wf = getWebflowClient();
  const results: WebflowItemSummary[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const page = await callWithRetry(() => wf.collections.items.listItems(collectionId, { limit, offset }));
    const items = page.items ?? [];
    for (const item of items) {
      results.push({
        id: item.id!,
        isDraft: Boolean(item.isDraft),
        isArchived: Boolean(item.isArchived),
        fieldData: (item.fieldData ?? {}) as Record<string, unknown>,
        createdOn: item.createdOn,
        lastPublished: item.lastPublished,
      });
    }
    if (items.length < limit) break;
    offset += limit;
  }

  return results;
}

/** Fetches a specific set of items by ID, concurrently — cheaper than a full paginated list when only a few items changed. */
export async function getItemsByIds(collectionId: string, ids: string[]): Promise<WebflowItemSummary[]> {
  const wf = getWebflowClient();
  const { results } = await runWithConcurrency(ids, 8, async (id): Promise<WebflowItemSummary> => {
    const item = await wf.collections.items.getItem(collectionId, id);
    return {
      id: item.id!,
      isDraft: Boolean(item.isDraft),
      isArchived: Boolean(item.isArchived),
      fieldData: (item.fieldData ?? {}) as Record<string, unknown>,
      createdOn: item.createdOn,
      lastPublished: item.lastPublished,
    };
  });
  return results.filter((r): r is WebflowItemSummary => Boolean(r));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface BatchFailure<T> {
  input: T;
  message: string;
}

/**
 * Runs async jobs with bounded concurrency. A failure on one item (after
 * retries are exhausted) is recorded and skipped — it never aborts the other
 * in-flight or pending items, since this drives large, long-running bulk syncs.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<{ results: (R | undefined)[]; failures: BatchFailure<T>[] }> {
  const results: (R | undefined)[] = new Array(items.length);
  const failures: BatchFailure<T>[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await callWithRetry(() => fn(items[current]));
      } catch (err) {
        failures.push({ input: items[current], message: (err as Error).message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { results, failures };
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function callWithRetry<R>(fn: () => Promise<R>, retries = 6): Promise<R> {
  try {
    return await fn();
  } catch (err) {
    const status =
      (err as { statusCode?: number; status?: number })?.statusCode ??
      (err as { status?: number })?.status;
    if (status !== undefined && RETRYABLE_STATUSES.has(status) && retries > 0) {
      await new Promise((r) => setTimeout(r, 2000 * (7 - retries)));
      return callWithRetry(fn, retries - 1);
    }
    throw err;
  }
}

export interface ItemFieldData {
  name: string;
  slug: string;
  [key: string]: unknown;
}

export interface NewItemInput {
  fieldData: ItemFieldData;
}

/**
 * Creates items one request at a time (bounded concurrency), rather than the
 * bulk create endpoint, whose SDK response typing is ambiguous for arrays.
 * Returns created item IDs (only for the ones that succeeded) plus any failures.
 */
export async function createItemsBatched(
  collectionId: string,
  newItems: NewItemInput[],
  concurrency = 8
): Promise<{ createdIds: string[]; failures: BatchFailure<NewItemInput>[] }> {
  const wf = getWebflowClient();
  const { results, failures } = await runWithConcurrency(newItems, concurrency, async (item) => {
    const res = await wf.collections.items.createItem(collectionId, {
      isArchived: false,
      isDraft: false,
      fieldData: item.fieldData,
    });
    return res.id!;
  });
  return { createdIds: results.filter((id): id is string => Boolean(id)), failures };
}

export interface UpdateItemInput {
  id: string;
  fieldData: Record<string, unknown>;
}

/**
 * Updates items one request at a time (bounded concurrency), rather than the
 * bulk update endpoint. The bulk endpoint was found to silently truncate
 * MultiImage gallery fields under load (items would end up with 1-2 images
 * instead of the full set) — per-item calls avoid that entirely. A failed
 * item is recorded and skipped rather than aborting the whole run.
 */
export async function updateItemsBatched(
  collectionId: string,
  updates: UpdateItemInput[],
  concurrency = 8
): Promise<{ failures: BatchFailure<UpdateItemInput>[] }> {
  const wf = getWebflowClient();
  const { failures } = await runWithConcurrency(updates, concurrency, async (update) => {
    await wf.collections.items.updateItem(collectionId, update.id, {
      fieldData: update.fieldData,
    });
  });
  return { failures };
}

/** Publishes items to the live site in batches of 100. Failed batches are recorded, not fatal. */
export async function publishItemsBatched(
  collectionId: string,
  itemIds: string[]
): Promise<{ failures: BatchFailure<string[]>[] }> {
  const wf = getWebflowClient();
  const failures: BatchFailure<string[]>[] = [];
  for (const batch of chunk(itemIds, 100)) {
    if (batch.length === 0) continue;
    try {
      await callWithRetry(() => wf.collections.items.publishItem(collectionId, { itemIds: batch }));
    } catch (err) {
      failures.push({ input: batch, message: (err as Error).message });
    }
  }
  return { failures };
}

/** Extracts the IDs of items Webflow says are still referencing a conflicting item (HTTP 409 body). */
function parseConflictingItemIds(err: unknown): string[] {
  const message = (err as Error)?.message ?? "";
  const match = message.match(/Body:\s*(\{[\s\S]*\})\s*$/);
  if (!match) return [];
  try {
    const body = JSON.parse(match[1]) as {
      details?: { conflicts?: { type?: string; ref?: { id?: string } }[] }[];
    };
    const ids = new Set<string>();
    for (const detail of body.details ?? []) {
      for (const conflict of detail.conflicts ?? []) {
        if (conflict.type === "item_ref" && conflict.ref?.id) ids.add(conflict.ref.id);
      }
    }
    return [...ids];
  } catch {
    return [];
  }
}

/**
 * Removes `targetId` from a Reference/MultiReference field on another item
 * (identified by `referencingItemId`), so it no longer blocks unpublishing
 * `targetId`. Only touches that one field's array; nothing else on the item.
 */
async function removeReferenceFromItem(
  collectionId: string,
  referencingItemId: string,
  referenceFieldSlug: string,
  targetId: string
): Promise<boolean> {
  const wf = getWebflowClient();
  const item = await callWithRetry(() => wf.collections.items.getItem(collectionId, referencingItemId));
  const current = (item.fieldData as Record<string, unknown>)?.[referenceFieldSlug];
  if (!Array.isArray(current)) return false;

  const cleaned = current.filter((v) => v !== targetId);
  if (cleaned.length === current.length) return false;

  await callWithRetry(() =>
    wf.collections.items.updateItem(collectionId, referencingItemId, {
      fieldData: { [referenceFieldSlug]: cleaned },
    })
  );
  await callWithRetry(() => wf.collections.items.publishItem(collectionId, { itemIds: [referencingItemId] }));
  return true;
}

/**
 * Unpublishes items from the live site (sets isDraft:true) in batches of 100;
 * items are kept, not deleted. If a batch fails (e.g. HTTP 409 because
 * another live item's reference field still points at one of them), it falls
 * back to unpublishing one item at a time. On a per-item 409, it strips that
 * item's ID out of whichever other items' `referenceFieldSlug` still point to
 * it, republishes those, and retries — so only genuinely unresolvable
 * conflicts end up in `failures`.
 */
export async function unpublishItemsBatched(
  collectionId: string,
  itemIds: string[],
  referenceFieldSlug?: string
): Promise<{ failures: BatchFailure<string>[] }> {
  const wf = getWebflowClient();
  const failures: BatchFailure<string>[] = [];

  async function unpublishOne(id: string): Promise<void> {
    // Webflow's 409 conflict body doesn't always list every referencing item
    // in one shot, so this may need a few rounds of cleanup-then-retry.
    const maxRounds = 5;
    for (let round = 0; round < maxRounds; round++) {
      try {
        await callWithRetry(() => wf.collections.items.deleteItemsLive(collectionId, { items: [{ id }] }));
        return;
      } catch (err) {
        if (!referenceFieldSlug) throw err;
        const conflictingItemIds = parseConflictingItemIds(err);
        if (conflictingItemIds.length === 0) throw err;

        for (const refItemId of conflictingItemIds) {
          await removeReferenceFromItem(collectionId, refItemId, referenceFieldSlug, id);
        }

        if (round === maxRounds - 1) throw err;
      }
    }
  }

  for (const batch of chunk(itemIds, 100)) {
    if (batch.length === 0) continue;
    try {
      await callWithRetry(() =>
        wf.collections.items.deleteItemsLive(collectionId, {
          items: batch.map((id) => ({ id })),
        })
      );
    } catch {
      for (const id of batch) {
        try {
          await unpublishOne(id);
        } catch (err) {
          failures.push({ input: id, message: (err as Error).message });
        }
      }
    }
  }
  return { failures };
}

/**
 * Finds an existing reference item by case-insensitive name match, or creates
 * one if none exists. Used for Property Type / Ciudad / Agente reference
 * collections, whose values aren't guaranteed to already exist. Mutates
 * `existingItems` so repeated lookups within the same run reuse newly created ones.
 */
export async function resolveOrCreateReferenceByName(
  collectionId: string,
  existingItems: WebflowItemSummary[],
  name: string,
  extraFieldData: Record<string, unknown> = {}
): Promise<string> {
  const normalized = name.trim().toLowerCase();
  const match = existingItems.find(
    (item) => String(item.fieldData.name ?? "").trim().toLowerCase() === normalized
  );
  if (match) return match.id;

  const wf = getWebflowClient();
  const res = await callWithRetry(() =>
    wf.collections.items.createItem(collectionId, {
      isArchived: false,
      isDraft: false,
      fieldData: {
        name: name.trim(),
        slug: slugify(name),
        ...extraFieldData,
      },
    })
  );
  existingItems.push({
    id: res.id!,
    isDraft: false,
    isArchived: false,
    fieldData: res.fieldData as Record<string, unknown>,
  });
  return res.id!;
}

/** Publishes the whole site (needed once after items are published, so pages reflect CMS changes). */
export async function publishSite(siteId: string): Promise<void> {
  const wf = getWebflowClient();
  await wf.sites.publish(siteId, {});
}
