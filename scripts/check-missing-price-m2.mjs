import fs from "node:fs";
import path from "node:path";
import { WebflowClient } from "webflow-api";

for (const line of fs.readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const wf = new WebflowClient({ accessToken: process.env.WEBFLOW_API_TOKEN });
const COLLECTION_ID = process.env.WEBFLOW_PROPERTIES_COLLECTION_ID;

const newProps = JSON.parse(fs.readFileSync("scripts/new-properties-full.json", "utf8"));
const newIds = new Set(newProps.map((p) => p.id));

let offset = 0;
const missing = [];
let total = 0;
for (;;) {
  const res = await wf.collections.items.listItems(COLLECTION_ID, { limit: 100, offset });
  total = res.pagination?.total ?? res.items.length;
  for (const item of res.items) {
    const fd = item.fieldData;
    if (fd["precio-por-m2"] == null) {
      missing.push({ id: item.id, propertyId: fd["property-id"], isNew: newIds.has(item.id) });
    }
  }
  offset += res.items.length;
  if (offset >= total || res.items.length === 0) break;
}

console.log("Total items in collection:", total);
console.log("Missing precio-por-m2:", missing.length);
console.log("Of which are in the 57 new-properties list:", missing.filter((m) => m.isNew).length);
console.log("Missing but NOT in new-properties list (older ones):", missing.filter((m) => !m.isNew).length);
fs.writeFileSync("scripts/missing-price-m2.json", JSON.stringify(missing, null, 2));
console.log("Saved to scripts/missing-price-m2.json");
