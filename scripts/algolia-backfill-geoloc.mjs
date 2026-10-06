// Adds _geoloc to every existing Algolia record, taken from the Webflow item's
// location-full-link. Only the _geoloc attribute is written (partial update).
// Usage: node scripts/algolia-backfill-geoloc.mjs          (dry run)
//        node scripts/algolia-backfill-geoloc.mjs --apply
import {
  ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY, ALGOLIA_INDEX, COLLECTION_ID,
  listAllItems, parseGeoloc, algoliaBatch,
} from "./algolia-sync-lib.mjs";

const apply = process.argv.includes("--apply");

async function browseObjectIds() {
  const ids = [];
  let cursor;
  do {
    const res = await fetch(`https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/browse`, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "X-Algolia-API-Key": ALGOLIA_ADMIN_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cursor ? { cursor } : { attributesToRetrieve: ["objectID", "_geoloc"], hitsPerPage: 1000 }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Algolia browse error ${res.status}: ${JSON.stringify(body)}`);
    ids.push(...body.hits.map((h) => ({ id: h.objectID, hasGeo: Boolean(h._geoloc) })));
    cursor = body.cursor;
  } while (cursor);
  return ids;
}

const records = await browseObjectIds();
const items = await listAllItems(COLLECTION_ID);
const coordsById = new Map(items.map((it) => [it.id, parseGeoloc(it.fieldData["location-full-link"])]));

const updates = [];
const missing = [];
for (const r of records) {
  const geo = coordsById.get(r.id);
  if (geo) updates.push({ action: "partialUpdateObjectNoCreate", body: { objectID: r.id, _geoloc: geo } });
  else missing.push(r.id);
}

console.log(`Algolia records: ${records.length} (already with _geoloc: ${records.filter((r) => r.hasGeo).length})`);
console.log(`To update: ${updates.length} · without coordinates in Webflow: ${missing.length}`);
if (missing.length) console.log("Missing:", missing.slice(0, 20).join(", "));

if (!apply) {
  console.log("Dry run — pass --apply to write.");
  process.exit(0);
}

for (let i = 0; i < updates.length; i += 200) {
  await algoliaBatch(updates.slice(i, i + 200));
  console.log(`Updated ${Math.min(i + 200, updates.length)}/${updates.length}`);
}
console.log("Done.");
