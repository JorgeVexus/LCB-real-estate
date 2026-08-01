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

const missing = JSON.parse(fs.readFileSync(path.resolve("scripts/missing-images.json"), "utf8"));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ebFetch(url, retries = 5) {
  const res = await fetch(url, {
    headers: { accept: "application/json", "X-Authorization": process.env.EASYBROKER_API_KEY },
  });
  if ((res.status === 429 || res.status >= 500) && retries > 0) {
    await sleep(2000);
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

const results = { fixed: [], stillEmpty: [], errors: [] };

for (const item of missing) {
  try {
    const detail = await ebFetch(`https://api.easybroker.com/v1/properties/${item.propertyId}`);
    const images = detail.property_images ?? [];
    if (images.length === 0) {
      results.stillEmpty.push(item.propertyId);
      console.log(item.propertyId, "-> EasyBroker itself has no images, skipping");
      continue;
    }

    await callWithRetry(() =>
      wf.collections.items.updateItem(COLLECTION_ID, item.id, {
        fieldData: {
          "featured-image": { url: images[0].url },
          gallery: images.map((img) => ({ url: img.url })),
        },
      })
    );
    await callWithRetry(() => wf.collections.items.publishItem(COLLECTION_ID, { itemIds: [item.id] }));
    results.fixed.push({ propertyId: item.propertyId, imageCount: images.length });
    console.log(item.propertyId, "-> fixed,", images.length, "images");
  } catch (err) {
    results.errors.push({ propertyId: item.propertyId, message: err.message });
    console.log(item.propertyId, "-> ERROR:", err.message);
  }
}

console.log("\n=== SUMMARY ===");
console.log("Fixed:", results.fixed.length);
console.log("Still empty (EasyBroker has none):", results.stillEmpty.length, results.stillEmpty);
console.log("Errors:", results.errors.length, results.errors);

fs.writeFileSync(path.resolve("scripts/fix-images-results.json"), JSON.stringify(results, null, 2));
