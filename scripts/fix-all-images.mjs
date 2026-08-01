import { WebflowClient } from "webflow-api";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const COLLECTION_ID = process.env.WEBFLOW_PROPERTIES_COLLECTION_ID;
const wf = new WebflowClient({ accessToken: process.env.WEBFLOW_API_TOKEN });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function callWithRetry(fn, retries = 6) {
  try {
    return await fn();
  } catch (err) {
    const status = err?.statusCode ?? err?.status;
    if (status && [429, 500, 502, 503, 504].includes(status) && retries > 0) {
      await sleep(2500);
      return callWithRetry(fn, retries - 1);
    }
    throw err;
  }
}

console.log("Fetching all published EasyBroker properties...");
let publicIds = [];
let url = "https://api.easybroker.com/v1/properties?limit=50&search%5Bstatuses%5D%5B%5D=published";
while (url) {
  const data = await ebFetch(url);
  publicIds.push(...data.content.map((p) => p.public_id));
  url = data.pagination.next_page;
}
console.log("Published properties:", publicIds.length);

console.log("Fetching current Webflow items...");
let webflowItems = [];
let offset = 0;
while (true) {
  const page = await callWithRetry(() => wf.collections.items.listItems(COLLECTION_ID, { limit: 100, offset }));
  webflowItems.push(...(page.items ?? []));
  if ((page.items ?? []).length < 100) break;
  offset += 100;
}
console.log("Webflow items:", webflowItems.length);

const wfByPropertyId = new Map();
for (const item of webflowItems) {
  const pid = item.fieldData?.["property-id"];
  if (pid) wfByPropertyId.set(pid, item);
}

const results = { fixed: [], alreadyOk: [], noWebflowMatch: [], errors: [] };

let index = 0;
async function worker() {
  while (index < publicIds.length) {
    const pid = publicIds[index++];
    const wfItem = wfByPropertyId.get(pid);
    if (!wfItem) {
      results.noWebflowMatch.push(pid);
      continue;
    }
    try {
      const detail = await ebFetch(`https://api.easybroker.com/v1/properties/${pid}`);
      const images = detail.property_images ?? [];
      const currentGalleryCount = (wfItem.fieldData.gallery ?? []).length;
      if (images.length === 0) {
        results.alreadyOk.push({ pid, reason: "no images in EasyBroker" });
        continue;
      }
      if (currentGalleryCount === images.length) {
        results.alreadyOk.push({ pid, reason: "count matches", count: images.length });
        continue;
      }
      await callWithRetry(() =>
        wf.collections.items.updateItem(COLLECTION_ID, wfItem.id, {
          fieldData: {
            "featured-image": { url: images[0].url },
            gallery: images.map((img) => ({ url: img.url })),
          },
        })
      );
      await callWithRetry(() => wf.collections.items.publishItem(COLLECTION_ID, { itemIds: [wfItem.id] }));
      results.fixed.push({ pid, before: currentGalleryCount, after: images.length });
      console.log(pid, `-> fixed (${currentGalleryCount} -> ${images.length})`);
    } catch (err) {
      results.errors.push({ pid, message: err.message });
      console.log(pid, "-> ERROR:", err.message);
    }
  }
}

await Promise.all(Array.from({ length: 3 }, worker));

console.log("\n=== SUMMARY ===");
console.log("Fixed:", results.fixed.length);
console.log("Already OK:", results.alreadyOk.length);
console.log("No Webflow match:", results.noWebflowMatch.length, results.noWebflowMatch);
console.log("Errors:", results.errors.length);
if (results.errors.length) console.log(JSON.stringify(results.errors, null, 2));

fs.writeFileSync(path.resolve("scripts/fix-all-images-results.json"), JSON.stringify(results, null, 2));
