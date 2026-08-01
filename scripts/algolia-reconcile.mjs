import {
  ALGOLIA_APP_ID,
  ALGOLIA_ADMIN_KEY,
  ALGOLIA_INDEX,
  COLLECTION_ID,
  PROPERTY_TYPES_COLLECTION_ID,
  UBICACIONES_COLLECTION_ID,
  listAllItems,
  getCollectionFieldMap,
  buildOptionNameMap,
  buildAlgoliaRecord,
  algoliaBatch,
} from "./algolia-sync-lib.mjs";

const [fieldMap, propertyTypeItems, ubicacionItems, webflowItems] = await Promise.all([
  getCollectionFieldMap(COLLECTION_ID),
  listAllItems(PROPERTY_TYPES_COLLECTION_ID),
  listAllItems(UBICACIONES_COLLECTION_ID),
  listAllItems(COLLECTION_ID),
]);

console.log("Total Webflow items:", webflowItems.length);
const draftItems = webflowItems.filter((i) => i.isDraft);
const liveItems = webflowItems.filter((i) => !i.isDraft && !i.isArchived);
console.log("Draft items:", draftItems.length);
console.log("Live items:", liveItems.length);

// Fetch current Algolia objectIDs.
async function getAllAlgoliaIds() {
  const ids = new Set();
  let page = 0;
  while (true) {
    const res = await fetch(`https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "X-Algolia-API-Key": ALGOLIA_ADMIN_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "", hitsPerPage: 1000, page, attributesToRetrieve: ["objectID"] }),
    });
    const data = await res.json();
    for (const hit of data.hits) ids.add(hit.objectID);
    if (data.hits.length < 1000 || page >= data.nbPages - 1) break;
    page++;
  }
  return ids;
}

const algoliaIds = await getAllAlgoliaIds();
console.log("Current Algolia records:", algoliaIds.size);

// Items to delete: draft/archived in Webflow but still present in Algolia.
const toDelete = draftItems.filter((i) => algoliaIds.has(i.id)).map((i) => i.id);
console.log("To delete from Algolia (drafted):", toDelete.length);

// Items to add/update: live in Webflow but missing from Algolia, or just refresh all live ones to be safe.
const lookups = {
  currency: buildOptionNameMap(fieldMap.get("currency")),
  operationType: buildOptionNameMap(fieldMap.get("operation-type")),
  propertyType: new Map(propertyTypeItems.map((i) => [i.id, i.fieldData.name])),
  city: new Map(ubicacionItems.map((i) => [i.id, i.fieldData.name])),
};

const missingFromAlgolia = liveItems.filter((i) => !algoliaIds.has(i.id));
console.log("Live items missing from Algolia:", missingFromAlgolia.length);

const requests = [
  ...toDelete.map((id) => ({ action: "deleteObject", body: { objectID: id } })),
  ...missingFromAlgolia.map((item) => ({ action: "updateObject", body: buildAlgoliaRecord(item, lookups) })),
];

console.log("Total batch operations:", requests.length);

const apply = process.argv.includes("--apply");
if (!apply) {
  console.log("\nDRY RUN — pass --apply to actually write to Algolia. No changes made.");
  process.exit(0);
}

if (requests.length > 0) {
  // Algolia batch endpoint handles large arrays fine, but chunk defensively.
  const chunkSize = 200;
  for (let i = 0; i < requests.length; i += chunkSize) {
    const chunk = requests.slice(i, i + chunkSize);
    const result = await algoliaBatch(chunk);
    console.log(`Batch ${i / chunkSize + 1}: taskID ${result.taskID}, ${chunk.length} ops`);
  }
}

console.log("Done.");
