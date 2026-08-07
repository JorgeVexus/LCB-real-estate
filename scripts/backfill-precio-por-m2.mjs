// One-off backfill: fills the "precio-por-m2" Number field for properties
// that are missing it (the 57 properties added in the last import batch,
// per scripts/missing-price-m2.json). The value isn't exposed as a
// structured EasyBroker API field — it's embedded in the free-text
// description's price bullet, e.g.:
//   "· Renta de bodega: $403,923.45 MXN + IVA ($185.00/m2)"
//   "· Precio de bodega: $80,762.75 USD + IVA ($7.54 USD/m2)"
// Matches "precio de X" / "renta de X" / "venta de X" bullets specifically
// (not "cuota de mantenimiento", which also has its own $/m2 aside) and
// truncates to an integer to match the existing convention already used
// on ~346 other properties in this collection (e.g. 213.68 -> 213).
import fs from "node:fs";
import path from "node:path";
import { WebflowClient } from "webflow-api";

for (const line of fs.readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const wf = new WebflowClient({ accessToken: process.env.WEBFLOW_API_TOKEN });
const COLLECTION_ID = process.env.WEBFLOW_PROPERTIES_COLLECTION_ID;
const EB_KEY = process.env.EASYBROKER_API_KEY;
const APPLY = process.argv.includes("--apply");

async function callWithRetry(fn, retries = 5) {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 1500));
      return callWithRetry(fn, retries - 1);
    }
    throw err;
  }
}

function extractPricePerM2(description) {
  const bullets = (description || "").split("·").slice(1);
  for (const raw of bullets) {
    const idx = raw.indexOf(":");
    if (idx === -1) continue;
    const label = raw.slice(0, idx).trim().toLowerCase();
    const value = raw.slice(idx + 1).split("\n")[0].trim();
    if (!/^(precio|renta|venta) de/.test(label)) continue;
    const m = value.match(/\(\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:usd|mxn)?\s*\/\s*m2\s*\)/i);
    if (m) return Math.trunc(parseFloat(m[1].replace(/,/g, "")));
  }
  return null;
}

const missing = JSON.parse(fs.readFileSync("scripts/missing-price-m2.json", "utf8"));
console.log(`${missing.length} properties missing precio-por-m2.\n`);

const results = [];
for (const [idx, entry] of missing.entries()) {
  const label = `[${idx + 1}/${missing.length}] ${entry.propertyId}`;
  try {
    const res = await fetch(`https://api.easybroker.com/v1/properties/${entry.propertyId}`, {
      headers: { accept: "application/json", "X-Authorization": EB_KEY },
    });
    if (!res.ok) throw new Error(`EasyBroker ${res.status} ${res.statusText}`);
    const data = await res.json();
    const value = extractPricePerM2(data.description ?? "");
    if (value == null) {
      console.log(`${label} — no match found in description, skipping`);
      results.push({ ...entry, value: null, status: "no-match" });
      continue;
    }
    console.log(`${label} — precio-por-m2 = ${value}`);
    results.push({ ...entry, value, status: "found" });

    if (APPLY) {
      await callWithRetry(() =>
        wf.collections.items.updateItem(COLLECTION_ID, entry.id, {
          fieldData: { "precio-por-m2": value },
        })
      );
      await callWithRetry(() => wf.collections.items.publishItem(COLLECTION_ID, { itemIds: [entry.id] }));
    }
  } catch (err) {
    console.log(`${label} — ERROR: ${err.message}`);
    results.push({ ...entry, value: null, status: "error", error: err.message });
  }
}

fs.writeFileSync("scripts/backfill-precio-por-m2-results.json", JSON.stringify(results, null, 2));

const found = results.filter((r) => r.status === "found").length;
const noMatch = results.filter((r) => r.status === "no-match").length;
const errored = results.filter((r) => r.status === "error").length;
console.log(
  `\nDone. found=${found} no-match=${noMatch} errors=${errored}${APPLY ? " (applied + published)" : " (DRY RUN — pass --apply to write)"}`
);
