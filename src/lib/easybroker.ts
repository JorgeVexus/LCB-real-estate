const EASYBROKER_BASE_URL = "https://api.easybroker.com/v1";

export interface EasyBrokerOperation {
  type: "sale" | "rental" | string;
  amount: number;
  currency: string;
  formatted_amount?: string;
}

export interface EasyBrokerListItem {
  public_id: string;
  title: string;
  title_image_full?: string | null;
  location: string;
  operations: EasyBrokerOperation[];
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  property_type: string;
  lot_size: number | null;
  construction_size: number | null;
  updated_at: string;
  agent: string;
}

export interface EasyBrokerLocationDetail {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  street?: string | null;
  postal_code?: string | null;
}

export interface EasyBrokerAgentDetail {
  id?: number;
  name?: string;
  full_name?: string;
  mobile_phone?: string | null;
  profile_image_url?: string | null;
  email?: string;
}

export interface EasyBrokerImage {
  title?: string | null;
  url: string;
}

export interface EasyBrokerPropertyDetail {
  public_id: string;
  title: string;
  description?: string;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  lot_size: number | null;
  construction_size: number | null;
  location: EasyBrokerLocationDetail;
  property_type: string;
  operations: EasyBrokerOperation[];
  property_images: EasyBrokerImage[];
  agent: EasyBrokerAgentDetail;
  updated_at: string;
}

interface EasyBrokerListResponse {
  pagination: {
    limit: number;
    page: number;
    total: number;
    next_page: string | null;
  };
  content: EasyBrokerListItem[];
}

function apiKey(): string {
  const key = process.env.EASYBROKER_API_KEY;
  if (!key) throw new Error("Missing EASYBROKER_API_KEY env var");
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ebFetch<T>(url: string, retries = 5): Promise<T> {
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "X-Authorization": apiKey(),
    },
    cache: "no-store",
  });

  if ((res.status === 429 || res.status >= 500) && retries > 0) {
    const retryAfter = Number(res.headers.get("retry-after")) || 2;
    await sleep(retryAfter * 1000);
    return ebFetch<T>(url, retries - 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`EasyBroker API error ${res.status} on ${url}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Fetches every property EasyBroker considers "published" (its own public
 * search filter). Anything not in this list — sold, paused, draft, or any
 * other internal status — is treated as unpublished by the sync.
 */
export async function fetchAllPublishedProperties(): Promise<EasyBrokerListItem[]> {
  const results: EasyBrokerListItem[] = [];
  let url: string | null =
    `${EASYBROKER_BASE_URL}/properties?limit=50&search%5Bstatuses%5D%5B%5D=published`;

  while (url) {
    const data: EasyBrokerListResponse = await ebFetch<EasyBrokerListResponse>(url);
    results.push(...data.content);
    url = data.pagination.next_page;
  }

  return results;
}

/** Fetches full details (description, gallery, precise location, agent) for one property. */
export async function fetchPropertyDetail(publicId: string): Promise<EasyBrokerPropertyDetail> {
  return ebFetch<EasyBrokerPropertyDetail>(`${EASYBROKER_BASE_URL}/properties/${publicId}`);
}

/** Runs async detail fetches with bounded concurrency to stay within function time limits. */
export async function fetchPropertyDetailsConcurrently(
  publicIds: string[],
  concurrency = 3
): Promise<Map<string, EasyBrokerPropertyDetail>> {
  const results = new Map<string, EasyBrokerPropertyDetail>();
  let index = 0;

  async function worker() {
    while (index < publicIds.length) {
      const current = index++;
      const id = publicIds[current];
      try {
        const detail = await fetchPropertyDetail(id);
        results.set(id, detail);
      } catch {
        // Left out of the map; the caller treats a missing detail as a
        // per-property error and continues without aborting the whole sync.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, publicIds.length) }, worker));
  return results;
}
