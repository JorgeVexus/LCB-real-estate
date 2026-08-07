import { WebflowClient } from "webflow-api";
import sharp from "sharp";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

export const SITE_ID = process.env.WEBFLOW_SITE_ID;
export const COLLECTION_ID = process.env.WEBFLOW_PROPERTIES_COLLECTION_ID;
export const wf = new WebflowClient({ accessToken: process.env.WEBFLOW_API_TOKEN });

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callWithRetry(fn, retries = 6) {
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

const MAX_WIDTH = 1920;
const WEBP_QUALITY = 78;

export function imageMarker(sourceUrl) {
  let pathname = sourceUrl;
  try {
    pathname = new URL(sourceUrl).pathname;
  } catch {}
  return crypto.createHash("sha1").update(pathname).digest("hex").slice(0, 12);
}

export function extractMarker(alt) {
  if (typeof alt !== "string") return null;
  const match = alt.match(/eb:([a-f0-9]{12})$/);
  return match ? match[1] : null;
}

export async function processAndUploadImage(sourceUrl, altBase) {
  const marker = imageMarker(sourceUrl);
  const alt = `${altBase} — eb:${marker}`;

  const uploaded = await callWithRetry(async () => {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to download ${sourceUrl}: ${res.status} ${res.statusText}`);
    const inputBuffer = Buffer.from(await res.arrayBuffer());

    const webpBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    return wf.assets.utilities.createAndUpload(SITE_ID, {
      file: webpBuffer.buffer.slice(webpBuffer.byteOffset, webpBuffer.byteOffset + webpBuffer.byteLength),
      fileName: `${marker}.webp`,
    });
  });

  if (!uploaded.id) throw new Error(`No asset id returned for ${sourceUrl}`);
  return { fileId: uploaded.id, alt, marker, originalUrl: sourceUrl, hostedUrl: uploaded.hostedUrl };
}

export async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  const failures = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await fn(items[current], current);
      } catch (err) {
        failures.push({ input: items[current], message: err.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { results, failures };
}

export async function listAllItems(collectionId) {
  const items = [];
  let offset = 0;
  while (true) {
    const res = await callWithRetry(() => wf.collections.items.listItems(collectionId, { limit: 100, offset }));
    items.push(...(res.items ?? []));
    if (!res.items || res.items.length < 100) break;
    offset += 100;
  }
  return items;
}
