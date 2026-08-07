// Repairs the WebP regression: scripts/fix-all-images.mjs and fix-missing-images.mjs
// overwrote featured-image/gallery with raw (non-webp) EasyBroker URLs for ~400+
// properties, undoing an earlier bulk WebP conversion. This script re-converts them,
// but first checks the existing Webflow asset library (4290+ files uploaded by that
// earlier conversion, named "<marker>.webp" where marker = imageMarker(sourceUrl))
// to REUSE already-converted assets instead of re-uploading duplicates.
//
// Safeguards against reprocessing:
//   - Any item whose featured-image AND every gallery image URL already end in
//     ".webp" is skipped entirely (no EasyBroker fetch, no Webflow write).
//   - Before uploading a new asset, checks the in-memory asset map (built from
//     Webflow's live asset library) for "<marker>.webp" and reuses its hostedUrl.
//
// Usage:
//   node scripts/audit-and-fix-images.mjs            (dry run, just reports)
//   node scripts/audit-and-fix-images.mjs --apply     (writes + publishes)

import fs from "node:fs";
import path from "node:path";
import {
  wf,
  SITE_ID,
  COLLECTION_ID,
  callWithRetry,
  sleep,
  imageMarker,
  processAndUploadImage,
  listAllItems,
} from "./image-compression-lib.mjs";

const APPLY = process.argv.includes("--apply");

async function ebFetch(url, retries = 5) {
  const res = await fetch(url, {
    headers: { accept: "application/json", "X-Authorization": process.env.EASYBROKER_API_KEY },
  });
  if ((res.status === 429 || res.status >= 500) && retries > 0) {
    const retryAfter = Number(res.headers.get("retry-after")) || 2;
    await sleep(retryAfter * 1000);
    return ebFetch(url, retries - 1);
  }
  if (!res.ok) throw new Error(`EasyBroker ${res.status} on ${url}`);
  return res.json();
}

function isWebp(url) {
  if (!url) return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".webp");
  } catch {
    return url.toLowerCase().endsWith(".webp");
  }
}

// Webflow prefixes the asset's own ID to whatever fileName we upload with, e.g.
// we upload "4be6aec37452.webp" and it comes back as
// "6a715ebee342313b1b0b6f8b_4be6aec37452.webp". So we index by the 12-hex marker
// suffix, not the raw fileName we originally sent.
const MARKER_SUFFIX_RE = /_?([a-f0-9]{12})\.webp$/i;

console.log("Loading existing Webflow asset library (to reuse already-converted webp files)...");
const assetByMarker = new Map();
{
  let offset = 0;
  for (;;) {
    const page = await callWithRetry(() => wf.assets.list(SITE_ID, { offset, limit: 100 }));
    for (const asset of page.assets ?? []) {
      const match = asset.originalFileName?.match(MARKER_SUFFIX_RE);
      if (match) assetByMarker.set(match[1].toLowerCase(), asset);
    }
    if ((page.assets ?? []).length < 100) break;
    offset += 100;
  }
}
console.log(`Loaded ${assetByMarker.size} existing webp assets (by marker) from the library.`);

console.log("Loading Webflow property items...");
const items = await listAllItems(COLLECTION_ID);
console.log(`Loaded ${items.length} Webflow items.`);

const results = { skippedAlreadyWebp: [], noEbImages: [], noPropertyId: [], fixed: [], errors: [] };
let reusedCount = 0;
let convertedCount = 0;

let index = 0;
async function worker() {
  while (index < items.length) {
    const item = items[index++];
    const pid = item.fieldData?.["property-id"];
    if (!pid) {
      results.noPropertyId.push(item.id);
      continue;
    }

    const currentFeatured = item.fieldData?.["featured-image"]?.url;
    const currentGallery = (item.fieldData?.gallery ?? []).map((g) => g?.url).filter(Boolean);
    const allAlreadyWebp = isWebp(currentFeatured) && currentGallery.every(isWebp) && currentGallery.length > 0;
    if (allAlreadyWebp) {
      results.skippedAlreadyWebp.push(pid);
      continue;
    }

    try {
      const detail = await ebFetch(`https://api.easybroker.com/v1/properties/${pid}`);
      const images = detail.property_images ?? [];
      if (images.length === 0) {
        results.noEbImages.push(pid);
        continue;
      }

      const newImages = [];
      for (const img of images) {
        const marker = imageMarker(img.url);
        const existing = assetByMarker.get(marker);
        if (existing?.hostedUrl) {
          newImages.push(existing.hostedUrl);
          reusedCount++;
          continue;
        }
        if (APPLY) {
          const uploaded = await processAndUploadImage(img.url, pid);
          assetByMarker.set(marker, { hostedUrl: uploaded.hostedUrl });
          newImages.push(uploaded.hostedUrl);
          convertedCount++;
        } else {
          newImages.push(null); // dry run: would convert, don't know hostedUrl yet
          convertedCount++;
        }
      }

      if (APPLY) {
        await callWithRetry(() =>
          wf.collections.items.updateItem(COLLECTION_ID, item.id, {
            fieldData: {
              "featured-image": { url: newImages[0] },
              gallery: newImages.map((url) => ({ url })),
            },
          })
        );
        await callWithRetry(() => wf.collections.items.publishItem(COLLECTION_ID, { itemIds: [item.id] }));
      }

      results.fixed.push({ pid, imageCount: images.length });
      console.log(pid, `-> ${APPLY ? "fixed" : "would fix"} (${images.length} images)`);
    } catch (err) {
      results.errors.push({ pid, message: err.message });
      console.log(pid, "-> ERROR:", err.message);
    }
  }
}

await Promise.all(Array.from({ length: 3 }, worker));

console.log("\n=== SUMMARY ===");
console.log("Already webp (skipped, untouched):", results.skippedAlreadyWebp.length);
console.log("Fixed (or would fix):", results.fixed.length);
console.log("  - reused existing webp asset:", reusedCount);
console.log("  - newly converted:", convertedCount, APPLY ? "" : "(dry run — nothing uploaded)");
console.log("No EasyBroker images:", results.noEbImages.length);
console.log("No property-id:", results.noPropertyId.length);
console.log("Errors:", results.errors.length);
if (results.errors.length) console.log(JSON.stringify(results.errors, null, 2));

fs.writeFileSync(
  path.resolve("scripts/audit-and-fix-images-results.json"),
  JSON.stringify({ apply: APPLY, ...results, reusedCount, convertedCount }, null, 2)
);
console.log(`\n${APPLY ? "Applied and saved" : "Dry run saved"} to scripts/audit-and-fix-images-results.json`);
