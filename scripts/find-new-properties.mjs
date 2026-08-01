import { COLLECTION_ID, listAllItems } from "./algolia-sync-lib.mjs";

const items = await listAllItems(COLLECTION_ID);
console.log("Total:", items.length);

const cutoff = new Date("2026-07-30T00:00:00Z").getTime();
const created = items.filter((i) => i.createdOn && new Date(i.createdOn).getTime() >= cutoff);
console.log("Created today (new properties):", created.length);

const result = created.map((i) => ({
  id: i.id,
  propertyId: i.fieldData["property-id"],
  hasDescription: Boolean(i.fieldData.descripcion),
  andenes: i.fieldData.andenes,
}));
import fs from "node:fs";
fs.writeFileSync("scripts/new-properties-full.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
