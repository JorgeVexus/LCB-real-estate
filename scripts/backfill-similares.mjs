import { wf, COLLECTION_ID, callWithRetry, listAllItems } from "./algolia-sync-lib.mjs";

function suggestSimilar(target, candidates, limit = 4) {
  const live = candidates.filter((i) => !i.isDraft && !i.isArchived && i.id !== target.id);
  const sameTypeAndCity = live.filter(
    (i) => i.fieldData["property-type"] === target.propertyTypeId && i.fieldData.city === target.cityId
  );
  const sameType = live.filter((i) => i.fieldData["property-type"] === target.propertyTypeId);
  const sameCity = live.filter((i) => i.fieldData.city === target.cityId);

  const pool =
    sameTypeAndCity.length >= limit ? sameTypeAndCity : sameType.length >= limit ? sameType : sameCity.length >= limit ? sameCity : live;

  const ranked = [...pool].sort((a, b) => {
    const aMetros = parseFloat(a.fieldData["metros-cuadrados"] || "0") || 0;
    const bMetros = parseFloat(b.fieldData["metros-cuadrados"] || "0") || 0;
    return Math.abs(aMetros - target.metros) - Math.abs(bMetros - target.metros);
  });
  return ranked.slice(0, limit).map((i) => i.id);
}

const items = await listAllItems(COLLECTION_ID);
const live = items.filter((i) => !i.isDraft && !i.isArchived);
const empty = live.filter((i) => !(i.fieldData["propiedades-similares"] || []).length);
console.log("Properties to backfill:", empty.length);

const apply = process.argv.includes("--apply");
let count = 0;
for (const item of empty) {
  const metros = parseFloat(item.fieldData["metros-cuadrados"] || "0") || 0;
  const similares = suggestSimilar(
    { id: item.id, propertyTypeId: item.fieldData["property-type"], cityId: item.fieldData.city, metros },
    live
  );
  console.log(item.fieldData["property-id"], "->", similares.length, "suggestions");
  if (apply && similares.length > 0) {
    await callWithRetry(() =>
      wf.collections.items.updateItem(COLLECTION_ID, item.id, { fieldData: { "propiedades-similares": similares } })
    );
    await callWithRetry(() => wf.collections.items.publishItem(COLLECTION_ID, { itemIds: [item.id] }));
    count++;
  }
}
console.log(apply ? `Updated ${count} properties.` : "DRY RUN — pass --apply to write.");
