// One-time retroactive backfill: recompresses every existing property's
// featured-image + gallery to WebP and uploads them as real Webflow Assets.
// Resumable — properties whose images already carry a matching "eb:<marker>"
// alt tag are skipped, so re-running after an interruption only processes
// what's left. Sources images from EasyBroker (not Webflow's current mirror)
// so the markers match exactly what the ongoing sync.ts pipeline computes —
// the next daily sync will see these as "unchanged" and won't reprocess them.
import {
  wf,
  COLLECTION_ID,
  SITE_ID,
  listAllItems,
  processAndUploadImage,
  imageMarker,
  extractMarker,
  runWithConcurrency,
  callWithRetry,
} from "./image-compression-lib.mjs";

const EB_KEY = process.env.EASYBROKER_API_KEY;
const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_API_KEY;
const ALGOLIA_INDEX = process.env.ALGOLIA_INDEX_NAME;

async function updateAlgoliaImages(objectID, featuredImageUrl, galleryImages) {
  const res = await fetch(`https://${ALGOLIA_APP_ID}.algolia.net/1/indexes/${ALGOLIA_INDEX}/${objectID}/partial`, {
    method: "POST",
    headers: {
      "X-Algolia-API-Key": ALGOLIA_ADMIN_KEY,
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "content-type": "application/json",
    },
    body: JSON.stringify({ featuredImageUrl, galleryImages }),
  });
  if (!res.ok) {
    // Not every property is necessarily indexed in Algolia (e.g. very
    // recently created ones) — log but don't fail the whole backfill for it.
    console.warn(`  (Algolia partial update failed: ${res.status} ${await res.text()})`);
  }
}
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.split("=")[1].split(",") : undefined;
const DRY_RUN = process.argv.includes("--dry-run");

async function fetchEbImages(publicId) {
  const res = await fetch(`https://api.easybroker.com/v1/properties/${publicId}`, {
    headers: { "X-Authorization": EB_KEY, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`EasyBroker ${publicId}: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return (data.property_images ?? []).map((img) => img.url);
}

function getExistingMarkers(fieldData) {
  const featured = fieldData["featured-image"];
  const gallery = Array.isArray(fieldData.gallery) ? fieldData.gallery : [];
  return [featured, ...gallery].filter(Boolean).map((img) => extractMarker(img?.alt));
}

async function main() {
  console.log(`Fetching all live Webflow items...`);
  let items = await listAllItems(COLLECTION_ID);
  items = items.filter((i) => !i.isDraft && !i.isArchived);
  if (ONLY) items = items.filter((i) => ONLY.includes(String(i.fieldData["property-id"])));
  if (LIMIT) items = items.slice(0, LIMIT);
  console.log(`${items.length} properties to check.\n`);

  let skipped = 0;
  let processed = 0;
  let failed = 0;

  for (const [idx, item] of items.entries()) {
    const publicId = String(item.fieldData["property-id"] ?? "");
    const label = `[${idx + 1}/${items.length}] ${publicId}`;
    try {
      const ebImageUrls = await fetchEbImages(publicId);
      if (ebImageUrls.length === 0) {
        console.log(`${label} — no EasyBroker images, skipping`);
        skipped++;
        continue;
      }

      const freshMarkers = ebImageUrls.map(imageMarker);
      const existingMarkers = getExistingMarkers(item.fieldData);
      const unchanged =
        existingMarkers.length > 0 &&
        existingMarkers.length === freshMarkers.length &&
        freshMarkers.every((m, i) => m === existingMarkers[i]) &&
        existingMarkers.every(Boolean);

      if (unchanged) {
        console.log(`${label} — already compressed (${freshMarkers.length} imgs), skipping`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`${label} — would process ${ebImageUrls.length} image(s)`);
        processed++;
        continue;
      }

      console.log(`${label} — processing ${ebImageUrls.length} image(s)...`);
      const altBase = String(item.fieldData.name ?? publicId);
      const { results, failures } = await runWithConcurrency(ebImageUrls, 6, (url) =>
        processAndUploadImage(url, altBase)
      );
      if (failures.length > 0) {
        throw new Error(`${failures.length}/${ebImageUrls.length} image(s) failed: ${failures[0].message}`);
      }

      await callWithRetry(() =>
        wf.collections.items.updateItem(COLLECTION_ID, item.id, {
          fieldData: {
            "featured-image": { url: results[0].hostedUrl, alt: results[0].alt },
            gallery: results.map((r) => ({ url: r.hostedUrl, alt: r.alt })),
          },
        })
      );
      await callWithRetry(() => wf.collections.items.publishItem(COLLECTION_ID, { itemIds: [item.id] }));
      await updateAlgoliaImages(
        item.id,
        results[0].hostedUrl,
        results.map((r) => r.hostedUrl)
      );

      console.log(`${label} — done (${results.length} images compressed + published + Algolia updated)`);
      processed++;
    } catch (err) {
      console.error(`${label} — FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. processed=${processed} skipped=${skipped} failed=${failed}`);
}

main();
