import fs from "node:fs";
import path from "node:path";
import {
  COLLECTION_ID,
  PROPERTY_TYPES_COLLECTION_ID,
  UBICACIONES_COLLECTION_ID,
  listAllItems,
  getCollectionFieldMap,
  buildOptionNameMap,
  buildAlgoliaRecord,
  algoliaBatch,
} from "./algolia-sync-lib.mjs";

const newProps = JSON.parse(fs.readFileSync("C:/tmp/new_properties.json", "utf8"));
const newPublicIds = new Set(newProps.map((p) => p.publicId));
console.log("New property IDs to add:", newPublicIds.size);

const [fieldMap, propertyTypeItems, ubicacionItems, webflowItems] = await Promise.all([
  getCollectionFieldMap(COLLECTION_ID),
  listAllItems(PROPERTY_TYPES_COLLECTION_ID),
  listAllItems(UBICACIONES_COLLECTION_ID),
  listAllItems(COLLECTION_ID),
]);

const lookups = {
  currency: buildOptionNameMap(fieldMap.get("currency")),
  operationType: buildOptionNameMap(fieldMap.get("operation-type")),
  propertyType: new Map(propertyTypeItems.map((i) => [i.id, i.fieldData.name])),
  city: new Map(ubicacionItems.map((i) => [i.id, i.fieldData.name])),
};

const toAdd = webflowItems.filter((item) => newPublicIds.has(item.fieldData["property-id"]));
console.log("Matched Webflow items:", toAdd.length);

const requests = toAdd.map((item) => ({
  action: "updateObject",
  body: buildAlgoliaRecord(item, lookups),
}));

const result = await algoliaBatch(requests);
console.log("Batch result taskID:", result.taskID, "objects:", result.objectIDs?.length);
