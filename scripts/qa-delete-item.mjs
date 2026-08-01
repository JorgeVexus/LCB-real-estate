import { wf, COLLECTION_ID, callWithRetry, listAllItems, ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY, ALGOLIA_INDEX } from "./algolia-sync-lib.mjs";

const propertyId = process.argv[2];
if (!propertyId) {
  console.error("Usage: node qa-delete-item.mjs EB-XXXX");
  process.exit(1);
}

const all = await listAllItems(COLLECTION_ID);
const item = all.find((i) => i.fieldData["property-id"] === propertyId);
if (!item) {
  console.error("Not found:", propertyId);
  process.exit(1);
}

console.log("Found item:", item.id, "slug:", item.fieldData.slug);

await callWithRetry(() => wf.collections.items.deleteItems(COLLECTION_ID, { items: [{ id: item.id }] }));
console.log("Deleted from Webflow:", item.id);

const res = await fetch(`https://${ALGOLIA_APP_ID}.algolia.net/1/indexes/${ALGOLIA_INDEX}/${item.id}`, {
  method: "DELETE",
  headers: { "X-Algolia-Application-Id": ALGOLIA_APP_ID, "X-Algolia-API-Key": ALGOLIA_ADMIN_KEY },
});
console.log("Deleted from Algolia:", res.status);
