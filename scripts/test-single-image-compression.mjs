import { wf, COLLECTION_ID, listAllItems, processAndUploadImage, callWithRetry } from "./image-compression-lib.mjs";

const publicId = process.argv[2];
if (!publicId) {
  console.error("Usage: node scripts/test-single-image-compression.mjs EB-XXXXX");
  process.exit(1);
}

const items = await listAllItems(COLLECTION_ID);
const item = items.find((i) => String(i.fieldData["property-id"] ?? "").trim() === publicId);
if (!item) {
  console.error(`Property ${publicId} not found in Webflow`);
  process.exit(1);
}

console.log(`Found item ${item.id} — "${item.fieldData.name}"`);
const featured = item.fieldData["featured-image"];
const gallery = Array.isArray(item.fieldData.gallery) ? item.fieldData.gallery : [];
const allImages = [featured, ...gallery].filter(Boolean);
console.log(`Current image count: ${allImages.length}`);
console.log(`Sample current featured-image url: ${featured?.url}`);

const testUrl = featured.url;
console.log(`\nDownloading + compressing + uploading: ${testUrl}`);
const before = await fetch(testUrl);
const beforeBytes = (await before.arrayBuffer()).byteLength;
console.log(`Original size: ${(beforeBytes / 1024).toFixed(1)} KB`);

const result = await processAndUploadImage(testUrl, item.fieldData.name);
console.log(`\nUploaded as real Webflow asset:`);
console.log(result);

const after = await fetch(result.hostedUrl);
const afterBytes = (await after.arrayBuffer()).byteLength;
console.log(`\nCompressed size: ${(afterBytes / 1024).toFixed(1)} KB (${(100 * afterBytes / beforeBytes).toFixed(1)}% of original)`);

console.log(`\nUpdating Webflow item's featured-image field (test write)...`);
await callWithRetry(() =>
  wf.collections.items.updateItem(COLLECTION_ID, item.id, {
    fieldData: { "featured-image": { url: result.hostedUrl, alt: result.alt } },
  })
);
console.log(`Done. Publishing item so the change is visible live...`);
await callWithRetry(() => wf.collections.items.publishItem(COLLECTION_ID, { itemIds: [item.id] }));
console.log(`Published. Check the property on the live site to verify the image looks correct.`);
