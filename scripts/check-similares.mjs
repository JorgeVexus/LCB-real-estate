import { COLLECTION_ID, listAllItems } from "./algolia-sync-lib.mjs";

const items = await listAllItems(COLLECTION_ID);
const live = items.filter((i) => !i.isDraft && !i.isArchived);
console.log("Live items:", live.length);

const empty = live.filter((i) => !(i.fieldData["propiedades-similares"] || []).length);
console.log("Live items with EMPTY propiedades-similares:", empty.length);

const liveIds = new Set(live.map((i) => i.id));
let danglingRefsCount = 0;
let itemsWithDangling = 0;
for (const item of live) {
  const refs = item.fieldData["propiedades-similares"] || [];
  const dangling = refs.filter((id) => !liveIds.has(id));
  if (dangling.length > 0) {
    itemsWithDangling++;
    danglingRefsCount += dangling.length;
  }
}
console.log("Live items with dangling (unpublished/missing) references still listed:", itemsWithDangling);
console.log("Total dangling reference entries:", danglingRefsCount);

console.log("\nSample empty ones:", empty.slice(0, 5).map((i) => i.fieldData["property-id"]));
