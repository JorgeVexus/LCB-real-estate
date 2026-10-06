import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?lcb-realestate\.com$/,
  /^https:\/\/[a-z0-9-]+\.webflow\.io$/,
  /^https:\/\/[a-z0-9-]+\.canvas\.webflow\.com$/,
  ...(process.env.NODE_ENV !== "production" ? [/^http:\/\/localhost:\d+$/] : []),
];

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.some((re) => re.test(origin))) return {};
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

interface NominatimResult {
  category?: string;
  type?: string;
  name?: string;
  display_name?: string;
  boundingbox?: [string, string, string, string];
  geojson?: { type: string; coordinates: unknown };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: { ...corsHeaders(req.headers.get("origin")), "Access-Control-Allow-Methods": "GET" },
  });
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) {
    return NextResponse.json({ found: false }, { status: 400, headers: cors });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q,
    countrycodes: "mx",
    format: "jsonv2",
    polygon_geojson: "1",
    polygon_threshold: "0.0008",
    limit: "5",
    "accept-language": "es",
  }).toString();

  const res = await fetch(url, {
    headers: { "User-Agent": "LCB-Real-Estate-Mapa/1.0 (https://www.lcb-realestate.com)" },
  });
  if (!res.ok) {
    return NextResponse.json({ found: false, error: `nominatim ${res.status}` }, { status: 502, headers: cors });
  }

  const results = (await res.json()) as NominatimResult[];
  const hit = results.find(
    (r) =>
      r.category === "boundary" &&
      r.type === "administrative" &&
      (r.geojson?.type === "Polygon" || r.geojson?.type === "MultiPolygon"),
  );

  // Place names don't change boundaries, so a year of CDN caching per query
  // keeps Nominatim traffic to one request per distinct place.
  const cacheHeaders = { "Cache-Control": "public, s-maxage=31536000, stale-while-revalidate=86400" };

  if (!hit) {
    return NextResponse.json({ found: false }, { headers: { ...cors, ...cacheHeaders } });
  }

  const [south, north, west, east] = (hit.boundingbox ?? []).map(Number);
  return NextResponse.json(
    {
      found: true,
      name: hit.name ?? hit.display_name ?? q,
      bbox: [west, south, east, north],
      geometry: hit.geojson,
    },
    { headers: { ...cors, ...cacheHeaders } },
  );
}
