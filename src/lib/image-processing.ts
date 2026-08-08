import crypto from "crypto";
import sharp from "sharp";
import { getWebflowClient, callWithRetry, runWithConcurrency } from "./webflow";

const MAX_WIDTH = 1920;
const WEBP_QUALITY = 78;

/**
 * Stable identifier for a source image, independent of any signed/versioned
 * query string EasyBroker may attach to the URL. Used to detect whether a
 * property's photo set actually changed between sync runs, so unchanged
 * images are never re-downloaded/re-compressed/re-uploaded.
 */
export function imageMarker(sourceUrl: string): string {
  let pathname = sourceUrl;
  try {
    pathname = new URL(sourceUrl).pathname;
  } catch {
    // not a valid absolute URL — fall back to hashing the raw string
  }
  return crypto.createHash("sha1").update(pathname).digest("hex").slice(0, 12);
}

/**
 * Reads the marker for an already-uploaded image, preferring the alt text
 * ("... — eb:<marker>") but falling back to the hosted URL's filename —
 * Webflow prefixes uploads with the asset's own ID (e.g. we upload
 * "<marker>.webp" and it comes back as ".../<assetId>_<marker>.webp"), so the
 * marker survives there even when alt wasn't set (e.g. images repaired
 * directly via a one-off script that only touched the URL).
 */
export function extractMarker(alt: unknown, url?: unknown): string | null {
  if (typeof alt === "string") {
    const match = alt.match(/eb:([a-f0-9]{12})$/);
    if (match) return match[1];
  }
  if (typeof url === "string") {
    const match = url.match(/_?([a-f0-9]{12})\.webp(?:\?.*)?$/i);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

export interface UploadedImage {
  fileId: string;
  url: string;
  alt: string;
  marker: string;
}

/**
 * Downloads a source image, re-encodes it to WebP (capped at MAX_WIDTH, never
 * upscaled), and uploads it to Webflow as a real registered Asset. Returns a
 * CMS image field value (fileId + alt) — the alt carries the source marker so
 * later runs can detect "same photo" and skip reprocessing entirely.
 */
export async function processAndUploadImage(
  siteId: string,
  sourceUrl: string,
  altBase: string
): Promise<UploadedImage> {
  const marker = imageMarker(sourceUrl);
  const alt = `${altBase} — eb:${marker}`;

  const uploaded = await callWithRetry(async () => {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new Error(`Failed to download image ${sourceUrl}: ${res.status} ${res.statusText}`);
    }
    const inputBuffer = Buffer.from(await res.arrayBuffer());

    const webpBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const wf = getWebflowClient();
    return wf.assets.utilities.createAndUpload(siteId, {
      file: webpBuffer.buffer.slice(
        webpBuffer.byteOffset,
        webpBuffer.byteOffset + webpBuffer.byteLength
      ) as ArrayBuffer,
      fileName: `${marker}.webp`,
    });
  });

  if (!uploaded.id || !uploaded.hostedUrl) {
    throw new Error(`Webflow asset upload for ${sourceUrl} did not return an asset id/hostedUrl`);
  }

  // Webflow's item-update validation requires a 'url' alongside 'fileId' on
  // image fields — fileId alone is rejected.
  return { fileId: uploaded.id, url: uploaded.hostedUrl, alt, marker };
}

/**
 * Processes a property's full image set (featured + gallery) concurrently.
 * Order is preserved so the first result can be used as the featured image.
 */
export async function processImagesBatched(
  siteId: string,
  sourceUrls: string[],
  altBase: string,
  concurrency = 6
): Promise<UploadedImage[]> {
  const { results, failures } = await runWithConcurrency(sourceUrls, concurrency, (url) =>
    processAndUploadImage(siteId, url, altBase)
  );
  if (failures.length > 0) {
    throw new Error(
      `Failed to process ${failures.length}/${sourceUrls.length} image(s): ${failures[0].message}`
    );
  }
  return results as UploadedImage[];
}
