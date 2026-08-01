import fs from "node:fs";
import { COLLECTION_ID, listAllItems, sleep } from "./algolia-sync-lib.mjs";

async function ebFetchAllPublished() {
  const ids = [];
  let url = "https://api.easybroker.com/v1/properties?limit=50&search%5Bstatuses%5D%5B%5D=published";
  while (url) {
    const res = await fetch(url, { headers: { accept: "application/json", "X-Authorization": process.env.EASYBROKER_API_KEY } });
    const data = await res.json();
    ids.push(...data.content.map((p) => p.public_id));
    url = data.pagination.next_page;
  }
  return ids;
}

const webflowItems = await listAllItems(COLLECTION_ID);
console.log("Total Webflow items:", webflowItems.length);

// 1. Duplicate check by property-id
const byPropertyId = new Map();
for (const item of webflowItems) {
  const pid = item.fieldData["property-id"];
  if (!pid) continue;
  if (!byPropertyId.has(pid)) byPropertyId.set(pid, []);
  byPropertyId.get(pid).push(item.id);
}
const duplicates = [...byPropertyId.entries()].filter(([, ids]) => ids.length > 1);
console.log("\n=== DUPLICATE CHECK ===");
console.log("Unique property-ids:", byPropertyId.size);
console.log("Duplicates found:", duplicates.length);
if (duplicates.length) console.log(JSON.stringify(duplicates, null, 2));

// 2. New properties (created today) completeness check
const cutoff = new Date("2026-07-30T00:00:00Z").getTime();
const newItems = webflowItems.filter((i) => i.createdOn && new Date(i.createdOn).getTime() >= cutoff);
console.log("\n=== NEW PROPERTIES COMPLETENESS ===");
console.log("New properties count:", newItems.length);
const incomplete = newItems.filter((i) => {
  const fd = i.fieldData;
  return (
    i.isDraft ||
    !fd["featured-image"] ||
    !(fd.gallery || []).length ||
    !fd["nombre-publico"] ||
    !fd["precio-de-propiedad"] ||
    !fd["location-full"]
  );
});
console.log("Incomplete or unpublished:", incomplete.length);
if (incomplete.length) {
  console.log(incomplete.map((i) => ({ propertyId: i.fieldData["property-id"], isDraft: i.isDraft })));
}

// 3. Discrepancy report: EasyBroker published vs Webflow live
const ebPublished = await ebFetchAllPublished();
const ebSet = new Set(ebPublished);
const liveWebflow = webflowItems.filter((i) => !i.isDraft && !i.isArchived);
const liveWebflowIds = new Set(liveWebflow.map((i) => i.fieldData["property-id"]).filter(Boolean));

const missingFromWebflow = ebPublished.filter((id) => !liveWebflowIds.has(id));
const shouldBeUnpublished = liveWebflow
  .map((i) => i.fieldData["property-id"])
  .filter((pid) => pid && !ebSet.has(pid));

console.log("\n=== DISCREPANCY REPORT: EasyBroker vs Webflow ===");
console.log("EasyBroker published:", ebPublished.length);
console.log("Webflow live (published, not draft/archived):", liveWebflow.length);
console.log("Published in EB but missing/draft in Webflow:", missingFromWebflow.length, missingFromWebflow);
console.log("Live in Webflow but not published in EB (should be unpublished):", shouldBeUnpublished.length, shouldBeUnpublished);

const report = {
  generatedAt: new Date().toISOString(),
  totalWebflowItems: webflowItems.length,
  uniquePropertyIds: byPropertyId.size,
  duplicates,
  newPropertiesCount: newItems.length,
  newPropertiesIncomplete: incomplete.map((i) => i.fieldData["property-id"]),
  easyBrokerPublishedCount: ebPublished.length,
  webflowLiveCount: liveWebflow.length,
  missingFromWebflow,
  shouldBeUnpublished,
};
fs.writeFileSync("scripts/qa-report.json", JSON.stringify(report, null, 2));
console.log("\nSaved to scripts/qa-report.json");
